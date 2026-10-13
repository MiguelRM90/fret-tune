import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TunerReading } from '../../../../core/models';
import { clamp } from '../../../../core/audio/music-math';
import { DISPLAY_RANGE_CENTS } from '../../../../core/constants';

export interface GaugeTick {
  readonly cents: number;
  readonly angle: number;
  readonly isCenter: boolean;
  readonly isMajor: boolean;
  readonly hasLabel: boolean;
  readonly label: string;
}

const GAUGE_TICKS: readonly GaugeTick[] = [-50, -40, -30, -20, -10, 0, 10, 20, 30, 40, 50].map((cents) => ({
  cents,
  angle: (cents / DISPLAY_RANGE_CENTS) * 45,
  isCenter: cents === 0,
  isMajor: cents % 20 === 0,
  hasLabel: cents === -50 || cents === -20 || cents === 0 || cents === 20 || cents === 50,
  label: cents === 0 ? '0' : (cents > 0 ? `+${cents}` : `${cents}`),
}));

@Component({
  selector: 'app-needle-gauge',
  standalone: true,
  imports: [],
  templateUrl: './needle-gauge.component.html',
  styleUrl: './needle-gauge.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NeedleGaugeComponent {
  readonly reading = input<TunerReading | null>(null);
  readonly isInTune = input<boolean>(false);
  readonly tolerance = input<number>(5);

  readonly ticks = GAUGE_TICKS;

  readonly clampedCents = computed(() => {
    const r = this.reading();
    return r ? clamp(r.cents, -DISPLAY_RANGE_CENTS, DISPLAY_RANGE_CENTS) : 0;
  });

  readonly needleAngle = computed(() => {
    const cents = this.clampedCents();
    return (cents / DISPLAY_RANGE_CENTS) * 45;
  });
}
