import { OnDestroy, ProviderToken, Service, Signal, computed, inject, signal } from '@angular/core';
import { PwaService } from 'pwa-ui-core/services';

export interface InstallMediaQueryList {
  readonly matches: boolean;
  addEventListener?(type: 'change', listener: (event: { matches: boolean }) => void): void;
  removeEventListener?(type: 'change', listener: (event: { matches: boolean }) => void): void;
}

export interface InstallStateEnvironment {
  readonly matchStandalone?: () => InstallMediaQueryList | null;
  readonly isIosStandalone?: () => boolean;
  readonly addWindowListener?: (type: string, listener: EventListener) => void;
  readonly removeWindowListener?: (type: string, listener: EventListener) => void;
}

function tryInject<T>(token: ProviderToken<T>): T | null {
  try {
    return inject(token, { optional: true });
  } catch {
    return null;
  }
}

@Service()
export class InstallStateService implements OnDestroy {
  private readonly pwaService = tryInject(PwaService);

  private readonly standaloneState = signal<boolean>(false);
  private readonly installedState = signal<boolean>(false);
  private readonly localCanInstall = signal<boolean>(false);

  readonly isStandalone: Signal<boolean> = this.standaloneState.asReadonly();
  readonly installed: Signal<boolean> = computed(
    () => this.installedState() || this.standaloneState(),
  );
  readonly canInstall: Signal<boolean> = computed(() => {
    if (this.standaloneState() || this.installedState()) {
      return false;
    }
    return this.pwaService ? this.pwaService.canInstall() : this.localCanInstall();
  });

  private env: InstallStateEnvironment = {};
  private mediaQueryList: InstallMediaQueryList | null = null;

  private readonly onDisplayModeChange = (event: { matches: boolean }): void => {
    this.standaloneState.set(event.matches || this.checkIosStandalone());
    if (event.matches) {
      this.localCanInstall.set(false);
    }
  };

  private readonly onBeforeInstallPrompt: EventListener = (event: Event): void => {
    event.preventDefault?.();
    if (!this.standaloneState() && !this.installedState()) {
      this.localCanInstall.set(true);
    }
  };

  private readonly onAppInstalled: EventListener = (): void => {
    this.installedState.set(true);
    this.localCanInstall.set(false);
  };

  constructor() {
    this.initListeners();
  }

  configureEnvironment(env: InstallStateEnvironment): void {
    this.teardownListeners();
    this.env = env;
    this.initListeners();
  }

  async promptInstall(): Promise<boolean> {
    if (this.isStandalone() || !this.canInstall()) {
      return false;
    }
    if (this.pwaService) {
      const accepted = await this.pwaService.promptInstall();
      if (accepted) {
        this.markInstalled(true);
      }
      return accepted;
    }
    return false;
  }

  markInstalled(accepted = true): void {
    if (accepted) {
      this.installedState.set(true);
      this.localCanInstall.set(false);
    }
  }

  ngOnDestroy(): void {
    this.teardownListeners();
  }

  private initListeners(): void {
    const mql = this.resolveMediaQueryList();
    this.mediaQueryList = mql;
    const initialStandalone = Boolean(mql?.matches) || this.checkIosStandalone();
    this.standaloneState.set(initialStandalone);
    if (initialStandalone) {
      this.installedState.set(true);
    }

    mql?.addEventListener?.('change', this.onDisplayModeChange);

    const addListener =
      this.env.addWindowListener ??
      (typeof window !== 'undefined' && window.addEventListener
        ? (type: string, listener: EventListener) => window.addEventListener(type, listener)
        : undefined);

    if (addListener) {
      addListener('beforeinstallprompt', this.onBeforeInstallPrompt);
      addListener('appinstalled', this.onAppInstalled);
    }
  }

  private teardownListeners(): void {
    this.mediaQueryList?.removeEventListener?.('change', this.onDisplayModeChange);
    this.mediaQueryList = null;

    const removeListener =
      this.env.removeWindowListener ??
      (typeof window !== 'undefined' && window.removeEventListener
        ? (type: string, listener: EventListener) => window.removeEventListener(type, listener)
        : undefined);

    if (removeListener) {
      removeListener('beforeinstallprompt', this.onBeforeInstallPrompt);
      removeListener('appinstalled', this.onAppInstalled);
    }
  }

  private resolveMediaQueryList(): InstallMediaQueryList | null {
    if (this.env.matchStandalone) {
      return this.env.matchStandalone();
    }
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      try {
        return window.matchMedia('(display-mode: standalone)');
      } catch {
        return null;
      }
    }
    return null;
  }

  private checkIosStandalone(): boolean {
    if (this.env.isIosStandalone) {
      return this.env.isIosStandalone();
    }
    if (typeof navigator !== 'undefined') {
      return (navigator as unknown as { standalone?: boolean }).standalone === true;
    }
    return false;
  }
}

