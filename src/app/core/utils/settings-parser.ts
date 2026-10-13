import { DEFAULT_SETTINGS, REFERENCE_PITCH_RANGE, TOLERANCE_OPTIONS, findInstrument, isInstrumentId } from '../constants';
import { DisplayStyle, NoteNotation, ToleranceCents, TunerSettings, TuningMode } from '../models';

type UnknownRecord = Readonly<Record<string, unknown>>;

export function parseSettings(raw: unknown): TunerSettings {
  if (!isRecord(raw)) {
    return DEFAULT_SETTINGS;
  }

  const instrumentId = isInstrumentId(raw['instrumentId']) ? raw['instrumentId'] : DEFAULT_SETTINGS.instrumentId;
  const instrument = findInstrument(instrumentId);
  const tuningId = instrument.tunings.some((tuning) => tuning.id === raw['tuningId'])
    ? String(raw['tuningId'])
    : instrument.tunings[0].id;

  return {
    instrumentId,
    tuningId,
    mode: pick<TuningMode>(raw['mode'], ['instrument', 'chromatic'], DEFAULT_SETTINGS.mode),
    displayStyle: pick<DisplayStyle>(raw['displayStyle'], ['needle', 'strobe'], DEFAULT_SETTINGS.displayStyle),
    notation: pick<NoteNotation>(raw['notation'], ['letter', 'solfege'], DEFAULT_SETTINGS.notation),
    referencePitch: parseReferencePitch(raw['referencePitch']),
    tolerance: pick<ToleranceCents>(raw['tolerance'], TOLERANCE_OPTIONS, DEFAULT_SETTINGS.tolerance),
    hapticsEnabled: typeof raw['hapticsEnabled'] === 'boolean' ? raw['hapticsEnabled'] : DEFAULT_SETTINGS.hapticsEnabled,
    keepAwake: typeof raw['keepAwake'] === 'boolean' ? raw['keepAwake'] : DEFAULT_SETTINGS.keepAwake,
  };
}

export function parseReferencePitch(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return REFERENCE_PITCH_RANGE.default;
  }
  return Math.min(REFERENCE_PITCH_RANGE.max, Math.max(REFERENCE_PITCH_RANGE.min, value));
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pick<T>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.find((option) => option === value) ?? fallback;
}

