import { ChangeDetectionStrategy, Component, inject, model } from '@angular/core';
import { PwaModalComponent, PwaNumericSliderComponent } from 'pwa-ui-core/components';
import { INSTRUMENTS, REFERENCE_PITCH_RANGE, TOLERANCE_OPTIONS } from '../../core/constants';
import { DisplayStyle, InstrumentId, NoteNotation, ToleranceCents, TuningMode } from '../../core/models';
import { SettingsStore } from '../../core/services/settings.store';
import { ToggleSwitchComponent } from '../../shared/components';

@Component({
  selector: 'app-settings-modal',
  standalone: true,
  imports: [PwaModalComponent, PwaNumericSliderComponent, ToggleSwitchComponent],
  templateUrl: './settings-modal.component.html',
  styleUrl: './settings-modal.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsModalComponent {
  readonly settingsStore = inject(SettingsStore);

  readonly isOpen = model<boolean>(false);

  readonly instruments = INSTRUMENTS;
  readonly referencePitchRange = REFERENCE_PITCH_RANGE;
  readonly toleranceOptions = TOLERANCE_OPTIONS;

  onInstrumentSelect(id: InstrumentId): void {
    this.settingsStore.setInstrument(id);
  }

  onTuningChange(event: Event): void {
    const target = event.target as HTMLSelectElement | null;
    if (target) {
      this.settingsStore.setTuning(target.value);
    }
  }

  onModeSelect(mode: TuningMode): void {
    this.settingsStore.setMode(mode);
  }

  onDisplayStyleSelect(style: DisplayStyle): void {
    this.settingsStore.setDisplayStyle(style);
  }

  onNotationSelect(notation: NoteNotation): void {
    this.settingsStore.setNotation(notation);
  }

  onReferencePitchChange(pitch: number): void {
    this.settingsStore.setReferencePitch(pitch);
  }

  onToleranceSelect(tolerance: ToleranceCents): void {
    this.settingsStore.setTolerance(tolerance);
  }

  closeModal(): void {
    this.isOpen.set(false);
  }
}
