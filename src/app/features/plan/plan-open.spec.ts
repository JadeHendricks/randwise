import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { TODAY } from '../../core/data/data-source';
import type { PlanAnswers } from '../../core/plan/plan-answers';
import { PlanBuilderStore } from '../../core/plan/plan-builder.store';
import { PlanContextStore } from '../../core/plan/plan-context.store';
import { SalaryInputsStore } from '../../core/salary/salary-inputs.store';
import { FakeMatchMedia, installFakeMatchMedia } from '../../testing/fake-match-media';
import { normaliseSpaces } from '../../testing/text';
import { BudgetPage } from '../budget/budget-page';
import { JourneyPage } from '../journey/journey-page';
import { PayPage } from '../pay/pay-page';
import { RaPage } from '../ra/ra-page';
import { RetirePage } from '../retire/retire-page';
import { PlanPage } from './plan-page';

// Pinned so the bundled 2027 file is the year in use (the fixture UIF ceiling is fake).
const TODAY_PINNED = new Date(2026, 9, 22);

const TAX_PROFILE: Partial<PlanAnswers> = {
  goal: 'pay-less-tax',
  age: 35,
  surplusMonthly: 10_000,
};
const RETIRE_PROFILE: Partial<PlanAnswers> = {
  goal: 'retire-early',
  age: 35,
  retireAge: 55,
  retireIncomeMonthly: 50_000,
  surplusMonthly: 5_000,
};

