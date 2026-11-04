import { AnalysisProfile, Instrument, InstrumentId } from '../../models';
import { BASS_INSTRUMENT } from './bass.instrument';
import { GUITAR_INSTRUMENT } from './guitar.instrument';
import { UKULELE_INSTRUMENT } from './ukulele.instrument';

export { BASS_INSTRUMENT, GUITAR_INSTRUMENT, UKULELE_INSTRUMENT };

export const INSTRUMENTS: readonly Instrument[] = [
  GUITAR_INSTRUMENT,
  BASS_INSTRUMENT,
  UKULELE_INSTRUMENT,
];

export const DEFAULT_INSTRUMENT_ID: InstrumentId = 'guitar';

export function findInstrument(id: InstrumentId): Instrument {
  return INSTRUMENTS.find((instrument) => instrument.id === id) ?? INSTRUMENTS[0];
}

export function isInstrumentId(value: unknown): value is InstrumentId {
  return INSTRUMENTS.some((instrument) => instrument.id === value);
}

export function computeEffectiveWindowSize(profile: AnalysisProfile, sampleRate: number): number {
  const maxLag = Math.ceil(sampleRate / profile.minFrequency) + 2;
  const periods = profile.windowPeriods ?? 2.38;
  const minRequired = maxLag * 2 + 4;
  const idealSize = Math.max(minRequired, Math.ceil(maxLag * periods));
  return Math.min(profile.frameSize, idealSize);
}

