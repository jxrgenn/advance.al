/**
 * O-12 — GET /api/jobs 60s response cache must be partitioned by viewer.
 *
 * publicJob() attaches viewer-only fields (per-job contactOverrides) for
 * authenticated callers. Production caches the listing in Upstash Redis; the
 * key used to carry no viewer dimension, so an authenticated payload cached by
 * an employer/admin was served to anonymous visitors for 60s.
 *
 * Upstash is an external service and is disabled in tests, so its wrapper
 * (src/config/redis.js) is replaced by an in-memory store with the same
 * contract (values JSON-stringified on set, returned as stored on get).
 * Everything inside our backend runs for real.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, jest } from '@jest/globals';

const store = new Map();
jest.unstable_mockModule('../../src/config/redis.js', () => ({
  redis: null,
  cacheGet: async (key) => (store.has(key) ? store.get(key) : null),
  cacheSet: async (key, value) => { store.set(key, JSON.stringify(value)); },
  cacheDelete: async (key) => { store.delete(key); },
  cacheDeletePattern: async () => {},
  cacheGetOrSet: async (key, fetchFn) => fetchFn(),
}));

const { default: request } = await import('supertest');
const { default: app } = await import('../../server.js');
const { connectTestDB, closeTestDB, clearTestDB } = await import('../setup/testDb.js');
const { seedLocations } = await import('../fixtures/locations.fixture.js');
const { createVerifiedEmployer } = await import('../factories/user.factory.js');
const { createJob } = await import('../factories/job.factory.js');
const { createAuthHeaders } = await import('../helpers/auth.helper.js');

const PHONE = '+355691234567';
const jobsCacheKeys = () => [...store.keys()].filter(k => k.startsWith('jobs:search:'));

describe('GET /api/jobs — cache key carries the viewer dimension (O-12)', () => {
  beforeAll(async () => { await connectTestDB(); await seedLocations(); });
  afterEach(async () => { store.clear(); await clearTestDB(); await seedLocations(); });
  afterAll(async () => { await closeTestDB(); });

  async function seedJobWithContacts() {
    const { user: emp } = await createVerifiedEmployer();
    await createJob(emp, {
      title: 'Me kontakte',
      contactOverrides: { useCustomContacts: true, phone: PHONE, whatsapp: PHONE },
    });
    return emp;
  }

  it('an authenticated payload cached first is NOT served to an anonymous caller', async () => {
    const emp = await seedJobWithContacts();

    const authed = await request(app).get('/api/jobs?page=1&limit=10').set(createAuthHeaders(emp));
    expect(authed.status).toBe(200);
    expect(authed.body.data.jobs[0].contactOverrides.phone).toBe(PHONE);
    expect(jobsCacheKeys()).toHaveLength(1);

    const anon = await request(app).get('/api/jobs?page=1&limit=10');
    expect(anon.status).toBe(200);
    expect(anon.body.data.jobs[0].title).toBe('Me kontakte');
    expect(anon.body.data.jobs[0].contactOverrides).toBeUndefined();
    expect(JSON.stringify(anon.body)).not.toContain(PHONE);
    expect(jobsCacheKeys()).toHaveLength(2);
  });

  it('an anonymous payload cached first is not served to an authenticated caller', async () => {
    const emp = await seedJobWithContacts();

    const anon = await request(app).get('/api/jobs?page=1&limit=10');
    expect(anon.body.data.jobs[0].contactOverrides).toBeUndefined();

    const authed = await request(app).get('/api/jobs?page=1&limit=10').set(createAuthHeaders(emp));
    expect(authed.body.data.jobs[0].contactOverrides.phone).toBe(PHONE);
  });

  it('a repeated anonymous request is served from the cache (same key reused)', async () => {
    await seedJobWithContacts();
    await request(app).get('/api/jobs?page=1&limit=10');
    const cachedBody = store.get(jobsCacheKeys()[0]);
    const again = await request(app).get('/api/jobs?page=1&limit=10');
    expect(jobsCacheKeys()).toHaveLength(1);
    expect(JSON.stringify(again.body)).toBe(cachedBody);
  });
});
