import { Injector, ProviderToken, Service, computed, effect, inject, signal } from '@angular/core';
import { CUSTOM_TUNINGS_STORAGE_KEY, SETTINGS_STORAGE_KEY, findInstrument } from '../constants';
import {
  CustomTuning,
  DetectorStrategyId,
  DisplayStyle,
  Instrument,
  InstrumentId,
  NoteNotation,
  ToleranceCents,
  TunerSettings,
  Tuning,
  TuningId,
  TuningMode,
  asTuningId,
} from '../models';
import { createCustomTuning, parseCustomTuningsList } from '../music/custom-tunings';
import { MAX_SETTINGS_JSON_LENGTH, parseSettings } from '../utils';

function tryInject<T>(token: ProviderToken<T>): T | null {
  try {
    return inject(token, { optional: true });
  } catch {
    return null;
  }
}

@Service()
export class SettingsStore {
  readonly settings = signal<TunerSettings>(this.loadInitialSettings());

  readonly customTunings = computed<readonly CustomTuning[]>(() => this.settings().customTunings);

  readonly instrument = computed<Instrument>(() => {
    const base = findInstrument(this.settings().instrumentId);
    const customForInstrument = this.settings().customTunings.filter(
      (t) => t.instrumentId === base.id,
    );
    if (customForInstrument.length === 0) {
      return base;
    }
    return {
      ...base,
      tunings: [...base.tunings, ...customForInstrument],
    };
  });

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
  readonly detector = computed<DetectorStrategyId>(() => this.settings().detector);

  private readonly onInstrumentChangeListeners: Array<(instrument: Instrument) => void> = [];
  private readonly onDetectorChangeListeners: Array<(detector: DetectorStrategyId) => void> = [];

  constructor() {
    const injector = tryInject(Injector);
    if (injector) {
      try {
        effect(
          () => {
            const current = this.settings();
            this.persist(current);
          },
          { injector },
        );
      } catch {}
    }
  }

  onInstrumentChange(listener: (instrument: Instrument) => void): () => void {
    this.onInstrumentChangeListeners.push(listener);
    return () => {
      const idx = this.onInstrumentChangeListeners.indexOf(listener);
      if (idx >= 0) this.onInstrumentChangeListeners.splice(idx, 1);
    };
  }

  onDetectorChange(listener: (detector: DetectorStrategyId) => void): () => void {
    this.onDetectorChangeListeners.push(listener);
    return () => {
      const idx = this.onDetectorChangeListeners.indexOf(listener);
      if (idx >= 0) this.onDetectorChangeListeners.splice(idx, 1);
    };
  }

  setInstrument(instrumentId: InstrumentId): void {
    const inst = findInstrument(instrumentId);
    this.settings.update((prev) => ({
      ...prev,
      instrumentId,
      tuningId: inst.tunings[0].id,
    }));
    const updatedInstrument = this.instrument();
    for (const listener of this.onInstrumentChangeListeners) {
      listener(updatedInstrument);
    }
  }

  setTuning(tuningId: string | TuningId): void {
    const inst = this.instrument();
    if (inst.tunings.some((t) => t.id === tuningId)) {
      this.settings.update((prev) => ({ ...prev, tuningId: asTuningId(String(tuningId)) }));
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

  setDetector(detector: DetectorStrategyId): void {
    this.settings.update((prev) => ({ ...prev, detector }));
    for (const listener of this.onDetectorChangeListeners) {
      listener(detector);
    }
  }

  addCustomTuning(
    instrumentId: InstrumentId,
    name: string,
    strings: readonly number[],
  ): CustomTuning | null {
    const custom = createCustomTuning(instrumentId, name, strings);
    if (!custom) {
      return null;
    }
    this.settings.update((prev) => {
      const filtered = prev.customTunings.filter((t) => t.id !== custom.id);
      return {
        ...prev,
        customTunings: [...filtered, custom],
      };
    });
    this.persistCustomTunings(this.settings().customTunings);
    return custom;
  }

  removeCustomTuning(tuningId: string | TuningId): void {
    const branded = asTuningId(String(tuningId));
    this.settings.update((prev) => {
      const nextCustom = prev.customTunings.filter((t) => t.id !== branded);
      const inst = findInstrument(prev.instrumentId);
      const nextTuningId = prev.tuningId === branded ? inst.tunings[0].id : prev.tuningId;
      return {
        ...prev,
        tuningId: nextTuningId,
        customTunings: nextCustom,
      };
    });
    this.persistCustomTunings(this.settings().customTunings);
  }

  patchSettings(partial: Partial<TunerSettings>): void {
    this.settings.update((prev) => ({ ...prev, ...partial }));
  }

  private loadInitialSettings(): TunerSettings {
    if (typeof localStorage === 'undefined') {
      return parseSettings(null);
    }
    try {
      const rawSettings = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (rawSettings && rawSettings.length > MAX_SETTINGS_JSON_LENGTH) {
        return parseSettings(null);
      }
      const parsedObj = rawSettings ? (JSON.parse(rawSettings) as Record<string, unknown>) : {};
      const rawCustom = localStorage.getItem(CUSTOM_TUNINGS_STORAGE_KEY);
      if (
        rawCustom &&
        rawCustom.length <= MAX_SETTINGS_JSON_LENGTH &&
        !Array.isArray(parsedObj['customTunings'])
      ) {
        parsedObj['customTunings'] = parseCustomTuningsList(JSON.parse(rawCustom));
      }
      return parseSettings(parsedObj);
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
      this.persistCustomTunings(settings.customTunings);
    } catch {}
  }

  private persistCustomTunings(customTunings: readonly CustomTuning[]): void {
    if (typeof localStorage === 'undefined') {
      return;
    }
    try {
      localStorage.setItem(CUSTOM_TUNINGS_STORAGE_KEY, JSON.stringify(customTunings));
    } catch {}
  }
}
