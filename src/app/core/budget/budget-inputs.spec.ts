import { defaultBudgetCategories, setCategoryAmount, summarise } from '../engine';
import { deepFreeze } from '../../testing/tax-tables';
import {
  BUDGET_SETTINGS_DEFAULT,
  exampleCategories,
  sanitiseBudgetSettings,
  withSentLines,
} from './budget-inputs';

const NET = 25_141.88;
const amountOf = (lines: readonly { id: string; amount: number }[], id: string) =>
  lines.find((line) => line.id === id)?.amount;

describe('BUDGET_SETTINGS_DEFAULT', () => {
  it('starts with a three-month fund, nothing saved and no TFSA contributions made', () => {
    expect(BUDGET_SETTINGS_DEFAULT).toEqual({
      emergencyMonths: 3,
      emergencySaved: 0,
      tfsaLifetimeUsed: 0,
    });
  });
});

describe('sanitiseBudgetSettings', () => {
  const current = BUDGET_SETTINGS_DEFAULT;

  it('applies valid values', () => {
    expect(
      sanitiseBudgetSettings(
        { emergencyMonths: 6, emergencySaved: 10_000, tfsaLifetimeUsed: 120_000 },
        current,
      ),
    ).toEqual({ emergencyMonths: 6, emergencySaved: 10_000, tfsaLifetimeUsed: 120_000 });
  });

  it('rounds and clamps the months to 1..12', () => {
    expect(sanitiseBudgetSettings({ emergencyMonths: 4.6 }, current).emergencyMonths).toBe(5);
    expect(sanitiseBudgetSettings({ emergencyMonths: 0 }, current).emergencyMonths).toBe(1);
    expect(sanitiseBudgetSettings({ emergencyMonths: 99 }, current).emergencyMonths).toBe(12);
  });

  it('keeps the current value for a negative or non-finite amount', () => {
    const base = { emergencyMonths: 3, emergencySaved: 500, tfsaLifetimeUsed: 700 };
    expect(
      sanitiseBudgetSettings(
        { emergencySaved: -1, tfsaLifetimeUsed: Number.NaN, emergencyMonths: Number.NaN },
        base,
      ),
    ).toEqual(base);
  });

  it('leaves fields that are not in the patch alone', () => {
    const base = { emergencyMonths: 4, emergencySaved: 500, tfsaLifetimeUsed: 700 };
    expect(sanitiseBudgetSettings({ emergencySaved: 900 }, base)).toEqual({
      ...base,
      emergencySaved: 900,
    });
  });
});

describe('exampleCategories', () => {
  it('is 50/30/20 of the net over the default lines (engine B3)', () => {
    const lines = exampleCategories(NET);
    // 25 141.88 x 0.5 = 12 570.94 for needs; housing takes 0.4 of it = 5 028.376.
    expect(amountOf(lines, 'housing')).toBeCloseTo(5_028.376, 6);
    // Wants is the only wants line: 25 141.88 x 0.3 = 7 542.564.
    expect(amountOf(lines, 'wants')).toBeCloseTo(7_542.564, 6);
    // Savings 5 028.376; the RA line takes 0.3 of it = 1 508.5128.
    expect(amountOf(lines, 'ra')).toBeCloseTo(1_508.5128, 6);
    const summary = summarise(lines, NET);
    expect(summary.status).toBe('balanced');
    expect(summary.groups.map((group) => Math.round(group.percent))).toEqual([50, 30, 20]);
  });

  it('is all zero for a net of 0', () => {
    expect(exampleCategories(0).every((line) => line.amount === 0)).toBe(true);
  });
});

describe('withSentLines', () => {
  it('sets the first RA and TFSA lines and leaves the rest', () => {
    const base = deepFreeze(exampleCategories(NET));
    const lines = withSentLines(base, { raMonthly: 3_000, tfsaMonthly: 2_000 });
    expect(amountOf(lines, 'ra')).toBe(3_000);
    expect(amountOf(lines, 'tfsa')).toBe(2_000);
    expect(amountOf(lines, 'housing')).toBe(amountOf(base, 'housing'));
  });

  it('sets only what was sent', () => {
    const base = exampleCategories(NET);
    const lines = withSentLines(base, { tfsaMonthly: 2_000 });
    expect(amountOf(lines, 'ra')).toBe(amountOf(base, 'ra'));
    expect(amountOf(lines, 'tfsa')).toBe(2_000);
  });

  it('returns a copy for null and for lines that do not exist', () => {
    const base = deepFreeze(setCategoryAmount(defaultBudgetCategories(), 'housing', 100));
    const copy = withSentLines(base, null);
    expect(copy).toEqual(base);
    expect(copy).not.toBe(base);
    const without = base.filter((line) => line.kind !== 'ra');
    expect(withSentLines(without, { raMonthly: 500 })).toEqual(without);
  });
});
