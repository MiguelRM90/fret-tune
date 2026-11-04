import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { CURRENT_SETTINGS_SCHEMA_VERSION, DEFAULT_SETTINGS } from '../constants';
import { asTuningId } from '../models';
import {
  MAX_SETTINGS_JSON_LENGTH,
  MAX_TUNING_ID_LENGTH,
  parseReferencePitch,
  parseSettings,
  parseSettingsJson,
} from './settings-parser';

function collectSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...collectSourceFiles(full));
    } else if (stat.isFile()) {
      files.push(full);
    }
  }
  return files;
}

describe('settings-parser & XSS-01 guardrails', () => {
  it('returns defaults for invalid input', () => {
    assert.deepEqual(parseSettings(null), DEFAULT_SETTINGS);
    assert.deepEqual(parseSettings('oops'), DEFAULT_SETTINGS);
    assert.deepEqual(parseSettings([1, 2]), DEFAULT_SETTINGS);
  });

  it('migrates a v1 settings payload (without schemaVersion) to current schema', () => {
    const v1Payload = {
      instrumentId: 'bass',
      tuningId: 'drop-d',
      mode: 'chromatic',
      displayStyle: 'strobe',
      notation: 'solfege',
      referencePitch: 442,
      tolerance: 2,
      hapticsEnabled: false,
      keepAwake: false,
    };

    const migrated = parseSettings(v1Payload);
    assert.deepEqual(migrated, {
      schemaVersion: CURRENT_SETTINGS_SCHEMA_VERSION,
      instrumentId: 'bass',
      tuningId: asTuningId('drop-d'),
      mode: 'chromatic',
      displayStyle: 'strobe',
      notation: 'solfege',
      referencePitch: 442,
      tolerance: 2,
      hapticsEnabled: false,
      keepAwake: false,
      detector: 'mpm-fft',
      customTunings: [],
    });
  });

  it('preserves valid custom tunings and rejects XSS / invalid custom tunings', () => {
    const settings = parseSettings({
      schemaVersion: 2,
      instrumentId: 'guitar',
      tuningId: 'custom:guitar:open-c6',
      detector: 'yin',
      customTunings: [
        {
          id: 'custom:guitar:open-c6',
          name: 'Open C6 (Custom)',
          instrumentId: 'guitar',
          strings: [36, 45, 48, 55, 60, 64],
          isCustom: true,
        },
        {
          id: 'custom:guitar:xss',
          name: '<script>alert(1)</script>',
          instrumentId: 'guitar',
          strings: [40, 45, 50, 55, 59, 64],
        },
        {
          id: 'custom:guitar:bad-midi',
          name: 'Out of range',
          instrumentId: 'guitar',
          strings: [5, 200, 50],
        },
      ],
    });

    assert.equal(settings.detector, 'yin');
    assert.equal(settings.customTunings.length, 1);
    assert.equal(settings.customTunings[0].name, 'Open C6 (Custom)');
    assert.equal(settings.tuningId, asTuningId('custom:guitar:open-c6'));
  });

  it('XSS-01: enforces strict length and range bounds on JSON payloads and tuning IDs', () => {
    const oversizedJson = JSON.stringify({
      instrumentId: 'guitar',
      padding: 'A'.repeat(MAX_SETTINGS_JSON_LENGTH + 100),
    });
    assert.deepEqual(parseSettingsJson(oversizedJson), DEFAULT_SETTINGS);
    assert.deepEqual(parseSettingsJson('{invalid json'), DEFAULT_SETTINGS);

    const overlongTuningId = 'a'.repeat(MAX_TUNING_ID_LENGTH + 1);
    const settings = parseSettings({
      instrumentId: 'guitar',
      tuningId: overlongTuningId,
    });
    assert.equal(settings.tuningId, asTuningId('standard'));
  });

  it('falls back to the first tuning when the tuning does not belong to the instrument', () => {
    assert.equal(parseSettings({ instrumentId: 'ukulele', tuningId: 'dadgad' }).tuningId, 'standard');
  });

  it('replaces unknown enum values with defaults', () => {
    const settings = parseSettings({ mode: 'laser', tolerance: 7, notation: 42, detector: 'magic' });
    assert.equal(settings.mode, DEFAULT_SETTINGS.mode);
    assert.equal(settings.tolerance, DEFAULT_SETTINGS.tolerance);
    assert.equal(settings.notation, DEFAULT_SETTINGS.notation);
    assert.equal(settings.detector, DEFAULT_SETTINGS.detector);
  });

  it('clamps the reference pitch', () => {
    assert.equal(parseReferencePitch(500), 450);
    assert.equal(parseReferencePitch(400), 430);
    assert.equal(parseReferencePitch(Number.NaN), 440);
    assert.equal(parseReferencePitch('441'), 440);
  });

  it('XSS-01: ensures zero dangerous DOM sinks or eval calls exist anywhere in src/', () => {
    const srcRoot = resolve(process.cwd(), 'src');
    const files = collectSourceFiles(srcRoot);
    assert.ok(files.length > 0, 'Expected source files in src/');

    const forbiddenPatterns = [
      ['inner', 'HTML'].join(''),
      ['outer', 'HTML'].join(''),
      ['insertAdjacent', 'HTML'].join(''),
      ['bypassSecurity', 'Trust'].join(''),
      ['ev', 'al('].join(''),
    ];

    for (const file of files) {
      const content = readFileSync(file, 'utf8');
      for (const pattern of forbiddenPatterns) {
        assert.equal(
          content.includes(pattern),
          false,
          `Forbidden DOM sink "${pattern}" found in ${file}`,
        );
      }
    }
  });
});
