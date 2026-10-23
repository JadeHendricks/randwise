import {
  MONTHS_PER_YEAR,
  type JourneyRules,
  MAX_RA_RETIREMENT_AGE,
  type RaRules,
  type RetireRules,
  type TaxTables,
  applyPreset,
  raHeadroom,
  roundRand,
  toJourneyRules,
  toRaRules,
  toRetireRules,
} from '../engine';
import type { Assumptions } from '../data/assumptions';
import type { TaxYearData } from '../data/tax-year.schema';
import {
  type JourneyPlanFields,
  journeyPlanDefaults,
  sanitiseJourneyPlan,
} from '../journey/journey-inputs';
import { type RaPlanFields, raPlanDefaults, sanitiseRaPlan } from '../ra/ra-inputs';
import {
  type RetirePlanFields,
  retirePlanDefaults,
  sanitiseRetirePlan,
} from '../retire/retire-inputs';
import { estimateSalary } from '../salary/estimate-salary';
import type { SalaryInputs } from '../salary/salary-inputs';
import { formatPercent } from '../../shared/format/format-rand';
import {
  type PlanAnswers,
  RISK_LEVELS,
  retirementReturnPercent,
  riskReturnPercent,
} from './plan-answers';
import type {
  BudgetHandoffPayload,
  JourneyHandoffPayload,
  RaHandoffPayload,
  RetireHandoffPayload,
} from './handoff';
import type { RaHandoffValues } from './plan-profile';
import {
  attempt,
  budgetFitStep,
  emergencyFundStep,
  homeBudgetStep,
  makeRoomStep,
  raDeductionStep,
  retireEstimate,
  retireTargetStep,
  takeHomeStep,
  tfsaBuildStep,
  tfsaRefundStep,
} from './plan-steps';

/**
 * Turns the wizard answers into an ordered list of steps. Pure TypeScript (lint enforced).
 * Every figure comes from the estimators and engine functions the calculator pages use; this
 * file only chooses what to ask them and in which order.
 */

/** The RA, retirement and TFSA rules; they live in the tax-year file, not in `TaxTables`. */
export interface PlanRules {
  readonly ra: RaRules;
  readonly retire: RetireRules;
  readonly journey: JourneyRules;
}

export function planRules(file: TaxYearData): PlanRules {
  return { ra: toRaRules(file), retire: toRetireRules(file), journey: toJourneyRules(file) };
}

export type PlanCalculator = 'pay' | 'ra' | 'retire' | 'budget' | 'journey';
export type PlanStepId =
  | 'take-home'
  | 'make-room'
  | 'retire-target'
  | 'ra-deduction'
  | 'tfsa-refund'
  | 'tfsa-build'
  | 'emergency-fund'
  | 'budget-fit'
  | 'home-budget';
export type PlanUnit = 'rand' | 'rand-month' | 'rand-year' | 'percent' | 'age' | 'years' | 'months';

/** A labelled number. `value` has full precision; a percent runs 0 to 100. */
export interface PlanFigure {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  readonly unit: PlanUnit;
}

/** What "Open in ..." sends: the Pay page takes Salary inputs, the others take a handoff payload. */
export type PlanOpen =
  | {
      readonly calculator: 'pay';
      readonly salary: Pick<SalaryInputs, 'basis' | 'period' | 'amount' | 'age'>;
    }
  | { readonly calculator: 'ra'; readonly values: RaHandoffPayload }
  | { readonly calculator: 'retire'; readonly values: RetireHandoffPayload }
  | { readonly calculator: 'budget'; readonly values: BudgetHandoffPayload }
  | { readonly calculator: 'journey'; readonly values: JourneyHandoffPayload };

export interface PlanStep {
  readonly id: PlanStepId;
  /** Always equals `open.calculator`. */
  readonly calculator: PlanCalculator;
  /** The action, with whole-rand numbers. */
  readonly title: string;
  /** One line on why. */
  readonly why: string;
  /** The headline number. */
  readonly key: PlanFigure;
  /** Supporting numbers, in display order. */
  readonly details: readonly PlanFigure[];
  /** Plain caveats. */
  readonly notes: readonly string[];
  readonly open: PlanOpen;
}

