import { ChangeDetectionStrategy, Component, ViewEncapsulation, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import type { NavItem } from '../../../core/navigation/nav-items';
import { Button } from '../../atoms/button/button';
import { Card } from '../../atoms/card/card';
import { Chip } from '../../atoms/chip/chip';
import { Icon } from '../../atoms/icon/icon';

/** Themed empty card used by feature stubs until their calculators land. */
@Component({
  selector: 'rw-feature-placeholder',
  imports: [Card, Icon, Chip, Button, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: { class: 'rw-feature-placeholder' },
  template: `
    <rw-card class="rw-feature-placeholder__card" padding="lg">
      <span class="rw-feature-placeholder__icon"><rw-icon [name]="item().icon" size="lg" /></span>
      <rw-chip label="Coming soon" />
      <h2 class="rw-feature-placeholder__heading">{{ item().heading }}</h2>
      <p class="rw-feature-placeholder__text">{{ item().description }}</p>
      <a rw-button variant="secondary" routerLink="/">Back to dashboard</a>
    </rw-card>
  `,
})
export class FeaturePlaceholder {
  readonly item = input.required<NavItem>();
}
