import taxYear2027 from '../../../assets/data/tax-years/2027.json';
import { makeRates } from '../../testing/tax-data-fixtures';
import { normaliseSpaces } from '../../testing/text';
import { deepFreeze, shippedTaxTables2027 } from '../../testing/tax-tables';
import { deriveAssumptions } from '../data/assumptions';
import { validateTaxYearFile } from '../data/tax-year.validator';
import { percentOfNet } from '../engine';
import { estimateJourney } from '../journey/estimate-journey';
import { estimateRetire } from '../retire/estimate-retire';
import {
  DEFAULT_PLAN_ANSWERS,
  type PlanAnswers,
  type PlanGoal,
  sanitisePlanAnswers,
} from './plan-answers';
import {
  type PlanStep,
  type PlanStepId,
  buildPlan,
  planAssumptionNotes,
  planBasics,
  planRules,
} from './plan-builder';

const tables = shippedTaxTables2027();
const shipped = validateTaxYearFile(taxYear2027, '2027.json');
if (!shipped.ok) throw new Error(`2027.json is invalid: ${shipped.errors.join('; ')}`);
const rules = planRules(shipped.value);
const assumptions = deriveAssumptions(makeRates().rates);

const answersOf = (patch: Partial<PlanAnswers>): PlanAnswers =>
  sanitisePlanAnswers(patch, DEFAULT_PLAN_ANSWERS);
const build = (patch: Partial<PlanAnswers>, withRates = true) =>
  buildPlan(answersOf(patch), tables, rules, withRates ? assumptions : null);
const ids = (steps: readonly PlanStep[]): PlanStepId[] => steps.map((step) => step.id);

function stepOf(steps: readonly PlanStep[], id: PlanStepId): PlanStep {
  const found = steps.find((step) => step.id === id);
  if (!found) throw new Error(`no ${id} step in ${ids(steps).join(', ')}`);
  return found;
}

function detail(step: PlanStep, id: string) {
  return step.details.find((figure) => figure.id === id);
}

/** The Salary side every sent payload carries (R30 000 gross, age 35, nothing else). */
const SALARY = {
  grossMonthly: 30_000,
  age: 35,
  medicalMembers: 0,
  employeeRetirementMonthly: 0,
  employerRetirementMonthly: 0,
};

const ALL_GOALS: readonly PlanGoal[] = [
  'retire-early',
  'pay-less-tax',
  'build-tfsa',
  'emergency-fund',
  'buy-home',
];

describe('planRules', () => {
  it('reads the RA, retirement and journey rules from the tax-year file', () => {
    expect(rules.ra.earliestRetirementAge).toBe(55);
    expect(rules.retire.earliestRetirementAge).toBe(55);
    expect(rules.journey.annualLimit).toBe(46_000);
    expect(rules.journey.lifetimeLimit).toBe(500_000);
    expect(rules.journey.penaltyRate).toBe(0.4);
  });
});

describe('planBasics', () => {
  it('works out R30 000 gross: PAYE R4 681, UIF R177,12, take-home R25 141,88', () => {
    const basics = planBasics(DEFAULT_PLAN_ANSWERS, tables);
    expect(basics).toMatchObject({
      grossMonthly: 30_000,
      grossAnnual: 360_000,
      netMonthly: 25_141.88,
      netAnnual: 301_702.56,
      payeMonthly: 4_681,
      uifMonthly: 177.12,
    });
    expect(basics?.salary).toEqual(SALARY);
  });

  it('suggests 20% of take-home, floored to whole rands', () => {
    // 25 141.88 x 0.2 = 5 028.376.
    expect(planBasics(DEFAULT_PLAN_ANSWERS, tables)?.suggestedSurplus).toBe(5_028);
  });

  it('gives the same person for a gross yearly entry', () => {
    const basics = planBasics(
      answersOf({ income: { basis: 'gross', period: 'annual', amount: 360_000 } }),
      tables,
    );
    expect(basics?.grossMonthly).toBe(30_000);
    expect(basics?.netMonthly).toBe(25_141.88);
  });

  it('works a take-home entry back to the R30 000 gross', () => {
    const basics = planBasics(
      answersOf({ income: { basis: 'net', period: 'monthly', amount: 25_141.88 } }),
      tables,
    );
    expect(basics?.grossMonthly).toBe(30_000);
    expect(basics?.salary.grossMonthly).toBe(30_000);
    expect(basics?.netMonthly).toBe(25_141.88);
  });

  it('is null for a take-home too high to work back', () => {
    expect(
      planBasics(answersOf({ income: { basis: 'net', period: 'monthly', amount: 5e9 } }), tables),
    ).toBeNull();
  });
});

