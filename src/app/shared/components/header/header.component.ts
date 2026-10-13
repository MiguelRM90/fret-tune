import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PwaHeaderComponent } from 'pwa-ui-core/components';
import { ThemeService } from 'pwa-ui-core/services';
import { SettingsStore } from '../../../core/services/settings.store';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, PwaHeaderComponent],
  templateUrl: './header.component.html',
  styleUrl: './header.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeaderComponent {
  readonly settingsStore = inject(SettingsStore);
  readonly themeService = inject(ThemeService);

  readonly openSettings = output<void>();

  toggleTheme(): void {
    this.themeService.toggleTheme();
  }
}

