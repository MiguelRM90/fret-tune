import { AnalysisProfile, DetectorStrategyId, FrequencyRange, PitchDetector, PitchEstimate } from '../models';
import { SignalDecimator } from './decimator';
import { FftAutocorrelator } from './fft';

export interface McLeodOptions {
  readonly minRms: number;
  readonly minClarity: number;
  readonly peakThreshold: number;
}

interface Peak {
  readonly lag: number;
  readonly value: number;
}

export class McLeodPitchDetector implements PitchDetector {
  readonly id: DetectorStrategyId = 'mpm-fft';

  private readonly fft = new FftAutocorrelator();
  private readonly decimator = new SignalDecimator();
  private autocorrelation = new Float64Array(0);
  private nsdf = new Float64Array(0);
  private fineNsdf = new Float64Array(32);
  private peakLags = new Int32Array(1024);
  private peakValues = new Float64Array(1024);
  private peakCount = 0;

  constructor(private readonly options: McLeodOptions) {}

  detect(samples: Float32Array, sampleRate: number, range: FrequencyRange | AnalysisProfile): PitchEstimate | null {
    const windowSamples = sliceEffectiveWindow(samples, sampleRate, range);
    const rms = rootMeanSquare(windowSamples);
    if (rms < this.options.minRms) {
      return null;
    }

    const factor = resolveDecimationFactor(windowSamples.length, sampleRate, range);
    const decimated = this.decimator.decimate(windowSamples, factor);
    const effectiveSampleRate = factor > 1 && decimated !== windowSamples ? sampleRate / factor : sampleRate;
    const activeFactor = effectiveSampleRate === sampleRate ? 1 : factor;

    const maxLag = Math.min(
      Math.ceil(effectiveSampleRate / range.minFrequency) + 2,
      Math.floor(decimated.length / 2),
    );
    const minLag = Math.max(2, Math.floor(effectiveSampleRate / range.maxFrequency));
    if (maxLag <= minLag) {
      return null;
    }

    const nsdf = this.computeNsdf(decimated, maxLag);
    this.findKeyMaxima(nsdf, maxLag);
    const peak = this.selectPeak(minLag);
    if (!peak) {
      return null;
    }

    let refined: Peak;
    let finalSampleRate = effectiveSampleRate;

    if (activeFactor > 1) {
      const fullRefined = this.refineAtFullRate(windowSamples, sampleRate, range, peak.lag * activeFactor, activeFactor);
      if (fullRefined) {
        refined = fullRefined;
        finalSampleRate = sampleRate;
      } else {
        refined = refinePeak(nsdf, peak.lag);
      }
    } else {
      refined = refinePeak(nsdf, peak.lag);
    }

    const frequency = finalSampleRate / refined.lag;
    if (refined.value < this.options.minClarity || frequency < range.minFrequency || frequency > range.maxFrequency) {
      return null;
    }

    return { frequency, clarity: Math.min(1, refined.value), rms };
  }

  computeNsdfTimeDomain(samples: Float32Array, maxLag: number): Float64Array {
    if (this.nsdf.length < maxLag + 1) {
      this.nsdf = new Float64Array(maxLag + 1);
    }

    const size = samples.length;
    let energy = 0;
    for (let i = 0; i < size; i++) {
      energy += samples[i] * samples[i];
    }
    let normalizer = 2 * energy;

    for (let lag = 0; lag <= maxLag; lag++) {
      let correlation = 0;
      for (let i = 0; i < size - lag; i++) {
        correlation += samples[i] * samples[i + lag];
      }
      this.nsdf[lag] = normalizer > 0 ? (2 * correlation) / normalizer : 0;
      normalizer -= samples[lag] * samples[lag] + samples[size - 1 - lag] * samples[size - 1 - lag];
    }

    return this.nsdf;
  }

  private computeNsdf(samples: Float32Array, maxLag: number): Float64Array {
    if (this.nsdf.length < maxLag + 1) {
      this.nsdf = new Float64Array(maxLag + 1);
    }
    if (this.autocorrelation.length < maxLag + 1) {
      this.autocorrelation = new Float64Array(maxLag + 1);
    }

    const size = samples.length;
    this.fft.autocorrelate(samples, size, maxLag, this.autocorrelation);

    let energy = 0;
    for (let i = 0; i < size; i++) {
      energy += samples[i] * samples[i];
    }
    let normalizer = 2 * energy;

    for (let lag = 0; lag <= maxLag; lag++) {
      const correlation = this.autocorrelation[lag];
      this.nsdf[lag] = normalizer > 0 ? (2 * correlation) / normalizer : 0;
      normalizer -= samples[lag] * samples[lag] + samples[size - 1 - lag] * samples[size - 1 - lag];
    }

    return this.nsdf;
  }

