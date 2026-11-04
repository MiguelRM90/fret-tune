import { Injector, OnDestroy, Service, Signal, effect, inject } from '@angular/core';
import { HapticsService } from './haptics.service';
import { SettingsStore } from './settings.store';
import { WakeLockService } from './wake-lock.service';

export interface SessionEffectsBindings {
  readonly isListening: Signal<boolean>;
  readonly justLocked: Signal<boolean>;
}

@Service()
export class SessionEffectsService implements OnDestroy {
  private readonly haptics = inject(HapticsService);
  private readonly wakeLock = inject(WakeLockService);
  private readonly settingsStore = inject(SettingsStore);
  private readonly injector = inject(Injector, { optional: true });

  private currentBindings: SessionEffectsBindings | null = null;
  private sessionListening = false;

  private readonly visibilityListener = (): void => {
    if (typeof document !== 'undefined') {
      void this.handleVisibilityChange(document.visibilityState);
    }
  };

  constructor() {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.visibilityListener);
    }
  }

  bind(bindings: SessionEffectsBindings): void {
    this.currentBindings = bindings;
    if (!this.injector) {
      return;
    }

    try {
      effect(
        () => {
          if (bindings.justLocked() && this.settingsStore.hapticsEnabled()) {
            this.haptics.inTuneSuccess();
          }
        },
        { injector: this.injector },
      );

      effect(
        () => {
          const listening = bindings.isListening();
          const keepAwake = this.settingsStore.keepAwake();
          if (listening && keepAwake) {
            void this.wakeLock.request();
          } else if (!listening && !this.sessionListening) {
            this.wakeLock.release();
          }
        },
        { injector: this.injector },
      );
    } catch {}
  }

  async handleVisibilityChange(state: DocumentVisibilityState): Promise<boolean> {
    if (state === 'hidden') {
      this.wakeLock.release();
      return false;
    }
    if (
      state === 'visible' &&
      (this.currentBindings?.isListening() || this.sessionListening) &&
      this.settingsStore.keepAwake()
    ) {
      return this.wakeLock.request();
    }
    return false;
  }

  notifyStartListening(): void {
    this.sessionListening = true;
    if (this.settingsStore.keepAwake()) {
      void this.wakeLock.request();
    }
  }

  notifyStopListening(): void {
    this.sessionListening = false;
    this.wakeLock.release();
  }

  notifyJustLocked(): void {
    if (this.settingsStore.hapticsEnabled()) {
      this.haptics.inTuneSuccess();
    }
  }

  ngOnDestroy(): void {
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityListener);
    }
    this.sessionListening = false;
    this.wakeLock.release();
  }
}
