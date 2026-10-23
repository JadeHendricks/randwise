import {
  BUDGET_SETTINGS_DEFAULT,
  type BudgetSentLines,
  type BudgetSettings,
} from '../budget/budget-inputs';
import { type BudgetEstimateOk, estimateBudget } from '../budget/estimate-budget';
import { percentOfNet, raHeadroom, raTaxSaving, roundRand } from '../engine';
import { estimateJourney } from '../journey/estimate-journey';
import { type RetireEstimateOk, estimateRetire } from '../retire/estimate-retire';
import { formatPercent, formatRandWhole } from '../../shared/format/format-rand';
import type { PlanContext, PlanFigure, PlanStep, PlanUnit } from './plan-builder';

/**
 * One factory per plan step. Pure TypeScript (lint enforced). Every number comes from the same
 * estimators and engine functions the calculator pages use, so "Open in ..." shows the same
 * figure. A factory returns null when its estimate fails (a RangeError); it never throws for
 * figures the user could type.
 */

function figure(id: string, label: string, value: number, unit: PlanUnit): PlanFigure {
  return { id, label, value, unit };
}

/** Runs an engine call; a RangeError (a figure the engine cannot work with) becomes null. */
export function attempt<T>(run: () => T): T | null {
  try {
    return run();
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }
}

/** The Budget estimate for the plan's income, with optional sent lines and settings. */
function budgetEstimate(
  ctx: PlanContext,
  sentLines: BudgetSentLines | null,
  settings: Partial<BudgetSettings> = {},
): BudgetEstimateOk | null {
  const estimate = estimateBudget(
    {
      income: ctx.income,
      categories: null,
      sentLines,
      settings: { ...BUDGET_SETTINGS_DEFAULT, ...settings },
    },
    ctx.tables,
    ctx.rules.journey,
  );
  return estimate.ok ? estimate : null;
}

const budgetBase = (ctx: PlanContext) => ({ ...ctx.basics.salary, otherDeductionsMonthly: 0 });

export function takeHomeStep(ctx: PlanContext): PlanStep {
  const { basics, answers } = ctx;
  return {
    id: 'take-home',
    calculator: 'pay',
    title: 'Check your take-home pay',
    why: 'Every other number in the plan starts from the pay that reaches your bank account.',
    key: figure('take-home-monthly', 'Take-home pay a month', basics.netMonthly, 'rand-month'),
    details: [
      figure('gross-monthly', 'Gross pay a month', basics.grossMonthly, 'rand-month'),
      figure('paye-monthly', 'PAYE a month', basics.payeMonthly, 'rand-month'),
      figure('uif-monthly', 'UIF a month', basics.uifMonthly, 'rand-month'),
      figure('take-home-annual', 'Take-home pay a year', basics.netAnnual, 'rand-year'),
    ],
    notes: [],
    open: {
      calculator: 'pay',
      salary: {
        basis: answers.income.basis,
        period: answers.income.period,
        amount: answers.income.amount,
        age: answers.age,
      },
    },
  };
}

export function makeRoomStep(ctx: PlanContext): PlanStep {
  const { basics } = ctx;
  return {
    id: 'make-room',
    calculator: 'budget',
    title: 'Free up money to invest',
    why: 'Nothing is set aside to invest yet. A 50/30/20 budget saves about a fifth of your take-home pay.',
    key: figure(
      'suggested-savings',
      'Suggested savings a month',
      basics.suggestedSurplus,
      'rand-month',
    ),
    details: [
      figure('take-home-monthly', 'Take-home pay a month', basics.netMonthly, 'rand-month'),
    ],
    notes: [],
    open: { calculator: 'budget', values: budgetBase(ctx) },
  };
}

/** The Retire estimate at a given RA contribution, or null when it cannot be worked out. */
export function retireEstimate(
  ctx: PlanContext,
  contributionMonthly: number,
): RetireEstimateOk | null {
  const estimate = estimateRetire(
    { ...ctx.basics.salary, ...ctx.retireFields(contributionMonthly) },
    ctx.tables,
    ctx.rules.retire,
  );
  return estimate.ok ? estimate : null;
}

/**
 * `needed` is the Retire estimate with nothing contributed (it holds the monthly amount that
 * reaches the goal); a second estimate at `raMonthly` says how far that contribution gets.
 */