export interface PlanBasics {
  /** The Salary figures every handoff carries: the rounded gross, no medical aid, no payroll retirement. */
  readonly salary: RaHandoffValues;
  readonly grossMonthly: number;
  readonly grossAnnual: number;
  readonly netMonthly: number;
  readonly netAnnual: number;
  readonly payeMonthly: number;
  readonly uifMonthly: number;
  /** 20% of take-home (the savings share of a 50/30/20 budget), floored to whole rands. */
  readonly suggestedSurplus: number;
}

function incomeInputs(answers: PlanAnswers): SalaryInputs {
  return {
    basis: answers.income.basis,
    period: answers.income.period,
    amount: answers.income.amount,
    age: answers.age,
    medicalMembers: 0,
    employeeRetirementMonthly: 0,
    employerRetirementMonthly: 0,
    otherDeductionsMonthly: 0,
  };
}

/**
 * The person behind the answers. Why two estimates: the first turns a take-home or yearly entry
 * into a gross monthly salary, which is rounded the way the Salary handoff rounds it; the second
 * re-estimates from that rounded gross so every page works from the same take-home. Null when the
 * income cannot be worked out.
 */
export function planBasics(answers: PlanAnswers, tables: TaxTables): PlanBasics | null {
  const first = estimateSalary(incomeInputs(answers), tables);
  if (!first.ok) return null;
  const grossMonthly = roundRand(first.payslip.monthly.gross);
  const income: SalaryInputs = {
    ...incomeInputs(answers),
    basis: 'gross',
    period: 'monthly',
    amount: grossMonthly,
  };
  const second = estimateSalary(income, tables);
  if (!second.ok) return null;

  const { monthly, annual } = second.payslip;
  return {
    salary: {
      grossMonthly,
      age: answers.age,
      medicalMembers: 0,
      employeeRetirementMonthly: 0,
      employerRetirementMonthly: 0,
    },
    grossMonthly,
    grossAnnual: roundRand(annual.gross),
    netMonthly: roundRand(monthly.netPay),
    netAnnual: roundRand(annual.netPay),
    payeMonthly: roundRand(monthly.paye),
    uifMonthly: roundRand(monthly.uif),
    suggestedSurplus: Math.floor(roundRand(applyPreset(monthly.netPay, '50-30-20').savings)),
  };
}

/** Planning horizon: the retirement age for the retire goal, otherwise a labelled product choice. */
export function planHorizonAge(answers: PlanAnswers): number {
  if (answers.goal === 'retire-early') return answers.retireAge;
  const base = answers.goal === 'build-tfsa' ? 65 : 55;
  return answers.age >= base ? Math.min(MAX_RA_RETIREMENT_AGE, answers.age + 10) : base;
}

/** Everything the step factories share, built once per `buildPlan` call. */
export interface PlanContext {
  readonly answers: PlanAnswers;
  readonly basics: PlanBasics;
  readonly tables: TaxTables;
  readonly rules: PlanRules;
  /** Rands a month that can be invested, in whole rands. */
  readonly spare: number;
  readonly cpi: number;
  readonly growth: number;
  readonly retirementReturn: number;
  readonly horizon: number;
  /** The most a month that fits under the yearly TFSA limit, in whole rands. */
  readonly tfsaMonthlyCap: number;
  /** The income the Budget works from, exactly as a Budget handoff would set it. */
  readonly income: SalaryInputs;
  raFields(contributionMonthly: number): RaPlanFields;
  retireFields(contributionMonthly: number): RetirePlanFields;
  journeyFields(contributionMonthly: number, tfsaTopUpMonthly: number): JourneyPlanFields;
}

