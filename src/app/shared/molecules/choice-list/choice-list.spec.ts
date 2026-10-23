import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ChoiceList, ChoiceOption } from './choice-list';

type Colour = 'red' | 'green' | 'blue';

@Component({
  imports: [ChoiceList],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <rw-choice-list legend="Pick a colour" [options]="options" [(value)]="colour" />
    <rw-choice-list legend="Second list" [options]="options" [hideLegend]="true" />
  `,
})
class Host {
  readonly options: readonly ChoiceOption<Colour>[] = [
    { value: 'red', label: 'Red', description: 'The warm one' },
    { value: 'green', label: 'Green' },
    { value: 'blue', label: 'Blue', description: 'The cool one' },
  ];
  readonly colour = signal<Colour | null>(null);
}

describe('ChoiceList', () => {
  async function render() {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const [first, second] = Array.from(root.querySelectorAll<HTMLElement>('rw-choice-list'));
    return { fixture, root, first, second };
  }

  const radios = (el: HTMLElement) =>
    Array.from(el.querySelectorAll<HTMLInputElement>('input[type=radio]'));

  it('groups one radio per option under a legend in a fieldset', async () => {
    const { first } = await render();
    expect(first.querySelector('fieldset legend')?.textContent?.trim()).toBe('Pick a colour');
    const inputs = radios(first);
    expect(inputs).toHaveLength(3);
    expect(new Set(inputs.map((r) => r.name)).size).toBe(1);
    expect(inputs.map((r) => r.checked)).toEqual([false, false, false]);
  });

  it('names each radio by its title and describes it by its description', async () => {
    const { first } = await render();
    const [red, green] = radios(first);
    const byId = (id: string | null) => first.ownerDocument.getElementById(id ?? '');
    expect(byId(red.getAttribute('aria-labelledby'))?.textContent?.trim()).toBe('Red');
    expect(byId(red.getAttribute('aria-describedby'))?.textContent?.trim()).toBe('The warm one');
    expect(green.hasAttribute('aria-describedby')).toBe(false);
    expect(first.textContent).toContain('The cool one');
  });

  it('updates the model, the selected class and the check icon when an option is chosen', async () => {
    const { fixture, first } = await render();
    expect(first.querySelector('rw-icon')).toBeNull();

    radios(first)[2].click();
    await fixture.whenStable();

    expect(fixture.componentInstance.colour()).toBe('blue');
    expect(radios(first).map((r) => r.checked)).toEqual([false, false, true]);
    const selected = first.querySelectorAll('.rw-choice-list__option--selected');
    expect(selected).toHaveLength(1);
    expect(selected[0].textContent).toContain('Blue');
    expect(selected[0].querySelector('rw-icon')).not.toBeNull();
    expect(first.querySelectorAll('rw-icon')).toHaveLength(1);
  });

  it('reflects a value set from outside', async () => {
    const { fixture, first } = await render();
    fixture.componentInstance.colour.set('green');
    await fixture.whenStable();
    expect(radios(first).map((r) => r.checked)).toEqual([false, true, false]);
  });

  it('hides the legend visually but keeps it for screen readers', async () => {
    const { first, second } = await render();
    expect(first.querySelector('legend')?.classList.contains('rw-visually-hidden')).toBe(false);
    expect(second.querySelector('legend')?.classList.contains('rw-visually-hidden')).toBe(true);
  });

  it('gives each instance its own radio group name and element ids', async () => {
    const { first, second } = await render();
    expect(radios(first)[0].name).not.toBe(radios(second)[0].name);
    expect(radios(first)[0].getAttribute('aria-labelledby')).not.toBe(
      radios(second)[0].getAttribute('aria-labelledby'),
    );
  });
});
