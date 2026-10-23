import taxYear2027 from '../../../assets/data/tax-years/2027.json';
import { shippedTaxTables2027 } from '../../testing/tax-tables';
import { validateTaxYearFile } from '../data/tax-year.validator';
import { setCategoryAmount, toTfsaRules } from '../engine';
import { DEFAULT_SALARY_INPUTS } from '../salary/salary-inputs';
import { BUDGET_SETTINGS_DEFAULT, exampleCategories } from './budget-inputs';
import { type BudgetEstimateInput, estimateBudget } from './estimate-budget';

const tables = shippedTaxTables2027();
const shipped = validateTaxYearFile(taxYear2027, '2027.json');
if (!shipped.ok) throw new Error(`2027.json is invalid: ${shipped.errors.join('; ')}`);
const rules = toTfsaRules(shipped.value);

const EXAMPLE: BudgetEstimateInput = {
  income: DEFAULT_SALARY_INPUTS,
  categories: null,
  sentLines: null,
  settings: BUDGET_SETTINGS_DEFAULT,
};

function ok(input: BudgetEstimateInput) {
  const estimate = estimateBudget(input, tables, rules);
  if (!estimate.ok) throw new Error(`failed: ${estimate.message}`);
  return estimate;
}

describe('estimateBudget', () => {
  it('builds the example from the Salary net: R25 141,88 split 50/30/20', () => {
    const estimate = ok(EXAMPLE);
    // R30 000 gross, age 35: PAYE 4 681.00, UIF 177.12 -> net 25 141.88.
    expect(estimate.net).toBeCloseTo(25_141.88, 2);
    expect(estimate.gross).toBe(30_000);
    expect(estimate.summary.status).toBe('balanced');
    expect(estimate.summary.groups.map((group) => Math.round(group.percent))).toEqual([50, 30, 20]);
    expect(estimate.limits.warnings).toEqual([]);
    expect(estimate.salary.payslip.monthly.netPay).toBe(estimate.net);
  });

  it('measures the RA line against the headroom: 1 508,51 a month is well inside R99 000', () => {
    const { limits } = ok(EXAMPLE);
    expect(limits.ra.monthly).toBeCloseTo(1_508.5128, 4);
    expect(limits.ra.headroomAnnual).toBeCloseTo(99_000, 2);
    expect(limits.ra.over).toBe(false);
  });

  it('uses saved lines instead of the example', () => {
    const lines = setCategoryAmount(exampleCategories(25_141.88), 'housing', 9_000);
    const estimate = ok({ ...EXAMPLE, categories: lines });
    expect(estimate.categories.find((line) => line.id === 'housing')?.amount).toBe(9_000);
    expect(estimate.summary.status).toBe('over');
    expect(estimate.limits.warnings).toEqual(['over-allocated']);
  });

  it('applies the sent RA and TFSA amounts over the lines', () => {
    const estimate = ok({ ...EXAMPLE, sentLines: { raMonthly: 3_000, tfsaMonthly: 4_000 } });
    expect(estimate.limits.ra.monthly).toBe(3_000);
    expect(estimate.limits.tfsa.monthly).toBe(4_000);
    // 4 000 x 12 = 48 000 against the R46 000 limit: R2 000 over, 40% = R800.
    expect(estimate.limits.tfsa.contribution.excess).toBeCloseTo(2_000, 6);
    expect(estimate.limits.tfsa.contribution.penalty).toBeCloseTo(800, 6);
    expect(estimate.limits.warnings).toContain('tfsa-over-annual');
  });

  it('passes the TFSA contributions already made to the lifetime check', () => {
    const estimate = ok({
      ...EXAMPLE,
      sentLines: { tfsaMonthly: 3_000 },
      settings: { ...BUDGET_SETTINGS_DEFAULT, tfsaLifetimeUsed: 480_000 },
    });
    // 36 000 wanted, R20 000 of lifetime room left: R16 000 over, 40% = R6 400.
    expect(estimate.limits.tfsa.contribution.penalty).toBeCloseTo(6_400, 6);
    // Swapping the 1 508.51 TFSA line for 3 000 also pushes the total past the take-home.
    expect(estimate.limits.warnings).toEqual(['over-allocated', 'tfsa-over-lifetime']);
  });

  it('takes the payroll RA and other deductions out of the base', () => {
    const estimate = ok({
      ...EXAMPLE,
      income: {
        ...DEFAULT_SALARY_INPUTS,
        employeeRetirementMonthly: 3_000,
        employerRetirementMonthly: 2_000,
        otherDeductionsMonthly: 1_000,
      },
    });
    // Engine B10: net 22 921.88 with R3 000 employee and R2 000 employer contributions, less
    // R1 000 other deductions taken after tax.
    expect(estimate.net).toBeCloseTo(21_921.88, 2);
  });

  it('works a take-home entry back to the same person', () => {
    const estimate = ok({
      ...EXAMPLE,
      income: { ...DEFAULT_SALARY_INPUTS, basis: 'net', amount: 25_141.88 },
    });
    expect(estimate.gross).toBeCloseTo(30_000, 2);
    expect(estimate.net).toBeCloseTo(25_141.88, 2);
  });

  it('returns the Salary message for a take-home that is too high', () => {
    expect(
      estimateBudget(
        { ...EXAMPLE, income: { ...DEFAULT_SALARY_INPUTS, basis: 'net', amount: 5e9 } },
        tables,
        rules,
      ),
    ).toEqual({
      ok: false,
      message: 'That take-home amount is too high to work back to a salary. Try a smaller amount.',
    });
  });

  it('turns a figure the engine rejects into a plain sentence', () => {
    const estimate = estimateBudget(
      { ...EXAMPLE, settings: { ...BUDGET_SETTINGS_DEFAULT, emergencySaved: Number.NaN } },
      tables,
      rules,
    );
    expect(estimate.ok).toBe(false);
    if (!estimate.ok) expect(estimate.message).not.toMatch(/NaN|must be/);
  });
});
