import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { RatesService } from '../../../core/data/rates.service';
import { TaxYearService } from '../../../core/data/tax-year.service';
import { roundRand, toInvestmentTaxRules } from '../../../core/engine';
import { InvestmentWarning } from '../../../core/toolbox/estimate-investment';
import {
  INVESTMENT_LIMITS,
  InvestmentInputs,
  growthPercent,
} from '../../../core/toolbox/toolbox-inputs';
import { ToolboxStore } from '../../../core/toolbox/toolbox.store';
import { AmountField } from '../../../shared/atoms/amount-field/amount-field';
import { BreakdownBar, BreakdownSegment } from '../../../shared/atoms/breakdown-bar/breakdown-bar';
import { Button } from '../../../shared/atoms/button/button';
import { Card } from '../../../shared/atoms/card/card';
import { Chip } from '../../../shared/atoms/chip/chip';
import { Icon } from '../../../shared/atoms/icon/icon';
import { LineChart, LinePoint, LineSeries } from '../../../shared/atoms/line-chart/line-chart';
import { Money } from '../../../shared/atoms/money/money';
import {
  formatPercent,
  formatRand,
  formatRandCompact,
  formatRandWhole,
} from '../../../shared/format/format-rand';
import { StatCard } from '../../../shared/molecules/stat-card/stat-card';

// Field limits. Money steps are 1 so a typed amount is never snapped to a coarser step.
const MONEY_STEP = 1;
const PERCENT_STEP = 0.01;
const LUMP_SUM_MAX = 100_000_000;
const YEARLY_MAX = 10_000_000;
const LIFETIME_USED_MAX = 10_000_000;

interface YearRow {
  readonly year: number;
  readonly paidIn: string;
  readonly intoTfsa: string;
  readonly overLimit: string;
  readonly tfsaValue: string;
  readonly taxableValue: string;
  readonly taxPaid: string;
}

/** "1 year" or "10 years". */
const yearsText = (years: number): string => `${years} ${years === 1 ? 'year' : 'years'}`;

/**
 * The TFSA against a taxable account page. Every figure is a computed() over the ToolboxStore
 * estimate (which runs the pure engine); this component only rounds and formats, and sends edits
 * back to the store.
 */
