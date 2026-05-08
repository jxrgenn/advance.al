/**
 * Phase 28 — coverage push for users.js cookie-consent + GDPR /export.
 *
 * Targets:
 *   - L1950-1965 POST /cookie-consent happy + 500 catch
 *   - L1969-2097 GET /export jobseeker + employer payloads + 500 catch
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, jest } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createJobseeker, createVerifiedEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import User from '../../src/models/User.js';
import Application from '../../src/models/Application.js';

describe('users.js — cookie-consent + GDPR /export', () => {
  beforeAll(async () => { await connectTestDB(); await seedLocations(); });
  afterEach(async () => {
    jest.restoreAllMocks();
    await clearTestDB();
    await seedLocations();
  });
  afterAll(async () => { await closeTestDB(); });

  it('POST /cookie-consent records consent timestamp', async () => {
    const { user: js } = await createJobseeker();
    const r = await request(app)
      .post('/api/users/cookie-consent')
      .set(createAuthHeaders(js));
    expect(r.status).toBe(200);
    expect(r.body.message).toMatch(/Cookie consent/);
    const reloaded = await User.findById(js._id);
    expect(reloaded.consentTracking?.cookieConsentAt).toBeDefined();
  });

  it('POST /cookie-consent returns 500 when save throws', async () => {
    const { user: js } = await createJobseeker();
    jest.spyOn(User.prototype, 'save').mockRejectedValueOnce(new Error('save fail'));
    const r = await request(app)
      .post('/api/users/cookie-consent')
      .set(createAuthHeaders(js));
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/cookie consent/);
  });

  it('GET /export returns jobseeker payload with profile + applications + savedJobs', async () => {
    const { user: js } = await createJobseeker();
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp);
    // Create an application
    await Application.create({
      jobSeekerId: js._id,
      jobId: job._id,
      employerId: emp._id,
      status: 'pending',
      applicationMethod: 'one_click',
    });
    // Save a job
    await js.saveJob(job._id);

    const r = await request(app)
      .get('/api/users/export')
      .set(createAuthHeaders(js));
    expect(r.status).toBe(200);
    expect(r.body.data.account).toBeDefined();
    expect(r.body.data.account.email).toBe(js.email);
    expect(r.body.data.jobSeekerProfile).toBeDefined();
    expect(r.body.data.applications.length).toBe(1);
    expect(r.body.data.applications[0].jobTitle).toBe(job.title);
    expect(r.body.data.savedJobs.length).toBe(1);
  });

  it('GET /export returns employer payload with employerProfile + postedJobs', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp);

    const r = await request(app)
      .get('/api/users/export')
      .set(createAuthHeaders(emp));
    expect(r.status).toBe(200);
    expect(r.body.data.employerProfile).toBeDefined();
    expect(r.body.data.postedJobs.length).toBe(1);
    expect(r.body.data.postedJobs[0].title).toBe(job.title);
  });

  it('GET /export returns 500 when User.findById throws', async () => {
    const { user: js } = await createJobseeker();
    const realFindById = User.findById.bind(User);
    let calls = 0;
    jest.spyOn(User, 'findById').mockImplementation(function (...args) {
      calls++;
      if (calls === 1) return realFindById(...args); // auth middleware
      throw new Error('export findById fail');
    });
    const r = await request(app)
      .get('/api/users/export')
      .set(createAuthHeaders(js));
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/eksportimit/);
  });
});
