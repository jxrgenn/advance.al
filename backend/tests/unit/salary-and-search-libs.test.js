/**
 * Unit tests for the shared salary + search helpers (fix batch A).
 *
 *   lib/salary.js      — stored salaries are ANNUAL; every consumer renders /
 *                        compares through these helpers (O-1, O-4, O-6, O-46)
 *   lib/searchRegex.js — escaped, diacritic-insensitive search patterns (O-11)
 *
 * Pure functions — no DB.
 */
import { describe, it, expect } from '@jest/globals';
import {
  formatSalary,
  stripHiddenSalary,
  annualToMonthly,
  monthlyToAnnual,
  convertApprox,
  jobSalaryMonthlyIn,
  isSalaryHidden,
} from '../../src/lib/salary.js';
import { diacriticInsensitivePattern, MAX_SEARCH_TERM_LENGTH } from '../../src/lib/searchRegex.js';

describe('lib/salary.js — formatSalary (stored annual → monthly display)', () => {
  it('formats a range per month with thousands separators', () => {
    expect(formatSalary({ min: 9600, max: 18000, currency: 'EUR' })).toBe('800-1,500 EUR/muaj');
  });

  it('formats a single value when min === max', () => {
    expect(formatSalary({ min: 12000, max: 12000, currency: 'ALL' })).toBe('1,000 ALL/muaj');
  });

  it('formats open-ended ranges', () => {
    expect(formatSalary({ min: 9600, currency: 'EUR' })).toBe('Nga 800 EUR/muaj');
    expect(formatSalary({ max: 1800000, currency: 'ALL' })).toBe('Deri në 150,000 ALL/muaj');
  });

  it('renders the yearly view unchanged when asked', () => {
    expect(formatSalary({ min: 9600, max: 18000, currency: 'EUR' }, 'yearly')).toBe('9,600-18,000 EUR/vit');
  });

  it('returns null for hidden salaries, missing numbers and no salary', () => {
    expect(formatSalary({ min: 9600, max: 18000, currency: 'EUR', showPublic: false })).toBeNull();
    expect(formatSalary({ currency: 'EUR', negotiable: true, showPublic: true })).toBeNull();
    expect(formatSalary({ min: 0, max: 0, currency: 'EUR' })).toBeNull();
    expect(formatSalary(null)).toBeNull();
  });

  it('falls back to EUR for an unknown currency instead of printing it', () => {
    expect(formatSalary({ min: 12000, max: 24000, currency: 'USD' })).toBe('1,000-2,000 EUR/muaj');
  });
});

describe('lib/salary.js — unit + currency helpers', () => {
  it('converts between monthly and annual with rounding', () => {
    expect(annualToMonthly(12500)).toBe(1042);
    expect(monthlyToAnnual(1042)).toBe(12504);
    expect(monthlyToAnnual(800)).toBe(9600);
  });

  it('stripHiddenSalary drops the numbers only when hidden', () => {
    const shown = { min: 1, max: 2, currency: 'EUR', negotiable: false, showPublic: true };
    expect(stripHiddenSalary(shown)).toBe(shown);
    expect(stripHiddenSalary({ min: 1, max: 2, currency: 'ALL', negotiable: true, showPublic: false }))
      .toEqual({ currency: 'ALL', negotiable: true, showPublic: false });
    expect(stripHiddenSalary(undefined)).toBeNull();
    expect(isSalaryHidden({ showPublic: false })).toBe(true);
    expect(isSalaryHidden({})).toBe(false);
  });

  it('convertApprox converts EUR <-> ALL at ~100 and refuses unsupported pairs', () => {
    expect(convertApprox(10, 'EUR', 'ALL')).toBe(1000);
    expect(convertApprox(1000, 'ALL', 'EUR')).toBe(10);
    expect(convertApprox(10, 'EUR', 'EUR')).toBe(10);
    expect(convertApprox(10, 'USD', 'EUR')).toBeNull();
  });

  it('jobSalaryMonthlyIn gives the monthly range in the target currency', () => {
    expect(jobSalaryMonthlyIn({ min: 12000, max: 24000, currency: 'EUR' }, 'ALL')).toEqual({ min: 100000, max: 200000 });
    expect(jobSalaryMonthlyIn({ min: 12000, currency: 'EUR' })).toEqual({ min: 1000, max: 1000 });
    expect(jobSalaryMonthlyIn({ currency: 'EUR' }, 'EUR')).toBeNull();
    expect(jobSalaryMonthlyIn({ min: 12000, max: 24000, currency: 'EUR' }, 'USD')).toBeNull();
  });
});

describe('lib/searchRegex.js — diacriticInsensitivePattern', () => {
  const matches = (term, text) => new RegExp(diacriticInsensitivePattern(term), 'i').test(text);

  it('matches Albanian ë / ç typed without diacritics (and the reverse)', () => {
    expect(matches('Tirane', 'Tiranë')).toBe(true);
    expect(matches('durres', 'Durrës')).toBe(true);
    expect(matches('KORCE', 'Korçë')).toBe(true);
    expect(matches('kuzhinier', 'Kuzhinierë me përvojë')).toBe(true);
    expect(matches('Tiranë', 'TIRANE')).toBe(true);
    expect(matches('Korçë', 'korce')).toBe(true);
  });

  it('does not over-match unrelated letters', () => {
    expect(matches('Tirane', 'Tirana')).toBe(false);
    expect(matches('Vlore', 'Vlora')).toBe(false);
  });

  it('escapes regex metacharacters before folding (literal match, no injection)', () => {
    expect(diacriticInsensitivePattern('a.*b')).toBe('a\\.\\*b');
    expect(matches('C++ (senior)', 'Zhvillues C++ (senior)')).toBe(true);
    expect(matches('C++ (senior)', 'Zhvillues CXX senior')).toBe(false);
    expect(() => new RegExp(diacriticInsensitivePattern('((((['))).not.toThrow();
  });

  it('folds the escaped pattern into explicit character classes', () => {
    expect(diacriticInsensitivePattern('ce')).toBe('[cçCÇ][eëEË]');
  });

  it('returns "" for non-strings, blanks and null bytes only; strips null bytes and caps length', () => {
    expect(diacriticInsensitivePattern(['a', 'b'])).toBe('');
    expect(diacriticInsensitivePattern({ $ne: null })).toBe('');
    expect(diacriticInsensitivePattern(undefined)).toBe('');
    expect(diacriticInsensitivePattern('   ')).toBe('');
    expect(diacriticInsensitivePattern('\0\0')).toBe('');
    expect(diacriticInsensitivePattern('ab\0x')).toBe('abx');
    expect(diacriticInsensitivePattern('x'.repeat(500))).toBe('x'.repeat(MAX_SEARCH_TERM_LENGTH));
  });

  it('normalizes a decomposed ë (e + U+0308) before folding', () => {
    expect(matches('Tiranë', 'Tiranë')).toBe(true);
  });
});
