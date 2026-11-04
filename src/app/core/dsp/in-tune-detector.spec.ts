import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TunerReading } from '../models';
import { InTuneDetector } from './in-tune-detector';

function makeReading(
  cents: number,
  tolerance = 5,
  targetMidi = 40,
  stringIndex: number | null = 0,
): TunerReading {
  return {
    frequency: 82.41,
    detectedMidi: targetMidi,
    targetMidi,
    targetFrequency: 82.41,
    cents,
    stringIndex,
    direction: Math.abs(cents) <= tolerance ? 'in-tune' : cents < 0 ? 'flat' : 'sharp',
  };
}

describe('InTuneDetector', () => {
  it('locks only after sustaining an in-tune reading for lockDurationMs (450 ms)', () => {
    const detector = new InTuneDetector({ lockDurationMs: 450 });
    const r = makeReading(1.5, 5, 40, 0);

    assert.deepEqual(detector.push(r, 100, 5), {
      isInTune: false,
      lockedStringIndex: null,
      justLocked: false,
    });
    assert.deepEqual(detector.push(r, 540, 5), {
      isInTune: false,
      lockedStringIndex: null,
      justLocked: false,
    });

    const locked = detector.push(r, 550, 5);
    assert.deepEqual(locked, {
      isInTune: true,
      lockedStringIndex: 0,
      justLocked: true,
    });

    const sustained = detector.push(r, 600, 5);
    assert.deepEqual(sustained, {
      isInTune: true,
      lockedStringIndex: 0,
      justLocked: false,
    });
  });

  it('respects tolerance boundaries and release hysteresis once locked', () => {
    const detector = new InTuneDetector({ lockDurationMs: 450, releaseHysteresisFactor: 1.25 });

    // Outside ±5 cents before lock -> never starts timer
    assert.equal(detector.push(makeReading(5.5, 5), 0, 5).isInTune, false);
    assert.equal(detector.push(makeReading(5.5, 5), 600, 5).isInTune, false);

    // Inside ±5 cents -> locks after 450 ms
    detector.push(makeReading(4.8, 5), 1000, 5);
    assert.equal(detector.push(makeReading(4.9, 5), 1450, 5).isInTune, true);

    // Slight drift to 5.8 cents (within 5 * 1.25 = 6.25 cents hysteresis) stays locked!
    assert.equal(detector.push(makeReading(5.8, 5), 1500, 5).isInTune, true);

    // Drift beyond hysteresis (6.5 cents > 6.25 cents) releases lock
    assert.equal(detector.push(makeReading(6.5, 5), 1550, 5).isInTune, false);
  });

  it('resets lock when target note changes or signal drops out', () => {
    const detector = new InTuneDetector({ lockDurationMs: 450 });
    detector.push(makeReading(0, 5, 40, 0), 0, 5);
    assert.equal(detector.push(makeReading(0, 5, 40, 0), 450, 5).isInTune, true);

    // Different string/note resets the timer
    assert.equal(detector.push(makeReading(0, 5, 45, 1), 500, 5).isInTune, false);
    assert.equal(detector.push(makeReading(0, 5, 45, 1), 950, 5).isInTune, true);

    // Silence resets lock
    assert.equal(detector.push(null, 1000, 5).isInTune, false);
  });
});

