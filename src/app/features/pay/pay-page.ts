import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { formatShortDate } from '../../core/data/format-date';
import { taxYearLabel } from '../../core/data/tax-calendar';
import { TaxYearStatus } from '../../core/data/tax-year.schema';
import { TaxYearService } from '../../core/data/tax-year.service';
import { PayPeriod, PayslipAmounts, roundRand } from '../../core/engine';
import type { SendTargetId } from '../../core/plan/handoff';
import { ReportModel } from '../../core/pdf/report-model';
import { PlanContextStore } from '../../core/plan/plan-context.store';
import { BreakdownKey } from '../../core/salary/estimate-salary';
import { SalaryEstimator } from '../../core/salary/salary-estimator';
import { AmountBasis, SALARY_LIMITS, SalaryInputs } from '../../core/salary/salary-inputs';
import { SalaryInputsStore } from '../../core/salary/salary-inputs.store';
import { AmountField } from '../../shared/atoms/amount-field/amount-field';
import { BreakdownBar, BreakdownSegment } from '../../shared/atoms/breakdown-bar/breakdown-bar';
import { Button } from '../../shared/atoms/button/button';
import { Card } from '../../shared/atoms/card/card';
import { Chip } from '../../shared/atoms/chip/chip';
import { LineChart, LineMarker, LineSeries } from '../../shared/atoms/line-chart/line-chart';
import { Money } from '../../shared/atoms/money/money';
import { RingGauge } from '../../shared/atoms/ring-gauge/ring-gauge';
import { ChartTone } from '../../shared/charts/chart-tone';
import { formatPercent, formatRand, formatRandCompact } from '../../shared/format/format-rand';
import {
  SegmentedControl,
  SegmentedOption,
} from '../../shared/molecules/segmented-control/segmented-control';
import { DownloadPdf } from '../../shared/molecules/download-pdf/download-pdf';
import { SendTo } from '../../shared/molecules/send-to/send-to';
import { StatCard } from '../../shared/molecules/stat-card/stat-card';
import { buildPayReport } from './pay-report';

// Field limits. Money steps are 1 so a typed amount is never snapped to a coarser step.
const MONEY_STEP = 1;
const AMOUNT_MAX: Record<PayPeriod, number> = { monthly: 500_000, annual: 6_000_000 };
const RETIREMENT_MAX_MONTHLY = 60_000;
const OTHER_MAX_MONTHLY = 50_000;

const BREAKDOWN_TONES: Record<BreakdownKey, ChartTone> = {
  net: 'accent',
  paye: 'rose',
  uif: 'sun',
  retirement: 'violet',
  other: 'sky',
};

const STATUS_WORDS: Record<TaxYearStatus, string> = {
  verified: 'verified',
  'verified-auto': 'verified (auto)',
  draft: 'draft',
};

type NumberField = Exclude<keyof SalaryInputs, 'basis' | 'period'>;

/** A rounded monthly and annual pair, ready to show. */
interface Pair {
  readonly monthly: number;
  readonly annual: number;
}

interface TableRow {
  readonly label: string;
  readonly monthly: string;
  readonly annual: string;
  readonly total?: boolean;
}

/**
 * The Salary page. Every figure comes from the shared SalaryEstimator; this component only
 * rounds and formats engine results for display and sends edits to SalaryInputsStore.
 */
