import { InjectionToken, inject } from '@angular/core';
import { AudioOutput, PitchSource } from '../models';
import { PitchDetectionService } from './pitch-detection.service';
import { ToneGeneratorService } from './tone-generator.service';

export const PITCH_SOURCE = new InjectionToken<PitchSource>('PITCH_SOURCE', {
  providedIn: 'root',
  factory: () => inject(PitchDetectionService),
});

export const AUDIO_OUTPUT = new InjectionToken<AudioOutput>('AUDIO_OUTPUT', {
  providedIn: 'root',
  factory: () => inject(ToneGeneratorService),
});

