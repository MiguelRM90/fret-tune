import { OnDestroy, Service, inject } from '@angular/core';
import { FrameSource, MicrophoneStatus } from '../models';
import { AudioEngine } from './audio-engine.service';

@Service()
export class AudioInputService implements FrameSource, OnDestroy {
  private readonly engine = inject(AudioEngine, { optional: true }) ?? new AudioEngine();
  private currentFrameSize = 4096;

  readonly status = this.engine.status;
  readonly errorMessage = this.engine.errorMessage;

  get sampleRate(): number {
    return this.engine.sampleRate;
  }

  get frameSize(): number {
    return this.currentFrameSize;
  }

  setFrameSize(size: number): void {
    this.currentFrameSize = size;
  }

  start(): Promise<boolean> {
    return this.engine.start();
  }

  stop(): void {
    this.engine.stop();
  }

  read(_target: Float32Array): boolean {
    return (this.status() as MicrophoneStatus) === 'active';
  }

  ngOnDestroy(): void {
    this.stop();
  }
}

