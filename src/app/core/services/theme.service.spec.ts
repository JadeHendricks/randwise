import { TestBed } from '@angular/core/testing';

import { FakeMatchMedia, installFakeMatchMedia } from '../../testing/fake-match-media';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  let fake: FakeMatchMedia;
  const attr = () => document.documentElement.getAttribute('data-theme');

  afterEach(() => {
    fake.uninstall();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.style.colorScheme = '';
  });

  function create(dark = false) {
    fake = installFakeMatchMedia({ dark });
    return TestBed.inject(ThemeService);
  }

  it('defaults to system and follows the system setting', () => {
    const service = create(false);
    TestBed.tick();
    expect(service.preference()).toBe('system');
    expect(attr()).toBe('light');

    fake.setDark(true);
    TestBed.tick();
    expect(attr()).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
  });

  it('an explicit preference overrides the system', () => {
    const service = create(false);
    service.setPreference('dark');
    TestBed.tick();
    expect(attr()).toBe('dark');

    fake.setDark(false);
    TestBed.tick();
    expect(attr()).toBe('dark');
  });

  it('returns to following the system when set back to system', () => {
    const service = create(true);
    service.setPreference('light');
    TestBed.tick();
    expect(attr()).toBe('light');

    service.setPreference('system');
    TestBed.tick();
    expect(attr()).toBe('dark');
  });

  it('never writes to web storage', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const service = create(false);
    service.setPreference('dark');
    TestBed.tick();
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });
});
