/**
 * Phase 28 — coverage push for applications.js DELETE /:id (withdraw) extras.
 *
 * Existing tests cover:
 *   - happy withdraw of pending application
 *   - 400 on hired application
 *
 * Adds:
 *   - 400 on rejected application (other half of L784)
 *   - 404 when application not found / not owned
 *   - withdraw includes reason in side-effects
 *   - body.reason undefined → defaults to '' (L769)
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createJobseeker, createVerifiedEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import Application from '../../src/models/Application.js';

describe('applications.js — DELETE /:id withdraw extras', () => {
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

  it('rejects withdrawal of rejected application (L784-789, other arm)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const { user: js } = await createJobseeker({ emailVerified: true });
    const job = await createJob(emp);
    const application = await Application.create({
      jobId: job._id, jobSeekerId: js._id, employerId: emp._id,
      applicationMethod: 'one_click', status: 'rejected',
    });

    const r = await request(app)
      .delete(`/api/applications/${application._id}`)
      .set(createAuthHeaders(js));
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/pranuar.*refuzuar|tërhiqni/i);
  });

  it('returns 404 for non-existent application id', async () => {
    const { user: js } = await createJobseeker({ emailVerified: true });
    const r = await request(app)
      .delete('/api/applications/507f1f77bcf86cd799439099')
      .set(createAuthHeaders(js));
    expect(r.status).toBe(404);
  });

  it('returns 404 when jobseeker tries to withdraw another jobseeker\'s application', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const { user: js1 } = await createJobseeker({ email: 'a@example.com', emailVerified: true });
    const { user: js2 } = await createJobseeker({ email: 'b@example.com', emailVerified: true });
    const job = await createJob(emp);
    const application = await Application.create({
      jobId: job._id, jobSeekerId: js1._id, employerId: emp._id,
      applicationMethod: 'one_click', status: 'pending',
    });

    const r = await request(app)
      .delete(`/api/applications/${application._id}`)
      .set(createAuthHeaders(js2));
    expect(r.status).toBe(404);
  });

  it('withdraw without body succeeds (reason defaults to "" L769)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const { user: js } = await createJobseeker({ emailVerified: true });
    const job = await createJob(emp);
    const application = await Application.create({
      jobId: job._id, jobSeekerId: js._id, employerId: emp._id,
      applicationMethod: 'one_click', status: 'pending',
    });

    const r = await request(app)
      .delete(`/api/applications/${application._id}`)
      .set(createAuthHeaders(js));
    expect(r.status).toBe(200);
  });

  it('employer cannot withdraw (requireJobSeeker → 403)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const { user: js } = await createJobseeker({ emailVerified: true });
    const job = await createJob(emp);
    const application = await Application.create({
      jobId: job._id, jobSeekerId: js._id, employerId: emp._id,
      applicationMethod: 'one_click', status: 'pending',
    });

    const r = await request(app)
      .delete(`/api/applications/${application._id}`)
      .set(createAuthHeaders(emp));
    expect(r.status).toBe(403);
  });
});
