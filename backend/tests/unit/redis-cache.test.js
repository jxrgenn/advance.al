/**
 * Unit tests for redis.js cache helpers (Phase 28 — Phase 6).
 *
 * Baseline 18.9%. Tests run with redis=null (no Upstash creds in test env)
 * to exercise the no-op safety paths. The "happy" Redis paths can only be
 * tested with a real Upstash instance — out of scope for $2/mo budget.
 */

import { describe, it, expect } from '@jest/globals';
import { cacheGet, cacheSet, cacheDelete, cacheDeletePattern, cacheGetOrSet } from '../../src/config/redis.js';

describe('redis cache helpers — no-Redis-configured path', () => {
  // Note: the singleton `redis` is initialized at module-import time. In test
  // env, UPSTASH_* env vars are typically absent, so redis === null. All
  // helpers degrade to safe no-ops.

  it('cacheGet returns null when redis not configured', async () => {
    const r = await cacheGet('any-key');
    expect(r).toBeNull();
  });

  it('cacheSet does not throw when redis not configured', async () => {
    await expect(cacheSet('k', { foo: 'bar' }, 60)).resolves.toBeUndefined();
  });

  it('cacheDelete does not throw when redis not configured', async () => {
    await expect(cacheDelete('k')).resolves.toBeUndefined();
  });

  it('cacheDeletePattern does not throw when redis not configured', async () => {
    await expect(cacheDeletePattern('user:*')).resolves.toBeUndefined();
  });

  it('cacheGetOrSet falls back to fetchFn when redis not configured', async () => {
    let called = false;
    const r = await cacheGetOrSet('k', async () => { called = true; return 42; }, 60);
    expect(called).toBe(true);
    expect(r).toBe(42);
  });

  it('cacheGetOrSet propagates fetchFn errors', async () => {
    await expect(
      cacheGetOrSet('k', async () => { throw new Error('fetch failed'); }, 60)
    ).rejects.toThrow('fetch failed');
  });

  it('cacheSet handles undefined value without throwing', async () => {
    await expect(cacheSet('k', undefined, 60)).resolves.toBeUndefined();
  });

  it('cacheSet uses default TTL when not specified', async () => {
    await expect(cacheSet('k', 'v')).resolves.toBeUndefined();
  });
});
