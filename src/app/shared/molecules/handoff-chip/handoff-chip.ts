import {
  ChangeDetectionStrategy,
  Component,
  ViewEncapsulation,
  input,
  output,
} from '@angular/core';
import { Button } from '../../atoms/button/button';
import { Chip } from '../../atoms/chip/chip';

/** "From Salary" status chip with an Undo button, shown where figures arrived from another page. */
@Component({
  selector: 'rw-handoff-chip',
  imports: [Chip, Button],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: { class: 'rw-handoff-chip', role: 'status' },
  template: `
    <rw-chip [label]="'From ' + source()" tone="success" />
    <button
      type="button"
      rw-button
      variant="ghost"
      size="sm"
      class="rw-handoff-chip__undo"
      [attr.aria-label]="'Undo figures from ' + source()"
      (click)="undo.emit()"
    >
      Undo
    </button>
  `,
})
export class HandoffChip {
  /** Where the figures came from, as a label such as "Salary". */
  readonly source = input.required<string>();
  readonly undo = output<void>();
}