describe('buildPlan: pay less tax (age 35, R30 000 gross, balanced, R10 000 to invest)', () => {
  const steps = build({ goal: 'pay-less-tax', surplusMonthly: 10_000 });

  it('lists the steps in order', () => {
    expect(ids(steps)).toEqual(['take-home', 'ra-deduction', 'tfsa-refund', 'budget-fit']);
  });

  it('starts with the take-home pay and opens it in Pay as typed', () => {
    const step = stepOf(steps, 'take-home');
    expect(step.key.value).toBe(25_141.88);
    expect(step.open).toEqual({
      calculator: 'pay',
      salary: { basis: 'gross', period: 'monthly', amount: 30_000, age: 35 },
    });
  });

  it('saves R25 740 a year by paying R8 250 a month into the RA (R99 000 x 26%)', () => {
    const step = stepOf(steps, 'ra-deduction');
    expect(step.key).toMatchObject({ value: 25_740, unit: 'rand-year' });
    expect(detail(step, 'ra-room-annual')?.value).toBeCloseTo(99_000, 6);
    expect(detail(step, 'ra-room-monthly')?.value).toBeCloseTo(8_250, 6);
    expect(detail(step, 'ra-tax-rate')?.value).toBeCloseTo(26, 6);
    expect(step.title).toContain('full tax deduction');
    expect(normaliseSpaces(step.title)).toContain('R 8 250');
    expect(step.open).toEqual({
      calculator: 'ra',
      values: {
        ...SALARY,
        contributionMonthly: 8_250,
        escalationPercent: 5,
        startingBalance: 0,
        returnPercent: 9.5,
        inflationPercent: 4.5,
        retirementAge: 55,
      },
    });
  });

  it('puts the R25 740 refund and the R1 750 left over into a TFSA through the Journey', () => {
    const step = stepOf(steps, 'tfsa-refund');
    expect(step.key.value).toBe(25_740);
    expect(detail(step, 'tfsa-top-up')?.value).toBe(1_750);
    expect(detail(step, 'tfsa-annual-limit')?.value).toBe(46_000);
    expect(step.open).toEqual({
      calculator: 'journey',
      values: {
        ...SALARY,
        retirementAge: 55,
        incomeEscalationPercent: 4.5,
        contributionMonthly: 8_250,
        escalationPercent: 5,
        startingBalance: 0,
        tfsaBalance: 0,
        tfsaLifetimeUsed: 0,
        tfsaTopUpMonthly: 1_750,
        returnPercent: 9.5,
        tfsaReturnPercent: 9.5,
        inflationPercent: 4.5,
        refundMode: 'refund',
        allowOverContribution: false,
      },
    });
  });

  it('takes the Journey figures from a direct estimate', () => {
    const step = stepOf(steps, 'tfsa-refund');
    if (step.open.calculator !== 'journey') throw new Error('expected a Journey step');
    const direct = estimateJourney(
      { ...SALARY, ...step.open.values } as never,
      tables,
      rules.journey,
    );
    if (!direct.ok) throw new Error('journey failed');
    expect(detail(step, 'tfsa-final-balance')?.value).toBe(direct.result.final.tfsaBalance);
    expect(detail(step, 'tfsa-tax-saved')?.value).toBe(direct.result.totals.taxSaved);
  });

  it('checks that R10 000 fits the budget as a share of take-home pay', () => {
    const step = stepOf(steps, 'budget-fit');
    expect(step.key.unit).toBe('percent');
    expect(step.key.value).toBeCloseTo(percentOfNet(10_000, 25_141.88), 6);
    expect(step.open).toEqual({
      calculator: 'budget',
      values: {
        ...SALARY,
        otherDeductionsMonthly: 0,
        raMonthly: 8_250,
        tfsaMonthly: 1_750,
        tfsaLifetimeUsed: 0,
      },
    });
  });

  it('starts with what can be afforded when the room is less than the full deduction', () => {
    const small = build({ goal: 'pay-less-tax', surplusMonthly: 3_000 });
    const step = stepOf(small, 'ra-deduction');
    // The key is the full deduction; the detail is the saving at R3 000 (R36 000 x 26%).
    expect(step.key.value).toBe(25_740);
    expect(detail(step, 'ra-tax-saved-affordable')?.value).toBe(9_360);
    expect(step.notes.join(' ')).toContain('start with that');
    const journey = stepOf(small, 'tfsa-refund');
    expect(journey.key.value).toBe(9_360);
    expect(detail(journey, 'tfsa-top-up')?.value).toBe(0);
  });

  it('says the deduction is already used when there is no room, and still offers the TFSA', () => {
    // No income means no s11F room: the whole amount available goes to the TFSA.
    const used = build({
      goal: 'pay-less-tax',
      income: { basis: 'gross', period: 'monthly', amount: 0 },
      surplusMonthly: 1_000,
    });
    expect(ids(used)).toEqual(['take-home', 'ra-deduction', 'tfsa-refund', 'budget-fit']);
    const ra = stepOf(used, 'ra-deduction');
    expect(ra.title).toBe('Your RA tax deduction is already used');
    expect(ra.key.value).toBe(0);
    expect(ra.open.calculator === 'ra' && ra.open.values.contributionMonthly).toBe(0);
    const tfsa = stepOf(used, 'tfsa-refund');
    expect(normaliseSpaces(tfsa.title)).toBe('Put R 1 000 a month into a TFSA');
  });

  it('looks ahead to 55, or 10 years when already 55 or older', () => {
    const young = stepOf(steps, 'ra-deduction').open;
    const older = stepOf(
      build({ goal: 'pay-less-tax', age: 60, surplusMonthly: 10_000 }),
      'ra-deduction',
    ).open;
    expect(young.calculator === 'ra' && young.values.retirementAge).toBe(55);
    expect(older.calculator === 'ra' && older.values.retirementAge).toBe(70);
  });
});

