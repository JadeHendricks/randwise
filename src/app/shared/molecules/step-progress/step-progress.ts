import { ChangeDetectionStrategy, Component, ViewEncapsulation, computed, input } from '@angular/core';

/**
 * "Step 2 of 6" text plus a progress bar. The bar is a named `progressbar` with values, so a screen
 * reader hears the same thing the text says. `current` is 1-based and kept inside 1..total.
 */
@Component({
  selector: 'rw-step-progress',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: { class: 'rw-step-progress' },
  template: `
    <p class="rw-step-progress__text">Step {{ shown() }} of {{ steps() }}</p>
    <div
      class="rw-step-progress__track"
      role="progressbar"
      [attr.aria-label]="label()"
      aria-valuemin="1"
      [attr.aria-valuemax]="steps()"
      [attr.aria-valuenow]="shown()"
      [attr.aria-valuetext]="'Step ' + shown() + ' of ' + steps()"
      [style.--rw-step-fill]="fill()"
    >
      <span class="rw-step-progress__fill"></span>
    </div>
  `,
})
export class StepProgress {
  /** The step the person is on, counting from 1. */
  readonly current = input.required<number>();
  readonly total = input.required<number>();
  /** The accessible name of the bar, such as "Plan progress". */
  readonly label = input('Progress');

  protected readonly steps = computed(() => Math.max(1, Math.round(this.total())));
  protected readonly shown = computed(() =>
    Math.min(this.steps(), Math.max(1, Math.round(this.current()))),
  );
  protected readonly fill = computed(() => `${(this.shown() / this.steps()) * 100}%`);
}
