import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { navItem } from '../../../core/navigation/nav-items';
import { BentoTile } from './bento-tile';

describe('BentoTile', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter([])] }));

  it('renders the heading, description and a link to the route', async () => {
    const fixture = TestBed.createComponent(BentoTile);
    fixture.componentRef.setInput('item', navItem('budget'));
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('h2')?.textContent).toBe('Budget');
    expect(root.textContent).toContain('Plan where each rand goes every month.');
    const link = root.querySelector('a') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/budget');
    expect(link.textContent).toContain('Open Budget');
  });

  it('adds the wide modifier for a span of 2', async () => {
    const fixture = TestBed.createComponent(BentoTile);
    fixture.componentRef.setInput('item', navItem('plan'));
    fixture.componentRef.setInput('span', 2);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).classList).toContain('rw-bento-tile--wide');
  });
});
