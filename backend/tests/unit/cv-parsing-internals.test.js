/**
 * Unit tests for cvParsingService internal helpers (Phase 28 — Phase 6).
 *
 * Baseline coverage 2.7% → push toward 90%+ on the pure helpers.
 *
 * Targets the pure functions exposed via the `_internal` export hook:
 *   - sanitizeParsedProfile: validates/clamps/coerces every field, drops
 *     work + edu entries that are missing required position/company/degree/institution
 *   - calculateExperienceFromHistory: maps months-of-work to enum buckets,
 *     handles isCurrentJob with "now", skips malformed dates
 *   - extractTextFromCV: magic-byte sniffing for PDF (%PDF) vs DOCX (PK)
 *
 * The OpenAI calls (parseWithAI, parseProfileWithAI) are NOT exercised here —
 * those need the snapshot-replay infra and real fixtures.
 */

import { describe, it, expect } from '@jest/globals';
import { _internal } from '../../src/services/cvParsingService.js';

const {
  sanitizeParsedProfile,
  calculateExperienceFromHistory,
  extractTextFromCV,
  EXPERIENCE_ENUMS,
  PROFICIENCY_ENUMS,
  DATE_REGEX,
} = _internal;

describe('DATE_REGEX', () => {
  it('matches valid YYYY-MM strings', () => {
    expect(DATE_REGEX.test('2020-01')).toBe(true);
    expect(DATE_REGEX.test('2020-12')).toBe(true);
    expect(DATE_REGEX.test('1999-09')).toBe(true);
  });

  it('rejects invalid month values', () => {
    expect(DATE_REGEX.test('2020-00')).toBe(false);
    expect(DATE_REGEX.test('2020-13')).toBe(false);
    expect(DATE_REGEX.test('2020-99')).toBe(false);
  });

  it('rejects wrong-shape strings', () => {
    expect(DATE_REGEX.test('2020-1')).toBe(false);
    expect(DATE_REGEX.test('20-01')).toBe(false);
    expect(DATE_REGEX.test('Jan 2020')).toBe(false);
    expect(DATE_REGEX.test('')).toBe(false);
  });
});

describe('calculateExperienceFromHistory', () => {
  it('returns null for empty/missing input', () => {
    expect(calculateExperienceFromHistory()).toBeNull();
    expect(calculateExperienceFromHistory(null)).toBeNull();
    expect(calculateExperienceFromHistory([])).toBeNull();
  });

  it('returns "0-1 vjet" for a 6-month-old current job', () => {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const startDate = `${sixMonthsAgo.getFullYear()}-${String(sixMonthsAgo.getMonth() + 1).padStart(2, '0')}`;
    expect(calculateExperienceFromHistory([{ startDate, isCurrentJob: true }])).toBe('0-1 vjet');
  });

  it('returns "1-2 vjet" for ~18 months', () => {
    expect(
      calculateExperienceFromHistory([{ startDate: '2024-01', endDate: '2025-07' }])
    ).toBe('1-2 vjet');
  });

  it('returns "2-5 vjet" for 3 years', () => {
    expect(
      calculateExperienceFromHistory([{ startDate: '2022-01', endDate: '2025-01' }])
    ).toBe('2-5 vjet');
  });

  it('returns "5-10 vjet" for 7 years', () => {
    expect(
      calculateExperienceFromHistory([{ startDate: '2018-01', endDate: '2025-01' }])
    ).toBe('5-10 vjet');
  });

  it('returns "10+ vjet" for 15 years', () => {
    expect(
      calculateExperienceFromHistory([{ startDate: '2010-01', endDate: '2025-01' }])
    ).toBe('10+ vjet');
  });

  it('sums multiple entries', () => {
    expect(
      calculateExperienceFromHistory([
        { startDate: '2020-01', endDate: '2022-01' }, // 2 years
        { startDate: '2022-01', endDate: '2024-01' }, // 2 years → total 4
      ])
    ).toBe('2-5 vjet');
  });

  it('skips entries with malformed startDate', () => {
    expect(
      calculateExperienceFromHistory([
        { startDate: 'bad', endDate: '2025-01' },
        { startDate: '2024-01', endDate: '2025-01' }, // 1 year → "1-2 vjet"
      ])
    ).toBe('1-2 vjet');
  });

  it('treats missing endDate as "now" when isCurrentJob=true', () => {
    expect(
      calculateExperienceFromHistory([{ startDate: '2010-01', isCurrentJob: true }])
    ).toBe('10+ vjet');
  });

  it('ignores negative-month entries (endDate < startDate)', () => {
    // No valid time computed → returns 0 months → "0-1 vjet"
    expect(
      calculateExperienceFromHistory([{ startDate: '2025-01', endDate: '2020-01' }])
    ).toBe('0-1 vjet');
  });
});

