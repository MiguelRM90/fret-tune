import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  input,
  viewChild,
} from '@angular/core';
import { TunerReading } from '../../../../core/models';

@Component({
  selector: 'app-strobe-display',
  standalone: true,
  imports: [],
  templateUrl: './strobe-display.component.html',
  styleUrl: './strobe-display.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StrobeDisplayComponent implements OnInit, OnDestroy {
  readonly reading = input<TunerReading | null>(null);
  readonly isInTune = input<boolean>(false);

  private readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('strobeCanvas');

  private animHandle: number | null = null;
  private lastTime = 0;
  private phase1 = 0;
  private phase2 = 0;
  private phase3 = 0;

  ngOnInit(): void {
    this.startAnimation();
  }

  private startAnimation(): void {
    const tick = (now: number) => {
      if (this.lastTime === 0) {
        this.lastTime = now;
      }
      const dt = Math.min(0.05, (now - this.lastTime) / 1000);
      this.lastTime = now;

      this.updateAndDraw(dt);
      this.animHandle = requestAnimationFrame(tick);
    };
    this.animHandle = requestAnimationFrame(tick);
  }

  private updateAndDraw(dt: number): void {
    const canvas = this.canvasRef()?.nativeElement;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const r = this.reading();
    const inTune = this.isInTune();

    let speed = 0;
    if (r) {
      if (Math.abs(r.cents) < 0.8) {
        speed = 0;
      } else {
        speed = r.cents * 3.5;
      }
    }

    this.phase1 = (this.phase1 + speed * dt * 1.0) % 40;
    this.phase2 = (this.phase2 + speed * dt * 0.5) % 80;
    this.phase3 = (this.phase3 + speed * dt * 0.25) % 160;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const style = getComputedStyle(canvas);
    const brandColor = style.getPropertyValue('--pwa-brand-500').trim() || '#10b981';
    const activeColor = inTune ? brandColor : r ? (style.getPropertyValue('--pwa-brand-text').trim() || '#38bdf8') : (style.getPropertyValue('--pwa-slate-600').trim() || '#475569');
    const darkColor = inTune ? 'color-mix(in srgb, ' + brandColor + ' 12%, transparent)' : 'rgba(15, 23, 42, 0.4)';

    this.drawStrobeBand(ctx, 0, h * 0.32, 20, this.phase1, activeColor, darkColor, w);
    this.drawStrobeBand(ctx, h * 0.34, h * 0.32, 40, this.phase2, activeColor, darkColor, w);
    this.drawStrobeBand(ctx, h * 0.68, h * 0.32, 80, this.phase3, activeColor, darkColor, w);

    ctx.strokeStyle = inTune ? brandColor : 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w / 2, h);
    ctx.stroke();
  }

  private drawStrobeBand(
    ctx: CanvasRenderingContext2D,
    y: number,
    height: number,
    period: number,
    phase: number,
    activeColor: string,
    darkColor: string,
    width: number
  ): void {
    ctx.fillStyle = darkColor;
    ctx.fillRect(0, y, width, height);

    ctx.fillStyle = activeColor;
    const halfPeriod = period / 2;
    const startX = -period + (phase % period);

    for (let x = startX; x < width + period; x += period) {
      ctx.fillRect(x, y, halfPeriod, height);
    }
  }

  ngOnDestroy(): void {
    if (this.animHandle !== null) {
      cancelAnimationFrame(this.animHandle);
      this.animHandle = null;
    }
  }
}
