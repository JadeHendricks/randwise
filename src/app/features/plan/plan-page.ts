import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { PlanBuilderStore } from '../../core/plan/plan-builder.store';
import { PlanSummary } from './plan-summary';
import { PlanWizard } from './plan-wizard';

/** The Plan Builder: the guided questions, then the plan built from the answers. */
@Component({
  selector: 'rw-plan-page',
  imports: [PlanSummary, PlanWizard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './plan-page.html',
  styleUrl: './plan-page.scss',
})
export class PlanPage {
  protected readonly plan = inject(PlanBuilderStore);
}
