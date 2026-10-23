import { type TaxTables, payslip, roundRand } from '../engine';
import { niceCeil } from '../../shared/charts/chart-geometry';
import type { SalaryInputs } from './salary-inputs';

export interface CurvePoint {
  readonly x: number;
  readonly y: number;
}

export interface NetVsGross {
  /** Monthly net pay at each monthly gross. Negative values are kept, not clamped. */
  readonly points: readonly CurvePoint[];
  /** The gross line (y = x) to read the gap from. */
  readonly reference: readonly CurvePoint[];
  /** The right-hand end of the x axis. */
  readonly maxGross: number;
}

const POINT_COUNT = 25;
const MIN_CEILING = 20_000;

/**
 * Monthly net pay across a range of monthly gross salaries, holding age, medical aid and the
 * other monthly amounts from `inputs` fixed. The range runs from 0 to a nice round number at or
 * above 1.5x the current gross (and at least R20 000) so the current salary sits well inside it.
 */
export function netVsGross(
  inputs: SalaryInputs,
  tables: TaxTables,
  currentGrossMonthly: number,
): NetVsGross {
  const maxGross = niceCeil(Math.max(1.5 * currentGrossMonthly, MIN_CEILING));
  const points: CurvePoint[] = [];
  const reference: CurvePoint[] = [];
  for (let i = 0; i < POINT_COUNT; i++) {
    const x = (maxGross * i) / (POINT_COUNT - 1);
    const slip = payslip(
      {
        gross: x,
        period: 'monthly',
        age: inputs.age,
        medicalMembers: inputs.medicalMembers,
        employeeRetirementMonthly: inputs.employeeRetirementMonthly,
        employerRetirementMonthly: inputs.employerRetirementMonthly,
        otherDeductionsMonthly: inputs.otherDeductionsMonthly,
      },
      tables,
    );
    points.push({ x, y: roundRand(slip.monthly.netPay) });
    reference.push({ x, y: x });
  }
  return { points, reference, maxGross };
}