  private refineAtFullRate(
    samples: Float32Array,
    sampleRate: number,
    range: FrequencyRange,
    approxFullLag: number,
    factor: number,
  ): Peak | null {
    const size = samples.length;
    const fullMaxLag = Math.min(Math.ceil(sampleRate / range.minFrequency) + 2, Math.floor(size / 2) - 1);
    const fullMinLag = Math.max(2, Math.floor(sampleRate / range.maxFrequency));

    const radius = factor + 1;
    const startLag = Math.max(fullMinLag - 1, Math.round(approxFullLag) - radius);
    const endLag = Math.min(fullMaxLag, Math.round(approxFullLag) + radius);
    const count = endLag - startLag + 1;
    if (count < 3) {
      return null;
    }

    if (this.fineNsdf.length < count) {
      this.fineNsdf = new Float64Array(count);
    }

    let prefixEnergy = 0;
    for (let i = 0; i < size - startLag; i++) {
      prefixEnergy += samples[i] * samples[i];
    }
    let suffixEnergy = 0;
    for (let i = startLag; i < size; i++) {
      suffixEnergy += samples[i] * samples[i];
    }

    let bestLocalIdx = 1;
    let bestVal = -Infinity;

    for (let idx = 0; idx < count; idx++) {
      const lag = startLag + idx;
      let corr = 0;
      const limit = size - lag;
      for (let i = 0; i < limit; i++) {
        corr += samples[i] * samples[i + lag];
      }
      const norm = prefixEnergy + suffixEnergy;
      const val = norm > 0 ? (2 * corr) / norm : 0;
      this.fineNsdf[idx] = val;

      if (idx > 0 && idx < count - 1 && val > bestVal) {
        bestVal = val;
        bestLocalIdx = idx;
      }

      if (lag < endLag) {
        prefixEnergy -= samples[size - 1 - lag] * samples[size - 1 - lag];
        suffixEnergy -= samples[lag] * samples[lag];
      }
    }

    const refinedLocal = refinePeak(this.fineNsdf, bestLocalIdx);
    return {
      lag: startLag + refinedLocal.lag,
      value: refinedLocal.value,
    };
  }

  private findKeyMaxima(nsdf: Float64Array, maxLag: number): void {
    this.peakCount = 0;
    const end = maxLag - 1;
    let lag = 1;

    while (lag < end && nsdf[lag] > 0) {
      lag++;
    }
    while (lag < end && nsdf[lag] <= 0) {
      lag++;
    }

    let bestLag = 0;
    while (lag < end) {
      const isLocalMax = nsdf[lag] > nsdf[lag - 1] && nsdf[lag] >= nsdf[lag + 1];
      if (isLocalMax && (bestLag === 0 || nsdf[lag] > nsdf[bestLag])) {
        bestLag = lag;
      }
      lag++;

      if (lag < end && nsdf[lag] <= 0) {
        if (bestLag > 0) {
          this.pushPeak(bestLag, nsdf[bestLag]);
          bestLag = 0;
        }
        while (lag < end && nsdf[lag] <= 0) {
          lag++;
        }
      }
    }

    if (bestLag > 0) {
      this.pushPeak(bestLag, nsdf[bestLag]);
    }
  }

  private pushPeak(lag: number, value: number): void {
    if (this.peakCount >= this.peakLags.length) {
      const nextLags = new Int32Array(this.peakLags.length * 2);
      nextLags.set(this.peakLags);
      this.peakLags = nextLags;

      const nextValues = new Float64Array(this.peakValues.length * 2);
      nextValues.set(this.peakValues);
      this.peakValues = nextValues;
    }
    this.peakLags[this.peakCount] = lag;
    this.peakValues[this.peakCount] = value;
    this.peakCount++;
  }

  private selectPeak(minLag: number): Peak | null {
    let highest = -Infinity;
    for (let i = 0; i < this.peakCount; i++) {
      if (this.peakLags[i] >= minLag && this.peakValues[i] > highest) {
        highest = this.peakValues[i];
      }
    }
    if (!Number.isFinite(highest)) {
      return null;
    }

    const threshold = this.options.peakThreshold * highest;
    for (let i = 0; i < this.peakCount; i++) {
      if (this.peakLags[i] >= minLag && this.peakValues[i] >= threshold) {
        return { lag: this.peakLags[i], value: this.peakValues[i] };
      }
    }
    return null;
  }
}

export function rootMeanSquare(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] * samples[i];
  }
  return Math.sqrt(sum / samples.length);
}

function sliceEffectiveWindow(
  samples: Float32Array,
  sampleRate: number,
  range: FrequencyRange | AnalysisProfile,
): Float32Array {
  const maxLag = Math.ceil(sampleRate / range.minFrequency) + 2;
  const periods = 'windowPeriods' in range && range.windowPeriods ? range.windowPeriods : 2.38;
  const minRequired = maxLag * 2 + 16;
  const targetLength = Math.max(minRequired, Math.ceil(maxLag * periods));
  if (samples.length <= targetLength) {
    return samples;
  }
  return samples.subarray(samples.length - targetLength);
}

function resolveDecimationFactor(
  windowLength: number,
  sampleRate: number,
  range: FrequencyRange | AnalysisProfile,
): 1 | 2 | 4 {
  const configured = 'decimationFactor' in range ? range.decimationFactor : undefined;
  const desired: 1 | 2 | 4 =
    configured ?? (range.maxFrequency <= 650 ? 4 : range.maxFrequency <= 1500 ? 2 : 1);

  if (desired === 4) {
    const decimatedMaxLag = Math.ceil(sampleRate / 4 / range.minFrequency) + 2;
    if (Math.floor((windowLength - 10) / 4) >= decimatedMaxLag * 2 + 4) {
      return 4;
    }
  }
  if (desired >= 2) {
    const decimatedMaxLag = Math.ceil(sampleRate / 2 / range.minFrequency) + 2;
    if (Math.floor((windowLength - 6) / 2) >= decimatedMaxLag * 2 + 4) {
      return 2;
    }
  }
  return 1;
}

function refinePeak(nsdf: Float64Array, lag: number): Peak {
  const previous = nsdf[lag - 1];
  const current = nsdf[lag];
  const next = nsdf[lag + 1];
  const curvature = previous - 2 * current + next;
  if (curvature === 0) {
    return { lag, value: current };
  }
  const offset = (0.5 * (previous - next)) / curvature;
  return { lag: lag + offset, value: current - 0.25 * (previous - next) * offset };
}

