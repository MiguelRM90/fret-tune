/// <reference lib="webworker" />

import { DETECTION_TUNING } from '../constants/audio.constants';
import { PitchDetectionRequest, PitchDetectionResponse } from '../models';
import { McLeodPitchDetector } from './mcleod-pitch-detector';

const detector = new McLeodPitchDetector(DETECTION_TUNING);

addEventListener('message', ({ data }: MessageEvent<PitchDetectionRequest>) => {
  const response: PitchDetectionResponse = {
    estimate: detector.detect(data.samples, data.sampleRate, data.range),
  };
  postMessage(response);
});

