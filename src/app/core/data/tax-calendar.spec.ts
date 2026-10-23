import {
  daysBetween,
  isIsoDate,
  isLeapYear,
  lastDayOfFebruary,
  nextTaxYearToScout,
  parseIsoDate,
  pickTaxYear,
  taxYearEndingOn,
  taxYearLabel,
  taxYearPeriod,
  toLocalIsoDate,
} from './tax-calendar';

describe('tax calendar', () => {
  it('assigns dates to the tax year they fall in', () => {
    expect(taxYearEndingOn('2027-02-28')).toBe(2027);
    expect(taxYearEndingOn('2026-03-01')).toBe(2027);
    expect(taxYearEndingOn('2026-02-28')).toBe(2026);
    expect(taxYearEndingOn('2028-02-29')).toBe(2028);
    expect(taxYearEndingOn('2028-03-01')).toBe(2029);
  });

  it('knows leap years and the last day of February', () => {
    expect(lastDayOfFebruary(2027)).toBe(28);
    expect(lastDayOfFebruary(2028)).toBe(29);
    expect(lastDayOfFebruary(2100)).toBe(28);
    expect(lastDayOfFebruary(2000)).toBe(29);
    expect(isLeapYear(2100)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
  });

  it('builds leap-aware tax-year periods', () => {
    expect(taxYearPeriod(2027)).toEqual({ start: '2026-03-01', end: '2027-02-28' });
    expect(taxYearPeriod(2028)).toEqual({ start: '2027-03-01', end: '2028-02-29' });
  });

  it('accepts only strict, real ISO dates', () => {
    expect(isIsoDate('2026-03-01')).toBe(true);
    expect(isIsoDate('2028-02-29')).toBe(true);
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('2027-02-29')).toBe(false);
    expect(isIsoDate('2026-2-1')).toBe(false);
    expect(isIsoDate('2026-13-01')).toBe(false);
    expect(isIsoDate('')).toBe(false);
    expect(isIsoDate(20260301)).toBe(false);
  });

  it('converts to a local ISO date without shifting across midnight', () => {
    expect(toLocalIsoDate(new Date(2026, 2, 1, 0, 30))).toBe('2026-03-01');
    expect(toLocalIsoDate(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31');
  });

  it('parses ISO dates to local midnight and rejects invalid ones', () => {
    const date = parseIsoDate('2026-10-22');
    expect([date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()]).toEqual([
      2026, 9, 22, 0,
    ]);
    expect(() => parseIsoDate('2026-02-30')).toThrow();
  });

  it('labels tax years', () => {
    expect(taxYearLabel(2027)).toBe('2026/27');
    expect(taxYearLabel(2100)).toBe('2099/00');
  });

  describe('nextTaxYearToScout', () => {
    it('is closed until 20 February', () => {
      expect(nextTaxYearToScout('2027-02-19')).toBeNull();
      expect(nextTaxYearToScout('2027-01-10')).toBeNull();
      expect(nextTaxYearToScout('2026-10-22')).toBeNull();
    });

    it('opens on 20 February and stays open to the end of the tax year', () => {
      expect(nextTaxYearToScout('2027-02-20')).toBe(2028);
      expect(nextTaxYearToScout('2027-02-28')).toBe(2028);
    });

    it('closes again on 1 March', () => {
      expect(nextTaxYearToScout('2027-03-01')).toBeNull();
    });

    it('handles the last day of a leap-year February', () => {
      expect(nextTaxYearToScout('2028-02-29')).toBe(2029);
    });
  });

  describe('daysBetween', () => {
    it('counts whole days', () => {
      expect(daysBetween('2026-10-22', '2026-10-22')).toBe(0);
      expect(daysBetween('2026-10-22', '2026-10-29')).toBe(7);
      expect(daysBetween('2026-10-22', '2026-10-30')).toBe(8);
    });

    it('counts across a month end and a leap day', () => {
      expect(daysBetween('2026-10-28', '2026-11-04')).toBe(7);
      expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2);
      expect(daysBetween('2027-02-28', '2027-03-01')).toBe(1);
    });

    it('is not skewed by a daylight-saving change', () => {
      expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
      expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2);
      expect(daysBetween('2026-03-01', '2026-11-01')).toBe(245);
    });

    it('is negative when the second date is earlier', () => {
      expect(daysBetween('2026-10-29', '2026-10-22')).toBe(-7);
    });

    it('rejects an invalid date', () => {
      expect(() => daysBetween('2026-02-30', '2026-03-01')).toThrow();
    });
  });

  describe('pickTaxYear', () => {
    it('uses the file that covers today', () => {
      expect(pickTaxYear([2026, 2027], '2026-10-22')).toEqual({ year: 2027, fallback: false });
      expect(pickTaxYear([2027], '2027-02-28')).toEqual({ year: 2027, fallback: false });
    });

    it('falls back to the latest ended year after all files', () => {
      expect(pickTaxYear([2026, 2027], '2027-03-01')).toEqual({ year: 2027, fallback: true });
    });

    it('falls back to the earliest year when every file is in the future', () => {
      expect(pickTaxYear([2028, 2027], '2026-01-15')).toEqual({ year: 2027, fallback: true });
    });

    it('uses the latest ended year when today falls in a gap', () => {
      expect(pickTaxYear([2025, 2026, 2029], '2027-06-01')).toEqual({
        year: 2026,
        fallback: true,
      });
    });

    it('returns null for an empty list', () => {
      expect(pickTaxYear([], '2026-10-22')).toBeNull();
    });
  });
});
