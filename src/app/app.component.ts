import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { SettingsModalComponent } from '@features/settings';
import { TunerComponent } from '@features/tuner';
import { HeaderComponent } from '@shared/components';
import { PwaToastContainerComponent } from 'pwa-ui-core/components';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
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
