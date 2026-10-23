import { Injectable, computed, inject, linkedSignal, signal, untracked } from '@angular/core';
import { RatesService } from '../data/rates.service';
import { TaxYearService } from '../data/tax-year.service';
import type { BudgetSettings } from '../budget/budget-inputs';
import {
  type BudgetSlice,
  addLine,
  editCategories,
  editIncome,
  editSettings,
  effectiveBudgetIncome,
  freshBudgetSlice,
  nextBudgetSlice,
  removeLine,
  switchIncomeBasis,
  switchIncomePeriod,
  undoBudget as undoBudgetSlice,
} from '../budget/budget-slice';
import { type BudgetEstimate, estimateBudget } from '../budget/estimate-budget';
import {
  type BudgetCategory,
  type BudgetGroup,
  type BudgetPresetId,
  type BudgetStatus,
  type JourneyRules,
  type PayPeriod,
  type RaRules,
  type RetireRules,
  type TfsaRules,
  applyPreset,
  distributeToGroups,
  renameCategory,
  roundRand,
  setCategoryAmount,
  setCategoryPercent,
  toJourneyRules,
  toRaRules,
  toRetireRules,
  toTfsaRules,
} from '../engine';
import { type JourneyEstimate, estimateJourney } from '../journey/estimate-journey';
import type { JourneyInputs } from '../journey/journey-inputs';
import { journeyPlanDefaults } from '../journey/journey-inputs';
import {
  type BudgetContext,
  type JourneySlice,
  editJourney,
  effectiveJourneyInputs,
  freshJourneySlice,
  nextJourneySlice,
  undoJourney as undoJourneySlice,
} from '../journey/journey-slice';
import { type RaEstimate, estimateRa } from '../ra/estimate-ra';
import type { RaInputs, RaPlanFields } from '../ra/ra-inputs';
import { raPlanDefaults } from '../ra/ra-inputs';
import {
  type RaSlice,
  editRa,
  effectiveRaInputs,
  freshRaSlice,
  nextRaSlice,
  undoRa as undoRaSlice,
} from '../ra/ra-slice';
import { type RetireEstimate, estimateRetire } from '../retire/estimate-retire';
import type { RetireInputs } from '../retire/retire-inputs';
import { retirePlanDefaults } from '../retire/retire-inputs';
import {
  type RetireSlice,
  editRetire,
  effectiveRetireInputs,
  freshRetireSlice,
  nextRetireSlice,
  undoRetire as undoRetireSlice,
} from '../retire/retire-slice';
import { SalaryEstimator } from '../salary/salary-estimator';
import type { AmountBasis, SalaryInputs } from '../salary/salary-inputs';
import { SalaryInputsStore } from '../salary/salary-inputs.store';
import type {
  Handoff,
  HandoffSource,
  HandoffTarget,
  HandoffValuesByTarget,
  SendTargetId,
} from './handoff';
import {
  type PlanProfile,
  type RaHandoffValues,
  profileFromSalary,
  raHandoffFrom,
} from './plan-profile';

/** The six RA plan values that RA, Retire at 55 and Journey all share, for a handoff. */
function raPlanKeys(inputs: RaPlanFields): RaPlanFields {
  return {
    contributionMonthly: inputs.contributionMonthly,
    escalationPercent: inputs.escalationPercent,
    startingBalance: inputs.startingBalance,
    returnPercent: inputs.returnPercent,
    inflationPercent: inputs.inflationPercent,
    retirementAge: inputs.retirementAge,
  };
}

/** Just the Salary side of a calculator's inputs, for a handoff. */
function salaryFields(inputs: RaHandoffValues): RaHandoffValues {
  return {
    grossMonthly: inputs.grossMonthly,
    age: inputs.age,
    medicalMembers: inputs.medicalMembers,
    employeeRetirementMonthly: inputs.employeeRetirementMonthly,
    employerRetirementMonthly: inputs.employerRetirementMonthly,
  };
}

