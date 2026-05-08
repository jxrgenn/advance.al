/**
 * Phase 28 — coverage push for users.js saved-jobs error paths.
 *
 * Targets:
 *   - L1620 POST /saved-jobs/check-bulk empty/non-array jobIds → empty savedMap
 *   - L1645-1651 POST /saved-jobs/check-bulk catch (User.findById throws)
 *   - L1668-1672 POST /saved-jobs/:jobId 404 when job inactive/deleted
 *   - L1696-1700 POST /saved-jobs/:jobId 403 when saveJob throws specific error
 *   - L1702-1706 POST /saved-jobs/:jobId 500 generic catch
 *   - L1735-1739 DELETE /saved-jobs/:jobId 403 when unsaveJob throws specific error
 *   - L1741-1745 DELETE /saved-jobs/:jobId 500 generic catch
 *   - L1808-1813 GET /saved-jobs catch
 *   - L1840-1845 GET /saved-jobs/check/:jobId catch
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, jest } from '@jest/globals';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createJobseeker, createVerifiedEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import User from '../../src/models/User.js';
import Job from '../../src/models/Job.js';

describe('users.js — saved-jobs error/edge paths', () => {
  beforeAll(async () => { await connectTestDB(); await seedLocations(); });
  afterEach(async () => {
    jest.restoreAllMocks();
    await clearTestDB();
    await seedLocations();
  });
  afterAll(async () => { await closeTestDB(); });

  it('POST /saved-jobs/check-bulk returns empty savedMap when jobIds missing (L1619-1621)', async () => {
    const { user: js } = await createJobseeker();
    const r = await request(app)
      .post('/api/users/saved-jobs/check-bulk')
      .set(createAuthHeaders(js))
      .send({});
    expect(r.status).toBe(200);
    expect(r.body.data.savedMap).toEqual({});
  });

  it('POST /saved-jobs/check-bulk returns empty savedMap when jobIds is empty array (L1619-1621)', async () => {
    const { user: js } = await createJobseeker();
    const r = await request(app)
      .post('/api/users/saved-jobs/check-bulk')
      .set(createAuthHeaders(js))
      .send({ jobIds: [] });
    expect(r.status).toBe(200);
    expect(r.body.data.savedMap).toEqual({});
  });

  it('POST /saved-jobs/check-bulk returns savedMap for known IDs', async () => {
    const { user: js } = await createJobseeker();
    const { user: emp } = await createVerifiedEmployer();
    const job1 = await createJob(emp);
    const job2 = await createJob(emp);
    // Save job1 only
    await js.saveJob(job1._id);

    const r = await request(app)
      .post('/api/users/saved-jobs/check-bulk')
      .set(createAuthHeaders(js))
      .send({ jobIds: [job1._id.toString(), job2._id.toString()] });
    expect(r.status).toBe(200);
    expect(r.body.data.savedMap[job1._id.toString()]).toBe(true);
    expect(r.body.data.savedMap[job2._id.toString()]).toBe(false);
  });

  it('POST /saved-jobs/check-bulk returns 500 when User.findById throws (L1645-1651)', async () => {
    const { user: js } = await createJobseeker();
    const realFindById = User.findById.bind(User);
    let count = 0;
    jest.spyOn(User, 'findById').mockImplementation(function (...args) {
      count++;
      // Skip auth's findById (count 1), fail on route's call (count 2)
      if (count === 1) return realFindById(...args);
      throw new Error('boom');
    });
    const r = await request(app)
      .post('/api/users/saved-jobs/check-bulk')
      .set(createAuthHeaders(js))
      .send({ jobIds: ['507f1f77bcf86cd799439011'] });
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/punëve të ruajtura/);
  });

  it('POST /saved-jobs/:jobId returns 404 when job is inactive (L1668-1672)', async () => {
    const { user: js } = await createJobseeker();
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp);
    // Make it inactive
    await Job.updateOne({ _id: job._id }, { $set: { status: 'expired' } });

    const r = await request(app)
      .post(`/api/users/saved-jobs/${job._id}`)
      .set(createAuthHeaders(js));
    expect(r.status).toBe(404);
    expect(r.body.message).toMatch(/Puna nuk u gjet ose nuk është aktive/);
  });

  it('POST /saved-jobs/:jobId returns 500 when saveJob throws unexpected error (L1702-1706)', async () => {
    const { user: js } = await createJobseeker();
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp);

    jest.spyOn(User.prototype, 'saveJob').mockRejectedValueOnce(new Error('mongo write fail'));
    const r = await request(app)
      .post(`/api/users/saved-jobs/${job._id}`)
      .set(createAuthHeaders(js));
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/ruajtjen e punës/);
  });

  it('POST /saved-jobs/:jobId returns 403 when saveJob throws role error (L1696-1700)', async () => {
    const { user: js } = await createJobseeker();
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp);

    jest.spyOn(User.prototype, 'saveJob').mockRejectedValueOnce(new Error('Only job seekers can save jobs'));
    const r = await request(app)
      .post(`/api/users/saved-jobs/${job._id}`)
      .set(createAuthHeaders(js));
    expect(r.status).toBe(403);
    expect(r.body.message).toMatch(/Vetëm kërkuesit e punës/);
  });

  it('DELETE /saved-jobs/:jobId returns 403 when unsaveJob throws role error (L1735-1739)', async () => {
    const { user: js } = await createJobseeker();
    const id = new mongoose.Types.ObjectId().toString();
    jest.spyOn(User.prototype, 'unsaveJob').mockRejectedValueOnce(new Error('Only job seekers can unsave jobs'));
    const r = await request(app)
      .delete(`/api/users/saved-jobs/${id}`)
      .set(createAuthHeaders(js));
    expect(r.status).toBe(403);
    expect(r.body.message).toMatch(/Vetëm kërkuesit e punës/);
  });

  it('DELETE /saved-jobs/:jobId returns 500 when unsaveJob throws generic error (L1741-1745)', async () => {
    const { user: js } = await createJobseeker();
    const id = new mongoose.Types.ObjectId().toString();
    jest.spyOn(User.prototype, 'unsaveJob').mockRejectedValueOnce(new Error('mongo write fail'));
    const r = await request(app)
      .delete(`/api/users/saved-jobs/${id}`)
      .set(createAuthHeaders(js));
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/heqjen e punës/);
  });

  it('GET /saved-jobs returns 500 when Job.find throws (L1808-1813)', async () => {
    const { user: js } = await createJobseeker();
    jest.spyOn(Job, 'find').mockImplementationOnce(() => {
      throw new Error('find fail');
    });
    const r = await request(app)
      .get('/api/users/saved-jobs')
      .set(createAuthHeaders(js));
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/punëve të ruajtura/);
  });

  it('GET /saved-jobs/check/:jobId returns 500 when isJobSaved throws (L1840-1845)', async () => {
    const { user: js } = await createJobseeker();
    const id = new mongoose.Types.ObjectId().toString();
    jest.spyOn(User.prototype, 'isJobSaved').mockImplementationOnce(() => {
      throw new Error('check fail');
    });
    const r = await request(app)
      .get(`/api/users/saved-jobs/check/${id}`)
      .set(createAuthHeaders(js));
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/punës së ruajtur/);
  });

  it('GET /saved-jobs/check/:jobId returns 200 with saved=true for saved job', async () => {
    const { user: js } = await createJobseeker();
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp);
    await js.saveJob(job._id);

    const r = await request(app)
      .get(`/api/users/saved-jobs/check/${job._id}`)
      .set(createAuthHeaders(js));
    expect(r.status).toBe(200);
    expect(r.body.data.saved).toBe(true);
  });

  it('GET /saved-jobs respects sortBy whitelist (default to createdAt for unknown sortBy)', async () => {
    const { user: js } = await createJobseeker();
    const r = await request(app)
      .get('/api/users/saved-jobs?sortBy=invalidField')
      .set(createAuthHeaders(js));
    expect(r.status).toBe(200);
    expect(r.body.data.pagination).toBeDefined();
  });

  it('POST /saved-jobs/check-bulk caps at 50 IDs (L1623-1624)', async () => {
    const { user: js } = await createJobseeker();
    const ids = Array.from({ length: 100 }, () => new mongoose.Types.ObjectId().toString());
    const r = await request(app)
      .post('/api/users/saved-jobs/check-bulk')
      .set(createAuthHeaders(js))
      .send({ jobIds: ids });
    expect(r.status).toBe(200);
    // Only first 50 should appear in savedMap
    expect(Object.keys(r.body.data.savedMap)).toHaveLength(50);
  });
});
