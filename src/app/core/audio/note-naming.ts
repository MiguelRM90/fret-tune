import { Accidental, NoteDescriptor, NoteNotation } from '../models';

interface PitchClass {
  readonly index: number;
  readonly accidental: Accidental;
}

const LETTER_NAMES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;
const SOLFEGE_NAMES = ['Do', 'Re', 'Mi', 'Fa', 'Sol', 'La', 'Si'] as const;

const PITCH_CLASSES: readonly PitchClass[] = [
  { index: 0, accidental: '' },
  { index: 0, accidental: '♯' },
  { index: 1, accidental: '' },
  { index: 1, accidental: '♯' },
  { index: 2, accidental: '' },
  { index: 3, accidental: '' },
  { index: 3, accidental: '♯' },
  { index: 4, accidental: '' },
  { index: 4, accidental: '♯' },
  { index: 5, accidental: '' },
  { index: 5, accidental: '♯' },
  { index: 6, accidental: '' },
];

export function describeNote(midi: number, notation: NoteNotation): NoteDescriptor {
  const rounded = Math.round(midi);
  const pitchClass = PITCH_CLASSES[((rounded % 12) + 12) % 12];
  const names = notation === 'solfege' ? SOLFEGE_NAMES : LETTER_NAMES;

  return {
    midi: rounded,
    name: names[pitchClass.index],
    accidental: pitchClass.accidental,
    octave: Math.floor(rounded / 12) - 1,
  };
}

export function formatNote(midi: number, notation: NoteNotation, withOctave = true): string {
  const note = describeNote(midi, notation);
  return `${note.name}${note.accidental}${withOctave ? note.octave : ''}`;
}

