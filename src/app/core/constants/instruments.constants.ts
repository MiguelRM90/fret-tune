import { Instrument, InstrumentId } from '../models';

export const INSTRUMENTS: readonly Instrument[] = [
  {
    id: 'guitar',
    name: 'Guitar',
    analysis: { minFrequency: 55, maxFrequency: 1400, frameSize: 4096 },
    tunings: [
      { id: 'standard', name: 'Standard', strings: [40, 45, 50, 55, 59, 64] },
      { id: 'half-step-down', name: 'Half step down', strings: [39, 44, 49, 54, 58, 63] },
      { id: 'drop-d', name: 'Drop D', strings: [38, 45, 50, 55, 59, 64] },
      { id: 'drop-c', name: 'Drop C', strings: [36, 43, 48, 53, 57, 62] },
      { id: 'dadgad', name: 'DADGAD', strings: [38, 45, 50, 55, 57, 62] },
      { id: 'open-g', name: 'Open G', strings: [38, 43, 50, 55, 59, 62] },
      { id: 'open-d', name: 'Open D', strings: [38, 45, 50, 54, 57, 62] },
      { id: 'open-e', name: 'Open E', strings: [40, 47, 52, 56, 59, 64] },
    ],
  },
  {
    id: 'bass',
    name: 'Bass',
    analysis: { minFrequency: 28, maxFrequency: 600, frameSize: 8192 },
    tunings: [
      { id: 'standard', name: 'Standard', strings: [28, 33, 38, 43] },
      { id: 'half-step-down', name: 'Half step down', strings: [27, 32, 37, 42] },
      { id: 'drop-d', name: 'Drop D', strings: [26, 33, 38, 43] },
      { id: 'five-string', name: '5-string standard', strings: [23, 28, 33, 38, 43] },
    ],
  },
  {
    id: 'ukulele',
    name: 'Ukulele',
    analysis: { minFrequency: 110, maxFrequency: 1400, frameSize: 4096 },
    tunings: [
      { id: 'standard', name: 'Standard (high G)', strings: [67, 60, 64, 69] },
      { id: 'low-g', name: 'Low G', strings: [55, 60, 64, 69] },
      { id: 'd-tuning', name: 'D tuning', strings: [69, 62, 66, 71] },
      { id: 'baritone', name: 'Baritone', strings: [50, 55, 59, 64] },
    ],
  },
];

export const DEFAULT_INSTRUMENT_ID: InstrumentId = 'guitar';

export function findInstrument(id: InstrumentId): Instrument {
  return INSTRUMENTS.find((instrument) => instrument.id === id) ?? INSTRUMENTS[0];
}

export function isInstrumentId(value: unknown): value is InstrumentId {
  return INSTRUMENTS.some((instrument) => instrument.id === value);
}