/** What other calculators (the dashboard now, Journey later) read from the RA. Full precision. */
export interface RaOutputs {
  readonly headroomAnnual: number;
  readonly headroomMonthly: number;
  readonly taxSavingAnnual: number;
}

/** One key per calculator that publishes figures; null when it has nothing to show. */
export interface PlanOutputs {
  readonly ra: RaOutputs | null;
}

/**
 * What the dashboard (and later Journey) reads from Retire at 55. Full precision; round at the
 * edge. It is a separate computed, not a key of `PlanOutputs`, so the RA outputs shape stays put.
 */
export interface RetireOutputs {
  /** The contribution a month that reaches the goal, in the first year. */
  readonly requiredMonthly: number;
  /** Projected capital at the current contribution as a percent of the capital needed. */
  readonly fundedPercent: number;
  /** `fundedPercent` clamped to 0..100, for a ring. */
  readonly ringPercent: number;
  readonly retirementAge: number;
  /** The income goal, rands a month in today's money. */
  readonly goalNetMonthly: number;
}

/**
 * What the dashboard reads from the Budget. Full precision; round at the edge.
 * Separate from `PlanOutputs` for the same reason as `RetireOutputs`.
 */
export interface BudgetOutputs {
  /** Take-home pay a month: the base of the budget. */
  readonly netMonthly: number;
  /** max(0, net - total): what is still free to give a job. */
  readonly unallocated: number;
  /** max(0, total - net): how far the lines go past take-home. */
  readonly overAllocated: number;
  readonly status: BudgetStatus;
  /** Each group as a percent of take-home (0 to 100). */
  readonly groupPercents: Readonly<Record<BudgetGroup, number>>;
}
/** What the dashboard reads from the Journey. Full precision; round at the edge. */
export interface JourneyOutputs {
  /** Income tax saved by the RA contributions over the whole journey. */
  readonly taxSaved: number;
  readonly tfsaAtRetirement: number;
  readonly retirementAge: number;
}

type Handoffs = { readonly [T in HandoffTarget]?: Handoff<T> };

/**
 * The one place calculators share figures. It reads the Salary situation, carries "Send to"
 * handoffs, and holds each calculator's slice (RA, Retire at 55 and Budget). The slice logic lives
 * in pure files under `core/ra`, `core/retire` and `core/budget`, so this store is only wiring. In
 * memory only: nothing is persisted.
 */
@Injectable({ providedIn: 'root' })
export class PlanContextStore {
  private readonly salary = inject(SalaryInputsStore);
  private readonly estimator = inject(SalaryEstimator);
  private readonly taxYears = inject(TaxYearService);
  private readonly assumptions = inject(RatesService).assumptions();
  // Read once: the bundled rates never change while the app runs.
  private readonly raPlanDefaults = raPlanDefaults(this.assumptions);
  private readonly retirePlanDefaults = retirePlanDefaults(this.assumptions);
  private readonly journeyPlanDefaults = journeyPlanDefaults(this.assumptions);

  private readonly handoffs = signal<Handoffs>({});
  private nextId = 1;

  /** The shared figures, read live from the Salary inputs and estimate. */
  readonly profile = computed<PlanProfile>(() =>
    profileFromSalary(this.salary.inputs(), this.estimator.estimate()),
  );

  readonly raHandoff = computed<Handoff<'ra'> | null>(() => this.handoffs().ra ?? null);

  // A new handoff (a new object) resets local salary edits to the sent values; see `nextRaSlice`.
  private readonly raSlice = linkedSignal<Handoff<'ra'> | null, RaSlice>({
    source: this.raHandoff,
    computation: (handoff, previous) => nextRaSlice(handoff, previous, this.raPlanDefaults),
  });

  /** The inputs the RA calculator works from: the Salary profile live until overridden. */
  readonly ra = computed<RaInputs>(() =>
    effectiveRaInputs(this.raSlice(), raHandoffFrom(this.profile())),
  );
  /** Who sent the figures in use, for the "From ..." chip. */
  readonly raFrom = computed<HandoffSource | null>(() => this.raSlice().from);
  readonly raCanUndo = computed(() => this.raSlice().undo !== null);
  /** True while the RA figures are the untouched example. */
  readonly raIsExample = computed(() => {
    const slice = this.raSlice();
    return !slice.planEdited && slice.profile === null && slice.from === null;
  });

