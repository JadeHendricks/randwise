import { Component } from '@angular/core';
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

  it('renders projected content between the description and the link', async () => {
    @Component({
      imports: [BentoTile],
      template: `<rw-bento-tile [item]="item"><p class="projected">Live figure</p></rw-bento-tile>`,
    })
    class Host {
      readonly item = navItem('ra');
    }
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const card = (fixture.nativeElement as HTMLElement).querySelector(
      '.rw-bento-tile__card',
    ) as HTMLElement;
    const classes = Array.from(card.children).map((c) => c.className);
    const text = classes.indexOf('rw-bento-tile__text');
    const projected = classes.indexOf('projected');
    const link = classes.findIndex((c) => c.includes('rw-bento-tile__link'));
    expect(text).toBeGreaterThan(-1);
    expect(projected).toBe(text + 1);
    expect(link).toBe(projected + 1);
  });

  it('adds the wide modifier for a span of 2', async () => {
    const fixture = TestBed.createComponent(BentoTile);
    fixture.componentRef.setInput('item', navItem('plan'));
    fixture.componentRef.setInput('span', 2);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).classList).toContain('rw-bento-tile--wide');
  });
});
