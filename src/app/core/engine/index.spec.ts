import taxYear2027 from '../../../assets/data/tax-years/2027.json';
import { validateTaxYearFile } from '../data/tax-year.validator';
import {
  compareTfsaDiscretionary,
  grossFromNet,
  payslip,
  roundRand,
  toInvestmentTaxRules,
  toRaRules,
  toTaxTables,
  twoPotWithdrawal,
} from './index';

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

  it('runs a two-pot withdrawal and a TFSA comparison from the shipped file', () => {
    const result = validateTaxYearFile(taxYear2027, '2027.json');
    if (!result.ok) throw new Error(result.errors.join('; '));
    const withdrawal = twoPotWithdrawal(
      {
        withdrawal: 50_000,
        taxableIncome: 350_000,
        age: 40,
        yearsToRetirement: 20,
        realGrowth: 0.04,
        inflation: 0.05,
      },
      toTaxTables(result.value),
      toRaRules(result.value),
    );
    // plan.md TP1: 8 606 @26% + 5 239 @31% = 13 845
    expect(withdrawal.accepted && roundRand(withdrawal.tax)).toBe(13_845);

    const comparison = compareTfsaDiscretionary(
      {
        lumpSum: 46_000,
        yearlyContribution: 0,
        years: 1,
        annualReturn: 0.1,
        split: { interest: 0, dividends: 1, growth: 0 },
        marginalRate: 0.41,
        age: 40,
        tfsaLifetimeUsed: 0,
      },
      toInvestmentTaxRules(result.value),
    );
    // plan.md TD1: 4 600 dividends × 20% WHT = 920
    expect(roundRand(comparison.advantage)).toBe(920);
  });
});
