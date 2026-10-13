export type InstrumentId = 'guitar' | 'bass' | 'ukulele';

export interface FrequencyRange {
  readonly minFrequency: number;
  readonly maxFrequency: number;
}

export interface AnalysisProfile extends FrequencyRange {
  readonly frameSize: number;
}

export interface Tuning {
  readonly id: string;
  readonly name: string;
  readonly strings: readonly number[];
}

export interface Instrument {
  readonly id: InstrumentId;
  readonly name: string;
  readonly analysis: AnalysisProfile;
  readonly tunings: readonly Tuning[];
}

