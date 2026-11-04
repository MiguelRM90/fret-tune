import { Instrument, asTuningId } from '../../models';

export const UKULELE_INSTRUMENT: Instrument = {
  id: 'ukulele',
  name: 'Ukulele',
  analysis: {
    minFrequency: 110,
    maxFrequency: 1400,
    frameSize: 2048,
    hopSize: 1024,
    decimationFactor: 2,
    windowPeriods: 2.35,
  },
  tunings: [
    { id: asTuningId('standard'), name: 'Standard (high G)', strings: [67, 60, 64, 69] },
    { id: asTuningId('low-g'), name: 'Low G', strings: [55, 60, 64, 69] },
    { id: asTuningId('d-tuning'), name: 'D tuning', strings: [69, 62, 66, 71] },
    { id: asTuningId('baritone'), name: 'Baritone', strings: [50, 55, 59, 64] },
  ],
};

