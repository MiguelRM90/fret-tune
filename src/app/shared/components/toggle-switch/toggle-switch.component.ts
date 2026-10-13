import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';

@Component({
  selector: 'app-toggle-switch',
  standalone: true,
  templateUrl: './toggle-switch.component.html',
  styleUrl: './toggle-switch.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToggleSwitchComponent {
  readonly checked = model<boolean>(false);
  readonly label = input.required<string>();
  readonly description = input<string>('');

  toggle(): void {
    this.checked.update((value) => !value);
  }
}

