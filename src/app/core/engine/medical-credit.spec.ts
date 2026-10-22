import { fixtureTaxTables, shippedTaxTables2027 } from '../../testing/tax-tables';
import { medicalCredit, medicalCreditMonthly } from './medical-credit';

const tables = shippedTaxTables2027();

// s6A only. s6B (additional medical expenses credit) is assessed on filing and PAYE ignores it.
describe('medicalCreditMonthly / medicalCredit (s6A, 2026/27)', () => {
  it.each([
    [0, 0, 0], // no medical aid
    [1, 376, 4_512], // main member; 376 × 12
    [2, 752, 9_024], // 376 + 376; 752 × 12
    [3, 1_006, 12_072], // 376 + 376 + 254; 1 006 × 12
    [4, 1_260, 15_120], // 1 006 + 254; 1 260 × 12
    [5, 1_514, 18_168], // 1 260 + 254; 1 514 × 12
  ])('%d members: R%d a month, R%d a year', (members, monthly, annual) => {
    expect(medicalCreditMonthly(members, tables)).toBeCloseTo(monthly, 2);
    expect(medicalCredit(members, tables)).toBeCloseTo(annual, 2);
  });

  it('scales by the months of cover', () => {
    expect(medicalCredit(3, tables, 6)).toBeCloseTo(6_036, 2); // 1 006 × 6
    expect(medicalCredit(3, tables, 0)).toBe(0);
  });

  it('reads the credit amounts from the tables', () => {
    // Fixture values: 100 + 100 + 50
    expect(medicalCreditMonthly(3, fixtureTaxTables())).toBeCloseTo(250, 2);
  });

  it('rejects invalid member and month counts', () => {
    expect(() => medicalCreditMonthly(-1, tables)).toThrow(RangeError);
    expect(() => medicalCreditMonthly(1.5, tables)).toThrow(RangeError);
    expect(() => medicalCredit(1, tables, 13)).toThrow(RangeError);
    expect(() => medicalCredit(1, tables, 2.5)).toThrow(RangeError);
  });
});
