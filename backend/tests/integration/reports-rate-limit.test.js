/**
 * POST /api/reports rate limit: 5 reports per 15 minutes per USER, admins exempt.
 *
 * The limiter used to run before `authenticate`, so `req.user` was never set:
 * the per-user key and the admin skip never applied, and the IP fallback
 * passed the request object to ipKeyGenerator — every request got its own
 * bucket, i.e. no limit at all.
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createAdmin, createJobseeker } from '../factories/user.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import { Report } from '../../src/models/index.js';

const LIMIT_MESSAGE = 'Shumë raporte të dërguara. Ju lutemi provoni pas 15 minutash.';

async function report(reporter, reported) {
  return request(app)
    .post('/api/reports')
    .set(createAuthHeaders(reporter))
    .send({ reportedUserId: reported._id, category: 'spam_behavior', description: 'Mesazhe të padëshiruara' });
}

describe('POST /api/reports — per-user rate limit', () => {
  let targets;

  beforeAll(async () => {
    await connectTestDB();
    await seedLocations();
    targets = [];
    for (let i = 0; i < 8; i++) targets.push((await createJobseeker()).user);
  });

  afterAll(async () => {
    await closeTestDB();
  });

  it('allows 5 reports per user, rejects the 6th, and does not affect another user', async () => {
    const { user: first } = await createJobseeker();
    for (let i = 0; i < 5; i++) {
      const res = await report(first, targets[i]);
      expect(res.status).toBe(201);
    }

    const sixth = await report(first, targets[5]);
    expect(sixth.status).toBe(429);
    expect(sixth.body.message).toBe(LIMIT_MESSAGE);
    expect(await Report.countDocuments({ reportingUser: first._id })).toBe(5);

    // Same IP, different user: own bucket.
    const { user: second } = await createJobseeker();
    const other = await report(second, targets[5]);
    expect(other.status).toBe(201);
  });

  it('does not limit admins', async () => {
    const { user: admin } = await createAdmin();
    for (let i = 0; i < 7; i++) {
      const res = await report(admin, targets[i]);
      expect(res.status).toBe(201);
    }
    expect(await Report.countDocuments({ reportingUser: admin._id })).toBe(7);
  });
});
