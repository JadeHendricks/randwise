import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import type { SendTargetId } from '../../../core/plan/handoff';
import { FakeMatchMedia, installFakeMatchMedia } from '../../../testing/fake-match-media';
import { normaliseSpaces } from '../../../testing/text';
import { SendTo } from './send-to';

@Component({ template: '' })
class BlankPage {}

describe('SendTo', () => {
  let fake: FakeMatchMedia;
  beforeEach(() => {
    fake = installFakeMatchMedia({ reducedMotion: true });
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: 'ra', component: BlankPage }])],
    });
  });
  afterEach(() => fake.uninstall());

  async function render(inputs: Record<string, unknown> = {}) {
    const fixture = TestBed.createComponent(SendTo);
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    const sent: SendTargetId[] = [];
    fixture.componentInstance.sendTo.subscribe((id) => sent.push(id));
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const buttons = () =>
      Array.from(root.querySelectorAll<HTMLButtonElement>('.rw-send-to__target'));
    return { fixture, root, sent, buttons };
  }

  it('lists the four targets in order under a heading that labels the list', async () => {
    const { root, buttons } = await render();
    const heading = root.querySelector('h2.rw-send-to__heading');
    expect(heading?.textContent).toBe('Send these figures to');
    expect(root.querySelector('ul.rw-send-to__list')?.getAttribute('aria-labelledby')).toBe(
      heading?.id,
    );
    expect(buttons().map((b) => normaliseSpaces(b.textContent))).toEqual([
      'Retirement annuity',
      'Retire at 55 Coming soon',
      'Budget Coming soon',
      'Journey Coming soon',
    ]);
  });

  it('renders RA as a working primary button and the rest as aria-disabled ghost buttons', async () => {
    const { buttons } = await render();
    const [ra, ...soon] = buttons();
    expect(ra.classList).toContain('rw-button--primary');
    expect(ra.hasAttribute('aria-disabled')).toBe(false);
    expect(ra.querySelector('rw-icon')).not.toBeNull();
    expect(soon).toHaveLength(3);
    for (const button of soon) {
      expect(button.getAttribute('aria-disabled')).toBe('true');
      expect(button.classList).toContain('rw-button--ghost');
      expect(button.classList).toContain('rw-send-to__target--soon');
      expect(button.querySelector('.rw-send-to__soon')?.textContent).toBe('Coming soon');
    }
  });

  it('emits "ra" and then navigates to /ra when RA is chosen', async () => {
    const { fixture, sent, buttons } = await render();
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigateByUrl');
    buttons()[0].click();
    expect(sent).toEqual(['ra']);
    expect(navigate).toHaveBeenCalledWith('/ra');
    await fixture.whenStable();
    expect(router.url).toBe('/ra');
  });

  it('neither emits nor navigates for a coming-soon target', async () => {
    const { sent, buttons } = await render();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');
    for (const button of buttons().slice(1)) button.click();
    expect(sent).toEqual([]);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('leaves out the excluded target', async () => {
    const { buttons } = await render({ exclude: 'ra' });
    expect(buttons().map((b) => normaliseSpaces(b.textContent))).toEqual([
      'Retire at 55 Coming soon',
      'Budget Coming soon',
      'Journey Coming soon',
    ]);
  });

  it('accepts a custom heading', async () => {
    const { root } = await render({ heading: 'Next step' });
    expect(root.querySelector('.rw-send-to__heading')?.textContent).toBe('Next step');
  });
});
