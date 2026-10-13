import { Pipe, PipeTransform } from '@angular/core';
import { formatNote } from '../../core/audio/note-naming';
import { NoteNotation } from '../../core/models';

@Pipe({
  name: 'noteName',
  standalone: true,
})
export class NoteNamePipe implements PipeTransform {
  transform(midi: number | null | undefined, notation: NoteNotation = 'letter', withOctave = true): string {
    if (midi === null || midi === undefined || !Number.isFinite(midi)) {
      return '—';
    }
    return formatNote(midi, notation, withOctave);
  }
}

