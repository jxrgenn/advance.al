/**
 * Phase 28 — coverage push for applications.js GET /:id branches.
 *
 * Targets:
 *   - Employer-views-application path: markAsViewed + markMessagesAsRead (L505-507)
 *   - Jobseeker-views-application: markMessagesAsRead else branch (L509-511)
 *   - 404 for non-existent ObjectId (L486-491)
 *   - Cross-tenant outsider gets 403 (L497-501)
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

describe('applications.js — GET /:id extras', () => {
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

  it('employer view marks application as viewed (L505-507)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const { user: js } = await createJobseeker({ emailVerified: true });
    const job = await createJob(emp);
    const application = await Application.create({
      jobId: job._id, jobSeekerId: js._id, employerId: emp._id,
      applicationMethod: 'one_click', status: 'pending',
    });

    // First view by employer should set viewedAt
    const r = await request(app)
      .get(`/api/applications/${application._id}`)
      .set(createAuthHeaders(emp));
    expect(r.status).toBe(200);

    const dbApp = await Application.findById(application._id);
    expect(dbApp.viewedAt).toBeInstanceOf(Date);
  });

  it('jobseeker view does NOT mark as viewed (L508-511 else branch)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const { user: js } = await createJobseeker({ emailVerified: true });
    const job = await createJob(emp);
    const application = await Application.create({
      jobId: job._id, jobSeekerId: js._id, employerId: emp._id,
      applicationMethod: 'one_click', status: 'pending',
    });

    const r = await request(app)
      .get(`/api/applications/${application._id}`)
      .set(createAuthHeaders(js));
    expect(r.status).toBe(200);

    const dbApp = await Application.findById(application._id);
    expect(dbApp.viewedAt).toBeFalsy();
  });

  it('returns 404 for non-existent application (L486-491)', async () => {
    const { user: js } = await createJobseeker({ emailVerified: true });
    const r = await request(app)
      .get('/api/applications/507f1f77bcf86cd799439099')
      .set(createAuthHeaders(js));
    expect(r.status).toBe(404);
  });

  it('rejects malformed ObjectId via validateObjectId middleware (400)', async () => {
    const { user: js } = await createJobseeker({ emailVerified: true });
    const r = await request(app)
      .get('/api/applications/not-an-objectid')
      .set(createAuthHeaders(js));
    expect(r.status).toBe(400);
  });

  it('outsider jobseeker (not the applicant) gets 403 (L497-501)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const { user: applicant } = await createJobseeker({ emailVerified: true });
    const { user: outsider } = await createJobseeker({ emailVerified: true });
    const job = await createJob(emp);
    const application = await Application.create({
      jobId: job._id, jobSeekerId: applicant._id, employerId: emp._id,
      applicationMethod: 'one_click', status: 'pending',
    });

    const r = await request(app)
      .get(`/api/applications/${application._id}`)
      .set(createAuthHeaders(outsider));
    expect(r.status).toBe(403);
  });
});
