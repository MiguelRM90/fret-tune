export type MicrophoneStatus = 'idle' | 'requesting' | 'active' | 'denied' | 'unsupported' | 'error';

export interface FrameSource {
  readonly sampleRate: number;
  readonly frameSize: number;
  read(target: Float32Array<ArrayBuffer>): boolean;
}

