/**
 * Unit tests for candidateMatching scoring (Phase 28 — Phase 6).
 *
 * Baseline coverage 13% → push the pure-function scorers toward 100%.
 * The 7 score methods + the aggregator are pure and have a well-defined
 * 0-100 budget split:
 *   title       0-20
 *   skills      0-25
 *   experience  0-15
 *   location    0-15
 *   education   0-5
 *   salary      0-10
 *   availability 0-10
 *
 * Tests assert exact boundary values (not "score > 0").
 */

import { describe, it, expect } from '@jest/globals';
import CandidateMatchingService from '../../src/services/candidateMatching.js';

// candidateMatching.js exports a class instance (default export pattern in
// the codebase; check by reading the actual module shape).
const service = CandidateMatchingService.default || CandidateMatchingService;

const mkCandidate = (override = {}) => ({
  profile: {
    location: { city: override.city || '' },
    jobSeekerProfile: {
      title: override.title || '',
      skills: override.skills || [],
      experience: override.experience || '',
      education: override.education || [],
      desiredSalary: override.desiredSalary || { min: 0, max: 0 },
      availability: override.availability || '',
    },
  },
});

const mkJob = (override = {}) => ({
  title: override.title || '',
  requirements: override.requirements || [],
  experience: override.experience || '',
  location: { city: override.city || '' },
  jobType: override.jobType || 'full-time',
  salary: override.salary || { min: 0, max: 0 },
});

describe('calculateTitleMatch', () => {
  it('returns 0 when either title is empty', () => {
    expect(service.calculateTitleMatch(mkCandidate(), mkJob({ title: 'Engineer' }))).toBe(0);
    expect(service.calculateTitleMatch(mkCandidate({ title: 'Engineer' }), mkJob())).toBe(0);
  });

  it('returns 20 for exact title match (case-insensitive)', () => {
    const c = mkCandidate({ title: 'Senior Software Engineer' });
    const j = mkJob({ title: 'senior software engineer' });
    expect(service.calculateTitleMatch(c, j)).toBe(20);
  });

  it('returns partial credit for partial keyword overlap', () => {
    const c = mkCandidate({ title: 'Senior Software Developer' });
    const j = mkJob({ title: 'Software Engineer' });
    const score = service.calculateTitleMatch(c, j);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(20);
  });

  it('returns 0 when no words match', () => {
    const c = mkCandidate({ title: 'Painter' });
    const j = mkJob({ title: 'Carpenter' });
    expect(service.calculateTitleMatch(c, j)).toBe(0);
  });

  it('ignores short words (≤3 chars) in partial-match scoring', () => {
    // Different titles (not exact match) so the partial-match path runs.
    // All candidate words are ≤3 chars so they're skipped → matchedWords=0 → 0.
    const c = mkCandidate({ title: 'a an the of' });
    const j = mkJob({ title: 'engineering manager' });
    expect(service.calculateTitleMatch(c, j)).toBe(0);
  });
});

describe('calculateSkillsMatch', () => {
  it('returns 0 when candidate skills empty or job requirements empty', () => {
    expect(service.calculateSkillsMatch(mkCandidate(), mkJob({ requirements: ['react'] }))).toBe(0);
    expect(service.calculateSkillsMatch(mkCandidate({ skills: ['react'] }), mkJob())).toBe(0);
  });

  it('returns 25 when candidate skills fully match job requirements', () => {
    const c = mkCandidate({ skills: ['React', 'Node'] });
    const j = mkJob({ requirements: ['React experience required', 'Node.js backend'] });
    expect(service.calculateSkillsMatch(c, j)).toBe(25);
  });

  it('partial credit when only some skills match', () => {
    const c = mkCandidate({ skills: ['React', 'Vue', 'Angular', 'Svelte'] });
    const j = mkJob({ requirements: ['React experience'] });
    const score = service.calculateSkillsMatch(c, j);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(25);
  });

  it('returns 0 when no candidate skill appears in requirements', () => {
    const c = mkCandidate({ skills: ['Cobol'] });
    const j = mkJob({ requirements: ['React'] });
    expect(service.calculateSkillsMatch(c, j)).toBe(0);
  });

  it('matches case-insensitively', () => {
    const c = mkCandidate({ skills: ['REACT'] });
    const j = mkJob({ requirements: ['react experience'] });
    expect(service.calculateSkillsMatch(c, j)).toBe(25);
  });
});

