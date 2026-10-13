const A4_MIDI = 69;
const SEMITONES_PER_OCTAVE = 12;
const CENTS_PER_OCTAVE = 1200;

export function frequencyToMidi(frequency: number, referencePitch: number): number {
  return A4_MIDI + SEMITONES_PER_OCTAVE * Math.log2(frequency / referencePitch);
}

export function midiToFrequency(midi: number, referencePitch: number): number {
  return referencePitch * 2 ** ((midi - A4_MIDI) / SEMITONES_PER_OCTAVE);
}

export function centsBetween(frequency: number, referenceFrequency: number): number {
  return CENTS_PER_OCTAVE * Math.log2(frequency / referenceFrequency);
}

export function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

