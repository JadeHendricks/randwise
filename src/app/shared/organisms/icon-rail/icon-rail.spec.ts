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
