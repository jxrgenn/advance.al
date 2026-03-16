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
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch (error) {
    logger.error('Redis DEL pattern error', { pattern, error: error.message });
  }
}

export { redis };
