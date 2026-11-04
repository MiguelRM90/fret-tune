export function nextPowerOfTwo(n: number): number {
  let power = 1;
  while (power < n) {
    power <<= 1;
  }
  return power;
}

export class FftAutocorrelator {
  private fftSize = 0;
  private real = new Float64Array(0);
  private imag = new Float64Array(0);
  private bitRev = new Int32Array(0);
  private cosTable = new Float64Array(0);
  private sinTable = new Float64Array(0);

  ensureCapacity(signalLength: number): number {
    const requiredSize = nextPowerOfTwo(signalLength * 2);
    if (requiredSize === this.fftSize) {
      return this.fftSize;
    }

    this.fftSize = requiredSize;
    this.real = new Float64Array(requiredSize);
    this.imag = new Float64Array(requiredSize);
    this.bitRev = new Int32Array(requiredSize);
    this.cosTable = new Float64Array(requiredSize >> 1);
    this.sinTable = new Float64Array(requiredSize >> 1);

    const bits = Math.round(Math.log2(requiredSize));
    for (let i = 0; i < requiredSize; i++) {
      let reversed = 0;
      let temp = i;
      for (let b = 0; b < bits; b++) {
        reversed = (reversed << 1) | (temp & 1);
        temp >>= 1;
      }
      this.bitRev[i] = reversed;
    }

    const half = requiredSize >> 1;
    for (let i = 0; i < half; i++) {
      const angle = (-2 * Math.PI * i) / requiredSize;
      this.cosTable[i] = Math.cos(angle);
      this.sinTable[i] = Math.sin(angle);
    }

    return this.fftSize;
  }

  autocorrelate(samples: Float32Array, length: number, maxLag: number, out: Float64Array): void {
    const n = this.ensureCapacity(length);
    const real = this.real;
    const imag = this.imag;

    for (let i = 0; i < length; i++) {
      real[i] = samples[i];
      imag[i] = 0;
    }
    for (let i = length; i < n; i++) {
      real[i] = 0;
      imag[i] = 0;
    }

    this.transform(false);

    for (let i = 0; i < n; i++) {
      const r = real[i];
      const im = imag[i];
      real[i] = r * r + im * im;
      imag[i] = 0;
    }

    this.transform(true);

    const limit = Math.min(maxLag, out.length - 1);
    for (let lag = 0; lag <= limit; lag++) {
      out[lag] = real[lag];
    }
  }

  private transform(inverse: boolean): void {
    const n = this.fftSize;
    const real = this.real;
    const imag = this.imag;
    const bitRev = this.bitRev;
    const cosTable = this.cosTable;
    const sinTable = this.sinTable;

    for (let i = 0; i < n; i++) {
      const j = bitRev[i];
      if (i < j) {
        const tr = real[i];
        real[i] = real[j];
        real[j] = tr;
        const ti = imag[i];
        imag[i] = imag[j];
        imag[j] = ti;
      }
    }

    const sign = inverse ? -1 : 1;
    for (let size = 2; size <= n; size <<= 1) {
      const halfSize = size >> 1;
      const tableStep = n / size;
      for (let i = 0; i < n; i += size) {
        let k = 0;
        for (let j = i; j < i + halfSize; j++) {
          const l = j + halfSize;
          const cos = cosTable[k];
          const sin = sinTable[k] * sign;
          const tr = real[l] * cos - imag[l] * sin;
          const ti = real[l] * sin + imag[l] * cos;
          real[l] = real[j] - tr;
          imag[l] = imag[j] - ti;
          real[j] += tr;
          imag[j] += ti;
          k += tableStep;
        }
      }
    }

    if (inverse) {
      const invN = 1 / n;
      for (let i = 0; i < n; i++) {
        real[i] *= invN;
        imag[i] *= invN;
      }
    }
  }
}

