import { TestBed } from '@angular/core/testing';

import { FakeMatchMedia, installFakeMatchMedia } from '../../../testing/fake-match-media';
import { normaliseSpaces } from '../../../testing/text';
import { CategoryRow } from './category-row';

describe('CategoryRow', () => {
  let fake: FakeMatchMedia;

  beforeEach(() => {
    fake = installFakeMatchMedia({ reducedMotion: true });
  });
  afterEach(() => fake.uninstall());

  async function render(inputs: Record<string, unknown> = {}) {
    const fixture = TestBed.createComponent(CategoryRow);
    const all = { name: 'Housing', amount: 5_000, percent: 20, ...inputs };
    for (const [key, value] of Object.entries(all)) fixture.componentRef.setInput(key, value);
    const events = {
      amount: vi.fn(),
      percent: vi.fn(),
      name: vi.fn(),
      remove: vi.fn(),
    };
    fixture.componentInstance.amountChange.subscribe(events.amount);
    fixture.componentInstance.percentChange.subscribe(events.percent);
    fixture.componentInstance.nameChange.subscribe(events.name);
    fixture.componentInstance.remove.subscribe(events.remove);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    return { fixture, root, events };
  }

  const percentInput = (root: HTMLElement) =>
    root.querySelector<HTMLInputElement>('.rw-category-row__percent-input') as HTMLInputElement;
  const amountInput = (root: HTMLElement) =>
    root.querySelector<HTMLInputElement>('rw-amount-field input[type=number]') as HTMLInputElement;
  const labels = (root: HTMLElement) =>
    Array.from(root.querySelectorAll('label')).map((label) => normaliseSpaces(label.textContent));

  it('is a host with the BEM block class and shows a fixed name as text', async () => {
    const { root } = await render();
    expect(root.classList).toContain('rw-category-row');
    expect(normaliseSpaces(root.querySelector('.rw-category-row__name')?.textContent)).toBe(
      'Housing',
    );
    expect(root.querySelector('input[type=text]')).toBeNull();
    expect(root.querySelector('button')).toBeNull();
  });

  it('labels the amount and the share with the line name', async () => {
    const { root } = await render();
    expect(labels(root)).toEqual(['Housing per month', 'Housing share of take-home']);
    expect(amountInput(root).value).toBe('5000');
    expect(percentInput(root).value).toBe('20');
    const label = root.querySelector<HTMLLabelElement>('label[for]:not(.rw-amount-field__label)');
    expect(label?.htmlFor).toBe(percentInput(root).id);
  });

  it('emits the amount typed into the amount field', async () => {
    const { fixture, root, events } = await render();
    amountInput(root).value = '6250.5';
    amountInput(root).dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable();
    expect(events.amount).toHaveBeenCalledWith(6250.5);
  });

  it('emits the share on change, clamped to 0..100', async () => {
    const { fixture, root, events } = await render();
    percentInput(root).value = '12.5';
    percentInput(root).dispatchEvent(new Event('change', { bubbles: true }));
    await fixture.whenStable();
    expect(events.percent).toHaveBeenLastCalledWith(12.5);

    percentInput(root).value = '250';
    percentInput(root).dispatchEvent(new Event('change', { bubbles: true }));
    await fixture.whenStable();
    expect(events.percent).toHaveBeenLastCalledWith(100);
    expect(percentInput(root).value).toBe('100');
  });

  it('puts the last good share back for an empty or unchanged entry', async () => {
    const { fixture, root, events } = await render();
    percentInput(root).value = '';
    percentInput(root).dispatchEvent(new Event('change', { bubbles: true }));
    await fixture.whenStable();
    expect(events.percent).not.toHaveBeenCalled();
    expect(percentInput(root).value).toBe('20');
  });

  it('follows the share from the parent', async () => {
    const { fixture, root } = await render();
    fixture.componentRef.setInput('percent', 33.33);
    await fixture.whenStable();
    expect(percentInput(root).value).toBe('33.33');
  });

  it('shows a labelled name field and a Remove button for a custom line', async () => {
    const { fixture, root, events } = await render({
      name: 'Gym',
      editable: true,
      removable: true,
    });
    expect(labels(root)).toContain('Name of Gym');
    const name = root.querySelector<HTMLInputElement>('input[type=text]') as HTMLInputElement;
    expect(name.value).toBe('Gym');
    expect(root.querySelector<HTMLLabelElement>(`label[for="${name.id}"]`)).not.toBeNull();

    name.value = '  Pilates  ';
    name.dispatchEvent(new Event('change', { bubbles: true }));
    await fixture.whenStable();
    expect(events.name).toHaveBeenCalledWith('Pilates');

    const remove = root.querySelector('button') as HTMLButtonElement;
    expect(remove.getAttribute('aria-label')).toBe('Remove Gym');
    remove.click();
    expect(events.remove).toHaveBeenCalledTimes(1);
  });

  it('does not rename to an empty name and restores the field', async () => {
    const { fixture, root, events } = await render({ name: 'Gym', editable: true });
    const name = root.querySelector<HTMLInputElement>('input[type=text]') as HTMLInputElement;
    name.value = '   ';
    name.dispatchEvent(new Event('change', { bubbles: true }));
    await fixture.whenStable();
    expect(events.name).not.toHaveBeenCalled();
    expect(name.value).toBe('Gym');
  });

  it('passes the maximum on to the amount field', async () => {
    const { root } = await render({ max: 30_000 });
    expect(amountInput(root).max).toBe('30000');
  });
});
