/**
 * Unit tests for jobEmbeddingService pure helpers (Phase 28 — Phase 6).
 *
 * Baseline 16.7%. The following methods are pure and 100% testable here:
 *   - prepareTextForEmbedding: builds a weighted text representation
 *   - extractRoleType: title → role-type classification
 *   - cosineSimilarity: vector math
 *   - vectorMagnitude: vector math
 *
 * The OpenAI-dependent methods (generateEmbedding, callOpenAIWithRetry,
 * computeSimilarities) need the snapshot infra; deferred.
 */

import { describe, it, expect } from '@jest/globals';
import jobEmbeddingService from '../../src/services/jobEmbeddingService.js';

describe('jobEmbeddingService.extractRoleType', () => {
  it('returns null for falsy input', () => {
    expect(jobEmbeddingService.extractRoleType(null)).toBeNull();
    expect(jobEmbeddingService.extractRoleType(undefined)).toBeNull();
    expect(jobEmbeddingService.extractRoleType('')).toBeNull();
  });

  it('detects Frontend roles by keyword (frontend / front-end / front end)', () => {
    expect(jobEmbeddingService.extractRoleType('Frontend Developer')).toBe('Frontend Developer');
    expect(jobEmbeddingService.extractRoleType('front-end engineer')).toBe('Frontend Developer');
    expect(jobEmbeddingService.extractRoleType('Front End Dev')).toBe('Frontend Developer');
  });

  it('detects Frontend by framework hint (React/Vue/Angular)', () => {
    expect(jobEmbeddingService.extractRoleType('React Engineer')).toBe('Frontend Developer');
    expect(jobEmbeddingService.extractRoleType('Vue.js Specialist')).toBe('Frontend Developer');
    expect(jobEmbeddingService.extractRoleType('Senior Angular Dev')).toBe('Frontend Developer');
  });

  it('detects Backend roles', () => {
    expect(jobEmbeddingService.extractRoleType('Backend Developer')).toBe('Backend Developer');
    expect(jobEmbeddingService.extractRoleType('back-end engineer')).toBe('Backend Developer');
    expect(jobEmbeddingService.extractRoleType('API Developer')).toBe('Backend Developer');
  });

  it('detects Full Stack roles (and these win over backend/frontend)', () => {
    expect(jobEmbeddingService.extractRoleType('Full Stack Developer')).toBe('Full Stack Developer');
    expect(jobEmbeddingService.extractRoleType('fullstack engineer')).toBe('Full Stack Developer');
    expect(jobEmbeddingService.extractRoleType('Full-stack Programmer')).toBe('Full Stack Developer');
  });

  it('detects Mobile roles (ios/android/react-native/flutter)', () => {
    expect(jobEmbeddingService.extractRoleType('iOS Developer')).toBe('Mobile Developer');
    expect(jobEmbeddingService.extractRoleType('Android Engineer')).toBe('Mobile Developer');
    expect(jobEmbeddingService.extractRoleType('React Native Dev')).toBe('Mobile Developer');
    expect(jobEmbeddingService.extractRoleType('Flutter Specialist')).toBe('Mobile Developer');
  });

  it('detects DevOps roles (devops/sre/cloud)', () => {
    expect(jobEmbeddingService.extractRoleType('DevOps Engineer')).toBe('DevOps Engineer');
    expect(jobEmbeddingService.extractRoleType('SRE')).toBe('DevOps Engineer');
    expect(jobEmbeddingService.extractRoleType('Cloud Engineer')).toBe('DevOps Engineer');
  });

  it('detects Data Science / ML roles', () => {
    expect(jobEmbeddingService.extractRoleType('Data Scientist')).toBe('Data Science / ML Engineer');
    expect(jobEmbeddingService.extractRoleType('Machine Learning Engineer')).toBe('Data Science / ML Engineer');
    expect(jobEmbeddingService.extractRoleType('AI Engineer')).toBe('Data Science / ML Engineer');
  });

  it('detects Data Engineer / Analyst', () => {
    expect(jobEmbeddingService.extractRoleType('Data Engineer')).toBe('Data Engineer');
    expect(jobEmbeddingService.extractRoleType('Senior Data Analyst')).toBe('Data Engineer');
  });

  it('detects Designer roles', () => {
    expect(jobEmbeddingService.extractRoleType('UX Designer')).toBe('Designer');
    expect(jobEmbeddingService.extractRoleType('UI/UX Specialist')).toBe('Designer');
  });

  it('detects Product roles', () => {
    expect(jobEmbeddingService.extractRoleType('Product Manager')).toBe('Product Manager');
    expect(jobEmbeddingService.extractRoleType('Senior Product Owner')).toBe('Product Manager');
  });

  it('falls back to generic Software Engineer for software/programmer/developer titles', () => {
    expect(jobEmbeddingService.extractRoleType('Software Engineer')).toBe('Software Engineer');
    expect(jobEmbeddingService.extractRoleType('Senior Programmer')).toBe('Software Engineer');
    expect(jobEmbeddingService.extractRoleType('Developer')).toBe('Software Engineer');
  });

  it('returns null for non-tech titles', () => {
    expect(jobEmbeddingService.extractRoleType('Plumber')).toBeNull();
    expect(jobEmbeddingService.extractRoleType('Marketing Manager')).toBeNull();
    expect(jobEmbeddingService.extractRoleType('Accountant')).toBeNull();
  });
});

