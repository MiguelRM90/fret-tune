import { Service, signal } from '@angular/core';
import { FrameSource, MicrophoneStatus } from '../models';

@Service()
export class AudioInputService implements FrameSource {
  readonly status = signal<MicrophoneStatus>('idle');
  readonly errorMessage = signal<string | null>(null);

  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private muteGainNode: GainNode | null = null;
  private currentFrameSize = 4096;
  private ringBuffer = new Float32Array(0);
  private writePointer = 0;

  get sampleRate(): number {
    return this.audioContext?.sampleRate ?? 44100;
  }

  get frameSize(): number {
    return this.currentFrameSize;
  }

  setFrameSize(size: number): void {
    if (size !== this.currentFrameSize || this.ringBuffer.length !== size) {
      this.currentFrameSize = size;
      this.ringBuffer = new Float32Array(size);
      this.writePointer = 0;
    }
  }

  async start(): Promise<boolean> {
    if (this.status() === 'active') {
      return true;
    }

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof window === 'undefined') {
      this.status.set('unsupported');
      this.errorMessage.set('Microphone access is not supported by this browser.');
      return false;
    }

    this.status.set('requesting');
    this.errorMessage.set(null);

    let context: AudioContext | null = null;

    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      context = new AudioCtx();

      if (!context.audioWorklet) {
        this.status.set('unsupported');
        this.errorMessage.set('AudioWorklet is not supported by this browser.');
        context.close().catch(() => {});
        return false;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });

      if (context.state === 'suspended') {
        await context.resume();
      }

      const processorUrl = typeof document !== 'undefined'
        ? new URL('audio-input-processor.js', document.baseURI).href
        : 'audio-input-processor.js';

      await context.audioWorklet.addModule(processorUrl);

      this.audioContext = context;
      this.mediaStream = stream;
      this.setFrameSize(this.currentFrameSize);

      const source = context.createMediaStreamSource(stream);
      const worklet = new AudioWorkletNode(context, 'audio-input-processor');

      worklet.port.onmessage = (event: MessageEvent<Float32Array>) => {
        this.appendSamples(event.data);
      };

      const muteGain = context.createGain();
      muteGain.gain.setValueAtTime(0, context.currentTime);

      source.connect(worklet);
      worklet.connect(muteGain);
      muteGain.connect(context.destination);

      this.sourceNode = source;
      this.workletNode = worklet;
      this.muteGainNode = muteGain;
      this.status.set('active');
      return true;
    } catch (err) {
      if (context) {
        context.close().catch(() => {});
      }
      const isDenied = err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError');
      this.status.set(isDenied ? 'denied' : 'error');
      this.errorMessage.set(isDenied ? 'Microphone permission was denied.' : 'Unable to access microphone.');
      return false;
    }
  }

  stop(): void {
    if (this.workletNode) {
      this.workletNode.port.onmessage = null;
      this.workletNode.disconnect();
      this.workletNode = null;
    }

    if (this.muteGainNode) {
      this.muteGainNode.disconnect();
      this.muteGainNode = null;
    }

    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }

    if (this.mediaStream) {
      for (const track of this.mediaStream.getTracks()) {
        track.stop();
      }
      this.mediaStream = null;
    }

    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }

    this.ringBuffer = new Float32Array(0);
    this.writePointer = 0;
    this.status.set('idle');
  }

  read(target: Float32Array<ArrayBuffer>): boolean {
    if (this.status() !== 'active' || this.ringBuffer.length === 0) {
      return false;
    }

    const len = Math.min(target.length, this.ringBuffer.length);
    const start = (this.writePointer - len + this.ringBuffer.length) % this.ringBuffer.length;

    for (let i = 0; i < len; i++) {
      target[i] = this.ringBuffer[(start + i) % this.ringBuffer.length];
    }
    return true;
  }

  private appendSamples(samples: Float32Array): void {
    const bufferLen = this.ringBuffer.length;
    if (bufferLen === 0) return;

    for (let i = 0; i < samples.length; i++) {
      this.ringBuffer[this.writePointer] = samples[i];
      this.writePointer = (this.writePointer + 1) % bufferLen;
    }
  }
}

