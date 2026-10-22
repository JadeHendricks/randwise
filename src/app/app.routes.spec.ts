import { Route } from '@angular/router';

import { NAV_ITEMS } from './core/navigation/nav-items';
import { routes } from './app.routes';

describe('routes', () => {
  it('has a lazy route for every nav item with matching heading', async () => {
    for (const item of NAV_ITEMS) {
      const route = routes.find((candidate: Route) => candidate.path === item.path);
      expect(route, `route for "${item.path}"`).toBeDefined();
      expect(route?.data?.['heading']).toBe(item.heading);
      expect(route?.title).toBe(`${item.heading} · Randwise`);
      const component = await (route?.loadComponent as () => Promise<unknown>)();
      expect(component).toBeTruthy();
    }
  });

  it('redirects unknown paths to the dashboard', () => {
    expect(routes.at(-1)).toMatchObject({ path: '**', redirectTo: '' });
  });
});
