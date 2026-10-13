import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class HapticsService {
  vibrate(pattern: number | number[] = 25): void {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch {}
    }
  }

  inTuneSuccess(): void {
    this.vibrate([30, 40, 60]);
  }
}

