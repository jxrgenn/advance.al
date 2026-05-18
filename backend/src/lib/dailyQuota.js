/**
 * Daily per-key quota — pre-deploy audit (Round O-D).
 *
 * Bounds expensive OpenAI calls per user per UTC day. Used by CV generation
 * (10/day default) and embedding regen (50/day default).
 *
 * Storage:
 *   - Upstash Redis INCR if configured (atomic, multi-instance-safe). Key
 *     TTL is 36h so it always covers the day even with UTC/local skew.
 *   - In-memory Map fallback if Redis is absent. Per-process — in a
 *     multi-instance deploy this multiplies the effective cap by N
 *     instances. Acceptable: the goal is cost ceiling, not exact accounting.
 *
 * Why UTC: timezones change; UTC doesn't. Counter resets at 00:00 UTC.
 * That's 02:00 in Albania (CEST) / 01:00 (CET) — fine for our user base.
 *
 * Usage:
 *   import { incrementAndCheck } from '../lib/dailyQuota.js';
 *   const { count, allowed, remaining } = await incrementAndCheck(`cv:${userId}`, 10);
 *   if (!allowed) return res.status(429).json({ ... });
 */

import { redis } from '../config/redis.js';
import logger from '../config/logger.js';

const KEY_PREFIX = 'quota:daily';
const TTL_SECONDS = 36 * 60 * 60; // 36h — covers a UTC day with margin

// In-memory fallback. Map<string, {count, expiresAt}>. Cleared periodically.
const memoryStore = new Map();
const MEMORY_MAX_SIZE = 50000; // hard cap to prevent unbounded growth

function utcDateString(date = new Date()) {
  return date.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
}

function memoryIncrement(fullKey) {
  const now = Date.now();
  // Lazy cleanup: drop any expired entries we touch
  const existing = memoryStore.get(fullKey);
  if (existing && existing.expiresAt > now) {
    existing.count += 1;
    return existing.count;
  }
  // Cap map size to prevent runaway memory in pathological scenarios
  if (memoryStore.size >= MEMORY_MAX_SIZE) {
    // Drop the oldest entry (cheap approximation; iterator yields insertion order)
    const firstKey = memoryStore.keys().next().value;
    if (firstKey) memoryStore.delete(firstKey);
  }
  const fresh = { count: 1, expiresAt: now + TTL_SECONDS * 1000 };
  memoryStore.set(fullKey, fresh);
  return 1;
}

/**
 * Atomically increment the per-day counter and report whether the call is
 * within budget.
 *
 * @param {string} key     — short identifier, e.g. `cv:${userId}`. Combined
 *                            with the UTC date into the full Redis/Map key.
 * @param {number} max     — inclusive cap (count ≤ max → allowed).
 * @returns {{count: number, allowed: boolean, remaining: number}}
 */
export async function incrementAndCheck(key, max) {
  if (!key || typeof max !== 'number' || max <= 0) {
    logger.warn('dailyQuota: bad args', { key, max });
    return { count: 0, allowed: true, remaining: max || 0 };
  }

  const fullKey = `${KEY_PREFIX}:${key}:${utcDateString()}`;

  let count;
  /* istanbul ignore next — Redis-backed branch; tests run with Redis disabled */
  if (redis) {
    try {
      count = await redis.incr(fullKey);
      // EXPIRE only needs to fire on the first INCR; SETting TTL on every
      // INCR is harmless but wastes a round-trip. Cheap heuristic: set TTL
      // only when count === 1.
      if (count === 1) {
        await redis.expire(fullKey, TTL_SECONDS);
      }
    } catch (err) {
      // Redis hiccup: fail-OPEN. We'd rather let a few extra OpenAI calls
      // through than 429 a legitimate user because of a transient Redis blip.
      logger.warn('dailyQuota: Redis INCR failed; allowing', { key, error: err.message });
      return { count: 0, allowed: true, remaining: max };
    }
  } else {
    count = memoryIncrement(fullKey);
  }

  const allowed = count <= max;
  const remaining = Math.max(0, max - count);
  return { count, allowed, remaining };
}

/**
 * Read-only check — does NOT increment. Used by /admin status endpoints
 * (future use). Returns the current count or 0 if unknown.
 */
export async function peek(key) {
  if (!key) return 0;
  const fullKey = `${KEY_PREFIX}:${key}:${utcDateString()}`;
  /* istanbul ignore next — Redis-backed branch */
  if (redis) {
    try {
      const val = await redis.get(fullKey);
      return typeof val === 'number' ? val : (val ? parseInt(val, 10) || 0 : 0);
    } catch {
      return 0;
    }
  }
  const entry = memoryStore.get(fullKey);
  if (entry && entry.expiresAt > Date.now()) return entry.count;
  return 0;
}

/* test-only — clears the in-memory store. Not exported by default. */
export function __resetMemoryForTests() {
  memoryStore.clear();
}
