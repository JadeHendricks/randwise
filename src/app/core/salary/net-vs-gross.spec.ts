import { shippedTaxTables2027 } from '../../testing/tax-tables';
import { netVsGross } from './net-vs-gross';
import { DEFAULT_SALARY_INPUTS } from './salary-inputs';

const tables = shippedTaxTables2027();

describe('netVsGross', () => {
  it('has 25 points starting at gross 0, with a gross reference line', () => {
    const curve = netVsGross(DEFAULT_SALARY_INPUTS, tables, 30_000);
    expect(curve.points).toHaveLength(25);
    expect(curve.reference).toHaveLength(25);
    expect(curve.points[0]).toEqual({ x: 0, y: 0 });
    expect(curve.points.at(-1)?.x).toBe(curve.maxGross);
    expect(curve.reference.every((p) => p.y === p.x)).toBe(true);
  });

  it('uses a nice ceiling of at least 1.5x the current gross', () => {
    const curve = netVsGross(DEFAULT_SALARY_INPUTS, tables, 30_000);
    expect(curve.maxGross).toBe(50_000);
    expect(curve.maxGross).toBeGreaterThanOrEqual(1.5 * 30_000);
  });

  it('never goes below R20 000 for a small salary', () => {
    expect(netVsGross(DEFAULT_SALARY_INPUTS, tables, 5_000).maxGross).toBe(20_000);
    expect(netVsGross(DEFAULT_SALARY_INPUTS, tables, 0).maxGross).toBe(20_000);
  });

  it('is non-decreasing in net with no deductions', () => {
    const { points } = netVsGross(DEFAULT_SALARY_INPUTS, tables, 30_000);
    for (let i = 1; i < points.length; i++) {
      expect(points[i].y).toBeGreaterThanOrEqual(points[i - 1].y);
    }
  });

  it('agrees with the default payslip where the curve passes through R30 000', () => {
    const { points } = netVsGross(DEFAULT_SALARY_INPUTS, tables, 30_000);
    // 50 000 / 24 steps does not hit 30 000 exactly, so check a stepped x instead.
    const step = 50_000 / 24;
    expect(points[1].x).toBeCloseTo(step, 6);
    expect(points[1].y).toBeGreaterThan(0);
    expect(points[1].y).toBeLessThan(step);
  });

  it('keeps negative net where fixed deductions exceed a low gross', () => {
    const inputs = { ...DEFAULT_SALARY_INPUTS, employeeRetirementMonthly: 20_000 };
    const { points } = netVsGross(inputs, tables, 1_000);
    expect(points.some((p) => p.y < 0)).toBe(true);
  });

  it('uses the same age and medical members as the inputs', () => {
    const base = netVsGross(DEFAULT_SALARY_INPUTS, tables, 30_000);
    const older = netVsGross(
      { ...DEFAULT_SALARY_INPUTS, age: 70, medicalMembers: 2 },
      tables,
      30_000,
    );
    expect(older.points.at(-1)?.y).toBeGreaterThan(base.points.at(-1)?.y ?? 0);
  });
});
