import { navItem } from '../navigation/nav-items';
import type { RaPlanFields } from '../ra/ra-inputs';
import type { RetirePlanFields } from '../retire/retire-inputs';
import type { RaHandoffValues } from './plan-profile';

/** Where a handoff came from. Later tasks add more sources. */
export type HandoffSource = 'salary' | 'ra' | 'retire';

/** The word shown in the "From ..." chip. */
export const HANDOFF_SOURCE_LABELS: Record<HandoffSource, string> = {
  salary: 'Salary',
  ra: 'RA',
  retire: 'Retire at 55',
};

/**
 * What a handoff to the RA calculator carries: the Salary figures, and optionally RA plan values
 * (Retire at 55 sends the contribution it solved for). A Salary send has no plan values.
 */
export type RaHandoffPayload = RaHandoffValues & Partial<RaPlanFields>;

/**
 * What a handoff to Retire at 55 carries: the Salary figures, and optionally retirement plan values
 * (the RA page sends its contribution, balance, returns and retirement age).
 */
export type RetireHandoffPayload = RaHandoffValues & Partial<RetirePlanFields>;

/**
 * What a handoff to the Budget carries: the Salary figures, the other deductions (a budget needs
 * them for take-home pay), and optionally the monthly RA and TFSA lines and the TFSA
 * contributions already made.
 */
export type BudgetHandoffPayload = RaHandoffValues & {
  readonly otherDeductionsMonthly?: number;
  readonly raMonthly?: number;
  readonly tfsaMonthly?: number;
  readonly tfsaLifetimeUsed?: number;
};

/** Values each target receives. The journey entry arrives with the Journey page. */
export interface HandoffValuesByTarget {
  readonly ra: RaHandoffPayload;
  readonly retire: RetireHandoffPayload;
  readonly budget: BudgetHandoffPayload;
}

export type HandoffTarget = keyof HandoffValuesByTarget;

/** One send of figures to a calculator. Every send gets a new `id`, so a repeat send is a new event. */
export interface Handoff<T extends HandoffTarget = HandoffTarget> {
  readonly id: number;
  readonly source: HandoffSource;
  readonly target: T;
  readonly values: HandoffValuesByTarget[T];
}

/** Every place the "Send to" row can offer, including ones that are not built yet. */
export type SendTargetId = 'ra' | 'retire' | 'budget' | 'journey';

export interface SendTarget {
  readonly id: SendTargetId;
  readonly label: string;
  /** Null means coming soon: shown, but with nowhere to go yet. */
  readonly route: string | null;
}

export const SEND_TARGETS: readonly SendTarget[] = [
  { id: 'ra', label: navItem('ra').heading, route: '/ra' },
  { id: 'retire', label: navItem('retire').heading, route: '/retire' },
  { id: 'budget', label: navItem('budget').heading, route: null },
  { id: 'journey', label: navItem('journey').heading, route: null },
];