describe('buildPlan: retire early (R50 000 at 55, R5 000 to invest, no balances)', () => {
  const steps = build({ goal: 'retire-early', surplusMonthly: 5_000 });

  it('lists the steps in order', () => {
    expect(ids(steps)).toEqual([
      'take-home',
      'retire-target',
      'ra-deduction',
      'tfsa-refund',
      'budget-fit',
    ]);
  });

  it('needs R46 864,26 a month, the same as the Retire page', () => {
    const step = stepOf(steps, 'retire-target');
    expect(Math.abs(step.key.value - 46_864.26)).toBeLessThan(0.01);
    expect(step.key.unit).toBe('rand-month');
    expect(normaliseSpaces(step.title)).toContain('R 46 864');
    expect(step.title).toContain('retire at 55');
    expect(detail(step, 'retire-can-put-in')?.value).toBe(5_000);
  });

  it('reports the funded share from a direct estimate at R5 000 a month', () => {
    const step = stepOf(steps, 'retire-target');
    if (step.open.calculator !== 'retire') throw new Error('expected a Retire step');
    expect(step.open.values.contributionMonthly).toBe(5_000);
    const direct = estimateRetire(
      { ...SALARY, ...step.open.values } as never,
      tables,
      rules.retire,
    );
    if (!direct.ok) throw new Error('retire failed');
    expect(detail(step, 'retire-funded')?.value).toBe(direct.result.current.fundedPercent);
    expect(detail(step, 'retire-capital-today')?.value).toBe(direct.result.capitalToday);
    expect(step.notes.join(' ')).toContain('A later retirement age');
  });

  it('sends all ten retirement fields, with returns 9.5, 7.5 and 4.5', () => {
    const step = stepOf(steps, 'retire-target');
    expect(step.open).toEqual({
      calculator: 'retire',
      values: {
        ...SALARY,
        goalNetMonthly: 50_000,
        retirementAge: 55,
        inflationPercent: 4.5,
        returnPercent: 9.5,
        retirementReturnPercent: 7.5,
        drawdownPercent: 5,
        takeLumpSum: false,
        startingBalance: 0,
        contributionMonthly: 5_000,
        escalationPercent: 5,
      },
    });
  });

  it('uses the whole room on the RA, leaving nothing for the TFSA', () => {
    const ra = stepOf(steps, 'ra-deduction');
    expect(ra.open.calculator === 'ra' && ra.open.values.contributionMonthly).toBe(5_000);
    expect(ra.title).not.toContain('full');
    // R60 000 a year x 26%.
    expect(ra.key.value).toBe(15_600);
    expect(detail(stepOf(steps, 'tfsa-refund'), 'tfsa-top-up')?.value).toBe(0);
  });

  it('puts the leftover into the TFSA when the goal needs less than the room', () => {
    const easy = build({
      goal: 'retire-early',
      surplusMonthly: 60_000,
      retireIncomeMonthly: 5_000,
    });
    const refund = stepOf(easy, 'tfsa-refund');
    const required = stepOf(easy, 'retire-target').key.value;
    expect(detail(refund, 'tfsa-top-up')?.value).toBe(3_833);
    expect(required).toBeLessThan(60_000);
  });

  it('goes to the Journey with the retirement age as the horizon', () => {
    const later = build({ goal: 'retire-early', retireAge: 62, surplusMonthly: 5_000 });
    const refund = stepOf(later, 'tfsa-refund').open;
    expect(refund.calculator === 'journey' && refund.values.retirementAge).toBe(62);
  });
});

