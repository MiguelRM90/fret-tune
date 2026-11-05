import {
  CAPTURE_WORKLET_NAME,
  WORKLET_BLOCK_SIZE,
  WORKLET_POOL_SIZE,
  WorkletInboundMessage,
  WorkletOutboundMessage,
} from './protocol';

declare abstract class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor();
  abstract process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean;
}

declare function registerProcessor(
  name: string,
  processorCtor: new () => AudioWorkletProcessor,
): void;

declare const currentFrame: number;
declare const sampleRate: number;

export class CaptureWorkletProcessor extends AudioWorkletProcessor {
  private readonly blockSize = WORKLET_BLOCK_SIZE;
  private readonly freeBuffers: Float32Array[] = [];
  private activeBuffer: Float32Array;
  private writeOffset = 0;
  private workerPort: MessagePort | null = null;

  constructor() {
    super();
    for (let i = 0; i < WORKLET_POOL_SIZE; i++) {
      this.freeBuffers.push(new Float32Array(this.blockSize));
    }
    this.activeBuffer = this.freeBuffers.pop() as Float32Array;

    this.port.onmessage = (event: MessageEvent<WorkletInboundMessage>) => {
      this.handleInbound(event.data);
    };
  }

  override process(inputs: Float32Array[][]): boolean {
    const input = inputs[0];
    if (!input || input.length === 0) {
      return true;
    }

    const channel = input[0];
    if (!channel || channel.length === 0) {
      return true;
    }

    let i = 0;
    const len = channel.length;
    while (i < len) {
      const remainingInBlock = this.blockSize - this.writeOffset;
      const toCopy = Math.min(len - i, remainingInBlock);

      for (let j = 0; j < toCopy; j++) {
        this.activeBuffer[this.writeOffset + j] = channel[i + j];
      }

      this.writeOffset += toCopy;
      i += toCopy;

      if (this.writeOffset >= this.blockSize) {
        this.flushBlock();
      }
    }

    return true;
  }

  private handleInbound(message: WorkletInboundMessage): void {
    if (!message || typeof message !== 'object') {
      return;
    }

    if (message.type === 'attach-port') {
      this.workerPort = message.port;
      this.workerPort.onmessage = (event: MessageEvent<WorkletInboundMessage>) => {
        this.handleInbound(event.data);
      };
      return;
    }

    if (message.type === 'recycle' && message.buffer.byteLength === this.blockSize * 4) {
      if (this.freeBuffers.length < WORKLET_POOL_SIZE) {
        this.freeBuffers.push(new Float32Array(message.buffer));
      }
    }
  }

  private flushBlock(): void {
    const targetPort = this.workerPort ?? this.port;
    const frameNow = typeof currentFrame === 'number' ? currentFrame : 0;
    const rateNow = typeof sampleRate === 'number' ? sampleRate : 48000;
    this.writeOffset = 0;

    // The outgoing buffer is transferred (detached), so it must never be referenced again:
    // it only returns to the pool through a 'recycle' message. With no free buffer, the block is dropped.
    const nextBuffer = this.freeBuffers.pop();
    if (!nextBuffer) {
      return;
    }

    const outgoing = this.activeBuffer;
    this.activeBuffer = nextBuffer;

    const payload: WorkletOutboundMessage = {
      type: 'samples',
      samples: outgoing,
      currentFrame: frameNow,
      sampleRate: rateNow,
    };
    targetPort.postMessage(payload, [outgoing.buffer]);
  }
}

registerProcessor(CAPTURE_WORKLET_NAME, CaptureWorkletProcessor);

