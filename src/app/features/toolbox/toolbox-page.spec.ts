import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { routes } from '../../app.routes';
import { TOOLBOX_TOOLS } from '../../core/navigation/toolbox-tools';
import { normaliseSpaces } from '../../testing/text';
import { ToolboxPage } from './toolbox-page';

describe('ToolboxPage', () => {
  async function render() {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(ToolboxPage);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  const text = (el: Element | null | undefined) => normaliseSpaces(el?.textContent);

  it('shows four tiles linking to the four tools', async () => {
    const root = await render();
    const tiles = Array.from(root.querySelectorAll('rw-bento-tile'));
    expect(tiles.length).toBe(4);
    expect(tiles.map((tile) => tile.querySelector('a')?.getAttribute('href'))).toEqual([
      '/toolbox/emergency-fund',
      '/toolbox/home-loan',
      '/toolbox/two-pot-withdrawal',
      '/toolbox/tfsa-vs-taxable',
    ]);
    expect(tiles.map((tile) => text(tile.querySelector('h2')))).toEqual(
      TOOLBOX_TOOLS.map((tool) => tool.heading),
    );
  });

  it('links only to paths that are routes', async () => {
    const root = await render();
    const paths = new Set(routes.map((route) => route.path));
    const hrefs = Array.from(root.querySelectorAll('a[href]')).map((a) => a.getAttribute('href'));
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(paths.has((href ?? '').replace(/^\//, '')), `route for ${href}`).toBe(true);
    }
  });

  it('no longer shows the placeholder card and says nothing is saved', async () => {
    const root = await render();
    expect(root.querySelector('rw-feature-placeholder')).toBeNull();
    expect(text(root)).toContain('Nothing is saved');
    expect(text(root)).toContain('Estimates only');
  });
});
