import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
} from '@angular/core';

import { BUDGET_LIMITS, BudgetSettings } from '../../core/budget/budget-inputs';
import { formatShortDate } from '../../core/data/format-date';
import { taxYearLabel } from '../../core/data/tax-calendar';
import { TaxYearStatus } from '../../core/data/tax-year.schema';
import { TaxYearService } from '../../core/data/tax-year.service';
import {
  BUDGET_GROUPS,
  BUDGET_PRESETS,
  BudgetGroup,
  BudgetPresetId,
  BudgetWarning,
  PayPeriod,
  roundRand,
} from '../../core/engine';
import { ReportModel } from '../../core/pdf/report-model';
import { HANDOFF_SOURCE_LABELS, SendTargetId } from '../../core/plan/handoff';
import { PlanContextStore } from '../../core/plan/plan-context.store';
import { AmountBasis, SalaryInputs } from '../../core/salary/salary-inputs';
import { AmountField } from '../../shared/atoms/amount-field/amount-field';
import { BreakdownBar, BreakdownSegment } from '../../shared/atoms/breakdown-bar/breakdown-bar';
import { Button } from '../../shared/atoms/button/button';
import { Card } from '../../shared/atoms/card/card';
import { Chip } from '../../shared/atoms/chip/chip';
import { DotColumn, DotMatrix } from '../../shared/atoms/dot-matrix/dot-matrix';
import { Icon } from '../../shared/atoms/icon/icon';
import { Money } from '../../shared/atoms/money/money';
import { RingGauge } from '../../shared/atoms/ring-gauge/ring-gauge';
import { formatPercent, formatRand } from '../../shared/format/format-rand';
import { CategoryRow } from '../../shared/molecules/category-row/category-row';
import { DownloadPdf } from '../../shared/molecules/download-pdf/download-pdf';
import { HandoffChip } from '../../shared/molecules/handoff-chip/handoff-chip';
import {
  SegmentedControl,
  SegmentedOption,
} from '../../shared/molecules/segmented-control/segmented-control';
import { SendTo } from '../../shared/molecules/send-to/send-to';
import { buildBudgetReport } from './budget-report';

// Field limits. Money steps are 1 so a typed amount is never snapped to a coarser step.
const MONEY_STEP = 1;
const AMOUNT_MAX: Record<PayPeriod, number> = { monthly: 500_000, annual: 6_000_000 };
const RETIREMENT_MAX_MONTHLY = 60_000;
const OTHER_MAX_MONTHLY = 50_000;
const SAVED_MAX = 10_000_000;
const TFSA_USED_MAX = 1_000_000;

const STATUS_WORDS: Record<TaxYearStatus, string> = {
  verified: 'verified',
  'verified-auto': 'verified (auto)',
  draft: 'draft',
};

const GROUP_TITLES: Record<BudgetGroup, string> = {
  needs: 'Needs',
  wants: 'Wants',
  savings: 'Savings',
};
const ADD_LABELS: Record<BudgetGroup, string> = {
  needs: 'Add a need',
  wants: 'Add a want',
  savings: 'Add a saving',
};

interface PresetView {
  readonly id: BudgetPresetId;
  readonly label: string;
  /** Spells out the split, since "60/20/20" alone does not say which group is which. */
  readonly aria: string;
}

const PRESETS: readonly PresetView[] = (Object.keys(BUDGET_PRESETS) as BudgetPresetId[]).map(
  (id) => {
    const { needs, wants, savings } = BUDGET_PRESETS[id];
    const label = id.replaceAll('-', '/');
    const percent = (fraction: number) => Math.round(fraction * 100);
    return {
      id,
      label,
      aria: `${label} preset: ${percent(needs)}% needs, ${percent(wants)}% wants, ${percent(savings)}% savings`,
    };
  },
);

type NumberField = Exclude<keyof SalaryInputs, 'basis' | 'period'>;

interface LineView {
  readonly id: string;
  readonly name: string;
  readonly amount: number;
  readonly percent: number;
  readonly custom: boolean;
}

/** One line in the savings checks; a warning is also marked with an icon, never colour alone. */
interface CheckView {
  readonly text: string;
  readonly warn: boolean;
}

interface GroupView {
  readonly group: BudgetGroup;
  readonly heading: string;
  readonly addLabel: string;
  readonly lines: readonly LineView[];
}

/** Two decimals for the share field; the amounts underneath keep full precision. */
const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * The Budget page. Every figure comes from the shared PlanContextStore (which runs the pure
 * engine); this component only rounds and formats engine results for display and sends edits
 * back through the store.
 */
