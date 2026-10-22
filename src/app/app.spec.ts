import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { NAV_ITEMS } from './core/navigation/nav-items';
import { FakeMatchMedia, installFakeMatchMedia } from './testing/fake-match-media';
import { App } from './app';
import { routes } from './app.routes';

describe('App shell', () => {
  let fake: FakeMatchMedia;

  beforeEach(async () => {
    fake = installFakeMatchMedia({ reducedMotion: true });
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes)],
    }).compileComponents();
  });

  afterEach(() => {
    fake.uninstall();
    document.documentElement.removeAttribute('data-theme');
  });

  async function setup() {
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

  it('updates the heading on navigation', async () => {
    const { fixture, root } = await setup();
    expect(root.querySelector('h1')?.textContent).toBe('Dashboard');
    await TestBed.inject(Router).navigateByUrl('/ra');
    await fixture.whenStable();
    expect(root.querySelector('h1')?.textContent).toBe('Retirement annuity');
  });
});
