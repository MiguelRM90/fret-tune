import { OnDestroy, ProviderToken, Service, inject, signal } from '@angular/core';
import { REFERENCE_TONE_DURATION_MS, REFERENCE_TONE_GATE_TAIL_MS } from '../constants';
import { AudioOutput } from '../models';
import { AudioEngine } from './audio-engine.service';

function tryInject<T>(token: ProviderToken<T>): T | null {
  try {
    return inject(token, { optional: true });
  } catch {
    return null;
  }
}

@Service()
export class ToneGeneratorService implements AudioOutput, OnDestroy {
  private readonly audioEngine = tryInject(AudioEngine);

  readonly isPlaying = signal<boolean>(false);
  readonly playingMidi = signal<number | null>(null);
  readonly isGated = signal<boolean>(false);

  private currentOscillator: OscillatorNode | null = null;
  private currentGain: GainNode | null = null;
  private stopTimer: ReturnType<typeof setTimeout> | null = null;
  private gateTailTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnDestroy(): void {
    this.stop(false);
  }

  play(frequency: number, midi?: number, durationMs = REFERENCE_TONE_DURATION_MS): void {
    this.stop(false);

    this.isPlaying.set(true);
    this.isGated.set(true);
    if (midi !== undefined) {
      this.playingMidi.set(midi);
    }

    try {
      const output = this.audioEngine?.createToneOutput() ?? null;
      if (output) {
        const { context: ctx, destination } = output;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(frequency, ctx.currentTime);

        const now = ctx.currentTime;
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.3, now + 0.05);

        const stopTime = now + durationMs / 1000;
        gain.gain.exponentialRampToValueAtTime(0.0001, stopTime);

        osc.connect(gain);
        gain.connect(destination);

        osc.start(now);
        osc.stop(stopTime + 0.05);

        this.currentOscillator = osc;
        this.currentGain = gain;
      }

      this.stopTimer = setTimeout(() => {
        this.stopTimer = null;
        this.cleanupNodes();
        this.isPlaying.set(false);
        this.playingMidi.set(null);
        this.audioEngine?.releaseToneOutput();
        this.scheduleGateRelease();
      }, durationMs);
    } catch {
      this.stop(false);
    }
  }

  stop(withTail = true): void {
    if (this.stopTimer !== null) {
      clearTimeout(this.stopTimer);
      this.stopTimer = null;
    }

    const wasPlaying = this.isPlaying();
    this.cleanupNodes();
    this.isPlaying.set(false);
    this.playingMidi.set(null);
    this.audioEngine?.releaseToneOutput();

    if (wasPlaying && withTail) {
      this.scheduleGateRelease();
    } else {
      this.clearGateTailTimer();
      this.isGated.set(false);
    }
  }

  private scheduleGateRelease(): void {
    this.clearGateTailTimer();
    this.isGated.set(true);
    this.gateTailTimer = setTimeout(() => {
      this.gateTailTimer = null;
      this.isGated.set(false);
    }, REFERENCE_TONE_GATE_TAIL_MS);
  }

  private clearGateTailTimer(): void {
    if (this.gateTailTimer !== null) {
      clearTimeout(this.gateTailTimer);
      this.gateTailTimer = null;
    }
  }

  private cleanupNodes(): void {
    if (this.currentOscillator) {
      try {
        this.currentOscillator.stop();
        this.currentOscillator.disconnect();
      } catch {}
      this.currentOscillator = null;
    }

    if (this.currentGain) {
      try {
        this.currentGain.disconnect();
      } catch {}
      this.currentGain = null;
    }
  }
}
