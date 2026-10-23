import { normaliseSpaces } from '../../testing/text';
import { formatPercent, formatRand } from './format-rand';

describe('format-rand', () => {
  it('formats rand with a space thousands separator and decimal comma', () => {
    expect(normaliseSpaces(formatRand(0))).toBe('R 0,00');
    expect(normaliseSpaces(formatRand(1234.56))).toBe('R 1 234,56');
    expect(normaliseSpaces(formatRand(25141.88))).toBe('R 25 141,88');
  });

  it('formats negative rand', () => {
    expect(normaliseSpaces(formatRand(-50))).toContain('50,00');
    expect(normaliseSpaces(formatRand(-50))).toContain('-');
  });

  it('formats percentages with up to one decimal by default', () => {
    expect(normaliseSpaces(formatPercent(0.16))).toBe('16%');
    expect(normaliseSpaces(formatPercent(0.1566))).toBe('15,7%');
  });

  it('honours maxDigits', () => {
    expect(normaliseSpaces(formatPercent(0.1566, 0))).toBe('16%');
    expect(normaliseSpaces(formatPercent(0.504, 2))).toBe('50,4%');
  });
});
