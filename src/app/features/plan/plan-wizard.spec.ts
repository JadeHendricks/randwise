import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { TODAY } from '../../core/data/data-source';
import type { PlanGoal } from '../../core/plan/plan-answers';
import { PlanBuilderStore } from '../../core/plan/plan-builder.store';
import { FakeMatchMedia, installFakeMatchMedia } from '../../testing/fake-match-media';
import { normaliseSpaces } from '../../testing/text';
import { QUESTION_COPY } from './plan-format';
import { PlanWizard } from './plan-wizard';

// Pinned so the bundled 2027 file is the year in use (the fixture UIF ceiling is fake).
const TODAY_PINNED = new Date(2026, 9, 22);

describe('PlanWizard', () => {
  let fake: FakeMatchMedia;

  beforeEach(() => {
    fake = installFakeMatchMedia({ reducedMotion: true });
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: TODAY, useValue: () => new Date(TODAY_PINNED) }],
    });
  });
  afterEach(() => fake.uninstall());

  async function render() {
    const fixture = TestBed.createComponent(PlanWizard);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const plan = TestBed.inject(PlanBuilderStore);

    const text = (el: Element | null | undefined) => normaliseSpaces(el?.textContent);
    const headings = () => Array.from(root.querySelectorAll('h2'));
    const heading = () => root.querySelector('h2') as HTMLElement;
    const button = (label: string) =>
      Array.from(root.querySelectorAll('button')).find((b) => text(b) === label) as
        | HTMLButtonElement
        | undefined;
    const live = () => text(root.querySelector('[aria-live=polite]'));
    const alerts = () => Array.from(root.querySelectorAll('[role=alert]')).map((el) => text(el));

    function input(label: string): HTMLInputElement {
      const found = Array.from(root.querySelectorAll('label')).find((el) => text(el) === label);
      const el = found?.htmlFor ? root.ownerDocument.getElementById(found.htmlFor) : null;
      if (!(el instanceof HTMLInputElement)) throw new Error(`no field "${label}"`);
      return el;
    }
    async function type(label: string, value: number) {
      const el = input(label);
      el.value = String(value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      await fixture.whenStable();
    }
    async function click(label: string) {
      const target = button(label);
      if (!target) throw new Error(`no button "${label}"`);
      target.click();
      await fixture.whenStable();
    }
    async function choose(label: string) {
      const radio = Array.from(root.querySelectorAll<HTMLLabelElement>('label'))
        .find((el) => text(el.querySelector('.rw-choice-list__title') ?? el) === label)
        ?.querySelector('input');
      if (!radio) throw new Error(`no choice "${label}"`);
      radio.click();
      await fixture.whenStable();
    }
    async function chooseSegment(label: string) {
      const radio = Array.from(
        root.querySelectorAll<HTMLLabelElement>('rw-segmented-control label'),
      )
        .find((el) => text(el) === label)
        ?.querySelector('input');
      if (!radio) throw new Error(`no option "${label}"`);
      radio.click();
      await fixture.whenStable();
    }

    return {
      fixture, root, plan, text, headings, heading, button, live, alerts, input, type, click, choose, chooseSegment,
    };
  }

  const TITLES = QUESTION_COPY;

  it('shows exactly one question at a time with its field', async () => {
    const { headings, input, plan, root } = await render();
    expect(headings()).toHaveLength(1);
    expect(headings()[0].textContent?.trim()).toBe(TITLES.age.title);
    expect(input('Your age').value).toBe('35');
    expect(root.querySelectorAll('rw-amount-field')).toHaveLength(1);
    expect(plan.position()).toBe(0);
  });

  it('shows progress as Step 1 of 6, then the exact total once a goal is chosen', async () => {
    const { fixture, plan, root, text } = await render();
    expect(text(root.querySelector('.rw-step-progress__text'))).toBe('Step 1 of 6');
    expect(root.querySelector('[role=progressbar]')?.getAttribute('aria-label')).toBe('Plan progress');

    plan.update({ goal: 'pay-less-tax' });
    await fixture.whenStable();
    expect(text(root.querySelector('.rw-step-progress__text'))).toBe('Step 1 of 5');
  });

  it('moves with Next and Back and keeps the answers', async () => {
    const { heading, click, type, input, button } = await render();
    expect(button('Back')).toBeUndefined();

    await type('Your age', 41);
    await click('Next');
    expect(heading().textContent?.trim()).toBe(TITLES.income.title);
    expect(button('Back')).toBeDefined();

    await click('Back');
    expect(heading().textContent?.trim()).toBe(TITLES.age.title);
    expect(input('Your age').value).toBe('41');
  });

  describe('the goal question', () => {
    async function toGoal() {
      const ctx = await render();
      await ctx.click('Next');
      await ctx.click('Next');
      expect(ctx.heading().textContent?.trim()).toBe(TITLES.goal.title);
      return ctx;
    }

    it('shows the five goals as radios and gates Next with an alert', async () => {
      const { alerts, click, heading, root } = await toGoal();
      expect(root.querySelectorAll('input[type=radio]')).toHaveLength(5);
      expect(alerts()).toEqual([]);

      await click('Next');
      expect(alerts()).toEqual(['Choose a goal to continue.']);
      expect(heading().textContent?.trim()).toBe(TITLES.goal.title);
    });

    it('clears the alert once a goal is chosen and moves on', async () => {
      const { alerts, choose, click, heading } = await toGoal();
      await click('Next');
      await choose('Pay less tax');
      expect(alerts()).toEqual([]);

      await click('Next');
      expect(heading().textContent?.trim()).toBe(TITLES.risk.title);
    });

    it('does not carry the alert to another question', async () => {
      const { alerts, click } = await toGoal();
      await click('Next');
      expect(alerts()).toHaveLength(1);
      await click('Back');
      expect(alerts()).toEqual([]);
      await click('Next');
      expect(alerts()).toEqual([]);
    });
  });

  describe('adaptive sequences', () => {
    const CASES: readonly [PlanGoal, readonly (keyof typeof TITLES)[]][] = [
      ['retire-early', ['age', 'income', 'goal', 'retire-details', 'risk', 'money']],
      ['build-tfsa', ['age', 'income', 'goal', 'tfsa-details', 'risk', 'money']],
      ['pay-less-tax', ['age', 'income', 'goal', 'risk', 'money']],
      ['emergency-fund', ['age', 'income', 'goal', 'emergency-details', 'money']],
      ['buy-home', ['age', 'income', 'goal']],
    ];

    it.each(CASES)('asks the right questions in order for %s', async (goal, expected) => {
      const { click, heading, plan } = await render();
      plan.update({ goal });
      const seen: string[] = [];
      for (let i = 0; i < expected.length; i++) {
        seen.push(heading().textContent?.trim() ?? '');
        if (i < expected.length - 1) await click('Next');
      }
      expect(seen).toEqual(expected.map((id) => TITLES[id].title));
      expect(seen.some((title) => title === TITLES.risk.title)).toBe(
        goal !== 'emergency-fund' && goal !== 'buy-home',
      );
    });

    it('shows See my plan on the last question and reaches the summary', async () => {
      const { click, button, plan } = await render();
      plan.update({ goal: 'buy-home' });
      await click('Next');
      await click('Next');
      expect(button('Next')).toBeUndefined();
      await click('See my plan');
      expect(plan.onSummary()).toBe(true);
      expect(plan.reachedSummary()).toBe(true);
    });
  });

  describe('the income question', () => {
    async function toIncome() {
      const ctx = await render();
      await ctx.click('Next');
      return ctx;
    }

    it('shows the take-home worked out from a gross entry', async () => {
      const { text, root } = await toIncome();
      expect(text(root.querySelector('.plan-wizard__derived'))).toBe(
        'That is about R 25 142 take-home a month (R 301 703 a year).',
      );
    });

    it('shows the gross worked back from a take-home entry', async () => {
      const { chooseSegment, input, text, root } = await toIncome();
      await chooseSegment('Take-home pay');
      expect(input('Take-home pay per month').value).toBe('25141.88');
      expect(text(root.querySelector('.plan-wizard__derived'))).toBe(
        'That works back to about R 30 000 gross a month.',
      );
    });

    it('keeps the same person when the basis or the period changes', async () => {
      const { chooseSegment, input, plan } = await toIncome();
      await chooseSegment('Per year');
      expect(input('Gross pay per year').value).toBe('360000');
      await chooseSegment('Take-home pay');
      await chooseSegment('Per month');
      expect(plan.basics()?.grossMonthly).toBe(30_000);
      expect(plan.answers().income.basis).toBe('net');
      expect(plan.answers().income.period).toBe('monthly');
    });

    it('stays on the question with an alert when no income is entered', async () => {
      const { alerts, click, heading, type } = await toIncome();
      await type('Gross pay per month', 0);
      await click('Next');
      expect(alerts()).toContain('Enter your income to continue.');
      expect(heading().textContent?.trim()).toBe(TITLES.income.title);
    });
  });

  describe('the details questions', () => {
    it('explains a retirement age that is too early', async () => {
      const { alerts, click, heading, plan, type } = await render();
      plan.update({ goal: 'retire-early' });
      await click('Next');
      await click('Next');
      await click('Next');
      expect(heading().textContent?.trim()).toBe(TITLES['retire-details'].title);

      await type('Age you want to retire', 50);
      await click('Next');
      expect(alerts()).toEqual(['An RA pays out from age 55 at the earliest.']);
    });

    it('offers the risk levels as CPI plus a changeable assumption', async () => {
      const { choose, click, plan, root, text } = await render();
      plan.update({ goal: 'pay-less-tax' });
      await click('Next');
      await click('Next');
      await click('Next');
      const descriptions = Array.from(root.querySelectorAll('.rw-choice-list__description')).map(
        (el) => text(el),
      );
      expect(descriptions).toEqual([
        'CPI plus 2 percentage points (6,5% a year)',
        'CPI plus 5 percentage points (9,5% a year)',
        'CPI plus 7 percentage points (11,5% a year)',
      ]);
      expect(text(root.querySelector('.plan-wizard__note'))).toContain('assumption');

      await choose('Cautious');
      expect(plan.answers().risk).toBe('cautious');
    });
  });

  describe('the money question', () => {
    async function toMoney() {
      const ctx = await render();
      ctx.plan.update({ goal: 'pay-less-tax' });
      for (let i = 0; i < 4; i++) await ctx.click('Next');
      expect(ctx.heading().textContent?.trim()).toBe(TITLES.money.title);
      return ctx;
    }

    it('suggests 20% of take-home and accepts 0', async () => {
      const { input, plan, root, text, type } = await toMoney();
      expect(input('Amount you can invest each month').value).toBe('5028');
      expect(text(root.querySelector('.rw-amount-field__hint'))).toContain(
        'We suggest R 5 028, which is 20% of your take-home pay.',
      );
      expect(plan.answers().surplusMonthly).toBeNull();

      await type('Amount you can invest each month', 0);
      expect(plan.answers().surplusMonthly).toBe(0);
    });

    it('asks for the balances that matter for the goal', async () => {
      const { input } = await toMoney();
      expect(() => input('Retirement annuity balance today')).not.toThrow();
      expect(() => input('TFSA balance today')).not.toThrow();
      expect(() => input('Emergency fund saved so far')).toThrow();
    });
  });

  describe('keyboard and screen readers', () => {
    it('submits with Enter: a submit event on the form advances', async () => {
      const { fixture, heading, root } = await render();
      const form = root.querySelector('form') as HTMLFormElement;
      const event = new Event('submit', { cancelable: true, bubbles: true });
      form.dispatchEvent(event);
      await fixture.whenStable();
      expect(event.defaultPrevented).toBe(true);
      expect(heading().textContent?.trim()).toBe(TITLES.income.title);
    });

    it('uses real buttons, with Next as the submit button', async () => {
      const { button, click } = await render();
      expect(button('Next')?.type).toBe('submit');
      await click('Next');
      expect(button('Back')?.tagName).toBe('BUTTON');
      expect(button('Back')?.type).toBe('button');
    });

    it('labels the step group with the heading and groups the radios by legend', async () => {
      const { click, heading, root } = await render();
      await click('Next');
      await click('Next');
      const group = root.querySelector('[role=group]') as HTMLElement;
      expect(group.getAttribute('aria-labelledby')).toBe(heading().id);
      const fieldset = root.querySelector('fieldset');
      expect(fieldset?.querySelector('legend')?.textContent?.trim()).toBe('Your main goal');
    });

    it('labels every input', async () => {
      const { click, root } = await render();
      for (let i = 0; i < 2; i++) {
        const inputs = Array.from(
          root.querySelectorAll<HTMLInputElement>('input[type=number], input[type=range]'),
        );
        for (const el of inputs) {
          const named = (el.labels?.length ?? 0) > 0 || el.hasAttribute('aria-label');
          expect(named).toBe(true);
        }
        await click('Next');
      }
    });

    it('moves focus to the heading after Next and Back', async () => {
      const { click, heading, root } = await render();
      await click('Next');
      expect(root.ownerDocument.activeElement).toBe(heading());
      expect(heading().getAttribute('tabindex')).toBe('-1');

      (root.ownerDocument.activeElement as HTMLElement).blur();
      await click('Back');
      expect(root.ownerDocument.activeElement).toBe(heading());
    });

    it('does not steal focus on first render', async () => {
      const { heading, root } = await render();
      expect(root.ownerDocument.activeElement).not.toBe(heading());
      expect(root.contains(root.ownerDocument.activeElement)).toBe(false);
    });

    it('keeps one persistent heading element across questions', async () => {
      const { click, heading } = await render();
      const first = heading();
      await click('Next');
      expect(heading()).toBe(first);
    });

    it('announces the step in a polite live region', async () => {
      const { click, live, root } = await render();
      expect(root.querySelector('[aria-live=polite]')).not.toBeNull();
      expect(live()).toBe('Step 1 of 6: How old are you?');
      await click('Next');
      expect(live()).toBe('Step 2 of 6: What do you earn?');
    });
  });

  describe('skipping ahead', () => {
    it('offers Skip to my plan only after the summary has been seen', async () => {
      const { button, click, plan, fixture } = await render();
      expect(button('Skip to my plan')).toBeUndefined();

      plan.update({ goal: 'buy-home' });
      plan.finish();
      expect(plan.onSummary()).toBe(true);
      plan.back();
      await fixture.whenStable();
      expect(button('Skip to my plan')).toBeDefined();

      await click('Skip to my plan');
      expect(plan.onSummary()).toBe(true);
    });

    it('stops at the first question that still needs an answer', async () => {
      const { button, click, heading, plan, fixture } = await render();
      plan.update({ goal: 'buy-home' });
      plan.finish();
      plan.back();
      plan.goTo('income');
      plan.update({ income: { basis: 'gross', period: 'monthly', amount: 0 } });
      await fixture.whenStable();
      expect(button('Skip to my plan')).toBeDefined();
      await click('Skip to my plan');
      expect(plan.onSummary()).toBe(false);
      expect(heading().textContent?.trim()).toBe(TITLES.income.title);
    });
  });
});
