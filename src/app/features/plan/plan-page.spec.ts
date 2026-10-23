import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { TODAY } from '../../core/data/data-source';
import { PlanBuilderStore } from '../../core/plan/plan-builder.store';
import { FakeMatchMedia, installFakeMatchMedia } from '../../testing/fake-match-media';
import { normaliseSpaces } from '../../testing/text';
import { PlanPage } from './plan-page';

// Pinned so the bundled 2027 file is the year in use (the fixture UIF ceiling is fake).
const TODAY_PINNED = new Date(2026, 9, 22);

describe('PlanPage', () => {
  let fake: FakeMatchMedia;

  beforeEach(() => {
    fake = installFakeMatchMedia({ reducedMotion: true });
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: TODAY, useValue: () => new Date(TODAY_PINNED) }],
    });
  });
  afterEach(() => fake.uninstall());

  async function render() {
    const fixture = TestBed.createComponent(PlanPage);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const plan = TestBed.inject(PlanBuilderStore);
    const text = (el: Element | null | undefined) => normaliseSpaces(el?.textContent);
    const click = async (label: string) => {
      const target = Array.from(root.querySelectorAll('button')).find((b) => text(b) === label);
      if (!target) throw new Error(`no button "${label}"`);
      target.click();
      await fixture.whenStable();
    };
    return { fixture, root, plan, text, click };
  }

  it('starts with the wizard, not the summary', async () => {
    const { root, text } = await render();
    expect(root.querySelector('rw-plan-wizard')).not.toBeNull();
    expect(root.querySelector('rw-plan-summary-stub')).toBeNull();
    expect(text(root.querySelector('h2'))).toBe('How old are you?');
  });

  it('does not steal focus on first render', async () => {
    const { root } = await render();
    expect(root.contains(root.ownerDocument.activeElement)).toBe(false);
  });

  it('shows the summary after the last question and focuses its heading', async () => {
    const { click, plan, root, text } = await render();
    plan.update({ goal: 'buy-home' });
    await click('Next');
    await click('Next');
    await click('See my plan');

    expect(root.querySelector('rw-plan-wizard')).toBeNull();
    const heading = root.querySelector('h2') as HTMLElement;
    expect(text(heading)).toBe('Your plan');
    expect(root.ownerDocument.activeElement).toBe(heading);
    const titles = Array.from(root.querySelectorAll('li')).map((li) => text(li));
    expect(titles).toEqual(['Check your take-home pay', 'See what a home could cost you each month']);
  });

  it('goes back from the summary to the last question with the answers kept', async () => {
    const { click, fixture, plan, root, text } = await render();
    plan.update({ goal: 'buy-home', age: 44 });
    plan.finish();
    await fixture.whenStable();
    await click('Back to the questions');

    expect(root.querySelector('rw-plan-summary-stub')).toBeNull();
    const heading = root.querySelector('h2') as HTMLElement;
    expect(text(heading)).toBe('What do you want to do with your money?');
    expect(root.ownerDocument.activeElement).toBe(heading);
    expect(plan.answers().age).toBe(44);
  });

  it('shows the summary again, without moving focus, when the page is opened later', async () => {
    const first = await render();
    first.plan.update({ goal: 'buy-home' });
    first.plan.finish();
    first.fixture.destroy();

    const { root, text } = await render();
    expect(text(root.querySelector('h2'))).toBe('Your plan');
    expect(root.contains(root.ownerDocument.activeElement)).toBe(false);
  });
});