  /** Two-pot split and earliest payout age from the selected tax year; null without tax data. */
  readonly raRules = computed<RaRules | null>(() => {
    const data = this.taxYears.taxYear();
    return data ? toRaRules(data) : null;
  });

  /** Null only when there is no tax data; a figure the engine rejects comes back as `ok: false`. */
  readonly raEstimate = computed<RaEstimate | null>(() => {
    const tables = this.estimator.tables();
    const rules = this.raRules();
    return tables && rules ? estimateRa(this.ra(), tables, rules) : null;
  });

  /** Figures other calculators and the dashboard can show. Full precision; round at the edge. */
  readonly outputs = computed<PlanOutputs>(() => {
    const estimate = this.raEstimate();
    if (!estimate?.ok) return { ra: null };
    const { headroom, taxSaving } = estimate.result;
    return {
      ra: {
        headroomAnnual: headroom.headroom,
        headroomMonthly: headroom.headroomMonthly,
        taxSavingAnnual: taxSaving.saving,
      },
    };
  });

  readonly retireHandoff = computed<Handoff<'retire'> | null>(
    () => this.handoffs().retire ?? null,
  );

  // Same shape as `raSlice`: a new Retire handoff resets local salary edits to the sent values.
  private readonly retireSlice = linkedSignal<Handoff<'retire'> | null, RetireSlice>({
    source: this.retireHandoff,
    computation: (handoff, previous) =>
      nextRetireSlice(handoff, previous, this.retirePlanDefaults),
  });

  /** The inputs the Retire at 55 page works from: the Salary profile live until overridden. */
  readonly retire = computed<RetireInputs>(() =>
    effectiveRetireInputs(this.retireSlice(), raHandoffFrom(this.profile())),
  );
  /** Who sent the figures in use, for the "From ..." chip. */
  readonly retireFrom = computed<HandoffSource | null>(() => this.retireSlice().from);
  readonly retireCanUndo = computed(() => this.retireSlice().undo !== null);
  /** True while the Retire at 55 figures are the untouched example. */
  readonly retireIsExample = computed(() => {
    const slice = this.retireSlice();
    return !slice.planEdited && slice.profile === null && slice.from === null;
  });

  /** Two-pot shares, drawdown limits, de minimis, lump-sum table and earliest age; null without tax data. */
  readonly retireRules = computed<RetireRules | null>(() => {
    const data = this.taxYears.taxYear();
    return data ? toRetireRules(data) : null;
  });

  /** Null only when there is no tax data; a figure the engine rejects comes back as `ok: false`. */
  readonly retireEstimate = computed<RetireEstimate | null>(() => {
    const tables = this.estimator.tables();
    const rules = this.retireRules();
    return tables && rules ? estimateRetire(this.retire(), tables, rules) : null;
  });

  /** Figures the dashboard can show; null when there is no tax data or the figures fail. */
  readonly retireOutputs = computed<RetireOutputs | null>(() => {
    const estimate = this.retireEstimate();
    if (!estimate?.ok) return null;
    const { result } = estimate;
    return {
      requiredMonthly: result.requiredContribution.monthly,
      fundedPercent: result.current.fundedPercent,
      ringPercent: result.current.ringPercent,
      retirementAge: result.retirementAge,
      goalNetMonthly: result.goal.todayMonthly,
    };
  });

  readonly budgetHandoff = computed<Handoff<'budget'> | null>(() => this.handoffs().budget ?? null);

  // Same shape as `raSlice`: a new Budget handoff resets the local income to the sent values.
  private readonly budgetSlice = linkedSignal<Handoff<'budget'> | null, BudgetSlice>({
    source: this.budgetHandoff,
    // Why untracked: the live Salary inputs are only read to keep the other deductions on a send
    // that has none. A Salary edit must not reset the slice.
    computation: (handoff, previous) =>
      nextBudgetSlice(handoff, previous, untracked(() => this.salary.inputs())),
  });

