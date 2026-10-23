import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PlanStepCard, PlanStepDetail } from './plan-step';

@Component({
  imports: [PlanStepCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <rw-plan-step
      [index]="2"
      title="Pay R 8 250 a month into your RA"
      why="It lowers your tax bill."
      keyLabel="Tax you save"
      keyValue="R 25 740 a year"
      [details]="details()"
      [notes]="notes()"
      actionLabel="Open in Retirement annuity"
      titleId="step-title-ra"
      (open)="opened.set(opened() + 1)"
    />
  `,
})
class Host {
  readonly details = signal<readonly PlanStepDetail[]>([
    { label: 'Deduction room', value: 'R 99 000 a year' },
    { label: 'Tax rate on the extra rand', value: '26%' },
  ]);
  readonly notes = signal<readonly string[]>(['Start with what you can afford.']);
  readonly opened = signal(0);
}

describe('PlanStepCard', () => {
  async function render() {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    return { fixture, root, button: () => root.querySelector('button') as HTMLButtonElement };
  }

  it('renders the number, title, why, key figure, details and notes', async () => {
    const { root } = await render();
    const text = (selector: string) => root.querySelector(selector)?.textContent?.trim();
    expect(text('.rw-plan-step__badge')).toBe('2');
    expect(root.querySelector('.rw-plan-step__badge')?.getAttribute('aria-hidden')).toBe('true');
    expect(root.querySelector('h3')?.textContent?.trim()).toBe('Pay R 8 250 a month into your RA');
    expect(text('.rw-plan-step__why')).toBe('It lowers your tax bill.');
    expect(text('.rw-plan-step__key-label')).toBe('Tax you save');
    expect(text('.rw-plan-step__key-value')).toBe('R 25 740 a year');
    expect(
      Array.from(root.querySelectorAll('dt')).map((el) => el.textContent?.trim()),
    ).toEqual(['Deduction room', 'Tax rate on the extra rand']);
    expect(
      Array.from(root.querySelectorAll('dd')).map((el) => el.textContent?.trim()),
    ).toEqual(['R 99 000 a year', '26%']);
    expect(text('.rw-plan-step__note')).toBe('Start with what you can afford.');
  });

  it('leaves out the details and notes lists when there are none', async () => {
    const { fixture, root } = await render();
    fixture.componentInstance.details.set([]);
    fixture.componentInstance.notes.set([]);
    await fixture.whenStable();
    expect(root.querySelector('dl')).toBeNull();
    expect(root.querySelector('ul')).toBeNull();
  });

  it('emits open when the button is pressed', async () => {
    const { fixture, button } = await render();
    expect(button().textContent?.trim()).toBe('Open in Retirement annuity');
    expect(button().type).toBe('button');
    button().click();
    await fixture.whenStable();
    expect(fixture.componentInstance.opened()).toBe(1);
  });

  it('describes the button by the title so its purpose is clear out of context', async () => {
    const { root, button } = await render();
    const title = root.querySelector('h3') as HTMLElement;
    expect(title.id).toBe('step-title-ra');
    expect(button().getAttribute('aria-describedby')).toBe('step-title-ra');
  });

  it('shows the key figure as plain text, not a counting-up money figure', async () => {
    const { root } = await render();
    expect(root.querySelector('.rw-money')).toBeNull();
    expect(root.querySelector('rw-money')).toBeNull();
  });
});