describe('buildPlan: build a TFSA (R100 000, R2 000 a month, balanced)', () => {
  const steps = build({ goal: 'build-tfsa', tfsaTarget: 100_000, tfsaMonthly: 2_000 });

  it('lists the steps in order', () => {
    expect(ids(steps)).toEqual(['take-home', 'tfsa-build', 'budget-fit']);
  });

  it('reaches the target at the age and year of the first Journey row that meets it', () => {
    const step = stepOf(steps, 'tfsa-build');
    if (step.open.calculator !== 'journey') throw new Error('expected a Journey step');
    expect(step.open.values.tfsaTopUpMonthly).toBe(2_000);
    expect(step.open.values.contributionMonthly).toBe(0);
    expect(step.open.values.retirementAge).toBe(65);
    const direct = estimateJourney(
      { ...SALARY, ...step.open.values } as never,
      tables,
      rules.journey,
    );
    if (!direct.ok) throw new Error('journey failed');
    const row = direct.result.years.find((year) => year.tfsaBalance >= 100_000);
    if (!row) throw new Error('target not reached');
    expect(step.key).toMatchObject({ unit: 'age', value: row.age + 1 });
    expect(detail(step, 'tfsa-years-to-target')?.value).toBe(row.year);
    expect(detail(step, 'tfsa-monthly-cap')?.value).toBe(3_833);
    expect(normaliseSpaces(step.title)).toContain('R 2 000 a month into a TFSA to reach R 100 000');
  });

  it('caps a R5 000 answer at floor(46 000 / 12) = 3 833 and says why', () => {
    const capped = build({ goal: 'build-tfsa', tfsaMonthly: 5_000 });
    const step = stepOf(capped, 'tfsa-build');
    expect(step.open.calculator === 'journey' && step.open.values.tfsaTopUpMonthly).toBe(3_833);
    const notes = normaliseSpaces(step.notes.join(' '));
    expect(notes).toContain('R 46 000');
    expect(notes).toContain('40%');
  });

  it('notes an amount above the money available', () => {
    const over = build({ goal: 'build-tfsa', tfsaMonthly: 3_000, surplusMonthly: 1_000 });
    expect(stepOf(over, 'tfsa-build').notes.join(' ')).toContain('more than the');
  });

  it('falls back to the balance at the horizon when the target is out of reach', () => {
    const far = build({ goal: 'build-tfsa', tfsaTarget: 50_000_000, tfsaMonthly: 500 });
    const step = stepOf(far, 'tfsa-build');
    expect(step.key.unit).toBe('rand');
    expect(step.notes.join(' ')).toContain('not reached');
  });

  it('counts the TFSA balance as contributions already made', () => {
    const own = stepOf(build({ goal: 'build-tfsa', tfsaBalance: 30_000 }), 'tfsa-build');
    expect(own.open.calculator === 'journey' && own.open.values.tfsaBalance).toBe(30_000);
    expect(own.open.calculator === 'journey' && own.open.values.tfsaLifetimeUsed).toBe(30_000);
  });
});

