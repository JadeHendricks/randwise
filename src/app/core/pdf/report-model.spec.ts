import { normaliseSpaces } from '../../testing/text';
import { formatReportValue, percent, percentPoints, rand, randWhole, text } from './report-model';

describe('formatReportValue', () => {
  const format = (value: Parameters<typeof formatReportValue>[0]) =>
    normaliseSpaces(formatReportValue(value));

  it('formats rand the en-ZA way', () => {
    expect(format(rand(25141.88))).toBe('R 25 141,88');
  });

  it('appends a suffix after the amount', () => {
    expect(format(rand(25141.88, 'a month'))).toBe('R 25 141,88 a month');
  });

  it('drops the cents for whole rand', () => {
    expect(format(randWhole(8250))).toBe('R 8 250');
    expect(format(randWhole(8250, 'a year'))).toBe('R 8 250 a year');
  });

  it('formats negative amounts with a minus sign', () => {
    expect(format(rand(-1500.5))).toMatch(/^[-\u2212]R 1 500,50$/);
  });

  it('formats a fraction as a percentage, with the digits asked for', () => {
    expect(format(percent(0.16))).toBe('16%');
    expect(format(percent(0.165, 1))).toBe('16,5%');
    expect(format(percent(0.1234, 2))).toBe('12,34%');
  });

  it('passes text through unchanged', () => {
    expect(formatReportValue(text('Age 55'))).toBe('Age 55');
  });
});

describe('percentPoints', () => {
  it('is the same conversion the pages use for *Percent fields', () => {
    expect(percentPoints(7)).toEqual(percent(0.07));
    expect(percentPoints(7.5, 2)).toEqual(percent(0.075, 2));
  });
});