export function retireTargetStep(
  ctx: PlanContext,
  needed: RetireEstimateOk,
  raMonthly: number,
): PlanStep | null {
  const current = retireEstimate(ctx, raMonthly);
  if (!current) return null;
  const { answers } = ctx;
  const required = needed.result.requiredContribution.monthly;
  const funded = current.result.current.fundedPercent;
  const notes: string[] = [];
  if (raMonthly < required) {
    notes.push(
      `You can put in ${formatRandWhole(raMonthly)} a month against the ${formatRandWhole(required)} needed, so you would be about ${formatPercent(funded / 100, 0)} of the way there. A later retirement age or a lower income goal would close the gap.`,
    );
  }
  notes.push(
    `Assumes your money grows ${formatPercent(ctx.growth / 100)} a year before retirement and ${formatPercent(ctx.retirementReturn / 100)} a year after it, with inflation at ${formatPercent(ctx.cpi / 100)}.`,
  );
  return {
    id: 'retire-target',
    calculator: 'retire',
    title: `Save ${formatRandWhole(required)} a month to retire at ${answers.retireAge} on ${formatRandWhole(answers.retireIncomeMonthly)} a month`,
    why: 'This is the monthly saving that builds enough to pay your income goal for the rest of your life.',
    key: figure('retire-required-monthly', 'Needed each month', required, 'rand-month'),
    details: [
      figure(
        'retire-capital-today',
        "Capital needed, in today's money",
        current.result.capitalToday,
        'rand',
      ),
      figure('retire-can-put-in', 'What you can put in a month', raMonthly, 'rand-month'),
      figure('retire-funded', 'On track', funded, 'percent'),
    ],
    notes,
    open: {
      calculator: 'retire',
      values: { ...ctx.basics.salary, ...ctx.retireFields(raMonthly) },
    },
  };
}

interface RaDeductionOptions {
  readonly goal: 'retire-early' | 'pay-less-tax';
  /** The monthly RA amount the step is about (and the RA calculator opens with). */
  readonly contribution: number;
  /** For the tax goal when the money available is less than `contribution`. */
  readonly affordable?: number;
}

export function raDeductionStep(ctx: PlanContext, options: RaDeductionOptions): PlanStep | null {
  const { salary } = ctx.basics;
  const headroom = attempt(() => raHeadroom(salary, ctx.tables));
  const saving = attempt(() => raTaxSaving(salary, options.contribution, ctx.tables));
  if (!headroom || !saving) return null;

  const used = options.contribution < 1;
  const full = options.goal === 'pay-less-tax';
  const details: PlanFigure[] = [
    figure('ra-room-annual', 'Deduction room a year', headroom.headroom, 'rand-year'),
    figure('ra-room-monthly', 'Deduction room a month', headroom.headroomMonthly, 'rand-month'),
    figure('ra-tax-rate', 'Tax rate on an extra rand', saving.marginalRate * 100, 'percent'),
  ];
  const notes: string[] = [];
  if (options.affordable !== undefined) {
    const affordable = attempt(() => raTaxSaving(salary, options.affordable ?? 0, ctx.tables));
    if (affordable) {
      details.push(
        figure(
          'ra-tax-saved-affordable',
          'Tax saved a year at what you can afford',
          affordable.saving,
          'rand-year',
        ),
      );
      notes.push(
        `You have ${formatRandWhole(options.affordable)} a month to invest, so start with that. The rest of the deduction can wait.`,
      );
    }
  }
  if (roundRand(saving.contribution) > roundRand(saving.deductible)) {
    notes.push(
      `Only ${formatRandWhole(headroom.headroomMonthly)} a month of this is tax deductible this year. The rest is still saved but does not lower your tax.`,
    );
  }
  notes.push(
    'Your tax saving arrives as a refund after you file, or as lower PAYE if it goes through payroll.',
  );

  return {
    id: 'ra-deduction',
    calculator: 'ra',
    title: used
      ? 'Your RA tax deduction is already used'
      : `Pay ${formatRandWhole(options.contribution)} a month into your RA to use your ${full ? 'full ' : ''}tax deduction`,
    why: used
      ? 'Your retirement contributions already use the most the tax rules let you deduct.'
      : 'Money paid into an RA lowers your taxable income, so SARS takes less tax from you.',
    key: figure('ra-tax-saved', 'Tax saved a year', saving.saving, 'rand-year'),
    details,
    notes,
    open: {
      calculator: 'ra',
      values: { ...salary, ...ctx.raFields(options.contribution) },
    },
  };
}

interface TfsaRefundOptions {
  readonly raMonthly: number;
  /** The leftover money going into the TFSA, rands a month. */
  readonly tfsaMonthly: number;
}

