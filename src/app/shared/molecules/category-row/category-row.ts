import {
  ChangeDetectionStrategy,
  Component,
  ViewEncapsulation,
  input,
  linkedSignal,
  output,
} from '@angular/core';

import { AmountField } from '../../atoms/amount-field/amount-field';
import { Button } from '../../atoms/button/button';

let nextId = 0;

/**
 * One budget line: its name, the rands a month, and the same amount as a share of take-home pay.
 * Both inputs are labelled with the line name, so a screen reader hears "Housing per month" and
 * "Housing share of take-home". A custom line (`editable`) has a name field and a Remove button
 * (`removable`). The parent owns the figures; this row only reports what the user typed.
 */
@Component({
  selector: 'rw-category-row',
  imports: [AmountField, Button],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: { class: 'rw-category-row' },
  template: `
    <div class="rw-category-row__head">
      @if (editable()) {
        <label class="rw-visually-hidden" [for]="nameId">Name of {{ name() }}</label>
        <input
          class="rw-category-row__name-input"
          type="text"
          maxlength="40"
          autocomplete="off"
          [id]="nameId"
          [value]="name()"
          (change)="onRename($event)"
        />
      } @else {
        <span class="rw-category-row__name">{{ name() }}</span>
      }
      @if (removable()) {
        <button
          type="button"
          rw-button
          variant="ghost"
          size="sm"
          [attr.aria-label]="'Remove ' + name()"
          (click)="remove.emit()"
        >
          Remove
        </button>
      }
    </div>
    <div class="rw-category-row__fields">
      <rw-amount-field
        [label]="name() + ' per month'"
        prefix="R"
        [min]="0"
        [max]="max()"
        [step]="0.01"
        [value]="amount()"
        (valueChange)="amountChange.emit($event)"
      />
      <div class="rw-category-row__percent">
        <label class="rw-visually-hidden" [for]="percentId">{{ name() }} share of take-home</label>
        <input
          class="rw-category-row__percent-input"
          type="number"
          inputmode="decimal"
          min="0"
          max="100"
          step="0.01"
          [id]="percentId"
          [value]="shownPercent()"
          (change)="onPercent($event)"
        />
        <span class="rw-category-row__affix" aria-hidden="true">%</span>
      </div>
    </div>
  `,
})
export class CategoryRow {
  private readonly id = nextId++;
  protected readonly nameId = `rw-category-row-name-${this.id}`;
  protected readonly percentId = `rw-category-row-percent-${this.id}`;

  readonly name = input.required<string>();
  /** Rands a month. */
  readonly amount = input.required<number>();
  /** The amount as a percent of take-home pay (0 to 100). */
  readonly percent = input.required<number>();
  /** Largest rand amount the field accepts. */
  readonly max = input(1_000_000);
  /** A custom line can be renamed. */
  readonly editable = input(false);
  /** A custom line can be removed. */
  readonly removable = input(false);

  readonly amountChange = output<number>();
  readonly percentChange = output<number>();
  readonly nameChange = output<string>();
  readonly remove = output<void>();

  /** Follows the parent value, but can be changed locally until the parent changes it again. */
  protected readonly shownPercent = linkedSignal(() => this.percent());

  // Committed on change (blur or Enter), so a half-typed share never moves the other figures.
  protected onPercent(event: Event): void {
    const el = event.target as HTMLInputElement;
    const raw = el.valueAsNumber;
    if (Number.isFinite(raw)) {
      const next = Math.min(100, Math.max(0, raw));
      if (next !== this.shownPercent()) {
        this.shownPercent.set(next);
        this.percentChange.emit(next);
      }
    }
    el.value = String(this.shownPercent());
  }

  protected onRename(event: Event): void {
    const el = event.target as HTMLInputElement;
    const next = el.value.trim();
    if (next !== '' && next !== this.name()) this.nameChange.emit(next);
    else el.value = this.name();
  }
}
