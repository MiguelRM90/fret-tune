import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MicrophoneStatus } from '../../../../core/models';

@Component({
  selector: 'app-mic-permission',
  standalone: true,
  imports: [],
  templateUrl: './mic-permission.component.html',
  styleUrl: './mic-permission.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MicPermissionComponent {
  readonly status = input.required<MicrophoneStatus>();
  readonly errorMessage = input<string | null>(null);

  readonly requestAccess = output<void>();
}

