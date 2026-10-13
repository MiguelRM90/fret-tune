import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TunerReading } from '../../../../core/models';
import { clamp } from '../../../../core/audio/music-math';
import { DISPLAY_RANGE_CENTS } from '../../../../core/constants';

@Component({
  selector: 'app-needle-gauge',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './needle-gauge.component.html',
  styleUrl: './needle-gauge.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NeedleGaugeComponent {
  readonly reading = input<TunerReading | null>(null);
  readonly isInTune = input<boolean>(false);
  readonly tolerance = input<number>(5);

  readonly clampedCents = computed(() => {
    const r = this.reading();
    return r ? clamp(r.cents, -DISPLAY_RANGE_CENTS, DISPLAY_RANGE_CENTS) : 0;
  });

  readonly needleAngle = computed(() => {
    const cents = this.clampedCents();
    return (cents / DISPLAY_RANGE_CENTS) * 45;
  });

  readonly tickMarks = [-50, -40, -30, -20, -10, 0, 10, 20, 30, 40, 50];

  getTickAngle(cents: number): number {
    return (cents / DISPLAY_RANGE_CENTS) * 45;
  }
}
