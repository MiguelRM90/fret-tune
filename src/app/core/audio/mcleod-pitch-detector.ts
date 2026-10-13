import { FrequencyRange, PitchDetector, PitchEstimate } from '../models';

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
  private nsdf = new Float32Array(0);

  constructor(private readonly options: McLeodOptions) {}

  detect(samples: Float32Array, sampleRate: number, range: FrequencyRange): PitchEstimate | null {
    const rms = rootMeanSquare(samples);
    if (rms < this.options.minRms) {
      return null;
    }

    const maxLag = Math.min(Math.ceil(sampleRate / range.minFrequency) + 2, Math.floor(samples.length / 2));
    const minLag = Math.max(2, Math.floor(sampleRate / range.maxFrequency));
    if (maxLag <= minLag) {
      return null;
    }

    const nsdf = this.computeNsdf(samples, maxLag);
    const peak = this.selectPeak(findKeyMaxima(nsdf, maxLag), minLag);
    if (!peak) {
      return null;
    }

    const refined = refinePeak(nsdf, peak.lag);
    const frequency = sampleRate / refined.lag;
    if (refined.value < this.options.minClarity || frequency < range.minFrequency || frequency > range.maxFrequency) {
      return null;
    }

    return { frequency, clarity: Math.min(1, refined.value), rms };
  }

  private computeNsdf(samples: Float32Array, maxLag: number): Float32Array {
    if (this.nsdf.length < maxLag + 1) {
      this.nsdf = new Float32Array(maxLag + 1);
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

  private selectPeak(peaks: readonly Peak[], minLag: number): Peak | null {
    const candidates = peaks.filter((peak) => peak.lag >= minLag);
    if (candidates.length === 0) {
      return null;
    }
    const highest = Math.max(...candidates.map((peak) => peak.value));
    const threshold = this.options.peakThreshold * highest;
    return candidates.find((peak) => peak.value >= threshold) ?? null;
  }
}

export function rootMeanSquare(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] * samples[i];
  }
  return Math.sqrt(sum / samples.length);
}

function findKeyMaxima(nsdf: Float32Array, maxLag: number): Peak[] {
  const peaks: Peak[] = [];
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
        peaks.push({ lag: bestLag, value: nsdf[bestLag] });
        bestLag = 0;
      }
      while (lag < end && nsdf[lag] <= 0) {
        lag++;
      }
    }
  }

  if (bestLag > 0) {
    peaks.push({ lag: bestLag, value: nsdf[bestLag] });
  }
  return peaks;
}

function refinePeak(nsdf: Float32Array, lag: number): Peak {
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

