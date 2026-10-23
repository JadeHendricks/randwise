import {
  ChangeDetectionStrategy,
  Component,
  ViewEncapsulation,
  input,
  output,
} from '@angular/core';

import { Button } from '../../atoms/button/button';
import { Card } from '../../atoms/card/card';

export interface PlanStepDetail {
  readonly label: string;
  /** Already formatted for display. */
  readonly value: string;
}

/**
 * One numbered step of a plan: what to do, why, the headline number, supporting numbers, caveats
 * and a button that opens the calculator. Presentation only: the parent formats every figure.
 * The key figure is plain text on purpose, so it never counts up or changes under a reader.
 */
@Component({
  selector: 'rw-plan-step',
  imports: [Button, Card],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: { class: 'rw-plan-step' },
  template: `
    <rw-card class="rw-plan-step__card" padding="lg">
      <span class="rw-plan-step__badge" aria-hidden="true">{{ index() }}</span>
      <div class="rw-plan-step__body">
        <h3 class="rw-plan-step__title" [id]="titleId()">{{ title() }}</h3>
        <p class="rw-plan-step__why">{{ why() }}</p>
        <p class="rw-plan-step__key">
          <span class="rw-plan-step__key-label">{{ keyLabel() }}</span>
          <strong class="rw-plan-step__key-value">{{ keyValue() }}</strong>
        </p>
        @if (details().length > 0) {
          <dl class="rw-plan-step__details">
            @for (detail of details(); track detail.label) {
              <div class="rw-plan-step__detail">
                <dt class="rw-plan-step__term">{{ detail.label }}</dt>
                <dd class="rw-plan-step__value">{{ detail.value }}</dd>
              </div>
            }
          </dl>
        }
        @if (notes().length > 0) {
          <ul class="rw-plan-step__notes" role="list">
            @for (note of notes(); track note) {
              <li class="rw-plan-step__note">{{ note }}</li>
            }
          </ul>
        }
        <button
          rw-button
          class="rw-plan-step__action"
          variant="secondary"
          size="sm"
          type="button"
          [attr.aria-describedby]="titleId()"
          (click)="open.emit()"
        >
          {{ actionLabel() }}
        </button>
      </div>
    </rw-card>
  `,
})
export class PlanStepCard {
  /** The step number shown in the badge, counting from 1. */
  readonly index = input.required<number>();
  readonly title = input.required<string>();
  readonly why = input.required<string>();
  readonly keyLabel = input.required<string>();
  readonly keyValue = input.required<string>();
  readonly details = input<readonly PlanStepDetail[]>([]);
  readonly notes = input<readonly string[]>([]);
  readonly actionLabel = input.required<string>();
  /** The id given to the title, so the button can be described by it. Unique on the page. */
  readonly titleId = input.required<string>();
  readonly open = output<void>();
}