describe('sanitizeParsedProfile — basic field handling', () => {
  it('returns empty object for empty input', () => {
    expect(sanitizeParsedProfile({})).toEqual({ experience: '0-1 vjet' });
  });

  it('clamps title to 100 chars', () => {
    const r = sanitizeParsedProfile({ title: 'x'.repeat(500) });
    expect(r.title.length).toBe(100);
  });

  it('clamps bio to 500 chars', () => {
    const r = sanitizeParsedProfile({ bio: 'y'.repeat(1000) });
    expect(r.bio.length).toBe(500);
  });

  it('trims title/bio whitespace', () => {
    const r = sanitizeParsedProfile({ title: '   Engineer   ', bio: '  some bio  ' });
    expect(r.title).toBe('Engineer');
    expect(r.bio).toBe('some bio');
  });

  it('drops non-string title/bio', () => {
    const r = sanitizeParsedProfile({ title: 12345, bio: { foo: 1 } });
    expect(r.title).toBeUndefined();
    expect(r.bio).toBeUndefined();
  });
});

describe('sanitizeParsedProfile — skills', () => {
  it('limits to 20 skills', () => {
    const skills = Array.from({ length: 30 }, (_, i) => `skill${i}`);
    const r = sanitizeParsedProfile({ skills });
    expect(r.skills.length).toBe(20);
  });

  it('clamps each skill to 50 chars', () => {
    const r = sanitizeParsedProfile({ skills: ['x'.repeat(100)] });
    expect(r.skills[0].length).toBe(50);
  });

  it('filters out empty / non-string skills', () => {
    const r = sanitizeParsedProfile({ skills: ['React', '', '   ', null, 123, 'Node'] });
    expect(r.skills).toEqual(['React', 'Node']);
  });

  it('omits skills entirely when input is not an array', () => {
    const r = sanitizeParsedProfile({ skills: 'React, Node' });
    expect(r.skills).toBeUndefined();
  });
});

describe('sanitizeParsedProfile — workExperience', () => {
  it('drops entries missing required position or company', () => {
    const r = sanitizeParsedProfile({
      workExperience: [
        { position: 'Engineer', company: 'Acme', startDate: '2020-01' },
        { position: '', company: 'Acme' }, // dropped
        { position: 'X', company: '' }, // dropped
        { company: 'No position' }, // dropped
      ],
    });
    expect(r.workExperience.length).toBe(1);
    expect(r.workExperience[0].position).toBe('Engineer');
  });

  it('clears endDate when isCurrentJob=true', () => {
    const r = sanitizeParsedProfile({
      workExperience: [{
        position: 'Eng',
        company: 'A',
        startDate: '2020-01',
        endDate: '2025-01',
        isCurrentJob: true,
      }],
    });
    expect(r.workExperience[0].endDate).toBe('');
    expect(r.workExperience[0].isCurrentJob).toBe(true);
  });

  it('clears malformed dates', () => {
    const r = sanitizeParsedProfile({
      workExperience: [{
        position: 'Eng', company: 'A',
        startDate: 'invalid', endDate: 'also-invalid',
      }],
    });
    expect(r.workExperience[0].startDate).toBe('');
    expect(r.workExperience[0].endDate).toBe('');
  });

  it('clamps description and achievements to 500', () => {
    const r = sanitizeParsedProfile({
      workExperience: [{
        position: 'Eng', company: 'A',
        description: 'd'.repeat(800),
        achievements: 'a'.repeat(800),
      }],
    });
    expect(r.workExperience[0].description.length).toBe(500);
    expect(r.workExperience[0].achievements.length).toBe(500);
  });
});

