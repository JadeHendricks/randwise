import { ChangeDetectionStrategy, Component } from '@angular/core';

import { navItem } from '../../core/navigation/nav-items';
import { FeaturePlaceholder } from '../../shared/molecules/feature-placeholder/feature-placeholder';

@Component({
  selector: 'rw-plan-page',
  imports: [FeaturePlaceholder],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<rw-feature-placeholder [item]="item" />',
})
export class PlanPage {
  protected readonly item = navItem('plan');
}
