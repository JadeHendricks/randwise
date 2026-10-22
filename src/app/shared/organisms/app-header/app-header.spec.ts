import { TestBed } from '@angular/core/testing';

import { FakeMatchMedia, installFakeMatchMedia } from '../../../testing/fake-match-media';
import { AppHeader } from './app-header';

describe('AppHeader', () => {
  let fake: FakeMatchMedia;

  beforeEach(() => {
    fake = installFakeMatchMedia();
  });
  afterEach(() => fake.uninstall());

  it('shows the heading, an empty labelled badge region and the theme toggle', async () => {
    const fixture = TestBed.createComponent(AppHeader);
    fixture.componentRef.setInput('heading', 'Budget');
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('header')).not.toBeNull();
    expect(root.querySelector('h1')?.textContent).toBe('Budget');
    const badge = root.querySelector('[role=status]') as HTMLElement;
    expect(badge.getAttribute('aria-label')).toBe('Tax data status');
    expect(badge.textContent?.trim()).toBe('');
    expect(root.querySelector('rw-theme-toggle')).not.toBeNull();
  });
});
