import { frequencyToMidi, median, midiToFrequency } from './music-math';

export interface PitchSmootherOptions {
  readonly historySize: number;
  readonly smoothingFactor: number;
  readonly jumpSemitones: number;
  readonly jumpConfirmFrames: number;
  readonly holdMs: number;
}

const INTERNAL_REFERENCE = 440;

export class PitchSmoother {
  private history: number[] = [];
  private pendingJump: number[] = [];
  private smoothedMidi: number | null = null;
  private lastValidAt = 0;

  constructor(private readonly options: PitchSmootherOptions) {}

  push(frequency: number | null, timestamp: number): number | null {
    if (frequency === null || !Number.isFinite(frequency) || frequency <= 0) {
      return this.handleSilence(timestamp);
    }

    this.lastValidAt = timestamp;
    const midi = frequencyToMidi(frequency, INTERNAL_REFERENCE);

    if (this.isJump(midi)) {
      this.trackJump(midi);
      return this.currentFrequency();
    }

    this.pendingJump = [];
    this.history.push(midi);
    if (this.history.length > this.options.historySize) {
      this.history.shift();
    }

    const target = median(this.history);
    this.smoothedMidi =
      this.smoothedMidi === null ? target : this.smoothedMidi + this.options.smoothingFactor * (target - this.smoothedMidi);
    return this.currentFrequency();
  }

  reset(): void {
    this.history = [];
    this.pendingJump = [];
    this.smoothedMidi = null;
  }

  private handleSilence(timestamp: number): number | null {
    if (this.smoothedMidi !== null && timestamp - this.lastValidAt > this.options.holdMs) {
      this.reset();
    }
    return this.currentFrequency();
  }

  private isJump(midi: number): boolean {
    return this.history.length > 0 && Math.abs(midi - median(this.history)) > this.options.jumpSemitones;
  }

  private trackJump(midi: number): void {
    const isConsistent =
      this.pendingJump.length === 0 || Math.abs(midi - median(this.pendingJump)) <= this.options.jumpSemitones / 2;
    this.pendingJump = isConsistent ? [...this.pendingJump, midi] : [midi];

    if (this.pendingJump.length < this.options.jumpConfirmFrames) {
      return;
    }

    this.history = [...this.pendingJump];
    this.pendingJump = [];
    this.smoothedMidi = median(this.history);
  }

  private currentFrequency(): number | null {
    return this.smoothedMidi === null ? null : midiToFrequency(this.smoothedMidi, INTERNAL_REFERENCE);
  }
}
