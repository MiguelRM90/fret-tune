import { OnDestroy, ProviderToken, Service, inject, signal } from '@angular/core';
import { SwUpdate, UnrecoverableStateEvent, VersionEvent } from '@angular/service-worker';
import { PwaService, PwaToastService } from 'pwa-ui-core/services';
import { Observable, Subscription } from 'rxjs';
import { AudioEngine } from '../audio-engine';

export const SW_UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

/**
 * Emergency kill-switch note (SEC-08):
 * Angular emits `safety-worker.js` into `dist/fret-tune/browser/safety-worker.js`.
 * If a broken Service Worker build is ever deployed to GitHub Pages, replacing
 * `ngsw-worker.js` with `safety-worker.js` unregisters the SW and purges caches.
 */
export const SW_EMERGENCY_KILL_SWITCH_WORKER = 'safety-worker.js';

export interface SwUpdateLike {
  readonly isEnabled: boolean;
  readonly versionUpdates: Observable<VersionEvent>;
  readonly unrecoverable: Observable<UnrecoverableStateEvent>;
  checkForUpdate(): Promise<boolean>;
  activateUpdate(): Promise<boolean>;
}

export interface SwUpdateEnvironment {
  readonly swUpdate?: SwUpdateLike | null;
  readonly reload?: () => void;
  readonly clearCaches?: () => Promise<void>;
  readonly pollIntervalMs?: number;
}

function tryInject<T>(token: ProviderToken<T>): T | null {
  try {
    return inject(token, { optional: true });
  } catch {
    return null;
  }
}

@Service()
export class SwUpdateCoordinatorService implements OnDestroy {
  private audioEngine = tryInject(AudioEngine) ?? new AudioEngine();
  private readonly pwaService = tryInject(PwaService);
  private readonly toastService = tryInject(PwaToastService);
  private swUpdate: SwUpdateLike | null = tryInject(SwUpdate);

  readonly hasUpdate = signal<boolean>(false);
  readonly deferredReload = signal<boolean>(false);
  readonly unrecoverableReason = signal<string | null>(null);
  readonly checkCount = signal<number>(0);

  private env: SwUpdateEnvironment = {};
  private versionSub: Subscription | null = null;
  private unrecoverableSub: Subscription | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  private readonly visibilityListener = (): void => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      void this.handleVisibilityChange('visible');
    }
  };

  constructor() {
    this.interceptPwaServiceApplyUpdate();
    this.initSubscriptions();
    this.registerBrowserListeners();
  }

  bindAudioEngine(engine: AudioEngine): void {
    this.audioEngine = engine;
  }

  configureEnvironment(env: SwUpdateEnvironment): void {
    this.teardownSubscriptions();
    this.env = env;
    if (env.swUpdate !== undefined) {
      this.swUpdate = env.swUpdate;
    }
    this.initSubscriptions();
  }

  async handleVisibilityChange(state: DocumentVisibilityState): Promise<boolean> {
    if (state === 'visible') {
      return this.checkForUpdate();
    }
    return false;
  }

  async checkForUpdate(): Promise<boolean> {
    if (!this.swUpdate || !this.swUpdate.isEnabled) {
      return false;
    }
    try {
      this.checkCount.update((n) => n + 1);
      const found = await this.swUpdate.checkForUpdate();
      if (found) {
        this.markUpdateReady();
      }
      return found;
    } catch {
      return false;
    }
  }

  async applyUpdate(options: { deferIfActive?: boolean } = {}): Promise<boolean> {
    const status = this.audioEngine.status();
    const isMicBusy = status === 'active' || status === 'requesting';

    if (options.deferIfActive && isMicBusy) {
      this.deferredReload.set(true);
      return false;
    }

    this.deferredReload.set(false);

    if (status !== 'idle') {
      this.audioEngine.stop();
    }

    if (this.swUpdate && this.swUpdate.isEnabled) {
      try {
        await this.swUpdate.activateUpdate();
      } catch {}
    }

    this.triggerReload();
    return true;
  }

  async completeDeferredUpdateIfIdle(): Promise<boolean> {
    if (!this.deferredReload()) {
      return false;
    }
    const status = this.audioEngine.status();
    if (status === 'active' || status === 'requesting') {
      return false;
    }
    return this.applyUpdate({ deferIfActive: false });
  }

  ngOnDestroy(): void {
    this.teardownSubscriptions();
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityListener);
    }
  }

  private interceptPwaServiceApplyUpdate(): void {
    if (this.pwaService) {
      this.pwaService.applyUpdate = (): void => {
        void this.applyUpdate({ deferIfActive: false });
      };
    }
  }

  private initSubscriptions(): void {
    if (!this.swUpdate || !this.swUpdate.isEnabled) {
      return;
    }

    this.versionSub = this.swUpdate.versionUpdates.subscribe((evt: VersionEvent) => {
      if (evt.type === 'VERSION_READY') {
        this.markUpdateReady();
      }
    });

    this.unrecoverableSub = this.swUpdate.unrecoverable.subscribe(
      (evt: UnrecoverableStateEvent) => {
        void this.handleUnrecoverableState(evt.reason);
      },
    );

    const intervalMs = this.env.pollIntervalMs ?? SW_UPDATE_CHECK_INTERVAL_MS;
    this.pollTimer = setInterval(() => {
      void this.checkForUpdate();
    }, intervalMs);

    const unrefTimer = this.pollTimer as unknown as { unref?: () => void };
    unrefTimer.unref?.();
  }

  private teardownSubscriptions(): void {
    this.versionSub?.unsubscribe();
    this.versionSub = null;
    this.unrecoverableSub?.unsubscribe();
    this.unrecoverableSub = null;
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private registerBrowserListeners(): void {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.visibilityListener);
    }
  }

  private markUpdateReady(): void {
    this.hasUpdate.set(true);
    this.pwaService?.hasUpdate.set(true);
    this.toastService?.info(
      'Update available',
      'A new version of FretTune is ready to install.',
    );
  }

  private async handleUnrecoverableState(reason: string): Promise<void> {
    this.unrecoverableReason.set(reason);
    if (this.audioEngine.status() !== 'idle') {
      this.audioEngine.stop();
    }
    await this.purgeCorruptedCaches();
    this.triggerReload();
  }

  private async purgeCorruptedCaches(): Promise<void> {
    if (this.env.clearCaches) {
      await this.env.clearCaches();
      return;
    }
    if (typeof caches !== 'undefined' && typeof caches.keys === 'function') {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      } catch {}
    }
  }

  private triggerReload(): void {
    if (this.env.reload) {
      this.env.reload();
      return;
    }
    if (typeof document !== 'undefined' && document.location?.reload) {
      document.location.reload();
    }
  }
}

