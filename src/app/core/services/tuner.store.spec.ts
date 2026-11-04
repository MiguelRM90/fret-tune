import '@angular/compiler';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Injector, signal } from '@angular/core';
import {
  AUDIO_OUTPUT,
  AudioEngine,
  AudioLifecycleService,
  FakePitchSource,
  PITCH_SOURCE,
} from '../audio-engine';
import { AudioOutput } from '../models';
import { BASS_INSTRUMENT, GUITAR_INSTRUMENT, midiToFrequency } from '../music';
import { UnrecoverableStateEvent, VersionEvent } from '@angular/service-worker';
import { Subject } from 'rxjs';
import { HapticsService } from './haptics.service';
import { InstallStateService } from './install-state.service';
import { SessionEffectsService } from './session-effects.service';
import { SettingsStore } from './settings.store';
import { StringChecklistStore } from './string-checklist.store';
import { SwUpdateCoordinatorService, SwUpdateLike } from './sw-update-coordinator.service';
import { TunerStore } from './tuner.store';
import { WakeLockService } from './wake-lock.service';

class FakeAudioOutput implements AudioOutput {
  readonly isPlaying = signal<boolean>(false);
  readonly playingMidi = signal<number | null>(null);
  readonly isGated = signal<boolean>(false);

  play(_frequency: number, midi?: number): void {
    this.isPlaying.set(true);
    this.isGated.set(true);
    if (midi !== undefined) {
      this.playingMidi.set(midi);
    }
  }

  stop(): void {
    this.isPlaying.set(false);
    this.playingMidi.set(null);
    this.isGated.set(false);
  }
}

function createTestHarness() {
  const audioEngine = new AudioEngine();
  audioEngine.configureEnvironment({
    createAudioContext: () =>
      ({
        sampleRate: 48000,
        currentTime: 0,
        state: 'running',
        onstatechange: null,
        audioWorklet: { addModule: async () => {} },
        suspend: async () => {},
        resume: async () => {},
        close: async () => {},
        createMediaStreamSource: () => ({ connect: () => {}, disconnect: () => {} }),
        createGain: () => ({
          gain: { setValueAtTime: () => {} },
          connect: () => {},
          disconnect: () => {},
        }),
        destination: {},
      }) as unknown as AudioContext,
    createWorkletNode: () =>
      ({
        port: { onmessage: null, postMessage: () => {} },
        connect: () => {},
        disconnect: () => {},
      }) as unknown as AudioWorkletNode,
    getUserMedia: async () =>
      ({
        getTracks: () => [{ stop: () => {}, addEventListener: () => {}, removeEventListener: () => {} }],
        getAudioTracks: () => [
          {
            readyState: 'live',
            stop: () => {},
            addEventListener: () => {},
            removeEventListener: () => {},
          },
        ],
      }) as unknown as MediaStream,
  });

  const pitchSource = new FakePitchSource();
  const audioOutput = new FakeAudioOutput();

  const injector = Injector.create({
    providers: [
      { provide: AudioEngine, useValue: audioEngine },
      { provide: PITCH_SOURCE, useValue: pitchSource },
      { provide: AUDIO_OUTPUT, useValue: audioOutput },
      { provide: SettingsStore, useClass: SettingsStore },
      { provide: StringChecklistStore, useClass: StringChecklistStore },
      { provide: HapticsService, useClass: HapticsService },
      { provide: WakeLockService, useClass: WakeLockService },
      { provide: SessionEffectsService, useClass: SessionEffectsService },
      { provide: AudioLifecycleService, useClass: AudioLifecycleService },
      { provide: InstallStateService, useClass: InstallStateService },
      { provide: SwUpdateCoordinatorService, useClass: SwUpdateCoordinatorService },
      { provide: TunerStore, useClass: TunerStore },
    ],
  });

  const settingsStore = injector.get(SettingsStore);
  const checklistStore = injector.get(StringChecklistStore);
  const wakeLockService = injector.get(WakeLockService);
  const lifecycleService = injector.get(AudioLifecycleService);
  const swUpdateCoordinator = injector.get(SwUpdateCoordinatorService);
  const installState = injector.get(InstallStateService);
  const tunerStore = injector.get(TunerStore);

  return {
    audioEngine,
    pitchSource,
    audioOutput,
    settingsStore,
    checklistStore,
    wakeLockService,
    lifecycleService,
    swUpdateCoordinator,
    installState,
    tunerStore,
  };
}

