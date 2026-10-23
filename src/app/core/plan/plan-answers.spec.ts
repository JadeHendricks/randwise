import { deriveAssumptions } from '../data/assumptions';
import { makeRates } from '../../testing/tax-data-fixtures';
import { deepFreeze } from '../../testing/tax-tables';
import {
  DEFAULT_PLAN_ANSWERS,
  MAX_PLAN_QUESTIONS,
  type PlanAnswers,
  type PlanGoal,
  RISK_LEVELS,
  planQuestions,
  questionProblem,
  retirementReturnPercent,
  riskReturnPercent,
  sanitisePlanAnswers,
} from './plan-answers';

const assumptions = deriveAssumptions(makeRates().rates);
const withGoal = (goal: PlanGoal | null): PlanAnswers => ({ ...DEFAULT_PLAN_ANSWERS, goal });

describe('DEFAULT_PLAN_ANSWERS', () => {
  it('is the Salary example with no goal, a balanced risk and the suggested surplus', () => {
    expect(DEFAULT_PLAN_ANSWERS).toEqual({
      age: 35,
      income: { basis: 'gross', period: 'monthly', amount: 30_000 },
      goal: null,
      risk: 'balanced',
      surplusMonthly: null,
      raBalance: 0,
      tfsaBalance: 0,
      emergencySaved: 0,
      retireAge: 55,
      retireIncomeMonthly: 50_000,
      tfsaTarget: 100_000,
      tfsaMonthly: 1_000,
      emergencyMonths: 3,
    });
  });
});

