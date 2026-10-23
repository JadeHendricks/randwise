import type { TaxYearData } from '../data/tax-year.schema';
import { assertAmount, roundRand } from './money';

/**
 * Tax-free savings account (TFSA) limits: how much of a year's contribution fits under the annual
 * and lifetime limits, and the penalty on the rest. Rands, full precision, pure.
 */

/** The TFSA rules that live in the tax-year file but not in `TaxTables`. */
export interface TfsaRules {
  /** Rands that may go in per tax year. */
  readonly annualLimit: number;
  /** Rands that may go in over a lifetime (contributions, growth excluded). */
  readonly lifetimeLimit: number;
  /** Fraction charged on contributions above either limit. */
  readonly penaltyRate: number;
}

/**
 * Reads the TFSA limits from a tax-year file already accepted by `validateTaxYearFile`.
 * Why a separate function: `TaxTables` is pinned by tax-tables.spec (same reason as `toRaRules`).
 * Source: https://www.sars.gov.za/types-of-tax/personal-income-tax/tax-free-investments/
 */
export function toTfsaRules(file: TaxYearData): TfsaRules {
  const { annualLimit, lifetimeLimit, excessPenaltyRate } = file.tfsa.value;
  return { annualLimit, lifetimeLimit, penaltyRate: excessPenaltyRate };
}

export interface TfsaContributionInput {
  /** Rands wanted in this tax year. */
  readonly desired: number;
  /** Contributions already made in earlier years (growth excluded). */
  readonly lifetimeUsed: number;
}

export interface TfsaContribution {
  readonly desired: number;
  /** max(0, lifetimeLimit − lifetimeUsed). */
  readonly lifetimeRoom: number;
  /** min(annualLimit, lifetimeRoom): the most that can go in this year without a penalty. */
  readonly limit: number;
  /** min(desired, limit). */
  readonly allowed: number;
  /** desired − allowed. */
  readonly excess: number;
  /** excess × penaltyRate. */
  readonly penalty: number;
  /** True when desired is over the annual limit by at least a cent. */
  readonly overAnnual: boolean;
  /** True when desired is over the lifetime room by at least a cent. */
  readonly overLifetime: boolean;
}

/** How much of one tax year's TFSA contribution fits under the limits, and the penalty on the rest. */
export function tfsaContribution(input: TfsaContributionInput, rules: TfsaRules): TfsaContribution {
  const { desired, lifetimeUsed } = input;
  assertAmount('desired', desired);
  assertAmount('lifetimeUsed', lifetimeUsed);

  const lifetimeRoom = Math.max(0, rules.lifetimeLimit - lifetimeUsed);
  const limit = Math.min(rules.annualLimit, lifetimeRoom);
  const allowed = Math.min(desired, limit);
  const excess = desired - allowed;
  // Why: SARS charges 40% (normal tax) on contributions above the annual and the lifetime limits;
  // an unused annual limit is forfeited and growth is not a contribution. A rand over both limits
  // is charged once, so the penalty is on the excess over the binding (smaller) limit, which equals
  // the larger of the two excesses.
  // Source: https://www.sars.gov.za/types-of-tax/personal-income-tax/tax-free-investments/
  const penalty = excess * rules.penaltyRate;
  return {
    desired,
    lifetimeRoom,
    limit,
    allowed,
    excess,
    penalty,
    overAnnual: roundRand(desired - rules.annualLimit) > 0,
    overLifetime: roundRand(desired - lifetimeRoom) > 0,
  };
}
