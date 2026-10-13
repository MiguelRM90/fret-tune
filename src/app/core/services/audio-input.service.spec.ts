import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AudioInputService } from './audio-input.service';

describe('AudioInputService', () => {
  it('initializes with idle status and default frame size', () => {
    const service = new AudioInputService();
    assert.equal(service.status(), 'idle');
    assert.equal(service.frameSize, 4096);
  });

  it('allocates ringBuffer lazily when setFrameSize is called with initial size', () => {
    const service = new AudioInputService();
    // Initially buffer is empty (0-length)
    const target = new Float32Array(4096);
    assert.equal(service.read(target), false);

    // Explicitly set frame size
    service.setFrameSize(4096);
    assert.equal(service.frameSize, 4096);
  });

  it('resizes buffer when requested frame size changes', () => {
    const service = new AudioInputService();
    service.setFrameSize(8192);
    assert.equal(service.frameSize, 8192);

    service.setFrameSize(4096);
    assert.equal(service.frameSize, 4096);
  });

  it('fails safely when navigator is unavailable or getUserMedia is missing', async () => {
    const service = new AudioInputService();
    const result = await service.start();
    assert.equal(result, false);
    assert.equal(service.status(), 'unsupported');
    assert.ok(service.errorMessage());
  });
});

