/**
 * Phase 28 — coverage push for routes/notifications.js POST /test-job-match
 * happy path (L215-231). Existing tests cover 400 (no jobId) and 404
 * (non-existent), but never the actual notifyMatchingUsers result branch.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createAdmin, createVerifiedEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import QuickUser from '../../src/models/QuickUser.js';

describe('notifications.js — POST /test-job-match happy path', () => {
  beforeAll(async () => {
    await connectTestDB();
    await seedLocations();
  });

  afterEach(async () => {
    await clearTestDB();
    await seedLocations();
  });

  afterAll(async () => {
    await closeTestDB();
  });

  it('admin runs test-job-match against a real job → 200 with result data', async () => {
    const { user: admin } = await createAdmin();
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp, { title: 'Senior Backend Engineer' });

    // Seed a few QuickUsers that may match
    await QuickUser.create({
      firstName: 'Match', lastName: 'A',
      email: 'match-a@example.com',
      location: 'Tiranë', interests: ['Teknologji'],
      isActive: true,
    });
    await QuickUser.create({
      firstName: 'Match', lastName: 'B',
      email: 'match-b@example.com',
      location: 'Tiranë', interests: ['Teknologji'],
      isActive: true,
    });

    const r = await request(app)
      .post('/api/notifications/test-job-match')
      .set(createAuthHeaders(admin))
      .send({ jobId: job._id.toString() });

    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.data).toBeDefined();
    // notifyMatchingUsers returns an object describing the dispatch result;
    // exact shape depends on whether email service was reachable. We assert
    // the route's own success contract — the 200 OK with data envelope.
  });
});