function createContext(
  answers: PlanAnswers,
  basics: PlanBasics,
  tables: TaxTables,
  rules: PlanRules,
  assumptions: Assumptions | null,
): PlanContext {
  const cpi = assumptions ? assumptions.inflation.valuePercent : 0;
  const growth = riskReturnPercent(answers.risk, assumptions);
  const retirementReturn = retirementReturnPercent(answers.risk, assumptions);
  const horizon = planHorizonAge(answers);
  return {
    answers,
    basics,
    tables,
    rules,
    spare: Math.floor(roundRand(answers.surplusMonthly ?? basics.suggestedSurplus)),
    cpi,
    growth,
    retirementReturn,
    horizon,
    tfsaMonthlyCap: Math.floor(rules.journey.annualLimit / MONTHS_PER_YEAR),
    income: {
      basis: 'gross',
      period: 'monthly',
      amount: basics.grossMonthly,
      age: answers.age,
      medicalMembers: 0,
      employeeRetirementMonthly: 0,
      employerRetirementMonthly: 0,
      otherDeductionsMonthly: 0,
    },
    // Why the sanitisers: they make the payload complete and identical to what the calculator's
    // own slice would hold after the send.
    raFields: (contributionMonthly) =>
      sanitiseRaPlan(
        {
          contributionMonthly,
          startingBalance: answers.raBalance,
          returnPercent: growth,
          inflationPercent: cpi,
          retirementAge: horizon,
        },
        raPlanDefaults(assumptions),
      ),
    retireFields: (contributionMonthly) =>
      sanitiseRetirePlan(
        {
          goalNetMonthly: answers.retireIncomeMonthly,
          retirementAge: answers.retireAge,
          inflationPercent: cpi,
          returnPercent: growth,
          retirementReturnPercent: retirementReturn,
          startingBalance: answers.raBalance,
          contributionMonthly,
        },
        retirePlanDefaults(assumptions),
      ),
    journeyFields: (contributionMonthly, tfsaTopUpMonthly) =>
      sanitiseJourneyPlan(
        {
          retirementAge: horizon,
          incomeEscalationPercent: cpi,
          inflationPercent: cpi,
          returnPercent: growth,
          tfsaReturnPercent: growth,
          startingBalance: answers.raBalance,
          tfsaBalance: answers.tfsaBalance,
          // Why: growth cannot be separated from contributions, so the balance is treated as
          // contributions already made (the cautious reading).
          tfsaLifetimeUsed: answers.tfsaBalance,
          refundMode: 'refund',
          allowOverContribution: false,
          contributionMonthly,
          tfsaTopUpMonthly,
        },
        journeyPlanDefaults(assumptions),
      ),
  };
}

/**
 * The plan for `answers`, in the order to do things. A step whose estimate fails is left out; an
 * empty list means there is no goal or the income cannot be worked out. Never throws for figures
 * a person could type.
 */
