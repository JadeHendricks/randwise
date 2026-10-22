import { TestBed } from '@angular/core/testing';

import { FakeMatchMedia, installFakeMatchMedia } from '../../../testing/fake-match-media';
import { ThemeToggle } from './theme-toggle';

describe('ThemeToggle', () => {
  let fake: FakeMatchMedia;

  beforeEach(() => {
    fake = installFakeMatchMedia();
  });

  afterEach(() => {
    fake.uninstall();
    document.documentElement.removeAttribute('data-theme');
  });

  it('offers light, dark and system as labelled radios in a themed group', async () => {
    const fixture = TestBed.createComponent(ThemeToggle);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('legend')?.textContent).toBe('Theme');
    const labels = Array.from(root.querySelectorAll('label')).map((l) => l.textContent?.trim());
    expect(labels).toEqual(['Light', 'Dark', 'System']);
    const radios = root.querySelectorAll<HTMLInputElement>('input[type=radio]');
    expect(radios.length).toBe(3);
    expect(radios[2].checked).toBe(true);
  });

  it('flips data-theme on <html> when a radio is chosen', async () => {
    const fixture = TestBed.createComponent(ThemeToggle);
    await fixture.whenStable();
    const radios = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLInputElement>(
      'input[type=radio]',
    );
    radios[1].click();
    await fixture.whenStable();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(radios[1].checked).toBe(true);

    radios[0].click();
    await fixture.whenStable();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });
});
