import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { formatShortDate } from '../../core/data/format-date';
import { RatesService } from '../../core/data/rates.service';
import { taxYearLabel } from '../../core/data/tax-calendar';
import { TaxYearStatus } from '../../core/data/tax-year.schema';
import { TaxYearService } from '../../core/data/tax-year.service';
import { MAX_RA_RETIREMENT_AGE, roundRand } from '../../core/engine';
import { HANDOFF_SOURCE_LABELS, SendTargetId } from '../../core/plan/handoff';
import { PlanContextStore } from '../../core/plan/plan-context.store';
import {
  HIGH_RETURN,
  RetireProblem,
  RetireWarning,
} from '../../core/retire/estimate-retire';
import {
  RETIRE_LIMITS,
  RetireInputs,
  retirementReturnAssumption,
} from '../../core/retire/retire-inputs';
import { AmountField } from '../../shared/atoms/amount-field/amount-field';
import { Button } from '../../shared/atoms/button/button';
import { Card } from '../../shared/atoms/card/card';
import { Chip } from '../../shared/atoms/chip/chip';
import { Icon } from '../../shared/atoms/icon/icon';
import { LineChart, LineMarker, LinePoint, LineSeries } from '../../shared/atoms/line-chart/line-chart';
import { Money } from '../../shared/atoms/money/money';
import { RingGauge } from '../../shared/atoms/ring-gauge/ring-gauge';
import { formatPercent, formatRand, formatRandCompact } from '../../shared/format/format-rand';
import { HandoffChip } from '../../shared/molecules/handoff-chip/handoff-chip';
import {
  SegmentedControl,
  SegmentedOption,
} from '../../shared/molecules/segmented-control/segmented-control';
import { SendTo } from '../../shared/molecules/send-to/send-to';
import { StatCard } from '../../shared/molecules/stat-card/stat-card';

// Field limits. Money steps are 1 so a typed amount is never snapped to a coarser step.
const MONEY_STEP = 1;
const PERCENT_STEP = 0.01;
const GOAL_MAX_MONTHLY = 500_000;
const GROSS_MAX_MONTHLY = 500_000;
const RETIREMENT_MAX_MONTHLY = 60_000;
const CONTRIBUTION_MAX_MONTHLY = 200_000;
const BALANCE_MAX = 20_000_000;

// The ages at which the age rebates step up; the income table shows these rows.
const REBATE_STEP_AGES = [65, 75] as const;

const STATUS_WORDS: Record<TaxYearStatus, string> = {
  verified: 'verified',
  'verified-auto': 'verified (auto)',
  draft: 'draft',
};

const AMOUNT_TEXT = new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 2 });

type LumpChoice = 'no' | 'yes';

const LUMP_OPTIONS: readonly SegmentedOption<LumpChoice>[] = [
  { value: 'no', label: 'No' },
  { value: 'yes', label: 'Yes' },
];

interface IncomeRow {
  readonly age: number;
  readonly before: string;
  readonly tax: string;
  readonly after: string;
}

/** "R 50 000" with a non-breaking space so the amount never splits from the R. */
function randText(amount: number): string {
  return `R\u00a0${AMOUNT_TEXT.format(amount)}`;
}

/**
 * The Retire at 55 page. Every figure comes from the shared PlanContextStore (which runs the pure
 * engine); this component only rounds and formats engine results for display (and divides a
 * yearly amount by 12 for a monthly one) and sends edits back through `updateRetire`.
 */