describe('sanitisePlanAnswers', () => {
  const current = deepFreeze({ ...DEFAULT_PLAN_ANSWERS });

  it('applies valid values', () => {
    const result = sanitisePlanAnswers(
      {
        age: 41,
        income: { basis: 'net', period: 'annual', amount: 300_000 },
        goal: 'build-tfsa',
        risk: 'adventurous',
        surplusMonthly: 4_000,
        raBalance: 10_000,
        tfsaBalance: 20_000,
        emergencySaved: 5_000,
        retireAge: 60,
        retireIncomeMonthly: 40_000,
        tfsaTarget: 250_000,
        tfsaMonthly: 2_000,
        emergencyMonths: 6,
      },
      current,
    );
    expect(result).toEqual({
      age: 41,
      income: { basis: 'net', period: 'annual', amount: 300_000 },
      goal: 'build-tfsa',
      risk: 'adventurous',
      surplusMonthly: 4_000,
      raBalance: 10_000,
      tfsaBalance: 20_000,
      emergencySaved: 5_000,
      retireAge: 60,
      retireIncomeMonthly: 40_000,
      tfsaTarget: 250_000,
      tfsaMonthly: 2_000,
      emergencyMonths: 6,
    });
  });

  it('leaves fields that are not in the patch alone and does not mutate the current answers', () => {
    expect(sanitisePlanAnswers({ age: 50 }, current)).toEqual({ ...current, age: 50 });
    expect(sanitisePlanAnswers({}, current)).toEqual(current);
  });

  it('rounds and clamps whole-number fields', () => {
    expect(sanitisePlanAnswers({ age: 12 }, current).age).toBe(18);
    expect(sanitisePlanAnswers({ age: 130 }, current).age).toBe(100);
    expect(sanitisePlanAnswers({ age: 41.6 }, current).age).toBe(42);
    expect(sanitisePlanAnswers({ retireAge: 20 }, current).retireAge).toBe(40);
    expect(sanitisePlanAnswers({ retireAge: 95 }, current).retireAge).toBe(80);
    expect(sanitisePlanAnswers({ emergencyMonths: 0 }, current).emergencyMonths).toBe(1);
    expect(sanitisePlanAnswers({ emergencyMonths: 40 }, current).emergencyMonths).toBe(12);
    expect(sanitisePlanAnswers({ emergencyMonths: 5.4 }, current).emergencyMonths).toBe(5);
  });

  it('keeps the current value for a negative or non-finite amount', () => {
    const base = { ...current, raBalance: 700, tfsaTarget: 800 };
    const result = sanitisePlanAnswers(
      {
        raBalance: -1,
        tfsaTarget: Number.NaN,
        tfsaBalance: Number.POSITIVE_INFINITY,
        emergencySaved: -5,
        retireIncomeMonthly: -1,
        tfsaMonthly: Number.NaN,
        income: { basis: 'gross', period: 'monthly', amount: -10 },
        age: Number.NaN,
        retireAge: Number.NaN,
        emergencyMonths: Number.NaN,
      },
      base,
    );
    expect(result).toEqual(base);
  });

  it('ignores an unknown goal, risk, basis or period', () => {
    const base = { ...current, goal: 'pay-less-tax' as const };
    const result = sanitisePlanAnswers(
      {
        goal: 'win-lottery' as PlanGoal,
        risk: 'reckless' as PlanAnswers['risk'],
        income: {
          basis: 'weekly' as PlanAnswers['income']['basis'],
          period: 'daily' as PlanAnswers['income']['period'],
          amount: 1_000,
        },
      },
      base,
    );
    expect(result.goal).toBe('pay-less-tax');
    expect(result.risk).toBe('balanced');
    expect(result.income).toEqual({ basis: 'gross', period: 'monthly', amount: 1_000 });
  });

  it('does not clear a goal with null', () => {
    const base = withGoal('buy-home');
    expect(sanitisePlanAnswers({ goal: null }, base).goal).toBe('buy-home');
  });

  it('accepts null for the surplus (use the suggestion), a valid amount, and 0', () => {
    const base = { ...current, surplusMonthly: 3_000 };
    expect(sanitisePlanAnswers({ surplusMonthly: null }, base).surplusMonthly).toBeNull();
    expect(sanitisePlanAnswers({ surplusMonthly: 0 }, base).surplusMonthly).toBe(0);
    expect(sanitisePlanAnswers({ surplusMonthly: 9_000 }, base).surplusMonthly).toBe(9_000);
  });

  it('keeps the current surplus for an invalid amount, including a current null', () => {
    const base = { ...current, surplusMonthly: 3_000 };
    expect(sanitisePlanAnswers({ surplusMonthly: -1 }, base).surplusMonthly).toBe(3_000);
    expect(sanitisePlanAnswers({ surplusMonthly: Number.NaN }, base).surplusMonthly).toBe(3_000);
    expect(sanitisePlanAnswers({ surplusMonthly: -1 }, current).surplusMonthly).toBeNull();
    expect(sanitisePlanAnswers({}, base).surplusMonthly).toBe(3_000);
  });

  it('does not cap a huge finite amount', () => {
    expect(
      sanitisePlanAnswers({ income: { basis: 'net', period: 'monthly', amount: 5e9 } }, current)
        .income.amount,
    ).toBe(5e9);
  });
});

describe('risk mapping', () => {
  it('lists the three levels with their premiums over CPI', () => {
    expect(RISK_LEVELS.map((level) => [level.id, level.premiumPp])).toEqual([
      ['cautious', 2],
      ['balanced', 5],
      ['adventurous', 7],
    ]);
  });

  it('is CPI plus 2, 5 or 7 percentage points (CPI 4.5 gives 6.5, 9.5 and 11.5)', () => {
    expect(riskReturnPercent('cautious', assumptions)).toBe(6.5);
    expect(riskReturnPercent('balanced', assumptions)).toBe(9.5);
    expect(riskReturnPercent('adventurous', assumptions)).toBe(11.5);
  });

  it('treats CPI as 0 without rates (2, 5 and 7)', () => {
    expect(riskReturnPercent('cautious', null)).toBe(2);
    expect(riskReturnPercent('balanced', null)).toBe(5);
    expect(riskReturnPercent('adventurous', null)).toBe(7);
  });

  it('matches the growth assumption for balanced', () => {
    expect(riskReturnPercent('balanced', assumptions)).toBe(assumptions.growthReturn.valuePercent);
  });

  it('keeps the retirement return at the lower of the risk return and CPI plus 3', () => {
    expect(retirementReturnPercent('cautious', assumptions)).toBe(6.5);
    expect(retirementReturnPercent('balanced', assumptions)).toBe(7.5);
    expect(retirementReturnPercent('adventurous', assumptions)).toBe(7.5);
  });

  it('applies the same rule without rates', () => {
    expect(retirementReturnPercent('cautious', null)).toBe(2);
    expect(retirementReturnPercent('balanced', null)).toBe(3);
    expect(retirementReturnPercent('adventurous', null)).toBe(3);
  });
});

