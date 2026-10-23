import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { GROWTH_PREMIUM_PP } from '../../../core/data/assumptions';
import { RatesService } from '../../../core/data/rates.service';
import { roundRand } from '../../../core/engine';
import { ReportModel } from '../../../core/pdf/report-model';
import { TwoPotWarning } from '../../../core/toolbox/estimate-two-pot';
import { TWO_POT_LIMITS, TwoPotInputs } from '../../../core/toolbox/toolbox-inputs';
import { ToolboxStore } from '../../../core/toolbox/toolbox.store';
import { AmountField } from '../../../shared/atoms/amount-field/amount-field';
import { BreakdownBar, BreakdownSegment } from '../../../shared/atoms/breakdown-bar/breakdown-bar';
import { Button } from '../../../shared/atoms/button/button';
import { Card } from '../../../shared/atoms/card/card';
import { Chip } from '../../../shared/atoms/chip/chip';
import { Icon } from '../../../shared/atoms/icon/icon';
import { LiveRegion } from '../../../shared/atoms/live-region/live-region';
import { Money } from '../../../shared/atoms/money/money';
import { formatPercent, formatRand, formatRandWhole } from '../../../shared/format/format-rand';
import { DownloadPdf } from '../../../shared/molecules/download-pdf/download-pdf';
import { StatCard } from '../../../shared/molecules/stat-card/stat-card';
import { buildTwoPotReport } from './two-pot-report';

// Field limits. Money steps are 1 so a typed amount is never snapped to a coarser step.
const MONEY_STEP = 1;
const PERCENT_STEP = 0.01;
const WITHDRAWAL_MAX = 20_000_000;
const INCOME_MAX = 100_000_000;

interface BandRow {
  readonly key: number;
  readonly from: string;
  readonly to: string;
  readonly amount: string;
  readonly rate: string;
  readonly tax: string;
}

/** "1 year" or "20 years". */
const yearsText = (years: number): string => `${years} ${years === 1 ? 'year' : 'years'}`;

/**
 * The Two-pot withdrawal page. Every figure is a computed() over the ToolboxStore estimate (which
 * runs the pure engine); this component only rounds and formats, and sends edits back to the
 * store.
 */
