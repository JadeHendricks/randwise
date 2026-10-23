import { Route } from '@angular/router';

import { NAV_ITEMS } from './core/navigation/nav-items';
import { TOOLBOX_TOOLS } from './core/navigation/toolbox-tools';
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

  it('has a lazy route for every Toolbox tool with matching heading and title', async () => {
    for (const tool of TOOLBOX_TOOLS) {
      const route = routes.find((candidate: Route) => candidate.path === tool.path);
      expect(route, `route for "${tool.path}"`).toBeDefined();
      expect(route?.data?.['heading']).toBe(tool.heading);
      expect(route?.title).toBe(`${tool.heading} · Randwise`);
      const component = await (route?.loadComponent as () => Promise<unknown>)();
      expect(component).toBeTruthy();
    }
  });

  it('puts the Toolbox tool routes before the fallback', () => {
    const fallback = routes.findIndex((route) => route.path === '**');
    for (const tool of TOOLBOX_TOOLS) {
      const index = routes.findIndex((route) => route.path === tool.path);
      expect(index, tool.path).toBeGreaterThanOrEqual(0);
      expect(index, tool.path).toBeLessThan(fallback);
    }
  });

  it('redirects unknown paths to the dashboard', () => {
    expect(routes.at(-1)).toMatchObject({ path: '**', redirectTo: '' });
  });
});
