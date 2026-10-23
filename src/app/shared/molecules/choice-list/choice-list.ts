import { ChangeDetectionStrategy, Component, ViewEncapsulation, input, model } from '@angular/core';
import { Icon } from '../../atoms/icon/icon';

export interface ChoiceOption<T extends string = string> {
  readonly value: T;
  readonly label: string;
  /** A short line under the label. */
  readonly description?: string;
}

let nextId = 0;

/**
 * A list of large choice cards, one of which can be picked. Built on a native fieldset and radios,
 * so arrow keys, Space and screen-reader grouping come from the browser. Two-way bind `value`;
 * null means nothing is chosen yet.
 */
@Component({
  selector: 'rw-choice-list',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: { class: 'rw-choice-list' },
  template: `
    <fieldset class="rw-choice-list__fieldset">
      <legend class="rw-choice-list__legend" [class.rw-visually-hidden]="hideLegend()">
        {{ legend() }}
      </legend>
      <div class="rw-choice-list__options">
        @for (option of options(); track option.value; let i = $index) {
          <label
            class="rw-choice-list__option"
            [class.rw-choice-list__option--selected]="value() === option.value"
          >
            <input
              class="rw-choice-list__input"
              type="radio"
              [name]="name"
              [value]="option.value"
              [checked]="value() === option.value"
              [attr.aria-labelledby]="name + '-title-' + i"
              [attr.aria-describedby]="option.description ? name + '-text-' + i : null"
              (change)="value.set(option.value)"
            />
            <span
              class="rw-choice-list__mark"
              [class.rw-choice-list__mark--selected]="value() === option.value"
              aria-hidden="true"
            >
              @if (value() === option.value) {
                <rw-icon name="check" size="sm" />
              }
            </span>
            <span class="rw-choice-list__body">
              <span class="rw-choice-list__title" [id]="name + '-title-' + i">{{ option.label }}</span>
              @if (option.description) {
                <span class="rw-choice-list__description" [id]="name + '-text-' + i">{{
                  option.description
                }}</span>
              }
            </span>
          </label>
        }
      </div>
    </fieldset>
  `,
})
export class ChoiceList<T extends string = string> {
  // One radio group per instance, so two lists on a page never share arrow-key focus.
  protected readonly name = `rw-choice-list-${nextId++}`;

  readonly legend = input.required<string>();
  readonly options = input.required<readonly ChoiceOption<T>[]>();
  /** Keep the legend for screen readers only, when a visible heading already names the group. */
  readonly hideLegend = input(false);
  readonly value = model<T | null>(null);
}
