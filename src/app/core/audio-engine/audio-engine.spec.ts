import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BASS_INSTRUMENT, GUITAR_INSTRUMENT, centsBetween } from '../music';
import { DspWorkerEngine } from '../workers';
import { AudioEngine, PermissionStatusLike } from './audio-engine.service';
import { AudioLifecycleService } from './audio-lifecycle.service';
import { PitchDetectionService } from './pitch-detection.service';
import { ToneGeneratorService } from './tone-generator.service';

interface FakeTrack {
  readyState: 'live' | 'ended';
  stopped: boolean;
  stop(): void;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
  emit(type: 'ended' | 'mute' | 'unmute'): void;
}

function createFakeTrack(): FakeTrack {
  const listeners = new Map<string, Set<() => void>>();
  return {
    readyState: 'live',
    stopped: false,
    stop() {
      this.stopped = true;
      this.readyState = 'ended';
    },
    addEventListener(type: string, listener: () => void) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(listener);
    },
    removeEventListener(type: string, listener: () => void) {
      listeners.get(type)?.delete(listener);
    },
    emit(type: 'ended' | 'mute' | 'unmute') {
      if (type === 'ended') {
        this.readyState = 'ended';
      }
      for (const fn of listeners.get(type) ?? []) {
        fn();
      }
    },
  };
}

function createFakeAudioContext() {
  let currentState: AudioContextState | 'interrupted' = 'running';
  const ctx = {
    sampleRate: 48000,
    currentTime: 0,
    onstatechange: null as (() => void) | null,
    get state() {
      return currentState;
    },
    setState(next: AudioContextState | 'interrupted') {
      currentState = next;
      this.onstatechange?.();
    },
    audioWorklet: {
      addModule: async () => {},
    },
    suspend: async function () {
      currentState = 'suspended';
    },
    resume: async function () {
      currentState = 'running';
    },
    close: async function () {
      currentState = 'closed';
    },
    createMediaStreamSource: () =>
      ({
        connect: () => {},
        disconnect: () => {},
      }) as unknown as MediaStreamAudioSourceNode,
    createGain: () =>
      ({
        gain: {
          setValueAtTime: () => {},
          exponentialRampToValueAtTime: () => {},
        },
        connect: () => {},
        disconnect: () => {},
      }) as unknown as GainNode,
    createOscillator: () =>
      ({
        type: 'triangle',
        frequency: { setValueAtTime: () => {} },
        connect: () => {},
        disconnect: () => {},
        start: () => {},
        stop: () => {},
      }) as unknown as OscillatorNode,
    destination: {} as AudioDestinationNode,
  };
  return ctx;
}

function createFakeWorkletNode(): AudioWorkletNode {
  return {
    port: {
      onmessage: null,
      postMessage: () => {},
    },
    connect: () => {},
    disconnect: () => {},
  } as unknown as AudioWorkletNode;
}

function sine(frequency: number, sampleRate: number, size: number, startSample = 0): Float32Array {
  return Float32Array.from(
    { length: size },
    (_, i) => 0.5 * Math.sin((2 * Math.PI * frequency * (startSample + i)) / sampleRate),
  );
}

