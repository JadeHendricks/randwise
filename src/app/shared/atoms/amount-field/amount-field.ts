import {
  ChangeDetectionStrategy,
  Component,
  ViewEncapsulation,
  computed,
  input,
  linkedSignal,
  output,
} from '@angular/core';

let nextId = 0;

/** A labelled number input and range slider that stay in sync. */
@Component({
  selector: 'rw-amount-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: { class: 'rw-amount-field' },
  template: `
    <label class="rw-amount-field__label" [for]="inputId">{{ label() }}</label>
    <div class="rw-amount-field__row">
      <div class="rw-amount-field__control">
        @if (prefix()) {
          <span class="rw-amount-field__affix" aria-hidden="true">{{ prefix() }}</span>
        }
        <input
          class="rw-amount-field__number"
          type="number"
          inputmode="decimal"
          [id]="inputId"
          [min]="min()"
          [max]="max()"
          [step]="step()"
          [value]="current()"
          [attr.aria-describedby]="hint() ? hintId : null"
          (input)="onTyping($event)"
          (change)="onCommit($event)"
        />
        @if (suffix()) {
          <span class="rw-amount-field__affix" aria-hidden="true">{{ suffix() }}</span>
        }
      </div>
      <input
        class="rw-amount-field__slider"
        type="range"
        [attr.aria-label]="label() + ' slider'"
        [attr.aria-valuetext]="valueText()"
        [min]="min()"
        [max]="max()"
        [step]="step()"
        [value]="current()"
        [style.--rw-amount-fill]="fill()"
        (input)="onSlider($event)"
      />
    </div>
    @if (hint()) {
      <p class="rw-amount-field__hint" [id]="hintId">{{ hint() }}</p>
    }
  `,
})
export class AmountField {
  protected readonly inputId = `rw-amount-field-${nextId++}`;
  protected readonly hintId = `${this.inputId}-hint`;

  readonly label = input.required<string>();
  readonly value = input.required<number>();
  readonly min = input(0);
  readonly max = input(100);
  readonly step = input(1);
  readonly prefix = input('');
  readonly suffix = input('');
  readonly hint = input('');
  readonly valueChange = output<number>();

  /** Follows the parent value, but can be changed locally until the parent changes it again. */
  protected readonly current = linkedSignal(() => this.value());

  protected readonly fill = computed(() => {
    const span = this.max() - this.min();
    const ratio = span > 0 ? (this.current() - this.min()) / span : 0;
    return `${Math.min(100, Math.max(0, ratio * 100))}%`;
  });

  protected readonly valueText = computed(() => {
    const prefix = this.prefix();
    const suffix = this.suffix();
    return `${prefix ? prefix + ' ' : ''}${this.current()}${suffix ? ' ' + suffix : ''}`;
  });

  // While typing, accept only complete in-range numbers so a half-typed value
  // (e.g. "5" when min is 1000) is never rewritten under the user's cursor.
  protected onTyping(event: Event): void {
    const raw = (event.target as HTMLInputElement).valueAsNumber;
    if (Number.isFinite(raw) && raw >= this.min() && raw <= this.max()) {
      this.commit(raw);
    }
  }

  // On blur/Enter, clamp and snap, and revert to the last good value if empty.
  protected onCommit(event: Event): void {
    const el = event.target as HTMLInputElement;
    const raw = el.valueAsNumber;
    if (Number.isFinite(raw)) {
      this.commit(this.normalise(raw));
    }
    el.value = String(this.current());
  }

  protected onSlider(event: Event): void {
    this.commit(this.normalise((event.target as HTMLInputElement).valueAsNumber));
  }

  private normalise(raw: number): number {
    const min = this.min();
    const step = this.step();
    const clamped = Math.min(this.max(), Math.max(min, raw));
    const snapped = step > 0 ? min + Math.round((clamped - min) / step) * step : clamped;
    // Trim float noise such as 0.30000000000000004.
    return Math.min(this.max(), Number(snapped.toFixed(10)));
  }

  private commit(next: number): void {
    if (next !== this.current()) {
      this.current.set(next);
      this.valueChange.emit(next);
    }
  }
}
