import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { AmountField } from './amount-field';

@Component({
  imports: [AmountField],
  template: `
    <rw-amount-field
      label="Monthly salary"
      [value]="value()"
      [min]="1000"
      [max]="100000"
      [step]="500"
      prefix="R"
      suffix="pm"
      hint="Before tax"
      (valueChange)="changes.push($event)"
    />
  `,
})
class Host {
  readonly value = signal(20000);
  readonly changes: number[] = [];
}

describe('AmountField', () => {
  async function setup() {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    return {
      fixture,
      root,
      number: root.querySelector('input[type=number]') as HTMLInputElement,
      slider: root.querySelector('input[type=range]') as HTMLInputElement,
    };
  }

  function type(el: HTMLInputElement, value: string, event: 'input' | 'change' = 'input') {
    el.value = value;
    el.dispatchEvent(new Event(event, { bubbles: true }));
  }

  it('labels the number input and the slider', async () => {
    const { root, number, slider } = await setup();
    const label = root.querySelector('label') as HTMLLabelElement;
    expect(label.htmlFor).toBe(number.id);
    expect(label.textContent).toContain('Monthly salary');
    expect(slider.getAttribute('aria-label')).toBe('Monthly salary slider');
    expect(number.getAttribute('aria-describedby')).toBeTruthy();
  });

  it('renders prefix, suffix, bounds and initial value', async () => {
    const { root, number, slider } = await setup();
    const affixes = Array.from(root.querySelectorAll('.rw-amount-field__affix')).map((e) => e.textContent);
    expect(affixes).toEqual(['R', 'pm']);
    expect(number.value).toBe('20000');
    expect(slider.value).toBe('20000');
    expect(slider.min).toBe('1000');
    expect(slider.max).toBe('100000');
    expect(slider.getAttribute('aria-valuetext')).toBe('R 20000 pm');
  });

  it('typing updates the slider and emits once', async () => {
    const { fixture, number, slider } = await setup();
    type(number, '30000');
    await fixture.whenStable();
    expect(slider.value).toBe('30000');
    expect(fixture.componentInstance.changes).toEqual([30000]);
  });

  it('moving the slider updates the number and emits', async () => {
    const { fixture, number, slider } = await setup();
    type(slider, '45000');
    await fixture.whenStable();
    expect(number.value).toBe('45000');
    expect(fixture.componentInstance.changes).toEqual([45000]);
  });

  it('does not rewrite a half-typed out-of-range value while typing', async () => {
    const { fixture, number } = await setup();
    type(number, '5');
    await fixture.whenStable();
    expect(number.value).toBe('5');
    expect(fixture.componentInstance.changes).toEqual([]);
  });

  it('clamps on commit', async () => {
    const { fixture, number, slider } = await setup();
    type(number, '5', 'change');
    await fixture.whenStable();
    expect(number.value).toBe('1000');
    expect(slider.value).toBe('1000');
    expect(fixture.componentInstance.changes).toEqual([1000]);
  });

  it('snaps to the step on commit', async () => {
    const { fixture, number } = await setup();
    type(number, '30130', 'change');
    await fixture.whenStable();
    expect(number.value).toBe('30000');
    expect(fixture.componentInstance.changes).toEqual([30000]);
  });

  it('reverts an empty value on commit', async () => {
    const { fixture, number } = await setup();
    type(number, '', 'change');
    await fixture.whenStable();
    expect(number.value).toBe('20000');
    expect(fixture.componentInstance.changes).toEqual([]);
  });

  it('resets to the parent value when the parent changes it', async () => {
    const { fixture, number, slider } = await setup();
    type(slider, '45000');
    await fixture.whenStable();
    fixture.componentInstance.value.set(60000);
    await fixture.whenStable();
    expect(number.value).toBe('60000');
    expect(slider.value).toBe('60000');
  });
});
