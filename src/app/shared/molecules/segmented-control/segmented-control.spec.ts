import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { SegmentedControl, SegmentedOption } from './segmented-control';

type Period = 'monthly' | 'annual';

@Component({
  imports: [SegmentedControl],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <rw-segmented-control legend="Show amounts" [options]="options" [(value)]="period" />
    <rw-segmented-control legend="Second group" [options]="options" [hideLegend]="true" value="monthly" />
  `,
})
class Host {
  readonly options: readonly SegmentedOption<Period>[] = [
    { value: 'monthly', label: 'Per month' },
    { value: 'annual', label: 'Per year' },
  ];
  readonly period = signal<Period>('monthly');
}

describe('SegmentedControl', () => {
  async function render() {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const [first, second] = Array.from(root.querySelectorAll<HTMLElement>('rw-segmented-control'));
    return { fixture, root, first, second };
  }

  const radios = (el: HTMLElement) => Array.from(el.querySelectorAll<HTMLInputElement>('input[type=radio]'));

  it('groups labelled radios under a legend in a fieldset', async () => {
    const { first } = await render();
    expect(first.querySelector('fieldset legend')?.textContent?.trim()).toBe('Show amounts');
    const inputs = radios(first);
    expect(inputs.map((r) => r.labels?.[0]?.textContent?.trim())).toEqual(['Per month', 'Per year']);
    expect(inputs.map((r) => r.checked)).toEqual([true, false]);
    expect(first.querySelector('.rw-segmented-control__option--active')?.textContent?.trim()).toBe(
      'Per month',
    );
  });

  it('gives each instance its own radio group name', async () => {
    const { first, second } = await render();
    expect(radios(first)[0].name).not.toBe(radios(second)[0].name);
  });

  it('can hide the legend visually while keeping it for screen readers', async () => {
    const { first, second } = await render();
    expect(first.querySelector('legend')?.classList.contains('rw-visually-hidden')).toBe(false);
    expect(second.querySelector('legend')?.classList.contains('rw-visually-hidden')).toBe(true);
  });

  it('updates the two-way bound value when an option is chosen', async () => {
    const { fixture, first } = await render();
    radios(first)[1].click();
    await fixture.whenStable();
    expect(fixture.componentInstance.period()).toBe('annual');
    expect(radios(first).map((r) => r.checked)).toEqual([false, true]);
    expect(first.querySelector('.rw-segmented-control__option--active')?.textContent?.trim()).toBe(
      'Per year',
    );
  });

  it('follows arrow-key selection, which native radios report as a change event', async () => {
    const { fixture, first } = await render();
    const [, next] = radios(first);
    // What the browser does on ArrowRight: check the next radio and fire change.
    next.checked = true;
    next.dispatchEvent(new Event('change', { bubbles: true }));
    await fixture.whenStable();
    expect(fixture.componentInstance.period()).toBe('annual');
  });

  it('reflects a value set by the parent', async () => {
    const { fixture, first } = await render();
    fixture.componentInstance.period.set('annual');
    await fixture.whenStable();
    expect(radios(first).map((r) => r.checked)).toEqual([false, true]);
  });
});
