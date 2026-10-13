import { OnDestroy, Service, inject, signal } from '@angular/core';
import { McLeodPitchDetector, PitchSmoother } from '../audio';
import { DETECTION_TUNING, SMOOTHING } from '../constants';
import { FrequencyRange, PitchEstimate } from '../models';
import { AudioInputService } from './audio-input.service';

@Service()
export class PitchDetectionService implements OnDestroy {
  private readonly audioInput = inject(AudioInputService);

  readonly latestEstimate = signal<PitchEstimate | null>(null);
  readonly smoothedFrequency = signal<number | null>(null);

  private smoother = new PitchSmoother(SMOOTHING);
  private fallbackDetector = new McLeodPitchDetector(DETECTION_TUNING);
  private worker: Worker | null = null;
  private workerBusy = false;
  private sampleBuffer = new Float32Array(0);
  private loopHandle: number | null = null;

  constructor() {
    this.initWorker();
  }

  private initWorker(): void {
    if (typeof Worker !== 'undefined') {
      try {
        this.worker = new Worker(new URL('../audio/pitch-detection.worker', import.meta.url), {
          type: 'module',
        });
        this.worker.onmessage = ({ data }: MessageEvent<{ estimate: PitchEstimate | null }>) => {
          this.workerBusy = false;
          this.handleEstimate(data.estimate);
        };
        this.worker.onerror = () => {
          this.workerBusy = false;
        };
      } catch {
        this.worker = null;
      }
    }
  }

  start(range: FrequencyRange, frameSize: number): void {
    this.stop();
    this.audioInput.setFrameSize(frameSize);
    if (this.sampleBuffer.length !== frameSize) {
      this.sampleBuffer = new Float32Array(frameSize);
    }
    this.smoother.reset();

    const tick = () => {
      this.analyzeFrame(range);
      this.loopHandle = requestAnimationFrame(tick);
    };
    this.loopHandle = requestAnimationFrame(tick);
  }

  stop(): void {
    if (this.loopHandle !== null) {
      cancelAnimationFrame(this.loopHandle);
      this.loopHandle = null;
    }
    this.smoother.reset();
    this.latestEstimate.set(null);
    this.smoothedFrequency.set(null);
    this.workerBusy = false;
  }

  updateProfile(range: FrequencyRange, frameSize: number): void {
    this.audioInput.setFrameSize(frameSize);
    if (this.sampleBuffer.length !== frameSize) {
      this.sampleBuffer = new Float32Array(frameSize);
    }
  }

  private analyzeFrame(range: FrequencyRange): void {
    const hasData = this.audioInput.read(this.sampleBuffer);
    if (!hasData) {
      this.handleEstimate(null);
      return;
    }

    if (this.worker && !this.workerBusy) {
      this.workerBusy = true;
      const copy = new Float32Array(this.sampleBuffer);
      this.worker.postMessage(
        {
          samples: copy,
          sampleRate: this.audioInput.sampleRate,
          range,
        },
        [copy.buffer]
      );
    } else if (!this.worker) {
      const estimate = this.fallbackDetector.detect(this.sampleBuffer, this.audioInput.sampleRate, range);
      this.handleEstimate(estimate);
    }
  }

  private handleEstimate(estimate: PitchEstimate | null): void {
    this.latestEstimate.set(estimate);
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const smoothed = this.smoother.push(estimate ? estimate.frequency : null, now);
    this.smoothedFrequency.set(smoothed);
  }

  ngOnDestroy(): void {
    this.stop();
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }
}

