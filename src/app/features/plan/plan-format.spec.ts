import { DEFAULT_PLAN_ANSWERS, type PlanAnswers } from '../../core/plan/plan-answers';
import type { PlanBasics, PlanFigure, PlanUnit } from '../../core/plan/plan-builder';
import { normaliseSpaces } from '../../testing/text';
import {
  CALCULATOR_LABELS,
  GOAL_OPTIONS,
  QUESTION_COPY,
  answerRows,
  formatPlanFigure,
} from './plan-format';

const figure = (unit: PlanUnit, value: number): PlanFigure => ({ id: 'x', label: 'X', value, unit });
const text = (unit: PlanUnit, value: number) => normaliseSpaces(formatPlanFigure(figure(unit, value)));

describe('formatPlanFigure', () => {
  it('formats rand units in whole rands', () => {
    expect(text('rand', 75_425.64)).toBe('R 75 426');
    expect(text('rand-month', 8_250)).toBe('R 8 250 a month');
    expect(text('rand-year', 25_740)).toBe('R 25 740 a year');
  });

  it('formats a percent from 0..100', () => {
    expect(text('percent', 26)).toBe('26%');
    expect(text('percent', 0)).toBe('0%');
  });

  it('formats an age, years and months', () => {
    expect(text('age', 55)).toBe('Age 55');
    expect(text('years', 12)).toBe('12 years');
    expect(text('years', 1)).toBe('1 year');
    expect(text('months', 38)).toBe('38 months');
    expect(text('months', 1)).toBe('1 month');
  });
});

describe('CALCULATOR_LABELS', () => {
  it('names each calculator by its navigation heading', () => {
    expect(CALCULATOR_LABELS).toEqual({
      pay: 'Open in Pay',
      ra: 'Open in Retirement annuity',
      retire: 'Open in Retire at 55',
      budget: 'Open in Budget',
      journey: 'Open in Journey',
    });
  });
});

describe('question copy', () => {
  it('has a title and a lead for every question', () => {
    for (const copy of Object.values(QUESTION_COPY)) {
      expect(copy.title.length).toBeGreaterThan(0);
      expect(copy.lead.length).toBeGreaterThan(0);
    }
    expect(QUESTION_COPY.income.title).toBe('What do you earn?');
  });

  it('offers the five goals and says the home goal is information only', () => {
    expect(GOAL_OPTIONS.map((option) => option.value)).toEqual([
      'retire-early',
      'pay-less-tax',
      'build-tfsa',
      'emergency-fund',
      'buy-home',
    ]);
    expect(GOAL_OPTIONS[4].description).toContain('Information only');
  });
});

describe('answerRows', () => {
  const basics = { suggestedSurplus: 5_028 } as PlanBasics;
  const rows = (answers: Partial<PlanAnswers>, b: PlanBasics | null = basics) =>
    answerRows({ ...DEFAULT_PLAN_ANSWERS, ...answers }, b).map((row) => ({
      id: row.id,
      label: row.label,
      value: normaliseSpaces(row.value),
    }));

  it('lists the first three questions before a goal is chosen', () => {
    expect(rows({})).toEqual([
      { id: 'age', label: 'Age', value: '35' },
      { id: 'income', label: 'Income', value: 'R 30 000 gross a month' },
      { id: 'goal', label: 'Goal', value: 'Not chosen' },
    ]);
  });

  it('lists the retire goal answers in question order', () => {
    expect(
      rows({ goal: 'retire-early', surplusMonthly: 5_000, risk: 'cautious' }).map(
        (row) => `${row.id}: ${row.value}`,
      ),
    ).toEqual([
      'age: 35',
      'income: R 30 000 gross a month',
      'goal: Retire early',
      'retire-details: Retire at 55 on R 50 000 a month',
      'risk: Cautious',
      'money: R 5 000 a month',
    ]);
  });

  it('shows the suggestion when no amount was entered, and take-home cents', () => {
    const result = rows({
      goal: 'pay-less-tax',
      income: { basis: 'net', period: 'annual', amount: 301_702.56 },
    });
    expect(result.find((row) => row.id === 'income')?.value).toBe('R 301 702,56 take-home a year');
    expect(result.find((row) => row.id === 'money')?.value).toBe('R 5 028 a month (suggested)');
    expect(rows({ goal: 'pay-less-tax' }, null).find((row) => row.id === 'money')?.value).toBe(
      'Our suggestion',
    );
  });

  it('describes the TFSA and emergency answers', () => {
    expect(rows({ goal: 'build-tfsa' }).find((row) => row.id === 'tfsa-details')?.value).toBe(
      'R 100 000 target, R 1 000 a month',
    );
    expect(
      rows({ goal: 'emergency-fund', emergencyMonths: 6 }).find(
        (row) => row.id === 'emergency-details',
      )?.value,
    ).toBe('6 months of essentials');
  });
});