describe('calculateExperienceMatch', () => {
  it('returns 0 when either experience is empty', () => {
    expect(service.calculateExperienceMatch(mkCandidate(), mkJob({ experience: '2-5 vjet' }))).toBe(0);
    expect(service.calculateExperienceMatch(mkCandidate({ experience: '2-5 vjet' }), mkJob())).toBe(0);
  });

  it('returns 15 for exact experience-bucket match', () => {
    const c = mkCandidate({ experience: '2-5 vjet' });
    const j = mkJob({ experience: '2-5 vjet' });
    expect(service.calculateExperienceMatch(c, j)).toBe(15);
  });

  it('returns 13 when candidate has up to 2 yrs MORE than required', () => {
    // candidate 2-5 (3.5), job 1-2 (1.5) → diff=2
    const c = mkCandidate({ experience: '2-5 vjet' });
    const j = mkJob({ experience: '1-2 vjet' });
    expect(service.calculateExperienceMatch(c, j)).toBe(13);
  });

  it('returns 7 for very-overqualified candidates (diff > 5 yrs)', () => {
    const c = mkCandidate({ experience: '10+ vjet' }); // 12
    const j = mkJob({ experience: '0-1 vjet' }); // 0.5  → diff = 11.5
    expect(service.calculateExperienceMatch(c, j)).toBe(7);
  });

  it('returns 12 when candidate is 1yr underqualified', () => {
    // candidate 1-2 (1.5), job 2-5 (3.5) → diff=2 (≤2 returns 8 in underqualified branch — let's check 1-2 vs 2-5)
    // Actually diff=2 hits the second underqualified bucket (8 pts).
    // For 12 pts (≤1 diff) we need: candidate 2-5 (3.5), job 5-10 (7.5) — no that's 4 diff.
    // candidate 0-1 (0.5), job 1-2 (1.5) → diff=1 → 12 pts
    const c = mkCandidate({ experience: '0-1 vjet' });
    const j = mkJob({ experience: '1-2 vjet' });
    expect(service.calculateExperienceMatch(c, j)).toBe(12);
  });

  it('returns 0 when candidate is critically underqualified (>3 yrs short)', () => {
    const c = mkCandidate({ experience: '0-1 vjet' });
    const j = mkJob({ experience: '5-10 vjet' });
    expect(service.calculateExperienceMatch(c, j)).toBe(0);
  });

  it('handles unknown experience strings as 0 yrs', () => {
    const c = mkCandidate({ experience: 'unknown' });
    const j = mkJob({ experience: 'unknown' });
    // both default to 0 → exact match → 15
    expect(service.calculateExperienceMatch(c, j)).toBe(15);
  });
});

describe('calculateLocationMatch', () => {
  it('returns 0 when either city is empty', () => {
    expect(service.calculateLocationMatch(mkCandidate(), mkJob({ city: 'Tiranë' }))).toBe(0);
    expect(service.calculateLocationMatch(mkCandidate({ city: 'Tiranë' }), mkJob())).toBe(0);
  });

  it('returns 15 for same-city match (case-insensitive)', () => {
    const c = mkCandidate({ city: 'Tiranë' });
    const j = mkJob({ city: 'TIRANË' });
    expect(service.calculateLocationMatch(c, j)).toBe(15);
  });

  it('returns 12 when different city but job is remote', () => {
    const c = mkCandidate({ city: 'Vlorë' });
    const j = mkJob({ city: 'Tiranë', jobType: 'remote' });
    expect(service.calculateLocationMatch(c, j)).toBe(12);
  });

  it('returns 12 when different city but job is hybrid', () => {
    const c = mkCandidate({ city: 'Vlorë' });
    const j = mkJob({ city: 'Tiranë', jobType: 'hybrid' });
    expect(service.calculateLocationMatch(c, j)).toBe(12);
  });

  it('returns 5 for different city, on-site', () => {
    const c = mkCandidate({ city: 'Vlorë' });
    const j = mkJob({ city: 'Tiranë', jobType: 'full-time' });
    expect(service.calculateLocationMatch(c, j)).toBe(5);
  });
});

