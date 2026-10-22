import { ChangeDetectionStrategy, Component, ViewEncapsulation, input } from '@angular/core';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

/** Applied to native <button> / <a> so keyboard and link semantics stay native. */
@Component({
  selector: 'button[rw-button], a[rw-button]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'rw-button',
    '[class.rw-button--primary]': "variant() === 'primary'",
    '[class.rw-button--secondary]': "variant() === 'secondary'",
    '[class.rw-button--ghost]': "variant() === 'ghost'",
    '[class.rw-button--sm]': "size() === 'sm'",
    '[class.rw-button--md]': "size() === 'md'",
    '[class.rw-button--lg]': "size() === 'lg'",
  },
  template: '<ng-content />',
})
export class Button {
  readonly variant = input<ButtonVariant>('primary');
  readonly size = input<ButtonSize>('md');
}
