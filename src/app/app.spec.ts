import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { NAV_ITEMS } from './core/navigation/nav-items';
import { LIVE_REGION_SETTLE_MS } from './shared/atoms/live-region/live-region';
import { FakeMatchMedia, installFakeMatchMedia } from './testing/fake-match-media';
import { provideTestData } from './testing/tax-data-fixtures';
import { App } from './app';
import { routes } from './app.routes';

describe('App shell', () => {
  let fake: FakeMatchMedia;

  // A fixed day inside tax year 2026/27 keeps these specs independent of the real date.
  async function configure(today: string) {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter(routes),
        provideTestData({ today }),
        { provide: LIVE_REGION_SETTLE_MS, useValue: 0 },
      ],
    }).compileComponents();
  }

  beforeEach(() => {
    fake = installFakeMatchMedia({ reducedMotion: true });
  });

  afterEach(() => {
    fake.uninstall();
    document.documentElement.removeAttribute('data-theme');
  });

  const routeAnnouncement = (root: HTMLElement) =>
    root.querySelector('.rw-app-shell__content > rw-live-region p')?.textContent?.trim();

  async function setup(today = '2026-10-22') {
    await configure(today);
    const fixture = TestBed.createComponent(App);
    await TestBed.inject(Router).navigateByUrl('/');
    await fixture.whenStable();
    return { fixture, root: fixture.nativeElement as HTMLElement };
  }

  it('renders the header, nav, main and footer landmarks', async () => {
    const { root } = await setup();
    expect(root.querySelector('header')).not.toBeNull();
    expect(root.querySelector('nav[aria-label="Primary"]')).not.toBeNull();
    expect(root.querySelector('main#main-content')).not.toBeNull();
    expect(root.querySelector('footer')?.textContent).toContain(
      'Estimates only, not financial advice.',
    );
  });

  it('renders a nav link for every feature', async () => {
    const { root } = await setup();
    const labels = Array.from(root.querySelectorAll('nav a')).map((a) => a.textContent?.trim());
    expect(labels).toEqual(NAV_ITEMS.map((item) => item.label));
  });

  it('flips data-theme on <html> from the toggle', async () => {
    const { fixture, root } = await setup();
    const radios = root.querySelectorAll<HTMLInputElement>('rw-theme-toggle input[type=radio]');
    const [light, dark] = Array.from(radios);
    dark.click();
    await fixture.whenStable();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    light.click();
    await fixture.whenStable();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('moves focus to main from the skip link without leaving the route', async () => {
    const { fixture, root } = await setup();
    document.body.appendChild(root);
    const link = root.querySelector('.rw-skip-link') as HTMLAnchorElement;
    link.click();
    await fixture.whenStable();
    expect(document.activeElement).toBe(root.querySelector('main'));
    expect(TestBed.inject(Router).url).toBe('/');
    root.remove();
  });

  it('shows the data badge in the header and no banner when the data is current', async () => {
    const { root } = await setup();
    expect(root.querySelector('header rw-data-badge button')?.textContent).toContain('Tax year 2026/27');
    expect(root.querySelectorAll('.rw-data-banner__notice').length).toBe(0);
  });

  it('shows the stale banner between the header and main after the tax year ends', async () => {
    const { root } = await setup('2027-03-15');
    const notice = root.querySelector('rw-data-banner [role=status]') as HTMLElement;
    expect(notice.textContent).toContain('Tax year 2026/27 ended on 28 February 2027.');
    const banner = root.querySelector('rw-data-banner') as HTMLElement;
    expect(banner.previousElementSibling?.tagName).toBe('RW-APP-HEADER');
    expect(banner.nextElementSibling?.tagName).toBe('MAIN');
  });

  it('announces nothing when the app first loads', async () => {
    const { root } = await setup();
    expect(routeAnnouncement(root)).toBe('');
  });

  it('announces the new page politely after a route change without moving focus', async () => {
    const { fixture, root } = await setup();
    document.body.appendChild(root);
    const link = root.querySelector('.rw-skip-link') as HTMLAnchorElement;
    link.focus();
    await TestBed.inject(Router).navigateByUrl('/ra');
    await fixture.whenStable();
    expect(routeAnnouncement(root)).toBe('Retirement annuity page');
    expect(root.querySelector('.rw-app-shell__content > rw-live-region p')?.getAttribute('aria-live')).toBe(
      'polite',
    );
    expect(document.activeElement).toBe(link);
    await TestBed.inject(Router).navigateByUrl('/toolbox/home-loan');
    await fixture.whenStable();
    expect(routeAnnouncement(root)).toBe('Home loan page');
    root.remove();
  });

  it('updates the heading on navigation', async () => {
    const { fixture, root } = await setup();
    expect(root.querySelector('h1')?.textContent).toBe('Dashboard');
    await TestBed.inject(Router).navigateByUrl('/ra');
    await fixture.whenStable();
    expect(root.querySelector('h1')?.textContent).toBe('Retirement annuity');
  });
});
