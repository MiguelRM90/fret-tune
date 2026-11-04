import { signal } from '@angular/core';
import { AnalysisProfile, DetectorStrategyId, PitchEstimate, PitchFrame, PitchSource } from '../models';
import { GUITAR_INSTRUMENT } from '../music/instruments';

export class FakePitchSource implements PitchSource {
  readonly pitchFrame = signal<PitchFrame | null>(null);
  readonly latestEstimate = signal<PitchEstimate | null>(null);
  readonly smoothedFrequency = signal<number | null>(null);
  readonly analysisCount = signal<number>(0);

  activeProfile: AnalysisProfile = GUITAR_INSTRUMENT.analysis;
  activeDetector: DetectorStrategyId = 'mpm-fft';
  isStarted = false;
  isGated = false;

  private readonly frameListeners: Array<(frame: PitchFrame | null) => void> = [];

  onFrame(listener: (frame: PitchFrame | null) => void): () => void {
    this.frameListeners.push(listener);
    return () => {
      const idx = this.frameListeners.indexOf(listener);
      if (idx >= 0) this.frameListeners.splice(idx, 1);
    };
  }

  start(profile: AnalysisProfile, detector: DetectorStrategyId = 'mpm-fft'): void {
    this.activeProfile = profile;
    this.activeDetector = detector;
    this.isStarted = true;
    this.clear();
  }

  stop(): void {
    this.isStarted = false;
    this.clear();
  }

  updateProfile(profile: AnalysisProfile): void {
    this.activeProfile = profile;
    this.clear();
  }

  setDetector(detector: DetectorStrategyId): void {
    this.activeDetector = detector;
  }

  setGate(gated: boolean): void {
    this.isGated = gated;
    if (gated) {
      this.clear();
    }
  }

  emitFrequency(frequency: number | null, timestampMs = 0, clarity = 0.99, rms = 0.1): void {
    if (this.isGated) {
      return;
    }
    const estimate: PitchEstimate | null =
      frequency !== null ? { frequency, clarity, rms } : null;
    const frame: PitchFrame = {
      estimate,
      smoothedFrequency: frequency,
      timestamp: timestampMs,
      currentFrame: Math.round((timestampMs / 1000) * 48000),
    };
    this.emitFrame(frame);
  }

  emitFrame(frame: PitchFrame): void {
    if (this.isGated) {
      return;
    }
    this.analysisCount.update((c) => c + 1);
    this.pitchFrame.set(frame);
    this.latestEstimate.set(frame.estimate);
    this.smoothedFrequency.set(frame.smoothedFrequency);
    for (const listener of this.frameListeners) {
      listener(frame);
    }
  }

  private clear(): void {
    this.pitchFrame.set(null);
    this.latestEstimate.set(null);
    this.smoothedFrequency.set(null);
    for (const listener of this.frameListeners) {
      listener(null);
    }
  }
}
