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
  { path: '**', redirectTo: '' },
];
