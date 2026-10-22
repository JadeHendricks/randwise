import { formatShortDate } from './format-date';
import { Rates } from './rates.schema';

/** A default planning assumption derived from a published rate. Pure, no Angular. */
export interface Assumption {
  readonly id: 'inflation' | 'cashReturn' | 'growthReturn';
  readonly label: string;
  readonly valuePercent: number;
  /** Always starts with "Assumption:" so it is never mistaken for a published figure. */
  readonly description: string;
}

export interface Assumptions {
  readonly inflation: Assumption;
  readonly cashReturn: Assumption;
  readonly growthReturn: Assumption;
}

/** Percentage points added to CPI for the growth portfolio's long-run return. */
export const GROWTH_PREMIUM_PP = 5;

/** Avoids float noise such as 4.5 + 5 = 9.500000000000002. */
const round2 = (n: number) => Math.round(n * 100) / 100;

export function deriveAssumptions(rates: Rates): Assumptions {
  const { cpi, repo } = rates;
  return {
    inflation: {
      id: 'inflation',
      label: 'Inflation',
      valuePercent: cpi.valuePercent,
      description: `Assumption: inflation stays at the latest CPI rate (${cpi.valuePercent}%, as of ${formatShortDate(cpi.asOf)}).`,
    },
    cashReturn: {
      id: 'cashReturn',
      label: 'Cash return',
      valuePercent: repo.valuePercent,
      description: `Assumption: cash earns the repo rate (${repo.valuePercent}%, as of ${formatShortDate(repo.asOf)}).`,
    },
    growthReturn: {
      id: 'growthReturn',
      label: 'Growth portfolio return',
      valuePercent: round2(cpi.valuePercent + GROWTH_PREMIUM_PP),
      description: `Assumption: a growth portfolio returns CPI plus ${GROWTH_PREMIUM_PP} percentage points (CPI ${cpi.valuePercent}%, as of ${formatShortDate(cpi.asOf)}).`,
    },
  };
}
