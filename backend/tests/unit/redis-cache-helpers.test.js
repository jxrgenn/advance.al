/**
 * Phase 28 — coverage push for config/redis.js cache helper functions.
 *
 * Tests the noop branches when redis is null (default in test env) and
 * the cacheGetOrSet fallback path.
 *
 * The error-catch branches (L26, L36, L45, L62) and lock acquisition (L80-95)
 * require a real Redis instance with mocked failures. Those are covered in
 * production via the actual Upstash REST client. Documented as JUSTIFIED
 * test gaps — see EXTERNAL_SERVICE_GAPS.md.
 */

import { describe, it, expect, jest } from '@jest/globals';
import {
  cacheGet,
  cacheSet,
  cacheDelete,
  cacheDeletePattern,
  cacheGetOrSet,
} from '../../src/config/redis.js';

describe('config/redis.js — cache helpers (no Redis configured)', () => {
  describe('cacheGet (L21-29)', () => {
    it('returns null when redis is null (no UPSTASH env vars)', async () => {
      const r = await cacheGet('any:key');
      expect(r).toBeNull();
    });
  });

  describe('cacheSet (L31-38)', () => {
    it('returns undefined (no-op) when redis is null', async () => {
      const r = await cacheSet('k', { foo: 'bar' }, 60);
      expect(r).toBeUndefined();
    });

    it('default ttlSeconds=300 still no-ops', async () => {
      const r = await cacheSet('k2', 'value');
      expect(r).toBeUndefined();
    });
  });

  describe('cacheDelete (L40-47)', () => {
    it('no-op when redis is null', async () => {
      const r = await cacheDelete('any:key');
      expect(r).toBeUndefined();
    });
  });

  describe('cacheDeletePattern (L49-65)', () => {
    it('no-op when redis is null', async () => {
      const r = await cacheDeletePattern('prefix:*');
      expect(r).toBeUndefined();
    });
  });

  describe('cacheGetOrSet (L68-96)', () => {
    it('falls back to direct fetchFn when redis is null', async () => {
      const fetchFn = jest.fn(async () => ({ data: 42 }));
      const r = await cacheGetOrSet('k', fetchFn);
      expect(r).toEqual({ data: 42 });
      expect(fetchFn).toHaveBeenCalledTimes(1);
    });

    it('default ttlSeconds=300 still uses fetchFn directly', async () => {
      const fetchFn = jest.fn(async () => 'value');
      const r = await cacheGetOrSet('k', fetchFn);
      expect(r).toBe('value');
    });

    it('propagates fetchFn rejections (no swallowing)', async () => {
      const err = new Error('fetch failed');
      const fetchFn = jest.fn(async () => { throw err; });
      await expect(cacheGetOrSet('k', fetchFn)).rejects.toThrow('fetch failed');
    });
  });
});