@Component({
  selector: 'rw-retire-page',
  imports: [
    AmountField,
    Button,
    Card,
    Chip,
    HandoffChip,
    Icon,
    LineChart,
    Money,
    RingGauge,
    SegmentedControl,
    SendTo,
    StatCard,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './retire-page.html',
  styleUrl: './retire-page.scss',
})
export class RetirePage {
  protected readonly context = inject(PlanContextStore);
  private readonly rates = inject(RatesService);
  private readonly taxYears = inject(TaxYearService);

  protected readonly limits = RETIRE_LIMITS;
  protected readonly step = MONEY_STEP;
  protected readonly percentStep = PERCENT_STEP;
  protected readonly goalMax = GOAL_MAX_MONTHLY;
  protected readonly grossMax = GROSS_MAX_MONTHLY;
  protected readonly retirementMax = RETIREMENT_MAX_MONTHLY;
  protected readonly contributionMax = CONTRIBUTION_MAX_MONTHLY;
  protected readonly balanceMax = BALANCE_MAX;
  protected readonly lumpOptions = LUMP_OPTIONS;
  // Short axis labels keep the chart inside a phone screen; its table keeps exact amounts.
  protected readonly compactRand = formatRandCompact;
  protected readonly ageText = (age: number) => `Age ${Math.round(age)}`;
  protected readonly plain = (value: number) => String(Math.round(value));

  protected readonly inputs = this.context.retire;
  protected readonly assumptions = this.rates.assumptions;

  protected readonly fromLabel = computed(() => {
    const from = this.context.retireFrom();
    return from ? HANDOFF_SOURCE_LABELS[from] : null;
  });

  protected readonly lumpChoice = computed<LumpChoice>(() =>
    this.inputs().takeLumpSum ? 'yes' : 'no',
  );

  protected readonly intro = computed(() => {
    const { goalNetMonthly, retirementAge, grossMonthly } = this.inputs();
    return `This is an example: ${randText(goalNetMonthly)} a month in today's money from age ${retirementAge}, on a ${randText(grossMonthly)} salary. Change any value; nothing is saved.`;
  });

  protected readonly retirementAgeHint = computed(() => {
    const rules = this.context.retireRules();
    return rules ? `An RA pays out from age ${rules.earliestRetirementAge} at the earliest.` : '';
  });

  protected readonly drawdownHint = computed(() => {
    const rules = this.context.retireRules();
    return rules
      ? `The share of the balance you draw each year. The law allows ${formatPercent(rules.drawdownMin)} to ${formatPercent(rules.drawdownMax)}.`
      : 'The share of the balance you draw each year.';
  });

  protected readonly inflationHint = computed(() => {
    const a = this.assumptions();
    return a ? `${a.inflation.description} You can change it.` : '';
  });
  protected readonly growthHint = computed(() => {
    const a = this.assumptions();
    return a ? `${a.growthReturn.description} You can change it.` : '';
  });
  protected readonly retirementReturnText = computed(
    () => retirementReturnAssumption(this.assumptions())?.description ?? '',
  );
  protected readonly retirementReturnHint = computed(() => {
    const text = this.retirementReturnText();
    return text ? `${text} You can change it.` : '';
  });

  protected readonly problems = computed<string[] | null>(() => {
    const estimate = this.context.retireEstimate();
    const rules = this.context.retireRules();
    if (!estimate || estimate.ok || !rules) return null;
    const earliest = rules.earliestRetirementAge;
    const messages: Record<RetireProblem, string> = {
      'drawdown-too-low': `A living annuity lets you draw between ${formatPercent(rules.drawdownMin)} and ${formatPercent(rules.drawdownMax)} of the balance each year. Choose a drawdown in that range.`,
      'drawdown-too-high': `A living annuity lets you draw between ${formatPercent(rules.drawdownMin)} and ${formatPercent(rules.drawdownMax)} of the balance each year. Choose a drawdown in that range.`,
      'retirement-age-too-early': `An RA cannot pay out before age ${earliest}. Choose a retirement age of ${earliest} or more.`,
      'retirement-age-too-late': `Choose a retirement age of ${MAX_RA_RETIREMENT_AGE} or less.`,
      'already-at-retirement-age': 'Your retirement age must be later than your current age.',
      'invalid-figures': 'Those figures could not be worked out. Check the amounts and try again.',
    };
    return estimate.problems.map((problem) => messages[problem]);
  });

  protected readonly result = computed(() => {
    const estimate = this.context.retireEstimate();
    const rules = this.context.retireRules();
    if (!estimate?.ok || !rules) return null;
    const inputs = this.inputs();
    const { result } = estimate;
    const { income, capital, requiredContribution, requiredReturn, current, drawdown } = result;
    const rand = (value: number) => formatRand(roundRand(value));
    const monthly = (yearly: number) => roundRand(yearly / 12);
    const warn = new Set(estimate.warnings);
    const retirementAge = result.retirementAge;

    const incomeAges = [retirementAge, ...REBATE_STEP_AGES.filter((age) => age > retirementAge)];
    const incomeRows = incomeAges.flatMap<IncomeRow>((age) => {
      const row = drawdown.series.find((year) => year.age === age);
      // Only rows that still pay an income: not after the money has run out.
      if (!row || row.income <= 0 || (drawdown.runsOutAge !== null && age >= drawdown.runsOutAge)) {
        return [];
      }
      return [
        {
          age,
          before: rand(row.income / 12),
          tax: rand(row.tax / 12),
          after: rand(row.net / 12),
        },
      ];
    });

    // The plan balance in today's money: the savings years, then the retirement years. With a lump
    // sum the balance drops at the retirement age (two points with the same x, kept in order).
    const savingPoints = (series: readonly { year: number; real: number }[]): LinePoint[] =>
      series.map((year) => ({ x: inputs.age + year.year, y: roundRand(year.real) }));
    const spendPoints = (rows: typeof drawdown.series): LinePoint[] =>
      rows
        .filter((row, index) => index > 0 || inputs.takeLumpSum)
        .map((row) => ({ x: row.age, y: roundRand(row.real) }));
    const planSeries: LineSeries = {
      name: "Plan balance (today's money)",
      points: [...savingPoints(result.plan.series), ...spendPoints(drawdown.series)],
    };
    const currentSeries: LineSeries = {
      name: 'At your current contribution',
      points: [...savingPoints(current.projection.series), ...spendPoints(current.drawdown.series)],
    };

    const horizonRow = drawdown.series[drawdown.series.length - 1];
    const marker: LineMarker =
      drawdown.runsOutAge !== null
        ? { x: drawdown.runsOutAge, y: 0, label: `Money runs out at ${drawdown.runsOutAge}` }
        : {
            x: drawdown.horizonAge,
            y: roundRand(horizonRow.real),
            label: `Money lasts beyond age ${drawdown.horizonAge}`,
          };

    const gap = current.gapToday;
    const rateText = requiredReturn.rate === null ? '' : formatPercent(requiredReturn.rate);
    const currentContribution = randText(inputs.contributionMonthly);
    const returnSentence =
      requiredReturn.status === 'solved'
        ? `Or keep ${currentContribution} a month and earn ${rateText} a year before retirement.`
        : requiredReturn.status === 'already-funded'
          ? `At ${currentContribution} a month you would reach this even with no investment growth.`
          : `At ${currentContribution} a month, no return up to 100% a year would reach this.`;
    const neededReturn =
      requiredReturn.status === 'solved'
        ? rateText
        : requiredReturn.status === 'already-funded'
          ? formatPercent(0)
          : 'Not reachable';

    const warnings: string[] = [];
    const warningFor: Record<RetireWarning, () => string> = {
      'de-minimis': () =>
        `Your retirement savings at ${retirementAge} would be ${randText(rules.annuitisationDeMinimis)} or less, so you may be allowed to take all of it as cash instead of buying a living annuity. This plan still assumes you buy one.`,
      'high-return': () =>
        `A return above ${formatPercent(HIGH_RETURN, 0)} a year is hard to rely on over many years. Check your return assumptions.`,
      'high-required-return': () =>
        `The return needed at your current contribution (${rateText} a year) is far above what is usually realistic. A higher contribution is the safer plan.`,
      'required-return-unreachable': () =>
        'No return up to 100% a year would reach this at your current contribution. A higher contribution is the only way.',
      'drawdown-cap': () =>
        `From age ${drawdown.maxRateExceededAge} this income is more than ${formatPercent(rules.drawdownMax)} of the balance, so a living annuity would have to pay less.`,
    };
    for (const key of Object.keys(warningFor) as RetireWarning[]) {
      if (warn.has(key)) warnings.push(warningFor[key]());
    }

    const lasts = (age: number | null, horizon: number) =>
      age === null ? `Beyond age ${horizon}` : `Age ${age}`;

    return {
      retirementAge,
      years: result.years,
      requiredMonthly: roundRand(requiredContribution.monthly),
      goalSentence: `to retire at ${retirementAge} on ${randText(inputs.goalNetMonthly)} a month in today's money.`,
      returnSentence,
      warnings,
      ringPercent: current.ringPercent,
      ringCentre: formatPercent(current.ringPercent / 100, 0),
      projectedNominal: roundRand(current.projection.final.nominal),
      projectedReal: rand(current.projection.final.real),
      surplus: gap >= 0,
      gapAmount: roundRand(Math.abs(gap)),
      capitalTotal: roundRand(capital.total),
      capitalToday: roundRand(result.capitalToday),
      incomeBeforeMonthly: monthly(income.grossAnnual),
      incomeTaxMonthly: monthly(income.taxAnnual),
      incomeAfterMonthly: monthly(income.netAnnual),
      drawdownSentence: `Drawing ${formatPercent(inputs.drawdownPercent / 100, 2)} of the balance in the first year pays ${rand(income.grossAnnual / 12)} a month before tax from a living annuity worth ${rand(capital.annuityCapital)}.`,
      incomeRows,
      takeLumpSum: inputs.takeLumpSum,
      lumpGross: roundRand(capital.lumpSum.gross),
      lumpTax: roundRand(capital.lumpSum.tax),
      lumpNet: roundRand(capital.lumpSum.net),
      annuityCapital: roundRand(capital.annuityCapital),
      netCostMonthly: roundRand(requiredContribution.netCostMonthly),
      lastsText: lasts(drawdown.runsOutAge, drawdown.horizonAge),
      lastsCurrentText: `At your current contribution: ${lasts(current.drawdown.runsOutAge, current.drawdown.horizonAge).toLowerCase()}`,
      neededReturn,
      planSeries,
      currentSeries,
      marker,
    };
  });

  // Read out politely after each edit; empty while there is no result (the alert covers errors).
  protected readonly announcement = computed(() => {
    const r = this.result();
    return r
      ? `Required contribution ${formatRand(r.requiredMonthly)} a month. On track ${r.ringCentre}.`
      : '';
  });

  protected readonly taxNote = computed(() => {
    const data = this.taxYears.taxYear();
    if (!data) return null;
    return `Based on tax year ${taxYearLabel(data.taxYear)}, ${STATUS_WORDS[data.status]} data checked ${formatShortDate(data.verifiedOn)}.`;
  });

  protected rand(amount: number): string {
    return formatRand(amount);
  }

  protected sendTo(target: SendTargetId): void {
    this.context.sendFromRetire(target);
  }

  protected set(field: Exclude<keyof RetireInputs, 'takeLumpSum'>, value: number): void {
    this.context.updateRetire({ [field]: value });
  }

  protected setLump(choice: LumpChoice): void {
    this.context.updateRetire({ takeLumpSum: choice === 'yes' });
  }
}