@Component({
  selector: 'rw-pay-page',
  imports: [
    AmountField,
    BreakdownBar,
    Button,
    Card,
    Chip,
    DownloadPdf,
    LineChart,
    Money,
    RingGauge,
    SegmentedControl,
    SendTo,
    StatCard,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pay-page.html',
  styleUrl: './pay-page.scss',
})
export class PayPage {
  protected readonly store = inject(SalaryInputsStore);
  protected readonly estimator = inject(SalaryEstimator);
  private readonly taxYears = inject(TaxYearService);
  private readonly context = inject(PlanContextStore);

  protected readonly limits = SALARY_LIMITS;
  protected readonly step = MONEY_STEP;
  protected readonly retirementMax = RETIREMENT_MAX_MONTHLY;
  protected readonly otherMax = OTHER_MAX_MONTHLY;
  // Short axis labels keep the chart inside a phone screen; its table keeps exact amounts.
  protected readonly compactRand = formatRandCompact;

  protected readonly basisOptions: readonly SegmentedOption<AmountBasis>[] = [
    { value: 'gross', label: 'Gross pay' },
    { value: 'net', label: 'Take-home pay' },
  ];
  protected readonly periodOptions: readonly SegmentedOption<PayPeriod>[] = [
    { value: 'monthly', label: 'Per month' },
    { value: 'annual', label: 'Per year' },
  ];

  protected readonly inputs = this.store.inputs;
  protected readonly amountMax = computed(() => AMOUNT_MAX[this.inputs().period]);
  protected readonly amountLabel = computed(() => {
    const { basis, period } = this.inputs();
    return `${basis === 'gross' ? 'Gross pay' : 'Take-home pay'} ${period === 'monthly' ? 'per month' : 'per year'}`;
  });

  protected readonly failure = computed(() => {
    const estimate = this.estimator.estimate();
    return estimate && !estimate.ok ? estimate.message : null;
  });

  protected readonly result = computed(() => {
    const estimate = this.estimator.estimate();
    if (!estimate?.ok) return null;
    const { monthly, annual, marginalRate, effectiveRate } = estimate.payslip;
    const pair = (pick: (amounts: PayslipAmounts) => number): Pair => ({
      monthly: roundRand(pick(monthly)),
      annual: roundRand(pick(annual)),
    });
    const net = pair((a) => a.netPay);
    const gross = pair((a) => a.gross);
    const paye = pair((a) => a.paye);
    const uif = pair((a) => a.uif);
    const medicalCredit = pair((a) => a.medicalCredit);
    const taxableIncome = pair((a) => a.taxableIncome);
    const employee = pair((a) => a.employeeRetirement);
    const employer = pair((a) => a.fringeBenefit);
    const other = pair((a) => a.otherDeductions);
    const retirement = {
      deductible: pair((a) => a.retirement.deductible),
      excess: pair((a) => a.retirement.excess),
      headroom: pair((a) => a.retirement.headroom),
    };
    const row = (label: string, value: Pair, total = false): TableRow => ({
      label,
      monthly: formatRand(value.monthly),
      annual: formatRand(value.annual),
      total,
    });
    return {
      net,
      gross,
      paye,
      uif,
      medicalCredit,
      taxableIncome,
      retirement,
      overLimit: retirement.excess.annual > 0,
      usedPercent: estimate.retirementUsedPercent,
      marginalRate: formatPercent(marginalRate),
      effectiveRate: formatPercent(effectiveRate),
      segments: estimate.breakdown.map<BreakdownSegment>((line) => ({
        label: line.label,
        value: line.monthly,
        tone: BREAKDOWN_TONES[line.key],
      })),
      rows: [
        row('Gross pay', gross),
        row('Employee retirement contribution', employee),
        row('PAYE', paye),
        row('UIF', uif),
        row('Other deductions', other),
        row('Net pay', net, true),
        row('Employer retirement contribution (benefit, not cash)', employer),
        row('Medical credit', medicalCredit),
        row('Taxable income', taxableIncome),
      ],
    };
  });

  // Read out politely after each edit; empty while there is no result (the alert covers errors).
  protected readonly announcement = computed(() => {
    const r = this.result();
    return r ? `Net pay ${formatRand(r.net.monthly)} a month, PAYE ${formatRand(r.paye.monthly)} a month.` : '';
  });

  protected readonly chart = computed(() => {
    const curve = this.estimator.curve();
    const result = this.result();
    if (!curve || !result) return null;
    const series: LineSeries = { name: 'Net pay', points: curve.points };
    const reference: LineSeries = { name: 'Gross pay', points: curve.reference };
    const marker: LineMarker = {
      x: result.gross.monthly,
      y: result.net.monthly,
      label: `Your gross pay of ${formatRand(result.gross.monthly)} gives ${formatRand(result.net.monthly)} net.`,
    };
    return { series, reference, marker };
  });

  protected readonly medicalWords = computed(() => {
    const members = this.inputs().medicalMembers;
    if (members === 0) return 'No medical aid';
    return `${members} ${members === 1 ? 'member' : 'members'}`;
  });

  // PDF export: formats this page's own result(), nothing is recomputed.
  protected readonly report = computed<ReportModel | null>(() => {
    const r = this.result();
    return r ? buildPayReport(this.inputs(), r, this.amountLabel(), this.medicalWords()) : null;
  });

  protected readonly taxNote = computed(() => {
    const data = this.taxYears.taxYear();
    if (!data) return null;
    return `Based on tax year ${taxYearLabel(data.taxYear)}, ${STATUS_WORDS[data.status]} data checked ${formatShortDate(data.verifiedOn)}.`;
  });

  protected rand(amount: number): string {
    return formatRand(amount);
  }

  // The send-to row emits before it navigates, so the figures are in the store when the page opens.
  protected sendTo(target: SendTargetId): void {
    this.context.sendFromSalary(target);
  }

  protected set(field: NumberField, value: number): void {
    this.store.update({ [field]: value });
  }
}
