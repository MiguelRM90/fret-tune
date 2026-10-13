import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { INSTRUMENTS } from '../constants';
import { midiToFrequency } from './music-math';
import { ReadingContext, findClosestString, resolveReading } from './reading-resolver';

const standard = INSTRUMENTS[0].tunings[0];
const dropD = INSTRUMENTS[0].tunings.find((tuning) => tuning.id === 'drop-d')!;

const baseContext: ReadingContext = {
  referencePitch: 440,
  mode: 'instrument',
  tuning: standard,
  lockedString: null,
  tolerance: 5,
};

describe('reading-resolver', () => {
  it('finds the closest string', () => {
    assert.equal(findClosestString(83, standard.strings, 440), 0);
    assert.equal(findClosestString(245, standard.strings, 440), 4);
    assert.equal(findClosestString(330, standard.strings, 440), 5);
  });

  it('flags a perfectly tuned string as in tune', () => {
    const reading = resolveReading(midiToFrequency(45, 440), baseContext);
    assert.equal(reading.stringIndex, 1);
    assert.equal(reading.targetMidi, 45);
    assert.equal(reading.direction, 'in-tune');
    assert.ok(Math.abs(reading.cents) < 1e-9);
  });

  it('reports flat and sharp directions', () => {
    assert.equal(resolveReading(108, baseContext).direction, 'flat');
    assert.equal(resolveReading(112, baseContext).direction, 'sharp');
  });

  it('targets the locked string even when far away', () => {
    const reading = resolveReading(midiToFrequency(40, 440), { ...baseContext, tuning: dropD, lockedString: 0 });
    assert.equal(reading.targetMidi, 38);
    assert.ok(Math.abs(reading.cents - 200) < 1e-6);
    assert.equal(reading.direction, 'sharp');
  });

  it('ignores out-of-range string locks', () => {
    const reading = resolveReading(midiToFrequency(45, 440), { ...baseContext, lockedString: 9 });
    assert.equal(reading.stringIndex, 1);
  });

  it('uses the nearest semitone in chromatic mode', () => {
    const reading = resolveReading(450, { ...baseContext, mode: 'chromatic' });
    assert.equal(reading.stringIndex, null);
    assert.equal(reading.targetMidi, 69);
    assert.ok(reading.cents > 30 && reading.cents < 45);
  });

  it('honours a custom reference pitch', () => {
    const reading = resolveReading(432, { ...baseContext, mode: 'chromatic', referencePitch: 432 });
    assert.equal(reading.targetMidi, 69);
    assert.ok(Math.abs(reading.cents) < 1e-9);
  });
});

