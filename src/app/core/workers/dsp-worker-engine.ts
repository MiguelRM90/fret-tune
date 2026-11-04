import { DEFAULT_HOP_SIZE, DETECTION_TUNING, SMOOTHING } from '../constants/audio.constants';
import { DetectorRegistry, PitchSmoother } from '../dsp';
import { AnalysisProfile, DetectorStrategyId, PitchFrame } from '../models';
import { GUITAR_INSTRUMENT } from '../music/instruments';
import { DspCommand, DspEvent } from './protocol';

export class DspWorkerEngine {
  private readonly registry = new DetectorRegistry(DETECTION_TUNING);
  private readonly smoother = new PitchSmoother(SMOOTHING);

  private profile: AnalysisProfile = GUITAR_INSTRUMENT.analysis;
  private detectorId: DetectorStrategyId = 'mpm-fft';
  private sampleRate = 48000;
  private gated = false;
  private paused = false;

  private ringBuffer = new Float32Array(this.profile.frameSize);
  private analysisBuffer = new Float32Array(this.profile.frameSize);
  private writePointer = 0;
  private totalWritten = 0;
  private samplesSinceLastAnalysis = 0;

  get currentProfile(): AnalysisProfile {
    return this.profile;
  }

  get currentDetectorId(): DetectorStrategyId {
    return this.detectorId;
  }

  get isGated(): boolean {
    return this.gated;
  }

  handleCommand(command: DspCommand): DspEvent | null {
    switch (command.type) {
      case 'configure': {
        const prevFrameSize = this.profile.frameSize;
        this.profile = command.profile;
        if (command.sampleRate && command.sampleRate > 0) {
          this.sampleRate = command.sampleRate;
        }
        if (command.detector) {
          this.detectorId = command.detector;
        }
        if (this.profile.frameSize !== prevFrameSize || this.ringBuffer.length !== this.profile.frameSize) {
          this.ringBuffer = new Float32Array(this.profile.frameSize);
          this.analysisBuffer = new Float32Array(this.profile.frameSize);
          this.writePointer = 0;
          this.totalWritten = 0;
          this.samplesSinceLastAnalysis = 0;
        }
        this.smoother.reset();
        return null;
      }

      case 'gate': {
        this.gated = command.gated;
        if (this.gated) {
          this.smoother.reset();
        }
        return null;
      }

      case 'pause': {
        this.paused = command.paused;
        if (this.paused) {
          this.smoother.reset();
        }
        return null;
      }

      case 'reset': {
        this.writePointer = 0;
        this.totalWritten = 0;
        this.samplesSinceLastAnalysis = 0;
        this.ringBuffer.fill(0);
        this.smoother.reset();
        return null;
      }

      case 'analyze': {
        const frame = this.analyzeWindow(command.samples, command.sampleRate, command.currentFrame);
        return { type: 'pitch', frame };
      }

      case 'attach-port': {
        if (command.sampleRate > 0) {
          this.sampleRate = command.sampleRate;
        }
        return null;
      }
    }
  }

  pushSamples(samples: Float32Array, currentFrame: number, sampleRate: number): DspEvent[] {
    if (sampleRate > 0) {
      this.sampleRate = sampleRate;
    }

    const bufferLen = this.ringBuffer.length;
    if (bufferLen === 0) {
      return [];
    }

    for (let i = 0; i < samples.length; i++) {
      this.ringBuffer[this.writePointer] = samples[i];
      this.writePointer = (this.writePointer + 1) % bufferLen;
    }

    this.totalWritten += samples.length;
    this.samplesSinceLastAnalysis += samples.length;

    const hopSize = this.profile.hopSize ?? DEFAULT_HOP_SIZE;
    if (this.samplesSinceLastAnalysis < hopSize || this.totalWritten < bufferLen) {
      return [];
    }

    const events: DspEvent[] = [];
    while (this.samplesSinceLastAnalysis >= hopSize) {
      this.samplesSinceLastAnalysis -= hopSize;
      const frameEndSample = currentFrame - this.samplesSinceLastAnalysis;
      this.readLatestWindow(this.analysisBuffer);
      const frame = this.analyzeWindow(this.analysisBuffer, this.sampleRate, frameEndSample);
      events.push({ type: 'pitch', frame });
    }

    return events;
  }

  private readLatestWindow(target: Float32Array): void {
    const bufferLen = this.ringBuffer.length;
    const tailLen = bufferLen - this.writePointer;
    target.set(this.ringBuffer.subarray(this.writePointer, bufferLen), 0);
    if (this.writePointer > 0) {
      target.set(this.ringBuffer.subarray(0, this.writePointer), tailLen);
    }
  }

  private analyzeWindow(windowSamples: Float32Array, sampleRate: number, currentFrame: number): PitchFrame {
    const timestamp = sampleRate > 0 ? (currentFrame / sampleRate) * 1000 : 0;

    if (this.gated || this.paused) {
      return {
        estimate: null,
        smoothedFrequency: null,
        timestamp,
        currentFrame,
      };
    }

    const detector = this.registry.get(this.detectorId);
    const estimate = detector.detect(windowSamples, sampleRate, this.profile);
    const smoothedFrequency = this.smoother.push(estimate ? estimate.frequency : null, timestamp);

    return {
      estimate,
      smoothedFrequency,
      timestamp,
      currentFrame,
    };
  }
}

