import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { Button, ButtonSize, ButtonVariant } from './button';

@Component({
  imports: [Button],
  template: `
    <button rw-button [variant]="variant()" [size]="size()" [disabled]="disabled()" (click)="clicks.set(clicks() + 1)">
      Save
    </button>
    <a rw-button variant="secondary" href="/pay">Go</a>
  `,
})
class Host {
  readonly variant = signal<ButtonVariant>('primary');
  readonly size = signal<ButtonSize>('md');
  readonly disabled = signal(false);
  readonly clicks = signal(0);
}

describe('Button', () => {
  async function setup() {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    return {
      fixture,
      button: root.querySelector('button') as HTMLButtonElement,
      link: root.querySelector('a') as HTMLAnchorElement,
    };
  }

  it('defaults to a medium primary pill', async () => {
    const { button } = await setup();
    expect(button.classList).toContain('rw-button');
    expect(button.classList).toContain('rw-button--primary');
    expect(button.classList).toContain('rw-button--md');
  });

  it('applies variant and size modifiers', async () => {
    const { fixture, button } = await setup();
    fixture.componentInstance.variant.set('ghost');
    fixture.componentInstance.size.set('lg');
    await fixture.whenStable();
    expect(button.classList).toContain('rw-button--ghost');
    expect(button.classList).not.toContain('rw-button--primary');
    expect(button.classList).toContain('rw-button--lg');
  });

  it('works on links and keeps the href', async () => {
    const { link } = await setup();
    expect(link.classList).toContain('rw-button--secondary');
    expect(link.getAttribute('href')).toBe('/pay');
  });

  it('fires click on the native button but not when disabled', async () => {
    const { fixture, button } = await setup();
    button.click();
    expect(fixture.componentInstance.clicks()).toBe(1);
    fixture.componentInstance.disabled.set(true);
    await fixture.whenStable();
    button.click();
    expect(fixture.componentInstance.clicks()).toBe(1);
  });
});
