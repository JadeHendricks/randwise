import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { formatShortDate } from '../../../core/data/format-date';
import { RatesService } from '../../../core/data/rates.service';
import { AFFORDABILITY_SHARE, roundRand } from '../../../core/engine';
import { HomeLoanWarning } from '../../../core/toolbox/estimate-home-loan';
import {
  HOME_LOAN_LIMITS,
  HomeLoanInputs,
  HomeLoanMode,
  marginFromRate,
  rateFromMargin,
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
import { RingGauge } from '../../../shared/atoms/ring-gauge/ring-gauge';
import { formatPercent, formatRand, formatRandCompact } from '../../../shared/format/format-rand';
import {
  SegmentedControl,
  SegmentedOption,
} from '../../../shared/molecules/segmented-control/segmented-control';
import { StatCard } from '../../../shared/molecules/stat-card/stat-card';

// Field limits. Money steps are 1 so a typed amount is never snapped to a coarser step.
const MONEY_STEP = 1;
const PERCENT_STEP = 0.01;
const GROSS_MAX_MONTHLY = 500_000;
const DEBT_MAX_MONTHLY = 500_000;
const DEPOSIT_MAX = 50_000_000;
const PRICE_MAX = 50_000_000;
const RUNNING_COST_MAX_MONTHLY = 100_000;
const MARGIN = { min: -5, max: 15 } as const;

const MODE_OPTIONS: readonly SegmentedOption<HomeLoanMode>[] = [
  { value: 'afford', label: 'What can I afford' },
  { value: 'price', label: 'Repayment for a price' },
];

const RULE_PERCENT = formatPercent(AFFORDABILITY_SHARE, 0);

interface YearRow {
  readonly year: number;
  readonly opening: string;
  readonly interest: string;
  readonly principal: string;
  readonly closing: string;
}

/**
 * The Home loan page. Every figure is a computed() over the ToolboxStore estimate (which runs the
 * pure engine); this component only rounds and formats, and sends edits back to the store.
 */
@Component({
  selector: 'rw-home-loan-page',
  imports: [
    AmountField,
    BreakdownBar,
    Button,
    Card,
    Chip,
    Icon,
    LineChart,
    Money,
    RingGauge,
    RouterLink,
    SegmentedControl,
    StatCard,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './home-loan-page.html',
  styleUrls: ['../tool-page.scss', '../tool-table.scss'],
})
export class HomeLoanPage {
  protected readonly store = inject(ToolboxStore);
  private readonly rates = inject(RatesService);

  protected readonly limits = HOME_LOAN_LIMITS;
  protected readonly margin = MARGIN;
  protected readonly step = MONEY_STEP;
  protected readonly percentStep = PERCENT_STEP;
  protected readonly grossMax = GROSS_MAX_MONTHLY;
  protected readonly debtMax = DEBT_MAX_MONTHLY;
  protected readonly depositMax = DEPOSIT_MAX;
  protected readonly priceMax = PRICE_MAX;
  protected readonly runningCostMax = RUNNING_COST_MAX_MONTHLY;
  protected readonly modeOptions = MODE_OPTIONS;
  protected readonly compactRand = formatRandCompact;
  protected readonly yearText = (year: number) => `Year ${Math.round(year)}`;
  protected readonly plain = (value: number) => String(Math.round(value));

  protected readonly ruleTitle = `The ${RULE_PERCENT} rule of thumb`;

  protected readonly inputs = this.store.homeLoanInputs;

  /** The margin over prime for the current rate, or null when prime is unavailable. */
  protected readonly marginValue = computed(() => {
    const prime = this.store.prime();
    return prime === null ? null : marginFromRate(prime, this.inputs().ratePercent);
  });

  protected readonly intro = computed(() => {
    const { grossMonthly, deposit, termYears } = this.inputs();
    return `This is an example: a ${formatRand(grossMonthly)} gross salary (from the Pay page), ${formatRand(deposit)} deposit and a ${termYears}-year bond. Change any value; nothing is saved.`;
  });

  protected readonly rateHint = computed(() => {
    const prime = this.rates.rates()?.prime;
    return prime
      ? `Prime is ${formatPercent(prime.valuePercent / 100, 2)} as of ${formatShortDate(prime.asOf)}. Banks usually quote a margin above or below prime.`
      : 'The prime rate is unavailable, so enter your bond rate.';
  });

  protected readonly failure = computed(() => {
    const estimate = this.store.homeLoanEstimate();
    return estimate && !estimate.ok ? estimate.message : null;
  });

  protected readonly result = computed(() => {
    const estimate = this.store.homeLoanEstimate();
    if (!estimate?.ok) return null;
    const inputs = this.inputs();
    const { result, warnings, netMonthly } = estimate;
    const rand = (value: number) => formatRand(roundRand(value));
    const affordMode = inputs.mode === 'afford';

    const schedule = result.schedule;
    const balance: LineSeries = {
      name: 'Bond balance',
      points: [
        { x: 0, y: roundRand(result.loanAmount) },
        ...schedule.map((year): LinePoint => ({ x: year.year, y: roundRand(year.closing) })),
      ],
    };
    const firstYear = result.firstYear;
    const firstYearSegments: BreakdownSegment[] = firstYear
      ? [
          { label: 'Capital repaid', value: roundRand(firstYear.principal), tone: 'accent' },
          { label: 'Interest', value: roundRand(firstYear.interest), tone: 'sun' },
        ]
      : [];

    const warningText: Record<HomeLoanWarning, string> = {
      'over-cap': `This repayment is ${rand(result.overCapBy)} a month more than the ${rand(result.roomForBond)} the ${RULE_PERCENT} rule leaves for a bond.`,
      'no-room': `Your existing debt repayments already use up ${RULE_PERCENT} of your gross pay, so the rule leaves no room for a new bond.`,
      'rate-unavailable':
        'The prime rate is unavailable, so the bond rate starts at 0%. Enter your bond rate to get real figures.',
    };

    const rows: YearRow[] = schedule.map((year) => ({
      year: year.year,
      opening: rand(year.opening),
      interest: rand(year.interest),
      principal: rand(year.principal),
      closing: rand(year.closing),
    }));

    const share = result.debtShareOfGross;
    return {
      eyebrow: affordMode ? 'The most you could borrow' : 'Monthly repayment',
      figure: roundRand(affordMode ? result.maxBond : result.repayment),
      lead: affordMode
        ? `That is a home of up to ${rand(result.maxPrice)} with your ${rand(inputs.deposit)} deposit.`
        : `For a ${rand(result.purchasePrice)} home with a ${rand(inputs.deposit)} deposit, you borrow ${rand(result.loanAmount)}.`,
      loan: roundRand(result.loanAmount),
      repayment: roundRand(result.repayment),
      repaymentSecondary:
        result.repaymentShareOfNet === null || netMonthly === null
          ? ''
          : `${formatPercent(result.repaymentShareOfNet, 0)} of your take-home pay`,
      interest: roundRand(result.totalInterest),
      totalPaid: `Total paid back ${rand(result.totalPaid)}`,
      monthlyCost: roundRand(result.totalMonthlyCost),
      ringPercent: share * 100,
      ringCentre: formatPercent(share, 0),
      ruleText: `Your debt repayments would be ${formatPercent(share, 0)} of your gross pay. As a rule of thumb, keep them at or under ${RULE_PERCENT}, which is ${rand(result.affordabilityCap)} a month for you, and ${rand(result.roomForBond)} of that is left for a bond. It is a rule of thumb, not a bank guarantee.`,
      hasBreakdown: firstYearSegments.length > 0,
      firstYearSegments,
      hasChart: schedule.length > 0,
      balance,
      warnings: warnings.map((warning) => warningText[warning]),
      rows,
    };
  });

  // Read out politely after each edit; empty while there is no result (the alert covers errors).
  protected readonly announcement = computed(() => {
    const r = this.result();
    return r ? `${r.eyebrow}: ${formatRand(r.figure)}. ${r.lead}` : '';
  });

  protected set(field: Exclude<keyof HomeLoanInputs, 'mode'>, value: number): void {
    this.store.updateHomeLoan({ [field]: value });
  }

  protected setMode(mode: HomeLoanMode): void {
    this.store.updateHomeLoan({ mode });
  }

  // Editing the margin sets the rate to prime plus margin, so the two fields never disagree.
  protected setMargin(margin: number): void {
    const prime = this.store.prime();
    if (prime !== null) this.store.updateHomeLoan({ ratePercent: rateFromMargin(prime, margin) });
  }
}
