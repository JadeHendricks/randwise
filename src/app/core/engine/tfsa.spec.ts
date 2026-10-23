import taxYear2027 from '../../../assets/data/tax-years/2027.json';
import { makeTaxYear } from '../../testing/tax-data-fixtures';
import { deepFreeze } from '../../testing/tax-tables';
import { validateTaxYearFile } from '../data/tax-year.validator';
import { tfsaContribution, toTfsaRules } from './tfsa';

const shipped = validateTaxYearFile(taxYear2027, '2027.json');
if (!shipped.ok) throw new Error(`2027.json is invalid: ${shipped.errors.join('; ')}`);
const rules = toTfsaRules(shipped.value);

describe('toTfsaRules', () => {
  it('reads the shipped limits and penalty rate', () => {
    expect(rules).toEqual({ annualLimit: 46_000, lifetimeLimit: 500_000, penaltyRate: 0.4 });
  });

  it('reads the fixture values, not constants', () => {
    expect(toTfsaRules(makeTaxYear(2027))).toEqual({
      annualLimit: 10_000,
      lifetimeLimit: 100_000,
      penaltyRate: 0.4,
    });
  });
});

describe('tfsaContribution', () => {
  it('T1: the SARS example, R50 000 against the R46 000 annual limit', () => {
    // room 500 000; limit min(46 000, 500 000) = 46 000; excess 50 000 − 46 000 = 4 000;
    // penalty 4 000 × 0.4 = 1 600
    const result = tfsaContribution({ desired: 50_000, lifetimeUsed: 0 }, rules);
    expect(result).toEqual({
      desired: 50_000,
      lifetimeRoom: 500_000,
      limit: 46_000,
      allowed: 46_000,
      excess: 4_000,
      penalty: 1_600,
      overAnnual: true,
      overLifetime: false,
    });
  });

  it('T2: exactly the annual limit is not over', () => {
    // allowed 46 000 = desired; excess 0; penalty 0
    const result = tfsaContribution({ desired: 46_000, lifetimeUsed: 0 }, rules);
    expect(result.allowed).toBe(46_000);
    expect(result.excess).toBe(0);
    expect(result.penalty).toBe(0);
    expect(result.overAnnual).toBe(false);
    expect(result.overLifetime).toBe(false);
  });

  it('T3: the lifetime room binds before the annual limit', () => {
    // room 500 000 − 460 000 = 40 000; limit min(46 000, 40 000) = 40 000; excess 6 000;
    // penalty 6 000 × 0.4 = 2 400
    const result = tfsaContribution({ desired: 46_000, lifetimeUsed: 460_000 }, rules);
    expect(result.lifetimeRoom).toBe(40_000);
    expect(result.limit).toBe(40_000);
    expect(result.allowed).toBe(40_000);
    expect(result.excess).toBe(6_000);
    expect(result.penalty).toBeCloseTo(2_400, 6);
    expect(result.overAnnual).toBe(false);
    expect(result.overLifetime).toBe(true);
  });

  it('T4: over both limits is penalised once, on the larger excess', () => {
    // room 20 000; limit 20 000; excess 50 000 − 20 000 = 30 000 (not 4 000 + 30 000);
    // penalty 30 000 × 0.4 = 12 000
    const result = tfsaContribution({ desired: 50_000, lifetimeUsed: 480_000 }, rules);
    expect(result.lifetimeRoom).toBe(20_000);
    expect(result.limit).toBe(20_000);
    expect(result.allowed).toBe(20_000);
    expect(result.excess).toBe(30_000);
    expect(result.penalty).toBeCloseTo(12_000, 6);
    expect(result.overAnnual).toBe(true);
    expect(result.overLifetime).toBe(true);
  });

  it('T5: already past the lifetime limit, everything is excess', () => {
    // room max(0, 500 000 − 520 000) = 0; allowed 0; excess 10 000; penalty 4 000
    const result = tfsaContribution({ desired: 10_000, lifetimeUsed: 520_000 }, rules);
    expect(result.lifetimeRoom).toBe(0);
    expect(result.limit).toBe(0);
    expect(result.allowed).toBe(0);
    expect(result.excess).toBe(10_000);
    expect(result.penalty).toBeCloseTo(4_000, 6);
    expect(result.overAnnual).toBe(false);
    expect(result.overLifetime).toBe(true);
  });

  it('T6: the SARS 2029 row fills the lifetime limit exactly', () => {
    // room 500 000 − 467 000 = 33 000; allowed 33 000; excess 0; used + allowed = 500 000
    const result = tfsaContribution({ desired: 33_000, lifetimeUsed: 467_000 }, rules);
    expect(result.allowed).toBe(33_000);
    expect(result.excess).toBe(0);
    expect(result.penalty).toBe(0);
    expect(result.overLifetime).toBe(false);
    expect(467_000 + result.allowed).toBe(500_000);
  });

  it('rejects negative or non-finite inputs', () => {
    expect(() => tfsaContribution({ desired: -1, lifetimeUsed: 0 }, rules)).toThrow(RangeError);
    expect(() => tfsaContribution({ desired: Number.NaN, lifetimeUsed: 0 }, rules)).toThrow(
      RangeError,
    );
    expect(() => tfsaContribution({ desired: 0, lifetimeUsed: -1 }, rules)).toThrow(RangeError);
    expect(() => tfsaContribution({ desired: 0, lifetimeUsed: Number.NaN }, rules)).toThrow(
      RangeError,
    );
  });

  it('does not mutate its inputs', () => {
    const input = deepFreeze({ desired: 50_000, lifetimeUsed: 0 });
    const frozenRules = deepFreeze({ ...rules });
    expect(() => tfsaContribution(input, frozenRules)).not.toThrow();
    expect(input).toEqual({ desired: 50_000, lifetimeUsed: 0 });
  });
});
