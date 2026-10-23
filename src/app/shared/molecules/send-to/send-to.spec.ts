import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import type { SendTarget, SendTargetId } from '../../../core/plan/handoff';
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
      providers: [
        provideRouter([
          { path: 'ra', component: BlankPage },
          { path: 'retire', component: BlankPage },
          { path: 'budget', component: BlankPage },
          { path: 'journey', component: BlankPage },
        ]),
      ],
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
      'Retire at 55',
      'Budget',
      'Journey',
    ]);
  });

  it('renders every shipped target as a working primary button, none as coming soon', async () => {
    const { root, buttons } = await render();
    expect(buttons()).toHaveLength(4);
    for (const live of buttons()) {
      expect(live.classList).toContain('rw-button--primary');
      expect(live.hasAttribute('aria-disabled')).toBe(false);
      expect(live.querySelector('rw-icon')).not.toBeNull();
    }
    expect(root.querySelector('.rw-send-to__soon')).toBeNull();
    expect(normaliseSpaces(root.textContent)).not.toContain('Coming soon');
  });

  it.each([
    ['ra', 0, '/ra'],
    ['retire', 1, '/retire'],
    ['budget', 2, '/budget'],
    ['journey', 3, '/journey'],
  ] as const)('emits "%s" and then navigates to %s', async (id, index, url) => {
    const { fixture, sent, buttons } = await render();
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigateByUrl');
    buttons()[index].click();
    expect(sent).toEqual([id]);
    expect(navigate).toHaveBeenCalledWith(url);
    await fixture.whenStable();
    expect(router.url).toBe(url);
  });

  describe('a target without a route (a capability kept for later)', () => {
    const targets: readonly SendTarget[] = [
      { id: 'ra', label: 'Retirement annuity', route: '/ra' },
      { id: 'budget', label: 'Budget', route: null },
    ];

    it('renders it as an aria-disabled ghost button marked Coming soon', async () => {
      const { buttons } = await render({ targets });
      expect(buttons().map((b) => normaliseSpaces(b.textContent))).toEqual([
        'Retirement annuity',
        'Budget Coming soon',
      ]);
      const soon = buttons()[1];
      expect(soon.getAttribute('aria-disabled')).toBe('true');
      expect(soon.classList).toContain('rw-button--ghost');
      expect(soon.classList).toContain('rw-send-to__target--soon');
      expect(soon.querySelector('.rw-send-to__soon')?.textContent).toBe('Coming soon');
    });

    it('neither emits nor navigates when it is chosen', async () => {
      const { sent, buttons } = await render({ targets });
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');
      buttons()[1].click();
      expect(sent).toEqual([]);
      expect(navigate).not.toHaveBeenCalled();
    });
  });

  it('leaves out the excluded target', async () => {
    const { buttons } = await render({ exclude: 'ra' });
    expect(buttons().map((b) => normaliseSpaces(b.textContent))).toEqual([
      'Retire at 55',
      'Budget',
      'Journey',
    ]);
  });
  it('accepts a custom heading', async () => {
    const { root } = await render({ heading: 'Next step' });
    expect(root.querySelector('.rw-send-to__heading')?.textContent).toBe('Next step');
  });
});
