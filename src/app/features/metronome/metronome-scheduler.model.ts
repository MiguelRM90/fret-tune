import { AudioEngine, AudioScheduler, AudioSchedulerOptions } from '@core/audio-engine';

export interface MetronomeTimeSignature {
  readonly beatsPerBar: number;
  readonly beatUnit: 4 | 8;
}

export interface ScheduledBeat {
  readonly beatIndex: number;
  readonly isAccent: boolean;
  readonly scheduledTimeSec: number;
}

export interface MetronomeConfig {
  readonly bpm: number;
  readonly timeSignature: MetronomeTimeSignature;
}

export const DEFAULT_METRONOME_SCHEDULER_OPTIONS: Required<AudioSchedulerOptions> = {
  lookaheadMs: 25,
  scheduleHorizonSec: 0.1,
};

export interface MetronomeSchedulerContract {
  readonly isRunning: boolean;
  readonly config: MetronomeConfig;
  start(engine: AudioEngine, onBeat: (beat: ScheduledBeat) => void): AudioScheduler;
  stop(): void;
  setBpm(bpm: number): void;
  setTimeSignature(signature: MetronomeTimeSignature): void;
}

