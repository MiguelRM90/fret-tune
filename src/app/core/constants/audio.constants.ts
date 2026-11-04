export const DETECTION_TUNING = {
  minRms: 0.006,
  minClarity: 0.82,
  peakThreshold: 0.9,
} as const;

export const SMOOTHING = {
  historySize: 5,
  historyWindowMs: 24,
  smoothingFactor: 0.35,
  tauMs: 70,
  jumpSemitones: 0.6,
  jumpConfirmFrames: 3,
  holdMs: 650,
} as const;

export const DEFAULT_HOP_SIZE = 1024;

export const IN_TUNE_LOCK_MS = 450;

export const IN_TUNE_HYSTERESIS_FACTOR = 1.25;

export const DISPLAY_RANGE_CENTS = 50;

export const REFERENCE_TONE_DURATION_MS = 2400;

export const REFERENCE_TONE_GATE_TAIL_MS = 150;

export const BACKGROUND_MIC_RELEASE_MS = 30_000;
