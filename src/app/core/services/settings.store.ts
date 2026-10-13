import { Injectable, computed, effect, signal } from '@angular/core';
import { SETTINGS_STORAGE_KEY, findInstrument } from '../constants';
import {
  DisplayStyle,
  Instrument,
  InstrumentId,
  NoteNotation,
  ToleranceCents,
  TunerSettings,
  Tuning,
  TuningMode,
} from '../models';
import { parseSettings } from '../utils';

@Injectable({
  providedIn: 'root',
})
export class SettingsStore {
  readonly settings = signal<TunerSettings>(this.loadInitialSettings());

  readonly instrument = computed<Instrument>(() => findInstrument(this.settings().instrumentId));

  readonly tuning = computed<Tuning>(() => {
    const inst = this.instrument();
    const currentTuningId = this.settings().tuningId;
    return inst.tunings.find((t) => t.id === currentTuningId) ?? inst.tunings[0];
  });

  readonly mode = computed<TuningMode>(() => this.settings().mode);
  readonly displayStyle = computed<DisplayStyle>(() => this.settings().displayStyle);
  readonly notation = computed<NoteNotation>(() => this.settings().notation);
  readonly referencePitch = computed<number>(() => this.settings().referencePitch);
  readonly tolerance = computed<ToleranceCents>(() => this.settings().tolerance);
  readonly hapticsEnabled = computed<boolean>(() => this.settings().hapticsEnabled);
  readonly keepAwake = computed<boolean>(() => this.settings().keepAwake);

  constructor() {
    effect(() => {
      const current = this.settings();
      this.persist(current);
    });
  }

  setInstrument(instrumentId: InstrumentId): void {
    const inst = findInstrument(instrumentId);
    this.settings.update((prev) => ({
      ...prev,
      instrumentId,
      tuningId: inst.tunings[0].id,
    }));
  }

  setTuning(tuningId: string): void {
    const inst = this.instrument();
    if (inst.tunings.some((t) => t.id === tuningId)) {
      this.settings.update((prev) => ({ ...prev, tuningId }));
    }
  }

  setMode(mode: TuningMode): void {
    this.settings.update((prev) => ({ ...prev, mode }));
  }

  setDisplayStyle(displayStyle: DisplayStyle): void {
    this.settings.update((prev) => ({ ...prev, displayStyle }));
  }

  setNotation(notation: NoteNotation): void {
    this.settings.update((prev) => ({ ...prev, notation }));
  }

  setReferencePitch(referencePitch: number): void {
    this.settings.update((prev) => ({ ...prev, referencePitch }));
  }

  setTolerance(tolerance: ToleranceCents): void {
    this.settings.update((prev) => ({ ...prev, tolerance }));
  }

  setHapticsEnabled(hapticsEnabled: boolean): void {
    this.settings.update((prev) => ({ ...prev, hapticsEnabled }));
  }

  setKeepAwake(keepAwake: boolean): void {
    this.settings.update((prev) => ({ ...prev, keepAwake }));
  }

  private loadInitialSettings(): TunerSettings {
    if (typeof localStorage === 'undefined') {
      return parseSettings(null);
    }
    try {
      const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
      return parseSettings(raw ? JSON.parse(raw) : null);
    } catch {
      return parseSettings(null);
    }
  }

  private persist(settings: TunerSettings): void {
    if (typeof localStorage === 'undefined') {
      return;
    }
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch {}
  }
}

