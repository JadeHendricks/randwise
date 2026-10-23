import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { formatShortDate } from '../../core/data/format-date';
import { RatesService } from '../../core/data/rates.service';
import { taxYearLabel } from '../../core/data/tax-calendar';
import { TaxYearStatus } from '../../core/data/tax-year.schema';
import { TaxYearService } from '../../core/data/tax-year.service';
import { JourneyMilestoneKind, RefundMode, roundRand } from '../../core/engine';
import { JourneyWarning } from '../../core/journey/estimate-journey';
import { JOURNEY_LIMITS, JourneyInputs } from '../../core/journey/journey-inputs';
import { ReportModel } from '../../core/pdf/report-model';
import { HANDOFF_SOURCE_LABELS, SendTargetId } from '../../core/plan/handoff';
import { PlanContextStore } from '../../core/plan/plan-context.store';
import { AmountField } from '../../shared/atoms/amount-field/amount-field';
import { Button } from '../../shared/atoms/button/button';
import { Card } from '../../shared/atoms/card/card';
import { Chip } from '../../shared/atoms/chip/chip';
import { Icon } from '../../shared/atoms/icon/icon';
import { LineChart, LinePoint, LineSeries } from '../../shared/atoms/line-chart/line-chart';
import { Money } from '../../shared/atoms/money/money';
import { RingGauge } from '../../shared/atoms/ring-gauge/ring-gauge';
import { formatPercent, formatRand, formatRandCompact } from '../../shared/format/format-rand';
import { DownloadPdf } from '../../shared/molecules/download-pdf/download-pdf';
import { HandoffChip } from '../../shared/molecules/handoff-chip/handoff-chip';
import {
  SegmentedControl,
  SegmentedOption,
} from '../../shared/molecules/segmented-control/segmented-control';
import { SendTo } from '../../shared/molecules/send-to/send-to';
import { Timeline, TimelineItem } from '../../shared/molecules/timeline/timeline';
import { buildJourneyReport } from './journey-report';

// Field limits. Money steps are 1 so a typed amount is never snapped to a coarser step.
const MONEY_STEP = 1;
const PERCENT_STEP = 0.01;
const GROSS_MAX_MONTHLY = 500_000;
const RETIREMENT_MAX_MONTHLY = 60_000;
const CONTRIBUTION_MAX_MONTHLY = 200_000;
const BALANCE_MAX = 20_000_000;
const TFSA_USED_MAX = 1_000_000;

const STATUS_WORDS: Record<TaxYearStatus, string> = {
  verified: 'verified',
  'verified-auto': 'verified (auto)',
  draft: 'draft',
};

const AMOUNT_TEXT = new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 2 });

type OverChoice = 'no' | 'yes';

const MODE_OPTIONS: readonly SegmentedOption<RefundMode>[] = [
  { value: 'refund', label: 'Refund after filing' },
  { value: 'paye', label: 'Lower PAYE each month' },
];
const OVER_OPTIONS: readonly SegmentedOption<OverChoice>[] = [
  { value: 'no', label: 'No' },
  { value: 'yes', label: 'Yes' },
];

interface YearRow {
  readonly year: number;
  readonly age: number;
  readonly income: string;
  readonly ra: string;
  readonly deductible: string;
  readonly notDeductible: string;
  readonly taxSaved: string;
  readonly tfsaIn: string;
  readonly over: string;
  readonly tfsaBalance: string;
  readonly raBalance: string;
  readonly lifetime: string;
}

/** "R 50 000" with a non-breaking space so the amount never splits from the R. */
function randText(amount: number): string {
  return `R\u00a0${AMOUNT_TEXT.format(amount)}`;
}

/**
 * The Journey page. Every figure comes from the shared PlanContextStore (which runs the pure
 * engine); this component only rounds and formats engine results for display and sends edits
 * back through `updateJourney`.
 */
