import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_SETTINGS } from '../constants';
import { parseReferencePitch, parseSettings } from './settings-parser';

describe('settings-parser', () => {
  it('returns defaults for invalid input', () => {
    assert.deepEqual(parseSettings(null), DEFAULT_SETTINGS);
    assert.deepEqual(parseSettings('oops'), DEFAULT_SETTINGS);
    assert.deepEqual(parseSettings([1, 2]), DEFAULT_SETTINGS);
  });

  it('keeps valid values', () => {
    const settings = parseSettings({
      instrumentId: 'bass',
      tuningId: 'drop-d',
      mode: 'chromatic',
      displayStyle: 'strobe',
      notation: 'solfege',
      referencePitch: 442,
      tolerance: 2,
      hapticsEnabled: false,
      keepAwake: false,
    });
    assert.deepEqual(settings, {
      instrumentId: 'bass',
      tuningId: 'drop-d',
      mode: 'chromatic',
      displayStyle: 'strobe',
      notation: 'solfege',
      referencePitch: 442,
      tolerance: 2,
      hapticsEnabled: false,
      keepAwake: false,
    });
  });

  it('falls back to the first tuning when the tuning does not belong to the instrument', () => {
    assert.equal(parseSettings({ instrumentId: 'ukulele', tuningId: 'dadgad' }).tuningId, 'standard');
  });

  it('replaces unknown enum values with defaults', () => {
    const settings = parseSettings({ mode: 'laser', tolerance: 7, notation: 42 });
    assert.equal(settings.mode, DEFAULT_SETTINGS.mode);
    assert.equal(settings.tolerance, DEFAULT_SETTINGS.tolerance);
    assert.equal(settings.notation, DEFAULT_SETTINGS.notation);
  });

  it('clamps the reference pitch', () => {
    assert.equal(parseReferencePitch(500), 450);
    assert.equal(parseReferencePitch(400), 430);
    assert.equal(parseReferencePitch(Number.NaN), 440);
    assert.equal(parseReferencePitch('441'), 440);
  });
});

