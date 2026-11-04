import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SMOOTHING } from '../constants';
import { centsBetween } from '../music';
import { PitchSmoother } from './pitch-smoother';

const FRAME_MS = 30;

function feed(
  smoother: PitchSmoother,
  frequencies: readonly (number | null)[],
  startAt = 0,
  stepMs = FRAME_MS,
): (number | null)[] {
  return frequencies.map((frequency, i) => smoother.push(frequency, startAt + i * stepMs));
}

describe('PitchSmoother (time-based)', () => {
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

  it('keeps needle settling time for a 10-cent step within ±10% between 60 Hz and 120 Hz cadences', () => {
    const f0 = 440;
    const f1 = 440 * 2 ** (10 / 1200);

    function measureSettlingTimeMs(hz: number): number {
      const dt = 1000 / hz;
      const smoother = new PitchSmoother(SMOOTHING);
      let t = 0;
      for (let i = 0; i < 10; i++) {
        smoother.push(f0, t);
        t += dt;
      }
      const stepStart = t;
      for (let i = 0; i < 200; i++) {
        t += dt;
        const out = smoother.push(f1, t);
        if (out !== null && Math.abs(centsBetween(out, f1)) <= 1.0) {
          return t - stepStart;
        }
      }
      return Infinity;
    }

    const settle60Ms = measureSettlingTimeMs(60);
    const settle120Ms = measureSettlingTimeMs(120);
    const relativeDiff = Math.abs(settle60Ms - settle120Ms) / settle60Ms;

    assert.ok(
      relativeDiff <= 0.1,
      `Expected settling times within 10%, got 60Hz=${settle60Ms.toFixed(1)}ms vs 120Hz=${settle120Ms.toFixed(1)}ms (diff=${(relativeDiff * 100).toFixed(1)}%)`,
    );
  });
});

