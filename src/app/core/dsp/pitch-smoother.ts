import { frequencyToMidi, median, midiToFrequency } from '../music/music-math';

export interface PitchSmootherOptions {
  readonly historySize: number;
  readonly historyWindowMs?: number;
  readonly smoothingFactor: number;
  readonly tauMs?: number;
  readonly jumpSemitones: number;
  readonly jumpConfirmFrames: number;
  readonly holdMs: number;
}

interface HistoryEntry {
  readonly midi: number;
  readonly timestamp: number;
}

const INTERNAL_REFERENCE = 440;

export class PitchSmoother {
  private history: HistoryEntry[] = [];
  private pendingJump: number[] = [];
  private smoothedMidi: number | null = null;
  private lastValidAt = 0;
  private lastSmoothAt: number | null = null;

  constructor(private readonly options: PitchSmootherOptions) {}

  push(frequency: number | null, timestamp: number): number | null {
    if (frequency === null || !Number.isFinite(frequency) || frequency <= 0) {
      return this.handleSilence(timestamp);
    }

    const dt = this.lastSmoothAt !== null ? Math.max(0, timestamp - this.lastSmoothAt) : 0;
    this.lastValidAt = timestamp;
    const midi = frequencyToMidi(frequency, INTERNAL_REFERENCE);

    if (this.isJump(midi)) {
      this.trackJump(midi, timestamp);
      return this.currentFrequency();
    }

    this.pendingJump = [];
    this.history.push({ midi, timestamp });

    const windowMs = this.options.historyWindowMs;
    if (windowMs !== undefined && dt > 0 && dt <= windowMs) {
      while (this.history.length > 1 && timestamp - this.history[0].timestamp > windowMs) {
        this.history.shift();
      }
    }
    while (this.history.length > this.options.historySize) {
      this.history.shift();
    }

    const target = median(this.history.map((entry) => entry.midi));
    if (this.smoothedMidi === null) {
      this.smoothedMidi = target;
    } else {
      const tauMs = this.options.tauMs ?? 70;
      const alpha = dt > 0 ? 1 - Math.exp(-dt / tauMs) : this.options.smoothingFactor;
      this.smoothedMidi = this.smoothedMidi + alpha * (target - this.smoothedMidi);
    }
    this.lastSmoothAt = timestamp;
    return this.currentFrequency();
  }

  reset(): void {
    this.history = [];
    this.pendingJump = [];
    this.smoothedMidi = null;
    this.lastSmoothAt = null;
  }

  private handleSilence(timestamp: number): number | null {
    if (this.smoothedMidi !== null && timestamp - this.lastValidAt > this.options.holdMs) {
      this.reset();
    }
    return this.currentFrequency();
  }

  private isJump(midi: number): boolean {
    if (this.history.length === 0) {
      return false;
    }
    const currentMedian = median(this.history.map((entry) => entry.midi));
    return Math.abs(midi - currentMedian) > this.options.jumpSemitones;
  }

  private trackJump(midi: number, timestamp: number): void {
    const isConsistent =
      this.pendingJump.length === 0 || Math.abs(midi - median(this.pendingJump)) <= this.options.jumpSemitones / 2;
    this.pendingJump = isConsistent ? [...this.pendingJump, midi] : [midi];

    if (this.pendingJump.length < this.options.jumpConfirmFrames) {
      return;
    }

    this.history = this.pendingJump.map((value) => ({ midi: value, timestamp }));
    this.pendingJump = [];
    this.smoothedMidi = median(this.history.map((entry) => entry.midi));
    this.lastSmoothAt = timestamp;
  }

  private currentFrequency(): number | null {
    return this.smoothedMidi === null ? null : midiToFrequency(this.smoothedMidi, INTERNAL_REFERENCE);
  }
}

