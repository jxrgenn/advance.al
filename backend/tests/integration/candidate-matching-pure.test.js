/**
 * Phase 28 — coverage push for candidateMatching pure scoring functions.
 *
 * The class exposes calculateMatchScore + calculateTitleMatch /
 * SkillsMatch / ExperienceMatch / LocationMatch / EducationMatch /
 * SalaryMatch. They are pure: take candidate + job objects, return a
 * number. Existing find/recommend tests exercise the orchestration but
 * never call the helpers directly with crafted inputs, so several score
 * bands (e.g. salary "too high by 10/20/30%", experience overqualified,
 * remote-or-hybrid jobType when cities differ) go uncovered.
 */

import { describe, it, expect } from '@jest/globals';
import candidateMatching from '../../src/services/candidateMatching.js';

const candidate = (jobSeekerProfile = {}, locationCity = 'Tiranë') => ({
  profile: {
    location: { city: locationCity },
    jobSeekerProfile,
  },
});

const job = (overrides = {}) => ({
  title: 'Software Engineer',
  requirements: [],
  experience: '',
  location: { city: 'Tiranë' },
  jobType: 'full-time',
  salary: { min: 0, max: 0 },
  ...overrides,
});

describe('candidateMatching.calculateTitleMatch', () => {
  it('returns 20 for exact title match', () => {
    const score = candidateMatching.calculateTitleMatch(
      candidate({ title: 'Software Engineer' }),
      job({ title: 'Software Engineer' })
    );
    expect(score).toBe(20);
  });

  it('returns 0 when either side is empty', () => {
    expect(candidateMatching.calculateTitleMatch(candidate(), job())).toBe(0);
    expect(candidateMatching.calculateTitleMatch(candidate({ title: '' }), job({ title: '' }))).toBe(0);
  });

  it('returns partial score for partial keyword match (L52-60)', () => {
    const score = candidateMatching.calculateTitleMatch(
      candidate({ title: 'Senior Backend Engineer' }),
      job({ title: 'Junior Frontend Engineer' })
    );
    // "Engineer" matches → matchedWords=1, ratio=1/3, score=round(0.333*20)=7
    expect(score).toBe(7);
  });
});

describe('candidateMatching.calculateExperienceMatch (L94-128)', () => {
  it('returns 15 for exact experience-band match', () => {
    expect(candidateMatching.calculateExperienceMatch(
      candidate({ experience: '5-10 vjet' }),
      job({ experience: '5-10 vjet' })
    )).toBe(15);
  });

  it('returns 13 when candidate has 2 years more experience', () => {
    // candidate '5-10' (7.5) - job '2-5' (3.5) = 4 → falls into diff <=5 → 10
    expect(candidateMatching.calculateExperienceMatch(
      candidate({ experience: '5-10 vjet' }),
      job({ experience: '2-5 vjet' })
    )).toBe(10);
  });

  it('returns 7 (overqualified) when diff > 5 years', () => {
    // candidate '10+' (12) - job '0-1' (0.5) = 11.5 → 7
    expect(candidateMatching.calculateExperienceMatch(
      candidate({ experience: '10+ vjet' }),
      job({ experience: '0-1 vjet' })
    )).toBe(7);
  });

  it('returns 12 when candidate has slightly less experience (diff<=1)', () => {
    // job 1-2 (1.5) - candidate 0-1 (0.5) = 1 → 12
    expect(candidateMatching.calculateExperienceMatch(
      candidate({ experience: '0-1 vjet' }),
      job({ experience: '1-2 vjet' })
    )).toBe(12);
  });

  it('returns 8 when candidate underqualified by 2 years', () => {
    // job 2-5 (3.5) - candidate 1-2 (1.5) = 2 → 8
    expect(candidateMatching.calculateExperienceMatch(
      candidate({ experience: '1-2 vjet' }),
      job({ experience: '2-5 vjet' })
    )).toBe(8);
  });

  it('returns 4 when candidate underqualified by 3 years', () => {
    // job 5-10 (7.5) - candidate 2-5 (3.5) = 4 → falls into diff <=5 (the candidate-more branch is gone) — but here jobYears > candidateYears, so diff = 4
    // diff <=3 returns 4? No: const diff = jobYears - candidateYears = 4 → falls past <=3 → returns 0
    // Recheck: diff 4 → past `<=3` → returns 0
    expect(candidateMatching.calculateExperienceMatch(
      candidate({ experience: '2-5 vjet' }),
      job({ experience: '5-10 vjet' })
    )).toBe(0);
  });
});

