import { ReportRow, rand, text } from '../core/pdf/report-model';

/** The salary profile the RA, Retire at 55 and Journey pages share (their `RaHandoffValues`). */
export interface ProfileInputs {
  readonly grossMonthly: number;
  readonly age: number;
  readonly medicalMembers: number;
  readonly employeeRetirementMonthly: number;
  readonly employerRetirementMonthly: number;
}

/** Input rows for the shared salary profile. Values are echoed as entered. */
export function profileRows(inputs: ProfileInputs): ReportRow[] {
  return [
    { label: 'Gross pay', value: rand(inputs.grossMonthly, 'a month') },
    { label: 'Age at the end of the tax year', value: text(String(inputs.age)) },
    { label: 'People on your medical aid', value: text(String(inputs.medicalMembers)) },
    {
      label: 'Retirement contributions you already make',
      value: rand(inputs.employeeRetirementMonthly, 'a month'),
    },
    {
      label: 'Employer retirement contributions',
      value: rand(inputs.employerRetirementMonthly, 'a month'),
    },
  ];
}