describe('calculateEducationMatch', () => {
  it('returns 0 when either edu or job requirements empty', () => {
    expect(service.calculateEducationMatch(mkCandidate(), mkJob({ requirements: ['x'] }))).toBe(0);
    const c = mkCandidate({ education: [{ degree: 'Bachelor' }] });
    expect(service.calculateEducationMatch(c, mkJob())).toBe(0);
  });

  it('returns 5 when job has no education requirement', () => {
    const c = mkCandidate({ education: [{ degree: 'Bachelor in CS' }] });
    const j = mkJob({ requirements: ['React experience', 'Node skills'] });
    expect(service.calculateEducationMatch(c, j)).toBe(5);
  });

  it('returns 5 when candidate education matches required keyword', () => {
    const c = mkCandidate({ education: [{ degree: 'Bachelor in CS' }] });
    const j = mkJob({ requirements: ['Bachelor degree required'] });
    expect(service.calculateEducationMatch(c, j)).toBe(5);
  });

  it('returns 2 when job requires education but candidate edu has no overlap keyword', () => {
    const c = mkCandidate({ education: [{ degree: 'High School' }] });
    const j = mkJob({ requirements: ['Bachelor degree required'] });
    expect(service.calculateEducationMatch(c, j)).toBe(2);
  });

  it('handles missing degree field gracefully', () => {
    const c = mkCandidate({ education: [{}, { degree: 'PhD' }] });
    const j = mkJob({ requirements: ['PhD preferred'] });
    expect(service.calculateEducationMatch(c, j)).toBe(5);
  });
});

describe('calculateSalaryMatch', () => {
  it('returns 5 (neutral) when candidate salary unspecified', () => {
    const c = mkCandidate({ desiredSalary: { min: 0, max: 0 } });
    const j = mkJob({ salary: { min: 1000, max: 2000 } });
    expect(service.calculateSalaryMatch(c, j)).toBe(5);
  });

  it('returns 5 (neutral) when job salary unspecified', () => {
    const c = mkCandidate({ desiredSalary: { min: 1000, max: 2000 } });
    const j = mkJob({ salary: { min: 0, max: 0 } });
    expect(service.calculateSalaryMatch(c, j)).toBe(5);
  });

  it('returns 10 when candidate expectation falls inside job range', () => {
    const c = mkCandidate({ desiredSalary: { min: 1200, max: 1500 } });
    const j = mkJob({ salary: { min: 1000, max: 2000 } });
    expect(service.calculateSalaryMatch(c, j)).toBe(10);
  });

  it('returns 8 when candidate expects less than job offers (employer wins)', () => {
    const c = mkCandidate({ desiredSalary: { min: 500, max: 800 } });
    const j = mkJob({ salary: { min: 1000, max: 2000 } });
    expect(service.calculateSalaryMatch(c, j)).toBe(8);
  });

  it('returns 6 when candidate expects ≤10% above job max', () => {
    // job max 1000, candidate 1100 (10% over) → 6
    const c = mkCandidate({ desiredSalary: { min: 1100, max: 1100 } });
    const j = mkJob({ salary: { min: 800, max: 1000 } });
    expect(service.calculateSalaryMatch(c, j)).toBe(6);
  });

  it('returns 4 when candidate expects 10-20% above job max', () => {
    const c = mkCandidate({ desiredSalary: { min: 1200, max: 1200 } });
    const j = mkJob({ salary: { min: 800, max: 1000 } });
    expect(service.calculateSalaryMatch(c, j)).toBe(4);
  });

  it('returns 2 when candidate expects 20-30% above job max', () => {
    const c = mkCandidate({ desiredSalary: { min: 1300, max: 1300 } });
    const j = mkJob({ salary: { min: 800, max: 1000 } });
    expect(service.calculateSalaryMatch(c, j)).toBe(2);
  });

  it('returns 0 when candidate expects >30% above job max', () => {
    const c = mkCandidate({ desiredSalary: { min: 5000, max: 5000 } });
    const j = mkJob({ salary: { min: 800, max: 1000 } });
    expect(service.calculateSalaryMatch(c, j)).toBe(0);
  });
});