describe('PitchDetectionService & DspWorkerEngine (P1.1, P1.2)', () => {
  it('P1.1: starts with guitar -> switches to bass -> detects a 41.2 Hz (E1) synthetic sine', () => {
    const service = new PitchDetectionService();
    const sampleRate = 48000;

    service.start(GUITAR_INSTRUMENT.analysis, 'mpm-fft');

    // Feed guitar A2 (110 Hz) first
    const a2Samples = sine(110, sampleRate, GUITAR_INSTRUMENT.analysis.frameSize);
    service.analyzeFrameForTest(a2Samples, sampleRate, GUITAR_INSTRUMENT.analysis.frameSize);
    assert.ok(service.smoothedFrequency() !== null);

    // Switch to bass profile while listening: smoother must reset and range/frameSize must update
    service.updateProfile(BASS_INSTRUMENT.analysis);
    assert.equal(service.smoothedFrequency(), null);
    assert.equal(service.currentProfile.minFrequency, BASS_INSTRUMENT.analysis.minFrequency);
    assert.equal(service.currentProfile.frameSize, BASS_INSTRUMENT.analysis.frameSize);

    // Feed 41.2 Hz (E1) synthetic sine wave
    const e1Samples = sine(41.2, sampleRate, BASS_INSTRUMENT.analysis.frameSize);
    service.analyzeFrameForTest(e1Samples, sampleRate, BASS_INSTRUMENT.analysis.frameSize);

    const detected = service.latestEstimate();
    assert.ok(detected !== null, 'expected 41.2 Hz E1 to be detected after switching to bass');
    assert.ok(
      Math.abs(centsBetween(detected.frequency, 41.2)) < 1,
      `expected ~41.2 Hz, got ${detected.frequency}`,
    );
    service.ngOnDestroy();
  });

  it('P1.2: drives analysis by audio hop size and keeps analysis count identical across display rates', () => {
    const sampleRate = 48000;
    const totalSamples = 48000; // 1 second of audio

    // Simulate 60 Hz arrival (800 samples per display tick) vs 120 Hz arrival (400 samples per display tick)
    const engine60 = new DspWorkerEngine();
    engine60.handleCommand({ type: 'configure', profile: GUITAR_INSTRUMENT.analysis, sampleRate });
    let analyses60 = 0;
    let cursor60 = 0;
    while (cursor60 < totalSamples) {
      const chunk = sine(110, sampleRate, 800, cursor60);
      cursor60 += chunk.length;
      analyses60 += engine60.pushSamples(chunk, cursor60, sampleRate).length;
    }

    const engine120 = new DspWorkerEngine();
    engine120.handleCommand({ type: 'configure', profile: GUITAR_INSTRUMENT.analysis, sampleRate });
    let analyses120 = 0;
    let cursor120 = 0;
    while (cursor120 < totalSamples) {
      const chunk = sine(110, sampleRate, 400, cursor120);
      cursor120 += chunk.length;
      analyses120 += engine120.pushSamples(chunk, cursor120, sampleRate).length;
    }

    assert.ok(analyses60 > 0);
    const diffRatio = Math.abs(analyses60 - analyses120) / analyses60;
    assert.ok(diffRatio <= 0.05, `Expected <= 5% difference, got ${analyses60} vs ${analyses120}`);
  });
});

