import { TestBed } from '@angular/core/testing';

import { FakeMatchMedia, installFakeMatchMedia } from '../../../testing/fake-match-media';
import { provideTestData } from '../../../testing/tax-data-fixtures';
import { AppHeader } from './app-header';

describe('AppHeader', () => {
  let fake: FakeMatchMedia;

  beforeEach(() => {
    fake = installFakeMatchMedia();
    TestBed.configureTestingModule({ providers: provideTestData({ today: '2026-10-22' }) });
  });
  afterEach(() => fake.uninstall());

  it('shows the heading, the data badge and the theme toggle', async () => {
    const fixture = TestBed.createComponent(AppHeader);
    fixture.componentRef.setInput('heading', 'Budget');
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('header')).not.toBeNull();
    expect(root.querySelector('h1')?.textContent).toBe('Budget');
    const region = root.querySelector('.rw-app-header__data-badge') as HTMLElement;
    // Status semantics live in the banner; a role-less div must not carry an aria-label.
    expect(region.hasAttribute('role')).toBe(false);
    expect(region.hasAttribute('aria-label')).toBe(false);
    expect(region.querySelector('rw-data-badge button')?.textContent).toContain('Tax year 2026/27');
    expect(root.querySelector('rw-theme-toggle')).not.toBeNull();
  });
});
