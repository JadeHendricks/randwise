import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { formatShortDate } from '../../core/data/format-date';
import { RatesService } from '../../core/data/rates.service';
import { taxYearLabel } from '../../core/data/tax-calendar';
import { TaxYearStatus } from '../../core/data/tax-year.schema';
import { TaxYearService } from '../../core/data/tax-year.service';
import { roundRand } from '../../core/engine';
import { ReportModel } from '../../core/pdf/report-model';
import { HANDOFF_SOURCE_LABELS, SendTargetId } from '../../core/plan/handoff';
import { PlanContextStore } from '../../core/plan/plan-context.store';
import { RA_LIMITS, RaInputs } from '../../core/ra/ra-inputs';
import { AmountField } from '../../shared/atoms/amount-field/amount-field';
import { BreakdownBar, BreakdownSegment } from '../../shared/atoms/breakdown-bar/breakdown-bar';
import { Button } from '../../shared/atoms/button/button';
import { Card } from '../../shared/atoms/card/card';
import { Chip } from '../../shared/atoms/chip/chip';
import { Icon } from '../../shared/atoms/icon/icon';
import { LineChart, LineSeries } from '../../shared/atoms/line-chart/line-chart';
import { Money } from '../../shared/atoms/money/money';
import { RingGauge } from '../../shared/atoms/ring-gauge/ring-gauge';
import { formatPercent, formatRand, formatRandCompact } from '../../shared/format/format-rand';
import { DownloadPdf } from '../../shared/molecules/download-pdf/download-pdf';
import { HandoffChip } from '../../shared/molecules/handoff-chip/handoff-chip';
import { SendTo } from '../../shared/molecules/send-to/send-to';
import { StatCard } from '../../shared/molecules/stat-card/stat-card';
import { buildRaReport } from './ra-report';

// Field limits. Money steps are 1 so a typed amount is never snapped to a coarser step.
const MONEY_STEP = 1;
const PERCENT_STEP = 0.01;
const GROSS_MAX_MONTHLY = 500_000;
const RETIREMENT_MAX_MONTHLY = 60_000;
const CONTRIBUTION_MAX_MONTHLY = 60_000;
const BALANCE_MAX = 10_000_000;

const STATUS_WORDS: Record<TaxYearStatus, string> = {
  verified: 'verified',
  'verified-auto': 'verified (auto)',
  draft: 'draft',
};

const WHOLE_RAND = new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 0 });

interface YearRow {
  readonly age: number;
  readonly paidIn: string;
  readonly growth: string;
  readonly balance: string;
  readonly real: string;
}

/**
 * The RA calculator page. Every figure comes from the shared PlanContextStore (which runs the
 * pure engine); this component only rounds and formats engine results for display and sends
 * edits back through `updateRa`.
 */
