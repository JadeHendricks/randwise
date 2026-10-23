import { ChangeDetectionStrategy, Component, ViewEncapsulation, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import type { NavItem } from '../../../core/navigation/nav-items';
import { Button } from '../../atoms/button/button';
import { Card } from '../../atoms/card/card';
import { Icon } from '../../atoms/icon/icon';

/** Empty-state dashboard tile that links to a lazy feature route. */
@Component({
  selector: 'rw-bento-tile',
  imports: [Card, Icon, Button, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'rw-bento-tile',
    '[class.rw-bento-tile--wide]': 'span() === 2',
  },
  template: `
    <rw-card class="rw-bento-tile__card">
      <span class="rw-bento-tile__icon"><rw-icon [name]="item().icon" size="lg" /></span>
      <h2 class="rw-bento-tile__heading">{{ item().heading }}</h2>
      <p class="rw-bento-tile__text">{{ item().description }}</p>
      <ng-content />
      <a rw-button variant="ghost" size="sm" class="rw-bento-tile__link" [routerLink]="'/' + item().path">
        Open {{ item().label }}
        <rw-icon name="arrow-right" size="sm" />
      </a>
    </rw-card>
  `,
})
export class BentoTile {
  readonly item = input.required<NavItem>();
  readonly span = input<1 | 2>(1);
}
