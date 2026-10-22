import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { TODAY } from '../../core/data/data-source';
import { SalaryInputsStore } from '../../core/salary/salary-inputs.store';
import { FakeMatchMedia, installFakeMatchMedia } from '../../testing/fake-match-media';
import { normaliseSpaces } from '../../testing/text';
import { provideTestData } from '../../testing/tax-data-fixtures';
import { DashboardPage } from './dashboard-page';

const pinned = new Date(2026, 9, 22);

describe('DashboardPage', () => {
  let fake: FakeMatchMedia;

  beforeEach(() => {
    fake = installFakeMatchMedia({ reducedMotion: true });
    // Bundled data with only TODAY pinned: the test fixture has a fake UIF ceiling.
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: TODAY, useValue: () => new Date(pinned) }],
    });
  });
  afterEach(() => fake.uninstall());

  async function render() {
    const fixture = TestBed.createComponent(DashboardPage);
    await fixture.whenStable();
    return fixture;
  }

  function hero(root: HTMLElement) {
    return root.querySelector('.dashboard__hero') as HTMLElement;
  }

  it('shows the example take-home pay and links to the Pay page', async () => {
    const root = (await render()).nativeElement as HTMLElement;
    const card = hero(root);
    expect(normaliseSpaces(card.querySelector('.rw-money__figure')?.textContent)).toBe(
      'R 25 141,88',
    );
    expect(normaliseSpaces(card.querySelector('.dashboard__eyebrow')?.textContent)).toBe(
      'Example take-home pay',
    );
    const link = card.querySelector('a') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/pay');
    expect(normaliseSpaces(link.textContent)).toBe('Open the Pay page');
    const lead = normaliseSpaces(card.querySelector('.dashboard__lead')?.textContent);
    expect(lead).toContain('R30 000');
    expect(lead).toContain('Example only. Change it on the Pay page.');
  });

  it('follows the Pay page inputs', async () => {
    const fixture = await render();
    TestBed.inject(SalaryInputsStore).update({ age: 65 });
    await fixture.whenStable();
    const card = hero(fixture.nativeElement as HTMLElement);
    expect(normaliseSpaces(card.querySelector('.rw-money__figure')?.textContent)).toBe(
      'R 25 955,63',
    );
    expect(normaliseSpaces(card.querySelector('.dashboard__eyebrow')?.textContent)).toBe(
      'Your take-home pay',
    );
    expect(card.textContent).not.toContain('Example only');
  });

  it('draws the gross split as an accessible dot matrix', async () => {
    const root = (await render()).nativeElement as HTMLElement;
    const svg = hero(root).querySelector('svg[role="img"]') as SVGElement;
    expect(svg.getAttribute('aria-label')).toContain('Net pay');
    expect(hero(root).querySelector('.rw-dot-matrix .rw-visually-hidden table')).not.toBeNull();
  });

  it('keeps one figure and no currency in the other tiles', async () => {
    const root = (await render()).nativeElement as HTMLElement;
    expect(root.querySelectorAll('.rw-money__figure').length).toBe(1);
    const clone = root.cloneNode(true) as HTMLElement;
    clone.querySelector('.dashboard__hero')?.remove();
    expect(normaliseSpaces(clone.textContent)).not.toMatch(/R\s?\d/);
  });

  it('links to every other lazy route and keeps the privacy card', async () => {
    const root = (await render()).nativeElement as HTMLElement;
    const hrefs = Array.from(root.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    for (const path of ['/pay', '/ra', '/retire', '/budget', '/journey', '/plan', '/toolbox']) {
      expect(hrefs).toContain(path);
    }
    expect(root.querySelector('.dashboard__privacy')?.textContent).toContain('Nothing is saved');
  });
});

describe('DashboardPage without tax data', () => {
  let fake: FakeMatchMedia;

  beforeEach(() => {
    fake = installFakeMatchMedia({ reducedMotion: true });
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideTestData({ taxYears: [], today: pinned })],
    });
  });
  afterEach(() => fake.uninstall());

  it('shows text instead of a figure', async () => {
    const fixture = TestBed.createComponent(DashboardPage);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.rw-money__figure')).toBeNull();
    expect(root.querySelector('.rw-dot-matrix')).toBeNull();
    expect(root.querySelector('.dashboard__hero')?.textContent).toContain(
      'Tax data is unavailable',
    );
  });
});
