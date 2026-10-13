import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { centsBetween, clamp, frequencyToMidi, median, midiToFrequency } from './music-math';

describe('music-math', () => {
  it('maps A4 to MIDI 69 at the reference pitch', () => {
    assert.equal(frequencyToMidi(440, 440), 69);
    assert.equal(frequencyToMidi(432, 432), 69);
  });

  it('maps low E (82.41 Hz) to MIDI 40', () => {
    assert.ok(Math.abs(frequencyToMidi(82.4069, 440) - 40) < 1e-4);
  });

  it('converts MIDI back to frequency', () => {
    assert.ok(Math.abs(midiToFrequency(40, 440) - 82.4069) < 1e-3);
    assert.ok(Math.abs(midiToFrequency(57, 440) - 220) < 1e-9);
  });

  it('measures cents between frequencies', () => {
    assert.ok(Math.abs(centsBetween(880, 440) - 1200) < 1e-9);
    assert.ok(Math.abs(centsBetween(440 * 2 ** (10 / 1200), 440) - 10) < 1e-9);
    assert.ok(centsBetween(435, 440) < 0);
  });

  it('computes medians for odd and even sizes', () => {
    assert.equal(median([3, 1, 2]), 2);
    assert.equal(median([4, 1, 3, 2]), 2.5);
  });

  it('clamps values', () => {
    assert.equal(clamp(70, -50, 50), 50);
    assert.equal(clamp(-70, -50, 50), -50);
    assert.equal(clamp(12, -50, 50), 12);
  });
});

