import { AnalysisProfile } from './instrument.model';
import { DetectorStrategyId, PitchEstimate, PitchFrame } from './pitch.model';

export type MicrophoneStatus =
  | 'idle'
  | 'requesting'
  | 'active'
  | 'suspended'
  | 'interrupted'
  | 'denied'
  | 'unsupported'
  | 'error';

export type ReadonlySignalLike<T> = () => T;

export interface FrameSource {
  readonly sampleRate: number;
  readonly frameSize: number;
  read(target: Float32Array): boolean;
}

export interface PitchSource {
  readonly pitchFrame: ReadonlySignalLike<PitchFrame | null>;
  readonly latestEstimate: ReadonlySignalLike<PitchEstimate | null>;
  readonly smoothedFrequency: ReadonlySignalLike<number | null>;
  readonly analysisCount: ReadonlySignalLike<number>;
  start(profile: AnalysisProfile, detector?: DetectorStrategyId): void;
  stop(): void;
  updateProfile(profile: AnalysisProfile): void;
  setDetector(detector: DetectorStrategyId): void;
  setGate(gated: boolean): void;
  onFrame?(listener: (frame: PitchFrame | null) => void): () => void;
}

export interface AudioOutput {
  readonly isPlaying: ReadonlySignalLike<boolean>;
  readonly playingMidi: ReadonlySignalLike<number | null>;
  readonly isGated: ReadonlySignalLike<boolean>;
  play(frequency: number, midi?: number, durationMs?: number): void;
  stop(): void;
}
