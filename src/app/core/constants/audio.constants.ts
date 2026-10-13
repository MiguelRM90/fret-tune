export const DETECTION_TUNING = {
  minRms: 0.006,
  minClarity: 0.82,
  peakThreshold: 0.9,
} as const;

export const SMOOTHING = {
  historySize: 5,
  smoothingFactor: 0.35,
  jumpSemitones: 0.6,
  jumpConfirmFrames: 3,
  holdMs: 650,
} as const;

export const IN_TUNE_LOCK_MS = 450;

export const DISPLAY_RANGE_CENTS = 50;

export const REFERENCE_TONE_DURATION_MS = 2400;