describe('Opening a plan step in its calculator', () => {
  let fake: FakeMatchMedia;

  beforeEach(() => {
    fake = installFakeMatchMedia({ reducedMotion: true });
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'plan', component: PlanPage },
          { path: 'pay', component: PayPage },
          { path: 'ra', component: RaPage },
          { path: 'retire', component: RetirePage },
          { path: 'budget', component: BudgetPage },
          { path: 'journey', component: JourneyPage },
        ]),
        { provide: TODAY, useValue: () => new Date(TODAY_PINNED) },
      ],
    });
  });
  afterEach(() => fake.uninstall());

  const text = (el: Element | null | undefined) => normaliseSpaces(el?.textContent);
  const rootOf = (harness: RouterTestingHarness) => harness.routeNativeElement as HTMLElement;

  function field(root: HTMLElement, label: string): HTMLInputElement {
    const host = Array.from(root.querySelectorAll('rw-amount-field')).find(
      (el) => text(el.querySelector('label')) === label,
    );
    const input = host?.querySelector<HTMLInputElement>('input[type=number]');
    if (!input) throw new Error(`no field "${label}"`);
    return input;
  }

  async function start(profile: Partial<PlanAnswers>) {
    const plan = TestBed.inject(PlanBuilderStore);
    plan.update(profile);
    plan.finish();
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/plan');
    return { harness, plan };
  }

  /** The values a page shows before the plan touches it, so Undo can be compared to them. */
  async function read(harness: RouterTestingHarness, url: string, labels: readonly string[]) {
    await harness.navigateByUrl(url);
    const root = rootOf(harness);
    const values = labels.map((label) => field(root, label).value);
    await harness.navigateByUrl('/plan');
    return values;
  }

  async function open(harness: RouterTestingHarness, stepId: string) {
    const button = rootOf(harness).querySelector<HTMLButtonElement>(
      `button[aria-describedby="rw-plan-step-title-${stepId}"]`,
    );
    if (!button) throw new Error(`no Open button for ${stepId}`);
    button.click();
    await harness.fixture.whenStable();
  }

  async function undo(harness: RouterTestingHarness) {
    rootOf(harness).querySelector<HTMLButtonElement>('.rw-handoff-chip__undo')?.click();
    await harness.fixture.whenStable();
  }

  const chip = (harness: RouterTestingHarness) =>
    text(rootOf(harness).querySelector('rw-handoff-chip'));
  const url = () => TestBed.inject(Router).url;

  describe('a tax profile (R30 000 gross, R10 000 to invest)', () => {
    it('shows one Open button for each step', async () => {
      const { harness } = await start(TAX_PROFILE);
      const buttons = Array.from(rootOf(harness).querySelectorAll('.rw-plan-step__action')).map(
        (el) => text(el),
      );
      expect(buttons).toEqual([
        'Open in Pay',
        'Open in Retirement annuity',
        'Open in Journey',
        'Open in Budget',
      ]);
    });

    it('opens the RA with the full deduction, shows From Plan, and Undo restores it', async () => {
      const { harness } = await start(TAX_PROFILE);
      const before = await read(harness, '/ra', ['Extra RA contribution per month']);

      await open(harness, 'ra-deduction');
      const root = rootOf(harness);
      expect(url()).toBe('/ra');
      expect(chip(harness)).toContain('From Plan');
      expect(field(root, 'Extra RA contribution per month').value).toBe('8250');
      expect(TestBed.inject(PlanContextStore).raFrom()).toBe('plan');

      await undo(harness);
      expect([field(root, 'Extra RA contribution per month').value]).toEqual(before);
      expect(root.querySelector('rw-handoff-chip')).toBeNull();
    });

    it('opens the Journey with the RA and TFSA amounts, shows From Plan, and Undo restores them', async () => {
      const { harness } = await start(TAX_PROFILE);
      const labels = ['Monthly RA contribution now', 'Monthly TFSA top-up', 'Current age'];
      const before = await read(harness, '/journey', labels);

      await open(harness, 'tfsa-refund');
      const root = rootOf(harness);
      expect(url()).toBe('/journey');
      expect(chip(harness)).toContain('From Plan');
      expect(field(root, 'Monthly RA contribution now').value).toBe('8250');
      expect(field(root, 'Monthly TFSA top-up').value).toBe('1750');
      expect(field(root, 'Current age').value).toBe('35');
      expect(field(root, 'Gross pay per month').value).toBe('30000');

      await undo(harness);
      expect(labels.map((label) => field(root, label).value)).toEqual(before);
      expect(root.querySelector('rw-handoff-chip')).toBeNull();
    });

    it('opens the Budget with the RA and TFSA lines, shows From Plan, and Undo restores them', async () => {
      const { harness } = await start(TAX_PROFILE);
      const labels = ['Retirement annuity (RA) per month', 'Tax-free savings (TFSA) per month'];
      const before = await read(harness, '/budget', labels);

      await open(harness, 'budget-fit');
      const root = rootOf(harness);
      expect(url()).toBe('/budget');
      expect(chip(harness)).toContain('From Plan');
      expect(field(root, 'Retirement annuity (RA) per month').value).toBe('8250');
      expect(field(root, 'Tax-free savings (TFSA) per month').value).toBe('1750');

      await undo(harness);
      expect(labels.map((label) => field(root, label).value)).toEqual(before);
      expect(root.querySelector('rw-handoff-chip')).toBeNull();
    });

    it('opens Pay with the answers in the Salary inputs and no From chip', async () => {
      const { harness } = await start({
        ...TAX_PROFILE,
        age: 41,
        income: { basis: 'net', period: 'monthly', amount: 20_000 },
      });
      await open(harness, 'take-home');
      const root = rootOf(harness);

      expect(url()).toBe('/pay');
      expect(TestBed.inject(SalaryInputsStore).inputs()).toMatchObject({
        basis: 'net',
        period: 'monthly',
        amount: 20_000,
        age: 41,
      });
      expect(field(root, 'Take-home pay per month').value).toBe('20000');
      expect(field(root, 'Age at the end of the tax year').value).toBe('41');
      expect(root.querySelector('rw-handoff-chip')).toBeNull();
    });

    it('shows the summary with the same answers when you come back to /plan', async () => {
      const { harness, plan } = await start(TAX_PROFILE);
      const titles = () =>
        Array.from(rootOf(harness).querySelectorAll('.rw-plan-step__title')).map((el) => text(el));
      const before = titles();
      expect(before).toHaveLength(4);

      await open(harness, 'ra-deduction');
      expect(url()).toBe('/ra');
      await harness.navigateByUrl('/plan');

      expect(text(rootOf(harness).querySelector('h2'))).toBe('Your plan');
      expect(titles()).toEqual(before);
      expect(plan.answers()).toMatchObject(TAX_PROFILE);
      expect(rootOf(harness).ownerDocument.activeElement).toBe(
        rootOf(harness).ownerDocument.body,
      );
    });
  });

  describe('a retire profile (R50 000 a month at 55, R5 000 to invest)', () => {
    it('opens Retire at 55 with the plan values, shows From Plan, and Undo restores them', async () => {
      const { harness } = await start(RETIRE_PROFILE);
      const labels = [
        'Monthly RA contribution now',
        'Retirement age',
        "Monthly income you want in retirement (today's money)",
        'Return before retirement per year',
        'Return in retirement per year',
        'Inflation per year',
      ];
      const before = await read(harness, '/retire', labels);

      await open(harness, 'retire-target');
      const root = rootOf(harness);
      expect(url()).toBe('/retire');
      expect(chip(harness)).toContain('From Plan');
      expect(labels.map((label) => field(root, label).value)).toEqual([
        '5000',
        '55',
        '50000',
        '9.5',
        '7.5',
        '4.5',
      ]);

      await undo(harness);
      expect(labels.map((label) => field(root, label).value)).toEqual(before);
      expect(root.querySelector('rw-handoff-chip')).toBeNull();
    });

    it('opens the RA with what can be afforded and Undo restores it', async () => {
      const { harness } = await start(RETIRE_PROFILE);
      const before = await read(harness, '/ra', ['Extra RA contribution per month']);

      await open(harness, 'ra-deduction');
      const root = rootOf(harness);
      expect(url()).toBe('/ra');
      expect(chip(harness)).toContain('From Plan');
      expect(field(root, 'Extra RA contribution per month').value).toBe('5000');

      await undo(harness);
      expect([field(root, 'Extra RA contribution per month').value]).toEqual(before);
      expect(root.querySelector('rw-handoff-chip')).toBeNull();
    });

    it('opens the Journey and the Budget from the retire plan', async () => {
      const { harness } = await start(RETIRE_PROFILE);

      await open(harness, 'tfsa-refund');
      expect(url()).toBe('/journey');
      expect(chip(harness)).toContain('From Plan');
      expect(field(rootOf(harness), 'Monthly RA contribution now').value).toBe('5000');
      expect(field(rootOf(harness), 'Retirement age').value).toBe('55');

      await harness.navigateByUrl('/plan');
      await open(harness, 'budget-fit');
      expect(url()).toBe('/budget');
      expect(chip(harness)).toContain('From Plan');
      expect(field(rootOf(harness), 'Retirement annuity (RA) per month').value).toBe('5000');
    });
  });

  describe('an emergency profile', () => {
    it('opens the Budget with the months, the saved amount and the monthly line', async () => {
      const { harness } = await start({
        goal: 'emergency-fund',
        emergencyMonths: 6,
        emergencySaved: 12_000,
        surplusMonthly: 2_000,
      });
      await open(harness, 'emergency-fund');
      const root = rootOf(harness);

      expect(url()).toBe('/budget');
      expect(chip(harness)).toContain('From Plan');
      expect(field(root, 'Months of needs in your emergency fund').value).toBe('6');
      expect(field(root, 'Already in your emergency fund').value).toBe('12000');
      expect(field(root, 'Emergency fund per month').value).toBe('2000');
    });
  });
});
