/**
 * O-54 on the Redis path — the path production uses (Upstash).
 *
 * With Redis configured, every /register request read its OWN JSON copy of
 * the pending registration, bumped `attempts` on that copy and wrote it back.
 * N parallel wrong guesses therefore all saw attempts=0: each answered
 * "mbetur 4", every one of them was compared, and the real code still worked
 * afterwards — the 5-attempt cap did not exist under concurrency. (The
 * in-memory fallback happened to be safe: the Map hands every request the
 * same object.)
 *
 * Attempts are now claimed with an atomic INCR before the comparison.
 *
 * Upstash is an external service and is disabled in tests, so its wrapper
 * (src/config/redis.js) is replaced by a fake with the same contract that
 * matters here: values round-trip through JSON (each reader gets its own
 * copy), every call is asynchronous with network latency, and INCR is atomic
 * (read+write in one step), exactly like Redis. Everything inside our backend
 * runs for real.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, jest } from '@jest/globals';

const store = new Map();
const latency = () => new Promise((resolve) => setTimeout(resolve, 3));
let failNextIncr = false;
const fakeRedis = {
  async get(key) {
    await latency();
    if (!store.has(key)) return null;
    const raw = store.get(key);
    try { return JSON.parse(raw); } catch { return raw; } // Upstash auto-deserializes
  },
  async set(key, value) {
    await latency();
    store.set(key, typeof value === 'string' ? value : JSON.stringify(value));
    return 'OK';
  },
  async del(...keys) {
    await latency();
    keys.forEach((k) => store.delete(k));
    return keys.length;
  },
  async incr(key) {
    await latency();
    if (failNextIncr) { failNextIncr = false; throw new Error('upstash timeout'); }
    const next = Number(store.get(key) || 0) + 1; // atomic: no await between read and write
    store.set(key, String(next));
    return next;
  },
  async expire() { await latency(); return 1; },
  async ping() { return 'PONG'; },
};

jest.unstable_mockModule('../../src/config/redis.js', () => ({
  redis: fakeRedis,
  cacheGet: (key) => fakeRedis.get(key),
  cacheSet: (key, value) => fakeRedis.set(key, JSON.stringify(value)),
  cacheDelete: (key) => fakeRedis.del(key),
  cacheDeletePattern: async () => {},
  cacheGetOrSet: async (key, fetchFn) => fetchFn(),
}));

const { default: crypto } = await import('crypto');
const { default: request } = await import('supertest');
const { default: app } = await import('../../server.js');
const { connectTestDB, closeTestDB, clearTestDB } = await import('../setup/testDb.js');
const { seedLocations } = await import('../fixtures/locations.fixture.js');
const { default: User } = await import('../../src/models/User.js');

const KNOWN_CODE = '424242';
const WRONG_CODE = '111111';
let seq = 0;
const nextEmail = () => `redis-reg-${Date.now()}-${++seq}@example.com`;

describe('O-54 — verification attempts on the Redis path', () => {
  beforeAll(async () => {
    await connectTestDB();
    await seedLocations();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    store.clear();
    failNextIncr = false;
    await clearTestDB();
    await seedLocations();
  });

  afterAll(async () => {
    await closeTestDB();
  });

  async function initiate(email) {
    jest.spyOn(crypto, 'randomInt').mockReturnValue(parseInt(KNOWN_CODE, 10));
    const r = await request(app).post('/api/auth/initiate-registration').send({
      email, password: 'StrongPass1', userType: 'jobseeker',
      firstName: 'Redis', lastName: 'Path', city: 'Tiranë',
    });
    expect(r.status).toBe(200);
    // The registration really lives in the (fake) Redis, as JSON.
    expect(typeof store.get(`pending_reg:${email}`)).toBe('string');
  }

  const register = (email, verificationCode) =>
    request(app).post('/api/auth/register').send({ email, verificationCode });

  it('10 parallel wrong codes → exactly 5 comparisons, remaining counts [1,2,3,4], real code dead afterwards', async () => {
    const email = nextEmail();
    await initiate(email);

    const compareSpy = jest.spyOn(crypto, 'timingSafeEqual');
    const responses = await Promise.all(Array.from({ length: 10 }, () => register(email, WRONG_CODE)));
    expect(compareSpy).toHaveBeenCalledTimes(5);
    compareSpy.mockRestore();

    for (const r of responses) expect(r.status).toBe(400);
    const remaining = responses
      .map((r) => /Ju kanë mbetur (\d) tentativa/.exec(r.body.message))
      .filter(Boolean)
      .map((m) => Number(m[1]))
      .sort();
    expect(remaining).toEqual([1, 2, 3, 4]);
    expect(store.get(`pending_reg_attempts:${email}`)).toBe('10'); // every request claimed a slot

    const late = await register(email, KNOWN_CODE);
    expect(late.status).toBe(400);
    expect(late.body.message).toBe('Kodi ka skaduar. Ju lutemi filloni regjistrimin përsëri.');
    expect(await User.countDocuments({ email })).toBe(0);
  });

  it('a correct code within the budget creates the account and clears both Redis keys', async () => {
    const email = nextEmail();
    await initiate(email);
    expect((await register(email, WRONG_CODE)).body.message).toBe('Kodi i gabuar. Ju kanë mbetur 4 tentativa.');

    const ok = await register(email, KNOWN_CODE);
    expect(ok.status).toBe(201);
    expect(store.has(`pending_reg:${email}`)).toBe(false);
    expect(store.has(`pending_reg_attempts:${email}`)).toBe(false);
  });

  it('re-initiating (new code) resets the Redis counter', async () => {
    const email = nextEmail();
    await initiate(email);
    for (let i = 0; i < 4; i++) await register(email, WRONG_CODE);
    expect(store.get(`pending_reg_attempts:${email}`)).toBe('4');

    await initiate(email);
    expect(store.has(`pending_reg_attempts:${email}`)).toBe(false);
    const r = await register(email, WRONG_CODE);
    expect(r.body.message).toBe('Kodi i gabuar. Ju kanë mbetur 4 tentativa.');
  });

  it('a failed INCR is counted in memory instead of failing open', async () => {
    const email = nextEmail();
    await initiate(email);
    failNextIncr = true;
    const r = await register(email, WRONG_CODE);
    expect(r.status).toBe(400);
    expect(r.body.message).toBe('Kodi i gabuar. Ju kanë mbetur 4 tentativa.');
    expect(store.has(`pending_reg_attempts:${email}`)).toBe(false); // INCR never landed
  });
});
