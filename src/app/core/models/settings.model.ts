import { CustomTuning, InstrumentId, TuningId } from './instrument.model';
import { NoteNotation } from './note.model';
import { DetectorStrategyId } from './pitch.model';

export type TuningMode = 'instrument' | 'chromatic';

export type DisplayStyle = 'needle' | 'strobe';

export type ToleranceCents = 2 | 5 | 10;

export interface TunerSettings {
  readonly schemaVersion: number;
  readonly instrumentId: InstrumentId;
  readonly tuningId: TuningId;
  readonly mode: TuningMode;
  readonly displayStyle: DisplayStyle;
  readonly notation: NoteNotation;
  readonly referencePitch: number;
  readonly tolerance: ToleranceCents;
  readonly hapticsEnabled: boolean;
  readonly keepAwake: boolean;
  readonly detector: DetectorStrategyId;
  readonly customTunings: readonly CustomTuning[];
}
