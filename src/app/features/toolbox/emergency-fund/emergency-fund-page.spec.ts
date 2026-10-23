import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { routes } from '../../../app.routes';
import { TODAY } from '../../../core/data/data-source';
import { SEND_TARGETS } from '../../../core/plan/handoff';
import { PlanContextStore } from '../../../core/plan/plan-context.store';
import { FakeMatchMedia, installFakeMatchMedia } from '../../../testing/fake-match-media';
import { normaliseSpaces } from '../../../testing/text';
import { BudgetPage } from '../../budget/budget-page';
import { ToolboxPage } from '../toolbox-page';
import { EmergencyFundPage } from './emergency-fund-page';

// Pinned so the bundled 2027 file is the year in use (the Budget needs come from its payslip).
const TODAY_PINNED = new Date(2026, 9, 22);

describe('EmergencyFundPage', () => {
  let fake: FakeMatchMedia;

  beforeEach(() => {
    fake = installFakeMatchMedia({ reducedMotion: true });
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'toolbox/emergency-fund', component: EmergencyFundPage },
          { path: 'toolbox', component: ToolboxPage },
          { path: 'budget', component: BudgetPage },
        ]),
        { provide: TODAY, useValue: () => new Date(TODAY_PINNED) },
      ],
    });
  });
  afterEach(() => fake.uninstall());

  async function render() {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/toolbox/emergency-fund', EmergencyFundPage);
    return { harness, root: harness.routeNativeElement as HTMLElement };
  }

  const text = (el: Element | null | undefined) => normaliseSpaces(el?.textContent);
  const hero = (root: HTMLElement) =>
    text(root.querySelector('.tool__hero .rw-money--hero .rw-money__figure'));
  const statTexts = (root: HTMLElement) =>
    Array.from(root.querySelectorAll('rw-stat-card')).map((el) => text(el));

  function inputByLabel(root: HTMLElement, label: string): HTMLInputElement {
    const found = Array.from(root.querySelectorAll('label')).find((el) => text(el) === label);
    const input = found?.htmlFor ? root.ownerDocument.getElementById(found.htmlFor) : null;
    if (!(input instanceof HTMLInputElement)) throw new Error(`no field "${label}"`);
    return input;
  }

  async function type(harness: RouterTestingHarness, label: string, value: number) {
    const input = inputByLabel(harness.routeNativeElement as HTMLElement, label);
    input.value = String(value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await harness.fixture.whenStable();
  }

  async function click(harness: RouterTestingHarness, label: string) {
    const button = Array.from(
      (harness.routeNativeElement as HTMLElement).querySelectorAll('button'),
    ).find((b) => text(b).startsWith(label));
    if (!button) throw new Error(`no button "${label}"`);
    button.click();
    await harness.fixture.whenStable();
  }

  /** The hand-derived case EF3: target 30 000, 27 months at 12% with R1 000 a month. */
  async function typeEf3(harness: RouterTestingHarness) {
    await type(harness, 'Essential expenses per month', 10_000);
    await type(harness, 'Months to cover', 3);
    await type(harness, 'Saved each month', 1_000);
    await type(harness, 'Savings interest rate per year', 12);
  }

  it('shows the default example target and months to goal', async () => {
    const { root } = await render();
    expect(text(root.querySelector('rw-chip'))).toBe('Example');
    // 3 months of R15 000 is R45 000; R2 000 a month at the 7.25% repo rate takes 22 months.
    expect(hero(root)).toBe('R 45 000,00');
    expect(text(root.querySelector('.tool__lead'))).toBe('22 months to reach your goal');
  });

  it('gives target R 30 000,00 and 27 months for 10 000 x 3, saving 1 000 a month at 12%', async () => {
    const { harness, root } = await render();
    await typeEf3(harness);
    // 1 000 x (1.01^n - 1) / 0.01 >= 30 000 needs 1.01^n >= 1.3, so n = ln 1.3 / ln 1.01 = 26.4: 27.
    expect(hero(root)).toBe('R 30 000,00');
    expect(text(root.querySelector('.tool__lead'))).toBe('27 months to reach your goal');
    const stats = statTexts(root);
    expect(stats[0]).toContain('R 30 000,00');
    expect(stats[1]).toContain('27 months');
    expect(stats[1]).toContain('About 2 years 3 months');
    expect(stats[1]).toContain('Without interest: 30 months');
  });

  it('gives 24 months when R6 000 is already saved at a 0% rate', async () => {
    const { harness, root } = await render();
    await typeEf3(harness);
    await type(harness, 'Savings so far', 6_000);
    await type(harness, 'Savings interest rate per year', 0);
    // (30 000 - 6 000) / 1 000 = 24.
    expect(text(root.querySelector('.tool__lead'))).toBe('24 months to reach your goal');
    expect(statTexts(root)[0]).toContain('R 24 000,00');
    expect(text(root.querySelector('.rw-ring-gauge__centre'))).toBe('20%');
  });

  it('says so when nothing is going in and the goal is never reached', async () => {
    const { harness, root } = await render();
    await type(harness, 'Saved each month', 0);
    await type(harness, 'Savings interest rate per year', 0);
    const warnings = Array.from(root.querySelectorAll('.tool__warning')).map((el) => text(el));
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain('not reached within 50 years');
    expect(text(root.querySelector('.tool__lead'))).toBe(
      'Not reached within 50 years at this saving rate.',
    );
    expect(statTexts(root)[1]).toContain('Without interest: never');
  });

  it('asks for expenses when there are none, and shows no chart', async () => {
    const { harness, root } = await render();
    await type(harness, 'Essential expenses per month', 0);
    expect(hero(root)).toBe('R 0,00');
    expect(text(root.querySelector('.tool__warning'))).toContain('Enter your monthly essential');
    expect(root.querySelector('rw-line-chart')).toBeNull();
  });

  it('offers the Budget needs and puts them in the expenses field', async () => {
    const { harness, root } = await render();
    // Example Budget: needs are 50% of the R25 141.88 take-home.
    const button = Array.from(root.querySelectorAll('button')).find((b) =>
      text(b).startsWith('Use my Budget needs'),
    );
    expect(text(button)).toMatch(/^Use my Budget needs \(R 12 570,9\d\)$/);
    await click(harness, 'Use my Budget needs');
    expect(inputByLabel(root, 'Essential expenses per month').value).toMatch(/^12570\.9\d$/);
    expect(hero(root)).toMatch(/^R 37 712,\d\d$/);
  });

  it('draws the balance against the target with text alternatives', async () => {
    const { root } = await render();
    const chart = root.querySelector('rw-line-chart');
    expect(chart?.textContent).toContain('Emergency fund balance');
    expect(chart?.textContent).toContain('Target');
    expect(chart?.querySelector('svg')?.getAttribute('aria-label')).toContain(
      'Emergency fund balance over time',
    );
    expect(root.querySelector('rw-ring-gauge svg')?.getAttribute('aria-label')).toContain(
      'Share of your emergency fund target already saved',
    );
    // The line chart keeps at most about 24 points per series.
    const firstTable = chart?.querySelectorAll('table')[0];
    expect(firstTable?.querySelectorAll('tbody tr').length).toBeLessThanOrEqual(25);
  });

  it('labels every input', async () => {
    const { root } = await render();
    const inputs = Array.from(root.querySelectorAll('input'));
    expect(inputs.length).toBeGreaterThanOrEqual(10);
    for (const input of inputs) {
      const label = input.id
        ? root.querySelector(`label[for="${input.id}"]`)
        : input.closest('label');
      const name = input.getAttribute('aria-label') || text(label);
      expect(name, `an input of type ${input.type} has no label`).not.toBe('');
    }
    for (const label of [
      'Essential expenses per month',
      'Months to cover',
      'Savings so far',
      'Saved each month',
      'Savings interest rate per year',
    ]) {
      expect(inputByLabel(root, label)).toBeTruthy();
    }
  });

  it('resets to the example', async () => {
    const { harness, root } = await render();
    await type(harness, 'Saved each month', 3_000);
    expect(root.querySelector('rw-chip')).toBeNull();
    await click(harness, 'Reset to example');
    expect(inputByLabel(root, 'Saved each month').value).toBe('2000');
    expect(text(root.querySelector('rw-chip'))).toBe('Example');
  });

  it('has a polite live region for the headline', async () => {
    const { harness, root } = await render();
    await typeEf3(harness);
    expect(text(root.querySelector('[aria-live=polite]'))).toBe(
      'Emergency fund target R 30 000,00. 27 months to reach your goal.',
    );
  });

  it('sends to the Budget: lands on /budget with the From Emergency fund chip, and Undo works', async () => {
    const { harness } = await render();
    await typeEf3(harness);
    const targets = Array.from(
      (harness.routeNativeElement as HTMLElement).querySelectorAll('rw-send-to button'),
    ).map((el) => text(el));
    expect(targets.length).toBe(1);
    expect(targets[0]).toMatch(/^Budget/);

    await click(harness, 'Budget');
    const root = harness.routeNativeElement as HTMLElement;
    expect(TestBed.inject(Router).url).toBe('/budget');
    expect(TestBed.inject(PlanContextStore).budgetFrom()).toBe('emergency-fund');
    expect(text(root.querySelector('rw-handoff-chip'))).toContain('From Emergency fund');

    root.querySelector<HTMLButtonElement>('.rw-handoff-chip__undo')?.click();
    await harness.fixture.whenStable();
    expect(root.querySelector('rw-handoff-chip')).toBeNull();
    expect(TestBed.inject(PlanContextStore).budgetFrom()).toBeFalsy();
  });

  it('points only at working targets: every link is a route and the send target has a route', async () => {
    const { root } = await render();
    const paths = new Set(routes.map((route) => route.path));
    const hrefs = Array.from(root.querySelectorAll('a[href]')).map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('/toolbox');
    for (const href of hrefs) {
      expect(paths.has((href ?? '').replace(/^\//, '')), `route for ${href}`).toBe(true);
    }
    for (const target of SEND_TARGETS.filter((t) => t.id === 'budget')) {
      expect(target.route).not.toBeNull();
      expect(paths.has((target.route ?? '').replace(/^\//, ''))).toBe(true);
    }
  });

  it('says that nothing is saved', async () => {
    const { root } = await render();
    expect(text(root.querySelector('.tool__results > .tool__note'))).toContain('Nothing is saved');
  });
});
