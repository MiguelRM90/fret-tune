import { TuneDirection, TunerReading, Tuning, TuningMode } from '../models';
import { centsBetween, frequencyToMidi, midiToFrequency } from './music-math';

export interface ReadingContext {
  readonly referencePitch: number;
  readonly mode: TuningMode;
  readonly tuning: Tuning;
  readonly lockedString: number | null;
  readonly tolerance: number;
}

export function resolveReading(frequency: number, context: ReadingContext): TunerReading {
  const detectedMidi = Math.round(frequencyToMidi(frequency, context.referencePitch));
  const stringIndex = context.mode === 'instrument' ? resolveStringIndex(frequency, context) : null;
  const targetMidi = stringIndex === null ? detectedMidi : context.tuning.strings[stringIndex];
  const targetFrequency = midiToFrequency(targetMidi, context.referencePitch);
  const cents = centsBetween(frequency, targetFrequency);

  return {
    frequency,
    detectedMidi,
    targetMidi,
    targetFrequency,
    cents,
    stringIndex,
    direction: resolveDirection(cents, context.tolerance),
  };
}

export function findClosestString(frequency: number, strings: readonly number[], referencePitch: number): number {
  const midi = frequencyToMidi(frequency, referencePitch);
  return strings.reduce(
    (closest, stringMidi, index) => (Math.abs(midi - stringMidi) < Math.abs(midi - strings[closest]) ? index : closest),
    0,
  );
}

function resolveStringIndex(frequency: number, context: ReadingContext): number {
  const { lockedString, tuning, referencePitch } = context;
  const isValidLock = lockedString !== null && lockedString >= 0 && lockedString < tuning.strings.length;
  return isValidLock ? lockedString : findClosestString(frequency, tuning.strings, referencePitch);
}

function resolveDirection(cents: number, tolerance: number): TuneDirection {
  if (Math.abs(cents) <= tolerance) {
    return 'in-tune';
  }
  return cents < 0 ? 'flat' : 'sharp';
}

