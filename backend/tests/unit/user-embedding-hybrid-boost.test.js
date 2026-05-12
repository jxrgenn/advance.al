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
    expect(breakdown).toEqual({ category: 0, skills: 0, seniority: 0, location: 0, salary: 0, recency: 0, tier: 0 });
  });

  it('skills overlap: 1 match → 0.0167, 2 matches → 0.0333, 3+ matches → 0.05 (capped)', () => {
    const u = baseUser();
    const r1 = userEmbeddingService.computeHybridBoost(u, baseJob({ tags: ['React'] })).breakdown.skills;
    const r2 = userEmbeddingService.computeHybridBoost(u, baseJob({ tags: ['React', 'TypeScript'] })).breakdown.skills;
    const r3 = userEmbeddingService.computeHybridBoost(u, baseJob({ tags: ['React', 'TypeScript', 'Node.js'] })).breakdown.skills;
    const r4 = userEmbeddingService.computeHybridBoost(u, baseJob({ tags: ['React', 'TypeScript', 'Node.js', 'GraphQL'] })).breakdown.skills;
    expect(r1).toBeCloseTo(0.0167, 4);
    expect(r2).toBeCloseTo(0.0333, 4);
    expect(r3).toBeCloseTo(0.05, 4);
    expect(r4).toBeCloseTo(0.05, 4);
  });

  it('skills overlap is case-insensitive', () => {
    const u = baseUser({ jsp: { skills: ['REACT', 'typescript'] } });
    const job = baseJob({ tags: ['react', 'TypeScript'] });
    expect(userEmbeddingService.computeHybridBoost(u, job).breakdown.skills).toBeCloseTo(0.0333, 4);
  });

  it('skills overlap merges manual + aiCV technical + tools', () => {
    const u = baseUser({ jsp: {
      skills: ['React'],
      aiGeneratedCV: { skills: { technical: ['Python'], tools: ['Docker'] } },
    } });
    const job = baseJob({ tags: ['React', 'Python', 'Docker'] });
    expect(userEmbeddingService.computeHybridBoost(u, job).breakdown.skills).toBeCloseTo(0.05, 4);
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

  it('location: same city wins +0.10', () => {
    const u = baseUser({ profile: { location: { city: 'Tiranë' } } });
    expect(userEmbeddingService.computeHybridBoost(u, baseJob({ location: { city: 'Tiranë', remote: false } })).breakdown.location).toBe(0.10);
  });

  it('location: same city is case- and whitespace-tolerant', () => {
    const u = baseUser({ profile: { location: { city: '  tirAnë  ' } } });
    expect(userEmbeddingService.computeHybridBoost(u, baseJob({ location: { city: 'Tiranë' } })).breakdown.location).toBe(0.10);
  });

  it('location: remote-eligible job + openToRemote user wins +0.10 even on city mismatch', () => {
    const u = baseUser({ profile: { location: { city: 'Tiranë' } }, jsp: { openToRemote: true } });
    expect(userEmbeddingService.computeHybridBoost(u, baseJob({ location: { city: 'Vlorë', remote: true } })).breakdown.location).toBe(0.10);
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

  it('tier: 0 in tuned weights (premium did not predict applications in harness)', () => {
    const u = baseUser();
    expect(userEmbeddingService.computeHybridBoost(u, baseJob({ tier: 'premium' })).breakdown.tier).toBe(0);
    expect(userEmbeddingService.computeHybridBoost(u, baseJob({ tier: 'basic' })).breakdown.tier).toBe(0);
    expect(userEmbeddingService.computeHybridBoost(u, baseJob({ tier: 'featured' })).breakdown.tier).toBe(0);
  });

  it('max possible boost = 0.52 (all components incl. category fire; tier=0)', () => {
    const u = baseUser({
      profile: { location: { city: 'Tiranë' } },
      jsp: {
        title: 'Software Engineer', // → category Teknologji
        experience: '5-10 vjet', // → senior
        skills: ['A', 'B', 'C'],
        desiredSalary: { min: 1000, max: 2000, currency: 'EUR' },
        openToRemote: true,
      },
    });
    const job = baseJob({
      category: 'Teknologji', // matches inferred user category → +0.25
      tags: ['A', 'B', 'C', 'D'],
      seniority: 'senior',
      location: { city: 'Tiranë', remote: false },
      salary: { min: 1500, max: 2500, currency: 'EUR' },
      postedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      tier: 'premium',
    });
    const { boost, breakdown } = userEmbeddingService.computeHybridBoost(u, job);
    expect(breakdown.category).toBe(0.25);
    expect(breakdown.skills).toBeCloseTo(0.05, 4);
    expect(breakdown.location).toBe(0.10);
    expect(breakdown.tier).toBe(0);
    expect(boost).toBeCloseTo(0.52, 4);
  });

  describe('category match (inferred from title + skills, language-agnostic)', () => {
    it('Software Engineer title + Teknologji job → +0.25', () => {
      const u = baseUser({ jsp: { title: 'Software Engineer' } });
      const job = baseJob({ category: 'Teknologji' });
      expect(userEmbeddingService.computeHybridBoost(u, job).breakdown.category).toBe(0.25);
    });

    it('Albanian title (Zhvillues Software) + Teknologji job → +0.25', () => {
      const u = baseUser({ jsp: { title: 'Zhvillues Software', skills: [] } });
      const job = baseJob({ category: 'Teknologji' });
      expect(userEmbeddingService.computeHybridBoost(u, job).breakdown.category).toBe(0.25);
    });

    it('Marketing user + Marketing job → +0.25', () => {
      const u = baseUser({ jsp: { title: 'Specialiste Marketingu Dixhital', skills: ['SEO', 'Google Ads'] } });
      const job = baseJob({ category: 'Marketing' });
      expect(userEmbeddingService.computeHybridBoost(u, job).breakdown.category).toBe(0.25);
    });

    it('Tech user + non-tech job → no category boost', () => {
      const u = baseUser({ jsp: { title: 'Software Engineer' } });
      const job = baseJob({ category: 'Shitje' });
      expect(userEmbeddingService.computeHybridBoost(u, job).breakdown.category).toBe(0);
    });

    it('User with no profile data → no category boost', () => {
      const u = baseUser({ jsp: { title: undefined, skills: [], aiGeneratedCV: undefined } });
      const job = baseJob({ category: 'Teknologji' });
      expect(userEmbeddingService.computeHybridBoost(u, job).breakdown.category).toBe(0);
    });
  });

  describe('inferUserCategory (public delegate)', () => {
    it('infers Teknologji from English tech title', () => {
      const u = baseUser({ jsp: { title: 'AI Automation Engineer' } });
      expect(userEmbeddingService.inferUserCategory(u)).toBe('Teknologji');
    });
    it('infers Teknologji from Albanian tech title', () => {
      const u = baseUser({ jsp: { title: 'Zhvillues Software', skills: [] } });
      expect(userEmbeddingService.inferUserCategory(u)).toBe('Teknologji');
    });
    it('infers Financë from accounting title', () => {
      const u = baseUser({ jsp: { title: 'Menaxher Financiar', skills: ['Kontabilitet', 'Auditim'] } });
      expect(userEmbeddingService.inferUserCategory(u)).toBe('Financë');
    });
    it('infers Shëndetësi from healthcare title', () => {
      const u = baseUser({ jsp: { title: 'Infermiere e Licensuar', skills: [] } });
      expect(userEmbeddingService.inferUserCategory(u)).toBe('Shëndetësi');
    });
    it('infers Arsim from teaching title', () => {
      const u = baseUser({ jsp: { title: 'Mësuese Gjuhe Angleze', skills: [] } });
      expect(userEmbeddingService.inferUserCategory(u)).toBe('Arsim');
    });
    it('infers Dizajn from graphic designer title', () => {
      const u = baseUser({ jsp: { title: 'Dizajnere Grafike', skills: ['Photoshop', 'Figma'] } });
      expect(userEmbeddingService.inferUserCategory(u)).toBe('Dizajn');
    });
    it('returns null when no title or skills', () => {
      const u = baseUser({ jsp: { title: undefined, skills: [], aiGeneratedCV: undefined } });
      expect(userEmbeddingService.inferUserCategory(u)).toBeNull();
    });
    it('returns null when nothing matches a known pattern', () => {
      const u = baseUser({ jsp: { title: 'Lustraxhi i këpucëve', skills: [] } });
      expect(userEmbeddingService.inferUserCategory(u)).toBeNull();
    });

    it('handles Albanian declensions (suffixes) — "Marketingu", "Financiar", "Dizajnere", "Recepsioniste"', () => {
      const cases = [
        ['Specialiste Marketingu Dixhital', 'Marketing'],
        ['Menaxher Financiar', 'Financë'],
        ['Dizajnere Grafike', 'Dizajn'],
        ['Recepsioniste', 'Turizëm'],
        ['Shofer Kamioni', 'Transport'],
        ['Kuzhinier i Hotelit', 'Turizëm'],
        ['Shitëse', 'Shitje'],
        ['Elektricist', 'Inxhinieri'],
      ];
      for (const [title, expected] of cases) {
        const u = baseUser({ jsp: { title, skills: [] } });
        expect(userEmbeddingService.inferUserCategory(u)).toBe(expected);
      }
    });
  });

  it('tolerates malformed profile gracefully (no jobSeekerProfile, no location)', () => {
    const u = { profile: {} };
    const job = baseJob({ tags: ['React'], seniority: 'mid', tier: 'premium' });
    const { boost } = userEmbeddingService.computeHybridBoost(u, job);
    // All weighted signals gate on user fields (and tier is 0 under tuned weights),
    // so a totally-empty profile produces 0 boost.
    expect(boost).toBe(0);
  });

  it('tolerates malformed job (no tags, no salary)', () => {
    const u = baseUser();
    const job = { seniority: 'mid', location: { city: 'Tiranë' }, postedAt: new Date(), tier: 'basic' };
    const { boost } = userEmbeddingService.computeHybridBoost(u, job);
    // city match (Tiranë vs Tiranë) → +0.10
    // experience 2-5 → mid + job.seniority mid → +0.05
    // recent posting → +0.02
    // Total 0.17
    expect(boost).toBeCloseTo(0.17, 4);
  });
});
