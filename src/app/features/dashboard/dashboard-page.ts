import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { NAV_ITEMS } from '../../core/navigation/nav-items';
import { Button } from '../../shared/atoms/button/button';
import { Card } from '../../shared/atoms/card/card';
import { Icon } from '../../shared/atoms/icon/icon';
import { Money } from '../../shared/atoms/money/money';
import { BentoTile } from '../../shared/molecules/bento-tile/bento-tile';

@Component({
  selector: 'rw-dashboard-page',
  imports: [BentoTile, Button, Card, Icon, Money, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard-page.html',
  styleUrl: './dashboard-page.scss',
})
export class DashboardPage {
  // The hero CTA already leads to Pay and the dashboard is this page, so neither gets a tile.
  protected readonly tiles = NAV_ITEMS.filter((item) => item.path !== '' && item.path !== 'pay');
}
