import { shippedTaxTables2027 } from '../../testing/tax-tables';
import { GrossFromNetInputs, grossFromNet } from './gross-from-net';
import { payslip } from './payslip';

const tables = shippedTaxTables2027();

describe('grossFromNet', () => {
  it.each([
    // Targets are the net pay of the worked payslips A, C and E.
    [25_141.88, { age: 35 }, 30_000],
    [22_921.88, { age: 35, employeeRetirementMonthly: 3_000 }, 30_000],
    [102_352.13, { age: 35, employeeRetirementMonthly: 40_000 }, 200_000],
  ])('finds the gross for a net of R%d', (target, inputs: GrossFromNetInputs, gross) => {
    const result = grossFromNet(target, inputs, tables);
    expect(Math.abs(result.monthly.gross - gross)).toBeLessThanOrEqual(0.01);
  });

  it('round-trips gross -> net -> gross within R0.01 across salaries, ages and setups', () => {
    // Bracket edges are upTo / 12 (20 425, 31 925, 44 183.33, 57 983.33, 73 916.67, 156 550),
    // 17 712 is the UIF ceiling and 8 250 the under-65 threshold (99 000 / 12).
    const grosses = [
      0, 1, 5_000, 8_250, 8_250.01, 10_000, 17_711.99, 17_712, 17_712.01, 20_425, 20_425.01, 30_000,
      31_925, 31_925.01, 44_183.33, 44_183.34, 57_983.33, 57_983.34, 73_916.67, 73_916.68, 156_550,
      156_550.01, 250_000,
    ];
    const ages = [35, 65, 75];
    const setups = [
      {},
      { medicalMembers: 1 },
      { medicalMembers: 3 },
      { employeeRetirementMonthly: 3_000 },
      {
        employerRetirementMonthly: 2_000,
        employeeRetirementMonthly: 1_000,
        otherDeductionsMonthly: 500,
      },
    ];
    let checked = 0;
    for (const gross of grosses) {
      for (const age of ages) {
        for (const setup of setups) {
          const inputs: GrossFromNetInputs = { age, ...setup };
          const net = payslip({ ...inputs, gross, period: 'monthly' }, tables).monthly.netPay;
          // A negative net (deductions above pay) is not a reachable target.
          if (net < 0) continue;
          const solved = grossFromNet(net, inputs, tables);
          expect(
            Math.abs(solved.monthly.gross - gross),
            `gross ${gross} age ${age}`,
          ).toBeLessThanOrEqual(0.01);
          expect(Math.abs(solved.monthly.netPay - net)).toBeLessThanOrEqual(0.01);
          checked++;
        }
      }
    }
    // 23 × 3 × 5 = 345 cases; only gross 0 and 1 with fixed deductions are skipped.
    expect(checked).toBeGreaterThan(300);
  });

  it('solves a zero target with no deductions to a zero gross', () => {
    expect(grossFromNet(0, { age: 35 }, tables).monthly.gross).toBeLessThanOrEqual(0.01);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1])(
    'rejects the impossible target %d',
    (target) => {
      expect(() => grossFromNet(target, { age: 35 }, tables)).toThrow(RangeError);
      expect(() => grossFromNet(target, { age: 35 }, tables)).toThrow(/target net/i);
    },
  );

  it('rejects a target that needs an unrealistically large gross', () => {
    expect(() => grossFromNet(1e12, { age: 35 }, tables)).toThrow(RangeError);
    expect(() => grossFromNet(1e12, { age: 35 }, tables)).toThrow(/too large/i);
  });

  it('rejects invalid other inputs', () => {
    expect(() => grossFromNet(10_000, { age: 1.5 }, tables)).toThrow(RangeError);
  });
});
