import type { NavItem } from './nav-items';

/**
 * The four Toolbox calculators. Single source for the landing tiles and the route checks. Each
 * path is a lazy sibling route under `toolbox/`, so the rail keeps the Toolbox lit on all of them.
 */
export const TOOLBOX_TOOLS: readonly NavItem[] = [
  {
    path: 'toolbox/emergency-fund',
    label: 'Emergency fund',
    heading: 'Emergency fund',
    description: 'See how long it takes to save three to six months of essentials.',
    icon: 'shield',
  },
  {
    path: 'toolbox/home-loan',
    label: 'Home loan',
    heading: 'Home loan',
    description: 'Find the bond your salary supports, or what a price costs each month.',
    icon: 'home',
  },
  {
    path: 'toolbox/two-pot-withdrawal',
    label: 'Two-pot withdrawal',
    heading: 'Two-pot withdrawal',
    description: 'See the tax and the lost growth if you take money from your savings pot.',
    icon: 'unlock',
  },
  {
    path: 'toolbox/tfsa-vs-taxable',
    label: 'TFSA vs taxable',
    heading: 'TFSA vs taxable account',
    description: 'Compare a tax-free savings account with an ordinary investment account.',
    icon: 'scale',
  },
];
