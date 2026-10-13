class AudioInputProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 512;
    this.buffer = new Float32Array(this.bufferSize);
    this.offset = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) {
      return true;
    }

    const channel = input[0];
    if (!channel || channel.length === 0) {
      return true;
    }

    let i = 0;
    while (i < channel.length) {
      const toCopy = Math.min(channel.length - i, this.bufferSize - this.offset);
      this.buffer.set(channel.subarray(i, i + toCopy), this.offset);
      this.offset += toCopy;
      i += toCopy;

      if (this.offset >= this.bufferSize) {
        this.port.postMessage(this.buffer, [this.buffer.buffer]);
        this.buffer = new Float32Array(this.bufferSize);
        this.offset = 0;
      }
    }

    return true;
  }
}

registerProcessor('audio-input-processor', AudioInputProcessor);

