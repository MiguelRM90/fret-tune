import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  OnDestroy,
  effect,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { TunerReading } from '@core/models';
import { ThemeService } from 'pwa-ui-core/services';

interface CachedStrobePalette {
  readonly brandColor: string;
  readonly activePitchColor: string;
  readonly idleColor: string;
  readonly inTuneDarkColor: string;
  readonly normalDarkColor: string;
}

@Component({
  selector: 'app-strobe-display',
  standalone: true,
  imports: [],
  templateUrl: './strobe-display.component.html',
  styleUrl: './strobe-display.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StrobeDisplayComponent implements AfterViewInit, OnDestroy {
  readonly reading = input<TunerReading | null>(null);
  readonly isInTune = input<boolean>(false);

  private readonly themeService = inject(ThemeService, { optional: true });
  private readonly injector = inject(Injector);
  private readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('strobeCanvas');

  private ctx: CanvasRenderingContext2D | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private cssWidth = 320;
  private cssHeight = 96;
  private dpr = 1;

  private palette: CachedStrobePalette = {
    brandColor: '#10b981',
    activePitchColor: '#38bdf8',
    idleColor: '#475569',
    inTuneDarkColor: 'rgba(16, 185, 129, 0.12)',
    normalDarkColor: 'rgba(15, 23, 42, 0.4)',
  };

  private animHandle: number | null = null;
  private lastTime = 0;
  private phase1 = 0;
  private phase2 = 0;
  private phase3 = 0;

  private readonly visibilityListener = (): void => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      this.stopLoop();
    } else {
      this.scheduleWakeup();
    }
  };

  ngAfterViewInit(): void {
    this.initCanvas();
    this.resolveThemePalette();

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.visibilityListener);
    }

    effect(
      () => {
        this.themeService?.isDark();
        this.resolveThemePalette();
        this.drawFrame(0);
      },
      { injector: this.injector },
    );

    effect(
      () => {
        this.reading();
        this.isInTune();
        this.scheduleWakeup();
      },
      { injector: this.injector },
    );
  }

  ngOnDestroy(): void {
    this.stopLoop();
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityListener);
    }
  }

  private initCanvas(): void {
    const canvas = this.canvasRef()?.nativeElement;
    if (!canvas) return;

    this.ctx = canvas.getContext('2d');
    this.updateCanvasSize(canvas);

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        this.updateCanvasSize(canvas);
        this.drawFrame(0);
      });
      this.resizeObserver.observe(canvas);
    }
  }

  private updateCanvasSize(canvas: HTMLCanvasElement): void {
    const rect = canvas.getBoundingClientRect();
    const width = rect.width > 0 ? rect.width : 320;
    const height = rect.height > 0 ? rect.height : 96;
    const dpr =
      typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 3) : 1;

    this.cssWidth = width;
    this.cssHeight = height;
    this.dpr = dpr;

    const targetWidth = Math.round(width * dpr);
    const targetHeight = Math.round(height * dpr);

    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
    }

    if (this.ctx) {
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }

  private resolveThemePalette(): void {
    const canvas = this.canvasRef()?.nativeElement;
    if (!canvas || typeof getComputedStyle === 'undefined') {
      return;
    }

    const style = getComputedStyle(canvas);
    const brandColor = style.getPropertyValue('--pwa-brand-500').trim() || '#10b981';
    const activePitchColor = style.getPropertyValue('--pwa-brand-text').trim() || '#38bdf8';
    const idleColor = style.getPropertyValue('--pwa-slate-600').trim() || '#475569';

    this.palette = {
      brandColor,
      activePitchColor,
      idleColor,
      inTuneDarkColor: 'rgba(16, 185, 129, 0.12)',
      normalDarkColor: 'rgba(15, 23, 42, 0.4)',
    };
  }

  private isAnimationNeeded(): boolean {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      return false;
    }
    const r = this.reading();
    if (!r) {
      return false;
    }
    return Math.abs(r.cents) >= 0.8;
  }

  private scheduleWakeup(): void {
    this.drawFrame(0);
    if (this.isAnimationNeeded()) {
      this.startLoop();
    } else {
      this.stopLoop();
    }
  }

  private startLoop(): void {
    if (this.animHandle !== null || typeof requestAnimationFrame === 'undefined') {
      return;
    }
    this.lastTime = 0;
    const tick = (now: number) => {
      this.animHandle = null;
      if (!this.isAnimationNeeded()) {
        this.drawFrame(0);
        return;
      }

      const dt = this.lastTime === 0 ? 0 : Math.min(0.05, (now - this.lastTime) / 1000);
      this.lastTime = now;

      this.drawFrame(dt);
      this.animHandle = requestAnimationFrame(tick);
    };
    this.animHandle = requestAnimationFrame(tick);
  }

  private stopLoop(): void {
    if (this.animHandle !== null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.animHandle);
      this.animHandle = null;
    }
    this.lastTime = 0;
  }

  private drawFrame(dt: number): void {
    const ctx = this.ctx;
    if (!ctx) return;

    const r = this.reading();
    const inTune = this.isInTune();

    const speed = r && Math.abs(r.cents) >= 0.8 ? r.cents * 3.5 : 0;
    if (dt > 0 && speed !== 0) {
      this.phase1 = (this.phase1 + speed * dt * 1.0) % 40;
      this.phase2 = (this.phase2 + speed * dt * 0.5) % 80;
      this.phase3 = (this.phase3 + speed * dt * 0.25) % 160;
    }

    const w = this.cssWidth;
    const h = this.cssHeight;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const { brandColor, activePitchColor, idleColor, inTuneDarkColor, normalDarkColor } =
      this.palette;
    const activeColor = inTune ? brandColor : r ? activePitchColor : idleColor;
    const darkColor = inTune ? inTuneDarkColor : normalDarkColor;

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
    width: number,
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
}
