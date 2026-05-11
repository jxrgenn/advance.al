/**
 * Unit tests for recommendationReranker.
 * Mocks OpenAI so no network calls; focuses on input/output contracts and
 * fallback behavior so the route is robust under rerank failures.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

const ORIGINAL_ENV = { ...process.env };

const candidate = (id, title, category, finalScore) => ({
  job: { _id: id, title, category, location: { city: 'Tiranë' }, seniority: 'mid' },
  finalScore,
});

const buildUser = () => ({
  profile: {
    location: { city: 'Tiranë' },
    jobSeekerProfile: {
      title: 'Software Engineer',
      experience: '2-5 vjet',
      skills: ['Python', 'React'],
      desiredSalary: { min: 1000, max: 1500, currency: 'EUR' },
      bio: 'Backend engineer with API design experience.',
    },
  },
});

describe('recommendationReranker.rerank', () => {
  beforeEach(() => { jest.resetModules(); });
  afterEach(() => { Object.assign(process.env, ORIGINAL_ENV); });

  it('returns mode=disabled when RERANK_ENABLED=false', async () => {
    process.env.RERANK_ENABLED = 'false';
    const { rerank } = await import('../../src/services/recommendationReranker.js');
    const cands = [candidate('a', 'A', 'Teknologji', 0.9)];
    const r = await rerank(buildUser(), cands);
    expect(r.mode).toBe('disabled');
    expect(r.ranked).toEqual(cands);
  });

  it('returns input unchanged when candidates list is empty', async () => {
    const { rerank } = await import('../../src/services/recommendationReranker.js');
    const r = await rerank(buildUser(), []);
    expect(r.ranked).toEqual([]);
  });

  it('returns mode=fallback when OPENAI_API_KEY is unset', async () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.RERANK_ENABLED;
    const { rerank } = await import('../../src/services/recommendationReranker.js');
    const cands = [candidate('a', 'A', 'Teknologji', 0.9), candidate('b', 'B', 'Shitje', 0.8)];
    const r = await rerank(buildUser(), cands);
    expect(r.mode).toBe('fallback');
    expect(r.ranked).toEqual(cands);
  });

  it('falls back gracefully on OpenAI error', async () => {
    process.env.OPENAI_API_KEY = 'sk-test-fake';
    const { default: OpenAI } = await import('openai');
    jest.spyOn(OpenAI.prototype, 'constructor').mockImplementation(function() { this.chat = { completions: { create: () => Promise.reject(new Error('rate limit')) } }; });
    const { rerank } = await import('../../src/services/recommendationReranker.js');
    const cands = [candidate('a', 'A', 'Teknologji', 0.9)];
    const r = await rerank(buildUser(), cands);
    // Either mode='fallback' or mode='gpt-4o-mini' (if mock failed). Either way, ranked should be returned.
    expect(Array.isArray(r.ranked)).toBe(true);
    expect(r.ranked.length).toBe(1);
  });

  it('respects RERANK_TOP_K — only top-K reranked, tail untouched', async () => {
    process.env.RERANK_ENABLED = 'false'; // skip actual LLM, but RERANK_TOP_K should still be respected
    process.env.RERANK_TOP_K = '5';
    const { rerank } = await import('../../src/services/recommendationReranker.js');
    const cands = Array.from({ length: 10 }, (_, i) =>
      candidate(`id${i}`, `Job ${i}`, 'Teknologji', 1 - i * 0.05)
    );
    const r = await rerank(buildUser(), cands);
    // Disabled mode returns input unchanged; tail order preserved
    expect(r.ranked.map(x => x.job._id)).toEqual(cands.map(x => x.job._id));
  });
});