  /** The income the Budget page works from: the Salary inputs live until overridden. */
  readonly budgetIncome = computed<SalaryInputs>(() =>
    effectiveBudgetIncome(this.budgetSlice(), this.salary.inputs()),
  );
  /** Who sent the figures in use, for the "From ..." chip. */
  readonly budgetFrom = computed<HandoffSource | null>(() => this.budgetSlice().from);
  readonly budgetCanUndo = computed(() => this.budgetSlice().undo !== null);
  /** True while the Budget is the untouched example: Salary income, 50/30/20 lines, nothing sent. */
  readonly budgetIsExample = computed(() => {
    const slice = this.budgetSlice();
    return (
      !slice.edited && slice.income === null && slice.categories === null && slice.from === null
    );
  });
  /** The preset the lines were last set to, or 'custom' once they are not a preset. */
  readonly budgetPresetId = computed<BudgetPresetId | 'custom'>(() => this.budgetSlice().presetId);
  readonly budgetSettings = computed<BudgetSettings>(() => this.budgetSlice().settings);

  /** TFSA limits and penalty rate from the selected tax year; null without tax data. */
  readonly tfsaRules = computed<TfsaRules | null>(() => {
    const data = this.taxYears.taxYear();
    return data ? toTfsaRules(data) : null;
  });

  /** Null only when there is no tax data; a figure the engine rejects comes back as `ok: false`. */
  readonly budgetEstimate = computed<BudgetEstimate | null>(() => {
    const tables = this.estimator.tables();
    const rules = this.tfsaRules();
    if (!tables || !rules) return null;
    const { categories, sentLines, settings } = this.budgetSlice();
    return estimateBudget(
      { income: this.budgetIncome(), categories, sentLines, settings },
      tables,
      rules,
    );
  });

  /** Figures the dashboard can show; null when there is no tax data or the figures fail. */
  readonly budgetOutputs = computed<BudgetOutputs | null>(() => {
    const estimate = this.budgetEstimate();
    if (!estimate?.ok) return null;
    const { summary } = estimate;
    const percentOf = (group: BudgetGroup) =>
      summary.groups.find((entry) => entry.group === group)?.percent ?? 0;
    return {
      netMonthly: estimate.net,
      unallocated: summary.underAllocated,
      overAllocated: summary.overAllocated,
      status: summary.status,
      groupPercents: {
        needs: percentOf('needs'),
        wants: percentOf('wants'),
        savings: percentOf('savings'),
      },
    };
  });
  readonly journeyHandoff = computed<Handoff<'journey'> | null>(
    () => this.handoffs().journey ?? null,
  );

  // Same shape as `raSlice`: a new Journey handoff resets local salary edits to the sent values.
  private readonly journeySlice = linkedSignal<Handoff<'journey'> | null, JourneySlice>({
    source: this.journeyHandoff,
    computation: (handoff, previous) =>
      nextJourneySlice(handoff, previous, this.journeyPlanDefaults),
  });

  /** The inputs the Journey page works from: the Salary profile live until overridden. */
  readonly journey = computed<JourneyInputs>(() =>
    effectiveJourneyInputs(this.journeySlice(), raHandoffFrom(this.profile())),
  );
  /** Who sent the figures in use, for the "From ..." chip. */
  readonly journeyFrom = computed<HandoffSource | null>(() => this.journeySlice().from);
  readonly journeyCanUndo = computed(() => this.journeySlice().undo !== null);
  /** True while the Journey figures are the untouched example. */
  readonly journeyIsExample = computed(() => {
    const slice = this.journeySlice();
    return !slice.planEdited && slice.profile === null && slice.from === null;
  });
  /** What the last Budget send said about its budget; null when the figures came from elsewhere. */
  readonly journeyBudgetContext = computed<BudgetContext | null>(
    () => this.journeySlice().budgetContext,
  );

