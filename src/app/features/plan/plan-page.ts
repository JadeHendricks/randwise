import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  inject,
  viewChild,
} from '@angular/core';

import { PlanBuilderStore } from '../../core/plan/plan-builder.store';
import { Button } from '../../shared/atoms/button/button';
import { Card } from '../../shared/atoms/card/card';
import { PlanWizard } from './plan-wizard';

/** Temporary summary: the ordered step titles. The next change replaces it with the real one. */
@Component({
  selector: 'rw-plan-summary-stub',
  imports: [Button, Card],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <rw-card padding="lg">
      <h2 #heading tabindex="-1">Your plan</h2>
      <ol>
        @for (step of plan.steps(); track step.id) {
          <li>{{ step.title }}</li>
        }
      </ol>
      <button rw-button variant="secondary" type="button" (click)="back()">
        Back to the questions
      </button>
    </rw-card>
  `,
})
export class PlanSummaryStub {
  protected readonly plan = inject(PlanBuilderStore);
  private readonly heading = viewChild.required<ElementRef<HTMLElement>>('heading');

  constructor() {
    afterNextRender(() => {
      if (this.plan.takeHeadingFocus()) this.heading().nativeElement.focus();
    });
  }

  protected back(): void {
    this.plan.back();
    this.plan.requestHeadingFocus();
  }
}

/** The Plan Builder: the guided questions, then the plan built from the answers. */
@Component({
  selector: 'rw-plan-page',
  imports: [PlanSummaryStub, PlanWizard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './plan-page.html',
  styleUrl: './plan-page.scss',
})
export class PlanPage {
  protected readonly plan = inject(PlanBuilderStore);
}
