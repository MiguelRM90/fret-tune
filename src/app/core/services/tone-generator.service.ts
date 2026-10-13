import { OnDestroy, Service, signal } from '@angular/core';
import { REFERENCE_TONE_DURATION_MS } from '../constants';

@Service()
export class ToneGeneratorService implements OnDestroy {
  readonly isPlaying = signal<boolean>(false);
  readonly playingMidi = signal<number | null>(null);

  private audioContext: AudioContext | null = null;
  private currentOscillator: OscillatorNode | null = null;
  private currentGain: GainNode | null = null;
  private stopTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnDestroy(): void {
    this.stop();
    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
  }

  play(frequency: number, midi?: number, durationMs = REFERENCE_TONE_DURATION_MS): void {
    this.stop();

    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!this.audioContext) {
        this.audioContext = new AudioCtx();
      }

      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }

      const ctx = this.audioContext;
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
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(stopTime + 0.05);

      this.currentOscillator = osc;
      this.currentGain = gain;
      this.isPlaying.set(true);
      if (midi !== undefined) {
        this.playingMidi.set(midi);
      }

      this.stopTimer = setTimeout(() => {
        this.isPlaying.set(false);
        this.playingMidi.set(null);
      }, durationMs);
    } catch {
      this.stop();
    }
  }

  stop(): void {
    if (this.stopTimer) {
      clearTimeout(this.stopTimer);
      this.stopTimer = null;
    }

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

    this.isPlaying.set(false);
    this.playingMidi.set(null);
  }
}