@Component({
  selector: 'rw-ra-page',
  imports: [
    AmountField,
    BreakdownBar,
    Button,
    Card,
    Chip,
    DownloadPdf,
    HandoffChip,
    Icon,
    LineChart,
    Money,
    RingGauge,
    SendTo,
    StatCard,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ra-page.html',
  styleUrl: './ra-page.scss',
})
export class RaPage {
  protected readonly context = inject(PlanContextStore);
  private readonly rates = inject(RatesService);
  private readonly taxYears = inject(TaxYearService);

  protected readonly limits = RA_LIMITS;
  protected readonly step = MONEY_STEP;
  protected readonly percentStep = PERCENT_STEP;
  protected readonly grossMax = GROSS_MAX_MONTHLY;
  protected readonly retirementMax = RETIREMENT_MAX_MONTHLY;
  protected readonly contributionMax = CONTRIBUTION_MAX_MONTHLY;
  protected readonly balanceMax = BALANCE_MAX;
  // Short axis labels keep the chart inside a phone screen; its table keeps exact amounts.
  protected readonly compactRand = formatRandCompact;
  protected readonly ageText = (age: number) => `Age ${Math.round(age)}`;
  protected readonly plain = (value: number) => String(Math.round(value));

  protected readonly inputs = this.context.ra;
  protected readonly assumptions = this.rates.assumptions;

  protected readonly fromLabel = computed(() => {
    const from = this.context.raFrom();
    return from ? HANDOFF_SOURCE_LABELS[from] : null;
  });

  protected readonly intro = computed(() => {
    const { contributionMonthly, grossMonthly } = this.inputs();
    return `This is an example: R${WHOLE_RAND.format(contributionMonthly)} a month on a R${WHOLE_RAND.format(grossMonthly)} salary. Change any value; nothing is saved.`;
  });

  protected readonly growthHint = computed(() => {
    const a = this.assumptions();
    return a ? `${a.growthReturn.description} You can change it.` : '';
  });
  protected readonly inflationHint = computed(() => {
    const a = this.assumptions();
    return a ? `${a.inflation.description} You can change it.` : '';
  });
  protected readonly growthButton = computed(() => this.returnButton('growth'));
  protected readonly cashButton = computed(() => this.returnButton('cash'));

  protected readonly failure = computed(() => {
    const estimate = this.context.raEstimate();
    return estimate && !estimate.ok ? estimate.message : null;
  });

  protected readonly result = computed(() => {
    const estimate = this.context.raEstimate();
    const rules = this.context.raRules();
    if (!estimate?.ok || !rules) return null;
    const inputs = this.inputs();
    const { headroom, taxSaving, ages, projection } = estimate.result;
    const { final, twoPot } = projection;
    const rand = (value: number) => formatRand(roundRand(value));
    const monthly = (value: number) => `${rand(value / 12)} a month`;
    const paidIn = (contributions: number) => roundRand(inputs.startingBalance + contributions);
    const warn = new Set(estimate.warnings);

    const rows = projection.series.map<YearRow>((year) => ({
      age: inputs.age + year.year,
      paidIn: rand(paidIn(year.contributions)),
      growth: rand(year.growth),
      balance: rand(year.nominal),
      real: rand(year.real),
    }));
    const balanceSeries: LineSeries = {
      name: 'Balance',
      points: projection.series.map((year) => ({
        x: inputs.age + year.year,
        y: roundRand(year.nominal),
      })),
    };
    const paidInSeries: LineSeries = {
      name: "Paid in (with today's balance)",
      points: projection.series.map((year) => ({
        x: inputs.age + year.year,
        y: paidIn(year.contributions),
      })),
    };

    const rate = (fraction: number) => formatPercent(fraction);
    const marginal =
      taxSaving.marginalRate === taxSaving.marginalRateAfter
        ? rate(taxSaving.marginalRate)
        : `${rate(taxSaving.marginalRate)} → ${rate(taxSaving.marginalRateAfter)}`;

    // Only worth explaining when the two methods really differ at the cent.
    const approxWhy =
      roundRand(taxSaving.approxDifference) === 0
        ? null
        : taxSaving.crossesBracket
          ? `A quick estimate (${rand(taxSaving.deductible)} × ${rate(taxSaving.marginalRate)}) gives ${rand(taxSaving.approxSaving)} a year. The real saving is ${rand(taxSaving.saving)} because part of the contribution comes off income taxed at a lower rate.`
          : `A quick estimate (${rand(taxSaving.deductible)} × ${rate(taxSaving.marginalRate)}) gives ${rand(taxSaving.approxSaving)} a year. The real saving is ${rand(taxSaving.saving)} because rebates or the medical credit already reduce your tax.`;

    const segments: BreakdownSegment[] = [
      { label: 'Savings pot', value: roundRand(twoPot.savingsPot), tone: 'sky' },
      { label: 'Retirement pot', value: roundRand(twoPot.retirementPot), tone: 'violet' },
      { label: "Vested pot (today's balance)", value: roundRand(twoPot.vestedPot), tone: 'sun' },
    ];

    return {
      retirementAge: ages.retirementAge,
      years: ages.years,
      nominal: roundRand(final.nominal),
      real: roundRand(final.real),
      paidIn: paidIn(final.contributions),
      growth: roundRand(final.growth),
      savings: roundRand(twoPot.savingsPot),
      retirementPot: roundRand(twoPot.retirementPot),
      vested: roundRand(twoPot.vestedPot),
      usedPercent: estimate.usedPercent,
      overCap: warn.has('over-cap'),
      overCapAmount: rand(taxSaving.carriedForward),
      belowEarliest: warn.has('below-earliest-age'),
      earliestAge: rules.earliestRetirementAge,
      pastAge: warn.has('past-retirement-age'),
      limit: roundRand(headroom.limit),
      limitMonthly: monthly(headroom.limit),
      room: roundRand(headroom.headroom),
      roomMonthly: monthly(headroom.headroom),
      left: roundRand(taxSaving.remainingHeadroom),
      leftMonthly: monthly(taxSaving.remainingHeadroom),
      saving: roundRand(taxSaving.saving),
      savingMonthly: `${rand(taxSaving.savingMonthly)} a month`,
      netCostMonthly: roundRand(taxSaving.netCostMonthly),
      marginal,
      approxWhy,
      rows,
      balanceSeries,
      paidInSeries,
      segments,
      twoPotNote: `New contributions go ${formatPercent(rules.savingsShare, 0)} to the savings pot and ${formatPercent(rules.retirementShare, 0)} to the retirement pot. Your balance today is treated as the vested pot and is not split (a simplification). You can take at most ${rules.withdrawalsPerTaxYear} ${rules.withdrawalsPerTaxYear === 1 ? 'withdrawal' : 'withdrawals'} a tax year from the savings pot, of at least ${formatRand(rules.minimumWithdrawal)}; this projection assumes you take none.`,
      sentence: `After ${ages.years} ${ages.years === 1 ? 'year' : 'years'} at ${formatPercent(inputs.returnPercent / 100, 2)} a year with ${formatPercent(inputs.inflationPercent / 100, 2)} inflation.`,
    };
  });

  // Read out politely after each edit; empty while there is no result (the alert covers errors).
  protected readonly announcement = computed(() => {
    const r = this.result();
    return r
      ? `Projected balance ${formatRand(r.nominal)} at ${r.retirementAge}, ${formatRand(r.real)} in today's money.`
      : '';
  });

  // PDF export: formats this page's own result(), nothing is recomputed.
  protected readonly report = computed<ReportModel | null>(() => {
    const r = this.result();
    return r ? buildRaReport(this.inputs(), r) : null;
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
    this.context.sendFromRa(target);
  }

  protected set(field: keyof RaInputs, value: number): void {
    this.context.updateRa({ [field]: value });
  }

  protected useReturn(kind: 'growth' | 'cash'): void {
    const a = this.assumptions();
    if (!a) return;
    this.context.updateRa({
      returnPercent: (kind === 'growth' ? a.growthReturn : a.cashReturn).valuePercent,
    });
  }

  private returnButton(kind: 'growth' | 'cash'): string {
    const a = this.assumptions();
    if (!a) return '';
    const assumption = kind === 'growth' ? a.growthReturn : a.cashReturn;
    return `Use ${kind} return (${formatPercent(assumption.valuePercent / 100, 2)})`;
  }
}
