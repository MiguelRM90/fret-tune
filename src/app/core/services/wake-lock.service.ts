import { Service, signal } from '@angular/core';

export interface WakeLockEnvironment {
  readonly requestWakeLock?: () => Promise<WakeLockSentinel>;
}

@Service()
export class WakeLockService {
  readonly isActive = signal<boolean>(false);
  readonly requestCount = signal<number>(0);

  private sentinel: WakeLockSentinel | null = null;
  private env: WakeLockEnvironment = {};

  private readonly releaseListener = (): void => {
    this.sentinel = null;
    this.isActive.set(false);
  };

  configureEnvironment(env: WakeLockEnvironment): void {
    this.env = env;
  }

  async request(): Promise<boolean> {
    if (this.sentinel && !(this.sentinel as { released?: boolean }).released) {
      return true;
    }

    const requestFn =
      this.env.requestWakeLock ??
      (typeof navigator !== 'undefined' && 'wakeLock' in navigator && navigator.wakeLock
        ? () => navigator.wakeLock.request('screen')
        : undefined);

    if (!requestFn) {
      return false;
    }

    try {
      this.requestCount.update((n) => n + 1);
      this.sentinel = await requestFn();
      this.sentinel.addEventListener('release', this.releaseListener);
      this.isActive.set(true);
      return true;
    } catch {
      this.sentinel = null;
      this.isActive.set(false);
      return false;
    }
  }

  release(): void {
    if (this.sentinel) {
      this.sentinel.removeEventListener('release', this.releaseListener);
      this.sentinel.release().catch(() => {});
      this.sentinel = null;
    }
    this.isActive.set(false);
  }
}
