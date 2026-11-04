import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DETECTION_TUNING, INSTRUMENTS } from '../constants';
import { centsBetween } from '../music';
import { DetectorRegistry } from './detector-registry';
import { McLeodPitchDetector } from './mcleod-pitch-detector';
import { YinPitchDetector } from './yin-pitch-detector';

const SAMPLE_RATES = [44100, 48000];
const guitar = INSTRUMENTS[0].analysis;
const bass = INSTRUMENTS[1].analysis;

function sine(frequency: number, sampleRate: number, size: number, amplitude = 0.5): Float32Array {
  return Float32Array.from(
    { length: size },
    (_, i) => amplitude * Math.sin((2 * Math.PI * frequency * i) / sampleRate),
  );
}

function pluckedString(frequency: number, sampleRate: number, size: number): Float32Array {
  const harmonics = [1, 0.8, 0.55, 0.4, 0.25, 0.15];
  return Float32Array.from({ length: size }, (_, i) => {
    const t = i / sampleRate;
    const decay = Math.exp(-1.5 * t);
    return (
      0.3 *
      decay *
      harmonics.reduce(
        (sum, weight, h) => sum + weight * Math.sin(2 * Math.PI * frequency * (h + 1) * t + h),
        0,
      )
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

describe('McLeodPitchDetector (FFT + Decimation)', () => {
  const detector = new McLeodPitchDetector(DETECTION_TUNING);

  for (const sampleRate of SAMPLE_RATES) {
    for (const frequency of [82.41, 110, 146.83, 196, 246.94, 329.63, 440, 659.26]) {
      it(`detects a ${frequency} Hz sine within 1 cent at ${sampleRate} Hz`, () => {
        const estimate = detector.detect(
          sine(frequency, sampleRate, guitar.frameSize),
          sampleRate,
          guitar,
        );
        assert.ok(estimate, 'expected an estimate');
        assert.ok(
          Math.abs(centsBetween(estimate.frequency, frequency)) < 1,
          `got ${estimate.frequency}`,
        );
      });
    }
  }

  for (const frequency of [82.41, 110, 196, 329.63]) {
    it(`finds the fundamental of a harmonic-rich ${frequency} Hz plucked string`, () => {
      const estimate = detector.detect(
        pluckedString(frequency, 48000, guitar.frameSize),
        48000,
        guitar,
      );
      assert.ok(estimate, 'expected an estimate');
      assert.ok(
        Math.abs(centsBetween(estimate.frequency, frequency)) < 3,
        `got ${estimate.frequency}`,
      );
    });
  }

  for (const frequency of [30.87, 41.2, 55]) {
    it(`detects low bass note ${frequency} Hz with the bass profile`, () => {
      const estimate = detector.detect(
        pluckedString(frequency, 48000, bass.frameSize),
        48000,
        bass,
      );
      assert.ok(estimate, 'expected an estimate');
      assert.ok(
        Math.abs(centsBetween(estimate.frequency, frequency)) < 3,
        `got ${estimate.frequency}`,
      );
    });
  }

  it('keeps effective window latency <= 90 ms for bass and <= 50 ms for guitar at 48 kHz', () => {
    const bassLatencyMs = (bass.frameSize / 48000) * 1000;
    const guitarLatencyMs = (guitar.frameSize / 48000) * 1000;
    assert.ok(bassLatencyMs <= 90, `bass latency was ${bassLatencyMs.toFixed(1)} ms`);
    assert.ok(guitarLatencyMs <= 50, `guitar latency was ${guitarLatencyMs.toFixed(1)} ms`);
  });

  it('reduces bass-profile frame cost by >= 8x compared with baseline 8192 time-domain NSDF', () => {
    const legacySamples = pluckedString(41.2, 48000, 8192);
    const optimizedSamples = pluckedString(41.2, 48000, bass.frameSize);
    const legacyMaxLag = Math.ceil(48000 / bass.minFrequency) + 2;

    // Warm up JIT
    detector.computeNsdfTimeDomain(legacySamples, legacyMaxLag);
    detector.detect(optimizedSamples, 48000, bass);

    const legacyRuns = 4;
    const t0 = performance.now();
    for (let i = 0; i < legacyRuns; i++) {
      detector.computeNsdfTimeDomain(legacySamples, legacyMaxLag);
    }
    const legacyAvgMs = (performance.now() - t0) / legacyRuns;

    const optimizedRuns = 40;
    const t1 = performance.now();
    for (let i = 0; i < optimizedRuns; i++) {
      detector.detect(optimizedSamples, 48000, bass);
    }
    const optimizedAvgMs = (performance.now() - t1) / optimizedRuns;

    const speedup = legacyAvgMs / Math.max(0.001, optimizedAvgMs);
    assert.ok(
      speedup >= 8,
      `Expected >= 8x speedup, got ${speedup.toFixed(1)}x (legacy=${legacyAvgMs.toFixed(2)}ms, opt=${optimizedAvgMs.toFixed(3)}ms)`,
    );
  });

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

describe('YinPitchDetector & DetectorRegistry', () => {
  const registry = new DetectorRegistry(DETECTION_TUNING);

  it('selects mpm-fft and yin strategies from registry', () => {
    const mpm = registry.get('mpm-fft');
    const yin = registry.get('yin');
    assert.ok(mpm instanceof McLeodPitchDetector);
    assert.ok(yin instanceof YinPitchDetector);
  });

  it('detects guitar and bass notes accurately with YinPitchDetector', () => {
    const yin = registry.get('yin');
    const e2 = yin.detect(sine(82.41, 48000, guitar.frameSize), 48000, guitar);
    assert.ok(e2 && Math.abs(centsBetween(e2.frequency, 82.41)) < 1);

    const e1 = yin.detect(sine(41.2, 48000, bass.frameSize), 48000, bass);
    assert.ok(e1 && Math.abs(centsBetween(e1.frequency, 41.2)) < 1);
  });
});

