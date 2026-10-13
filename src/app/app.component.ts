import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PwaToastContainerComponent } from 'pwa-ui-core/components';
import { HeaderComponent } from './shared/components/header/header.component';
import { TunerComponent } from './features/tuner/tuner.component';
import { SettingsModalComponent } from './features/settings/settings-modal.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    PwaToastContainerComponent,
    HeaderComponent,
    TunerComponent,
    SettingsModalComponent,
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  readonly isSettingsOpen = signal<boolean>(false);
}

