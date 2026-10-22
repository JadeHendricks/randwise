import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ViewEncapsulation,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';

import { MediaQueries } from '../../../core/services/media-queries';

export type MoneySize = 'sm' | 'md' | 'lg' | 'hero';

const ZAR = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' });
const COUNT_UP_MS = 600;

@Component({
  selector: 'rw-money',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'rw-money',
    '[class.rw-money--sm]': "size() === 'sm'",
    '[class.rw-money--md]': "size() === 'md'",
    '[class.rw-money--lg]': "size() === 'lg'",
    '[class.rw-money--hero]': "size() === 'hero'",
  },
  // The animated text is hidden from assistive tech so screen readers only
  // ever hear the final value, never the intermediate count-up numbers.
  template: `
    <span class="rw-money__figure" aria-hidden="true">{{ format(displayed()) }}</span>
    <span class="rw-visually-hidden">{{ format(value()) }}</span>
  `,
})
export class Money {
  private readonly media = inject(MediaQueries);

  readonly value = input.required<number>();
  readonly size = input<MoneySize>('md');
  readonly animate = input(true);

  protected readonly displayed = signal(0);
  private frame: number | null = null;

  constructor() {
    effect(() => {
      const target = this.value();
      const animated = this.animate() && !this.media.prefersReducedMotion();
      untracked(() => this.moveTo(target, animated));
    });
    inject(DestroyRef).onDestroy(() => this.cancel());
  }

  protected format(amount: number): string {
    return ZAR.format(amount);
  }

  private moveTo(target: number, animated: boolean): void {
    this.cancel();
    const from = this.displayed();
    if (!animated || from === target) {
      this.displayed.set(target);
      return;
    }
    let start: number | null = null;
    const step = (now: number) => {
      start ??= now;
      const t = Math.min(1, (now - start) / COUNT_UP_MS);
      const eased = 1 - Math.pow(1 - t, 3);
      this.displayed.set(t >= 1 ? target : from + (target - from) * eased);
      this.frame = t >= 1 ? null : requestAnimationFrame(step);
    };
    this.frame = requestAnimationFrame(step);
  }

  private cancel(): void {
    if (this.frame !== null) {
      cancelAnimationFrame(this.frame);
      this.frame = null;
    }
  }
}