@Component({
  selector: 'rw-journey-page',
  imports: [
    AmountField,
    Button,
    Card,
    Chip,
    DownloadPdf,
    HandoffChip,
    Icon,
    LineChart,
    Money,
    RingGauge,
    SegmentedControl,
    SendTo,
    Timeline,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './journey-page.html',
  styleUrl: './journey-page.scss',
})
export class JourneyPage {
  protected readonly context = inject(PlanContextStore);
  private readonly rates = inject(RatesService);
  private readonly taxYears = inject(TaxYearService);

  protected readonly limits = JOURNEY_LIMITS;
  protected readonly step = MONEY_STEP;
  protected readonly percentStep = PERCENT_STEP;
  protected readonly grossMax = GROSS_MAX_MONTHLY;
  protected readonly retirementMax = RETIREMENT_MAX_MONTHLY;
  protected readonly contributionMax = CONTRIBUTION_MAX_MONTHLY;
  protected readonly balanceMax = BALANCE_MAX;
  protected readonly tfsaUsedMax = TFSA_USED_MAX;
  protected readonly modeOptions = MODE_OPTIONS;
  protected readonly overOptions = OVER_OPTIONS;
  // Short axis labels keep the chart inside a phone screen; its table keeps exact amounts.
  protected readonly compactRand = formatRandCompact;
  protected readonly ageText = (age: number) => `Age ${Math.round(age)}`;
  protected readonly plain = (value: number) => String(Math.round(value));

  protected readonly inputs = this.context.journey;
  protected readonly assumptions = this.rates.assumptions;

  protected readonly fromLabel = computed(() => {
    const from = this.context.journeyFrom();
    return from ? HANDOFF_SOURCE_LABELS[from] : null;
  });

  protected readonly overChoice = computed<OverChoice>(() =>
    this.inputs().allowOverContribution ? 'yes' : 'no',
  );

  protected readonly intro = computed(() => {
    const { retirementAge, grossMonthly, contributionMonthly, tfsaTopUpMonthly } = this.inputs();
    return `This is an example: ${randText(contributionMonthly)} a month to an RA and ${randText(tfsaTopUpMonthly)} a month to a TFSA until age ${retirementAge}, on a ${randText(grossMonthly)} salary. The RA tax refund also goes into the TFSA. Change any value; nothing is saved.`;
  });

  protected readonly retirementAgeHint = computed(() => {
    const rules = this.context.journeyRules();
    return rules ? `An RA pays out from age ${rules.earliestRetirementAge} at the earliest.` : '';
  });
  protected readonly tfsaUsedHint = computed(() => {
    const rules = this.context.journeyRules();
    return rules
      ? `Contributions only, not growth. They count toward the ${formatRand(rules.lifetimeLimit)} lifetime limit.`
      : 'Contributions only, not growth.';
  });
  protected readonly inflationHint = computed(() => {
    const a = this.assumptions();
    return a ? `${a.inflation.description} You can change it.` : '';
  });
  protected readonly growthHint = computed(() => {
    const a = this.assumptions();
    return a ? `${a.growthReturn.description} You can change it.` : '';
  });
  protected readonly tfsaReturnHint = computed(() => {
    const a = this.assumptions();
    return a
      ? `${a.growthReturn.description} For a cash TFSA, ${a.cashReturn.valuePercent}% is the cash rate assumption. You can change it.`
      : '';
  });

  protected readonly failure = computed(() => {
    const estimate = this.context.journeyEstimate();
    return estimate && !estimate.ok ? estimate.message : null;
  });

  protected readonly budgetNote = computed(() => {
    const budget = this.context.journeyBudgetContext();
    // Why null: without a good Budget estimate there are no figures to describe, and the emergency
    // amount would read as R 0,00 a month.
    if (!budget || budget.netMonthly === null) return null;
    return `Your budget has ${formatRand(budget.netMonthly)} a month to spend. ${formatRand(budget.emergencyMonthly)} a month goes to your emergency fund. The journey does not use these figures.`;
  });

  protected readonly result = computed(() => {
    const estimate = this.context.journeyEstimate();
    const rules = this.context.journeyRules();
    if (!estimate?.ok || !rules) return null;
    const inputs = this.inputs();
    const { result, warnings } = estimate;
    const { totals, final, ages, years } = result;
    const rand = (value: number) => formatRand(roundRand(value));
    const retirementAge = ages.retirementAge;

    const milestoneText: Record<JourneyMilestoneKind, (age: number, year: number) => TimelineItem> =
      {
        start: (age) => ({
          id: 'start',
          title: `Age ${age}: today`,
          detail: `You start with ${rand(inputs.startingBalance)} in your RA and ${rand(inputs.tfsaBalance)} in your TFSA.`,
        }),
        'headroom-used': (age, year) => ({
          id: 'headroom-used',
          title: `Age ${age}: RA deduction limit used`,
          detail: `In year ${year} your RA contributions use all the deduction room you have. Anything above it gets no tax relief.`,
        }),
        'tfsa-annual-cap': (age, year) => ({
          id: 'tfsa-annual-cap',
          title: `Age ${age}: TFSA yearly limit reached`,
          detail: `In year ${year} your TFSA money reaches the ${rand(rules.annualLimit)} a year limit.`,
        }),
        'tfsa-lifetime-cap': (age, year) => ({
          id: 'tfsa-lifetime-cap',
          title: `Age ${age}: TFSA lifetime limit reached`,
          detail: `In year ${year} your TFSA contributions reach the ${rand(rules.lifetimeLimit)} lifetime limit. Nothing more can go in without a penalty.`,
        }),
        retirement: (age) => ({
          id: 'retirement',
          title: `Age ${age}: retirement`,
          detail: `RA ${rand(final.raBalance)} and TFSA ${rand(final.tfsaBalance)} (${rand(final.raReal)} and ${rand(final.tfsaReal)} in today's money).`,
        }),
      };
    const timeline: TimelineItem[] = result.milestones.map((milestone) =>
      milestoneText[milestone.kind](milestone.age, milestone.year),
    );

    // Balances in today's money, from today to the end of each year.
    const points = (
      opening: number,
      pick: (row: (typeof years)[number]) => number,
    ): LinePoint[] => [
      { x: inputs.age, y: roundRand(opening) },
      ...years.map((row) => ({ x: row.age + 1, y: roundRand(pick(row)) })),
    ];
    const raSeries: LineSeries = {
      name: "RA balance (today's money)",
      points: points(inputs.startingBalance, (row) => row.raBalanceReal),
    };
    const tfsaSeries: LineSeries = {
      name: "TFSA balance (today's money)",
      points: points(inputs.tfsaBalance, (row) => row.tfsaBalanceReal),
    };

    const warn = new Set<JourneyWarning>(warnings);
    const warningText: Record<JourneyWarning, () => string> = {
      'penalty-exposure': () =>
        `In some years more goes towards the TFSA than the limits allow. The extra ${rand(totals.tfsaExcess)} is not invested here. If you put it in anyway, SARS would tax it at ${formatPercent(rules.penaltyRate, 0)}: ${rand(totals.penalty)}.`,
      'penalty-incurred': () =>
        `You chose to over-contribute. ${rand(totals.tfsaExcess)} goes in above the limits and SARS taxes it at ${formatPercent(rules.penaltyRate, 0)}: ${rand(totals.penalty)}. That tax is not taken from the TFSA balance shown.`,
      'headroom-clamp': () =>
        `${rand(totals.raNonDeductible)} of your RA contributions is above the amount you can deduct, so it gets no tax relief. Carrying that amount forward to later years is not modelled.`,
      'unallocated-refund': () =>
        `${rand(totals.unallocatedRefund)} of your tax refunds did not fit under the TFSA limits and is not invested here. Your RA or your emergency fund could take it.`,
      'below-earliest-age': () =>
        `An RA cannot pay out before age ${rules.earliestRetirementAge}, so this journey runs to age ${retirementAge}, not ${ages.requested}.`,
      'past-retirement-age': () =>
        `You are already at or past age ${retirementAge}, so there are no years left to plan.`,
    };
    const warningList: string[] = [];
    for (const key of Object.keys(warningText) as JourneyWarning[]) {
      if (warn.has(key)) warningList.push(warningText[key]());
    }

    const rows: YearRow[] = years.map((row) => ({
      year: row.year,
      age: row.age,
      income: rand(row.grossMonthly),
      ra: rand(row.raContribution),
      deductible: rand(row.raDeductible),
      notDeductible: rand(row.raNonDeductible),
      taxSaved: rand(row.taxSaving),
      tfsaIn: rand(row.tfsaContribution),
      over: rand(row.tfsaExcess),
      tfsaBalance: rand(row.tfsaBalance),
      raBalance: rand(row.raBalance),
      lifetime: rand(row.lifetimeContributions),
    }));

    const lifetimeUsed =
      years.length > 0 ? years[years.length - 1].lifetimeContributions : inputs.tfsaLifetimeUsed;

    return {
      retirementAge,
      yearCount: years.length,
      taxSaved: roundRand(totals.taxSaved),
      tfsaSentence: `TFSA at ${retirementAge}: ${rand(final.tfsaBalance)} (${rand(final.tfsaReal)} in today's money)`,
      raSentence: `RA at ${retirementAge}: ${rand(final.raBalance)} (${rand(final.raReal)} in today's money)`,
      timeline,
      raSeries,
      tfsaSeries,
      hasChart: years.length > 0,
      ringPercent: result.lifetimePercent,
      ringCentre: formatPercent(result.lifetimePercent / 100, 0),
      lifetimeText: `${rand(lifetimeUsed)} of the ${rand(rules.lifetimeLimit)} lifetime limit.`,
      warnings: warningList,
      rows,
    };
  });

  // Read out politely after each edit; empty while there is no result (the alert covers errors).
  protected readonly announcement = computed(() => {
    const r = this.result();
    return r
      ? `Tax saved by ${r.retirementAge}: ${formatRand(r.taxSaved)}. ${r.tfsaSentence}.`
      : '';
  });

  // PDF export: formats this page's own result(), nothing is recomputed.
  protected readonly report = computed<ReportModel | null>(() => {
    const r = this.result();
    if (!r) return null;
    const inputs = this.inputs();
    const mode = MODE_OPTIONS.find((option) => option.value === inputs.refundMode);
    return buildJourneyReport(inputs, r, mode?.label ?? inputs.refundMode);
  });

  protected readonly taxNote = computed(() => {
    const data = this.taxYears.taxYear();
    const rules = this.context.journeyRules();
    if (!data || !rules) return null;
    return `Based on tax year ${taxYearLabel(data.taxYear)}, ${STATUS_WORDS[data.status]} data checked ${formatShortDate(data.verifiedOn)}. Year 1 is the current tax year; income, payroll retirement contributions and the RA contribution rise once a year, and the table shows each year's age at its start. RA contributions are paid at the end of each month. A tax refund is invested at the end of the year it relates to and counts toward that year's TFSA limit (${formatRand(rules.annualLimit)} a year, ${formatRand(rules.lifetimeLimit)} for life); with lower PAYE it is invested monthly instead. The monthly top-up goes in first, then the refund. Every year is taxed with this year's tax tables, which are not raised for inflation, so later tax savings are on the high side. Estimates only; nothing is saved.`;
  });

  protected sendTo(target: SendTargetId): void {
    this.context.sendFromJourney(target);
  }

  protected set(
    field: Exclude<keyof JourneyInputs, 'refundMode' | 'allowOverContribution'>,
    value: number,
  ): void {
    this.context.updateJourney({ [field]: value });
  }

  protected setMode(mode: RefundMode): void {
    this.context.updateJourney({ refundMode: mode });
  }

  protected setOver(choice: OverChoice): void {
    this.context.updateJourney({ allowOverContribution: choice === 'yes' });
  }
}
