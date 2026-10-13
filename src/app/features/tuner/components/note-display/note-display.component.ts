import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NoteNotation, TunerReading } from '../../../../core/models';
import { describeNote, formatNote } from '../../../../core/audio/note-naming';
import { CentsPipe, NoteNamePipe } from '../../../../shared/pipes';

@Component({
  selector: 'app-note-display',
  standalone: true,
  imports: [CommonModule, CentsPipe],
  templateUrl: './note-display.component.html',
  styleUrl: './note-display.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NoteDisplayComponent {
  readonly reading = input<TunerReading | null>(null);
  readonly notation = input<NoteNotation>('letter');
  readonly isInTune = input<boolean>(false);

  readonly noteInfo = computed(() => {
    const r = this.reading();
    if (!r) return null;
    return describeNote(r.targetMidi, this.notation());
  });

  readonly altNoteName = computed(() => {
    const r = this.reading();
    if (!r) return '';
    const altNotation: NoteNotation = this.notation() === 'letter' ? 'solfege' : 'letter';
    return formatNote(r.targetMidi, altNotation, true);
  });
}
