import { OnDestroy, Service, computed, effect, inject, signal } from '@angular/core';
import { midiToFrequency, resolveReading } from '../audio';
import { IN_TUNE_LOCK_MS } from '../constants';
import { TunerReading } from '../models';
import { AudioInputService } from './audio-input.service';
import { HapticsService } from './haptics.service';
import { PitchDetectionService } from './pitch-detection.service';
import { SettingsStore } from './settings.store';
import { ToneGeneratorService } from './tone-generator.service';
import { WakeLockService } from './wake-lock.service';

@Service()
export class TunerStore implements OnDestroy {
  readonly audioInput = inject(AudioInputService);
  readonly pitchDetection = inject(PitchDetectionService);
  readonly toneGenerator = inject(ToneGeneratorService);
  readonly haptics = inject(HapticsService);
  readonly wakeLock = inject(WakeLockService);
  readonly settingsStore = inject(SettingsStore);

  readonly isListening = computed(() => this.audioInput.status() === 'active');
  readonly micStatus = computed(() => this.audioInput.status());
  readonly micError = computed(() => this.audioInput.errorMessage());
  readonly playingMidi = computed(() => this.toneGenerator.playingMidi());

  readonly lockedString = signal<number | null>(null);
  readonly tunedStrings = signal<Readonly<Record<number, boolean>>>({});
  readonly isInTune = signal<boolean>(false);

  private inTuneSince: number | null = null;
  private hasVibratedForCurrentLock = false;

  readonly reading = computed<TunerReading | null>(() => {
    const freq = this.pitchDetection.smoothedFrequency();
    if (freq === null || !this.isListening()) {
      return null;
    }

    return resolveReading(freq, {
      referencePitch: this.settingsStore.referencePitch(),
      mode: this.settingsStore.mode(),
      tuning: this.settingsStore.tuning(),
      lockedString: this.lockedString(),
      tolerance: this.settingsStore.tolerance(),
    });
  });

  constructor() {
    effect(() => {
      const reading = this.reading();
      this.handleInTuneState(reading);
    });

    effect(() => {
      const instrument = this.settingsStore.instrument();
      if (this.isListening()) {
        this.pitchDetection.updateProfile(instrument.analysis, instrument.analysis.frameSize);
      }
      this.lockedString.set(null);
      this.tunedStrings.set({});
    });

    effect(() => {
      const keepAwake = this.settingsStore.keepAwake();
      if (this.isListening() && keepAwake) {
        this.wakeLock.request();
      } else if (!keepAwake) {
        this.wakeLock.release();
      }
    });
  }

  async startListening(): Promise<boolean> {
    const success = await this.audioInput.start();
    if (success) {
      const instrument = this.settingsStore.instrument();
      this.pitchDetection.start(instrument.analysis, instrument.analysis.frameSize);
      if (this.settingsStore.keepAwake()) {
        this.wakeLock.request();
      }
    }
    return success;
  }

  stopListening(): void {
    this.pitchDetection.stop();
    this.audioInput.stop();
    this.wakeLock.release();
    this.isInTune.set(false);
    this.inTuneSince = null;
    this.hasVibratedForCurrentLock = false;
  }

  async toggleListening(): Promise<void> {
    if (this.isListening()) {
      this.stopListening();
    } else {
      await this.startListening();
    }
  }

  selectString(index: number | null): void {
    this.lockedString.set(this.lockedString() === index ? null : index);
  }

  playStringReference(index: number): void {
    const tuning = this.settingsStore.tuning();
    const midi = tuning.strings[index];
    if (midi !== undefined) {
      const freq = midiToFrequency(midi, this.settingsStore.referencePitch());
      this.toneGenerator.play(freq, midi);
    }
  }

  resetTunedStrings(): void {
    this.tunedStrings.set({});
  }

  private handleInTuneState(reading: TunerReading | null): void {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();

    if (reading && reading.direction === 'in-tune') {
      if (this.inTuneSince === null) {
        this.inTuneSince = now;
      }

      if (now - this.inTuneSince >= IN_TUNE_LOCK_MS) {
        this.isInTune.set(true);

        if (reading.stringIndex !== null) {
          const idx = reading.stringIndex;
          this.tunedStrings.update((prev) => ({ ...prev, [idx]: true }));
        }

        if (!this.hasVibratedForCurrentLock && this.settingsStore.hapticsEnabled()) {
          this.haptics.inTuneSuccess();
          this.hasVibratedForCurrentLock = true;
        }
      }
    } else {
      this.inTuneSince = null;
      this.isInTune.set(false);
      this.hasVibratedForCurrentLock = false;
    }
  }

  ngOnDestroy(): void {
    this.stopListening();
  }
}