describe('buildPlan: emergency fund (6 months, R2 000 a month)', () => {
  const steps = build({ goal: 'emergency-fund', emergencyMonths: 6, surplusMonthly: 2_000 });

  it('lists the steps in order', () => {
    expect(ids(steps)).toEqual(['take-home', 'emergency-fund']);
  });

  it('targets 6 x R12 570,94 = R75 425,64 and reaches it in 38 months', () => {
    const step = stepOf(steps, 'emergency-fund');
    expect(step.key.value).toBeCloseTo(75_425.64, 6);
    expect(detail(step, 'emergency-essentials')?.value).toBeCloseTo(12_570.94, 6);
    expect(detail(step, 'emergency-months-to-target')?.value).toBe(38);
    expect(detail(step, 'emergency-months')?.value).toBe(6);
  });

  it('sends the months, amount saved and monthly line to the Budget', () => {
    const withSaved = build({
      goal: 'emergency-fund',
      emergencyMonths: 6,
      emergencySaved: 1_000,
      surplusMonthly: 2_000,
    });
    expect(stepOf(withSaved, 'emergency-fund').open).toEqual({
      calculator: 'budget',
      values: {
        ...SALARY,
        otherDeductionsMonthly: 0,
        emergencyMonths: 6,
        emergencySaved: 1_000,
        emergencyMonthly: 2_000,
      },
    });
  });
});

describe('buildPlan: buy a home', () => {
  const steps = build({ goal: 'buy-home' });

  it('has exactly the take-home and home budget steps', () => {
    expect(ids(steps)).toEqual(['take-home', 'home-budget']);
  });

  it('shows the housing line of the example budget: 20% of take-home = R5 028,376', () => {
    const step = stepOf(steps, 'home-budget');
    expect(step.key.value).toBeCloseTo(5_028.376, 6);
    expect(step.key.unit).toBe('rand-month');
  });

  it('says the Toolbox has a home-loan calculator', () => {
    expect(stepOf(steps, 'home-budget').notes.join(' ')).toContain(
      'The Toolbox has a home-loan calculator',
    );
  });

  it('opens the Budget with the Salary figures and no other deductions', () => {
    expect(stepOf(steps, 'home-budget').open).toEqual({
      calculator: 'budget',
      values: { ...SALARY, otherDeductionsMonthly: 0 },
    });
  });
});

