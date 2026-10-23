import { Routes } from '@angular/router';

// Every feature is lazy-loaded so the initial bundle stays small.
export const routes: Routes = [
  {
    path: '',
    title: 'Dashboard · Randwise',
    data: { heading: 'Dashboard' },
    loadComponent: () => import('./features/dashboard/dashboard-page').then((m) => m.DashboardPage),
  },
  {
    path: 'pay',
    title: 'Pay · Randwise',
    data: { heading: 'Pay' },
    loadComponent: () => import('./features/pay/pay-page').then((m) => m.PayPage),
  },
  {
    path: 'ra',
    title: 'Retirement annuity · Randwise',
    data: { heading: 'Retirement annuity' },
    loadComponent: () => import('./features/ra/ra-page').then((m) => m.RaPage),
  },
  {
    path: 'retire',
    title: 'Retire at 55 · Randwise',
    data: { heading: 'Retire at 55' },
    loadComponent: () => import('./features/retire/retire-page').then((m) => m.RetirePage),
  },
  {
    path: 'budget',
    title: 'Budget · Randwise',
    data: { heading: 'Budget' },
    loadComponent: () => import('./features/budget/budget-page').then((m) => m.BudgetPage),
  },
  {
    path: 'journey',
    title: 'Journey · Randwise',
    data: { heading: 'Journey' },
    loadComponent: () => import('./features/journey/journey-page').then((m) => m.JourneyPage),
  },
  {
    path: 'plan',
    title: 'Plan · Randwise',
    data: { heading: 'Plan' },
    loadComponent: () => import('./features/plan/plan-page').then((m) => m.PlanPage),
  },
  {
    path: 'toolbox',
    title: 'Toolbox · Randwise',
    data: { heading: 'Toolbox' },
    loadComponent: () => import('./features/toolbox/toolbox-page').then((m) => m.ToolboxPage),
  },
  // The Toolbox tools are siblings of the landing route (not children), so each is its own lazy
  // chunk and the landing keeps its plain loadComponent route.
  {
    path: 'toolbox/emergency-fund',
    title: 'Emergency fund · Randwise',
    data: { heading: 'Emergency fund' },
    loadComponent: () =>
      import('./features/toolbox/emergency-fund/emergency-fund-page').then(
        (m) => m.EmergencyFundPage,
      ),
  },
  {
    path: 'toolbox/home-loan',
    title: 'Home loan · Randwise',
    data: { heading: 'Home loan' },
    loadComponent: () =>
      import('./features/toolbox/home-loan/home-loan-page').then((m) => m.HomeLoanPage),
  },
  {
    path: 'toolbox/two-pot-withdrawal',
    title: 'Two-pot withdrawal · Randwise',
    data: { heading: 'Two-pot withdrawal' },
    loadComponent: () =>
      import('./features/toolbox/two-pot/two-pot-page').then((m) => m.TwoPotPage),
  },
  {
    path: 'toolbox/tfsa-vs-taxable',
    title: 'TFSA vs taxable account · Randwise',
    data: { heading: 'TFSA vs taxable account' },
    loadComponent: () =>
      import('./features/toolbox/tfsa-compare/tfsa-compare-page').then(
        (m) => m.TfsaComparePage,
      ),
  },
  { path: '**', redirectTo: '' },
];
