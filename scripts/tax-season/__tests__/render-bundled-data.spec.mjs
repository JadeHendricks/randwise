import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { registerNewYears, renderBundledData } from '../lib/render-bundled-data.mjs';
import { PATHS } from '../lib/paths.mjs';
import { MEMORY_PATHS, createMemoryFs } from './helpers.mjs';

describe('renderBundledData', () => {
  it('reproduces the committed bundled-data.ts exactly for the shipped year', () => {
    const committed = readFileSync(PATHS.bundledData, 'utf8').replace(/\r\n/g, '\n');
    expect(renderBundledData([2027])).toBe(committed);
  });

  it('renders one entry per line for two years', () => {
    const text = renderBundledData([2027, 2028]);
    expect(text).toContain("import taxYear2028 from '../../../assets/data/tax-years/2028.json';");
    expect(text).toContain(
      [
        '  taxYears: [',
        "    { fileName: '2027.json', data: taxYear2027 },",
        "    { fileName: '2028.json', data: taxYear2028 },",
        '  ],',
      ].join('\n'),
    );
  });

  it('orders years ascending whatever the input order, and ignores duplicates', () => {
    expect(renderBundledData([2028, 2027, 2027])).toBe(renderBundledData([2027, 2028]));
    const text = renderBundledData([2029, 2027, 2028]);
    expect(text.indexOf('taxYear2027 from')).toBeLessThan(text.indexOf('taxYear2028 from'));
    expect(text.indexOf('taxYear2028 from')).toBeLessThan(text.indexOf('taxYear2029 from'));
  });

  it('rejects an empty or invalid list', () => {
    expect(() => renderBundledData([])).toThrow();
    expect(() => renderBundledData([20.5])).toThrow();
  });
});

describe('registerNewYears', () => {
  const current = renderBundledData([2027]);

  it('adds a new year found on disk and keeps CRLF line endings', async () => {
    const fs = createMemoryFs({
      [MEMORY_PATHS.bundledData]: current.replace(/\n/g, '\r\n'),
      [MEMORY_PATHS.taxYearFile(2027)]: '{}',
      [MEMORY_PATHS.taxYearFile(2028)]: '{}',
      [`${MEMORY_PATHS.taxYearsDir}/notes.txt`]: 'ignored',
    });
    const result = await registerNewYears({ fs, paths: MEMORY_PATHS });
    expect(result).toEqual({ years: [2027, 2028], written: true });
    const written = fs.files.get(MEMORY_PATHS.bundledData);
    expect(written).toContain('taxYear2028');
    expect(written.replace(/\r\n/g, '')).not.toContain('\n');
  });

  it('does not write when nothing changed', async () => {
    const fs = createMemoryFs({
      [MEMORY_PATHS.bundledData]: current,
      [MEMORY_PATHS.taxYearFile(2027)]: '{}',
    });
    const result = await registerNewYears({ fs, paths: MEMORY_PATHS });
    expect(result).toEqual({ years: [2027], written: false });
  });

  it('does nothing when there are no tax-year files', async () => {
    const fs = createMemoryFs({ [MEMORY_PATHS.bundledData]: current });
    expect(await registerNewYears({ fs, paths: MEMORY_PATHS })).toEqual({
      years: [],
      written: false,
    });
  });
});
