/**
 * Phase 28 — coverage push for cvParsingService.js pure-function internals.
 *
 * The _internal export was added specifically so tests could reach helpers
 * that the public parseQuickUserCV / parseUserProfileCV paths don't always
 * exercise (e.g. an enum-invalid `experience` field falls back to
 * calculateExperienceFromHistory, but most happy-path fixtures supply a
 * valid enum and skip the calculation entirely).
 *
 * Targets:
 *   - extractTextFromCV: empty buffer + buffer-too-small (L50-52)
 *   - calculateExperienceFromHistory: every band (L257-280)
 *   - sanitizeParsedProfile: experience-fallback branch (L344)
 */

import { describe, it, expect } from '@jest/globals';
import { _internal } from '../../src/services/cvParsingService.js';

const { extractTextFromCV, calculateExperienceFromHistory, sanitizeParsedProfile } = _internal;

describe('cvParsingService — extractTextFromCV guard rails', () => {
  it('throws when buffer is null', async () => {
    await expect(extractTextFromCV(null)).rejects.toThrow(/empty or too small/);
  });

  it('throws when buffer is too small (< 4 bytes)', async () => {
    await expect(extractTextFromCV(Buffer.from([0x25, 0x50, 0x44]))).rejects.toThrow(/empty or too small/);
  });
});

describe('cvParsingService — calculateExperienceFromHistory', () => {
  it('returns null for empty / undefined input', () => {
    expect(calculateExperienceFromHistory(null)).toBeNull();
    expect(calculateExperienceFromHistory(undefined)).toBeNull();
    expect(calculateExperienceFromHistory([])).toBeNull();
  });

  it('skips entries with malformed startDate', () => {
    const r = calculateExperienceFromHistory([
      { startDate: 'not-a-date', endDate: '2025-01' },
      { startDate: '2024-01-bogus', endDate: '2025-01' },
    ]);
    // No valid entries → totalMonths stays 0 → years 0 → '0-1 vjet'
    expect(r).toBe('0-1 vjet');
  });

  it('uses now() for current-job entries (isCurrentJob=true)', () => {
    const fiveYearsAgo = new Date();
    fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
    const startStr = `${fiveYearsAgo.getFullYear()}-${String(fiveYearsAgo.getMonth() + 1).padStart(2, '0')}`;
    const r = calculateExperienceFromHistory([
      { startDate: startStr, isCurrentJob: true },
    ]);
    // ~5 years → '5-10 vjet'
    expect(r).toBe('5-10 vjet');
  });

  it('returns "1-2 vjet" for ~14 months', () => {
    const r = calculateExperienceFromHistory([
      { startDate: '2024-01', endDate: '2025-03' }, // 14 months
    ]);
    expect(r).toBe('1-2 vjet');
  });

  it('returns "2-5 vjet" for 36 months', () => {
    const r = calculateExperienceFromHistory([
      { startDate: '2022-01', endDate: '2025-01' },
    ]);
    expect(r).toBe('2-5 vjet');
  });

  it('returns "10+ vjet" for 12 years', () => {
    const r = calculateExperienceFromHistory([
      { startDate: '2013-01', endDate: '2025-01' },
    ]);
    expect(r).toBe('10+ vjet');
  });

  it('sums multiple entries', () => {
    const r = calculateExperienceFromHistory([
      { startDate: '2020-01', endDate: '2021-01' }, // 12 months
      { startDate: '2022-01', endDate: '2024-01' }, // 24 months
    ]);
    // 36 months → 3 years → '2-5 vjet'
    expect(r).toBe('2-5 vjet');
  });

  it('ignores negative-duration entries (end before start)', () => {
    const r = calculateExperienceFromHistory([
      { startDate: '2024-01', endDate: '2023-01' }, // negative
    ]);
    expect(r).toBe('0-1 vjet');
  });

  it('uses endDate when isCurrentJob is false but endDate is malformed → falls back to now()', () => {
    const r = calculateExperienceFromHistory([
      { startDate: '2010-01', endDate: 'bogus-date', isCurrentJob: false },
    ]);
    // Falls into the !DATE_REGEX.test(endDate) branch → end = now() → 10+ years
    expect(r).toBe('10+ vjet');
  });
});

describe('cvParsingService — sanitizeParsedProfile experience fallback', () => {
  it('uses calculateExperienceFromHistory when parsed.experience is missing', () => {
    const r = sanitizeParsedProfile({
      workExperience: [
        { position: 'Dev', company: 'Co', startDate: '2024-01', endDate: '2025-03' },
      ],
    });
    expect(r.experience).toBe('1-2 vjet');
  });

  it('uses calculateExperienceFromHistory when parsed.experience is an unknown string', () => {
    const r = sanitizeParsedProfile({
      experience: 'gibberish-not-in-enum',
      workExperience: [
        { position: 'Dev', company: 'Co', startDate: '2022-01', endDate: '2025-01' },
      ],
    });
    expect(r.experience).toBe('2-5 vjet');
  });

  it('falls back to "0-1 vjet" when no work history and no valid enum', () => {
    const r = sanitizeParsedProfile({});
    expect(r.experience).toBe('0-1 vjet');
  });

  it('preserves a valid enum value as-is (no recalc)', () => {
    const r = sanitizeParsedProfile({ experience: '5-10 vjet' });
    expect(r.experience).toBe('5-10 vjet');
  });
});
