import { TestBed } from '@angular/core/testing';

import { Icon } from './icon';

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