@Component({
  selector: 'rw-budget-page',
  imports: [
    AmountField,
    BreakdownBar,
    Button,
    CategoryRow,
    Card,
    Chip,
    DotMatrix,
    DownloadPdf,
    HandoffChip,
    Icon,
    Money,
    RingGauge,
    SegmentedControl,
    SendTo,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './budget-page.html',
  styleUrl: './budget-page.scss',
})
export class BudgetPage {
  protected readonly context = inject(PlanContextStore);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly taxYears = inject(TaxYearService);

  protected readonly limits = BUDGET_LIMITS;
  protected readonly step = MONEY_STEP;
  protected readonly retirementMax = RETIREMENT_MAX_MONTHLY;
  protected readonly otherMax = OTHER_MAX_MONTHLY;
  protected readonly savedMax = SAVED_MAX;
  protected readonly tfsaUsedMax = TFSA_USED_MAX;
  protected readonly presets = PRESETS;

  protected readonly basisOptions: readonly SegmentedOption<AmountBasis>[] = [
    { value: 'gross', label: 'Gross pay' },
    { value: 'net', label: 'Take-home pay' },
  ];
  protected readonly periodOptions: readonly SegmentedOption<PayPeriod>[] = [
    { value: 'monthly', label: 'Per month' },
    { value: 'annual', label: 'Per year' },
  ];

  protected readonly inputs = this.context.budgetIncome;
  protected readonly settings = this.context.budgetSettings;
  protected readonly presetId = this.context.budgetPresetId;

  protected readonly fromLabel = computed(() => {
    const from = this.context.budgetFrom();
    return from ? HANDOFF_SOURCE_LABELS[from] : null;
  });

  protected readonly amountMax = computed(() => AMOUNT_MAX[this.inputs().period]);
  protected readonly amountLabel = computed(() => {
    const { basis, period } = this.inputs();
    return `${basis === 'gross' ? 'Gross pay' : 'Take-home pay'} ${period === 'monthly' ? 'per month' : 'per year'}`;
  });

  protected readonly tfsaUsedHint = computed(() => {
    const rules = this.context.tfsaRules();
    return rules
      ? `Contributions only, not growth. They count toward the ${formatRand(rules.lifetimeLimit)} lifetime limit.`
      : 'Contributions only, not growth.';
  });

  protected readonly failure = computed(() => {
    const estimate = this.context.budgetEstimate();
    return estimate && !estimate.ok ? estimate.message : null;
  });

  /** One line can hold at most the take-home, rounded up to the next R1 000. */
  protected readonly lineMax = computed(() => {
    const estimate = this.context.budgetEstimate();
    const net = estimate?.ok ? roundRand(estimate.net) : 0;
    return Math.max(1_000, Math.ceil(net / 1_000) * 1_000);
  });

  protected readonly result = computed(() => {
    const estimate = this.context.budgetEstimate();
    const rules = this.context.tfsaRules();
    if (!estimate?.ok || !rules) return null;
    const { summary, limits, categories } = estimate;
    const rand = (value: number) => formatRand(roundRand(value));
    const pct = (percent: number) => formatPercent(percent / 100, 1);
    const unallocated = summary.underAllocated;

    const amountOf = (group: BudgetGroup) =>
      summary.groups.find((entry) => entry.group === group)?.amount ?? 0;
    const columns: DotColumn[] = [
      ...BUDGET_GROUPS.map((group) => ({ label: GROUP_TITLES[group], value: amountOf(group) })),
      { label: 'Unallocated', value: unallocated },
    ];
    const segments: BreakdownSegment[] = [
      { label: 'Needs', value: amountOf('needs'), tone: 'sky' },
      { label: 'Wants', value: amountOf('wants'), tone: 'violet' },
      { label: 'Savings', value: amountOf('savings'), tone: 'accent' },
      { label: 'Unallocated', value: unallocated, tone: 'muted' },
    ];

    const sentence =
      summary.status === 'balanced'
        ? 'Every rand has a job'
        : summary.status === 'under'
          ? `Unallocated ${rand(summary.unallocated)}`
          : `Over-allocated by ${rand(summary.overAllocated)}`;

    const groups: GroupView[] = summary.groups.map((entry) => ({
      group: entry.group,
      heading: `${GROUP_TITLES[entry.group]} ${rand(entry.amount)} (${pct(entry.percent)})`,
      addLabel: ADD_LABELS[entry.group],
      lines: categories
        .filter((line) => line.group === entry.group)
        .map((line) => ({
          id: line.id,
          name: line.name,
          amount: roundRand(line.amount),
          percent: round2(summary.lines.find((item) => item.id === line.id)?.percent ?? 0),
          custom: line.kind === 'custom',
        })),
    }));

    const { ra, tfsa, emergency } = limits;
    const checks: CheckView[] = [];
    const info = (text: string) => checks.push({ text, warn: false });
    const warn = (text: string) => checks.push({ text, warn: true });
    const has = (key: BudgetWarning) => limits.warnings.includes(key);
    if (ra.monthly > 0) {
      info(
        `Your RA line is ${rand(ra.annual)} a year. ${rand(ra.deductibleAnnual)} of it is deductible and saves about ${rand(ra.taxSavingAnnual)} a year in tax, paid to you as a refund when you are assessed.`,
      );
    }
    if (has('ra-over-headroom')) {
      warn(
        `${rand(ra.nonDeductibleAnnual)} of your RA line is over the ${rand(ra.headroomAnnual)} a year you can still deduct, so that part gets no tax relief.`,
      );
    }
    if (has('tfsa-over-annual')) {
      warn(
        `Your TFSA line is ${rand(tfsa.annual)} a year, ${rand(tfsa.contribution.overAnnualBy)} over the ${rand(tfsa.annualLimit)} annual limit (about ${rand(tfsa.annualLimitMonthly)} a month).`,
      );
    }
    if (has('tfsa-over-lifetime')) {
      warn(
        `Your TFSA contributions would pass the ${rand(rules.lifetimeLimit)} lifetime limit. Only ${rand(tfsa.contribution.lifetimeRoom)} of room is left.`,
      );
    }
    if (has('tfsa-over-annual') || has('tfsa-over-lifetime')) {
      warn(
        `SARS taxes the excess at ${formatPercent(rules.penaltyRate, 0)}: ${rand(tfsa.contribution.penalty)} on the ${rand(tfsa.contribution.excess)} that is over.`,
      );
    } else if (tfsa.yearsToLifetime !== null) {
      const years = Math.max(1, Math.round(tfsa.yearsToLifetime));
      info(
        `At this pace you would fill the TFSA lifetime limit in about ${years} ${years === 1 ? 'year' : 'years'}.`,
      );
    }

    const monthsWord = (n: number) => `${n} ${n === 1 ? 'month' : 'months'}`;
    const emergencyText =
      emergency.target <= 0
        ? 'Add your needs to see how much the fund should hold.'
        : emergency.reached
          ? `Target reached: ${rand(emergency.target)}, which is ${monthsWord(emergency.months)} of needs.`
          : emergency.monthsToTarget === null
            ? `Target ${rand(emergency.target)} (${monthsWord(emergency.months)} of needs). Nothing is going in, so it is not reached.`
            : `Target ${rand(emergency.target)} (${monthsWord(emergency.months)} of needs). At ${rand(emergency.monthly)} a month you reach it in ${monthsWord(emergency.monthsToTarget)}.`;

    return {
      net: roundRand(estimate.net),
      status: summary.status,
      sentence,
      overText: `Your lines add up to ${rand(summary.total)}, which is ${rand(summary.overAllocated)} more than your take-home. Lower a line or choose a preset.`,
      columns,
      segments,
      caption: `${columns.map((column) => `${column.label} ${rand(column.value)}`).join(', ')}.`,
      groups,
      checks,
      emergencyPercent: emergency.progressPercent,
      emergencyCentre: formatPercent(emergency.progressPercent / 100, 0),
      emergencyText,
    };
  });

  // Read out politely after each edit; empty while there is no result (the alert covers errors).
  protected readonly announcement = computed(() => {
    const r = this.result();
    return r ? `Take-home ${formatRand(r.net)} a month. ${r.sentence}.` : '';
  });

  // PDF export: formats this page's own result(), nothing is recomputed.
  protected readonly report = computed<ReportModel | null>(() => {
    const r = this.result();
    return r ? buildBudgetReport(this.inputs(), this.settings(), r, this.amountLabel()) : null;
  });

  protected readonly taxNote = computed(() => {
    const data = this.taxYears.taxYear();
    const rules = this.context.tfsaRules();
    if (!data || !rules) return null;
    return `Based on tax year ${taxYearLabel(data.taxYear)}, ${STATUS_WORDS[data.status]} data checked ${formatShortDate(data.verifiedOn)}. The budget is built on your take-home pay: payroll retirement contributions and other deductions are already taken out of it, and an employer contribution is not cash, so it is left out. The RA line is paid from take-home on top of any payroll contributions, and its tax saving comes back as a refund when you are assessed. The TFSA limits are ${formatRand(rules.annualLimit)} a tax year and ${formatRand(rules.lifetimeLimit)} for life; the ${formatPercent(rules.penaltyRate, 0)} tax is charged once on the excess. Amounts are kept to the cent and shown rounded, so the percentages may not add up to exactly 100%. Estimates only; nothing is saved.`;
  });

  protected rand(amount: number): string {
    return formatRand(amount);
  }

  protected sendTo(target: SendTargetId): void {
    this.context.sendFromBudget(target);
  }

  /**
   * The cap for one line: the shared cap, or the line's own amount when a handoff sent more (for
   * example the RA line from Retire at 55), so the field never shows a value above its max.
   */
  protected lineMaxFor(amount: number): number {
    return Math.max(this.lineMax(), Math.ceil(roundRand(amount) / 1_000) * 1_000);
  }

  // Why: the Remove button that had focus is destroyed with its row, so focus would fall to the
  // top of the page. Move it to the group's Add button, which is always still there.
  protected removeLine(id: string, group: BudgetGroup): void {
    this.context.removeBudgetLine(id);
    afterNextRender(
      () => this.host.nativeElement.querySelector<HTMLElement>(`[data-add-group="${group}"]`)?.focus(),
      { injector: this.injector },
    );
  }

  protected set(field: NumberField, value: number): void {
    this.context.updateBudgetIncome({ [field]: value });
  }

  protected setSetting(field: keyof BudgetSettings, value: number): void {
    this.context.updateBudgetSettings({ [field]: value });
  }
}
