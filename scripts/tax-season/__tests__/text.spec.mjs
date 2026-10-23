import { describe, expect, it } from 'vitest';

import { norm, parsePercent, parseRand, splitRange } from '../lib/text.mjs';

describe('norm', () => {
  it('turns special spaces into plain ones and collapses runs', () => {
    expect(norm('  R17\u00a0820 \u202f per\u2009year \n ')).toBe('R17 820 per year');
  });

  it('gives an empty string for null or undefined', () => {
    expect(norm(null)).toBe('');
    expect(norm(undefined)).toBe('');
  });
});

describe('parseRand', () => {
  it('reads rand amounts with ordinary and special space separators', () => {
    expect(parseRand('R17 820')).toBe(17820);
    expect(parseRand('17 820')).toBe(17820);
    expect(parseRand('R17\u00a0820')).toBe(17820);
    expect(parseRand('1\u202f878\u202f601')).toBe(1878601);
    expect(parseRand('R 212 544 annually')).toBe(212544);
    expect(parseRand('R50000')).toBe(50000);
  });

  it('reads the number at the start of a longer cell', () => {
    expect(parseRand('1 878 601 and above')).toBe(1878601);
  });

  it('rejects text without an amount and amounts with decimals', () => {
    expect(parseRand('')).toBeNull();
    expect(parseRand('n/a')).toBeNull();
    expect(parseRand('R2.7 million')).toBeNull();
    expect(parseRand('R2,7 million')).toBeNull();
  });
});

describe('parsePercent', () => {
  it('turns a percentage into a fraction without float noise', () => {
    expect(parsePercent('18%')).toBe(0.18);
    expect(parsePercent('27.5%')).toBe(0.275);
    expect(parsePercent('45% of taxable income above 1 878 600')).toBe(0.45);
    expect(parsePercent('7,25 %')).toBe(0.0725);
    expect(parsePercent('0%')).toBe(0);
  });

  it('gives null when there is no percentage', () => {
    expect(parsePercent('R17 820')).toBeNull();
  });
});

describe('splitRange', () => {
  it('splits on an en dash, an em dash or a hyphen', () => {
    expect(splitRange('245 101 \u2013 383 100')).toEqual([245101, 383100]);
    expect(splitRange('1 \u2014 245 100')).toEqual([1, 245100]);
    expect(splitRange('1-245 100')).toEqual([1, 245100]);
    expect(splitRange('245\u00a0101\u00a0\u2013\u00a0383\u00a0100')).toEqual([245101, 383100]);
  });

  it('gives null when the text is not a two-number range', () => {
    expect(splitRange('1 878 601 and above')).toBeNull();
    expect(splitRange('245 100')).toBeNull();
    expect(splitRange('a \u2013 b')).toBeNull();
  });
});
