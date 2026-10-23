import { TestBed } from '@angular/core/testing';

import { TODAY } from '../data/data-source';
import { SalaryInputsStore } from '../salary/salary-inputs.store';
import { provideTestData } from '../../testing/tax-data-fixtures';
import { normaliseSpaces } from '../../testing/text';
import { DEFAULT_PLAN_ANSWERS, MAX_PLAN_QUESTIONS, type PlanGoal } from './plan-answers';
import { PlanBuilderStore } from './plan-builder.store';
import type { PlanStep } from './plan-builder';
import { PlanContextStore } from './plan-context.store';

// Pinned so the bundled 2027 file is the year in use (the fixture UIF ceiling is fake).
const TODAY_PINNED = new Date(2026, 9, 22);

describe('PlanBuilderStore', () => {
  function create(withData = true) {
    TestBed.configureTestingModule({
      providers: [
        withData
          ? { provide: TODAY, useValue: () => new Date(TODAY_PINNED) }
          : provideTestData({ taxYears: [], today: TODAY_PINNED }),
      ],
    });
    return TestBed.inject(PlanBuilderStore);
  }

  const ids = (store: PlanBuilderStore) => store.steps().map((step) => step.id);
  const find = (store: PlanBuilderStore, id: string): PlanStep => {
    const step = store.steps().find((candidate) => candidate.id === id);
    if (!step) throw new Error(`no step ${id}`);
    return step;
  };

  it('starts on the first question with the default answers', () => {
    const store = create();
    expect(store.answers()).toEqual(DEFAULT_PLAN_ANSWERS);
    expect(store.position()).toBe(0);
    expect(store.started()).toBe(false);
    expect(store.reachedSummary()).toBe(false);
    expect(store.currentQuestion()).toBe('age');
    expect(store.onSummary()).toBe(false);
    expect(store.progressTotal()).toBe(MAX_PLAN_QUESTIONS);
    expect(store.steps()).toEqual([]);
  });

  it('sanitises an update and marks the plan as started', () => {
    const store = create();
    store.update({ age: 500, raBalance: -5 });
    expect(store.answers().age).toBe(100);
    expect(store.answers().raBalance).toBe(0);
    expect(store.started()).toBe(true);
  });

  describe('income', () => {
    it('keeps the same person when the basis changes', () => {
      const store = create();
      expect(store.basics()?.netMonthly).toBeCloseTo(25_141.88, 2);

      store.setIncomeBasis('net');
      expect(store.answers().income).toEqual({ basis: 'net', period: 'monthly', amount: 25_141.88 });
      expect(store.basics()?.grossMonthly).toBe(30_000);

      store.setIncomeBasis('gross');
      expect(store.answers().income).toEqual({ basis: 'gross', period: 'monthly', amount: 30_000 });
    });

    it('keeps the same person when the period changes', () => {
      const store = create();
      store.setIncomePeriod('annual');
      expect(store.answers().income).toEqual({ basis: 'gross', period: 'annual', amount: 360_000 });
      expect(store.basics()?.grossMonthly).toBe(30_000);

      store.setIncomePeriod('monthly');
      expect(store.answers().income.amount).toBe(30_000);
    });

    it('only changes the basis when the income cannot be worked out', () => {
      const store = create(false);
      store.update({ income: { basis: 'gross', period: 'monthly', amount: 30_000 } });
      store.setIncomeBasis('net');
      expect(store.answers().income).toEqual({ basis: 'net', period: 'monthly', amount: 30_000 });
    });
  });

  describe('questions', () => {
    it('adapts to the goal', () => {
      const store = create();
      const countFor = (goal: PlanGoal) => {
        store.update({ goal });
        return store.questions().length;
      };
      expect(countFor('retire-early')).toBe(6);
      expect(store.progressTotal()).toBe(6);
      expect(countFor('build-tfsa')).toBe(6);
      expect(countFor('pay-less-tax')).toBe(5);
      expect(countFor('emergency-fund')).toBe(5);
      expect(countFor('buy-home')).toBe(3);
      expect(store.progressTotal()).toBe(3);
    });

    it('blocks next on the goal question until a goal is chosen', () => {
      const store = create();
      expect(store.next()).toBe(true);
      expect(store.next()).toBe(true);
      expect(store.currentQuestion()).toBe('goal');
      expect(store.problem()).toBe('Choose a goal to continue.');
      expect(store.next()).toBe(false);
      expect(store.position()).toBe(2);

      store.update({ goal: 'pay-less-tax' });
      expect(store.problem()).toBeNull();
      expect(store.next()).toBe(true);
      expect(store.currentQuestion()).toBe('risk');
    });

    it('blocks next when the income is zero', () => {
      const store = create();
      store.next();
      store.update({ income: { basis: 'gross', period: 'monthly', amount: 0 } });
      expect(store.problem()).toBe('Enter your income to continue.');
      expect(store.next()).toBe(false);
    });
  });

  describe('moving', () => {
    function answerTax(store: PlanBuilderStore) {
      store.update({ goal: 'pay-less-tax' });
    }

    it('reaches the summary after the last question and remembers it', () => {
      const store = create();
      answerTax(store);
      for (let i = 0; i < 4; i++) expect(store.next()).toBe(true);
      expect(store.currentQuestion()).toBe('money');
      expect(store.onSummary()).toBe(false);
      expect(store.reachedSummary()).toBe(false);

      expect(store.next()).toBe(true);
      expect(store.onSummary()).toBe(true);
      expect(store.reachedSummary()).toBe(true);
      expect(store.currentQuestion()).toBe('money');
      expect(store.next()).toBe(false);
    });

    it('goes back from the summary to the last question and never below the first', () => {
      const store = create();
      answerTax(store);
      store.finish();
      expect(store.onSummary()).toBe(true);

      store.back();
      expect(store.onSummary()).toBe(false);
      expect(store.currentQuestion()).toBe('money');
      store.back();
      store.back();
      store.back();
      store.back();
      store.back();
      expect(store.position()).toBe(0);
    });

    it('goes to a named question only when it is asked', () => {
      const store = create();
      answerTax(store);
      store.goTo('risk');
      expect(store.currentQuestion()).toBe('risk');
      store.goTo('tfsa-details');
      expect(store.currentQuestion()).toBe('risk');
    });

    it('finish goes to the first question that still has a problem, else the summary', () => {
      const store = create();
      store.finish();
      expect(store.currentQuestion()).toBe('goal');
      expect(store.onSummary()).toBe(false);

      store.update({ goal: 'retire-early', retireAge: 30 });
      store.finish();
      expect(store.currentQuestion()).toBe('retire-details');

      store.update({ retireAge: 55 });
      store.finish();
      expect(store.onSummary()).toBe(true);
      expect(store.reachedSummary()).toBe(true);
    });

    it('restart clears the answers, the position and the flags', () => {
      const store = create();
      answerTax(store);
      store.finish();
      store.restart();
      expect(store.answers()).toEqual(DEFAULT_PLAN_ANSWERS);
      expect(store.answers().goal).toBeNull();
      expect(store.position()).toBe(0);
      expect(store.started()).toBe(false);
      expect(store.reachedSummary()).toBe(false);
      expect(store.onSummary()).toBe(false);
    });
  });

  describe('the plan', () => {
    it('recomputes when the answers change', () => {
      const store = create();
      store.update({ goal: 'buy-home' });
      expect(ids(store)).toEqual(['take-home', 'home-budget']);

      store.update({ goal: 'pay-less-tax', surplusMonthly: 10_000 });
      expect(ids(store)).toEqual(['take-home', 'ra-deduction', 'tfsa-refund', 'budget-fit']);
      expect(find(store, 'ra-deduction').key.value).toBeCloseTo(25_740, 2);
    });

    it('gives notes that describe the assumptions', () => {
      const store = create();
      store.update({ goal: 'pay-less-tax' });
      expect(store.assumptionNotes().map((note) => normaliseSpaces(note.text)).join(' ')).toContain(
        'CPI',
      );
    });

    it('is empty without tax data', () => {
      const store = create(false);
      store.update({ goal: 'pay-less-tax' });
      expect(store.rules()).toBeNull();
      expect(store.basics()).toBeNull();
      expect(store.steps()).toEqual([]);
      expect(store.assumptionNotes()).toEqual([]);
    });
  });

  describe('open', () => {
    function prepared(goal: 'pay-less-tax' | 'retire-early' | 'emergency-fund' | 'build-tfsa') {
      const store = create();
      store.update({ goal, surplusMonthly: 10_000, emergencyMonths: 6 });
      return store;
    }

    it('writes Pay into the Salary inputs and returns /pay', () => {
      const store = prepared('pay-less-tax');
      store.update({ age: 41, income: { basis: 'net', period: 'monthly', amount: 20_000 } });
      const route = store.open(find(store, 'take-home'));
      expect(route).toBe('/pay');
      expect(TestBed.inject(SalaryInputsStore).inputs()).toMatchObject({
        basis: 'net',
        period: 'monthly',
        amount: 20_000,
        age: 41,
      });
      expect(TestBed.inject(PlanContextStore).raFrom()).toBeNull();
    });

    it('sends the RA step as a Plan handoff', () => {
      const store = prepared('pay-less-tax');
      const context = TestBed.inject(PlanContextStore);
      expect(store.open(find(store, 'ra-deduction'))).toBe('/ra');
      expect(context.raFrom()).toBe('plan');
      expect(context.ra().contributionMonthly).toBe(8_250);
    });

    it('sends the Journey step', () => {
      const store = prepared('pay-less-tax');
      const context = TestBed.inject(PlanContextStore);
      expect(store.open(find(store, 'tfsa-refund'))).toBe('/journey');
      expect(context.journeyFrom()).toBe('plan');
    });

    it('sends the Retire step', () => {
      const store = prepared('retire-early');
      const context = TestBed.inject(PlanContextStore);
      expect(store.open(find(store, 'retire-target'))).toBe('/retire');
      expect(context.retireFrom()).toBe('plan');
    });

    it('sends the emergency step to the Budget with the months and monthly line', () => {
      const store = prepared('emergency-fund');
      const context = TestBed.inject(PlanContextStore);
      expect(store.open(find(store, 'emergency-fund'))).toBe('/budget');
      expect(context.budgetFrom()).toBe('plan');
      expect(context.budgetSettings().emergencyMonths).toBe(6);
    });
  });

  it('hands out a heading focus request once', () => {
    const store = create();
    expect(store.takeHeadingFocus()).toBe(false);
    store.requestHeadingFocus();
    expect(store.takeHeadingFocus()).toBe(true);
    expect(store.takeHeadingFocus()).toBe(false);
  });

  it('touches no storage', () => {
    const spies = [
      vi.spyOn(Storage.prototype, 'getItem'),
      vi.spyOn(Storage.prototype, 'setItem'),
      vi.spyOn(Storage.prototype, 'removeItem'),
      vi.spyOn(Storage.prototype, 'clear'),
    ];
    const store = create();
    store.update({ goal: 'retire-early' });
    store.finish();
    store.open(store.steps()[0]);
    store.restart();
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});
