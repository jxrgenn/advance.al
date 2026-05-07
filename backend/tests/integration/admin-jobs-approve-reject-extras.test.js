/**
 * Phase 28 — coverage push for admin.js PATCH /jobs/:id/approve branches
 * not covered by admin.test.js: reject arm (L986), non-pending status 400
 * (L979-984).
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createAdmin, createVerifiedEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';

describe('admin.js — PATCH /jobs/:id/approve extra branches', () => {
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

  it('reject action: pending_approval → rejected (L986)', async () => {
    const { user: admin } = await createAdmin();
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp);
    job.status = 'pending_approval';
    await job.save();

    const r = await request(app)
      .patch(`/api/admin/jobs/${job._id}/approve`)
      .set(createAuthHeaders(admin))
      .send({ action: 'reject' });
    expect(r.status).toBe(200);
    expect(r.body.message).toMatch(/refuzua/i);
    expect(r.body.data.job.status).toBe('rejected');
  });

  it('returns 400 when job status is NOT pending_approval (L979-984)', async () => {
    const { user: admin } = await createAdmin();
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp); // factory creates active job

    const r = await request(app)
      .patch(`/api/admin/jobs/${job._id}/approve`)
      .set(createAuthHeaders(admin))
      .send({ action: 'approve' });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/pritje/i);
  });
});
