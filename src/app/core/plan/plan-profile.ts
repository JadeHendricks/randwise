import { MONTHS_PER_YEAR, roundRand } from '../engine';
import type { SalaryEstimate } from '../salary/estimate-salary';
import type { SalaryInputs } from '../salary/salary-inputs';

/** The figures every calculator can start from, read from the shared Salary situation. */
export interface PlanProfile {
  readonly age: number;
  /** Rands a month before tax, rounded to cents. */
  readonly grossMonthly: number;
  /** Take-home rands a month, or null when the Salary estimate is not available. */
  readonly netMonthly: number | null;
  readonly medicalMembers: number;
  readonly employeeRetirementMonthly: number;
  readonly employerRetirementMonthly: number;
  readonly otherDeductionsMonthly: number;
}

/** What a Salary to RA handoff carries. */
export type RaHandoffValues = Pick<
  PlanProfile,
  | 'grossMonthly'
  | 'age'
  | 'medicalMembers'
  | 'employeeRetirementMonthly'
  | 'employerRetirementMonthly'
>;

/**
 * The shared profile for the Salary inputs. The gross comes from the estimate so a take-home
 * entry is carried as the salary it works back to. Without a good estimate a gross entry is
 * still usable as typed; a take-home entry cannot be worked back, so it gives 0.
 */
export function profileFromSalary(
  inputs: SalaryInputs,
  estimate: SalaryEstimate | null,
): PlanProfile {
  const ok = estimate?.ok ? estimate : null;
  return {
    age: inputs.age,
    grossMonthly: ok ? roundRand(ok.payslip.monthly.gross) : fallbackGrossMonthly(inputs),
    netMonthly: ok ? roundRand(ok.payslip.monthly.netPay) : null,
    medicalMembers: inputs.medicalMembers,
    employeeRetirementMonthly: inputs.employeeRetirementMonthly,
    employerRetirementMonthly: inputs.employerRetirementMonthly,
    otherDeductionsMonthly: inputs.otherDeductionsMonthly,
  };
}

export function raHandoffFrom(profile: PlanProfile): RaHandoffValues {
  return {
    grossMonthly: profile.grossMonthly,
    age: profile.age,
    medicalMembers: profile.medicalMembers,
    employeeRetirementMonthly: profile.employeeRetirementMonthly,
    employerRetirementMonthly: profile.employerRetirementMonthly,
  };
}

function fallbackGrossMonthly(inputs: SalaryInputs): number {
  if (inputs.basis === 'net') return 0;
  return inputs.period === 'monthly' ? inputs.amount : roundRand(inputs.amount / MONTHS_PER_YEAR);
}
