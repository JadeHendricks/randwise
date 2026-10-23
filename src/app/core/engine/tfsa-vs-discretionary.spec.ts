import taxYear2027 from '../../../assets/data/tax-years/2027.json';
import { deepFreeze } from '../../testing/tax-tables';
import { validateTaxYearFile } from '../data/tax-year.validator';
import { InvestmentTaxRules, toInvestmentTaxRules } from './investment-tax';
import {
  InvestmentComparisonInput,
  MAX_COMPARISON_YEARS,
  compareTfsaDiscretionary,
} from './tfsa-vs-discretionary';

/**
 * Goldens from plan.md section 3 (TD1..TD9). Shipped rules unless stated: interest exemption
 * 23 800 under 65 / 34 500 at 65+ and dividends WHT 20%
 * (https://www.sars.gov.za/tax-rates/income-tax/interest-and-dividends/), CGT exclusion 50 000 and
 * inclusion 40% (https://www.sars.gov.za/tax-rates/income-tax/capital-gains-tax-cgt/), TFSA
 * 46 000 a year and 500 000 lifetime
 * (https://www.sars.gov.za/types-of-tax/personal-income-tax/tax-free-investments/).
 * Timing: contributions at the start of each year, interest and dividends taxed yearly and paid
 * from the account, CGT once at the end with the exclusion used once.
 */
const shipped = validateTaxYearFile(taxYear2027, '2027.json');
if (!shipped.ok) throw new Error(`2027.json is invalid: ${shipped.errors.join('; ')}`);
const rules = toInvestmentTaxRules(shipped.value);

/** Spec-local round numbers so the 3-year path can be followed by hand (TD6, TD7). */
const roundRules: InvestmentTaxRules = {
  interestExemptionUnder65: 1_000,
  interestExemption65Plus: 1_500,
  cgtAnnualExclusion: 5_000,
  cgtInclusionRate: 0.4,
  dividendsWithholdingRate: 0.2,
  annualLimit: 46_000,
  lifetimeLimit: 500_000,
  penaltyRate: 0.4,
};

const base: InvestmentComparisonInput = {
  lumpSum: 46_000,
  yearlyContribution: 0,
  years: 1,
  annualReturn: 0.1,
  split: { interest: 0, dividends: 1, growth: 0 },
  marginalRate: 0.41,
  age: 40,
  tfsaLifetimeUsed: 0,
};

const compare = (patch: Partial<InvestmentComparisonInput>, with_ = rules) =>
  compareTfsaDiscretionary({ ...base, ...patch }, with_);

