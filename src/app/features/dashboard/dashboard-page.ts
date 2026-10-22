import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { NAV_ITEMS } from '../../core/navigation/nav-items';
import { SalaryEstimator } from '../../core/salary/salary-estimator';
import { SalaryInputsStore } from '../../core/salary/salary-inputs.store';
import { Button } from '../../shared/atoms/button/button';
import { Card } from '../../shared/atoms/card/card';
import { DotMatrix, type DotColumn } from '../../shared/atoms/dot-matrix/dot-matrix';
import { Icon } from '../../shared/atoms/icon/icon';
import { Money } from '../../shared/atoms/money/money';
import { BentoTile } from '../../shared/molecules/bento-tile/bento-tile';

// Whole rands where possible ("R30 000"); cents only when the amount has them.
const AMOUNT = new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 2 });

@Component({
  selector: 'rw-dashboard-page',
  imports: [BentoTile, Button, Card, DotMatrix, Icon, Money, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard-page.html',
  styleUrl: './dashboard-page.scss',
})
export class DashboardPage {
  // The hero CTA already leads to Pay and the dashboard is this page, so neither gets a tile.
  protected readonly tiles = NAV_ITEMS.filter((item) => item.path !== '' && item.path !== 'pay');

  protected readonly store = inject(SalaryInputsStore);
  private readonly estimator = inject(SalaryEstimator);

  // Null when there is no tax data or the engine rejected the figures.
  protected readonly net = computed(() => {
    const estimate = this.estimator.estimate();
    return estimate?.ok ? (estimate.breakdown.find((l) => l.key === 'net')?.monthly ?? null) : null;
  });

  protected readonly summary = computed(() => {
    const { basis, period, amount, age } = this.store.inputs();
    const what = basis === 'gross' ? 'gross salary' : 'take-home pay';
    const per = period === 'monthly' ? 'a month' : 'a year';
    return `Based on a R${AMOUNT.format(amount)} ${what} ${per}, age ${age}.`;
  });

  protected readonly split = computed<readonly DotColumn[]>(() => {
    const estimate = this.estimator.estimate();
    return estimate?.ok
      ? estimate.breakdown.map((line) => ({ label: line.label, value: line.monthly }))
      : [];
  });

  // Why: the estimator returns null for "no tax data" and a message for a failed estimate.
  protected readonly unavailable = computed(() => {
    const estimate = this.estimator.estimate();
    if (!estimate) return 'Tax data is unavailable, so there is no estimate to show.';
    return estimate.ok ? null : estimate.message;
  });
}
