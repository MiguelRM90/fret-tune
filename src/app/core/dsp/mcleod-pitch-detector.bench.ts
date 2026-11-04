import { DETECTION_TUNING, INSTRUMENTS } from '../constants';
import { McLeodPitchDetector } from './mcleod-pitch-detector';

function generatePluckedWave(frequency: number, sampleRate: number, size: number): Float32Array {
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

export function runDspBenchmark(): void {
  const detector = new McLeodPitchDetector(DETECTION_TUNING);
  const sampleRate = 48000;
  const iterations = 200;

  for (const instrument of INSTRUMENTS) {
    const profile = instrument.analysis;
    const testFreq = instrument.id === 'bass' ? 41.2 : instrument.id === 'ukulele' ? 261.63 : 110;
    const samples = generatePluckedWave(testFreq, sampleRate, profile.frameSize);

    // Warmup
    for (let i = 0; i < 20; i++) {
      detector.detect(samples, sampleRate, profile);
    }

    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      detector.detect(samples, sampleRate, profile);
    }
    const totalMs = performance.now() - start;
    const usPerFrame = (totalMs * 1000) / iterations;
    const windowLatencyMs = (profile.frameSize / sampleRate) * 1000;

    process.stdout.write(
      `[DSP Bench] ${instrument.name.padEnd(8)} | frameSize=${profile.frameSize} (${windowLatencyMs.toFixed(1)} ms) | decimation=÷${profile.decimationFactor ?? 1} | ${usPerFrame.toFixed(1)} µs/frame\n`,
    );
  }
}

runDspBenchmark();