describe('TunerStore with FakePitchSource (P2.2, P2.3, P1.6)', () => {
  it('locks a string in tune after 450 ms and marks it in tunedStrings without Web Audio', async () => {
    const { tunerStore, pitchSource } = createTestHarness();

    await tunerStore.startListening();
    assert.equal(tunerStore.isListening(), true);

    const a2Freq = midiToFrequency(45, 440); // String index 1 (A2 = 110 Hz)
    pitchSource.emitFrequency(a2Freq, 100);
    assert.equal(tunerStore.reading()?.stringIndex, 1);
    assert.equal(tunerStore.isInTune(), false);
    assert.equal(tunerStore.tunedStrings()[1], undefined);

    // Sustain for 450 ms -> locks in tune and marks string 1
    pitchSource.emitFrequency(a2Freq, 550);
    assert.equal(tunerStore.isInTune(), true);
    assert.equal(tunerStore.tunedStrings()[1], true);

    tunerStore.ngOnDestroy();
  });

  it('propagates profile on instrument change and resets lockedString and tunedStrings via linkedSignal', async () => {
    const { tunerStore, pitchSource, settingsStore } = createTestHarness();

    await tunerStore.startListening();
    assert.deepEqual(pitchSource.activeProfile, GUITAR_INSTRUMENT.analysis);

    tunerStore.selectString(2);
    assert.equal(tunerStore.lockedString(), 2);

    const d3Freq = midiToFrequency(50, 440);
    pitchSource.emitFrequency(d3Freq, 0);
    pitchSource.emitFrequency(d3Freq, 500);
    assert.equal(tunerStore.tunedStrings()[2], true);

    // Switch instrument to bass while listening
    settingsStore.setInstrument('bass');
    assert.deepEqual(pitchSource.activeProfile, BASS_INSTRUMENT.analysis);
    assert.equal(tunerStore.lockedString(), null);
    assert.deepEqual(tunerStore.tunedStrings(), {});

    tunerStore.ngOnDestroy();
  });

  it('P1.6: gates pitch detection while playing a reference tone and never marks strings as tuned', async () => {
    const { tunerStore, pitchSource, audioOutput } = createTestHarness();

    await tunerStore.startListening();
    tunerStore.playStringReference(0); // Low E2 reference tone

    assert.equal(tunerStore.isToneGated(), true);
    assert.equal(pitchSource.isGated, true);

    // Attempt to feed in-tune frames while reference tone plays
    const e2Freq = midiToFrequency(40, 440);
    pitchSource.emitFrequency(e2Freq, 0);
    pitchSource.emitFrequency(e2Freq, 600);

    assert.equal(tunerStore.reading(), null);
    assert.equal(tunerStore.isInTune(), false);
    assert.deepEqual(tunerStore.tunedStrings(), {});

    // Stop reference tone -> ungates
    audioOutput.stop();
    pitchSource.setGate(false);
    assert.equal(tunerStore.isToneGated(), false);

    tunerStore.ngOnDestroy();
  });

  it('P3.4 (TD-22): re-acquires WakeLock when returning to visible after backgrounding', async () => {
    const { tunerStore, wakeLockService, lifecycleService } = createTestHarness();

    wakeLockService.configureEnvironment({
      requestWakeLock: async () => {
        const listeners = new Set<() => void>();
        const sentinel = {
          released: false,
          addEventListener: (_t: string, fn: () => void) => listeners.add(fn),
          removeEventListener: (_t: string, fn: () => void) => listeners.delete(fn),
          release: async () => {
            sentinel.released = true;
            for (const fn of listeners) fn();
          },
        };
        return sentinel as unknown as WakeLockSentinel;
      },
    });

    await tunerStore.startListening();
    assert.equal(wakeLockService.isActive(), true);
    assert.equal(wakeLockService.requestCount(), 1);

    // Simulate app going to background -> WakeLock is released and audio is suspended
    await lifecycleService.handleVisibilityChange('hidden');
    wakeLockService.release();
    assert.equal(wakeLockService.isActive(), false);
    assert.equal(tunerStore.micStatus(), 'suspended');

    // Simulate app returning to foreground -> audio resumes and WakeLock is re-acquired
    await lifecycleService.handleVisibilityChange('visible');
    assert.equal(tunerStore.isListening(), true);
    assert.equal(wakeLockService.isActive(), true);
    assert.equal(wakeLockService.requestCount(), 2);

    tunerStore.ngOnDestroy();
  });

  it('P3.1 & SEC-08: SwUpdateCoordinatorService handles unrecoverable, checks on visible, and never reloads while mic is active', async () => {
    const { tunerStore, audioEngine, swUpdateCoordinator } = createTestHarness();

    const versionUpdates$ = new Subject<VersionEvent>();
    const unrecoverable$ = new Subject<UnrecoverableStateEvent>();
    let activateCalls = 0;
    let reloadCalls = 0;
    let cachesCleared = 0;
    let micStatusAtReload: string | null = null;

    const fakeSwUpdate: SwUpdateLike = {
      isEnabled: true,
      versionUpdates: versionUpdates$.asObservable(),
      unrecoverable: unrecoverable$.asObservable(),
      checkForUpdate: async () => true,
      activateUpdate: async () => {
        activateCalls++;
        return true;
      },
    };

    swUpdateCoordinator.bindAudioEngine(audioEngine);
    swUpdateCoordinator.configureEnvironment({
      swUpdate: fakeSwUpdate,
      clearCaches: async () => {
        cachesCleared++;
      },
      reload: () => {
        reloadCalls++;
        micStatusAtReload = audioEngine.status();
      },
    });

    // 1. Foreground transition triggers checkForUpdate() and marks hasUpdate
    const found = await swUpdateCoordinator.handleVisibilityChange('visible');
    assert.equal(found, true);
    assert.equal(swUpdateCoordinator.hasUpdate(), true);
    assert.equal(swUpdateCoordinator.checkCount(), 1);

    // 2. Start tuning session -> deferred applyUpdate does NOT reload while listening
    await tunerStore.startListening();
    assert.equal(tunerStore.isListening(), true);

    const appliedWhileActive = await swUpdateCoordinator.applyUpdate({ deferIfActive: true });
    assert.equal(appliedWhileActive, false);
    assert.equal(swUpdateCoordinator.deferredReload(), true);
    assert.equal(reloadCalls, 0);

    // Stopping listening completes the deferred update cleanly
    tunerStore.stopListening();
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(reloadCalls, 1);
    assert.equal(activateCalls, 1);
    assert.equal(micStatusAtReload, 'idle');

    // 3. Direct applyUpdate() while active stops the microphone BEFORE reloading
    await tunerStore.startListening();
    assert.equal(audioEngine.status(), 'active');
    await swUpdateCoordinator.applyUpdate({ deferIfActive: false });
    assert.equal(reloadCalls, 2);
    assert.equal(micStatusAtReload, 'idle');

    // 4. Unrecoverable event stops mic, purges corrupted caches, and reloads cleanly
    await tunerStore.startListening();
    unrecoverable$.next({
      type: 'UNRECOVERABLE_STATE',
      reason: 'Hash mismatch in cached chunk',
    });
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(swUpdateCoordinator.unrecoverableReason(), 'Hash mismatch in cached chunk');
    assert.equal(cachesCleared, 1);
    assert.equal(reloadCalls, 3);
    assert.equal(micStatusAtReload, 'idle');

    swUpdateCoordinator.ngOnDestroy();
    tunerStore.ngOnDestroy();
  });

  it('P3.3 (TD-20): InstallStateService detects standalone mode and appinstalled events', () => {
    const { installState } = createTestHarness();
    const windowListeners = new Map<string, EventListener>();
    let changeHandler: ((e: { matches: boolean }) => void) | null = null;

    installState.configureEnvironment({
      matchStandalone: () => ({
        matches: false,
        addEventListener: (_t, fn) => {
          changeHandler = fn;
        },
        removeEventListener: () => {
          changeHandler = null;
        },
      }),
      isIosStandalone: () => false,
      addWindowListener: (type, listener) => {
        windowListeners.set(type, listener);
      },
      removeWindowListener: (type) => {
        windowListeners.delete(type);
      },
    });

    assert.equal(installState.isStandalone(), false);
    assert.equal(installState.installed(), false);

    // Simulate beforeinstallprompt
    windowListeners.get('beforeinstallprompt')?.(new Event('beforeinstallprompt'));
    // Simulate display-mode switching to standalone
    changeHandler?.({ matches: true });
    assert.equal(installState.isStandalone(), true);
    assert.equal(installState.installed(), true);
    assert.equal(installState.canInstall(), false);

    installState.ngOnDestroy();
  });
});
