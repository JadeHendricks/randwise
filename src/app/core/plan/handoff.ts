import { navItem } from '../navigation/nav-items';
import type { RaHandoffValues } from './plan-profile';

/** Where a handoff came from. Later tasks add more sources. */
export type HandoffSource = 'salary';

/** The word shown in the "From ..." chip. */
export const HANDOFF_SOURCE_LABELS: Record<HandoffSource, string> = { salary: 'Salary' };

/** Values each target receives. Later tasks add retire, budget and journey entries. */
export interface HandoffValuesByTarget {
  readonly ra: RaHandoffValues;
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
  { id: 'retire', label: navItem('retire').heading, route: null },
  { id: 'budget', label: navItem('budget').heading, route: null },
  { id: 'journey', label: navItem('journey').heading, route: null },
];