@Component({
  selector: 'rw-two-pot-page',
  imports: [
    AmountField,
    BreakdownBar,
    Button,
    Card,
    Chip,
    DownloadPdf,
    Icon,
    LiveRegion,
    Money,
    RouterLink,
    StatCard,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './two-pot-page.html',
  styleUrls: ['../tool-page.scss', '../tool-table.scss'],
})
export class TwoPotPage {
  protected readonly store = inject(ToolboxStore);
  private readonly rates = inject(RatesService);

  protected readonly limits = TWO_POT_LIMITS;
  protected readonly step = MONEY_STEP;
  protected readonly percentStep = PERCENT_STEP;
  protected readonly withdrawalMax = WITHDRAWAL_MAX;
  protected readonly incomeMax = INCOME_MAX;

  protected readonly inputs = this.store.twoPotInputs;

  protected readonly intro = computed(() => {
    const { withdrawal, taxableIncomeAnnual, yearsToRetirement } = this.inputs();
    return `This is an example: a ${formatRand(withdrawal)} withdrawal on a taxable income of ${formatRand(taxableIncomeAnnual)} (from the Pay page), ${yearsText(yearsToRetirement)} before you retire. Change any value; nothing is saved.`;
  });

  protected readonly growthHint = computed(() =>
    this.rates.assumptions()
      ? `Assumption: your savings grow ${GROWTH_PREMIUM_PP} percentage points faster than inflation (CPI plus ${GROWTH_PREMIUM_PP}). It is a guess, not a promise. You can change it.`
      : 'Rates are unavailable, so enter how much faster than inflation you expect your savings to grow.',
  );

  protected readonly inflationHint = computed(() => {
    const a = this.rates.assumptions();
    return a
      ? `${a.inflation.description} You can change it.`
      : 'Rates are unavailable, so enter the inflation you expect.';
  });

  protected readonly failure = computed(() => {
    const estimate = this.store.twoPotEstimate();
    return estimate && !estimate.ok ? estimate.message : null;
  });

  /** The message shown instead of any figures when the withdrawal is under the minimum. */
  protected readonly rejection = computed(() => {
    const estimate = this.store.twoPotEstimate();
    if (!estimate?.ok || estimate.result.accepted) return null;
    const { minimum } = estimate.result;
    return `The smallest savings withdrawal is ${formatRandWhole(minimum)}. Enter ${formatRandWhole(minimum)} or more to see what it would cost.`;
  });

  protected readonly result = computed(() => {
    const estimate = this.store.twoPotEstimate();
    if (!estimate?.ok || !estimate.result.accepted) return null;
    const { result, warnings } = estimate;
    const rand = (value: number) => formatRand(roundRand(value));
    const years = yearsText(result.yearsToRetirement);

    const warningText: Record<TwoPotWarning, string> = {
      'crosses-bracket': `Part of this withdrawal lands in a higher tax bracket: the first rands are taxed at ${formatPercent(result.startRate, 0)} and the last at ${formatPercent(result.topRate, 0)}.`,
      'absorbed-by-credits': `Your tax rebate and medical credit, which cannot be paid out as cash, cancel ${rand(result.absorbedByCredits)} of the tax on this withdrawal because your income is low.`,
    };

    const bands: BandRow[] = result.bands.map((band) => ({
      key: band.above,
      from: rand(band.above),
      to: rand(band.upTo),
      amount: rand(band.amount),
      rate: formatPercent(band.rate, 0),
      tax: rand(band.tax),
    }));

    const segments: BreakdownSegment[] = [
      { label: 'Cash you receive', value: roundRand(result.netCash), tone: 'accent' },
      { label: 'Tax now', value: roundRand(result.tax), tone: 'rose' },
      { label: 'Lost growth', value: roundRand(result.lostGrowthToday), tone: 'sun' },
    ];

    return {
      figure: roundRand(result.trueCostToday),
      lead: `Tax now ${rand(result.tax)} plus lost growth ${rand(result.lostGrowthToday)}.`,
      perRand:
        result.costPerRandReceived > 0
          ? `Counting both, every R1,00 you receive costs about ${rand(result.costPerRandReceived)} in today's money.`
          : '',
      tax: roundRand(result.tax),
      effectiveRate: `${formatPercent(result.effectiveRate, 1)} of the withdrawal`,
      netCash: roundRand(result.netCash),
      lostGrowth: roundRand(result.lostGrowthToday),
      lostGrowthFuture: `In future rand: ${rand(result.lostGrowthNominal)}`,
      rate:
        result.startRate === result.topRate
          ? formatPercent(result.startRate, 0)
          : `${formatPercent(result.startRate, 0)} to ${formatPercent(result.topRate, 0)}`,
      bands,
      segments,
      growthText: `Left in your retirement fund for ${years}, ${rand(result.withdrawal)} could grow to ${rand(result.futureValueToday)} in today's money (${rand(result.futureValueNominal)} in future rand). Taking it now leaves you ${rand(result.netCash)} in cash and gives up ${rand(result.tax)} in tax and ${rand(result.lostGrowthToday)} of growth. The growth rate is an assumption.`,
      warnings: warnings.map((warning) => warningText[warning]),
      oneAYear:
        result.withdrawalsPerTaxYear === 1
          ? 'You can make one savings withdrawal in a tax year'
          : `You can make ${result.withdrawalsPerTaxYear} savings withdrawals in a tax year`,
      minimum: formatRandWhole(result.minimum),
    };
  });

  // PDF export: formats this page's own result(), nothing is recomputed.
  protected readonly report = computed<ReportModel | null>(() => {
    const r = this.result();
    return r ? buildTwoPotReport(this.inputs(), r) : null;
  });

  // Read out politely after each edit; empty while there is no result (the alert covers the rest).
  protected readonly announcement = computed(() => {
    const r = this.result();
    return r ? `True cost in today's money: ${formatRand(r.figure)}. ${r.lead}` : '';
  });

  protected set(field: keyof TwoPotInputs, value: number): void {
    this.store.updateTwoPot({ [field]: value });
  }
}