describe('compareTfsaDiscretionary', () => {
  it('caps the horizon at 50 years', () => {
    expect(MAX_COMPARISON_YEARS).toBe(50);
  });

  it('TD1: one year, dividends only, inside the cap', () => {
    const result = compare({});
    // dividends 46 000 × 0.1 = 4 600, WHT 920; value 46 000 + 4 600 − 920 = 49 680 = base cost, CGT 0
    expect(result.discretionary.endValue).toBeCloseTo(49_680, 6);
    expect(result.discretionary.tax).toEqual({
      interest: 0,
      dividends: expect.closeTo(920, 6),
      capitalGains: 0,
      total: expect.closeTo(920, 6),
    });
    // TFSA 46 000 × 1.1 = 50 600; advantage 920
    expect(result.tfsaScenario.endValue).toBeCloseTo(50_600, 6);
    expect(result.tfsaScenario.tfsaBalance).toBeCloseTo(50_600, 6);
    expect(result.tfsaScenario.overflowNetValue).toBe(0);
    expect(result.tfsaScenario.tax.total).toBe(0);
    expect(result.advantage).toBeCloseTo(920, 6);
    expect(result.taxSavedByTfsa).toBeCloseTo(920, 6);
    expect(result.overflowContributed).toBe(0);
    expect(result.tfsaContributed).toBe(46_000);
    expect(result.totalContributed).toBe(46_000);
    expect(result.capped).toBe(false);
    expect(result.lifetimeUsedAfter).toBe(46_000);
  });

  it('TD2: one year, mixed split, interest below the exemption', () => {
    const result = compare({ split: { interest: 0.4, dividends: 0.2, growth: 0.4 } });
    // return 4 600: interest 1 840 (< 23 800, tax 0), dividends 920 (WHT 184), growth 1 840;
    // value 46 000 + 4 600 − 184 = 50 416; base 46 000 + 1 840 + 920 − 184 = 48 576;
    // gain 1 840 < 50 000 exclusion, CGT 0
    expect(result.discretionary.endValue).toBeCloseTo(50_416, 6);
    expect(result.discretionary.tax.interest).toBe(0);
    expect(result.discretionary.tax.dividends).toBeCloseTo(184, 6);
    expect(result.discretionary.tax.capitalGains).toBe(0);
    // TFSA 50 600; advantage 184
    expect(result.tfsaScenario.endValue).toBeCloseTo(50_600, 6);
    expect(result.advantage).toBeCloseTo(184, 6);
  });

  it('TD3: one year, interest above the exemption, with overflow', () => {
    const input = { lumpSum: 1_000_000, split: { interest: 1, dividends: 0, growth: 0 } };
    const result = compare(input);
    // discretionary: interest 100 000, taxable 76 200, tax × 0.41 = 31 242;
    // value 1 000 000 + 100 000 − 31 242 = 1 068 758
    expect(result.discretionary.tax.interest).toBeCloseTo(31_242, 6);
    expect(result.discretionary.endValue).toBeCloseTo(1_068_758, 6);
    // TFSA 46 000 -> 50 600; overflow 954 000: interest 95 400, taxable 71 600, tax 29 356,
    // value 954 000 + 95 400 − 29 356 = 1 020 044; total 1 070 644
    expect(result.tfsaContributed).toBe(46_000);
    expect(result.overflowContributed).toBe(954_000);
    expect(result.tfsaScenario.tfsaBalance).toBeCloseTo(50_600, 6);
    expect(result.tfsaScenario.overflowNetValue).toBeCloseTo(1_020_044, 6);
    expect(result.tfsaScenario.tax.interest).toBeCloseTo(29_356, 6);
    expect(result.tfsaScenario.endValue).toBeCloseTo(1_070_644, 6);
    // advantage 1 070 644 − 1 068 758 = 1 886 (= 4 600 × 0.41); all of it is tax saved
    expect(result.advantage).toBeCloseTo(1_886, 6);
    expect(result.taxSavedByTfsa).toBeCloseTo(1_886, 6);
    expect(result.taxDragGrowth).toBeCloseTo(0, 6);
    expect(result.capped).toBe(true);
    expect(result.years[0].overAnnual).toBe(true);
    expect(result.years[0].overLifetime).toBe(true);
  });

  it('TD4: one year, CGT with the exclusion used once in each scenario', () => {
    const result = compare({ lumpSum: 1_000_000, split: { interest: 0, dividends: 0, growth: 1 } });
    // discretionary: value 1 100 000, gain 100 000, CGT 8 200, net 1 091 800
    expect(result.discretionary.tax.capitalGains).toBeCloseTo(8_200, 6);
    expect(result.discretionary.endValue).toBeCloseTo(1_091_800, 6);
    // TFSA 50 600; overflow 954 000 -> 1 049 400, gain 95 400, CGT 7 445.60, net 1 041 954.40;
    // total 1 092 554.40
    expect(result.tfsaScenario.tax.capitalGains).toBeCloseTo(7_445.6, 6);
    expect(result.tfsaScenario.overflowNetValue).toBeCloseTo(1_041_954.4, 6);
    expect(result.tfsaScenario.endValue).toBeCloseTo(1_092_554.4, 6);
    // advantage 754.40 (= 4 600 × 0.4 × 0.41)
    expect(result.advantage).toBeCloseTo(754.4, 6);
    expect(result.taxSavedByTfsa).toBeCloseTo(754.4, 6);
  });

  it('TD5: the 65+ interest exemption', () => {
    const result = compare({
      lumpSum: 1_000_000,
      split: { interest: 1, dividends: 0, growth: 0 },
      age: 65,
    });
    // discretionary: taxable 100 000 − 34 500 = 65 500, tax 26 855, value 1 073 145
    expect(result.discretionary.tax.interest).toBeCloseTo(26_855, 6);
    expect(result.discretionary.endValue).toBeCloseTo(1_073_145, 6);
    // overflow: taxable 95 400 − 34 500 = 60 900, tax 24 969, value 1 024 431; total 1 075 031
    expect(result.tfsaScenario.overflowNetValue).toBeCloseTo(1_024_431, 6);
    expect(result.tfsaScenario.endValue).toBeCloseTo(1_075_031, 6);
    expect(result.advantage).toBeCloseTo(1_886, 6);
  });

  it('TD6: three years through every code path (round-number rules)', () => {
    const result = compare(
      {
        lumpSum: 40_000,
        years: 3,
        split: { interest: 0.3, dividends: 0.2, growth: 0.5 },
        marginalRate: 0.4,
      },
      roundRules,
    );
    // Y1: return 4 000 = interest 1 200, dividends 800, growth 2 000; interest tax
    // (1 200 − 1 000) × 0.4 = 80; WHT 160; value 43 760; base 41 760
    // Y2: return 4 376 = 1 312.80 / 875.20 / 2 188; interest tax 125.12; WHT 175.04;
    // value 47 835.84; base 43 647.84
    // Y3: return 4 783.584 = 1 435.0752 / 956.7168 / 2 391.792; interest tax 174.03008;
    // WHT 191.34336; value 52 254.05056; base 45 674.25856
    // disposal: gain 6 579.792; net 1 579.792; included 631.9168; CGT 252.76672;
    // net 52 001.28384
    expect(result.years.map((year) => year.discretionaryValue)).toEqual([
      expect.closeTo(43_760, 6),
      expect.closeTo(47_835.84, 6),
      expect.closeTo(52_001.28384, 6),
    ]);
    expect(result.discretionary.endValue).toBeCloseTo(52_001.28384, 6);
    // TFSA 40 000 × 1.1^3 = 53 240; series 44 000, 48 400, 53 240
    expect(result.years.map((year) => year.tfsaScenarioValue)).toEqual([
      expect.closeTo(44_000, 6),
      expect.closeTo(48_400, 6),
      expect.closeTo(53_240, 6),
    ]);
    expect(result.advantage).toBeCloseTo(1_238.71616, 6);
    // interest 80 + 125.12 + 174.03008 = 379.15008; dividends 160 + 175.04 + 191.34336 = 526.38336;
    // CGT 252.76672; total 1 158.30016
    expect(result.discretionary.tax.interest).toBeCloseTo(379.15008, 6);
    expect(result.discretionary.tax.dividends).toBeCloseTo(526.38336, 6);
    expect(result.discretionary.tax.capitalGains).toBeCloseTo(252.76672, 6);
    expect(result.discretionary.tax.total).toBeCloseTo(1_158.30016, 6);
    expect(result.taxSavedByTfsa).toBeCloseTo(1_158.30016, 6);
    // drag 1 238.71616 − 1 158.30016 = 80.416 (growth forgone on tax already paid)
    expect(result.taxDragGrowth).toBeCloseTo(80.416, 6);
    // tax per year: 240, 300.16, 365.37344 + CGT 252.76672 = 618.14016 (CGT lands in the last year)
    expect(result.years.map((year) => year.discretionaryTax)).toEqual([
      expect.closeTo(240, 6),
      expect.closeTo(300.16, 6),
      expect.closeTo(618.14016, 6),
    ]);
    expect(result.years.map((year) => year.tfsaScenarioTax)).toEqual([0, 0, 0]);
    expect(result.years.map((year) => year.year)).toEqual([1, 2, 3]);
  });

  it('TD7: yearly contributions', () => {
    const result = compare(
      {
        lumpSum: 0,
        yearlyContribution: 10_000,
        years: 2,
        split: { interest: 0, dividends: 0, growth: 1 },
        marginalRate: 0.4,
      },
      { ...roundRules, cgtAnnualExclusion: 1_000 },
    );
    // discretionary: Y1 11 000 (base 10 000); Y2 (11 000 + 10 000) × 1.1 = 23 100 (base 20 000);
    // gain 3 100; net 2 100; included 840; CGT 336; net 22 764
    expect(result.years[0].discretionaryValue).toBeCloseTo(11_000, 6);
    expect(result.discretionary.tax.capitalGains).toBeCloseTo(336, 6);
    expect(result.discretionary.endValue).toBeCloseTo(22_764, 6);
    // TFSA: 11 000, then 21 000 × 1.1 = 23 100; advantage 336
    expect(result.years[0].tfsaScenarioValue).toBeCloseTo(11_000, 6);
    expect(result.tfsaScenario.endValue).toBeCloseTo(23_100, 6);
    expect(result.advantage).toBeCloseTo(336, 6);
    expect(result.years.map((year) => year.contribution)).toEqual([10_000, 10_000]);
    expect(result.totalContributed).toBe(20_000);
  });

  it('TD8: the lifetime cap sends the rest to a taxable account', () => {
    const result = compare({
      lumpSum: 0,
      yearlyContribution: 46_000,
      years: 2,
      annualReturn: 0,
      tfsaLifetimeUsed: 480_000,
    });
    // Y1: room 20 000 -> TFSA 20 000, overflow 26 000, over the lifetime, not the annual limit
    expect(result.years[0]).toMatchObject({
      year: 1,
      contribution: 46_000,
      tfsaIn: 20_000,
      overflow: 26_000,
      overAnnual: false,
      overLifetime: true,
    });
    // Y2: room 0 -> TFSA 0, overflow 46 000
    expect(result.years[1]).toMatchObject({
      year: 2,
      contribution: 46_000,
      tfsaIn: 0,
      overflow: 46_000,
      overLifetime: true,
    });
    expect(result.tfsaContributed).toBe(20_000);
    expect(result.overflowContributed).toBe(72_000);
    expect(result.lifetimeUsedAfter).toBe(500_000);
    expect(result.capped).toBe(true);
    // 0% return: 20 000 + 72 000 = 92 000 both ways; advantage 0
    expect(result.tfsaScenario.endValue).toBe(92_000);
    expect(result.discretionary.endValue).toBe(92_000);
    expect(result.advantage).toBe(0);
  });

  it('TD8: a R60 000 lump in one year fills the annual limit', () => {
    const result = compare({ lumpSum: 60_000 });
    // 46 000 in the TFSA, 14 000 overflow
    expect(result.years[0].tfsaIn).toBe(46_000);
    expect(result.years[0].overflow).toBe(14_000);
    expect(result.years[0].overAnnual).toBe(true);
    expect(result.years[0].overLifetime).toBe(false);
  });

  it('TD9: a zero return gives no advantage and zero contributions give zeros', () => {
    expect(compare({ annualReturn: 0 }).advantage).toBe(0);
    const empty = compare({ lumpSum: 0, yearlyContribution: 0, years: 5 });
    expect(empty.advantage).toBe(0);
    expect(empty.totalContributed).toBe(0);
    expect(empty.tfsaScenario.endValue).toBe(0);
    expect(empty.discretionary.endValue).toBe(0);
    expect(empty.discretionary.tax.total).toBe(0);
    expect(empty.capped).toBe(false);
    expect(empty.years).toHaveLength(5);
  });

  it('TD9: rejects bad input with RangeError', () => {
    const bad: Partial<InvestmentComparisonInput>[] = [
      { years: 0 },
      { years: 51 },
      { years: 1.5 },
      { split: { interest: 0.5, dividends: 0.5, growth: 0.1 } },
      { split: { interest: -0.1, dividends: 0.6, growth: 0.5 } },
      { lumpSum: -1 },
      { yearlyContribution: -1 },
      { yearlyContribution: Number.NaN },
      { tfsaLifetimeUsed: -1 },
      { marginalRate: -0.01 },
      { marginalRate: 1.01 },
      { annualReturn: -0.01 },
      { annualReturn: 1.01 },
      { age: 40.5 },
    ];
    for (const patch of bad) {
      expect(() => compare(patch), JSON.stringify(patch)).toThrow(RangeError);
    }
    expect(compare({ years: MAX_COMPARISON_YEARS }).years).toHaveLength(50);
    // within the 1e-9 tolerance
    expect(() => compare({ split: { interest: 0.1, dividends: 0.2, growth: 0.7 } })).not.toThrow();
  });

  it('TD9: does not mutate its inputs or rules', () => {
    const input = deepFreeze({ ...base, split: { ...base.split }, years: 3 });
    const frozenRules = deepFreeze({ ...rules });
    expect(() => compareTfsaDiscretionary(input, frozenRules)).not.toThrow();
    expect(input).toEqual({ ...base, years: 3 });
  });
});
