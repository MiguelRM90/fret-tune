import { Instrument, asTuningId } from '../../models';

export const BASS_INSTRUMENT: Instrument = {
  id: 'bass',
  name: 'Bass',
  analysis: {
    minFrequency: 28,
    maxFrequency: 600,
    frameSize: 4096,
    hopSize: 1024,
    decimationFactor: 4,
    windowPeriods: 2.38,
  },
  tunings: [
    { id: asTuningId('standard'), name: 'Standard', strings: [28, 33, 38, 43] },
    { id: asTuningId('half-step-down'), name: 'Half step down', strings: [27, 32, 37, 42] },
    { id: asTuningId('drop-d'), name: 'Drop D', strings: [26, 33, 38, 43] },
    { id: asTuningId('five-string'), name: '5-string standard', strings: [23, 28, 33, 38, 43] },
  ],
};

