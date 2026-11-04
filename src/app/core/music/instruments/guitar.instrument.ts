import { Instrument, asTuningId } from '../../models';

export const GUITAR_INSTRUMENT: Instrument = {
  id: 'guitar',
  name: 'Guitar',
  analysis: {
    minFrequency: 55,
    maxFrequency: 1400,
    frameSize: 2048,
    hopSize: 1024,
    decimationFactor: 2,
    windowPeriods: 2.35,
  },
  tunings: [
    { id: asTuningId('standard'), name: 'Standard', strings: [40, 45, 50, 55, 59, 64] },
    { id: asTuningId('half-step-down'), name: 'Half step down', strings: [39, 44, 49, 54, 58, 63] },
    { id: asTuningId('drop-d'), name: 'Drop D', strings: [38, 45, 50, 55, 59, 64] },
    { id: asTuningId('drop-c'), name: 'Drop C', strings: [36, 43, 48, 53, 57, 62] },
    { id: asTuningId('dadgad'), name: 'DADGAD', strings: [38, 45, 50, 55, 57, 62] },
    { id: asTuningId('open-g'), name: 'Open G', strings: [38, 43, 50, 55, 59, 62] },
    { id: asTuningId('open-d'), name: 'Open D', strings: [38, 45, 50, 54, 57, 62] },
    { id: asTuningId('open-e'), name: 'Open E', strings: [40, 47, 52, 56, 59, 64] },
  ],
};

