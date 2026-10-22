import { ChangeDetectionStrategy, Component } from '@angular/core';

import { navItem } from '../../core/navigation/nav-items';
import { FeaturePlaceholder } from '../../shared/molecules/feature-placeholder/feature-placeholder';

@Component({
  selector: 'rw-journey-page',
  imports: [FeaturePlaceholder],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<rw-feature-placeholder [item]="item" />',
})
export class JourneyPage {
  protected readonly item = navItem('journey');
}