export function tfsaRefundStep(ctx: PlanContext, options: TfsaRefundOptions): PlanStep | null {
  const { salary } = ctx.basics;
  const saving = attempt(() => raTaxSaving(salary, options.raMonthly, ctx.tables));
  const journey = estimateJourney(
    { ...salary, ...ctx.journeyFields(options.raMonthly, options.tfsaMonthly) },
    ctx.tables,
    ctx.rules.journey,
  );
  if (!saving || !journey.ok) return null;

  const { result } = journey;
  const refund = saving.saving;
  const hasRefund = refund >= 0.5;
  const notes: string[] = [];
  if (
    journey.warnings.includes('unallocated-refund') ||
    journey.warnings.includes('penalty-exposure')
  ) {
    notes.push(
      `Your refund and monthly top-ups together are over the ${formatRandWhole(ctx.rules.journey.annualLimit)} yearly TFSA limit, so part of the money cannot go in without a penalty.`,
    );
  }
  notes.push(
    `Assumes your money grows ${formatPercent(ctx.growth / 100)} a year, with inflation at ${formatPercent(ctx.cpi / 100)}.`,
  );
  return {
    id: 'tfsa-refund',
    calculator: 'journey',
    title: hasRefund
      ? `Put your ${formatRandWhole(refund)} tax refund into a TFSA`
      : `Put ${formatRandWhole(options.tfsaMonthly)} a month into a TFSA`,
    why: hasRefund
      ? 'The refund is tax you no longer pay. Growth inside a TFSA is tax free.'
      : 'Growth inside a TFSA is tax free, and you can take the money out when you need it.',
    key: figure('tfsa-refund-annual', 'Tax refund a year', refund, 'rand-year'),
    details: [
      figure('tfsa-annual-limit', 'Yearly TFSA limit', ctx.rules.journey.annualLimit, 'rand-year'),
      figure('tfsa-lifetime-limit', 'Lifetime TFSA limit', ctx.rules.journey.lifetimeLimit, 'rand'),
      figure(
        'tfsa-top-up',
        'Top-up from leftover money a month',
        options.tfsaMonthly,
        'rand-month',
      ),
      figure(
        'tfsa-final-balance',
        `TFSA balance at ${result.ages.retirementAge}`,
        result.final.tfsaBalance,
        'rand',
      ),
      figure(
        'tfsa-tax-saved',
        `Tax saved by ${result.ages.retirementAge}`,
        result.totals.taxSaved,
        'rand',
      ),
    ],
    notes,
    open: {
      calculator: 'journey',
      values: { ...salary, ...ctx.journeyFields(options.raMonthly, options.tfsaMonthly) },
    },
  };
}

interface TfsaBuildOptions {
  /** The monthly amount after the yearly limit was applied. */
  readonly monthly: number;
}

export function tfsaBuildStep(ctx: PlanContext, options: TfsaBuildOptions): PlanStep | null {
  const { salary } = ctx.basics;
  const { answers } = ctx;
  const journey = estimateJourney(
    { ...salary, ...ctx.journeyFields(0, options.monthly) },
    ctx.tables,
    ctx.rules.journey,
  );
  if (!journey.ok) return null;

  const { result } = journey;
  const reached = result.years.find((row) => row.tfsaBalance >= answers.tfsaTarget);
  const finalBalance = figure(
    'tfsa-final-balance',
    `TFSA balance at ${result.ages.retirementAge}`,
    result.final.tfsaBalance,
    'rand',
  );
  const details: PlanFigure[] = [];
  if (reached)
    details.push(figure('tfsa-years-to-target', 'Years to reach it', reached.year, 'years'));
  details.push(
    figure('tfsa-monthly-cap', 'Most you can put in each month', ctx.tfsaMonthlyCap, 'rand-month'),
    finalBalance,
  );

  const notes: string[] = [];
  if (answers.tfsaMonthly > options.monthly) {
    notes.push(
      `The yearly TFSA limit is ${formatRandWhole(ctx.rules.journey.annualLimit)}, so ${formatRandWhole(options.monthly)} a month is the most that goes in tax free. SARS charges ${formatPercent(ctx.rules.journey.penaltyRate, 0)} on anything above the limit.`,
    );
  }
  if (ctx.spare > 0 && options.monthly > ctx.spare) {
    notes.push(
      `That is more than the ${formatRandWhole(ctx.spare)} a month you said you can invest.`,
    );
  }
  if (!reached) {
    notes.push(`At this pace the target is not reached by age ${result.ages.retirementAge}.`);
  }
  notes.push(
    `Your TFSA balance counts as contributions already made. Assumes your money grows ${formatPercent(ctx.growth / 100)} a year.`,
  );
  return {
    id: 'tfsa-build',
    calculator: 'journey',
    title: `Put ${formatRandWhole(options.monthly)} a month into a TFSA to reach ${formatRandWhole(answers.tfsaTarget)}`,
    why: 'A TFSA grows tax free, so every rand of growth stays yours.',
    key: reached
      ? figure('tfsa-reach-age', 'Age you reach your target', reached.age + 1, 'age')
      : finalBalance,
    details,
    notes,
    open: {
      calculator: 'journey',
      values: { ...salary, ...ctx.journeyFields(0, options.monthly) },
    },
  };
}