describe('buildPlan: no money to invest (surplusMonthly 0)', () => {
  it.each(['retire-early', 'pay-less-tax', 'emergency-fund'] as const)(
    '%s: free up money second, with no TFSA refund and no budget check',
    (goal) => {
      const steps = build({ goal, surplusMonthly: 0 });
      expect(steps[0].id).toBe('take-home');
      expect(steps[1].id).toBe('make-room');
      expect(ids(steps)).not.toContain('tfsa-refund');
      expect(ids(steps)).not.toContain('budget-fit');
      // 20% of 25 141.88, floored.
      expect(steps[1].key.value).toBe(5_028);
      expect(steps[1].title).toBe('Free up money to invest');
    },
  );

  it('retire early: still shows the target, funded 0%', () => {
    const steps = build({ goal: 'retire-early', surplusMonthly: 0 });
    expect(ids(steps)).toEqual(['take-home', 'make-room', 'retire-target']);
    expect(detail(stepOf(steps, 'retire-target'), 'retire-funded')?.value).toBe(0);
  });

  it('pay less tax: shows the full-deduction example', () => {
    const steps = build({ goal: 'pay-less-tax', surplusMonthly: 0 });
    expect(ids(steps)).toEqual(['take-home', 'make-room', 'ra-deduction']);
    expect(stepOf(steps, 'ra-deduction').key.value).toBe(25_740);
  });

  it('emergency fund: has no months to target and says nothing is going in', () => {
    const steps = build({ goal: 'emergency-fund', surplusMonthly: 0 });
    const step = stepOf(steps, 'emergency-fund');
    expect(detail(step, 'emergency-months-to-target')).toBeUndefined();
    expect(step.notes).toContain('Nothing is going in yet.');
  });

  it('build a TFSA: also asks to free up money first', () => {
    expect(ids(build({ goal: 'build-tfsa', surplusMonthly: 0 }))).toEqual([
      'take-home',
      'make-room',
      'tfsa-build',
      'budget-fit',
    ]);
  });

  it('buy a home: never asks for more money', () => {
    expect(ids(build({ goal: 'buy-home', surplusMonthly: 0 }))).toEqual([
      'take-home',
      'home-budget',
    ]);
  });

  it('uses the suggestion when the surplus is not given', () => {
    const steps = build({ goal: 'emergency-fund' });
    // R5 028 a month into the fund.
    expect(
      stepOf(steps, 'emergency-fund').open.calculator === 'budget' &&
        (stepOf(steps, 'emergency-fund').open as { values: { emergencyMonthly?: number } }).values
          .emergencyMonthly,
    ).toBe(5_028);
  });
});

describe('buildPlan: adaptive branching', () => {
  it('changes the step ids with the goal', () => {
    const lists = ALL_GOALS.map((goal) => ids(build({ goal, surplusMonthly: 5_000 })).join());
    expect(new Set(lists).size).toBe(ALL_GOALS.length);
  });

  it('changing the risk changes only the returns in the payloads', () => {
    const cautious = stepOf(
      build({ goal: 'retire-early', risk: 'cautious', surplusMonthly: 5_000 }),
      'retire-target',
    );
    const balanced = stepOf(
      build({ goal: 'retire-early', surplusMonthly: 5_000 }),
      'retire-target',
    );
    if (cautious.open.calculator !== 'retire' || balanced.open.calculator !== 'retire') {
      throw new Error('expected Retire steps');
    }
    expect(cautious.open.values).toEqual({
      ...balanced.open.values,
      returnPercent: 6.5,
      retirementReturnPercent: 6.5,
    });
    // A lower return needs a bigger monthly saving.
    expect(cautious.key.value).toBeGreaterThan(balanced.key.value);
  });

  it('keeps the same step ids whatever the risk', () => {
    const ofRisk = (risk: PlanAnswers['risk']) =>
      ids(build({ goal: 'pay-less-tax', risk, surplusMonthly: 10_000 }));
    expect(ofRisk('cautious')).toEqual(ofRisk('balanced'));
    expect(ofRisk('adventurous')).toEqual(ofRisk('balanced'));
  });

  it('a cautious risk ends with a smaller TFSA than a balanced one', () => {
    const finalOf = (risk: PlanAnswers['risk']) =>
      detail(
        stepOf(build({ goal: 'pay-less-tax', risk, surplusMonthly: 10_000 }), 'tfsa-refund'),
        'tfsa-final-balance',
      )?.value ?? 0;
    expect(finalOf('cautious')).toBeLessThan(finalOf('balanced'));
    expect(finalOf('adventurous')).toBeGreaterThan(finalOf('balanced'));
  });

  it('uses 5% growth and 0% inflation without published rates', () => {
    const step = stepOf(
      build({ goal: 'retire-early', surplusMonthly: 5_000 }, false),
      'retire-target',
    );
    expect(step.open.calculator === 'retire' && step.open.values).toMatchObject({
      inflationPercent: 0,
      returnPercent: 5,
      retirementReturnPercent: 3,
    });
  });
});

