import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'cents',
  standalone: true,
})
export class CentsPipe implements PipeTransform {
  transform(cents: number | null | undefined): string {
    if (cents === null || cents === undefined || !Number.isFinite(cents)) {
      return '0';
    }
    const rounded = Math.round(cents);
    if (rounded > 0) {
      return `+${rounded}`;
    }
    return `${rounded}`;
  }
}

