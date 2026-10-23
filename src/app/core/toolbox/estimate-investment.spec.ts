import taxYear2027 from '../../../assets/data/tax-years/2027.json';
import { validateTaxYearFile } from '../data/tax-year.validator';
import { compareTfsaDiscretionary, toInvestmentTaxRules } from '../engine';
import { estimateInvestment } from './estimate-investment';
import type { InvestmentInputs } from './toolbox-inputs';

const shipped = validateTaxYearFile(taxYear2027, '2027.json');
if (!shipped.ok) throw new Error(`2027.json is invalid: ${shipped.errors.join('; ')}`);
const rules = toInvestmentTaxRules(shipped.value);

// plan.md TD1: R46 000 for one year at 10%, all dividends, marginal 41%, age 40.
const TD1: InvestmentInputs = {
  lumpSum: 46_000,
  yearlyContribution: 0,
  years: 1,
  returnPercent: 10,
  interestPercent: 0,
  dividendPercent: 100,
  marginalRatePercent: 41,
  age: 40,
  tfsaLifetimeUsed: 0,
};

function ok(inputs: InvestmentInputs, ratesAvailable = true) {
  const estimate = estimateInvestment(inputs, rules, ratesAvailable);
  if (!estimate.ok) throw new Error(`failed: ${estimate.message}`);
  return estimate;
}

describe('estimateInvestment', () => {
  it('TD1: the TFSA beats the taxable account by the R920 dividend withholding tax', () => {
    const { result, warnings } = ok(TD1);
    expect(result.advantage).toBeCloseTo(920, 6);
    expect(warnings).toEqual([]);
  });

  it('turns percents into fractions and leaves growth as the rest of the split', () => {
    const inputs: InvestmentInputs = {
      lumpSum: 200_000,
      yearlyContribution: 12_000,
      years: 15,
      returnPercent: 9.5,
      interestPercent: 30,
      dividendPercent: 20,
      marginalRatePercent: 31,
      age: 44,
      tfsaLifetimeUsed: 50_000,
    };
    const direct = compareTfsaDiscretionary(
      {
        lumpSum: 200_000,
        yearlyContribution: 12_000,
        years: 15,
        annualReturn: 0.095,
        split: { interest: 0.3, dividends: 0.2, growth: 0.5 },
        marginalRate: 0.31,
        age: 44,
        tfsaLifetimeUsed: 50_000,
      },
      rules,
    );
    expect(ok(inputs).result).toEqual(direct);
  });

  it('warns when money does not fit under the TFSA limits', () => {
    // R60 000 against the R46 000 annual limit
    const { result, warnings } = ok({ ...TD1, lumpSum: 60_000 });
    expect(result.capped).toBe(true);
    expect(warnings).toEqual(['capped']);
  });

  it('warns when interest passes the exemption and is taxed', () => {
    // R1 000 000 at 10% all interest: R100 000 against the R23 800 exemption
    const { warnings } = ok({
      ...TD1,
      lumpSum: 1_000_000,
      interestPercent: 100,
      dividendPercent: 0,
    });
    expect(warnings).toContain('interest-above-exemption');
    expect(ok(TD1).warnings).not.toContain('interest-above-exemption');
  });

  it('warns that rates are unavailable only when rates are missing and the return is 0', () => {
    expect(ok({ ...TD1, returnPercent: 0 }, false).warnings).toContain('rates-unavailable');
    expect(ok({ ...TD1, returnPercent: 0 }, true).warnings).not.toContain('rates-unavailable');
    expect(ok(TD1, false).warnings).not.toContain('rates-unavailable');
  });

  it('returns a plain sentence for a figure the engine rejects', () => {
    for (const bad of [
      { years: 0 },
      { years: 80 },
      { returnPercent: -1 },
      { marginalRatePercent: 150 },
      { lumpSum: -1 },
    ]) {
      const estimate = estimateInvestment({ ...TD1, ...bad }, rules);
      expect(estimate.ok).toBe(false);
      if (!estimate.ok) {
        expect(estimate.message).toBe(
          'Those figures could not be worked out. Check the amounts and try again.',
        );
      }
    }
  });
});