  /** RA and TFSA rules from the selected tax year; null without tax data. */
  readonly journeyRules = computed<JourneyRules | null>(() => {
    const data = this.taxYears.taxYear();
    return data ? toJourneyRules(data) : null;
  });

  /** Null only when there is no tax data; a figure the engine rejects comes back as `ok: false`. */
  readonly journeyEstimate = computed<JourneyEstimate | null>(() => {
    const tables = this.estimator.tables();
    const rules = this.journeyRules();
    return tables && rules ? estimateJourney(this.journey(), tables, rules) : null;
  });

  /** Figures the dashboard can show; null when there is no tax data or the figures fail. */
  readonly journeyOutputs = computed<JourneyOutputs | null>(() => {
    const estimate = this.journeyEstimate();
    if (!estimate?.ok) return null;
    const { result } = estimate;
    return {
      taxSaved: result.totals.taxSaved,
      tfsaAtRetirement: result.final.tfsaBalance,
      retirementAge: result.ages.retirementAge,
    };
  });

  /** Sends figures to a calculator. Each call is a new handoff, even with identical values. */
  send<T extends HandoffTarget>(
    target: T,
    source: HandoffSource,
    values: HandoffValuesByTarget[T],
  ): void {
    const handoff: Handoff<T> = { id: this.nextId++, source, target, values };
    this.handoffs.update((all) => ({ ...all, [target]: handoff }));
  }

  /**
   * Sends the current Salary figures to RA, Retire at 55, Budget or Journey. Returns false, and
   * changes nothing, for any other id.
   */
  sendFromSalary(target: SendTargetId): boolean {
    const salary = raHandoffFrom(this.profile());
    switch (target) {
      case 'ra':
      case 'retire':
      case 'journey':
        this.send(target, 'salary', salary);
        return true;
      case 'budget':
        // The Budget also needs the other deductions, which take-home pay is net of.
        this.send('budget', 'salary', {
          ...salary,
          otherDeductionsMonthly: this.profile().otherDeductionsMonthly,
        });
        return true;
      default:
        return false;
    }
  }

  /**
   * Sends the RA figures (the salary side and the contribution plan) to Retire at 55 or Journey,
   * or the contribution as the Budget's RA line. Returns false, and changes nothing, for any
   * other id.
   */
  sendFromRa(target: SendTargetId): boolean {
    const ra = this.ra();
    switch (target) {
      case 'retire':
        this.send('retire', 'ra', { ...salaryFields(ra), ...raPlanKeys(ra) });
        return true;
      case 'journey':
        this.send('journey', 'ra', { ...salaryFields(ra), ...raPlanKeys(ra) });
        return true;
      case 'budget':
        this.send('budget', 'ra', {
          ...salaryFields(ra),
          raMonthly: ra.contributionMonthly,
        });
        return true;
      default:
        return false;
    }
  }

  /**
   * Sends the Retire at 55 figures to the RA calculator, Budget or Journey, with the contribution
   * a month that the plan needs (rounded to the cent), or the current one when there is no
   * result. Returns false, and changes nothing, for any other id.
   */
  sendFromRetire(target: SendTargetId): boolean {
    if (target !== 'ra' && target !== 'budget' && target !== 'journey') return false;
    const retire = this.retire();
    const required = this.retireOutputs()?.requiredMonthly;
    const contributionMonthly =
      required === undefined ? retire.contributionMonthly : roundRand(required);
    const plan = { ...raPlanKeys(retire), contributionMonthly };
    if (target === 'ra') this.send('ra', 'retire', { ...salaryFields(retire), ...plan });
    else if (target === 'journey')
      this.send('journey', 'retire', { ...salaryFields(retire), ...plan });
    else this.send('budget', 'retire', { ...salaryFields(retire), raMonthly: contributionMonthly });
    return true;
  }

