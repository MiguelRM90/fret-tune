import { InstrumentId } from './instrument.model';
import { NoteNotation } from './note.model';

export type TuningMode = 'instrument' | 'chromatic';

export type DisplayStyle = 'needle' | 'strobe';

export type ToleranceCents = 2 | 5 | 10;

export interface TunerSettings {
  readonly instrumentId: InstrumentId;
  readonly tuningId: string;
  readonly mode: TuningMode;
  readonly displayStyle: DisplayStyle;
  readonly notation: NoteNotation;
  readonly referencePitch: number;
  readonly tolerance: ToleranceCents;
  readonly hapticsEnabled: boolean;
  readonly keepAwake: boolean;
}

