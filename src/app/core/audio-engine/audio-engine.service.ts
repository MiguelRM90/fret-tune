import { OnDestroy, Service, signal } from '@angular/core';
import { BACKGROUND_MIC_RELEASE_MS } from '../constants';
import { MicrophoneStatus } from '../models';
import { CAPTURE_WORKLET_NAME, CAPTURE_WORKLET_PATH } from '../workers/protocol';

export interface ToneOutputHandle {
  readonly context: AudioContext;
  readonly destination: AudioNode;
}

export interface AudioScheduler {
  readonly isRunning: boolean;
  start(): void;
  stop(): void;
}

export interface AudioSchedulerOptions {
  readonly lookaheadMs?: number;
  readonly scheduleHorizonSec?: number;
}

export interface PermissionStatusLike {
  state: PermissionState;
  onchange: (() => void) | null;
}

export interface AudioEngineEnvironment {
  readonly createAudioContext?: () => AudioContext;
  readonly getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  readonly createWorkletNode?: (context: AudioContext, name: string) => AudioWorkletNode;
  readonly isTopFrame?: () => boolean;
  readonly queryMicrophonePermission?: () => Promise<PermissionStatusLike | null>;
}

@Service()
export class AudioEngine implements OnDestroy {
  readonly status = signal<MicrophoneStatus>('idle');
  readonly errorMessage = signal<string | null>(null);
  readonly permissionState = signal<PermissionState | 'unknown'>('unknown');

  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private muteGainNode: GainNode | null = null;
  private workletModuleLoaded = false;
  private workletLoadCount = 0;

  private sessionId = 0;
  private inFlightStart: Promise<boolean> | null = null;
  private activeTrack: MediaStreamTrack | null = null;
  private pendingPort: MessagePort | null = null;
  private portAttachedToCurrentWorklet = false;
  private graceTimer: ReturnType<typeof setTimeout> | null = null;
  private releasedByBackgroundTimeout = false;
  private gracePeriodMs = BACKGROUND_MIC_RELEASE_MS;
  private pauseCallback: ((paused: boolean) => void) | null = null;
  private permissionStatusHandle: PermissionStatusLike | null = null;

  private env: AudioEngineEnvironment = {};

  private readonly onTrackEnded = (): void => {
    if (this.status() === 'active' || this.status() === 'suspended') {
      this.cleanupStreamAndNodes();
      this.status.set('interrupted');
      this.errorMessage.set('Microphone disconnected or permission revoked.');
      this.pauseCallback?.(true);
    }
  };

  private readonly onTrackMute = (): void => {
    if (this.status() === 'active') {
      this.status.set('interrupted');
      this.errorMessage.set('Microphone input was muted by the system.');
      this.pauseCallback?.(true);
    }
  };

  private readonly onTrackUnmute = (): void => {
    if (this.status() === 'interrupted' && this.audioContext?.state === 'running') {
      this.status.set('active');
      this.errorMessage.set(null);
      this.pauseCallback?.(false);
    }
  };

  private readonly onContextStateChange = (): void => {
    const ctx = this.audioContext;
    if (!ctx) return;

    const state = ctx.state as AudioContextState | 'interrupted';
    const currentStatus = this.status();

    if (state === 'interrupted') {
      if (currentStatus === 'active' || currentStatus === 'suspended') {
        this.status.set('interrupted');
        this.errorMessage.set('Audio session was interrupted by the system.');
        this.pauseCallback?.(true);
      }
    } else if (state === 'suspended') {
      if (currentStatus === 'active') {
        this.status.set('suspended');
        this.pauseCallback?.(true);
      }
    } else if (state === 'running') {
      if (
        (currentStatus === 'suspended' || currentStatus === 'interrupted') &&
        this.activeTrack &&
        this.activeTrack.readyState === 'live'
      ) {
        this.status.set('active');
        this.errorMessage.set(null);
        this.pauseCallback?.(false);
      }
    }
  };

  configureEnvironment(env: AudioEngineEnvironment): void {
    this.env = env;
  }

  setGracePeriodMs(ms: number): void {
    this.gracePeriodMs = Math.max(0, ms);
  }

  onPauseStateChange(callback: ((paused: boolean) => void) | null): void {
    this.pauseCallback = callback;
  }

  get sampleRate(): number {
    return this.audioContext?.sampleRate ?? 48000;
  }

  get currentTime(): number {
    return this.audioContext?.currentTime ?? 0;
  }

  get workletModuleLoads(): number {
    return this.workletLoadCount;
  }

