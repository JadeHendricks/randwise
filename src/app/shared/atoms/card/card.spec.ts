import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { Card } from './card';

@Component({
  imports: [Card],
  template: `<rw-card variant="hero-yellow" padding="lg"><p>Inside</p></rw-card><rw-card><p>Glass</p></rw-card>`,
})
class Host {}

describe('Card', () => {
  it('applies variant and padding modifiers and projects content', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const [hero, glass] = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('rw-card'),
    );
    expect(hero.classList).toContain('rw-card');
    expect(hero.classList).toContain('rw-card--hero-yellow');
    expect(hero.classList).toContain('rw-card--pad-lg');
    expect(hero.textContent).toContain('Inside');
    expect(glass.classList).toContain('rw-card--glass');
    expect(glass.classList).toContain('rw-card--pad-md');
  });
});
