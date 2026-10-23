import { TestBed } from '@angular/core/testing';

import { FakeMatchMedia, installFakeMatchMedia } from '../../../testing/fake-match-media';
import { normaliseSpaces } from '../../../testing/text';
import { Money } from './money';

describe('Money', () => {
  let fake: FakeMatchMedia;
  let frames: FrameRequestCallback[];

  beforeEach(() => {
    frames = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
  });

  afterEach(() => {
    fake.uninstall();
    vi.unstubAllGlobals();
  });

  // Angular's scheduler also uses rAF, so run every pending callback per frame.
  const flush = (now: number) => frames.splice(0).forEach((cb) => cb(now));

  function create(value: number, inputs: Record<string, unknown> = {}) {
    const fixture = TestBed.createComponent(Money);
    fixture.componentRef.setInput('value', value);
    for (const [key, val] of Object.entries(inputs)) {
      fixture.componentRef.setInput(key, val);
    }
    return fixture;
  }

  const figure = (el: HTMLElement) => normaliseSpaces(el.querySelector('.rw-money__figure')?.textContent);
  const spoken = (el: HTMLElement) => normaliseSpaces(el.querySelector('.rw-visually-hidden')?.textContent);

  it('formats zero and thousands in ZAR', async () => {
    fake = installFakeMatchMedia({ reducedMotion: true });
    const zero = create(0);
    await zero.whenStable();
    expect(figure(zero.nativeElement)).toBe('R 0,00');

    const big = create(1234.56);
    await big.whenStable();
    expect(figure(big.nativeElement)).toBe('R 1 234,56');
  });

  it('shows the final value immediately under reduced motion', async () => {
    fake = installFakeMatchMedia({ reducedMotion: true });
    const fixture = create(5000);
    await fixture.whenStable();
    expect(figure(fixture.nativeElement)).toBe('R 5 000,00');
  });

  it('counts up to the final value when motion is allowed', async () => {
    fake = installFakeMatchMedia();
    const fixture = create(1000);
    await fixture.whenStable();
    expect(figure(fixture.nativeElement)).toBe('R 0,00');
    // The accessible text is the final value from the first frame.
    expect(spoken(fixture.nativeElement)).toBe('R 1 000,00');

    flush(0);
    flush(300);
    await fixture.whenStable();
    const mid = figure(fixture.nativeElement);
    expect(mid).not.toBe('R 0,00');
    expect(mid).not.toBe('R 1 000,00');

    flush(700);
    await fixture.whenStable();
    expect(figure(fixture.nativeElement)).toBe('R 1 000,00');
  });

  it('skips the animation when animate is false', async () => {
    fake = installFakeMatchMedia();
    const fixture = create(250, { animate: false });
    await fixture.whenStable();
    expect(figure(fixture.nativeElement)).toBe('R 250,00');
  });

  it('applies the size modifier', async () => {
    fake = installFakeMatchMedia({ reducedMotion: true });
    const fixture = create(1, { size: 'hero' });
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).classList).toContain('rw-money--hero');
  });

  it('cancels the count-up and shows final value when preference changes to reduced motion mid-animation', async () => {
    fake = installFakeMatchMedia({ reducedMotion: false });
    const fixture = create(1000);
    await fixture.whenStable();
    expect(figure(fixture.nativeElement)).toBe('R 0,00');

    flush(0);
    flush(300);
    await fixture.whenStable();
    const mid = figure(fixture.nativeElement);
    expect(mid).not.toBe('R 0,00');
    expect(mid).not.toBe('R 1 000,00');

    // Switch to reduced motion while animating
    fake.setReducedMotion(true);
    await fixture.whenStable();

    // Should show the final value immediately
    expect(figure(fixture.nativeElement)).toBe('R 1 000,00');
  });
});
