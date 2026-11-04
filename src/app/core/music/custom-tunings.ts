import { CustomTuning, InstrumentId, TuningId, asTuningId } from '../models';
import { isInstrumentId } from './instruments';

const SAFE_NAME_PATTERN = /^[\p{L}\p{N}\s\-_♯♭#b()+/.]+$/u;
const SAFE_ID_PATTERN = /^[a-zA-Z0-9\-_:.]{1,64}$/;
const MAX_TUNING_NAME_LENGTH = 32;
const MIN_STRINGS = 3;
const MAX_STRINGS = 12;
const MIN_MIDI_NOTE = 12;
const MAX_MIDI_NOTE = 108;
const MAX_CUSTOM_TUNINGS = 32;

export function isValidTuningName(name: unknown): name is string {
  if (typeof name !== 'string') return false;
  const trimmed = name.trim();
  return (
    trimmed.length >= 1 &&
    trimmed.length <= MAX_TUNING_NAME_LENGTH &&
    SAFE_NAME_PATTERN.test(trimmed)
  );
}

export function isValidTuningIdString(id: unknown): id is string {
  return typeof id === 'string' && SAFE_ID_PATTERN.test(id);
}

export function isValidMidiStrings(strings: unknown): strings is readonly number[] {
  if (!Array.isArray(strings)) return false;
  if (strings.length < MIN_STRINGS || strings.length > MAX_STRINGS) return false;
  return strings.every(
    (note) =>
      typeof note === 'number' &&
      Number.isInteger(note) &&
      note >= MIN_MIDI_NOTE &&
      note <= MAX_MIDI_NOTE,
  );
}

export function parseCustomTuning(raw: unknown): CustomTuning | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return null;
  }
  const record = raw as Readonly<Record<string, unknown>>;
  if (!isInstrumentId(record['instrumentId'])) {
    return null;
  }
  if (!isValidTuningIdString(record['id'])) {
    return null;
  }
  if (!isValidTuningName(record['name'])) {
    return null;
  }
  if (!isValidMidiStrings(record['strings'])) {
    return null;
  }

  return {
    id: asTuningId(record['id']),
    name: record['name'].trim(),
    instrumentId: record['instrumentId'],
    strings: [...record['strings']],
    isCustom: true,
  };
}

export function parseCustomTuningsList(raw: unknown): readonly CustomTuning[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const result: CustomTuning[] = [];
  const seenIds = new Set<TuningId>();
  for (const item of raw) {
    if (result.length >= MAX_CUSTOM_TUNINGS) break;
    const parsed = parseCustomTuning(item);
    if (parsed && !seenIds.has(parsed.id)) {
      seenIds.add(parsed.id);
      result.push(parsed);
    }
  }
  return result;
}

export function createCustomTuning(
  instrumentId: InstrumentId,
  name: string,
  strings: readonly number[],
  id?: string,
): CustomTuning | null {
  const generatedId =
    id ?? `custom:${instrumentId}:${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return parseCustomTuning({
    id: generatedId,
    name,
    instrumentId,
    strings,
  });
}

