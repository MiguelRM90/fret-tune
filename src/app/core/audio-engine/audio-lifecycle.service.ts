import { OnDestroy, ProviderToken, Service, inject } from '@angular/core';
import { AudioEngine } from './audio-engine.service';

function tryInject<T>(token: ProviderToken<T>): T | null {
  try {
    return inject(token, { optional: true });
  } catch {
    return null;
  }
}

@Service()
export class AudioLifecycleService implements OnDestroy {
  private audioEngine = tryInject(AudioEngine) ?? new AudioEngine();
  private onForegroundResumeCallback: (() => void) | null = null;

  private readonly visibilityListener = (): void => {
    if (typeof document !== 'undefined') {
      void this.handleVisibilityChange(document.visibilityState);
    }
  };

  private readonly deviceChangeListener = (): void => {
    this.audioEngine.handleDeviceChange();
  };

  constructor() {
    this.registerBrowserListeners();
    void this.audioEngine.checkMicrophonePermission();
  }

  bindEngine(engine: AudioEngine): void {
    this.audioEngine = engine;
    void this.audioEngine.checkMicrophonePermission();
  }

  onForegroundResume(callback: (() => void) | null): void {
    this.onForegroundResumeCallback = callback;
  }

  async handleVisibilityChange(state: DocumentVisibilityState): Promise<void> {
    if (state === 'hidden') {
      await this.audioEngine.suspendForBackground();
    } else if (state === 'visible') {
      const status = this.audioEngine.status();
      if (status === 'suspended') {
        const resumed = await this.audioEngine.resumeFromSuspension();
        if (resumed) {
          this.onForegroundResumeCallback?.();
        }
      } else if (status === 'active') {
        this.onForegroundResumeCallback?.();
      }
    }
  }

  ngOnDestroy(): void {
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityListener);
    }
    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.removeEventListener) {
      navigator.mediaDevices.removeEventListener('devicechange', this.deviceChangeListener);
    }
  }

  private registerBrowserListeners(): void {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.visibilityListener);
    }
    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', this.deviceChangeListener);
    }
  }
}