describe('AudioEngine & Lifecycle (P1.5, SEC-06, SEC-07, SEC-12, SEC-15)', () => {
  it('fails safely when navigator/getUserMedia is unavailable', async () => {
    const engine = new AudioEngine();
    const result = await engine.start();
    assert.equal(result, false);
    assert.equal(engine.status(), 'unsupported');
    assert.ok(engine.errorMessage());
  });

  it('SEC-05: blocks microphone start when running inside an embedded iframe', async () => {
    const engine = new AudioEngine();
    engine.configureEnvironment({
      isTopFrame: () => false,
    });
    const result = await engine.start();
    assert.equal(result, false);
    assert.equal(engine.status(), 'denied');
  });

  it('SEC-12: start() is re-entrant while requesting and concurrent stop() cancels and stops tracks', async () => {
    const engine = new AudioEngine();
    const fakeCtx = createFakeAudioContext();
    const fakeTrack = createFakeTrack();

    let resolveStream!: (stream: MediaStream) => void;
    let getUserMediaCalls = 0;

    engine.configureEnvironment({
      createAudioContext: () => fakeCtx as unknown as AudioContext,
      createWorkletNode: () => createFakeWorkletNode(),
      getUserMedia: () => {
        getUserMediaCalls++;
        return new Promise<MediaStream>((resolve) => {
          resolveStream = resolve;
        });
      },
    });

    const p1 = engine.start();
    const p2 = engine.start();
    assert.equal(engine.status(), 'requesting');
    assert.equal(getUserMediaCalls, 1);

    // Concurrent stop() before getUserMedia resolves
    engine.stop();
    assert.equal(engine.status(), 'idle');

    // Now resolve getUserMedia: track must be immediately stopped and status stays idle
    resolveStream({
      getTracks: () => [fakeTrack as unknown as MediaStreamTrack],
      getAudioTracks: () => [fakeTrack as unknown as MediaStreamTrack],
    } as unknown as MediaStream);

    const [r1, r2] = await Promise.all([p1, p2]);
    assert.equal(r1, false);
    assert.equal(r2, false);
    assert.equal(fakeTrack.stopped, true);
    assert.equal(engine.status(), 'idle');
  });

  it('SEC-06 & P1.5: suspends on background and releases mic track after grace timeout', async () => {
    const engine = new AudioEngine();
    const fakeCtx = createFakeAudioContext();
    const fakeTrack = createFakeTrack();

    engine.setGracePeriodMs(20);
    engine.configureEnvironment({
      createAudioContext: () => fakeCtx as unknown as AudioContext,
      createWorkletNode: () => createFakeWorkletNode(),
      getUserMedia: async () =>
        ({
          getTracks: () => [fakeTrack as unknown as MediaStreamTrack],
          getAudioTracks: () => [fakeTrack as unknown as MediaStreamTrack],
        }) as unknown as MediaStream,
    });

    const started = await engine.start();
    assert.equal(started, true);
    assert.equal(engine.status(), 'active');

    await engine.suspendForBackground();
    assert.equal(engine.status(), 'suspended');
    assert.equal(fakeCtx.state, 'suspended');
    assert.equal(fakeTrack.stopped, false);

    await new Promise((r) => setTimeout(r, 35));
    assert.equal(fakeTrack.stopped, true);
    engine.ngOnDestroy();
  });

  it('P1.5: AudioLifecycleService suspends on hidden and resumes on visible', async () => {
    const engine = new AudioEngine();
    const lifecycle = new AudioLifecycleService();
    lifecycle.bindEngine(engine);
    const fakeCtx = createFakeAudioContext();
    const fakeTrack = createFakeTrack();

    engine.configureEnvironment({
      createAudioContext: () => fakeCtx as unknown as AudioContext,
      createWorkletNode: () => createFakeWorkletNode(),
      getUserMedia: async () =>
        ({
          getTracks: () => [fakeTrack as unknown as MediaStreamTrack],
          getAudioTracks: () => [fakeTrack as unknown as MediaStreamTrack],
        }) as unknown as MediaStream,
    });

    await engine.start();
    assert.equal(engine.status(), 'active');

    await lifecycle.handleVisibilityChange('hidden');
    assert.equal(engine.status(), 'suspended');

    await lifecycle.handleVisibilityChange('visible');
    assert.equal(engine.status(), 'active');

    lifecycle.ngOnDestroy();
    engine.ngOnDestroy();
  });

  it('SEC-07 & P1.5: handles track ended/mute and AudioContext interrupted states', async () => {
    const engine = new AudioEngine();
    const fakeCtx = createFakeAudioContext();
    const fakeTrack = createFakeTrack();

    engine.configureEnvironment({
      createAudioContext: () => fakeCtx as unknown as AudioContext,
      createWorkletNode: () => createFakeWorkletNode(),
      getUserMedia: async () =>
        ({
          getTracks: () => [fakeTrack as unknown as MediaStreamTrack],
          getAudioTracks: () => [fakeTrack as unknown as MediaStreamTrack],
        }) as unknown as MediaStream,
    });

    await engine.start();
    assert.equal(engine.status(), 'active');

    // OS mute -> interrupted
    fakeTrack.emit('mute');
    assert.equal(engine.status(), 'interrupted');

    // Unmute -> active
    fakeTrack.emit('unmute');
    assert.equal(engine.status(), 'active');

    // iOS interruption -> interrupted
    fakeCtx.setState('interrupted');
    assert.equal(engine.status(), 'interrupted');

    // Track ended (device unplugged) -> interrupted and cleaned up
    fakeCtx.setState('running');
    assert.equal(engine.status(), 'active');
    fakeTrack.emit('ended');
    assert.equal(engine.status(), 'interrupted');
    assert.ok(engine.errorMessage()?.includes('disconnected'));
    engine.ngOnDestroy();
  });

  it('P1.6 & SEC-15: ToneGeneratorService gates detection during playback + 150ms tail', async () => {
    const toneGen = new ToneGeneratorService();
    assert.equal(toneGen.isPlaying(), false);
    assert.equal(toneGen.isGated(), false);

    toneGen.play(440, 69, 30);
    assert.equal(toneGen.isPlaying(), true);
    assert.equal(toneGen.isGated(), true);
    assert.equal(toneGen.playingMidi(), 69);

    // Wait for tone duration (30ms) to finish: isPlaying becomes false, but 150ms tail keeps isGated true!
    await new Promise((r) => setTimeout(r, 45));
    assert.equal(toneGen.isPlaying(), false);
    assert.equal(toneGen.isGated(), true);

    // Wait for 150ms gate tail to expire
    await new Promise((r) => setTimeout(r, 160));
    assert.equal(toneGen.isGated(), false);
    toneGen.ngOnDestroy();
  });

  it('P3.4 (TD-21): reuses AudioContext, worklet module, and stream across fast pause/resume without re-fetching worklet', async () => {
    const engine = new AudioEngine();
    const fakeCtx = createFakeAudioContext();
    const fakeTrack = createFakeTrack();
    let getUserMediaCalls = 0;
    let createWorkletCalls = 0;

    engine.setGracePeriodMs(5000);
    engine.configureEnvironment({
      createAudioContext: () => fakeCtx as unknown as AudioContext,
      createWorkletNode: () => {
        createWorkletCalls++;
        return createFakeWorkletNode();
      },
      getUserMedia: async () => {
        getUserMediaCalls++;
        return {
          getTracks: () => [fakeTrack as unknown as MediaStreamTrack],
          getAudioTracks: () => [fakeTrack as unknown as MediaStreamTrack],
        } as unknown as MediaStream;
      },
    });

    assert.equal(await engine.start(), true);
    assert.equal(engine.status(), 'active');
    assert.equal(engine.workletModuleLoads, 1);
    assert.equal(getUserMediaCalls, 1);
    assert.equal(createWorkletCalls, 1);

    // Fast pause -> resume
    await engine.pause();
    assert.equal(engine.status(), 'suspended');
    assert.equal(engine.hasWarmCaptureGraph, true);

    const t0 = performance.now();
    const resumed = await engine.resumeFromSuspension();
    const elapsedMs = performance.now() - t0;

    assert.equal(resumed, true);
    assert.equal(engine.status(), 'active');
    assert.ok(elapsedMs <= 150, `Expected fast resume <= 150ms, took ${elapsedMs}ms`);
    assert.equal(engine.workletModuleLoads, 1);
    assert.equal(getUserMediaCalls, 1);
    assert.equal(createWorkletCalls, 1);

    engine.ngOnDestroy();
  });

  it('P3.4 (TD-21): queries navigator.permissions.query({ name: "microphone" }) at startup and reacts to onchange', async () => {
    const engine = new AudioEngine();
    const fakeCtx = createFakeAudioContext();
    const fakeTrack = createFakeTrack();

    const permissionStatus: PermissionStatusLike = {
      state: 'granted',
      onchange: null,
    };

    engine.configureEnvironment({
      createAudioContext: () => fakeCtx as unknown as AudioContext,
      createWorkletNode: () => createFakeWorkletNode(),
      getUserMedia: async () =>
        ({
          getTracks: () => [fakeTrack as unknown as MediaStreamTrack],
          getAudioTracks: () => [fakeTrack as unknown as MediaStreamTrack],
        }) as unknown as MediaStream,
      queryMicrophonePermission: async () => permissionStatus,
    });

    const initialPerm = await engine.checkMicrophonePermission();
    assert.equal(initialPerm, 'granted');
    assert.equal(engine.permissionState(), 'granted');
    assert.equal(engine.status(), 'idle');

    await engine.start();
    assert.equal(engine.status(), 'active');

    // Simulate user revoking permission in browser settings while active
    permissionStatus.state = 'denied';
    permissionStatus.onchange?.();
    assert.equal(engine.permissionState(), 'denied');
    assert.equal(engine.status(), 'denied');
    assert.equal(fakeTrack.stopped, true);

    // Simulate user re-granting permission
    permissionStatus.state = 'granted';
    permissionStatus.onchange?.();
    assert.equal(engine.permissionState(), 'granted');
    assert.equal(engine.status(), 'idle');

    engine.ngOnDestroy();
  });
});
