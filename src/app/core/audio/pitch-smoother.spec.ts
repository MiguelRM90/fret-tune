import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SMOOTHING } from '../constants';
import { centsBetween } from './music-math';
import { PitchSmoother } from './pitch-smoother';

const FRAME_MS = 30;

function feed(smoother: PitchSmoother, frequencies: readonly (number | null)[], startAt = 0): (number | null)[] {
  return frequencies.map((frequency, i) => smoother.push(frequency, startAt + i * FRAME_MS));
}

describe('PitchSmoother', () => {
  it('returns null before any valid pitch', () => {
    assert.equal(new PitchSmoother(SMOOTHING).push(null, 0), null);
  });

  it('converges to a steady pitch', () => {
    const output = feed(new PitchSmoother(SMOOTHING), Array<number>(10).fill(110)).at(-1);
    assert.ok(output !== null && output !== undefined);
    assert.ok(Math.abs(centsBetween(output, 110)) < 0.01);
  });

  it('rejects a single-frame octave glitch', () => {
    const smoother = new PitchSmoother(SMOOTHING);
    feed(smoother, [110, 110, 110, 110]);
    const output = smoother.push(220, 200);
    assert.ok(output !== null && Math.abs(centsBetween(output, 110)) < 1);
  });

  it('follows a confirmed note change', () => {
    const smoother = new PitchSmoother(SMOOTHING);
    feed(smoother, [110, 110, 110, 110]);
    const output = feed(smoother, [146.83, 146.83, 146.83], 200).at(-1);
    assert.ok(output !== null && output !== undefined && Math.abs(centsBetween(output, 146.83)) < 1);
  });

  it('holds the last pitch during brief dropouts', () => {
    const smoother = new PitchSmoother(SMOOTHING);
    feed(smoother, [196, 196, 196]);
    assert.ok(smoother.push(null, 100 + SMOOTHING.holdMs / 2) !== null);
  });

  it('releases the pitch after the hold time', () => {
    const smoother = new PitchSmoother(SMOOTHING);
    feed(smoother, [196, 196, 196]);
    assert.equal(smoother.push(null, 60 + SMOOTHING.holdMs + 1), null);
  });
});