describe('sanitizeParsedProfile — education', () => {
  it('drops entries missing required degree or institution', () => {
    const r = sanitizeParsedProfile({
      education: [
        { degree: 'Bachelor', institution: 'University' },
        { degree: '', institution: 'X' }, // dropped
        { degree: 'PhD' }, // dropped (no institution)
      ],
    });
    expect(r.education.length).toBe(1);
    // sanitizeParsedProfile normalizes the degree to the schema enum.
    expect(r.education[0].degree).toBe('bachelors');
  });

  it('handles isCurrentStudy', () => {
    const r = sanitizeParsedProfile({
      education: [{
        degree: 'PhD', institution: 'MIT',
        startDate: '2023-01', endDate: '2027-01', isCurrentStudy: true,
      }],
    });
    expect(r.education[0].endDate).toBe('');
    expect(r.education[0].isCurrentStudy).toBe(true);
  });
});

describe('sanitizeParsedProfile — experience inference', () => {
  it('uses provided experience if it matches a valid enum', () => {
    const r = sanitizeParsedProfile({ experience: '5-10 vjet' });
    expect(r.experience).toBe('5-10 vjet');
  });

  it('recalculates from work history when experience is invalid', () => {
    const r = sanitizeParsedProfile({
      experience: 'lots of years',
      workExperience: [
        { position: 'Eng', company: 'A', startDate: '2020-01', endDate: '2024-01' },
      ],
    });
    expect(EXPERIENCE_ENUMS).toContain(r.experience);
    expect(r.experience).toBe('2-5 vjet');
  });

  it('defaults to "0-1 vjet" when no work history and invalid input', () => {
    const r = sanitizeParsedProfile({ experience: 'foo' });
    expect(r.experience).toBe('0-1 vjet');
  });
});

describe('sanitizeParsedProfile — languages', () => {
  it('preserves valid proficiency enums', () => {
    const r = sanitizeParsedProfile({
      languages: [
        { name: 'English', proficiency: 'C2' },
        { name: 'Albanian', proficiency: 'Native' },
      ],
    });
    expect(r.languages).toEqual([
      { name: 'English', proficiency: 'C2' },
      { name: 'Albanian', proficiency: 'Native' },
    ]);
  });

  it('defaults invalid proficiency to "B1"', () => {
    const r = sanitizeParsedProfile({
      languages: [{ name: 'French', proficiency: 'fluent' }],
    });
    expect(r.languages[0].proficiency).toBe('B1');
  });

  it('drops entries missing name', () => {
    const r = sanitizeParsedProfile({
      languages: [
        { name: '', proficiency: 'C1' },
        { name: '   ', proficiency: 'B2' },
        { proficiency: 'A1' },
      ],
    });
    expect(r.languages).toEqual([]);
  });

  it('exports all 7 valid PROFICIENCY_ENUMS', () => {
    expect(PROFICIENCY_ENUMS).toEqual(['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'Native']);
  });
});

describe('extractTextFromCV — magic byte detection', () => {
  it('throws when buffer is empty', async () => {
    await expect(extractTextFromCV(Buffer.alloc(0))).rejects.toThrow(/empty/i);
  });

  it('throws when buffer is too small (< 4 bytes)', async () => {
    await expect(extractTextFromCV(Buffer.from([0x25, 0x50]))).rejects.toThrow(/empty|small/i);
  });

  it('throws when buffer is null', async () => {
    await expect(extractTextFromCV(null)).rejects.toThrow();
  });

  it('routes a non-PDF non-DOCX buffer through the fallback (both extractors fail)', async () => {
    // Plain text buffer — neither pdfjs nor mammoth can parse it
    const txt = Buffer.from('this is just plain text, no headers, no nothing.', 'utf8');
    await expect(extractTextFromCV(txt)).rejects.toThrow();
  });
});