  get hasWarmCaptureGraph(): boolean {
    return Boolean(
      this.audioContext &&
        this.workletModuleLoaded &&
        this.workletNode &&
        this.activeTrack &&
        this.activeTrack.readyState === 'live' &&
        !this.releasedByBackgroundTimeout,
    );
  }

  async checkMicrophonePermission(): Promise<PermissionState | 'unknown'> {
    const queryFn =
      this.env.queryMicrophonePermission ??
      (typeof navigator !== 'undefined' && navigator.permissions?.query
        ? () =>
            navigator.permissions.query({
              name: 'microphone' as PermissionName,
            }) as Promise<PermissionStatusLike>
        : undefined);

    if (!queryFn) {
      return this.permissionState();
    }

    try {
      const statusObj = await queryFn();
      if (!statusObj) {
        return this.permissionState();
      }
      if (this.permissionStatusHandle && this.permissionStatusHandle !== statusObj) {
        this.permissionStatusHandle.onchange = null;
      }
      this.permissionStatusHandle = statusObj;
      this.applyPermissionState(statusObj.state);
      statusObj.onchange = () => {
        this.applyPermissionState(statusObj.state);
      };
      return statusObj.state;
    } catch {
      return this.permissionState();
    }
  }

  async start(): Promise<boolean> {
    if (this.status() === 'active') {
      return true;
    }
    if (this.status() === 'requesting' && this.inFlightStart) {
      return this.inFlightStart;
    }

    this.clearGraceTimer();

    if (this.hasWarmCaptureGraph) {
      return this.resumeWarmGraph();
    }

    this.releasedByBackgroundTimeout = false;

    const currentSession = ++this.sessionId;
    const startPromise = this.executeStart(currentSession);
    this.inFlightStart = startPromise;

    try {
      return await startPromise;
    } finally {
      if (this.inFlightStart === startPromise) {
        this.inFlightStart = null;
      }
    }
  }

  private async executeStart(session: number): Promise<boolean> {
    if (!this.checkTopFrameAllowed()) {
      this.status.set('denied');
      this.errorMessage.set('Microphone cannot be started inside an embedded frame.');
      return false;
    }

    const getUserMedia =
      this.env.getUserMedia ??
      (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia
        ? (c: MediaStreamConstraints) => navigator.mediaDevices.getUserMedia(c)
        : undefined);

    if (!getUserMedia || (typeof window === 'undefined' && !this.env.createAudioContext)) {
      this.status.set('unsupported');
      this.errorMessage.set('Microphone access is not supported by this browser.');
      return false;
    }

    this.status.set('requesting');
    this.errorMessage.set(null);

    let stream: MediaStream | null = null;

    try {
      const context = this.ensureAudioContext();
      if (!context) {
        this.status.set('unsupported');
        this.errorMessage.set('Web Audio API is not supported by this browser.');
        return false;
      }

      if (!context.audioWorklet && !this.env.createWorkletNode) {
        this.status.set('unsupported');
        this.errorMessage.set('AudioWorklet is not supported by this browser.');
        return false;
      }

      stream = await getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });

      if (session !== this.sessionId) {
        this.stopMediaStream(stream);
        return false;
      }

      if (context.state === 'suspended' || (context.state as string) === 'interrupted') {
        await context.resume();
      }

      if (session !== this.sessionId) {
        this.stopMediaStream(stream);
        return false;
      }

      if (!this.workletModuleLoaded && context.audioWorklet) {
        const processorUrl =
          typeof document !== 'undefined'
            ? new URL(CAPTURE_WORKLET_PATH, document.baseURI).href
            : CAPTURE_WORKLET_PATH;
        await context.audioWorklet.addModule(processorUrl);
        this.workletModuleLoaded = true;
        this.workletLoadCount++;
      }

      if (session !== this.sessionId) {
        this.stopMediaStream(stream);
        return false;
      }

      this.cleanupStreamAndNodes();
      this.mediaStream = stream;
      this.bindTrackListeners(stream);

      const source = context.createMediaStreamSource(stream);
      const worklet = this.env.createWorkletNode
        ? this.env.createWorkletNode(context, CAPTURE_WORKLET_NAME)
        : new AudioWorkletNode(context, CAPTURE_WORKLET_NAME);

      this.portAttachedToCurrentWorklet = false;
      if (this.pendingPort) {
        this.transferPortToWorklet(worklet, this.pendingPort);
        this.pendingPort = null;
      }

      // Safari/WebKit requires a connected path to destination to pull AudioWorkletNodes reliably.
      const muteGain = context.createGain();
      muteGain.gain.setValueAtTime(0, context.currentTime);

      source.connect(worklet);
      worklet.connect(muteGain);
      muteGain.connect(context.destination);

