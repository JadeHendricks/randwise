import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { TODAY } from '../../core/data/data-source';
import type { PlanAnswers } from '../../core/plan/plan-answers';
import { PlanBuilderStore } from '../../core/plan/plan-builder.store';
import { LIVE_REGION_SETTLE_MS } from '../../shared/atoms/live-region/live-region';
import { FakeMatchMedia, installFakeMatchMedia } from '../../testing/fake-match-media';
import { provideTestData } from '../../testing/tax-data-fixtures';
import { normaliseSpaces } from '../../testing/text';
import { PlanSummary } from './plan-summary';

// Pinned so the bundled 2027 file is the year in use (the fixture UIF ceiling is fake).
const TODAY_PINNED = new Date(2026, 9, 22);

const TAX_PROFILE: Partial<PlanAnswers> = { goal: 'pay-less-tax', surplusMonthly: 10_000 };

describe('PlanSummary', () => {
  let fake: FakeMatchMedia;

  beforeEach(() => {
    fake = installFakeMatchMedia({ reducedMotion: true });
  });
  afterEach(() => fake.uninstall());

  async function render(profile: Partial<PlanAnswers>, withData = true) {
    TestBed.configureTestingModule({
      providers: [
        { provide: LIVE_REGION_SETTLE_MS, useValue: 0 },
        provideRouter([]),
        withData
          ? { provide: TODAY, useValue: () => new Date(TODAY_PINNED) }
          : provideTestData({ taxYears: [], today: TODAY_PINNED }),
      ],
    });
    const plan = TestBed.inject(PlanBuilderStore);
    plan.update(profile);
    plan.finish();
    const fixture = TestBed.createComponent(PlanSummary);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const text = (el: Element | null | undefined) => normaliseSpaces(el?.textContent);
    const titles = () =>
      Array.from(root.querySelectorAll('.rw-plan-step__title')).map((el) => text(el));
    const keyOf = (stepId: string) =>
      text(
        root
          .querySelector(`#rw-plan-step-title-${stepId}`)
          ?.closest('.rw-plan-step')
          ?.querySelector('.rw-plan-step__key-value'),
      );
    return { fixture, root, plan, text, titles, keyOf };
  }

  it('lists the ordered steps with a title, why, key number and an Open button each', async () => {
    const { root, text, titles, keyOf } = await render(TAX_PROFILE);

    const heading = root.querySelector('h2') as HTMLElement;
    expect(text(heading)).toBe('Your plan');
    expect(heading.getAttribute('tabindex')).toBe('-1');

    const list = root.querySelector('ol.plan-summary__steps') as HTMLElement;
    expect(list.getAttribute('role')).toBe('list');
    expect(list.querySelectorAll(':scope > li')).toHaveLength(4);
    expect(titles()[0]).toBe('Check your take-home pay');
    expect(titles()[1]).toContain('into your RA');
    expect(titles()[2]).toContain('tax refund into a TFSA');
    expect(titles()[3]).toContain('fits your budget');

    expect(keyOf('take-home')).toBe('R 25 142 a month');
    expect(keyOf('ra-deduction')).toBe('R 25 740 a year');
    expect(keyOf('tfsa-refund')).toBe('R 25 740 a year');

    const cards = Array.from(root.querySelectorAll('.rw-plan-step'));
    expect(cards.every((card) => card.querySelector('.rw-plan-step__why')?.textContent?.trim())).toBe(
      true,
    );
    expect(
      Array.from(root.querySelectorAll('.rw-plan-step__action')).map((el) => text(el)),
    ).toEqual([
      'Open in Pay',
      'Open in Retirement annuity',
      'Open in Journey',
      'Open in Budget',
    ]);
  });

  it('gives a recap sentence naming the income and the goal', async () => {
    const { text, root } = await render(TAX_PROFILE);
    expect(text(root.querySelector('.plan-summary__lead'))).toBe(
      'You earn about R 30 000 a month before tax and want to pay less tax. These are your steps, in order.',
    );
  });

  it('shows the supporting numbers of a step', async () => {
    const { root, text } = await render(TAX_PROFILE);
    const ra = root.querySelector('#rw-plan-step-title-ra-deduction')?.closest('.rw-plan-step');
    const rows = Array.from(ra?.querySelectorAll('.rw-plan-step__detail') ?? []).map((el) =>
      text(el),
    );
    expect(rows.some((row) => row.includes('R 99 000 a year'))).toBe(true);
  });

  it('puts Free up money to invest second when nothing is left to invest', async () => {
    const { titles } = await render({ goal: 'pay-less-tax', surplusMonthly: 0 });
    expect(titles().slice(0, 3)).toEqual([
      'Check your take-home pay',
      'Free up money to invest',
      expect.stringContaining('into your RA'),
    ]);
  });

  it('says the Toolbox has a home calculator for a home goal', async () => {
    const { root, titles } = await render({ goal: 'buy-home' });
    expect(titles()).toEqual(['Check your take-home pay', 'See what a home could cost you each month']);
    expect(normaliseSpaces(root.textContent)).toContain(
      'The Toolbox has a home-loan calculator',
    );
  });

  it('lists the assumptions, including the CPI-based growth sentence', async () => {
    const { root, text } = await render(TAX_PROFILE);
    const notes = Array.from(root.querySelectorAll('.plan-summary__list > li')).map((el) => text(el));
    expect(root.querySelector('h3.plan-summary__subtitle')?.textContent?.trim()).toBe(
      'What this assumes',
    );
    expect(notes.some((note) => note.includes('CPI plus 5 percentage points'))).toBe(true);
  });

  describe('your answers', () => {
    it('lists each answer with a named Change button', async () => {
      const { root, text } = await render(TAX_PROFILE);
      const rows = Array.from(root.querySelectorAll('.plan-summary__answer')).map((row) => ({
        label: text(row.querySelector('dt')),
        change: row.querySelector('button')?.getAttribute('aria-label'),
      }));
      expect(rows).toEqual([
        { label: 'Age', change: 'Change Age' },
        { label: 'Income', change: 'Change Income' },
        { label: 'Goal', change: 'Change Goal' },
        { label: 'Risk comfort', change: 'Change Risk comfort' },
        { label: 'Money to invest', change: 'Change Money to invest' },
      ]);
      expect(text(root.querySelector('.plan-summary__answer'))).toContain('35');
    });

    it('goes to that question when Change is pressed', async () => {
      const { fixture, plan, root } = await render(TAX_PROFILE);
      expect(plan.onSummary()).toBe(true);
      root.querySelector<HTMLButtonElement>('button[aria-label="Change Income"]')?.click();
      await fixture.whenStable();
      expect(plan.onSummary()).toBe(false);
      expect(plan.currentQuestion()).toBe('income');
    });

    it('updates the plan reactively when an answer changes', async () => {
      const { fixture, plan, keyOf } = await render(TAX_PROFILE);
      expect(keyOf('budget-fit')).toBe('40%');
      plan.update({ surplusMonthly: 5_000 });
      await fixture.whenStable();
      expect(keyOf('budget-fit')).toBe('20%');
    });
  });

  describe('actions', () => {
    it('goes back to the last question with Back to the questions', async () => {
      const { fixture, plan, root } = await render(TAX_PROFILE);
      const button = Array.from(root.querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === 'Back to the questions',
      );
      button?.click();
      await fixture.whenStable();
      expect(plan.onSummary()).toBe(false);
      expect(plan.currentQuestion()).toBe('money');
    });

    it('clears everything with Start again', async () => {
      const { fixture, plan, root } = await render(TAX_PROFILE);
      const button = Array.from(root.querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === 'Start again',
      );
      button?.click();
      await fixture.whenStable();
      expect(plan.answers().goal).toBeNull();
      expect(plan.position()).toBe(0);
    });
  });

  describe('screen readers', () => {
    it('announces how many steps the plan has in a polite live region', async () => {
      const { root, text } = await render(TAX_PROFILE);
      expect(text(root.querySelector('[aria-live=polite]'))).toBe('Your plan is ready: 4 steps.');
    });

    it('does not take focus when it first renders without a request', async () => {
      const { root } = await render(TAX_PROFILE);
      expect(root.contains(root.ownerDocument.activeElement)).toBe(false);
    });

    it('takes focus on its heading when the move asked for it', async () => {
      TestBed.configureTestingModule({
        providers: [
          provideRouter([]),
          { provide: LIVE_REGION_SETTLE_MS, useValue: 0 },
          { provide: TODAY, useValue: () => new Date(TODAY_PINNED) },
        ],
      });
      const plan = TestBed.inject(PlanBuilderStore);
      plan.update(TAX_PROFILE);
      plan.finish();
      plan.requestHeadingFocus();
      const fixture = TestBed.createComponent(PlanSummary);
      await fixture.whenStable();
      expect(document.activeElement).toBe(fixture.nativeElement.querySelector('h2'));
    });
  });

  describe('without usable data', () => {
    it('shows an alert, no steps, and still lets the person change answers', async () => {
      const { root, text, titles } = await render(TAX_PROFILE, false);
      expect(text(root.querySelector('[role=alert]'))).toBe(
        'Tax data is unavailable, so your plan cannot be worked out.',
      );
      expect(titles()).toEqual([]);
      expect(root.querySelector('ol')).toBeNull();
      expect(root.querySelectorAll('button[aria-label^="Change "]').length).toBeGreaterThan(0);
      expect(text(root.querySelector('[aria-live=polite]'))).toBe('');
    });

    it('explains an income that cannot be worked out', async () => {
      const { root, text } = await render({
        goal: 'pay-less-tax',
        income: { basis: 'net', period: 'monthly', amount: 5e9 },
      });
      expect(text(root.querySelector('[role=alert]'))).toContain('could not work out a plan');
      expect(root.querySelector('.plan-summary__lead')).toBeNull();
    });
  });
});
