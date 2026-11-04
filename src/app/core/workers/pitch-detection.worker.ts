/// <reference lib="webworker" />

import { DspWorkerEngine } from './dsp-worker-engine';
import { DspCommand, WorkletOutboundMessage } from './protocol';

const engine = new DspWorkerEngine();
let workletPort: MessagePort | null = null;

function bindWorkletPort(port: MessagePort): void {
  if (workletPort) {
    workletPort.onmessage = null;
  }
  workletPort = port;
  workletPort.onmessage = ({ data }: MessageEvent<WorkletOutboundMessage>) => {
    if (data && data.type === 'samples') {
      const events = engine.pushSamples(data.samples, data.currentFrame, data.sampleRate);
      workletPort?.postMessage({ type: 'recycle', buffer: data.samples.buffer }, [data.samples.buffer]);
      for (const event of events) {
        postMessage(event);
      }
    }
  };
}

addEventListener('message', ({ data }: MessageEvent<DspCommand>) => {
  if (!data || typeof data !== 'object' || !('type' in data)) {
    return;
  }

  if (data.type === 'attach-port') {
    bindWorkletPort(data.port);
  }

  const response = engine.handleCommand(data);
  if (response) {
    postMessage(response);
  }
});

