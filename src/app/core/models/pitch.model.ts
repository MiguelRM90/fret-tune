import { FrequencyRange } from './instrument.model';

export type DetectorStrategyId = 'mpm-fft' | 'yin';

export interface PitchEstimate {
  readonly frequency: number;
  readonly clarity: number;
  readonly rms: number;
}

export interface PitchFrame {
  readonly estimate: PitchEstimate | null;
  readonly smoothedFrequency: number | null;
  readonly timestamp: number;
  readonly currentFrame: number;
}

export interface PitchDetector {
  readonly id?: DetectorStrategyId;
  detect(samples: Float32Array, sampleRate: number, range: FrequencyRange): PitchEstimate | null;
  reset?(): void;
}

export interface PitchDetectionRequest {
  readonly samples: Float32Array;
  readonly sampleRate: number;
  readonly range: FrequencyRange;
}

export interface PitchDetectionResponse {
  readonly estimate: PitchEstimate | null;
  readonly buffer?: ArrayBuffer;
}

export type TuneDirection = 'flat' | 'sharp' | 'in-tune';

export interface TunerReading {
  readonly frequency: number;
  readonly detectedMidi: number;
  readonly targetMidi: number;
  readonly targetFrequency: number;
  readonly cents: number;
  readonly stringIndex: number | null;
  readonly direction: TuneDirection;
}
