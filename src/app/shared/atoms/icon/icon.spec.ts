import { TestBed } from '@angular/core/testing';

import { Icon, type IconName } from './icon';

describe('Icon', () => {
  function render(inputs: Record<string, string>) {
    const fixture = TestBed.createComponent(Icon);
    for (const [key, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(key, value);
    }
    return fixture;
  }

  it('is decorative by default', async () => {
    const fixture = render({ name: 'sun' });
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.getAttribute('aria-hidden')).toBe('true');
    expect(host.getAttribute('role')).toBeNull();
    expect(host.querySelectorAll('path').length).toBeGreaterThan(0);
  });

  it('draws at least one path for every icon name', async () => {
    // A Record forces a new IconName to be listed here, so no icon ships without a path.
    const names: Record<IconName, true> = {
      dashboard: true,
      pay: true,
      ra: true,
      retire: true,
      budget: true,
      journey: true,
      plan: true,
      toolbox: true,
      shield: true,
      home: true,
      unlock: true,
      scale: true,
      sun: true,
      moon: true,
      system: true,
      close: true,
      'arrow-right': true,
      info: true,
      warning: true,
      check: true,
      'chevron-down': true,
      download: true,
    };
    for (const name of Object.keys(names)) {
      const fixture = render({ name });
      await fixture.whenStable();
      const host = fixture.nativeElement as HTMLElement;
      expect(host.querySelectorAll('path').length, `icon "${name}"`).toBeGreaterThan(0);
    }
  });

  it('is exposed as an image when labelled', async () => {
    const fixture = render({ name: 'moon', label: 'Dark theme', size: 'lg' });
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.getAttribute('role')).toBe('img');
    expect(host.getAttribute('aria-label')).toBe('Dark theme');
    expect(host.getAttribute('aria-hidden')).toBeNull();
    expect(host.classList).toContain('rw-icon--lg');
  });
});