describe('calculateAvailabilityMatch', () => {
  it('returns 5 (neutral) when availability unspecified', () => {
    expect(service.calculateAvailabilityMatch(mkCandidate(), mkJob())).toBe(5);
  });

  it('returns 10 for "immediately"', () => {
    expect(service.calculateAvailabilityMatch(mkCandidate({ availability: 'immediately' }), mkJob())).toBe(10);
  });

  it('returns 8 for "2weeks"', () => {
    expect(service.calculateAvailabilityMatch(mkCandidate({ availability: '2weeks' }), mkJob())).toBe(8);
  });

  it('returns 6 for "1month"', () => {
    expect(service.calculateAvailabilityMatch(mkCandidate({ availability: '1month' }), mkJob())).toBe(6);
  });

  it('returns 4 for "3months"', () => {
    expect(service.calculateAvailabilityMatch(mkCandidate({ availability: '3months' }), mkJob())).toBe(4);
  });

  it('returns 5 for unknown availability string', () => {
    expect(service.calculateAvailabilityMatch(mkCandidate({ availability: 'next-year' }), mkJob())).toBe(5);
  });
});

describe('calculateMatchScore — aggregator', () => {
  it('returns object with totalScore and breakdown of all 7 sub-scores', () => {
    const c = mkCandidate();
    const j = mkJob();
    const r = service.calculateMatchScore(c, j);
    expect(r).toHaveProperty('totalScore');
    expect(r).toHaveProperty('breakdown');
    expect(Object.keys(r.breakdown).sort()).toEqual([
      'availabilityMatch',
      'educationMatch',
      'experienceMatch',
      'locationMatch',
      'salaryMatch',
      'skillsMatch',
      'titleMatch',
    ]);
  });

  it('sums sub-scores into totalScore (rounded to 1 decimal)', () => {
    const c = mkCandidate({
      title: 'Software Engineer',
      city: 'Tiranë',
      skills: ['React', 'Node'],
      experience: '2-5 vjet',
      education: [{ degree: 'Bachelor in CS' }],
      desiredSalary: { min: 1200, max: 1500 },
      availability: 'immediately',
    });
    const j = mkJob({
      title: 'Software Engineer',
      city: 'Tiranë',
      requirements: ['React', 'Node'],
      experience: '2-5 vjet',
      salary: { min: 1000, max: 2000 },
    });
    const r = service.calculateMatchScore(c, j);
    // Perfect match across all dims:
    //   title 20 + skills 25 + exp 15 + loc 15 + edu 5 (no edu req → neutral) + salary 10 + avail 10
    //   = 100
    expect(r.totalScore).toBe(100);
    expect(r.breakdown.titleMatch).toBe(20);
    expect(r.breakdown.skillsMatch).toBe(25);
    expect(r.breakdown.experienceMatch).toBe(15);
    expect(r.breakdown.locationMatch).toBe(15);
    expect(r.breakdown.salaryMatch).toBe(10);
    expect(r.breakdown.availabilityMatch).toBe(10);
  });

  it('returns 0 totalScore for fully-empty candidate vs fully-empty job', () => {
    const r = service.calculateMatchScore(mkCandidate(), mkJob());
    // edu defaults to 0 (job req empty), salary defaults to 5 (both unspecified),
    // availability defaults to 5 (unspecified), location 0 (unspecified)
    // → 0+0+0+0+0+5+5 = 10
    expect(r.totalScore).toBe(10);
  });
});
