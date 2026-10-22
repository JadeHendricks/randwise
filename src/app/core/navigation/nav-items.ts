import type { IconName } from '../../shared/atoms/icon/icon';

export interface NavItem {
  /** Route path without a leading slash; '' is the dashboard. */
  readonly path: string;
  /** Short label for the rail. */
  readonly label: string;
  /** Page heading shown in the header and on the page. */
  readonly heading: string;
  readonly description: string;
  readonly icon: IconName;
}

/** Single source for the rail, the route titles and the dashboard tiles. */
export const NAV_ITEMS: readonly NavItem[] = [
  {
    path: '',
    label: 'Dashboard',
    heading: 'Dashboard',
    description: 'Your money at a glance.',
    icon: 'dashboard',
  },
  {
    path: 'pay',
    label: 'Pay',
    heading: 'Pay',
    description: 'See what lands in your account after tax.',
    icon: 'pay',
  },
  {
    path: 'ra',
    label: 'RA',
    heading: 'Retirement annuity',
    description: 'Explore retirement annuity contributions.',
    icon: 'ra',
  },
  {
    path: 'retire',
    label: 'Retire at 55',
    heading: 'Retire at 55',
    description: 'Check what an early retirement could look like.',
    icon: 'retire',
  },
  {
    path: 'budget',
    label: 'Budget',
    heading: 'Budget',
    description: 'Plan where each rand goes every month.',
    icon: 'budget',
  },
  {
    path: 'journey',
    label: 'Journey',
    heading: 'Journey',
    description: 'Follow your progress step by step.',
    icon: 'journey',
  },
  {
    path: 'plan',
    label: 'Plan',
    heading: 'Plan',
    description: 'Pull your choices into one plan.',
    icon: 'plan',
  },
  {
    path: 'toolbox',
    label: 'Toolbox',
    heading: 'Toolbox',
    description: 'Handy calculators and references.',
    icon: 'toolbox',
  },
];

export function navItem(path: string): NavItem {
  const item = NAV_ITEMS.find((candidate) => candidate.path === path);
  if (!item) {
    throw new Error(`Unknown nav path: ${path}`);
  }
  return item;
}
