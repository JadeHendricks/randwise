import { ChangeDetectionStrategy, Component } from '@angular/core';

import { navItem } from '../../core/navigation/nav-items';
import { FeaturePlaceholder } from '../../shared/molecules/feature-placeholder/feature-placeholder';

@Component({
  selector: 'rw-retire-page',
  imports: [FeaturePlaceholder],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<rw-feature-placeholder [item]="item" />',
})
export class RetirePage {
  protected readonly item = navItem('retire');
}
