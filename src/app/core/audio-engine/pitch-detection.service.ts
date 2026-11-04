import { OnDestroy, ProviderToken, Service, inject, signal } from '@angular/core';
import { AnalysisProfile, DetectorStrategyId, PitchEstimate, PitchFrame, PitchSource } from '../models';
import { GUITAR_INSTRUMENT } from '../music/instruments';
import { DspCommand, DspEvent, DspWorkerEngine } from '../workers';
import { AudioEngine } from './audio-engine.service';

function tryInject<T>(token: ProviderToken<T>): T | null {
  try {
    return inject(token, { optional: true });
  } catch {
    return null;
  }
}

@Service()
export class PitchDetectionService implements PitchSource, OnDestroy {
  private readonly audioEngine = tryInject(AudioEngine);

  readonly pitchFrame = signal<PitchFrame | null>(null);
  readonly latestEstimate = signal<PitchEstimate | null>(null);
  readonly smoothedFrequency = signal<number | null>(null);
  readonly analysisCount = signal<number>(0);

  private activeProfile: AnalysisProfile = GUITAR_INSTRUMENT.analysis;
  private activeDetector: DetectorStrategyId = 'mpm-fft';
  private gated = false;

  private worker: Worker | null = null;
  private readonly fallbackEngine = new DspWorkerEngine();
  private readonly frameListeners: Array<(frame: PitchFrame | null) => void> = [];

  constructor() {
    this.initWorker();
    this.audioEngine?.onPauseStateChange((paused) => {
      this.sendCommand({ type: 'pause', paused });
      if (paused) {
        this.clearOutputs();
      }
    });
  }

  get currentProfile(): AnalysisProfile {
    return this.activeProfile;
  }

  get currentDetector(): DetectorStrategyId {
    return this.activeDetector;
  }

  onFrame(listener: (frame: PitchFrame | null) => void): () => void {
    this.frameListeners.push(listener);
    return () => {
      const idx = this.frameListeners.indexOf(listener);
      if (idx >= 0) this.frameListeners.splice(idx, 1);
    };
  }

  start(profile: AnalysisProfile, detector: DetectorStrategyId = this.activeDetector): void {
    this.activeProfile = profile;
    this.activeDetector = detector;
    this.clearOutputs();

    const sampleRate = this.audioEngine?.sampleRate ?? 48000;
    this.sendCommand({
      type: 'configure',
      profile: this.activeProfile,
      sampleRate,
      detector: this.activeDetector,
    });
    this.sendCommand({ type: 'reset' });

    if (
      this.worker &&
      this.audioEngine &&
      !this.audioEngine.hasAttachedCapturePort &&
      typeof MessageChannel !== 'undefined'
    ) {
      const channel = new MessageChannel();
      this.audioEngine.attachCapturePort(channel.port1);
      this.worker.postMessage(
        {
          type: 'attach-port',
          port: channel.port2,
          sampleRate,
        } satisfies DspCommand,
        [channel.port2],
      );
    }
  }

  stop(): void {
    this.sendCommand({ type: 'reset' });
    this.clearOutputs();
  }

  updateProfile(profile: AnalysisProfile): void {
    this.activeProfile = profile;
    this.clearOutputs();
    this.sendCommand({
      type: 'configure',
      profile: this.activeProfile,
      sampleRate: this.audioEngine?.sampleRate ?? 48000,
      detector: this.activeDetector,
    });
  }

  setDetector(detector: DetectorStrategyId): void {
    this.activeDetector = detector;
    this.sendCommand({
      type: 'configure',
      profile: this.activeProfile,
      sampleRate: this.audioEngine?.sampleRate ?? 48000,
      detector: this.activeDetector,
    });
  }

  setGate(gated: boolean): void {
    if (this.gated === gated) {
      return;
    }
    this.gated = gated;
    this.sendCommand({ type: 'gate', gated });
    if (gated) {
      this.clearOutputs();
    }
  }

  pushSamplesForTest(samples: Float32Array, currentFrame: number, sampleRate = 48000): void {
    const events = this.fallbackEngine.pushSamples(samples, currentFrame, sampleRate);
    for (const event of events) {
      this.handleWorkerEvent(event);
    }
  }

  analyzeFrameForTest(samples: Float32Array, sampleRate = 48000, currentFrame = samples.length): void {
    const event = this.fallbackEngine.handleCommand({
      type: 'analyze',
      samples,
      sampleRate,
      currentFrame,
    });
    if (event) {
      this.handleWorkerEvent(event);
    }
  }

  ngOnDestroy(): void {
    this.stop();
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }

  private initWorker(): void {
    if (typeof Worker !== 'undefined') {
      try {
        this.worker = new Worker(new URL('../workers/pitch-detection.worker', import.meta.url), {
          type: 'module',
        });
        this.worker.onmessage = ({ data }: MessageEvent<DspEvent>) => {
          this.handleWorkerEvent(data);
        };
      } catch {
        this.worker = null;
      }
    }
  }

  private sendCommand(command: DspCommand): void {
    const syncEvent = this.fallbackEngine.handleCommand(command);
    if (this.worker) {
      this.worker.postMessage(command);
    } else if (syncEvent) {
      this.handleWorkerEvent(syncEvent);
    }
  }

  private handleWorkerEvent(event: DspEvent): void {
    if (event.type === 'pitch') {
      this.analysisCount.update((count) => count + 1);
      if (this.gated) {
        this.clearOutputs();
        return;
      }
      this.pitchFrame.set(event.frame);
      this.latestEstimate.set(event.frame.estimate);
      this.smoothedFrequency.set(event.frame.smoothedFrequency);
      this.notifyFrameListeners(event.frame);
    }
  }

  private clearOutputs(): void {
    this.pitchFrame.set(null);
    this.latestEstimate.set(null);
    this.smoothedFrequency.set(null);
    this.notifyFrameListeners(null);
  }

  private notifyFrameListeners(frame: PitchFrame | null): void {
    for (const listener of this.frameListeners) {
      listener(frame);
    }
  }
}