describe('buildPlan: failure paths and purity', () => {
  it('is empty without a goal', () => {
    expect(build({ goal: null })).toEqual([]);
  });

  it('is empty when the take-home is too high to work back', () => {
    expect(
      build({ goal: 'pay-less-tax', income: { basis: 'net', period: 'monthly', amount: 5e9 } }),
    ).toEqual([]);
  });

  it('leaves out the retirement steps when the retirement age is not after the current age', () => {
    expect(
      ids(build({ goal: 'retire-early', age: 60, retireAge: 55, surplusMonthly: 5_000 })),
    ).toEqual(['take-home']);
  });

  it.each(ALL_GOALS)('%s: every step opens the calculator it names, with no NaN', (goal) => {
    const steps = build({ goal, surplusMonthly: 4_000 });
    expect(steps.length).toBeGreaterThan(1);
    for (const step of steps) {
      expect(step.calculator).toBe(step.open.calculator);
      const numbers = [step.key, ...step.details].map((figure) => figure.value);
      for (const value of numbers) expect(Number.isFinite(value)).toBe(true);
      expect(`${step.title} ${step.why} ${step.notes.join(' ')}`).not.toMatch(/NaN|undefined/);
    }
  });

  it('gives the same plan twice and does not change the answers or the tables', () => {
    const answers = deepFreeze(answersOf({ goal: 'retire-early', surplusMonthly: 5_000 }));
    const first = buildPlan(answers, tables, rules, assumptions);
    const second = buildPlan(answers, tables, rules, assumptions);
    expect(second).toEqual(first);
    expect(answers).toEqual(answersOf({ goal: 'retire-early', surplusMonthly: 5_000 }));
  });
});

describe('planAssumptionNotes', () => {
  const notesFor = (patch: Partial<PlanAnswers>, withRates = true) => {
    const answers = answersOf(patch);
    return planAssumptionNotes(
      answers,
      planBasics(answers, tables),
      withRates ? assumptions : null,
    );
  };
  const text = (patch: Partial<PlanAnswers>, withRates = true) =>
    normaliseSpaces(
      notesFor(patch, withRates)
        .map((note) => note.text)
        .join(' | '),
    );

  it('is empty without a goal or a take-home figure', () => {
    expect(notesFor({ goal: null })).toEqual([]);
    const answers = answersOf({
      goal: 'buy-home',
      income: { basis: 'net', period: 'monthly', amount: 5e9 },
    });
    expect(planAssumptionNotes(answers, null, assumptions)).toEqual([]);
  });

  it('explains the growth in terms of CPI for goals that invest', () => {
    expect(text({ goal: 'pay-less-tax' })).toContain(
      'Balanced means CPI plus 5 percentage points (9,5% a year)',
    );
    expect(text({ goal: 'retire-early', risk: 'cautious' })).toContain('Cautious means CPI plus 2');
  });

  it('adds the retirement return for the retire goal only', () => {
    expect(text({ goal: 'retire-early' })).toContain('7,5% a year');
    expect(text({ goal: 'build-tfsa' })).not.toContain('Once retired');
  });

  it('mentions the Pay assumptions and the CPI', () => {
    const all = text({ goal: 'build-tfsa' });
    expect(all).toContain('no medical aid');
    expect(all).toContain('CPI rate (4,5%)');
  });

  it('says the rates are unavailable without them', () => {
    expect(text({ goal: 'build-tfsa' }, false)).toContain('unavailable');
  });

  it('adds the essentials assumption for the emergency fund and a home, not for a TFSA', () => {
    expect(text({ goal: 'emergency-fund' })).toContain('50% of your take-home pay');
    expect(text({ goal: 'buy-home' })).toContain('50% of your take-home pay');
    expect(text({ goal: 'build-tfsa' })).not.toContain('50% of your take-home pay');
  });

  it('adds the horizon for the tax and TFSA goals', () => {
    expect(text({ goal: 'pay-less-tax' })).toContain('looks ahead to age 55');
    expect(text({ goal: 'build-tfsa' })).toContain('looks ahead to age 65');
    expect(text({ goal: 'build-tfsa', age: 70 })).toContain('looks ahead to age 80');
  });

  it('adds the TFSA lifetime note only when a TFSA balance was entered', () => {
    expect(text({ goal: 'build-tfsa' })).not.toContain('contributions already made');
    expect(text({ goal: 'build-tfsa', tfsaBalance: 10_000 })).toContain(
      'contributions already made',
    );
  });
});
