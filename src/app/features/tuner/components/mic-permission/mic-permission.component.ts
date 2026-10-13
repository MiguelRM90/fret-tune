import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MicrophoneStatus } from '../../../../core/models';

@Component({
  selector: 'app-mic-permission',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './mic-permission.component.html',
  styleUrl: './mic-permission.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MicPermissionComponent {
  readonly status = input.required<MicrophoneStatus>();
  readonly errorMessage = input<string | null>(null);

  readonly requestAccess = output<void>();
}

