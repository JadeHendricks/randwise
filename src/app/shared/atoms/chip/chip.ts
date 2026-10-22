import { ChangeDetectionStrategy, Component, ViewEncapsulation, input, output } from '@angular/core';

import { Icon } from '../icon/icon';

@Component({
  selector: 'rw-chip',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'rw-chip',
    '[class.rw-chip--dismissible]': 'dismissible()',
  },
  template: `
    <span class="rw-chip__label">{{ label() }}</span>
    @if (dismissible()) {
      <button
        type="button"
        class="rw-chip__dismiss"
        [attr.aria-label]="'Remove ' + label()"
        (click)="dismiss.emit()"
      >
        <rw-icon name="close" size="sm" />
      </button>
    }
  `,
})
export class Chip {
  readonly label = input.required<string>();
  readonly dismissible = input(false);
  readonly dismiss = output<void>();
}
