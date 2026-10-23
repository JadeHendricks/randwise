import { navItem } from '../navigation/nav-items';
import type { JourneyPlanFields } from '../journey/journey-inputs';
import type { RaPlanFields } from '../ra/ra-inputs';
import type { RetirePlanFields } from '../retire/retire-inputs';
import type { RaHandoffValues } from './plan-profile';

/** Where a handoff came from. */
export type HandoffSource =
  | 'salary'
  | 'ra'
  | 'retire'
  | 'budget'
  | 'journey'
  | 'plan'
  | 'emergency-fund';

/** The word shown in the "From ..." chip. */
export const HANDOFF_SOURCE_LABELS: Record<HandoffSource, string> = {
  salary: 'Salary',
  ra: 'RA',
  retire: 'Retire at 55',
  budget: 'Budget',
  journey: 'Journey',
  plan: 'Plan',
  'emergency-fund': 'Emergency fund',
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
 * contributions already made. The Plan Builder and the Toolbox's Emergency fund tool also send the
 * emergency-fund choices: months to cover, rands already saved and the monthly line.
 */
export type BudgetHandoffPayload = RaHandoffValues & {
  readonly otherDeductionsMonthly?: number;
  readonly raMonthly?: number;
  readonly tfsaMonthly?: number;
  readonly tfsaLifetimeUsed?: number;
  readonly emergencyMonths?: number;
  readonly emergencySaved?: number;
  readonly emergencyMonthly?: number;
};

/**
 * What a handoff to the Journey carries: the Salary figures, and optionally journey plan values.
 * A Budget send also tells the Journey the take-home and emergency-fund line it came from, which the
 * page shows as a note.
 */
export type JourneyHandoffPayload = RaHandoffValues &
  Partial<JourneyPlanFields> & {
    readonly budgetNetMonthly?: number | null;
    readonly budgetEmergencyMonthly?: number;
  };

/** Values each target receives. */
export interface HandoffValuesByTarget {
  readonly ra: RaHandoffPayload;
  readonly retire: RetireHandoffPayload;
  readonly budget: BudgetHandoffPayload;
  readonly journey: JourneyHandoffPayload;
}

export type HandoffTarget = keyof HandoffValuesByTarget;

/** One send of figures to a calculator. Every send gets a new `id`, so a repeat send is a new event. */
export interface Handoff<T extends HandoffTarget = HandoffTarget> {
  readonly id: number;
  readonly source: HandoffSource;
  readonly target: T;
  readonly values: HandoffValuesByTarget[T];
}

/** Every place the "Send to" row can offer. */
export type SendTargetId = 'ra' | 'retire' | 'budget' | 'journey';

export interface SendTarget {
  readonly id: SendTargetId;
  readonly label: string;
  /** Null means coming soon: shown, but with nowhere to go yet. No shipped target uses this. */
  readonly route: string | null;
}

export const SEND_TARGETS: readonly SendTarget[] = [
  { id: 'ra', label: navItem('ra').heading, route: '/ra' },
  { id: 'retire', label: navItem('retire').heading, route: '/retire' },
  { id: 'budget', label: navItem('budget').heading, route: '/budget' },
  { id: 'journey', label: navItem('journey').heading, route: '/journey' },
];
