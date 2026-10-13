import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PwaModalComponent, PwaNumericSliderComponent } from 'pwa-ui-core/components';
import { INSTRUMENTS, REFERENCE_PITCH_RANGE, TOLERANCE_OPTIONS } from '../../core/constants';
import { DisplayStyle, InstrumentId, NoteNotation, ToleranceCents, TuningMode } from '../../core/models';
import { SettingsStore } from '../../core/services/settings.store';

@Component({
  selector: 'app-settings-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, PwaModalComponent, PwaNumericSliderComponent],
  templateUrl: './settings-modal.component.html',
  styleUrl: './settings-modal.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsModalComponent {
  readonly settingsStore = inject(SettingsStore);

  readonly isOpen = input<boolean>(false);
  readonly close = output<void>();

  readonly instruments = INSTRUMENTS;
  readonly referencePitchRange = REFERENCE_PITCH_RANGE;
  readonly toleranceOptions = TOLERANCE_OPTIONS;

  onInstrumentSelect(id: InstrumentId): void {
    this.settingsStore.setInstrument(id);
  }

  onTuningSelect(id: string): void {
    this.settingsStore.setTuning(id);
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

  toggleHaptics(): void {
    this.settingsStore.setHapticsEnabled(!this.settingsStore.hapticsEnabled());
  }

  toggleKeepAwake(): void {
    this.settingsStore.setKeepAwake(!this.settingsStore.keepAwake());
  }
}
