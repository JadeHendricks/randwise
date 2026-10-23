import taxYear2027 from '../../../assets/data/tax-years/2027.json';
import { shippedTaxTables2027 } from '../../testing/tax-tables';
import { validateTaxYearFile } from '../data/tax-year.validator';
import { toJourneyRules } from '../engine';
import { type JourneyEstimate, estimateJourney } from './estimate-journey';
import type { JourneyInputs } from './journey-inputs';

const tables = shippedTaxTables2027();
const shipped = validateTaxYearFile(taxYear2027, '2027.json');
if (!shipped.ok) throw new Error(`2027.json is invalid: ${shipped.errors.join('; ')}`);
const rules = toJourneyRules(shipped.value);

// The hand-derived three-year journey (engine J1): age 52 to 55, income and RA up 10% a year.
const J1: JourneyInputs = {
  grossMonthly: 30_000,
  age: 52,
  medicalMembers: 0,
  employeeRetirementMonthly: 0,
  employerRetirementMonthly: 0,
  retirementAge: 55,
  incomeEscalationPercent: 10,
  contributionMonthly: 2_000,
  escalationPercent: 10,
  startingBalance: 0,
  tfsaBalance: 0,
  tfsaLifetimeUsed: 0,
  tfsaTopUpMonthly: 1_000,
  returnPercent: 0,
  tfsaReturnPercent: 0,
  inflationPercent: 0,
  refundMode: 'refund',
  allowOverContribution: false,
};

function ok(inputs: JourneyInputs) {
  const estimate: JourneyEstimate = estimateJourney(inputs, tables, rules);
  if (!estimate.ok) throw new Error(`failed: ${estimate.message}`);
  return estimate;
}

describe('estimateJourney', () => {
  it('turns percents into fractions: the J1 journey ends on the hand-checked numbers', () => {
    const { result, warnings } = ok(J1);
    // Tax saved 6 240 + 7 509 + 9 002.40; TFSA 18 240 + 19 509 + 21 002.40; RA 24 000 + 26 400 + 29 040.
    expect(result.totals.taxSaved).toBeCloseTo(22_751.4, 6);
    expect(result.final.tfsaBalance).toBeCloseTo(58_751.4, 6);
    expect(result.final.raBalance).toBeCloseTo(79_440, 6);
    expect(warnings).toEqual([]);
  });

  it('warns of the penalty exposure when the TFSA limit is passed and over-contribution is off', () => {
    // 4 000 a month + 6 240 refund = 54 240 against 46 000: R8 240 over, R3 296 at 40%.
    const { warnings, result } = ok({
      ...J1,
      age: 35,
      retirementAge: 55,
      incomeEscalationPercent: 0,
      escalationPercent: 0,
      tfsaTopUpMonthly: 4_000,
    });
    expect(warnings).toContain('penalty-exposure');
    expect(warnings).toContain('unallocated-refund');
    expect(warnings).not.toContain('penalty-incurred');
    expect(result.totals.penaltyIncurred).toBe(false);
  });

  it('calls it a penalty incurred when over-contribution is allowed', () => {
    const { warnings } = ok({
      ...J1,
      age: 35,
      incomeEscalationPercent: 0,
      escalationPercent: 0,
      tfsaTopUpMonthly: 4_000,
      allowOverContribution: true,
    });
    expect(warnings).toContain('penalty-incurred');
    expect(warnings).not.toContain('penalty-exposure');
    expect(warnings).not.toContain('unallocated-refund');
  });

  it('warns when the RA is above the deduction room', () => {
    // R9 000 a month = R108 000 a year against R99 000 of room: R9 000 not deductible.
    const { warnings } = ok({
      ...J1,
      age: 34,
      retirementAge: 55,
      incomeEscalationPercent: 0,
      escalationPercent: 0,
      contributionMonthly: 9_000,
    });
    expect(warnings).toContain('headroom-clamp');
  });

  it('flags a retirement age below the earliest payout age and one already reached', () => {
    expect(ok({ ...J1, retirementAge: 50 }).warnings).toContain('below-earliest-age');
    expect(ok({ ...J1, age: 55, retirementAge: 55 }).warnings).toContain('past-retirement-age');
  });

  it('returns a plain sentence for a figure the engine rejects', () => {
    const estimate = estimateJourney({ ...J1, returnPercent: -50 }, tables, rules);
    expect(estimate.ok).toBe(false);
    if (!estimate.ok)
      expect(estimate.message).toBe(
        'Those figures could not be worked out. Check the amounts and try again.',
      );
  });
});
