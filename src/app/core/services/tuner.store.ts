import {
  Injector,
  OnDestroy,
  Service,
  Signal,
  computed,
  effect,
  inject,
  linkedSignal,
} from '@angular/core';
import { AUDIO_OUTPUT, AudioEngine, AudioLifecycleService, PITCH_SOURCE } from '../audio-engine';
import { InTuneDetector, InTuneState } from '../dsp';
import { AudioOutput, MicrophoneStatus, PitchSource, TunerReading } from '../models';
import { midiToFrequency, resolveReading } from '../music';
import { InstallStateService } from './install-state.service';
import { SessionEffectsService } from './session-effects.service';
import { SettingsStore } from './settings.store';
import { StringChecklistStore } from './string-checklist.store';
import { SwUpdateCoordinatorService } from './sw-update-coordinator.service';

interface InTuneEvaluationInput {
  readonly reading: TunerReading | null;
  readonly timestamp: number;
  readonly tolerance: number;
  readonly active: boolean;
}

const IDLE_IN_TUNE_STATE: InTuneState = {
  isInTune: false,
  lockedStringIndex: null,
  justLocked: false,
};

@Service()
export class TunerStore implements OnDestroy {
  private readonly audioEngine = inject(AudioEngine);
  private readonly pitchSource: PitchSource = inject(PITCH_SOURCE);
  private readonly audioOutput: AudioOutput = inject(AUDIO_OUTPUT);
  private readonly settingsStore = inject(SettingsStore);
  private readonly checklistStore = inject(StringChecklistStore);
  private readonly sessionEffects = inject(SessionEffectsService);
  private readonly swUpdateCoordinator = inject(SwUpdateCoordinatorService, { optional: true });
  private readonly inTuneDetector = new InTuneDetector();
  private readonly unsubscribeCallbacks: Array<() => void> = [];

  readonly micStatus: Signal<MicrophoneStatus> = this.audioEngine.status;
  readonly micError: Signal<string | null> = this.audioEngine.errorMessage;
  readonly permissionState: Signal<PermissionState | 'unknown'> = this.audioEngine.permissionState;
  readonly isPermissionGranted: Signal<boolean> = computed(
    () => this.audioEngine.permissionState() === 'granted',
  );
  readonly isListening: Signal<boolean> = computed(() => this.micStatus() === 'active');
  readonly playingMidi: Signal<number | null> = computed(() => this.audioOutput.playingMidi());
  readonly isToneGated: Signal<boolean> = computed(() => this.audioOutput.isGated());
  readonly lockedString: Signal<number | null> = this.checklistStore.lockedString;
  readonly tunedStrings: Signal<Readonly<Record<number, boolean>>> =
    this.checklistStore.tunedStrings;

  readonly reading: Signal<TunerReading | null> = computed<TunerReading | null>(() => {
    if (!this.isListening() || this.isToneGated()) {
      return null;
    }

    const freq = this.pitchSource.smoothedFrequency();
    if (freq === null) {
      return null;
    }

    return resolveReading(freq, {
      referencePitch: this.settingsStore.referencePitch(),
      mode: this.settingsStore.mode(),
      tuning: this.settingsStore.tuning(),
      lockedString: this.checklistStore.lockedString(),
      tolerance: this.settingsStore.tolerance(),
    });
  });

  private readonly inTuneState = linkedSignal<InTuneEvaluationInput, InTuneState>({
    source: () => ({
      reading: this.reading(),
      timestamp: this.pitchSource.pitchFrame()?.timestamp ?? 0,
      tolerance: this.settingsStore.tolerance(),
      active: this.isListening() && !this.isToneGated(),
    }),
    computation: (input) => {
      if (!input.active || !input.reading) {
        this.inTuneDetector.reset();
        return IDLE_IN_TUNE_STATE;
      }
      return this.inTuneDetector.push(input.reading, input.timestamp, input.tolerance);
    },
  });

  readonly isInTune: Signal<boolean> = computed(() => this.inTuneState().isInTune);

  private readonly autoTunedStringIndex: Signal<number | null> = computed(() => {
    const state = this.inTuneState();
    return state.isInTune ? state.lockedStringIndex : null;
  });

  private readonly justLocked: Signal<boolean> = computed(() => this.inTuneState().justLocked);

  constructor() {
    const lifecycle = inject(AudioLifecycleService, { optional: true });
    inject(InstallStateService, { optional: true });

    lifecycle?.onForegroundResume(() => {
      void this.sessionEffects.handleVisibilityChange('visible');
    });

    this.checklistStore.bindAutoTunedString(this.autoTunedStringIndex);
    this.sessionEffects.bind({
      isListening: this.isListening,
      justLocked: this.justLocked,
    });

    if (this.pitchSource.onFrame) {
      this.unsubscribeCallbacks.push(
        this.pitchSource.onFrame(() => {
          const state = this.inTuneState();
          this.tunedStrings();
          if (state.justLocked) {
            this.sessionEffects.notifyJustLocked();
          }
        }),
      );
    }

    this.unsubscribeCallbacks.push(
      this.settingsStore.onInstrumentChange((instrument) => {
        if (this.isListening()) {
          this.pitchSource.updateProfile(instrument.analysis);
        }
      }),
      this.settingsStore.onDetectorChange((detector) => {
        this.pitchSource.setDetector(detector);
      }),
    );

    const injector = inject(Injector, { optional: true });
    if (injector) {
      try {
        effect(
          () => {
            const gated = this.isToneGated();
            this.pitchSource.setGate(gated);
          },
          { injector },
        );
      } catch {}
    }
  }

  async startListening(): Promise<boolean> {
    const status = this.micStatus();
    const success =
      status === 'suspended' || status === 'interrupted'
        ? await this.audioEngine.resumeFromSuspension()
        : await this.audioEngine.start();

    if (success) {
      const instrument = this.settingsStore.instrument();
      this.pitchSource.start(instrument.analysis, this.settingsStore.detector());
      this.sessionEffects.notifyStartListening();
    }
    return success;
  }

  async pauseListening(): Promise<void> {
    await this.audioEngine.pause();
    this.inTuneDetector.reset();
    this.sessionEffects.notifyStopListening();
  }

  stopListening(): void {
    this.pitchSource.stop();
    this.audioEngine.stop();
    this.inTuneDetector.reset();
    this.sessionEffects.notifyStopListening();
    void this.swUpdateCoordinator?.completeDeferredUpdateIfIdle();
  }

  async toggleListening(): Promise<void> {
    if (this.isListening()) {
      await this.pauseListening();
    } else {
      await this.startListening();
    }
  }

  selectString(index: number | null): void {
    this.checklistStore.selectString(index);
  }

  playStringReference(index: number): void {
    const tuning = this.settingsStore.tuning();
    const midi = tuning.strings[index];
    if (midi !== undefined) {
      const freq = midiToFrequency(midi, this.settingsStore.referencePitch());
      this.pitchSource.setGate(true);
      this.audioOutput.play(freq, midi);
    }
  }

  resetTunedStrings(): void {
    this.checklistStore.resetTunedStrings();
  }

  ngOnDestroy(): void {
    for (const unsub of this.unsubscribeCallbacks) {
      unsub();
    }
    this.stopListening();
  }
}
