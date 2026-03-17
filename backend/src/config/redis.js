import { Redis } from '@upstash/redis';
import logger from './logger.js';

let redis = null;

try {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
    logger.info('Redis cache initialized (Upstash)');
  } else {
    logger.info('Redis not configured — caching disabled');
  }
} catch (error) {
  logger.error('Redis initialization failed', { error: error.message });
}

// Generic cache helper with TTL in seconds
export async function cacheGet(key) {
  if (!redis) return null;
  try {
    return await redis.get(key);
  } catch (error) {
    logger.error('Redis GET error', { key, error: error.message });
    return null;
  }
}

export async function cacheSet(key, value, ttlSeconds = 300) {
  if (!redis) return;
  try {
    await redis.set(key, JSON.stringify(value), { ex: ttlSeconds });
  } catch (error) {
    logger.error('Redis SET error', { key, error: error.message });
  }
}

export async function cacheDelete(key) {
  if (!redis) return;
  try {
    await redis.del(key);
  } catch (error) {
    logger.error('Redis DEL error', { key, error: error.message });
  }
}

export async function cacheDeletePattern(pattern) {
  if (!redis) return;
  try {
    // Use SCAN instead of KEYS to avoid blocking Redis under load
    let cursor = 0;
    do {
      const result = await redis.scan(cursor, { match: pattern, count: 100 });
      cursor = result[0];
      const keys = result[1];
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } while (cursor !== 0);
  } catch (error) {
    logger.error('Redis DEL pattern error', { pattern, error: error.message });
  }
}

// Cache-aside with stampede protection (mutex lock)
export async function cacheGetOrSet(key, fetchFn, ttlSeconds = 300) {
  if (!redis) return fetchFn();
  try {
    const cached = await cacheGet(key);
    if (cached) return typeof cached === 'string' ? JSON.parse(cached) : cached;
  } catch {
    // fall through to fetch
  }

  // Try to acquire lock (NX = only set if not exists, EX = expire lock after 10s)
  const lockKey = `lock:${key}`;
  try {
    const acquired = await redis.set(lockKey, '1', { nx: true, ex: 10 });
    if (!acquired) {
      // Another request is computing — wait briefly and try cache again
      await new Promise(r => setTimeout(r, 200));
      const cached = await cacheGet(key);
      if (cached) return typeof cached === 'string' ? JSON.parse(cached) : cached;
      // Still no cache — proceed to fetch anyway (better than returning nothing)
    }
  } catch {
    // Lock failed, proceed to fetch
  }

  const data = await fetchFn();
  await cacheSet(key, data, ttlSeconds);
  await cacheDelete(lockKey);
  return data;
}

export { redis };
