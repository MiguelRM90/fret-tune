import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DETECTION_TUNING, INSTRUMENTS } from '../constants';
import { McLeodPitchDetector } from './mcleod-pitch-detector';
import { centsBetween } from './music-math';

const SAMPLE_RATES = [44100, 48000];
const guitar = INSTRUMENTS[0].analysis;
const bass = INSTRUMENTS[1].analysis;

function sine(frequency: number, sampleRate: number, size: number, amplitude = 0.5): Float32Array {
  return Float32Array.from({ length: size }, (_, i) => amplitude * Math.sin((2 * Math.PI * frequency * i) / sampleRate));
}

function pluckedString(frequency: number, sampleRate: number, size: number): Float32Array {
  const harmonics = [1, 0.8, 0.55, 0.4, 0.25, 0.15];
  return Float32Array.from({ length: size }, (_, i) => {
    const t = i / sampleRate;
    const decay = Math.exp(-1.5 * t);
    return (
      0.3 *
      decay *
      harmonics.reduce((sum, weight, h) => sum + weight * Math.sin(2 * Math.PI * frequency * (h + 1) * t + h), 0)
    );
  });
}

function seededNoise(size: number, amplitude: number): Float32Array {
  let seed = 1234567;
  return Float32Array.from({ length: size }, () => {
    seed = (seed * 1103515245 + 12345) % 2 ** 31;
    return amplitude * ((seed / 2 ** 31) * 2 - 1);
  });
}

describe('McLeodPitchDetector', () => {
  const detector = new McLeodPitchDetector(DETECTION_TUNING);

  for (const sampleRate of SAMPLE_RATES) {
    for (const frequency of [82.41, 110, 146.83, 196, 246.94, 329.63, 440, 659.26]) {
      it(`detects a ${frequency} Hz sine within 1 cent at ${sampleRate} Hz`, () => {
        const estimate = detector.detect(sine(frequency, sampleRate, guitar.frameSize), sampleRate, guitar);
        assert.ok(estimate, 'expected an estimate');
        assert.ok(Math.abs(centsBetween(estimate.frequency, frequency)) < 1, `got ${estimate.frequency}`);
      });
    }
  }

  for (const frequency of [82.41, 110, 196, 329.63]) {
    it(`finds the fundamental of a harmonic-rich ${frequency} Hz plucked string`, () => {
      const estimate = detector.detect(pluckedString(frequency, 48000, guitar.frameSize), 48000, guitar);
      assert.ok(estimate, 'expected an estimate');
      assert.ok(Math.abs(centsBetween(estimate.frequency, frequency)) < 3, `got ${estimate.frequency}`);
    });
  }

  for (const frequency of [30.87, 41.2, 55]) {
    it(`detects low bass note ${frequency} Hz with the bass profile`, () => {
      const estimate = detector.detect(pluckedString(frequency, 48000, bass.frameSize), 48000, bass);
      assert.ok(estimate, 'expected an estimate');
      assert.ok(Math.abs(centsBetween(estimate.frequency, frequency)) < 3, `got ${estimate.frequency}`);
    });
  }

  it('reports high clarity for clean tones', () => {
    const estimate = detector.detect(sine(220, 48000, guitar.frameSize), 48000, guitar);
    assert.ok(estimate && estimate.clarity > 0.95);
  });

  it('ignores silence', () => {
    assert.equal(detector.detect(new Float32Array(guitar.frameSize), 48000, guitar), null);
  });

  it('ignores signals below the noise gate', () => {
    assert.equal(detector.detect(sine(220, 48000, guitar.frameSize, 0.004), 48000, guitar), null);
  });

  it('rejects broadband noise', () => {
    assert.equal(detector.detect(seededNoise(guitar.frameSize, 0.3), 48000, guitar), null);
  });
});

