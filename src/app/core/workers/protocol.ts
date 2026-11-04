import { AnalysisProfile, DetectorStrategyId, PitchFrame } from '../models';

export const CAPTURE_WORKLET_NAME = 'audio-input-processor';

export const CAPTURE_WORKLET_PATH = 'worklets/capture.worklet.js';

export const WORKLET_BLOCK_SIZE = 512;

export const WORKLET_POOL_SIZE = 16;

export type WorkletInboundMessage =
  | { readonly type: 'attach-port'; readonly port: MessagePort }
  | { readonly type: 'recycle'; readonly buffer: ArrayBuffer };

export interface WorkletSamplesMessage {
  readonly type: 'samples';
  readonly samples: Float32Array;
  readonly currentFrame: number;
  readonly sampleRate: number;
}

export type WorkletOutboundMessage = WorkletSamplesMessage;

export type DspCommand =
  | { readonly type: 'attach-port'; readonly port: MessagePort; readonly sampleRate: number }
  | {
      readonly type: 'configure';
      readonly profile: AnalysisProfile;
      readonly sampleRate?: number;
      readonly detector?: DetectorStrategyId;
    }
  | { readonly type: 'gate'; readonly gated: boolean }
  | { readonly type: 'pause'; readonly paused: boolean }
  | { readonly type: 'reset' }
  | {
      readonly type: 'analyze';
      readonly samples: Float32Array;
      readonly sampleRate: number;
      readonly currentFrame: number;
    };

export type DspEvent =
  | { readonly type: 'pitch'; readonly frame: PitchFrame }
  | { readonly type: 'error'; readonly message: string };

