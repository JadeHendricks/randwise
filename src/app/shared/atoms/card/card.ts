import { ChangeDetectionStrategy, Component, ViewEncapsulation, input } from '@angular/core';

export type CardVariant = 'glass' | 'hero-yellow' | 'dark' | 'plain';
export type CardPadding = 'md' | 'lg';

@Component({
  selector: 'rw-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'rw-card',
    '[class.rw-card--glass]': "variant() === 'glass'",
    '[class.rw-card--hero-yellow]': "variant() === 'hero-yellow'",
    '[class.rw-card--dark]': "variant() === 'dark'",
    '[class.rw-card--plain]': "variant() === 'plain'",
    '[class.rw-card--pad-md]': "padding() === 'md'",
    '[class.rw-card--pad-lg]': "padding() === 'lg'",
  },
  template: '<ng-content />',
})
export class Card {
  readonly variant = input<CardVariant>('glass');
  readonly padding = input<CardPadding>('md');
}
