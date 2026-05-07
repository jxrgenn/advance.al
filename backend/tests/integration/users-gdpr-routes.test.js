/**
 * Phase 28 — coverage push for routes/users.js GDPR routes.
 *
 * Covers:
 *   - POST /cookie-consent — registers consent timestamp
 *   - GET /export — full data portability (jobseeker + employer branches)
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createJobseeker, createVerifiedEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import User from '../../src/models/User.js';
import Application from '../../src/models/Application.js';

describe('users.js — GDPR routes', () => {
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

  it('POST /cookie-consent records the consent timestamp', async () => {
    const { user } = await createJobseeker({ email: 'consent@example.com' });
    const r = await request(app)
      .post('/api/users/cookie-consent')
      .set(createAuthHeaders(user));
    expect(r.status).toBe(200);

    const refreshed = await User.findById(user._id);
    expect(refreshed.consentTracking.cookieConsentAt).toBeInstanceOf(Date);
  });

  it('GET /export returns full jobseeker data with applications + saved jobs', async () => {
    const { user: js } = await createJobseeker({ email: 'export-js@example.com' });
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp);

    // Create an application + save a job
    await Application.create({
      jobId: job._id, jobSeekerId: js._id, employerId: emp._id,
      status: 'pending', applicationMethod: 'one_click',
      coverLetter: 'My cover letter explaining why I match this position perfectly',
    });
    js.savedJobs = [job._id];
    await js.save({ validateBeforeSave: false });

    const r = await request(app)
      .get('/api/users/export')
      .set(createAuthHeaders(js));

    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.data.account.email).toBe('export-js@example.com');
    expect(r.body.data.account.userType).toBe('jobseeker');
    expect(r.body.data.jobSeekerProfile).toBeDefined();
    expect(r.body.data.applications.length).toBe(1);
    expect(r.body.data.applications[0].jobTitle).toBe(job.title);
    expect(r.body.data.savedJobs.length).toBe(1);
  });

  it('GET /export returns employer data with posted jobs', async () => {
    const { user: emp } = await createVerifiedEmployer({ email: 'export-emp@example.com' });
    await createJob(emp, { title: 'Posted Job 1' });
    await createJob(emp, { title: 'Posted Job 2' });

    const r = await request(app)
      .get('/api/users/export')
      .set(createAuthHeaders(emp));

    expect(r.status).toBe(200);
    expect(r.body.data.account.userType).toBe('employer');
    expect(r.body.data.employerProfile).toBeDefined();
    expect(r.body.data.postedJobs.length).toBe(2);
    const titles = r.body.data.postedJobs.map(j => j.title);
    expect(titles).toContain('Posted Job 1');
    expect(titles).toContain('Posted Job 2');
  });

  it('GET /export 401s without auth', async () => {
    const r = await request(app).get('/api/users/export');
    expect(r.status).toBe(401);
  });

  it('GET /export omits sensitive fields (password, refreshTokens)', async () => {
    const { user } = await createJobseeker({ email: 'export-sensitive@example.com' });
    const r = await request(app)
      .get('/api/users/export')
      .set(createAuthHeaders(user));

    const blob = JSON.stringify(r.body);
    expect(blob).not.toMatch(/refreshTokens/i);
    expect(blob).not.toContain('password');
  });
});
