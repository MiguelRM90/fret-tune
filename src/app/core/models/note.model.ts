export type NoteNotation = 'letter' | 'solfege';

export type Accidental = '' | '♯';

export interface NoteDescriptor {
  readonly midi: number;
  readonly name: string;
  readonly accidental: Accidental;
  readonly octave: number;
}

