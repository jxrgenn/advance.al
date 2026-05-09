/**
 * Unit tests for userEmbeddingService.computeHybridBoost + experienceToSeniority.
 * Pure functions over user/job document shapes — no DB or OpenAI.
 */
import { describe, it, expect } from '@jest/globals';
import userEmbeddingService from '../../src/services/userEmbeddingService.js';

const baseUser = (overrides = {}) => ({
  profile: {
    location: { city: 'Tiranë' },
    jobSeekerProfile: {
      experience: '2-5 vjet',
      skills: ['React', 'TypeScript', 'Node.js'],
      desiredSalary: { min: 1000, max: 1500, currency: 'EUR' },
      openToRemote: false,
      ...overrides.jsp,
    },
    ...overrides.profile,
  },
  ...overrides.user,
});

const baseJob = (overrides = {}) => ({
  tags: [],
  seniority: 'mid',
  location: { city: 'Durrës', remote: false },
  salary: { min: 800, max: 1200, currency: 'EUR' },
  postedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
  tier: 'basic',
  ...overrides,
});

describe('userEmbeddingService.experienceToSeniority', () => {
  it('maps 0-1 vjet and 1-2 vjet to junior', () => {
    expect(userEmbeddingService.experienceToSeniority('0-1 vjet')).toBe('junior');
    expect(userEmbeddingService.experienceToSeniority('1-2 vjet')).toBe('junior');
  });
  it('maps 2-5 vjet to mid', () => {
    expect(userEmbeddingService.experienceToSeniority('2-5 vjet')).toBe('mid');
  });
  it('maps 5-10 vjet to senior', () => {
    expect(userEmbeddingService.experienceToSeniority('5-10 vjet')).toBe('senior');
  });
  it('maps 10+ vjet to lead', () => {
    expect(userEmbeddingService.experienceToSeniority('10+ vjet')).toBe('lead');
  });
  it('returns null for unknown / missing', () => {
    expect(userEmbeddingService.experienceToSeniority(undefined)).toBeNull();
    expect(userEmbeddingService.experienceToSeniority('')).toBeNull();
    expect(userEmbeddingService.experienceToSeniority('garbage')).toBeNull();
  });
});