      this.sourceNode = source;
      this.workletNode = worklet;
      this.muteGainNode = muteGain;
      this.permissionState.set('granted');
      this.status.set('active');
      this.pauseCallback?.(false);
      return true;
    } catch (err) {
      if (stream) {
        this.stopMediaStream(stream);
      }
      if (session !== this.sessionId) {
        return false;
      }
      this.classifyError(err);
      return false;
    }
  }

  async pause(): Promise<void> {
    return this.suspendForBackground();
  }

  async suspendForBackground(): Promise<void> {
    if (this.status() !== 'active') {
      return;
    }

    this.status.set('suspended');
    this.pauseCallback?.(true);

    if (this.audioContext && this.audioContext.state === 'running') {
      try {
        await this.audioContext.suspend();
      } catch {}
    }

    this.clearGraceTimer();
    this.graceTimer = setTimeout(() => {
      this.graceTimer = null;
      if (this.status() === 'suspended') {
        this.cleanupStreamAndNodes();
        this.releasedByBackgroundTimeout = true;
      }
    }, this.gracePeriodMs);

    const unrefTimer = this.graceTimer as unknown as { unref?: () => void };
    unrefTimer.unref?.();
  }

  async resumeFromSuspension(): Promise<boolean> {
    if (!this.checkTopFrameAllowed()) {
      this.status.set('denied');
      this.errorMessage.set('Microphone cannot be started inside an embedded frame.');
      return false;
    }

    this.clearGraceTimer();

    const currentStatus = this.status();
    if (currentStatus === 'active') {
      return true;
    }

    if (!this.hasWarmCaptureGraph) {
      return this.start();
    }

    return this.resumeWarmGraph();
  }

  handleDeviceChange(): void {
    if (
      (this.status() === 'active' || this.status() === 'suspended') &&
      (!this.activeTrack || this.activeTrack.readyState === 'ended')
    ) {
      this.cleanupStreamAndNodes();
      this.status.set('interrupted');
      this.errorMessage.set('Audio input device changed or disconnected.');
      this.pauseCallback?.(true);
    }
  }

  stop(): void {
    this.sessionId++;
    this.inFlightStart = null;
    this.clearGraceTimer();
    this.releasedByBackgroundTimeout = false;
    this.cleanupStreamAndNodes();

    if (this.audioContext && this.audioContext.state === 'running') {
      this.audioContext.suspend().catch(() => {});
    }

    this.status.set('idle');
    this.errorMessage.set(null);
    this.pauseCallback?.(true);
  }

  close(): void {
    this.stop();
    if (this.audioContext) {
      this.audioContext.onstatechange = null;
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
      this.workletModuleLoaded = false;
    }
  }

  attachCapturePort(port: MessagePort): void {
    if (this.workletNode) {
      this.transferPortToWorklet(this.workletNode, port);
    } else {
      this.pendingPort = port;
    }
  }

  get hasAttachedCapturePort(): boolean {
    return this.portAttachedToCurrentWorklet && this.workletNode !== null;
  }

  createToneOutput(): ToneOutputHandle | null {
    const context = this.ensureAudioContext();
    if (!context) {
      return null;
    }
    if (context.state === 'suspended') {
      context.resume().catch(() => {});
    }
    return {
      context,
      destination: context.destination,
    };
  }

  releaseToneOutput(): void {
    if (this.status() !== 'active' && this.audioContext && this.audioContext.state === 'running') {
      this.audioContext.suspend().catch(() => {});
    }
  }

  createScheduler(
    callback: (horizonTimeSec: number, currentTimeSec: number) => void,
    options: AudioSchedulerOptions = {},
  ): AudioScheduler {
    const lookaheadMs = options.lookaheadMs ?? 25;
    const scheduleHorizonSec = options.scheduleHorizonSec ?? 0.1;
    let timerId: ReturnType<typeof setInterval> | null = null;

    return {
      get isRunning(): boolean {
        return timerId !== null;
      },
      start: (): void => {
        if (timerId !== null) return;
        const ctx = this.ensureAudioContext();
        if (!ctx) return;
        if (ctx.state === 'suspended') {
          ctx.resume().catch(() => {});
        }
        timerId = setInterval(() => {
          const now = ctx.currentTime;
          callback(now + scheduleHorizonSec, now);
        }, lookaheadMs);
      },
      stop: (): void => {
        if (timerId !== null) {
          clearInterval(timerId);
          timerId = null;
        }
      },
    };
  }

  ngOnDestroy(): void {
    if (this.permissionStatusHandle) {
      this.permissionStatusHandle.onchange = null;
      this.permissionStatusHandle = null;
    }
    this.close();
  }

  private async resumeWarmGraph(): Promise<boolean> {
    if (!this.audioContext) {
      return false;
    }
    try {
      if (this.audioContext.state !== 'running') {
        await this.audioContext.resume();
      }
      if (this.audioContext.state === 'running') {
        if (this.pendingPort && this.workletNode) {
          this.transferPortToWorklet(this.workletNode, this.pendingPort);
          this.pendingPort = null;
        }
        this.status.set('active');
        this.errorMessage.set(null);
        this.pauseCallback?.(false);
        return true;
      }
    } catch {
      this.status.set('interrupted');
      this.errorMessage.set('Tap Resume to continue audio capture.');
      return false;
    }
    return false;
  }

  private checkTopFrameAllowed(): boolean {
    if (this.env.isTopFrame) {
      return this.env.isTopFrame();
    }
    if (typeof window === 'undefined') {
      return true;
    }
    try {
      return window.top === window.self;
    } catch {
      return false;
    }
  }

  private applyPermissionState(state: PermissionState): void {
    this.permissionState.set(state);
    if (state === 'denied') {
      const current = this.status();
      if (current === 'active' || current === 'suspended' || current === 'requesting') {
        this.sessionId++;
        this.cleanupStreamAndNodes();
        this.pauseCallback?.(true);
      }
      this.status.set('denied');
      this.errorMessage.set('Microphone permission was denied.');
    } else if (state === 'granted' && this.status() === 'denied') {
      this.status.set('idle');
      this.errorMessage.set(null);
    }
  }

  private ensureAudioContext(): AudioContext | null {
    if (this.audioContext && this.audioContext.state !== 'closed') {
      return this.audioContext;
    }

    this.workletModuleLoaded = false;

    if (this.env.createAudioContext) {
      this.audioContext = this.env.createAudioContext();
      this.audioContext.onstatechange = this.onContextStateChange;
      return this.audioContext;
    }

    if (typeof window === 'undefined') {
      return null;
    }

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) {
      return null;
    }

    this.audioContext = new AudioCtx();
    this.audioContext.onstatechange = this.onContextStateChange;
    return this.audioContext;
  }

  private transferPortToWorklet(worklet: AudioWorkletNode, port: MessagePort): void {
    worklet.port.postMessage({ type: 'attach-port', port }, [port]);
    this.portAttachedToCurrentWorklet = true;
  }

  private bindTrackListeners(stream: MediaStream): void {
    const track = stream.getAudioTracks()[0] ?? null;
    this.activeTrack = track;
    if (track) {
      track.addEventListener('ended', this.onTrackEnded);
      track.addEventListener('mute', this.onTrackMute);
      track.addEventListener('unmute', this.onTrackUnmute);
    }
  }

  private unbindTrackListeners(): void {
    if (this.activeTrack) {
      this.activeTrack.removeEventListener('ended', this.onTrackEnded);
      this.activeTrack.removeEventListener('mute', this.onTrackMute);
      this.activeTrack.removeEventListener('unmute', this.onTrackUnmute);
      this.activeTrack = null;
    }
  }

  private cleanupStreamAndNodes(): void {
    this.unbindTrackListeners();
    this.portAttachedToCurrentWorklet = false;

    if (this.workletNode) {
      this.workletNode.port.onmessage = null;
      try {
        this.workletNode.disconnect();
      } catch {}
      this.workletNode = null;
    }

    if (this.muteGainNode) {
      try {
        this.muteGainNode.disconnect();
      } catch {}
      this.muteGainNode = null;
    }

    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch {}
      this.sourceNode = null;
    }

    if (this.mediaStream) {
      this.stopMediaStream(this.mediaStream);
      this.mediaStream = null;
    }
  }

  private stopMediaStream(stream: MediaStream): void {
    for (const track of stream.getTracks()) {
      try {
        track.stop();
      } catch {}
    }
  }

  private clearGraceTimer(): void {
    if (this.graceTimer !== null) {
      clearTimeout(this.graceTimer);
      this.graceTimer = null;
    }
  }

  private classifyError(err: unknown): void {
    const name = err instanceof DOMException ? err.name : (err as { name?: string })?.name;
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
      this.permissionState.set('denied');
      this.status.set('denied');
      this.errorMessage.set('Microphone permission was denied.');
      return;
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      this.status.set('error');
      this.errorMessage.set('No microphone device was found.');
      return;
    }
    if (name === 'NotReadableError' || name === 'TrackStartError') {
      this.status.set('error');
      this.errorMessage.set('Microphone is already in use by another application.');
      return;
    }
    this.status.set('error');
    this.errorMessage.set('Unable to access microphone.');
  }
}
