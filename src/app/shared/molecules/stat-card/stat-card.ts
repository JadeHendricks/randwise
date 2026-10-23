import { ChangeDetectionStrategy, Component, ViewEncapsulation, input } from '@angular/core';

import { Card, CardVariant } from '../../atoms/card/card';
import { Money } from '../../atoms/money/money';

/**
 * One labelled figure on a card: a rand amount (`value`) or, when `value` is null, free text
 * such as a percentage (`text`). An optional second line and hint sit underneath.
 */
@Component({
  selector: 'rw-stat-card',
  imports: [Card, Money],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: { class: 'rw-stat-card' },
  template: `
    <rw-card class="rw-stat-card__card" [variant]="variant()" padding="md">
      <p class="rw-stat-card__label">{{ label() }}</p>
      @if (value() !== null) {
        <rw-money class="rw-stat-card__money" [value]="value() ?? 0" size="md" />
      } @else {
        <p class="rw-stat-card__text">{{ text() }}</p>
      }
      @if (secondary()) {
        <p class="rw-stat-card__secondary">{{ secondary() }}</p>
      }
      @if (hint()) {
        <p class="rw-stat-card__hint">{{ hint() }}</p>
      }
    </rw-card>
  `,
})
export class StatCard {
  readonly label = input.required<string>();
  /** Rands, shown with the money atom. Null shows `text` instead. */
  readonly value = input<number | null>(null);
  readonly text = input('');
  readonly secondary = input('');
  readonly hint = input('');
  readonly variant = input<CardVariant>('glass');
}
