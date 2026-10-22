import { normaliseSpaces } from '../../testing/text';
import { formatLongDate, formatShortDate } from './format-date';

describe('date formatting', () => {
  it('formats short dates in en-ZA', () => {
    expect(normaliseSpaces(formatShortDate('2026-10-22'))).toBe('22 Oct 2026');
    expect(normaliseSpaces(formatShortDate('2027-02-28'))).toBe('28 Feb 2027');
  });

  it('formats long dates in en-ZA', () => {
    expect(normaliseSpaces(formatLongDate('2026-10-22'))).toBe('22 October 2026');
    expect(normaliseSpaces(formatLongDate('2028-02-29'))).toBe('29 February 2028');
  });

  it('rejects invalid dates', () => {
    expect(() => formatShortDate('2026-02-30')).toThrow();
  });
});
