import { FrequencyRange } from './instrument.model';

export interface PitchEstimate {
  readonly frequency: number;
  readonly clarity: number;
  readonly rms: number;
}

export interface PitchDetector {
  detect(samples: Float32Array, sampleRate: number, range: FrequencyRange): PitchEstimate | null;
}

export interface PitchDetectionRequest {
  readonly samples: Float32Array;
  readonly sampleRate: number;
  readonly range: FrequencyRange;
}

export interface PitchDetectionResponse {
  readonly estimate: PitchEstimate | null;
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