  /**
   * Sends the Budget figures to RA, Retire at 55 or Journey. The salary side is the Budget's own
   * income; the RA line (and, for the Journey, the TFSA line, the TFSA contributions made so far
   * and a note about the budget) travel with it. Returns false, and changes nothing, for any
   * other id.
   */
  sendFromBudget(target: SendTargetId): boolean {
    if (target !== 'ra' && target !== 'retire' && target !== 'journey') return false;
    const estimate = this.budgetEstimate();
    const good = estimate?.ok ? estimate : null;
    const salary = raHandoffFrom(profileFromSalary(this.budgetIncome(), good ? good.salary : null));
    // Without a good estimate there are no lines to send, only the income.
    const raLine = good ? { contributionMonthly: roundRand(good.limits.ra.monthly) } : {};
    if (target === 'ra') this.send('ra', 'budget', { ...salary, ...raLine });
    else if (target === 'retire') this.send('retire', 'budget', { ...salary, ...raLine });
    else {
      this.send('journey', 'budget', {
        ...salary,
        ...raLine,
        ...(good
          ? {
              tfsaTopUpMonthly: roundRand(good.limits.tfsa.monthly),
              budgetEmergencyMonthly: roundRand(good.limits.emergency.monthly),
            }
          : {}),
        tfsaLifetimeUsed: this.budgetSettings().tfsaLifetimeUsed,
        budgetNetMonthly: good ? roundRand(good.net) : null,
      });
    }
    return true;
  }

  /**
   * Sends the Journey figures to RA or Retire at 55 (the salary side and the RA plan), or to the
   * Budget (the RA contribution, the TFSA top-up and the TFSA contributions made so far). Returns
   * false, and changes nothing, for any other id.
   */
  sendFromJourney(target: SendTargetId): boolean {
    const journey = this.journey();
    switch (target) {
      case 'ra':
        this.send('ra', 'journey', { ...salaryFields(journey), ...raPlanKeys(journey) });
        return true;
      case 'retire':
        this.send('retire', 'journey', { ...salaryFields(journey), ...raPlanKeys(journey) });
        return true;
      case 'budget':
        this.send('budget', 'journey', {
          ...salaryFields(journey),
          raMonthly: journey.contributionMonthly,
          tfsaMonthly: journey.tfsaTopUpMonthly,
          tfsaLifetimeUsed: journey.tfsaLifetimeUsed,
        });
        return true;
      default:
        return false;
    }
  }

  dismiss(target: HandoffTarget): void {
    this.handoffs.update((all) => ({ ...all, [target]: undefined }));
  }

  updateRa(patch: Partial<RaInputs>): void {
    this.raSlice.update((slice) => editRa(slice, patch, raHandoffFrom(this.profile())));
  }

  undoRa(): void {
    const slice = this.raSlice();
    if (!slice.undo) return;
    const restored = undoRaSlice(slice);
    // Why this order: dismissing changes the linkedSignal source, which queues a recomputation
    // that would keep the sent values. Setting AFTER the dismissal makes the restored state win,
    // because a linkedSignal `set` first brings the signal up to date and then overwrites it.
    this.dismiss('ra');
    this.raSlice.set(restored);
  }

  resetRa(): void {
    this.dismiss('ra');
    this.raSlice.set(freshRaSlice(this.raPlanDefaults));
  }

  updateRetire(patch: Partial<RetireInputs>): void {
    this.retireSlice.update((slice) => editRetire(slice, patch, raHandoffFrom(this.profile())));
  }

  undoRetire(): void {
    const slice = this.retireSlice();
    if (!slice.undo) return;
    const restored = undoRetireSlice(slice);
    // Why this order: dismissing changes the linkedSignal source, which queues a recomputation
    // that would keep the sent values. Setting AFTER the dismissal makes the restored state win,
    // because a linkedSignal `set` first brings the signal up to date and then overwrites it.
    this.dismiss('retire');
    this.retireSlice.set(restored);
  }

  resetRetire(): void {
    this.dismiss('retire');
    this.retireSlice.set(freshRetireSlice(this.retirePlanDefaults));
  }

  updateJourney(patch: Partial<JourneyInputs>): void {
    this.journeySlice.update((slice) => editJourney(slice, patch, raHandoffFrom(this.profile())));
  }

