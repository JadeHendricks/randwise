import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { FakeMatchMedia, installFakeMatchMedia } from '../../testing/fake-match-media';
import { normaliseSpaces } from '../../testing/text';
import { DashboardPage } from './dashboard-page';

describe('DashboardPage', () => {
  let fake: FakeMatchMedia;

  beforeEach(() => {
    fake = installFakeMatchMedia({ reducedMotion: true });
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });
  afterEach(() => fake.uninstall());

  async function render() {
    const fixture = TestBed.createComponent(DashboardPage);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows the illustrative hero amount and call to action', async () => {
    const root = await render();
    const hero = root.querySelector('.dashboard__hero') as HTMLElement;
    expect(normaliseSpaces(hero.querySelector('.rw-money__figure')?.textContent)).toBe('R 0,00');
    expect(hero.textContent).toContain('Start with your salary');
    expect(hero.querySelector('a')?.getAttribute('href')).toBe('/pay');
  });

  it('links to every other lazy route', async () => {
    const root = await render();
    const hrefs = Array.from(root.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    for (const path of ['/ra', '/retire', '/budget', '/journey', '/plan', '/toolbox']) {
      expect(hrefs).toContain(path);
    }
  });

  it('renders no other currency values', async () => {
    const root = await render();
    // Only the hero figure counts; its screen-reader twin repeats the same value.
    const clone = root.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('.rw-visually-hidden').forEach((el) => el.remove());
    expect(normaliseSpaces(clone.textContent).match(/R\s?\d/g)?.length).toBe(1);
  });
});
