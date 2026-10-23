import { TestBed } from '@angular/core/testing';

import { normaliseSpaces } from '../../../testing/text';
import { RingGauge } from './ring-gauge';

describe('RingGauge', () => {
  async function create(value: number, inputs: Record<string, unknown> = {}) {
    const fixture = TestBed.createComponent(RingGauge);
    fixture.componentRef.setInput('label', 'Take-home share');
    fixture.componentRef.setInput('value', value);
    for (const [key, val] of Object.entries(inputs)) {
      fixture.componentRef.setInput(key, val);
    }
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  const dash = (el: HTMLElement) => el.querySelector('.rw-ring-gauge__value')?.getAttribute('stroke-dasharray');
  const ariaLabel = (el: HTMLElement) => normaliseSpaces(el.querySelector('svg')?.getAttribute('aria-label'));
  const centre = (el: HTMLElement) => normaliseSpaces(el.querySelector('.rw-ring-gauge__centre')?.textContent);
  const tableRows = (el: HTMLElement) =>
    Array.from(el.querySelectorAll('.rw-visually-hidden tbody tr')).map((tr) =>
      Array.from(tr.children).map((c) => normaliseSpaces(c.textContent)),
    );

  it('draws 0, 50.4 and 100 as the matching dash length', async () => {
    expect(dash(await create(0))).toBe('0 100');
    expect(dash(await create(50.4))).toBe('50.4 100');
    expect(dash(await create(100))).toBe('100 100');
  });

  it('caps values above 100 at 100', async () => {
    const el = await create(150);
    expect(dash(el)).toBe('100 100');
    expect(ariaLabel(el)).toBe('Take-home share: 100%');
  });

  it('clamps negative, NaN and infinite values to 0', async () => {
    for (const bad of [-5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const el = await create(bad);
      expect(dash(el)).toBe('0 100');
      expect(ariaLabel(el)).toBe('Take-home share: 0%');
    }
  });

  it('labels the image and mirrors the numbers in a hidden table', async () => {
    const el = await create(61);
    const svg = el.querySelector('svg');
    expect(svg?.getAttribute('role')).toBe('img');
    expect(ariaLabel(el)).toBe('Take-home share: 61%');
    expect(normaliseSpaces(el.querySelector('caption')?.textContent)).toBe('Take-home share');
    expect(tableRows(el)).toEqual([
      ['Value', '61%'],
      ['Centre label', '61%'],
    ]);
  });

  it('defaults the centre label to the whole-number percent', async () => {
    expect(centre(await create(50.4))).toBe('50%');
  });

  it('shows a custom centre label and caption, hidden from assistive tech', async () => {
    const el = await create(84, { centreLabel: 'R 25 141,88', caption: 'of gross' });
    expect(centre(el)).toBe('R 25 141,88');
    expect(normaliseSpaces(el.querySelector('.rw-ring-gauge__caption')?.textContent)).toBe('of gross');
    expect(el.querySelector('.rw-ring-gauge__text')?.getAttribute('aria-hidden')).toBe('true');
    expect(tableRows(el)).toEqual([
      ['Value', '84%'],
      ['Centre label', 'R 25 141,88'],
      ['Caption', 'of gross'],
    ]);
  });

  it('omits the caption when none is given', async () => {
    const el = await create(10);
    expect(el.querySelector('.rw-ring-gauge__caption')).toBeNull();
  });

  it('applies the tone modifier, accent by default', async () => {
    expect((await create(10)).querySelector('.rw-ring-gauge__value--accent')).not.toBeNull();
    expect((await create(10, { tone: 'rose' })).querySelector('.rw-ring-gauge__value--rose')).not.toBeNull();
  });
});