  undoJourney(): void {
    const slice = this.journeySlice();
    if (!slice.undo) return;
    const restored = undoJourneySlice(slice);
    // Why this order: dismissing changes the linkedSignal source, which queues a recomputation
    // that would keep the sent values. Setting AFTER the dismissal makes the restored state win,
    // because a linkedSignal `set` first brings the signal up to date and then overwrites it.
    this.dismiss('journey');
    this.journeySlice.set(restored);
  }

  resetJourney(): void {
    this.dismiss('journey');
    this.journeySlice.set(freshJourneySlice(this.journeyPlanDefaults));
  }

  /** The lines in use and the take-home they are measured against; null while there is no good estimate. */
  private currentBudget(): {
    readonly categories: readonly BudgetCategory[];
    readonly net: number;
  } | null {
    const estimate = this.budgetEstimate();
    return estimate?.ok ? { categories: estimate.categories, net: estimate.net } : null;
  }

  updateBudgetIncome(patch: Partial<SalaryInputs>): void {
    this.budgetSlice.update((slice) => editIncome(slice, patch, this.salary.inputs()));
  }

  /** Switches between gross and take-home, keeping the same person (see `switchIncomeBasis`). */
  switchBudgetBasis(basis: AmountBasis): void {
    const estimate = this.budgetEstimate();
    this.updateBudgetIncome(
      switchIncomeBasis(this.budgetIncome(), estimate?.ok ? estimate.salary : null, basis),
    );
  }

  setBudgetPeriod(period: PayPeriod): void {
    this.updateBudgetIncome(switchIncomePeriod(this.budgetIncome(), period));
  }

  setBudgetAmount(id: string, amount: number): void {
    const current = this.currentBudget();
    if (!current) return;
    this.budgetSlice.update((slice) =>
      editCategories(slice, setCategoryAmount(current.categories, id, amount), 'custom'),
    );
  }

  setBudgetPercent(id: string, percent: number): void {
    const current = this.currentBudget();
    if (!current) return;
    this.budgetSlice.update((slice) =>
      editCategories(
        slice,
        setCategoryPercent(current.categories, id, percent, current.net),
        'custom',
      ),
    );
  }

  /** Spreads a preset over the lines, keeping the proportions inside each group. */
  applyBudgetPreset(preset: BudgetPresetId): void {
    const current = this.currentBudget();
    if (!current) return;
    this.budgetSlice.update((slice) =>
      editCategories(
        slice,
        distributeToGroups(current.categories, applyPreset(current.net, preset)),
        preset,
      ),
    );
  }

  addBudgetLine(group: BudgetGroup): void {
    const current = this.currentBudget();
    if (!current) return;
    this.budgetSlice.update((slice) => addLine(slice, current.categories, group));
  }

  renameBudgetLine(id: string, name: string): void {
    const current = this.currentBudget();
    if (!current) return;
    this.budgetSlice.update((slice) =>
      editCategories(slice, renameCategory(current.categories, id, name), slice.presetId),
    );
  }

  removeBudgetLine(id: string): void {
    const current = this.currentBudget();
    if (!current) return;
    this.budgetSlice.update((slice) => removeLine(slice, current.categories, id));
  }

  updateBudgetSettings(patch: Partial<BudgetSettings>): void {
    this.budgetSlice.update((slice) => editSettings(slice, patch));
  }

  undoBudget(): void {
    const slice = this.budgetSlice();
    if (!slice.undo) return;
    const restored = undoBudgetSlice(slice);
    // Why this order: dismissing changes the linkedSignal source, which queues a recomputation
    // that would keep the sent values. Setting AFTER the dismissal makes the restored state win,
    // because a linkedSignal `set` first brings the signal up to date and then overwrites it.
    this.dismiss('budget');
    this.budgetSlice.set(restored);
  }

  resetBudget(): void {
    this.dismiss('budget');
    this.budgetSlice.set(freshBudgetSlice());
  }
}
