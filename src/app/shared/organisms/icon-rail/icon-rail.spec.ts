import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { NAV_ITEMS } from '../../../core/navigation/nav-items';
import { IconRail } from './icon-rail';

@Component({ template: '' })
class Blank {}

describe('IconRail', () => {
  async function setup() {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(NAV_ITEMS.map((item) => ({ path: item.path, component: Blank }))),
      ],
    });
    const fixture = TestBed.createComponent(IconRail);
    await fixture.whenStable();
    return { fixture, root: fixture.nativeElement as HTMLElement };
  }

  it('renders a labelled primary nav with all eight links', async () => {
    const { root } = await setup();
    expect(root.querySelector('nav')?.getAttribute('aria-label')).toBe('Primary');
    const links = Array.from(root.querySelectorAll('a'));
    expect(links.map((a) => a.textContent?.trim())).toEqual(NAV_ITEMS.map((i) => i.label));
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '/',
      '/pay',
      '/ra',
      '/retire',
      '/budget',
      '/journey',
      '/plan',
      '/toolbox',
    ]);
  });

  it('lists the links in NAV_ITEMS order so the tab order matches the visual order', async () => {
    const { root } = await setup();
    const hrefs = Array.from(root.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(NAV_ITEMS.map((item) => (item.path === '' ? '/' : `/${item.path}`)));
  });

  it('centres the active link in the scrolling nav when the route changes', async () => {
    const { fixture, root } = await setup();
    const nav = root.querySelector('nav') as HTMLElement;
    nav.getBoundingClientRect = () => ({ left: 0, width: 300, top: 0, bottom: 72 }) as DOMRect;
    const journey = Array.from(root.querySelectorAll('a')).find((a) => a.textContent?.includes('Journey'))!;
    journey.getBoundingClientRect = () => ({ left: 500, width: 64, top: 4, bottom: 68 }) as DOMRect;
    nav.scrollLeft = 0;
    await TestBed.inject(Router).navigateByUrl('/journey');
    await fixture.whenStable();
    expect(root.querySelector('[aria-current="page"]')).toBe(journey);
    // The link centre (532) moves to the nav centre (150).
    expect(nav.scrollLeft).toBe(382);
  });

  // Element.scrollIntoView moves the browser's Tab starting point, so Tab after a load would skip
  // the skip link and the nav links before the active one.
  it('never calls scrollIntoView, so Tab still starts at the top of the page', async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    try {
      const { fixture } = await setup();
      await TestBed.inject(Router).navigateByUrl('/journey');
      await fixture.whenStable();
      expect(scrollIntoView).not.toHaveBeenCalled();
    } finally {
      delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    }
  });
  it('marks only the active link with aria-current', async () => {
    const { fixture, root } = await setup();
    await TestBed.inject(Router).navigateByUrl('/ra');
    await fixture.whenStable();
    const current = root.querySelectorAll('[aria-current="page"]');
    expect(current.length).toBe(1);
    expect(current[0].textContent).toContain('RA');
  });

  it('keeps the Toolbox lit on a tool route, and only the Toolbox', async () => {
    const { fixture, root } = await setup();
    // The tool routes are siblings of the nav routes, as in app.routes.ts.
    TestBed.inject(Router).resetConfig([
      ...NAV_ITEMS.map((item) => ({ path: item.path, component: Blank })),
      { path: 'toolbox/home-loan', component: Blank },
    ]);
    await TestBed.inject(Router).navigateByUrl('/toolbox/home-loan');
    await fixture.whenStable();
    const current = root.querySelectorAll('[aria-current="page"]');
    expect(current.length).toBe(1);
    expect(current[0].textContent).toContain('Toolbox');
  });

  it('lights the Dashboard only on the dashboard itself', async () => {
    const { fixture, root } = await setup();
    await TestBed.inject(Router).navigateByUrl('/pay');
    await fixture.whenStable();
    const current = root.querySelectorAll('[aria-current="page"]');
    expect(current.length).toBe(1);
    expect(current[0].textContent).toContain('Pay');
  });
});