describe('jobEmbeddingService.prepareTextForEmbedding', () => {
  it('returns empty string for empty job', () => {
    expect(jobEmbeddingService.prepareTextForEmbedding({})).toBe('');
  });

  it('double-weights title', () => {
    const text = jobEmbeddingService.prepareTextForEmbedding({ title: 'Senior React Dev' });
    const occurrences = text.match(/Senior React Dev/g) || [];
    expect(occurrences.length).toBe(2);
  });

  it('appends extracted role-type context', () => {
    const text = jobEmbeddingService.prepareTextForEmbedding({ title: 'Senior React Dev' });
    expect(text).toContain('This is a Frontend Developer position');
  });

  it('double-weights category', () => {
    const text = jobEmbeddingService.prepareTextForEmbedding({ category: 'Teknologji' });
    const occurrences = text.match(/Teknologji/g) || [];
    expect(occurrences.length).toBe(2);
  });

  it('includes seniority with "level position" suffix', () => {
    const text = jobEmbeddingService.prepareTextForEmbedding({ seniority: 'senior' });
    expect(text).toContain('senior level position');
  });

  it('truncates description to 2500 chars', () => {
    const longDesc = 'd'.repeat(5000);
    const text = jobEmbeddingService.prepareTextForEmbedding({ description: longDesc });
    const ds = text.match(/d+/);
    expect(ds[0].length).toBeLessThanOrEqual(2500);
  });

  it('joins requirements with "Requirements: " prefix', () => {
    const text = jobEmbeddingService.prepareTextForEmbedding({
      requirements: ['React 5+ years', 'Node.js'],
    });
    expect(text).toContain('Requirements: React 5+ years. Node.js');
  });

  it('joins tags with "Technologies: " prefix', () => {
    const text = jobEmbeddingService.prepareTextForEmbedding({
      tags: ['React', 'TypeScript', 'GraphQL'],
    });
    expect(text).toContain('Technologies: React, TypeScript, GraphQL');
  });

  it('truncates final output to 8000 chars', () => {
    const huge = 'x'.repeat(20000);
    const text = jobEmbeddingService.prepareTextForEmbedding({
      title: 'X', description: huge,
    });
    expect(text.length).toBeLessThanOrEqual(8000);
  });
});

describe('jobEmbeddingService.cosineSimilarity', () => {
  it('throws on non-array input', () => {
    expect(() => jobEmbeddingService.cosineSimilarity('not array', [1, 2])).toThrow(/arrays/i);
    expect(() => jobEmbeddingService.cosineSimilarity([1, 2], null)).toThrow(/arrays/i);
  });

  it('throws on dimension mismatch', () => {
    expect(() => jobEmbeddingService.cosineSimilarity([1, 2, 3], [1, 2]))
      .toThrow(/dimension mismatch/i);
  });

  it('throws on empty vectors', () => {
    expect(() => jobEmbeddingService.cosineSimilarity([], [])).toThrow(/empty/i);
  });

  it('throws on NaN/Infinity values', () => {
    expect(() => jobEmbeddingService.cosineSimilarity([1, NaN], [1, 2])).toThrow(/Invalid/i);
    expect(() => jobEmbeddingService.cosineSimilarity([1, 2], [Infinity, 1])).toThrow(/Invalid/i);
  });

  it('returns 1.0 for identical unit vectors', () => {
    const r = jobEmbeddingService.cosineSimilarity([1, 0, 0], [1, 0, 0]);
    expect(r).toBeCloseTo(1.0, 6);
  });

  it('returns 0 for orthogonal vectors (clamped from -0)', () => {
    // Orthogonal vectors in dot-product space → cosine = 0
    const r = jobEmbeddingService.cosineSimilarity([1, 0], [0, 1]);
    expect(r).toBe(0);
  });

  it('returns 0 for opposite vectors (clamped to >= 0)', () => {
    // Anti-parallel vectors → -1, clamped to 0
    const r = jobEmbeddingService.cosineSimilarity([1, 0], [-1, 0]);
    expect(r).toBe(0);
  });

  it('returns 0 when either vector is zero (avoid div-by-zero)', () => {
    expect(jobEmbeddingService.cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
    expect(jobEmbeddingService.cosineSimilarity([1, 2, 3], [0, 0, 0])).toBe(0);
  });

  it('returns intermediate value for partial overlap', () => {
    // [1,1] and [1,0] → cos = 1/sqrt(2) ≈ 0.707
    const r = jobEmbeddingService.cosineSimilarity([1, 1], [1, 0]);
    expect(r).toBeCloseTo(0.7071, 3);
  });
});

describe('jobEmbeddingService.vectorMagnitude', () => {
  it('returns 0 for zero vector', () => {
    expect(jobEmbeddingService.vectorMagnitude([0, 0, 0])).toBe(0);
  });

  it('returns 1 for unit vector', () => {
    expect(jobEmbeddingService.vectorMagnitude([1, 0, 0])).toBe(1);
  });

  it('returns sqrt(14) for [1,2,3]', () => {
    expect(jobEmbeddingService.vectorMagnitude([1, 2, 3])).toBeCloseTo(Math.sqrt(14), 6);
  });

  it('returns 5 for 3-4-5 triple', () => {
    expect(jobEmbeddingService.vectorMagnitude([3, 4])).toBe(5);
  });
});

describe('jobEmbeddingService.sleep + timeout utilities', () => {
  it('sleep resolves after the specified delay', async () => {
    const start = Date.now();
    await jobEmbeddingService.sleep(50);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(40); // some scheduler slop
    expect(elapsed).toBeLessThan(200);
  });

  it('timeout rejects after the specified delay', async () => {
    await expect(jobEmbeddingService.timeout(50)).rejects.toThrow(/Timeout after 50ms/);
  });
});
