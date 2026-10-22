import taxYear2027 from '../../../assets/data/tax-years/2027.json';
import { validateTaxYearFile } from '../data/tax-year.validator';
import { grossFromNet, payslip, roundRand, toTaxTables } from './index';

describe('engine public API', () => {
  it('runs the worked R30 000 payslip from the shipped file', () => {
    const result = validateTaxYearFile(taxYear2027, '2027.json');
    if (!result.ok) throw new Error(result.errors.join('; '));
    const tables = toTaxTables(result.value);
    const slip = payslip({ gross: 30_000, period: 'monthly', age: 35 }, tables);
    // (73 992 − 17 820) / 12 = 4 681; net 30 000 − 4 681 − 177.12
    expect(roundRand(slip.monthly.paye)).toBe(4_681);
    expect(roundRand(slip.monthly.netPay)).toBe(25_141.88);
    expect(roundRand(grossFromNet(25_141.88, { age: 35 }, tables).monthly.gross)).toBe(30_000);
  });
});
