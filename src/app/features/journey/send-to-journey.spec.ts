import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { TODAY } from '../../core/data/data-source';
import { PlanContextStore } from '../../core/plan/plan-context.store';
import { FakeMatchMedia, installFakeMatchMedia } from '../../testing/fake-match-media';
import { normaliseSpaces } from '../../testing/text';
import { BudgetPage } from '../budget/budget-page';
import { PayPage } from '../pay/pay-page';
import { RaPage } from '../ra/ra-page';
import { RetirePage } from '../retire/retire-page';
import { JourneyPage } from './journey-page';

// Pinned so the bundled 2027 file is the year in use (the fixture UIF ceiling is fake).
const TODAY_PINNED = new Date(2026, 9, 22);

describe('Handoffs into the Journey and out of it', () => {
  let fake: FakeMatchMedia;

  beforeEach(() => {
    fake = installFakeMatchMedia({ reducedMotion: true });
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
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

  async function type(harness: RouterTestingHarness, label: string, value: number) {
    const input = field(rootOf(harness), label);
    input.value = String(value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await harness.fixture.whenStable();
  }

  async function sendTo(harness: RouterTestingHarness, label: string) {
    const target = Array.from(rootOf(harness).querySelectorAll('rw-send-to button')).find((b) =>
      text(b).startsWith(label),
    ) as HTMLButtonElement | undefined;
    if (!target) throw new Error(`no send-to target "${label}"`);
    target.click();
    await harness.fixture.whenStable();
  }

  async function undo(harness: RouterTestingHarness) {
    rootOf(harness).querySelector<HTMLButtonElement>('.rw-handoff-chip__undo')?.click();
    await harness.fixture.whenStable();
  }

  it('Budget to Journey copies the TFSA line as the top-up, shows From Budget, and Undo restores it', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/budget');
    await type(harness, 'Tax-free savings (TFSA) per month', 2_000);
    await sendTo(harness, 'Journey');

    const root = rootOf(harness);
    expect(TestBed.inject(Router).url).toBe('/journey');
    expect(TestBed.inject(PlanContextStore).journeyFrom()).toBe('budget');
    expect(text(root.querySelector('rw-handoff-chip'))).toContain('From Budget');
    expect(field(root, 'Monthly TFSA top-up').value).toBe('2000');
    // The RA line of the example budget is 1 508.5128 -> R1 508.51 a month.
    expect(field(root, 'Monthly RA contribution now').value).toBe('1508.51');
    expect(text(root.querySelector('.journey__results > .journey__text'))).toContain(
      'a month goes to your emergency fund',
    );

    await undo(harness);
    expect(field(root, 'Monthly TFSA top-up').value).toBe('1000');
    expect(field(root, 'Monthly RA contribution now').value).toBe('2000');
    expect(root.querySelector('rw-handoff-chip')).toBeNull();
  });

  it('RA to Journey copies the contribution and shows From RA', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/ra');
    await type(harness, 'Extra RA contribution per month', 3_000);
    await type(harness, 'RA balance today', 100_000);
    await sendTo(harness, 'Journey');

    const root = rootOf(harness);
    expect(TestBed.inject(Router).url).toBe('/journey');
    expect(text(root.querySelector('rw-handoff-chip'))).toContain('From RA');
    expect(field(root, 'Monthly RA contribution now').value).toBe('3000');
    expect(field(root, 'RA balance today').value).toBe('100000');
  });

  it('Retire at 55 to Journey copies the solved contribution and shows From Retire at 55', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/retire');
    await sendTo(harness, 'Journey');

    const root = rootOf(harness);
    expect(TestBed.inject(Router).url).toBe('/journey');
    expect(text(root.querySelector('rw-handoff-chip'))).toContain('From Retire at 55');
    expect(field(root, 'Monthly RA contribution now').value).toBe('46864.26');
  });

  it('Pay to Journey carries the Salary figures and shows From Salary', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/pay');
    await type(harness, 'Age at the end of the tax year', 40);
    await sendTo(harness, 'Journey');

    const root = rootOf(harness);
    expect(TestBed.inject(Router).url).toBe('/journey');
    expect(text(root.querySelector('rw-handoff-chip'))).toContain('From Salary');
    expect(field(root, 'Current age').value).toBe('40');
    expect(field(root, 'Gross pay per month').value).toBe('30000');
  });

  it('Journey to RA sets the extra contribution and shows From Journey', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/journey');
    await type(harness, 'Monthly RA contribution now', 3_000);
    await sendTo(harness, 'Retirement annuity');

    const root = rootOf(harness);
    expect(TestBed.inject(Router).url).toBe('/ra');
    expect(text(root.querySelector('rw-handoff-chip'))).toContain('From Journey');
    expect(field(root, 'Extra RA contribution per month').value).toBe('3000');

    await undo(harness);
    expect(field(root, 'Extra RA contribution per month').value).toBe('2000');
  });

  it('Journey to Retire at 55 sets the contribution and shows From Journey', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/journey');
    await type(harness, 'Monthly RA contribution now', 3_000);
    await type(harness, 'RA balance today', 50_000);
    await sendTo(harness, 'Retire at 55');

    const root = rootOf(harness);
    expect(TestBed.inject(Router).url).toBe('/retire');
    expect(text(root.querySelector('rw-handoff-chip'))).toContain('From Journey');
    expect(field(root, 'Monthly RA contribution now').value).toBe('3000');
    expect(field(root, 'RA balance today').value).toBe('50000');
  });
});
