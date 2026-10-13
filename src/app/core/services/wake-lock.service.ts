import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class WakeLockService {
  readonly isActive = signal<boolean>(false);

  private sentinel: WakeLockSentinel | null = null;
  private readonly releaseListener = () => {
    this.sentinel = null;
    this.isActive.set(false);
  };

  async request(): Promise<boolean> {
    if (this.sentinel) {
      return true;
    }

    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) {
      return false;
    }

    try {
      this.sentinel = await navigator.wakeLock.request('screen');
      this.sentinel.addEventListener('release', this.releaseListener);
      this.isActive.set(true);
      return true;
    } catch {
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