@Component({
  selector: 'rw-tfsa-compare-page',
  imports: [
    AmountField,
    BreakdownBar,
    Button,
    Card,
    Chip,
    Icon,
    LineChart,
    Money,
    RouterLink,
    StatCard,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './tfsa-compare-page.html',
  styleUrls: ['../tool-page.scss', '../tool-table.scss'],
})
export class TfsaComparePage {
  protected readonly store = inject(ToolboxStore);
  private readonly rates = inject(RatesService);
  private readonly taxYears = inject(TaxYearService);

  protected readonly limits = INVESTMENT_LIMITS;
  protected readonly step = MONEY_STEP;
  protected readonly percentStep = PERCENT_STEP;
  protected readonly lumpSumMax = LUMP_SUM_MAX;
  protected readonly yearlyMax = YEARLY_MAX;
  protected readonly lifetimeUsedMax = LIFETIME_USED_MAX;
  protected readonly compactRand = formatRandCompact;
  protected readonly yearText = (year: number) => `Year ${Math.round(year)}`;
  protected readonly plain = (value: number) => String(Math.round(value));

  protected readonly inputs = this.store.investmentInputs;

  /** The TFSA limits and the dividend rate come from the tax-year file, never from constants. */
  private readonly rules = computed(() => {
    const data = this.taxYears.taxYear();
    return data ? toInvestmentTaxRules(data) : null;
  });

  /** Dividends can only take what interest leaves of the return. */
  protected readonly dividendMax = computed(() => 100 - this.inputs().interestPercent);

  protected readonly growthShare = computed(
    () =>
      `Capital growth is the rest of the return: ${formatPercent(growthPercent(this.inputs()) / 100, 2)}. It is not taxed until the end.`,
  );

  protected readonly intro = computed(() => {
    const { lumpSum, years, marginalRatePercent } = this.inputs();
    return `This is an example: ${formatRand(lumpSum)} invested for ${yearsText(years)}, taxed at a marginal rate of ${formatPercent(marginalRatePercent / 100, 2)} (from the Pay page). Change any value; nothing is saved.`;
  });

  protected readonly returnHint = computed(() => {
    const a = this.rates.assumptions();
    return a
      ? `${a.growthReturn.description} You can change it.`
      : 'Rates are unavailable, so enter the yearly return you expect.';
  });

  protected readonly failure = computed(() => {
    const estimate = this.store.investmentEstimate();
    return estimate && !estimate.ok ? estimate.message : null;
  });

  protected readonly result = computed(() => {
    const estimate = this.store.investmentEstimate();
    if (!estimate?.ok) return null;
    const { result, warnings } = estimate;
    const rules = this.rules();
    const inputs = this.inputs();
    const rand = (value: number) => formatRand(roundRand(value));
    const years = yearsText(inputs.years);
    const limitText = rules
      ? `${formatRandWhole(rules.annualLimit)} a year and ${formatRandWhole(rules.lifetimeLimit)} for life`
      : 'the yearly and lifetime limits';

    const warningText: Record<InvestmentWarning, string> = {
      capped: `Only ${rand(result.tfsaContributed)} of the ${rand(result.totalContributed)} you put in fits under the TFSA limits (${limitText}). The other ${rand(result.overflowContributed)} is invested in a taxable account in the TFSA column, so both columns invest the same cash.`,
      'interest-above-exemption':
        'The interest in the taxable account is above the yearly interest exemption, so the extra is taxed at your marginal rate.',
      'rates-unavailable':
        'The expected return is unavailable, so it starts at 0%. Enter the return you expect to get real figures.',
    };

    const tax = result.discretionary.tax;
    const taxSegments: BreakdownSegment[] = [
      { label: 'Tax on interest', value: roundRand(tax.interest), tone: 'sun' },
      { label: 'Dividends tax', value: roundRand(tax.dividends), tone: 'sky' },
      { label: 'Capital gains tax', value: roundRand(tax.capitalGains), tone: 'rose' },
    ];

    // The chart starts at the money going in on day one, which is the same in both columns.
    const first = result.years[0];
    const start: LinePoint[] = first ? [{ x: 0, y: roundRand(first.contribution) }] : [];
    const tfsaSeries: LineSeries = {
      name: 'TFSA',
      points: [
        ...start,
        ...result.years.map((y): LinePoint => ({ x: y.year, y: roundRand(y.tfsaScenarioValue) })),
      ],
    };
    const taxableSeries: LineSeries = {
      name: 'Taxable account',
      points: [
        ...start,
        ...result.years.map((y): LinePoint => ({ x: y.year, y: roundRand(y.discretionaryValue) })),
      ],
    };

    const rows: YearRow[] = result.years.map((y) => ({
      year: y.year,
      paidIn: rand(y.contribution),
      intoTfsa: rand(y.tfsaIn),
      overLimit: rand(y.overflow),
      tfsaValue: rand(y.tfsaScenarioValue),
      taxableValue: rand(y.discretionaryValue),
      taxPaid: rand(y.discretionaryTax),
    }));

    return {
      figure: roundRand(result.advantage),
      lead: `Over ${years}, using the TFSA saves ${rand(result.taxSavedByTfsa)} in tax. The growth you would have lost on that tax adds ${rand(result.taxDragGrowth)}.`,
      tfsaEnd: roundRand(result.tfsaScenario.endValue),
      tfsaEndSecondary: `You put in ${rand(result.totalContributed)}. Tax paid: ${rand(result.tfsaScenario.tax.total)}`,
      taxableEnd: roundRand(result.discretionary.endValue),
      taxableEndSecondary: `Tax paid: ${rand(tax.total)}`,
      hasTax: roundRand(tax.total) > 0,
      taxSegments,
      hasChart: result.years.length > 0,
      tfsaSeries,
      taxableSeries,
      rows,
      warnings: warnings.map((warning) => warningText[warning]),
      limitText,
    };
  });

  /** The limits and the other assumptions, in plain words; the limits are read from the data. */
  protected readonly assumptions = computed(() => {
    const rules = this.rules();
    return [
      rules
        ? `The TFSA limits are ${formatRandWhole(rules.annualLimit)} a year and ${formatRandWhole(rules.lifetimeLimit)} for life. Money over a limit goes to a taxable account in the TFSA column.`
        : 'The TFSA has a yearly and a lifetime limit. Money over a limit goes to a taxable account in the TFSA column.',
      'The split of the return into interest, dividends and capital growth is an illustration. Real investments differ.',
      'One flat marginal tax rate is used for interest and capital gains in every year.',
      'Capital gains are realised once, at the end of the last year, so capital gains tax is charged once.',
      'The interest exemption is not shared with other interest you earn.',
      rules
        ? `Dividends are local dividends with ${formatPercent(rules.dividendsWithholdingRate, 0)} dividends tax.`
        : 'Dividends are local dividends with dividends tax.',
      'Money goes in at the start of each year, and the return is a yearly rate before fees.',
    ];
  });

  // Read out politely after each edit; empty while there is no result (the alert covers errors).
  protected readonly announcement = computed(() => {
    const r = this.result();
    return r ? `TFSA advantage: ${formatRand(r.figure)}. ${r.lead}` : '';
  });

  protected set(field: keyof InvestmentInputs, value: number): void {
    this.store.updateInvestment({ [field]: value });
  }
}
