const FIR_FACTOR_2 = new Float64Array([-0.0625, 0, 0.3125, 0.5, 0.3125, 0, -0.0625]);

const FIR_FACTOR_4 = new Float64Array([
  -0.015625,
  -0.025,
  0.03125,
  0.135,
  0.236875,
  0.275,
  0.236875,
  0.135,
  0.03125,
  -0.025,
  -0.015625,
]);

export class SignalDecimator {
  private buffer = new Float32Array(0);

  decimate(samples: Float32Array, factor: 1 | 2 | 4): Float32Array {
    if (factor === 1) {
      return samples;
    }

    const taps = factor === 2 ? FIR_FACTOR_2 : FIR_FACTOR_4;
    const halfTap = (taps.length - 1) >> 1;
    const validInputLength = samples.length - 2 * halfTap;
    if (validInputLength <= factor * 8) {
      return samples;
    }

    const outLength = Math.floor(validInputLength / factor);
    if (this.buffer.length < outLength) {
      this.buffer = new Float32Array(outLength);
    }

    const out = this.buffer.subarray(0, outLength);
    const tapCount = taps.length;

    for (let i = 0; i < outLength; i++) {
      const center = halfTap + i * factor;
      const base = center - halfTap;
      let acc = 0;
      for (let t = 0; t < tapCount; t++) {
        acc += samples[base + t] * taps[t];
      }
      out[i] = acc;
    }

    return out;
  }
}

