import { TestBed } from '@angular/core/testing';

import { normaliseSpaces } from '../../../testing/text';
import { DotColumn, DotMatrix } from './dot-matrix';

describe('DotMatrix', () => {
  const COLUMNS: DotColumn[] = [
    { label: 'Gross', value: 30_000 },
    { label: 'Net', value: 15_000 },
    { label: 'Tax', value: 100 },
  ];

  async function create(columns: readonly DotColumn[], inputs: Record<string, unknown> = {}) {
    const fixture = TestBed.createComponent(DotMatrix);
    fixture.componentRef.setInput('label', 'Gross split');
    fixture.componentRef.setInput('columns', columns);
    for (const [key, val] of Object.entries(inputs)) {
      fixture.componentRef.setInput(key, val);
    }
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  const columnEls = (el: HTMLElement) => Array.from(el.querySelectorAll('.rw-dot-matrix__column'));
  const onCounts = (el: HTMLElement) =>
    columnEls(el).map((c) => c.querySelectorAll('.rw-dot-matrix__dot--on').length);
  const ariaLabel = (el: HTMLElement) => normaliseSpaces(el.querySelector('svg')?.getAttribute('aria-label'));
  const tableRows = (el: HTMLElement) =>
    Array.from(el.querySelectorAll('.rw-visually-hidden tbody tr')).map((tr) =>
      Array.from(tr.children).map((c) => normaliseSpaces(c.textContent)),
    );

  it('fills dots in proportion to the largest value', async () => {
    const el = await create(COLUMNS);
    expect(onCounts(el)).toEqual([8, 4, 1]);
    expect(el.querySelectorAll('.rw-dot-matrix__dot')).toHaveLength(24);
    expect(el.querySelector('svg')?.getAttribute('role')).toBe('img');
    expect(el.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 30 80');
  });

  it('shows one dot for a tiny positive value', async () => {
    const el = await create([
      { label: 'Big', value: 1_000_000 },
      { label: 'Tiny', value: 1 },
    ]);
    expect(onCounts(el)).toEqual([8, 1]);
  });

  it('uses an explicit max and never exceeds the row count', async () => {
    const el = await create(COLUMNS, { max: 60_000 });
    expect(onCounts(el)).toEqual([4, 2, 1]);
    const over = await create(COLUMNS, { max: 10 });
    expect(onCounts(over)).toEqual([8, 8, 8]);
  });

  it('ignores an unusable max and falls back to the largest value', async () => {
    expect(onCounts(await create(COLUMNS, { max: 0 }))).toEqual([8, 4, 1]);
    expect(onCounts(await create(COLUMNS, { max: Number.NaN }))).toEqual([8, 4, 1]);
  });

  it('leaves every dot off and says "no data" when all values are zero', async () => {
    const el = await create([
      { label: 'A', value: 0 },
      { label: 'B', value: 0 },
    ]);
    expect(onCounts(el)).toEqual([0, 0]);
    expect(el.querySelectorAll('.rw-dot-matrix__dot--off')).toHaveLength(16);
    expect(ariaLabel(el)).toBe('Gross split: no data');
  });

  it('handles empty data', async () => {
    const el = await create([]);
    expect(el.querySelectorAll('.rw-dot-matrix__dot')).toHaveLength(0);
    expect(ariaLabel(el)).toBe('Gross split: no data');
    expect(tableRows(el)).toEqual([]);
  });

  it('clamps negative, NaN and infinite values to 0', async () => {
    const el = await create([
      { label: 'Good', value: 100 },
      { label: 'Negative', value: -5 },
      { label: 'Nan', value: Number.NaN },
      { label: 'Infinite', value: Number.POSITIVE_INFINITY },
    ]);
    expect(onCounts(el)).toEqual([8, 0, 0, 0]);
    expect(tableRows(el).map((r) => r[1])).toEqual(['R 100,00', 'R 0,00', 'R 0,00', 'R 0,00']);
  });

  it('rounds and clamps rows to 1-20', async () => {
    const dotsPerColumn = (el: HTMLElement) => columnEls(el)[0].querySelectorAll('circle').length;
    expect(dotsPerColumn(await create(COLUMNS, { rows: 0 }))).toBe(1);
    expect(dotsPerColumn(await create(COLUMNS, { rows: -4 }))).toBe(1);
    expect(dotsPerColumn(await create(COLUMNS, { rows: 99 }))).toBe(20);
    expect(dotsPerColumn(await create(COLUMNS, { rows: 5.6 }))).toBe(6);
    expect(dotsPerColumn(await create(COLUMNS, { rows: Number.NaN }))).toBe(8);
  });

  it('marks the highlighted column and states it in text', async () => {
    const el = await create(COLUMNS, { highlight: 1 });
    const cols = columnEls(el);
    expect(cols[1].classList).toContain('rw-dot-matrix__column--highlight');
    expect(cols[0].classList).toContain('rw-dot-matrix__column--dim');
    expect(cols[2].classList).toContain('rw-dot-matrix__column--dim');
    expect(cols[1].classList).not.toContain('rw-dot-matrix__column--dim');
    expect(ariaLabel(el)).toContain('highlighted: Net');
    expect(tableRows(el).map((r) => r[2])).toEqual(['No', 'Yes', 'No']);
  });

  it('ignores an out-of-range highlight', async () => {
    for (const highlight of [3, -1, 1.5]) {
      const el = await create(COLUMNS, { highlight });
      expect(el.querySelector('.rw-dot-matrix__column--highlight')).toBeNull();
      expect(el.querySelector('.rw-dot-matrix__column--dim')).toBeNull();
      expect(ariaLabel(el)).not.toContain('highlighted');
    }
  });

  it('lists every column in the hidden table and the aria-label', async () => {
    const el = await create(COLUMNS);
    expect(tableRows(el)).toEqual([
      ['Gross', 'R 30 000,00', 'No'],
      ['Net', 'R 15 000,00', 'No'],
      ['Tax', 'R 100,00', 'No'],
    ]);
    expect(ariaLabel(el)).toBe('Gross split: Gross R 30 000,00, Net R 15 000,00, Tax R 100,00');
  });

  it('uses a custom format function', async () => {
    const el = await create([{ label: 'Hours', value: 8 }], { format: (n: number) => `${n} h` });
    expect(tableRows(el)[0][1]).toBe('8 h');
  });
});
