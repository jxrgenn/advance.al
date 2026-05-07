/**
 * Phase 28 — coverage push for cvParsingService pure functions.
 *
 * Targets:
 *   - calculateExperienceFromHistory: months → enum bucket
 *   - sanitizeParsedProfile: defensive cleanup of AI output
 *
 * No I/O — pure unit tests on the _internal export.
 */

import { describe, it, expect } from '@jest/globals';
import { _internal } from '../../src/services/cvParsingService.js';

const { calculateExperienceFromHistory, sanitizeParsedProfile } = _internal;

describe('cvParsingService.calculateExperienceFromHistory', () => {
  it('returns null for empty/undefined input', () => {
    expect(calculateExperienceFromHistory(null)).toBeNull();
    expect(calculateExperienceFromHistory([])).toBeNull();
    expect(calculateExperienceFromHistory(undefined)).toBeNull();
  });

  it('returns "0-1 vjet" for 6 months of experience', () => {
    expect(calculateExperienceFromHistory([
      { startDate: '2025-01', endDate: '2025-07', isCurrentJob: false },
    ])).toBe('0-1 vjet');
  });

  it('returns "1-2 vjet" for 18 months', () => {
    expect(calculateExperienceFromHistory([
      { startDate: '2024-01', endDate: '2025-07', isCurrentJob: false },
    ])).toBe('1-2 vjet');
  });

  it('returns "2-5 vjet" for 3 years', () => {
    expect(calculateExperienceFromHistory([
      { startDate: '2022-01', endDate: '2025-01', isCurrentJob: false },
    ])).toBe('2-5 vjet');
  });

  it('returns "5-10 vjet" for 7 years', () => {
    expect(calculateExperienceFromHistory([
      { startDate: '2018-01', endDate: '2025-01', isCurrentJob: false },
    ])).toBe('5-10 vjet');
  });

  it('returns "10+ vjet" for 12 years', () => {
    expect(calculateExperienceFromHistory([
      { startDate: '2013-01', endDate: '2025-01', isCurrentJob: false },
    ])).toBe('10+ vjet');
  });

  it('uses "now" when isCurrentJob=true', () => {
    expect(calculateExperienceFromHistory([
      { startDate: '2020-01', isCurrentJob: true },
    ])).toMatch(/^(2-5|5-10|10\+) vjet$/);
  });

  it('skips entries with malformed startDate', () => {
    expect(calculateExperienceFromHistory([
      { startDate: 'bad', endDate: '2025-01' },
    ])).toBe('0-1 vjet');
  });

  it('sums multiple jobs', () => {
    expect(calculateExperienceFromHistory([
      { startDate: '2020-01', endDate: '2022-01' },
      { startDate: '2022-01', endDate: '2024-01' },
    ])).toBe('2-5 vjet');
  });

  it('treats negative duration as 0 (skips invalid order)', () => {
    expect(calculateExperienceFromHistory([
      { startDate: '2025-06', endDate: '2025-01' }, // end before start
    ])).toBe('0-1 vjet');
  });
});

describe('cvParsingService.sanitizeParsedProfile', () => {
  it('returns empty object for fully empty input', () => {
    const r = sanitizeParsedProfile({});
    expect(r.experience).toBe('0-1 vjet'); // default
  });

  it('clips title to 100 chars', () => {
    const r = sanitizeParsedProfile({ title: 'A'.repeat(200) });
    expect(r.title.length).toBe(100);
  });

  it('clips bio to 500 chars', () => {
    const r = sanitizeParsedProfile({ bio: 'B'.repeat(1000) });
    expect(r.bio.length).toBe(500);
  });

  it('filters non-string skills, clips to 50 chars, caps at 20', () => {
    const skills = [
      'React',
      'Node.js',
      123, // non-string — filtered
      '', // empty — filtered
      'X'.repeat(100), // too long — clipped
      ...Array(25).fill('extra'), // too many — capped
    ];
    const r = sanitizeParsedProfile({ skills });
    expect(r.skills.length).toBe(20);
    expect(r.skills.every(s => typeof s === 'string' && s.length <= 50)).toBe(true);
    expect(r.skills).toContain('React');
    expect(r.skills).toContain('Node.js');
  });

  it('filters work entries missing position or company', () => {
    const r = sanitizeParsedProfile({
      workExperience: [
        { position: 'Dev', company: 'TestCo', startDate: '2020-01', endDate: '2022-01' },
        { position: 'Dev' }, // no company → filtered
        { company: 'TestCo' }, // no position → filtered
        { position: '', company: 'X' }, // empty position → filtered
      ],
    });
    expect(r.workExperience.length).toBe(1);
    expect(r.workExperience[0].position).toBe('Dev');
    expect(r.workExperience[0].company).toBe('TestCo');
  });

  it('zeroes endDate when isCurrentJob=true', () => {
    const r = sanitizeParsedProfile({
      workExperience: [{
        position: 'Dev', company: 'Co',
        startDate: '2020-01', endDate: '2025-01', isCurrentJob: true,
      }],
    });
    expect(r.workExperience[0].endDate).toBe('');
    expect(r.workExperience[0].isCurrentJob).toBe(true);
  });

  it('rejects malformed startDate (must be YYYY-MM)', () => {
    const r = sanitizeParsedProfile({
      workExperience: [{
        position: 'Dev', company: 'Co',
        startDate: '2020-1', endDate: '2025-01', // 2020-1 not YYYY-MM
      }],
    });
    expect(r.workExperience[0].startDate).toBe('');
  });

  it('filters education entries missing degree or institution', () => {
    const r = sanitizeParsedProfile({
      education: [
        { degree: 'Bachelor', institution: 'UNI', startDate: '2018-09' },
        { degree: 'Bachelor' }, // no institution
        { institution: 'UNI' }, // no degree
      ],
    });
    expect(r.education.length).toBe(1);
  });

  it('uses provided experience enum if valid', () => {
    const r = sanitizeParsedProfile({ experience: '5-10 vjet' });
    expect(r.experience).toBe('5-10 vjet');
  });

  it('falls back to calculated experience if invalid enum', () => {
    const r = sanitizeParsedProfile({
      experience: 'lots',
      workExperience: [{
        position: 'Dev', company: 'Co',
        startDate: '2022-01', endDate: '2024-01',
      }],
    });
    expect(r.experience).toBe('2-5 vjet');
  });

  it('defaults proficiency to B1 if not in enum', () => {
    const r = sanitizeParsedProfile({
      languages: [{ name: 'Albanian', proficiency: 'fluent' }],
    });
    expect(r.languages[0].proficiency).toBe('B1');
  });

  it('keeps valid proficiency enums', () => {
    const r = sanitizeParsedProfile({
      languages: [
        { name: 'English', proficiency: 'C2' },
        { name: 'Italian', proficiency: 'Native' },
      ],
    });
    expect(r.languages[0].proficiency).toBe('C2');
    expect(r.languages[1].proficiency).toBe('Native');
  });

  it('filters language entries missing name', () => {
    const r = sanitizeParsedProfile({
      languages: [
        { name: 'Albanian', proficiency: 'C2' },
        { proficiency: 'B1' }, // no name → filtered
        { name: '', proficiency: 'B1' }, // empty name → filtered
      ],
    });
    expect(r.languages.length).toBe(1);
  });
});
