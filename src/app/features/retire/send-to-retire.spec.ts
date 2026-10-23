import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { TODAY } from '../../core/data/data-source';
import { PlanContextStore } from '../../core/plan/plan-context.store';
import { FakeMatchMedia, installFakeMatchMedia } from '../../testing/fake-match-media';
import { normaliseSpaces } from '../../testing/text';
import { PayPage } from '../pay/pay-page';
import { RaPage } from '../ra/ra-page';
import { RetirePage } from './retire-page';

// Pinned so the bundled 2027 file is the year in use (the fixture UIF ceiling is fake).
const TODAY_PINNED = new Date(2026, 9, 22);

describe('RA, Retire at 55 and Pay handoffs', () => {
  let fake: FakeMatchMedia;

  beforeEach(() => {
    fake = installFakeMatchMedia({ reducedMotion: true });
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'pay', component: PayPage },
          { path: 'ra', component: RaPage },
          { path: 'retire', component: RetirePage },
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

  it('RA to Retire copies the contribution and balance, shows From RA, and Undo restores them', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/ra');
    await type(harness, 'Extra RA contribution per month', 3_000);
    await type(harness, 'RA balance today', 100_000);
    await sendTo(harness, 'Retire at 55');

    const root = rootOf(harness);
    expect(TestBed.inject(Router).url).toBe('/retire');
    expect(TestBed.inject(PlanContextStore).retireFrom()).toBe('ra');
    expect(text(root.querySelector('rw-handoff-chip'))).toContain('From RA');
    expect(field(root, 'Monthly RA contribution now').value).toBe('3000');
    expect(field(root, 'RA balance today').value).toBe('100000');

    await undo(harness);
    expect(field(root, 'Monthly RA contribution now').value).toBe('2000');
    expect(field(root, 'RA balance today').value).toBe('0');
    expect(root.querySelector('rw-handoff-chip')).toBeNull();
  });

  it('Retire to RA sets the solved contribution, shows From Retire at 55, and Undo restores it', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/retire');
    await sendTo(harness, 'Retirement annuity');

    const root = rootOf(harness);
    expect(TestBed.inject(Router).url).toBe('/ra');
    expect(TestBed.inject(PlanContextStore).raFrom()).toBe('retire');
    expect(text(root.querySelector('rw-handoff-chip'))).toContain('From Retire at 55');
    expect(field(root, 'Extra RA contribution per month').value).toBe('46864.26');
    // 46 864.26 x 970.056777 (the balance factor of R1 a month over 20 years) = 45 460 993.013
    expect(text(root.querySelector('.ra__hero .rw-money__figure'))).toBe('R 45 460 993,01');

    await undo(harness);
    expect(field(root, 'Extra RA contribution per month').value).toBe('2000');
    expect(root.querySelector('rw-handoff-chip')).toBeNull();
  });

  it('Pay to Retire at 55 carries the Salary figures and shows From Salary', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/pay');
    await type(harness, 'Age at the end of the tax year', 40);
    await sendTo(harness, 'Retire at 55');

    const root = rootOf(harness);
    expect(TestBed.inject(Router).url).toBe('/retire');
    expect(TestBed.inject(PlanContextStore).retireFrom()).toBe('salary');
    expect(text(root.querySelector('rw-handoff-chip'))).toContain('From Salary');
    expect(field(root, 'Current age').value).toBe('40');
    expect(field(root, 'Gross pay per month').value).toBe('30000');
  });
});
