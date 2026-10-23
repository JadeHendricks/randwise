import { normaliseSpaces } from '../../testing/text';
import { formatPercent, formatRand, formatRandCompact, formatRandWhole } from './format-rand';

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

  it('formats whole rand without cents', () => {
    expect(normaliseSpaces(formatRandWhole(0))).toBe('R 0');
    expect(normaliseSpaces(formatRandWhole(8_250))).toBe('R 8 250');
    expect(normaliseSpaces(formatRandWhole(75_425.64))).toBe('R 75 426');
    expect(normaliseSpaces(formatRandWhole(1_234_567.4))).toBe('R 1 234 567');
  });

  it('formats compact rand for chart axes', () => {
    expect(normaliseSpaces(formatRandCompact(0))).toBe('R 0');
    expect(normaliseSpaces(formatRandCompact(12_500))).toBe('R 12,5K');
    expect(normaliseSpaces(formatRandCompact(50_000))).toBe('R 50K');
    expect(normaliseSpaces(formatRandCompact(1_500_000))).toBe('R 1,5M');
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
