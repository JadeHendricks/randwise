import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { navItem } from '../../../core/navigation/nav-items';
import { FeaturePlaceholder } from './feature-placeholder';

describe('FeaturePlaceholder', () => {
  it('shows the item copy, a coming soon chip and a link home', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(FeaturePlaceholder);
    fixture.componentRef.setInput('item', navItem('retire'));
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('h2')?.textContent).toBe('Retire at 55');
    expect(root.textContent).toContain('Check what an early retirement could look like.');
    expect(root.querySelector('rw-chip')?.textContent).toContain('Coming soon');
    expect(root.querySelector('a')?.getAttribute('href')).toBe('/');
  });
});
