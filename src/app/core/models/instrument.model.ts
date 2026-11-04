export type InstrumentId = 'guitar' | 'bass' | 'ukulele';

export type TuningId = string & { readonly __brand: 'TuningId' };

export function asTuningId(id: string): TuningId {
  return id as TuningId;
}

export interface FrequencyRange {
  readonly minFrequency: number;
  readonly maxFrequency: number;
}

export interface AnalysisProfile extends FrequencyRange {
  readonly frameSize: number;
  readonly hopSize?: number;
  readonly decimationFactor?: 1 | 2 | 4;
  readonly windowPeriods?: number;
}

export interface Tuning {
  readonly id: TuningId;
  readonly name: string;
  readonly strings: readonly number[];
  readonly isCustom?: boolean;
}

export interface CustomTuning extends Tuning {
  readonly instrumentId: InstrumentId;
  readonly isCustom: true;
}

export interface Instrument {
  readonly id: InstrumentId;
  readonly name: string;
  readonly analysis: AnalysisProfile;
  readonly tunings: readonly Tuning[];
}
