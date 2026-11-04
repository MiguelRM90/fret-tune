import { IN_TUNE_HYSTERESIS_FACTOR, IN_TUNE_LOCK_MS } from '../constants/audio.constants';
import { TunerReading } from '../models';

export interface InTuneDetectorOptions {
  readonly lockDurationMs?: number;
  readonly releaseHysteresisFactor?: number;
}

export interface InTuneState {
  readonly isInTune: boolean;
  readonly lockedStringIndex: number | null;
  readonly justLocked: boolean;
}

const IDLE_STATE: InTuneState = {
  isInTune: false,
  lockedStringIndex: null,
  justLocked: false,
};

export class InTuneDetector {
  private readonly lockDurationMs: number;
  private readonly releaseHysteresisFactor: number;

  private inTuneSince: number | null = null;
  private locked = false;
  private activeTargetMidi: number | null = null;

  constructor(options: InTuneDetectorOptions = {}) {
    this.lockDurationMs = options.lockDurationMs ?? IN_TUNE_LOCK_MS;
    this.releaseHysteresisFactor = options.releaseHysteresisFactor ?? IN_TUNE_HYSTERESIS_FACTOR;
  }

  push(reading: TunerReading | null, timestampMs: number, toleranceCents = 5): InTuneState {
    if (!reading) {
      this.reset();
      return IDLE_STATE;
    }

    if (this.activeTargetMidi !== null && reading.targetMidi !== this.activeTargetMidi) {
      this.reset();
    }

    const absCents = Math.abs(reading.cents);
    const effectiveTolerance = this.locked
      ? toleranceCents * this.releaseHysteresisFactor
      : toleranceCents;
    const withinWindow = reading.direction === 'in-tune' || absCents <= effectiveTolerance;

    if (!withinWindow) {
      this.reset();
      return IDLE_STATE;
    }

    this.activeTargetMidi = reading.targetMidi;
    if (this.inTuneSince === null) {
      this.inTuneSince = timestampMs;
    }

    const elapsed = Math.max(0, timestampMs - this.inTuneSince);
    if (elapsed >= this.lockDurationMs) {
      const justLocked = !this.locked;
      this.locked = true;
      return {
        isInTune: true,
        lockedStringIndex: reading.stringIndex,
        justLocked,
      };
    }

    return IDLE_STATE;
  }

  reset(): void {
    this.inTuneSince = null;
    this.locked = false;
    this.activeTargetMidi = null;
  }
}

