import { ToleranceCents, TunerSettings } from '../models';
import { DEFAULT_INSTRUMENT_ID } from './instruments.constants';

export const SETTINGS_STORAGE_KEY = 'fret-tune.settings.v1';

export const REFERENCE_PITCH_RANGE = { min: 430, max: 450, default: 440 } as const;

export const TOLERANCE_OPTIONS: readonly ToleranceCents[] = [2, 5, 10];

export const DEFAULT_SETTINGS: TunerSettings = {
  instrumentId: DEFAULT_INSTRUMENT_ID,
  tuningId: 'standard',
  mode: 'instrument',
  displayStyle: 'needle',
  notation: 'letter',
  referencePitch: REFERENCE_PITCH_RANGE.default,
  tolerance: 5,
  hapticsEnabled: true,
  keepAwake: true,
};