export function buildPlan(
  answers: PlanAnswers,
  tables: TaxTables,
  rules: PlanRules,
  assumptions: Assumptions | null,
): PlanStep[] {
  if (answers.goal === null) return [];
  const basics = planBasics(answers, tables);
  if (!basics) return [];
  const ctx = createContext(answers, basics, tables, rules, assumptions);

  const steps: PlanStep[] = [takeHomeStep(ctx)];
  const add = (...next: (PlanStep | null)[]) => {
    for (const step of next) if (step) steps.push(step);
  };
  const makeRoom = ctx.spare === 0 ? makeRoomStep(ctx) : null;

  switch (answers.goal) {
    case 'retire-early': {
      add(makeRoom);
      const needed = retireEstimate(ctx, 0);
      if (!needed) break;
      // Why the ceiling: the plan should ask for enough, then the room caps it.
      const required = Math.ceil(roundRand(needed.result.requiredContribution.monthly));
      const raMonthly = Math.min(ctx.spare, required);
      const tfsaMonthly = Math.min(ctx.spare - raMonthly, ctx.tfsaMonthlyCap);
      add(retireTargetStep(ctx, needed, raMonthly));
      if (raMonthly > 0) {
        add(
          raDeductionStep(ctx, { goal: 'retire-early', contribution: raMonthly }),
          tfsaRefundStep(ctx, { raMonthly, tfsaMonthly }),
        );
      }
      if (raMonthly + tfsaMonthly > 0) add(budgetFitStep(ctx, { raMonthly, tfsaMonthly }));
      break;
    }
    case 'pay-less-tax': {
      add(makeRoom);
      const headroom = attempt(() => raHeadroom(basics.salary, tables));
      if (!headroom) break;
      const target = Math.floor(roundRand(headroom.headroomMonthly));
      // Why the full target with no spare money: the step shows what a full deduction is worth,
      // and "free up money" comes first.
      const raMonthly = ctx.spare > 0 ? Math.min(ctx.spare, target) : target;
      const tfsaMonthly = ctx.spare > 0 ? Math.min(ctx.spare - raMonthly, ctx.tfsaMonthlyCap) : 0;
      add(
        raDeductionStep(ctx, {
          goal: 'pay-less-tax',
          contribution: target,
          affordable: ctx.spare > 0 && ctx.spare < target ? raMonthly : undefined,
        }),
      );
      if (ctx.spare > 0) {
        add(
          tfsaRefundStep(ctx, { raMonthly, tfsaMonthly }),
          budgetFitStep(ctx, { raMonthly, tfsaMonthly }),
        );
      }
      break;
    }
    case 'build-tfsa': {
      add(makeRoom);
      const monthly = Math.min(answers.tfsaMonthly, ctx.tfsaMonthlyCap);
      add(tfsaBuildStep(ctx, { monthly }));
      if (monthly > 0) add(budgetFitStep(ctx, { raMonthly: 0, tfsaMonthly: monthly }));
      break;
    }
    case 'emergency-fund':
      add(makeRoom, emergencyFundStep(ctx));
      break;
    case 'buy-home':
      add(homeBudgetStep(ctx));
      break;
  }
  return steps;
}

export interface PlanAssumption {
  readonly id: string;
  readonly text: string;
}

/** The assumptions behind the plan, in plain words, for the summary's "What this assumes" list. */
export function planAssumptionNotes(
  answers: PlanAnswers,
  basics: PlanBasics | null,
  assumptions: Assumptions | null,
): PlanAssumption[] {
  const { goal } = answers;
  if (goal === null || basics === null) return [];
  const notes: PlanAssumption[] = [];
  const percent = (value: number) => formatPercent(value / 100);

  notes.push({
    id: 'inflation',
    text: assumptions
      ? `Inflation stays at the latest CPI rate (${percent(assumptions.inflation.valuePercent)}).`
      : 'Inflation rates are unavailable, so inflation is taken as 0%.',
  });
  notes.push({
    id: 'pay',
    text: 'Pay assumes no medical aid, no retirement fund contributions and no other deductions.',
  });

  if (goal === 'retire-early' || goal === 'pay-less-tax' || goal === 'build-tfsa') {
    const level = RISK_LEVELS.find((candidate) => candidate.id === answers.risk) ?? RISK_LEVELS[1];
    notes.push({
      id: 'growth',
      text: `Assumption: ${level.label} means CPI plus ${level.premiumPp} percentage points (${percent(riskReturnPercent(answers.risk, assumptions))} a year). Change your risk comfort to change it.`,
    });
  }
  if (goal === 'retire-early') {
    notes.push({
      id: 'retirement-return',
      text: `Once retired, your money is assumed to earn ${percent(retirementReturnPercent(answers.risk, assumptions))} a year, never more than before retirement.`,
    });
  }
  if (goal === 'pay-less-tax' || goal === 'build-tfsa') {
    notes.push({
      id: 'horizon',
      text: `The plan looks ahead to age ${planHorizonAge(answers)}.`,
    });
  }
  if (goal === 'emergency-fund' || goal === 'buy-home') {
    notes.push({
      id: 'essentials',
      text: 'Essentials are assumed to be 50% of your take-home pay (a 50/30/20 budget).',
    });
  }
  if (answers.tfsaBalance > 0 && goal !== 'emergency-fund' && goal !== 'buy-home') {
    notes.push({
      id: 'tfsa-lifetime',
      text: 'Your TFSA balance is treated as contributions already made.',
    });
  }
  return notes;
}
