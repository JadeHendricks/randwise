import { ChangeDetectionStrategy, Component, ViewEncapsulation, input, output } from '@angular/core';

import { Icon } from '../icon/icon';

export type ChipTone = 'neutral' | 'success' | 'warning' | 'danger';

@Component({
  selector: 'rw-chip',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'rw-chip',
    '[class.rw-chip--dismissible]': 'dismissible()',
    '[class.rw-chip--success]': "tone() === 'success'",
    '[class.rw-chip--warning]': "tone() === 'warning'",
    '[class.rw-chip--danger]': "tone() === 'danger'",
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
  /** Status colour. The label must still say the status in words; colour is never the only signal. */
  readonly tone = input<ChipTone>('neutral');
  readonly dismissible = input(false);
  readonly dismiss = output<void>();
}
