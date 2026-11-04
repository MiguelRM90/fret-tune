import {
  CURRENT_SETTINGS_SCHEMA_VERSION,
  DEFAULT_SETTINGS,
  REFERENCE_PITCH_RANGE,
  TOLERANCE_OPTIONS,
  findInstrument,
  isInstrumentId,
} from '../constants';
import { isDetectorStrategyId } from '../dsp/detector-registry';
import {
  DisplayStyle,
  NoteNotation,
  ToleranceCents,
  TunerSettings,
  TuningMode,
  asTuningId,
} from '../models';
import { isValidTuningIdString, parseCustomTuningsList } from '../music/custom-tunings';

type UnknownRecord = Readonly<Record<string, unknown>>;

export const MAX_SETTINGS_JSON_LENGTH = 16_384;
export const MAX_TUNING_ID_LENGTH = 64;
export const MIN_SCHEMA_VERSION = 1;
export const MAX_SCHEMA_VERSION = 10;

const ALLOWED_SETTINGS_KEYS = [
  'schemaVersion',
  'instrumentId',
  'tuningId',
  'mode',
  'displayStyle',
  'notation',
  'referencePitch',
  'tolerance',
  'hapticsEnabled',
  'keepAwake',
  'detector',
  'customTunings',
] as const;

export interface SettingsMigration {
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly migrate: (raw: UnknownRecord) => UnknownRecord;
}

function sanitizeRecordKeys(raw: UnknownRecord): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const key of ALLOWED_SETTINGS_KEYS) {
    if (Object.prototype.hasOwnProperty.call(raw, key)) {
      clean[key] = raw[key];
    }
  }
  return clean;
}

export const SETTINGS_MIGRATIONS: readonly SettingsMigration[] = [
  {
    fromVersion: 1,
    toVersion: 2,
    migrate: (raw: UnknownRecord): UnknownRecord => {
      const base = sanitizeRecordKeys(raw);
      return {
        ...base,
        schemaVersion: 2,
        detector: base['detector'] ?? DEFAULT_SETTINGS.detector,
        customTunings: Array.isArray(base['customTunings']) ? base['customTunings'] : [],
      };
    },
  },
];

export function migrateSettingsPayload(raw: UnknownRecord): UnknownRecord {
  const rawVersion = raw['schemaVersion'];
  const initialVersion =
    typeof rawVersion === 'number' &&
    Number.isInteger(rawVersion) &&
    rawVersion >= MIN_SCHEMA_VERSION &&
    rawVersion <= MAX_SCHEMA_VERSION
      ? rawVersion
      : 1;

  let current: UnknownRecord = sanitizeRecordKeys(raw);
  let version = initialVersion;

  for (const migration of SETTINGS_MIGRATIONS) {
    if (version === migration.fromVersion) {
      current = migration.migrate(current);
      version = migration.toVersion;
    }
  }

  return current;
}

export function parseSettingsJson(rawJson: unknown): TunerSettings {
  if (
    typeof rawJson !== 'string' ||
    rawJson.length < 2 ||
    rawJson.length > MAX_SETTINGS_JSON_LENGTH
  ) {
    return DEFAULT_SETTINGS;
  }
  try {
    const parsed: unknown = JSON.parse(rawJson);
    return parseSettings(parsed);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function parseSettings(raw: unknown): TunerSettings {
  if (!isRecord(raw)) {
    return DEFAULT_SETTINGS;
  }

  const migrated = migrateSettingsPayload(raw);
  const instrumentId = isInstrumentId(migrated['instrumentId'])
    ? migrated['instrumentId']
    : DEFAULT_SETTINGS.instrumentId;
  const customTunings = parseCustomTuningsList(migrated['customTunings']);
  const instrument = findInstrument(instrumentId);
  const availableTunings = [
    ...instrument.tunings,
    ...customTunings.filter((t) => t.instrumentId === instrumentId),
  ];

  const candidateTuningId = migrated['tuningId'];
  const tuningId =
    isValidTuningIdString(candidateTuningId) &&
    candidateTuningId.length <= MAX_TUNING_ID_LENGTH &&
    availableTunings.some((tuning) => tuning.id === candidateTuningId)
      ? asTuningId(candidateTuningId)
      : instrument.tunings[0].id;

  return {
    schemaVersion: CURRENT_SETTINGS_SCHEMA_VERSION,
    instrumentId,
    tuningId,
    mode: pick<TuningMode>(migrated['mode'], ['instrument', 'chromatic'], DEFAULT_SETTINGS.mode),
    displayStyle: pick<DisplayStyle>(
      migrated['displayStyle'],
      ['needle', 'strobe'],
      DEFAULT_SETTINGS.displayStyle,
    ),
    notation: pick<NoteNotation>(
      migrated['notation'],
      ['letter', 'solfege'],
      DEFAULT_SETTINGS.notation,
    ),
    referencePitch: parseReferencePitch(migrated['referencePitch']),
    tolerance: pick<ToleranceCents>(
      migrated['tolerance'],
      TOLERANCE_OPTIONS,
      DEFAULT_SETTINGS.tolerance,
    ),
    hapticsEnabled:
      typeof migrated['hapticsEnabled'] === 'boolean'
        ? migrated['hapticsEnabled']
        : DEFAULT_SETTINGS.hapticsEnabled,
    keepAwake:
      typeof migrated['keepAwake'] === 'boolean' ? migrated['keepAwake'] : DEFAULT_SETTINGS.keepAwake,
    detector: isDetectorStrategyId(migrated['detector'])
      ? migrated['detector']
      : DEFAULT_SETTINGS.detector,
    customTunings,
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
