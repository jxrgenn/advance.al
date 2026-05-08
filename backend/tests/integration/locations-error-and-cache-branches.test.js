/**
 * Phase 28 — coverage push for routes/locations.js error branches.
 *
 * Targets:
 *   - L34-35 error handler in GET / (DB error → 500 with message)
 *   - L70-71 error handler in GET /popular (DB error → 500 with message)
 *
 * NOTE: cache-hit branches (L17, L53) cannot be unit-tested without real
 * Upstash Redis env vars or full ESM module mocking — they are exercised
 * organically in production.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, jest } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import Location from '../../src/models/Location.js';

describe('locations.js — error branches', () => {
  beforeAll(async () => { await connectTestDB(); await seedLocations(); });
  afterEach(async () => {
    jest.restoreAllMocks();
    await clearTestDB();
    await seedLocations();
  });
  afterAll(async () => { await closeTestDB(); });

  it('GET / returns 500 when Location.getActiveLocations throws (L34-35)', async () => {
    jest.spyOn(Location, 'getActiveLocations').mockRejectedValueOnce(new Error('DB exploded'));
    const r = await request(app).get('/api/locations');
    expect(r.status).toBe(500);
    expect(r.body.success).toBe(false);
    expect(r.body.message).toMatch(/Gabim në marrjen e vendndodhjeve$/);
  });

  it('GET /popular returns 500 when Location.getPopularLocations throws (L70-71)', async () => {
    jest.spyOn(Location, 'getPopularLocations').mockRejectedValueOnce(new Error('DB exploded'));
    const r = await request(app).get('/api/locations/popular');
    expect(r.status).toBe(500);
    expect(r.body.success).toBe(false);
    expect(r.body.message).toMatch(/Gabim në marrjen e vendndodhjeve popullore/);
  });
});