describe('planQuestions', () => {
  it.each([
    ['retire-early', ['age', 'income', 'goal', 'retire-details', 'risk', 'money']],
    ['build-tfsa', ['age', 'income', 'goal', 'tfsa-details', 'risk', 'money']],
    ['pay-less-tax', ['age', 'income', 'goal', 'risk', 'money']],
    ['emergency-fund', ['age', 'income', 'goal', 'emergency-details', 'money']],
    ['buy-home', ['age', 'income', 'goal']],
  ] as const)('asks the %s questions in order', (goal, ids) => {
    expect(planQuestions(withGoal(goal))).toEqual(ids);
  });

  it('asks three questions before a goal is chosen', () => {
    expect(planQuestions(withGoal(null))).toEqual(['age', 'income', 'goal']);
  });

  it('gives 6, 6, 5, 5, 3 and 3 questions', () => {
    const counts = (
      ['retire-early', 'build-tfsa', 'pay-less-tax', 'emergency-fund', 'buy-home', null] as const
    ).map((goal) => planQuestions(withGoal(goal)).length);
    expect(counts).toEqual([6, 6, 5, 5, 3, 3]);
    expect(Math.max(...counts)).toBe(MAX_PLAN_QUESTIONS);
  });

  it('never asks about risk for the emergency fund or buying a home', () => {
    expect(planQuestions(withGoal('emergency-fund'))).not.toContain('risk');
    expect(planQuestions(withGoal('buy-home'))).not.toContain('risk');
  });

  it('never asks about money for buying a home', () => {
    expect(planQuestions(withGoal('buy-home'))).not.toContain('money');
  });
});

describe('questionProblem', () => {
  const earliest = 55;
  const problem = (id: Parameters<typeof questionProblem>[0], answers: PlanAnswers) =>
    questionProblem(id, answers, earliest);

  it('asks for an income when it is 0', () => {
    const answers = {
      ...DEFAULT_PLAN_ANSWERS,
      income: { ...DEFAULT_PLAN_ANSWERS.income, amount: 0 },
    };
    expect(problem('income', answers)).toBe('Enter your income to continue.');
    expect(problem('income', DEFAULT_PLAN_ANSWERS)).toBeNull();
  });

  it('asks for a goal when none is chosen', () => {
    expect(problem('goal', withGoal(null))).toBe('Choose a goal to continue.');
    expect(problem('goal', withGoal('buy-home'))).toBeNull();
  });

  it('checks the retirement age against the current age and the earliest RA age', () => {
    const base = withGoal('retire-early');
    expect(problem('retire-details', { ...base, age: 56, retireAge: 55 })).toBe(
      'Choose a retirement age after 56.',
    );
    expect(problem('retire-details', { ...base, age: 35, retireAge: 50 })).toBe(
      'An RA pays out from age 55 at the earliest.',
    );
    expect(problem('retire-details', { ...base, retireIncomeMonthly: 0 })).toBe(
      'Enter the monthly income you want.',
    );
    expect(problem('retire-details', base)).toBeNull();
  });

  it('asks for a TFSA target and monthly amount', () => {
    const base = withGoal('build-tfsa');
    expect(problem('tfsa-details', { ...base, tfsaTarget: 0 })).toBe(
      'Enter a target and a monthly amount.',
    );
    expect(problem('tfsa-details', { ...base, tfsaMonthly: 0 })).toBe(
      'Enter a target and a monthly amount.',
    );
    expect(problem('tfsa-details', base)).toBeNull();
  });

  it('has no problem for the other questions', () => {
    const answers = withGoal('emergency-fund');
    for (const id of ['age', 'emergency-details', 'risk', 'money'] as const) {
      expect(problem(id, answers)).toBeNull();
    }
  });
});
