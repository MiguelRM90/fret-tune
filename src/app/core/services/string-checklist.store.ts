import { Service, Signal, computed, inject, linkedSignal, signal } from '@angular/core';
import { SettingsStore } from './settings.store';

interface ChecklistResetSource {
  readonly presetKey: string;
  readonly autoTunedIndex: number | null;
}

@Service()
export class StringChecklistStore {
  private readonly settingsStore = inject(SettingsStore);
  private readonly autoTunedSource = signal<Signal<number | null> | null>(null);

  private readonly presetKey = computed(
    () => `${this.settingsStore.instrument().id}:${this.settingsStore.tuning().id}`,
  );

  private readonly lockedStringState = linkedSignal<string, number | null>({
    source: this.presetKey,
    computation: () => null,
  });

  private readonly tunedStringsState = linkedSignal<
    ChecklistResetSource,
    Readonly<Record<number, boolean>>
  >({
    source: () => ({
      presetKey: this.presetKey(),
      autoTunedIndex: this.autoTunedSource()?.() ?? null,
    }),
    computation: (source, previous) => {
      const base =
        previous && previous.source.presetKey === source.presetKey ? previous.value : {};
      const idx = source.autoTunedIndex;
      if (idx !== null && !base[idx]) {
        return { ...base, [idx]: true };
      }
      return base;
    },
  });

  readonly lockedString: Signal<number | null> = this.lockedStringState.asReadonly();
  readonly tunedStrings: Signal<Readonly<Record<number, boolean>>> =
    this.tunedStringsState.asReadonly();

  bindAutoTunedString(source: Signal<number | null>): void {
    this.autoTunedSource.set(source);
  }

  selectString(index: number | null): void {
    this.lockedStringState.update((current) => (current === index ? null : index));
  }

  markStringTuned(index: number): void {
    this.tunedStringsState.update((prev) => (prev[index] ? prev : { ...prev, [index]: true }));
  }

  resetTunedStrings(): void {
    this.tunedStringsState.set({});
  }
}
