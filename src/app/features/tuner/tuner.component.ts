import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TunerStore } from '../../core/services/tuner.store';
import { SettingsStore } from '../../core/services/settings.store';
import { NeedleGaugeComponent } from './components/needle-gauge/needle-gauge.component';
import { StrobeDisplayComponent } from './components/strobe-display/strobe-display.component';
import { NoteDisplayComponent } from './components/note-display/note-display.component';
import { StringSelectorComponent } from './components/string-selector/string-selector.component';
import { MicPermissionComponent } from './components/mic-permission/mic-permission.component';

@Component({
  selector: 'app-tuner',
  standalone: true,
  imports: [
    CommonModule,
    NeedleGaugeComponent,
    StrobeDisplayComponent,
    NoteDisplayComponent,
    StringSelectorComponent,
    MicPermissionComponent,
  ],
  templateUrl: './tuner.component.html',
  styleUrl: './tuner.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TunerComponent {
  readonly tunerStore = inject(TunerStore);
  readonly settingsStore = inject(SettingsStore);

  readonly openSettings = output<void>();

  onStartListening(): void {
    this.tunerStore.startListening();
  }

  onToggleListening(): void {
    this.tunerStore.toggleListening();
  }

  onToggleMode(): void {
    const next = this.settingsStore.mode() === 'instrument' ? 'chromatic' : 'instrument';
    this.settingsStore.setMode(next);
  }

  onToggleDisplayStyle(): void {
    const next = this.settingsStore.displayStyle() === 'needle' ? 'strobe' : 'needle';
    this.settingsStore.setDisplayStyle(next);
  }

  onSelectString(index: number): void {
    this.tunerStore.selectString(index);
  }

  onPlayTone(index: number): void {
    this.tunerStore.playStringReference(index);
  }

  onResetChecklist(): void {
    this.tunerStore.resetTunedStrings();
  }
}

