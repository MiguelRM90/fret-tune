import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { NoteNotation, TunerReading, Tuning } from '../../../../core/models';
import { NoteNamePipe } from '../../../../shared/pipes';

export interface StringItem {
  readonly index: number;
  readonly number: number;
  readonly midi: number;
  readonly isDetected: boolean;
  readonly isLocked: boolean;
  readonly isTuned: boolean;
  readonly isPlaying: boolean;
}

@Component({
  selector: 'app-string-selector',
  standalone: true,
  imports: [NoteNamePipe],
  templateUrl: './string-selector.component.html',
  styleUrl: './string-selector.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StringSelectorComponent {
  readonly tuning = input.required<Tuning>();
  readonly notation = input<NoteNotation>('letter');
  readonly reading = input<TunerReading | null>(null);
  readonly lockedString = input<number | null>(null);
  readonly tunedStrings = input<Readonly<Record<number, boolean>>>({});
  readonly playingMidi = input<number | null>(null);

  readonly selectString = output<number>();
  readonly playTone = output<number>();
  readonly resetChecklist = output<void>();

  readonly stringItems = computed<StringItem[]>(() => {
    const t = this.tuning();
    const r = this.reading();
    const locked = this.lockedString();
    const tuned = this.tunedStrings();
    const playing = this.playingMidi();
    const count = t.strings.length;

    return t.strings.map((midi, index) => {
      const isDetected = r?.stringIndex === index;
      const isLocked = locked === index;
      const isTuned = !!tuned[index];
      const isPlaying = playing === midi;

      return {
        index,
        number: count - index,
        midi,
        isDetected,
        isLocked,
        isTuned,
        isPlaying,
      };
    });
  });

  readonly allTuned = computed<boolean>(() => {
    const count = this.tuning().strings.length;
    const tuned = this.tunedStrings();
    let countTuned = 0;
    for (let i = 0; i < count; i++) {
      if (tuned[i]) countTuned++;
    }
    return countTuned === count;
  });

  onStringClick(index: number): void {
    this.selectString.emit(index);
  }

  onPlayToneClick(event: MouseEvent, index: number): void {
    event.stopPropagation();
    this.playTone.emit(index);
  }
}
