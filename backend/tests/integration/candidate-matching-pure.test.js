/**
 * Phase 28 — coverage push for candidateMatching pure scoring functions.
 *
 * The class exposes calculateMatchScore + calculateTitleMatch /
 * SkillsMatch / ExperienceMatch / LocationMatch / EducationMatch /
 * SalaryMatch. They are pure: take candidate + job objects, return a
 * number. Existing find/recommend tests exercise the orchestration but
 * never call the helpers directly with crafted inputs, so several score
 * bands (e.g. salary "too high by 10/20/30%", experience overqualified,
 * remote / hybrid jobs when cities differ) go uncovered.
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
  seniority: undefined,
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

  it('returns partial score for partial keyword match', () => {
    const score = candidateMatching.calculateTitleMatch(
      candidate({ title: 'Senior Backend Engineer' }),
      job({ title: 'Junior Frontend Engineer' })
    );
    // "senior"/"junior" carry no role meaning → backend,engineer vs
    // frontend,engineer: 1 of 2 words match → round(0.5*20) = 10
    expect(score).toBe(10);
  });

  it('84: one-letter particles and unrelated words no longer count as matches', () => {
    // used to score 7/20 ("i" matched inside "kontabiliste")
    expect(candidateMatching.calculateTitleMatch(
      candidate({ title: 'Kontabiliste' }),
      job({ title: 'Specialist i Marketingut' })
    )).toBe(0);
  });

  it('84: Albanian suffix variants of the same word match (stem of 5+ letters)', () => {
    // kontabiliste ~ kontabilist; "larte" unmatched → 1 of 2 → 10
    expect(candidateMatching.calculateTitleMatch(
      candidate({ title: 'Kontabiliste' }),
      job({ title: 'Kontabilist i Lartë' })
    )).toBe(10);
  });
});

// 83: the job side is job.seniority (junior 0-2y, mid 2-5y, senior 5-10y,
// lead 10y+) — there is no job.experience, which used to make this 0 for all.
describe('candidateMatching.calculateExperienceMatch (job.seniority)', () => {
  it('returns 15 when the candidate falls inside the seniority range', () => {
    expect(candidateMatching.calculateExperienceMatch(
      candidate({ experience: '5-10 vjet' }),
      job({ seniority: 'senior' })
    )).toBe(15);
    expect(candidateMatching.calculateExperienceMatch(
      candidate({ experience: 'none' }),
      job({ seniority: 'junior' })
    )).toBe(15);
  });

  it('returns 13 when the candidate is up to 2 years above the range', () => {
    // candidate 5-10 (7.5) vs mid [2,5] → 2.5 above → <=5 → 10; 2-5 (3.5) vs junior [0,2] → 1.5 above → 13
    expect(candidateMatching.calculateExperienceMatch(
      candidate({ experience: '2-5 vjet' }),
      job({ seniority: 'junior' })
    )).toBe(13);
    expect(candidateMatching.calculateExperienceMatch(
      candidate({ experience: '5-10 vjet' }),
      job({ seniority: 'mid' })
    )).toBe(10);
  });

  it('returns 7 (overqualified) when more than 5 years above the range', () => {
    // 10+ (12) vs junior [0,2] → 10 above → 7
    expect(candidateMatching.calculateExperienceMatch(
      candidate({ experience: '10+ vjet' }),
      job({ seniority: 'junior' })
    )).toBe(7);
  });

  it('returns 12 / 8 / 0 as the candidate falls further below the range', () => {
    // 1-2 (1.5) vs mid [2,5] → 0.5 below → 12
    expect(candidateMatching.calculateExperienceMatch(candidate({ experience: '1-2 vjet' }), job({ seniority: 'mid' }))).toBe(12);
    // 2-5 (3.5) vs senior [5,10] → 1.5 below → 8
    expect(candidateMatching.calculateExperienceMatch(candidate({ experience: '2-5 vjet' }), job({ seniority: 'senior' }))).toBe(8);
    // 0-1 (0.5) vs senior [5,10] → 4.5 below → 0
    expect(candidateMatching.calculateExperienceMatch(candidate({ experience: '0-1 vjet' }), job({ seniority: 'senior' }))).toBe(0);
  });

  it('returns 0 when either side is unknown', () => {
    expect(candidateMatching.calculateExperienceMatch(candidate({}), job({ seniority: 'mid' }))).toBe(0);
    expect(candidateMatching.calculateExperienceMatch(candidate({ experience: '2-5 vjet' }), job({}))).toBe(0);
  });
});

describe('candidateMatching.calculateLocationMatch', () => {
  it('returns 15 for same city (case-insensitive)', () => {
    expect(candidateMatching.calculateLocationMatch(
      candidate({}, 'tiranë'),
      job({ location: { city: 'TIRANË' } })
    )).toBe(15);
  });

  // 83: remote is location.remote / location.remoteType — jobType is
  // full-time|part-time|internship and never said "remote".
  it('returns 12 for a different city when the job is remote (location.remote)', () => {
    expect(candidateMatching.calculateLocationMatch(
      candidate({}, 'Vlorë'),
      job({ location: { city: 'Tiranë', remote: true, remoteType: 'full' } })
    )).toBe(12);
  });

  it('returns 12 for a different city when the job is hybrid (remoteType)', () => {
    expect(candidateMatching.calculateLocationMatch(
      candidate({}, 'Durrës'),
      job({ location: { city: 'Tiranë', remoteType: 'hybrid' } })
    )).toBe(12);
  });

  it('returns 5 for different city, not remote (L153)', () => {
    expect(candidateMatching.calculateLocationMatch(
      candidate({}, 'Vlorë'),
      job({ location: { city: 'Tiranë' }, jobType: 'full-time' })
    )).toBe(5);
  });

  it('a jobType value is not a remote signal (only location.remote / remoteType are)', () => {
    expect(candidateMatching.calculateLocationMatch(
      candidate({}, 'Vlorë'),
      job({ location: { city: 'Tiranë', remote: false, remoteType: 'none' }, jobType: 'remote' })
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
  // Job fixtures are ANNUAL (stored convention): 12000-24000/yr = 1000-2000/muaj.
  it('returns 5 (neutral) when candidate salary is 0', () => {
    expect(candidateMatching.calculateSalaryMatch(
      candidate({}),
      job({ salary: { min: 12000, max: 24000 } })
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
      job({ salary: { min: 12000, max: 24000 } })
    )).toBe(10);
  });

  it('returns 8 when candidate expects less (L212-213)', () => {
    expect(candidateMatching.calculateSalaryMatch(
      candidate({ desiredSalary: { max: 800 } }),
      job({ salary: { min: 12000, max: 24000 } })
    )).toBe(8);
  });

  it('returns 6 when candidate expects 10% more than max (L220)', () => {
    expect(candidateMatching.calculateSalaryMatch(
      candidate({ desiredSalary: { max: 2200 } }), // 10% over 2000
      job({ salary: { min: 12000, max: 24000 } })
    )).toBe(6);
  });

  it('returns 4 when candidate expects ~20% more than max (L221)', () => {
    expect(candidateMatching.calculateSalaryMatch(
      candidate({ desiredSalary: { max: 2400 } }), // 20% over
      job({ salary: { min: 12000, max: 24000 } })
    )).toBe(4);
  });

  it('returns 2 when candidate expects ~30% more than max (L222)', () => {
    expect(candidateMatching.calculateSalaryMatch(
      candidate({ desiredSalary: { max: 2600 } }), // 30%
      job({ salary: { min: 12000, max: 24000 } })
    )).toBe(2);
  });

  it('returns 0 when candidate expects way too much (L223)', () => {
    expect(candidateMatching.calculateSalaryMatch(
      candidate({ desiredSalary: { max: 5000 } }), // 150% over
      job({ salary: { min: 12000, max: 24000 } })
    )).toBe(0);
  });

  // 84: an open-ended range has no bound on its open side.
  it('"from 800/muaj" (no max): a candidate wanting 1000 is within the range', () => {
    expect(candidateMatching.calculateSalaryMatch(
      candidate({ desiredSalary: { max: 1000, currency: 'EUR' } }),
      job({ salary: { min: 9600, currency: 'EUR' } })
    )).toBe(10);
  });

  it('"up to 1500/muaj" (no min): a candidate wanting 900 is within, 2000 is too high', () => {
    expect(candidateMatching.calculateSalaryMatch(
      candidate({ desiredSalary: { max: 900, currency: 'EUR' } }),
      job({ salary: { max: 18000, currency: 'EUR' } })
    )).toBe(10);
    expect(candidateMatching.calculateSalaryMatch(
      candidate({ desiredSalary: { max: 2000, currency: 'EUR' } }),
      job({ salary: { max: 18000, currency: 'EUR' } })
    )).toBe(0);
  });

  it('compares across EUR / ALL (≈100 ALL per EUR)', () => {
    // 800 EUR vs 80,000–100,000 ALL/muaj ≈ 800–1,000 EUR → within
    expect(candidateMatching.calculateSalaryMatch(
      candidate({ desiredSalary: { max: 800, currency: 'EUR' } }),
      job({ salary: { min: 960000, max: 1200000, currency: 'ALL' } })
    )).toBe(10);
  });
});

describe('candidateMatching.calculateSkillsMatch (84)', () => {
  it('short skills ("c", "r", "go") do not match inside other words', () => {
    expect(candidateMatching.calculateSkillsMatch(
      candidate({ skills: ['c', 'r', 'go'] }),
      job({ requirements: ['Njohuri të gjuhës angleze', 'Microsoft Excel', 'Komunikim i mirë'] })
    )).toBe(0);
  });

  it('matches job.tags exactly and requirements as whole words', () => {
    // React via tags, Node.js via requirements; job size max(1 req, 2 tags)=2,
    // candidate 2 skills → 2/2 → 25
    expect(candidateMatching.calculateSkillsMatch(
      candidate({ skills: ['React', 'Node.js'] }),
      job({ requirements: ['Node.js 2 vjet'], tags: ['React', 'TypeScript'] })
    )).toBe(25);
  });

  it('a whole-word short skill still matches ("C" in "Programim në C")', () => {
    // 1 of max(1 skill, 1 requirement) → 25
    expect(candidateMatching.calculateSkillsMatch(
      candidate({ skills: ['C'] }),
      job({ requirements: ['Programim në C'] })
    )).toBe(25);
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