describe('userEmbeddingService.computeHybridBoost', () => {
  it('returns 0 boost for a wholly-mismatched user/job', () => {
    const u = baseUser({
      profile: { location: { city: 'Tiranë' } },
      jsp: {
        experience: '0-1 vjet', // → junior
        skills: [],
        desiredSalary: { min: 5000, max: 7000, currency: 'USD' }, // no overlap, different currency
        openToRemote: false,
      },
    });
    const job = baseJob({
      tags: [],
      seniority: 'mid', // junior ≠ mid
      location: { city: 'Vlorë', remote: false }, // different city, not remote
      salary: { min: 800, max: 1000, currency: 'EUR' },
      postedAt: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000), // very old
      tier: 'basic',
    });
    const { boost, breakdown } = userEmbeddingService.computeHybridBoost(u, job);
    expect(boost).toBe(0);
    expect(breakdown).toEqual({ skills: 0, seniority: 0, location: 0, salary: 0, recency: 0, tier: 0 });
  });

  it('skills overlap: 1 match → 0.0333, 2 matches → 0.0667, 3+ matches → 0.10 (capped)', () => {
    const u = baseUser();
    const r1 = userEmbeddingService.computeHybridBoost(u, baseJob({ tags: ['React'] })).breakdown.skills;
    const r2 = userEmbeddingService.computeHybridBoost(u, baseJob({ tags: ['React', 'TypeScript'] })).breakdown.skills;
    const r3 = userEmbeddingService.computeHybridBoost(u, baseJob({ tags: ['React', 'TypeScript', 'Node.js'] })).breakdown.skills;
    const r4 = userEmbeddingService.computeHybridBoost(u, baseJob({ tags: ['React', 'TypeScript', 'Node.js', 'GraphQL'] })).breakdown.skills;
    expect(r1).toBeCloseTo(0.0333, 3);
    expect(r2).toBeCloseTo(0.0667, 3);
    expect(r3).toBeCloseTo(0.10, 4);
    expect(r4).toBeCloseTo(0.10, 4);
  });

  it('skills overlap is case-insensitive', () => {
    const u = baseUser({ jsp: { skills: ['REACT', 'typescript'] } });
    const job = baseJob({ tags: ['react', 'TypeScript'] });
    expect(userEmbeddingService.computeHybridBoost(u, job).breakdown.skills).toBeCloseTo(0.0667, 3);
  });

  it('skills overlap merges manual + aiCV technical + tools', () => {
    const u = baseUser({ jsp: {
      skills: ['React'],
      aiGeneratedCV: { skills: { technical: ['Python'], tools: ['Docker'] } },
    } });
    const job = baseJob({ tags: ['React', 'Python', 'Docker'] });
    expect(userEmbeddingService.computeHybridBoost(u, job).breakdown.skills).toBeCloseTo(0.10, 4);
  });

  it('seniority match: +0.05 only on exact bucket match', () => {
    const u = baseUser({ jsp: { experience: '5-10 vjet' } }); // → senior
    expect(userEmbeddingService.computeHybridBoost(u, baseJob({ seniority: 'senior' })).breakdown.seniority).toBe(0.05);
    expect(userEmbeddingService.computeHybridBoost(u, baseJob({ seniority: 'mid' })).breakdown.seniority).toBe(0);
    expect(userEmbeddingService.computeHybridBoost(u, baseJob({ seniority: 'lead' })).breakdown.seniority).toBe(0);
  });

  it('seniority: no boost when user has no experience set', () => {
    const u = baseUser({ jsp: { experience: undefined } });
    expect(userEmbeddingService.computeHybridBoost(u, baseJob({ seniority: 'mid' })).breakdown.seniority).toBe(0);
  });

  it('location: same city wins +0.07', () => {
    const u = baseUser({ profile: { location: { city: 'Tiranë' } } });
    expect(userEmbeddingService.computeHybridBoost(u, baseJob({ location: { city: 'Tiranë', remote: false } })).breakdown.location).toBe(0.07);
  });

  it('location: same city is case- and whitespace-tolerant', () => {
    const u = baseUser({ profile: { location: { city: '  tirAnë  ' } } });
    expect(userEmbeddingService.computeHybridBoost(u, baseJob({ location: { city: 'Tiranë' } })).breakdown.location).toBe(0.07);
  });

  it('location: remote-eligible job + openToRemote user wins +0.07 even on city mismatch', () => {
    const u = baseUser({ profile: { location: { city: 'Tiranë' } }, jsp: { openToRemote: true } });
    expect(userEmbeddingService.computeHybridBoost(u, baseJob({ location: { city: 'Vlorë', remote: true } })).breakdown.location).toBe(0.07);
  });

  it('location: no boost when neither city matches nor remote-eligibility aligns', () => {
    const u = baseUser({ profile: { location: { city: 'Tiranë' } }, jsp: { openToRemote: false } });
    expect(userEmbeddingService.computeHybridBoost(u, baseJob({ location: { city: 'Vlorë', remote: true } })).breakdown.location).toBe(0);
  });

  it('salary fit: +0.05 when ranges overlap and currency matches', () => {
    const u = baseUser({ jsp: { desiredSalary: { min: 1000, max: 1500, currency: 'EUR' } } });
    // overlap: user [1000,1500] vs job [1200,1800] → max(1500, 1800) >= min(1000, 1200) overlap
    expect(userEmbeddingService.computeHybridBoost(u, baseJob({ salary: { min: 1200, max: 1800, currency: 'EUR' } })).breakdown.salary).toBe(0.05);
  });

  it('salary: no boost when ranges do not overlap', () => {
    const u = baseUser({ jsp: { desiredSalary: { min: 2000, max: 3000, currency: 'EUR' } } });
    expect(userEmbeddingService.computeHybridBoost(u, baseJob({ salary: { min: 800, max: 1200, currency: 'EUR' } })).breakdown.salary).toBe(0);
  });

  it('salary: no boost when currencies differ', () => {
    const u = baseUser({ jsp: { desiredSalary: { min: 1000, max: 1500, currency: 'USD' } } });
    expect(userEmbeddingService.computeHybridBoost(u, baseJob({ salary: { min: 1000, max: 1500, currency: 'EUR' } })).breakdown.salary).toBe(0);
  });

  it('salary: no boost when bounds missing', () => {
    const u = baseUser({ jsp: { desiredSalary: { currency: 'EUR' } } });
    expect(userEmbeddingService.computeHybridBoost(u, baseJob()).breakdown.salary).toBe(0);
  });

  it('recency: +0.02 if posted within last 7 days', () => {
    const u = baseUser();
    const recent = baseJob({ postedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) });
    const old = baseJob({ postedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) });
    expect(userEmbeddingService.computeHybridBoost(u, recent).breakdown.recency).toBe(0.02);
    expect(userEmbeddingService.computeHybridBoost(u, old).breakdown.recency).toBe(0);
  });

  it('tier: +0.02 only for premium', () => {
    const u = baseUser();
    expect(userEmbeddingService.computeHybridBoost(u, baseJob({ tier: 'premium' })).breakdown.tier).toBe(0.02);
    expect(userEmbeddingService.computeHybridBoost(u, baseJob({ tier: 'basic' })).breakdown.tier).toBe(0);
    expect(userEmbeddingService.computeHybridBoost(u, baseJob({ tier: 'featured' })).breakdown.tier).toBe(0);
  });

  it('max possible boost = 0.31 (all components fire)', () => {
    const u = baseUser({
      profile: { location: { city: 'Tiranë' } },
      jsp: {
        experience: '5-10 vjet', // → senior
        skills: ['A', 'B', 'C'],
        desiredSalary: { min: 1000, max: 2000, currency: 'EUR' },
        openToRemote: true,
      },
    });
    const job = baseJob({
      tags: ['A', 'B', 'C', 'D'],
      seniority: 'senior',
      location: { city: 'Tiranë', remote: false },
      salary: { min: 1500, max: 2500, currency: 'EUR' },
      postedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      tier: 'premium',
    });
    const { boost } = userEmbeddingService.computeHybridBoost(u, job);
    expect(boost).toBeCloseTo(0.31, 4);
  });

  it('tolerates malformed profile gracefully (no jobSeekerProfile, no location)', () => {
    const u = { profile: {} };
    const job = baseJob({ tags: ['React'], seniority: 'mid', tier: 'premium' });
    const { boost } = userEmbeddingService.computeHybridBoost(u, job);
    // Only the tier boost should fire; others all gated on user fields
    expect(boost).toBe(0.02);
  });

  it('tolerates malformed job (no tags, no salary)', () => {
    const u = baseUser();
    const job = { seniority: 'mid', location: { city: 'Tiranë' }, postedAt: new Date(), tier: 'basic' };
    const { boost } = userEmbeddingService.computeHybridBoost(u, job);
    // mid match + city match (Tiranë vs Tiranë... wait baseUser has city Tiranë? Let me check)
    // baseUser has profile.location.city = 'Tiranë'. job.location.city = 'Tiranë'. So +0.07
    // baseUser experience = 2-5 vjet → mid. job.seniority = mid → +0.05
    // recent posting → +0.02
    expect(boost).toBeCloseTo(0.14, 4);
  });
});
