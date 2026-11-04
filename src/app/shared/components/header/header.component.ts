import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { InstallStateService, SettingsStore, SwUpdateCoordinatorService } from '@core/services';
import { PwaHeaderComponent } from 'pwa-ui-core/components';
import { ThemeService } from 'pwa-ui-core/services';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [PwaHeaderComponent],
  templateUrl: './header.component.html',
  styleUrl: './header.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeaderComponent {
  readonly settingsStore = inject(SettingsStore);
  readonly themeService = inject(ThemeService);
  readonly installState = inject(InstallStateService);
  readonly swUpdateCoordinator = inject(SwUpdateCoordinatorService);

  readonly openSettings = output<void>();

  toggleTheme(): void {
    this.themeService.toggleTheme();
  }

  onInstalled(accepted: boolean): void {
    this.installState.markInstalled(accepted);
  }
}
