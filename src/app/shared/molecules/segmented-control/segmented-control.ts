import { ChangeDetectionStrategy, Component, ViewEncapsulation, input, model } from '@angular/core';

export interface SegmentedOption<T extends string = string> {
  readonly value: T;
  readonly label: string;
}

let nextId = 0;

/**
 * A pill switch between a few options, built on a native fieldset and radios so arrow keys,
 * Tab and screen-reader grouping all come from the browser. Two-way bind `value`.
 */
@Component({
  selector: 'rw-segmented-control',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: { class: 'rw-segmented-control' },
  template: `
    <fieldset class="rw-segmented-control__fieldset">
      <legend
        class="rw-segmented-control__legend"
        [class.rw-visually-hidden]="hideLegend()"
      >
        {{ legend() }}
      </legend>
      <div class="rw-segmented-control__options">
        @for (option of options(); track option.value) {
          <label
            class="rw-segmented-control__option"
            [class.rw-segmented-control__option--active]="value() === option.value"
          >
            <input
              class="rw-segmented-control__input"
              type="radio"
              [name]="name"
              [value]="option.value"
              [checked]="value() === option.value"
              (change)="value.set(option.value)"
            />
            <span class="rw-segmented-control__text">{{ option.label }}</span>
          </label>
        }
      </div>
    </fieldset>
  `,
})
export class SegmentedControl<T extends string = string> {
  // One radio group per instance, so two controls on a page never share arrow-key focus.
  protected readonly name = `rw-segmented-control-${nextId++}`;

  readonly legend = input.required<string>();
  readonly options = input.required<readonly SegmentedOption<T>[]>();
  /** Keep the legend for screen readers only, when a visible heading already names the group. */
  readonly hideLegend = input(false);
  readonly value = model.required<T>();
}
