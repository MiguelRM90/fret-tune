import { AnalysisProfile, DetectorStrategyId, FrequencyRange, PitchDetector, PitchEstimate } from '../models';
import { FftAutocorrelator } from './fft';
import { McLeodOptions, rootMeanSquare } from './mcleod-pitch-detector';

export class YinPitchDetector implements PitchDetector {
  readonly id: DetectorStrategyId = 'yin';

  private readonly fft = new FftAutocorrelator();
  private autocorrelation = new Float64Array(0);
  private cmndf = new Float64Array(0);

  constructor(private readonly options: McLeodOptions) {}

  detect(samples: Float32Array, sampleRate: number, range: FrequencyRange | AnalysisProfile): PitchEstimate | null {
    const rms = rootMeanSquare(samples);
    if (rms < this.options.minRms) {
      return null;
    }

    const maxLag = Math.min(
      Math.ceil(sampleRate / range.minFrequency) + 2,
      Math.floor(samples.length / 2),
    );
    const minLag = Math.max(2, Math.floor(sampleRate / range.maxFrequency));
    if (maxLag <= minLag) {
      return null;
    }

    const cmndf = this.computeCmndf(samples, maxLag);
    const threshold = Math.max(0.05, 1 - this.options.peakThreshold);
    const bestLag = this.findPitchLag(cmndf, minLag, maxLag, threshold);
    if (bestLag === null) {
      return null;
    }

    const refined = refineMinimum(cmndf, bestLag);
    const clarity = Math.max(0, Math.min(1, 1 - refined.value));
    const frequency = sampleRate / refined.lag;

    if (clarity < this.options.minClarity || frequency < range.minFrequency || frequency > range.maxFrequency) {
      return null;
    }

    return { frequency, clarity, rms };
  }

  private computeCmndf(samples: Float32Array, maxLag: number): Float64Array {
    if (this.cmndf.length < maxLag + 1) {
      this.cmndf = new Float64Array(maxLag + 1);
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
    let runningSum = 0;

    this.cmndf[0] = 1;
    normalizer -= samples[0] * samples[0] + samples[size - 1] * samples[size - 1];

    for (let lag = 1; lag <= maxLag; lag++) {
      const diff = Math.max(0, normalizer - 2 * this.autocorrelation[lag]);
      runningSum += diff;
      this.cmndf[lag] = runningSum > 0 ? (diff * lag) / runningSum : 1;
      normalizer -= samples[lag] * samples[lag] + samples[size - 1 - lag] * samples[size - 1 - lag];
    }

    return this.cmndf;
  }

  private findPitchLag(cmndf: Float64Array, minLag: number, maxLag: number, threshold: number): number | null {
    const end = maxLag - 1;
    for (let lag = minLag; lag < end; lag++) {
      if (cmndf[lag] < threshold) {
        while (lag + 1 < end && cmndf[lag + 1] < cmndf[lag]) {
          lag++;
        }
        return lag;
      }
    }

    let bestLag = -1;
    let minVal = Infinity;
    for (let lag = minLag; lag < end; lag++) {
      if (cmndf[lag] < minVal && cmndf[lag] <= cmndf[lag - 1] && cmndf[lag] <= cmndf[lag + 1]) {
        minVal = cmndf[lag];
        bestLag = lag;
      }
    }

    return bestLag > 0 ? bestLag : null;
  }
}

function refineMinimum(cmndf: Float64Array, lag: number): { readonly lag: number; readonly value: number } {
  const previous = cmndf[lag - 1];
  const current = cmndf[lag];
  const next = cmndf[lag + 1];
  const curvature = previous - 2 * current + next;
  if (curvature === 0) {
    return { lag, value: current };
  }
  const offset = (0.5 * (previous - next)) / curvature;
  return { lag: lag + offset, value: current - 0.25 * (previous - next) * offset };
}

