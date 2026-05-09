/**
 * Unit tests for jobEmbeddingService.computeJobToJobBoost + scoreToTier (PR-D).
 * Pure functions; no DB or OpenAI.
 */
import { describe, it, expect } from '@jest/globals';
import jobEmbeddingService from '../../src/services/jobEmbeddingService.js';

const job = (o = {}) => ({
  category: 'Financë',
  location: { city: 'Tiranë' },
  seniority: 'mid',
  jobType: 'full-time',
  ...o,
});

describe('jobEmbeddingService.computeJobToJobBoost', () => {
  it('returns 0 boost when no attributes match', () => {
    const a = job();
    const b = job({ category: 'Marketing', location: { city: 'Vlorë' }, seniority: 'lead', jobType: 'part-time' });
    const { boost, breakdown } = jobEmbeddingService.computeJobToJobBoost(a, b);
    expect(boost).toBe(0);
    expect(breakdown).toEqual({ category: 0, city: 0, seniority: 0, jobType: 0 });
  });

  it('category match → +0.05', () => {
    const a = job();
    const b = job({ location: { city: 'Vlorë' }, seniority: 'lead', jobType: 'part-time' });
    const { boost } = jobEmbeddingService.computeJobToJobBoost(a, b);
    expect(boost).toBeCloseTo(0.05, 5);
  });

  it('city match → +0.04 and is case/whitespace tolerant', () => {
    const a = job({ location: { city: '  TirAnë ' } });
    const b = job({ category: 'Marketing', seniority: 'lead', jobType: 'part-time', location: { city: 'tiranë' } });
    const { boost, breakdown } = jobEmbeddingService.computeJobToJobBoost(a, b);
    expect(breakdown.city).toBeCloseTo(0.04, 5);
    expect(boost).toBeCloseTo(0.04, 5);
  });

  it('seniority match → +0.03', () => {
    const a = job({ seniority: 'senior' });
    const b = job({ category: 'Marketing', location: { city: 'Vlorë' }, jobType: 'part-time', seniority: 'senior' });
    expect(jobEmbeddingService.computeJobToJobBoost(a, b).boost).toBeCloseTo(0.03, 5);
  });

  it('jobType match → +0.02', () => {
    const a = job({ jobType: 'internship' });
    const b = job({ category: 'Marketing', location: { city: 'Vlorë' }, seniority: 'lead', jobType: 'internship' });
    expect(jobEmbeddingService.computeJobToJobBoost(a, b).boost).toBeCloseTo(0.02, 5);
  });

  it('all four attributes match → +0.14 (max boost)', () => {
    const a = job();
    const b = job(); // identical attributes
    const { boost } = jobEmbeddingService.computeJobToJobBoost(a, b);
    expect(boost).toBeCloseTo(0.14, 5);
  });

  it('tolerates missing fields gracefully', () => {
    const { boost: b1 } = jobEmbeddingService.computeJobToJobBoost({}, {});
    expect(b1).toBe(0);
    const { boost: b2 } = jobEmbeddingService.computeJobToJobBoost({ category: 'Financë' }, { category: 'Financë' });
    expect(b2).toBeCloseTo(0.05, 5);
    const { boost: b3 } = jobEmbeddingService.computeJobToJobBoost({ location: { city: 'Tiranë' } }, { location: { city: 'Tiranë' } });
    expect(b3).toBeCloseTo(0.04, 5);
  });
});

describe('jobEmbeddingService.scoreToTier', () => {
  it('classifies into strong/good/decent at thresholds 0.78 and 0.66', () => {
    expect(jobEmbeddingService.scoreToTier(0.95)).toBe('strong');
    expect(jobEmbeddingService.scoreToTier(0.78)).toBe('strong');
    expect(jobEmbeddingService.scoreToTier(0.7799)).toBe('good');
    expect(jobEmbeddingService.scoreToTier(0.66)).toBe('good');
    expect(jobEmbeddingService.scoreToTier(0.6599)).toBe('decent');
    expect(jobEmbeddingService.scoreToTier(0.5)).toBe('decent');
    expect(jobEmbeddingService.scoreToTier(0)).toBe('decent');
  });
});