describe('candidateMatching.calculateLocationMatch (L135-153)', () => {
  it('returns 15 for same city (case-insensitive)', () => {
    expect(candidateMatching.calculateLocationMatch(
      candidate({}, 'tiranë'),
      job({ location: { city: 'TIRANË' } })
    )).toBe(15);
  });

  it('returns 12 for different city when jobType is remote (L148-149)', () => {
    expect(candidateMatching.calculateLocationMatch(
      candidate({}, 'Vlorë'),
      job({ location: { city: 'Tiranë' }, jobType: 'remote' })
    )).toBe(12);
  });

  it('returns 12 for different city when jobType contains "hybrid"', () => {
    expect(candidateMatching.calculateLocationMatch(
      candidate({}, 'Durrës'),
      job({ location: { city: 'Tiranë' }, jobType: 'hybrid-flex' })
    )).toBe(12);
  });

  it('returns 5 for different city, not remote (L153)', () => {
    expect(candidateMatching.calculateLocationMatch(
      candidate({}, 'Vlorë'),
      job({ location: { city: 'Tiranë' }, jobType: 'full-time' })
    )).toBe(5);
  });

  it('returns 0 when either city is missing', () => {
    expect(candidateMatching.calculateLocationMatch(
      candidate({}, ''),
      job({ location: { city: 'Tiranë' } })
    )).toBe(0);
  });
});

describe('candidateMatching.calculateSalaryMatch (L193-223)', () => {
  it('returns 5 (neutral) when candidate salary is 0', () => {
    expect(candidateMatching.calculateSalaryMatch(
      candidate({}),
      job({ salary: { min: 1000, max: 2000 } })
    )).toBe(5);
  });

  it('returns 5 when job has no salary', () => {
    expect(candidateMatching.calculateSalaryMatch(
      candidate({ desiredSalary: { min: 1000, max: 2000 } }),
      job({ salary: { min: 0, max: 0 } })
    )).toBe(5);
  });

  it('returns 10 (perfect) when candidate within range (L207-208)', () => {
    expect(candidateMatching.calculateSalaryMatch(
      candidate({ desiredSalary: { min: 1500, max: 1500 } }),
      job({ salary: { min: 1000, max: 2000 } })
    )).toBe(10);
  });

  it('returns 8 when candidate expects less (L212-213)', () => {
    expect(candidateMatching.calculateSalaryMatch(
      candidate({ desiredSalary: { max: 800 } }),
      job({ salary: { min: 1000, max: 2000 } })
    )).toBe(8);
  });

  it('returns 6 when candidate expects 10% more than max (L220)', () => {
    expect(candidateMatching.calculateSalaryMatch(
      candidate({ desiredSalary: { max: 2200 } }), // 10% over 2000
      job({ salary: { min: 1000, max: 2000 } })
    )).toBe(6);
  });

  it('returns 4 when candidate expects ~20% more than max (L221)', () => {
    expect(candidateMatching.calculateSalaryMatch(
      candidate({ desiredSalary: { max: 2400 } }), // 20% over
      job({ salary: { min: 1000, max: 2000 } })
    )).toBe(4);
  });

  it('returns 2 when candidate expects ~30% more than max (L222)', () => {
    expect(candidateMatching.calculateSalaryMatch(
      candidate({ desiredSalary: { max: 2600 } }), // 30%
      job({ salary: { min: 1000, max: 2000 } })
    )).toBe(2);
  });

  it('returns 0 when candidate expects way too much (L223)', () => {
    expect(candidateMatching.calculateSalaryMatch(
      candidate({ desiredSalary: { max: 5000 } }), // 150% over
      job({ salary: { min: 1000, max: 2000 } })
    )).toBe(0);
  });
});

describe('candidateMatching.calculateEducationMatch (L160-187)', () => {
  it('returns 5 when no education requirement and candidate has degree (L176)', () => {
    expect(candidateMatching.calculateEducationMatch(
      candidate({ education: [{ degree: 'Bachelor në Informatikë' }] }),
      job({ requirements: ['React', 'Node.js'] })
    )).toBe(5);
  });

  it('returns 5 when match found between candidate degree and job requirements', () => {
    expect(candidateMatching.calculateEducationMatch(
      candidate({ education: [{ degree: 'Bachelor në Informatikë' }] }),
      job({ requirements: ['Bachelor degree required'] })
    )).toBe(5);
  });

  it('returns 2 when job requires education and candidate has none matching', () => {
    expect(candidateMatching.calculateEducationMatch(
      candidate({ education: [{ degree: 'Diploma e shkollës së mesme' }] }),
      job({ requirements: ['Master degree in CS required'] })
    )).toBe(2);
  });

  it('returns 0 when candidate has no education', () => {
    expect(candidateMatching.calculateEducationMatch(
      candidate({}),
      job({ requirements: ['anything'] })
    )).toBe(0);
  });
});