export function emergencyFundStep(ctx: PlanContext): PlanStep | null {
  const { answers, spare } = ctx;
  const settings = {
    emergencyMonths: answers.emergencyMonths,
    emergencySaved: answers.emergencySaved,
  };
  const estimate = budgetEstimate(ctx, { emergencyMonthly: spare }, settings);
  if (!estimate) return null;

  const fund = estimate.limits.emergency;
  const details: PlanFigure[] = [
    figure('emergency-months', 'Months covered', fund.months, 'months'),
    figure('emergency-essentials', 'Essentials a month', fund.needsMonthly, 'rand-month'),
    figure('emergency-saved', 'Saved so far', fund.saved, 'rand'),
    figure('emergency-monthly', 'Going in a month', fund.monthly, 'rand-month'),
  ];
  if (fund.monthsToTarget !== null) {
    details.push(
      figure('emergency-months-to-target', 'Months to reach it', fund.monthsToTarget, 'months'),
    );
  }
  const notes: string[] = [];
  if (fund.monthly <= 0) notes.push('Nothing is going in yet.');
  notes.push('Essentials are assumed to be 50% of your take-home pay (a 50/30/20 budget).');
  return {
    id: 'emergency-fund',
    calculator: 'budget',
    title: `Build a ${formatRandWhole(fund.target)} emergency fund`,
    why: 'Cash set aside for emergencies keeps a surprise bill from becoming debt.',
    key: figure('emergency-target', 'Emergency fund target', fund.target, 'rand'),
    details,
    notes,
    open: {
      calculator: 'budget',
      values: {
        ...budgetBase(ctx),
        emergencyMonths: answers.emergencyMonths,
        emergencySaved: answers.emergencySaved,
        emergencyMonthly: spare,
      },
    },
  };
}

interface BudgetFitOptions {
  readonly raMonthly: number;
  readonly tfsaMonthly: number;
}

export function budgetFitStep(ctx: PlanContext, options: BudgetFitOptions): PlanStep | null {
  const { answers } = ctx;
  const estimate = budgetEstimate(
    ctx,
    { raMonthly: options.raMonthly, tfsaMonthly: options.tfsaMonthly },
    { tfsaLifetimeUsed: answers.tfsaBalance },
  );
  if (!estimate) return null;

  const total = options.raMonthly + options.tfsaMonthly;
  const details: PlanFigure[] = [
    figure('budget-take-home', 'Take-home pay a month', estimate.net, 'rand-month'),
    figure('budget-ra-line', 'RA line', estimate.limits.ra.monthly, 'rand-month'),
    figure('budget-tfsa-line', 'TFSA line', estimate.limits.tfsa.monthly, 'rand-month'),
  ];
  const notes: string[] = [];
  if (estimate.summary.status === 'over') {
    details.push(
      figure('budget-over', 'Over your budget by', estimate.summary.overAllocated, 'rand-month'),
    );
    notes.push(
      'Next to the example 50/30/20 budget this is more than your take-home pay. Adjust your other lines in the Budget.',
    );
  }
  return {
    id: 'budget-fit',
    calculator: 'budget',
    title: `Check ${formatRandWhole(total)} a month fits your budget`,
    why: 'Saving only works if the rest of your month still adds up.',
    key: figure(
      'budget-share',
      'Share of take-home pay',
      percentOfNet(total, estimate.net),
      'percent',
    ),
    details,
    notes,
    open: {
      calculator: 'budget',
      values: {
        ...budgetBase(ctx),
        raMonthly: options.raMonthly,
        tfsaMonthly: options.tfsaMonthly,
        tfsaLifetimeUsed: answers.tfsaBalance,
      },
    },
  };
}

export function homeBudgetStep(ctx: PlanContext): PlanStep | null {
  const estimate = budgetEstimate(ctx, null);
  const housing = estimate?.categories.find((line) => line.kind === 'housing');
  if (!estimate || !housing) return null;
  return {
    id: 'home-budget',
    calculator: 'budget',
    title: 'See what a home could cost you each month',
    why: 'A 50/30/20 budget keeps housing near a fifth of your take-home pay.',
    key: figure('home-housing-monthly', 'Housing a month', housing.amount, 'rand-month'),
    details: [figure('take-home-monthly', 'Take-home pay a month', estimate.net, 'rand-month')],
    notes: [
      'A dedicated home-loan calculator is coming to the Toolbox. Until then the Budget shows how much room you have for housing.',
      'Essentials are assumed to be 50% of your take-home pay (a 50/30/20 budget).',
    ],
    open: { calculator: 'budget', values: budgetBase(ctx) },
  };
}
