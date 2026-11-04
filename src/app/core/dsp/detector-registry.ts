import { DETECTION_TUNING } from '../constants/audio.constants';
import { DetectorStrategyId, PitchDetector } from '../models';
import { McLeodOptions, McLeodPitchDetector } from './mcleod-pitch-detector';
import { YinPitchDetector } from './yin-pitch-detector';

export const DETECTOR_STRATEGIES: readonly DetectorStrategyId[] = ['mpm-fft', 'yin'] as const;

export function isDetectorStrategyId(value: unknown): value is DetectorStrategyId {
  return value === 'mpm-fft' || value === 'yin';
}

export class DetectorRegistry {
  private readonly instances = new Map<DetectorStrategyId, PitchDetector>();

  constructor(private readonly options: McLeodOptions = DETECTION_TUNING) {}

  get(strategy: DetectorStrategyId): PitchDetector {
    let detector = this.instances.get(strategy);
    if (!detector) {
      detector = strategy === 'yin' ? new YinPitchDetector(this.options) : new McLeodPitchDetector(this.options);
      this.instances.set(strategy, detector);
    }
    return detector;
  }
}

