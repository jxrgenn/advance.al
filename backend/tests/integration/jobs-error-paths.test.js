/**
 * Phase 28 — coverage push for routes/jobs.js outer 500 catch blocks.
 *
 * Targets:
 *   - L386-387 GET / outer catch (Job.find throws)
 *   - L592-593 GET /recommendations outer catch
 *   - L660-661 GET /employer/my-jobs outer catch
 *   - L702-703 GET /:id outer catch (Job.findOne throws)
 *   - L794-795 GET /:id/similar outer catch
 *   - L1117-1118 POST / outer catch (job.save throws after pricing)
 *   - L1237-1238 PUT /:id outer catch
 *   - L1274-1275 DELETE /:id outer catch (softDelete throws)
 *   - L1328-1329 PATCH /:id/status 500 when save throws
 *   - L1379-1380 POST /:id/renew 500 when save throws
 *   - L1289-1294 PATCH /:id/status 400 for invalid status
 *   - L1354-1359 POST /:id/renew 400 for non-expired/closed job
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
import Job from '../../src/models/Job.js';

describe('jobs.js — outer catch + status validation paths', () => {
  beforeAll(async () => { await connectTestDB(); await seedLocations(); });
  afterEach(async () => {
    jest.restoreAllMocks();
    await clearTestDB();
    await seedLocations();
  });
  afterAll(async () => { await closeTestDB(); });

  it('GET / returns 500 when Job.find throws (L386-387)', async () => {
    jest.spyOn(Job, 'find').mockImplementationOnce(() => {
      throw new Error('jobs find fail');
    });
    const r = await request(app).get('/api/jobs');
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/marrjen e punëve/);
  });

  it('GET /recommendations returns 403 for non-jobseeker (L400-405)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const r = await request(app)
      .get('/api/jobs/recommendations')
      .set(createAuthHeaders(emp));
    expect(r.status).toBe(403);
    expect(r.body.message).toMatch(/kërkuesit e punës/);
  });

  it('GET /recommendations returns 500 when User.findById throws (L592-593)', async () => {
    const { user: js } = await createJobseeker();
    // We need to throw deep inside the recommendation pipeline. Spy on Job.aggregate.
    jest.spyOn(Job, 'aggregate').mockRejectedValueOnce(new Error('aggregate fail'));
    const r = await request(app)
      .get('/api/jobs/recommendations')
      .set(createAuthHeaders(js));
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/rekomandimeve/);
  });

  it('GET /employer/my-jobs returns 500 when Job.find throws (L660-661)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    jest.spyOn(Job, 'find').mockImplementationOnce(() => {
      throw new Error('my-jobs find fail');
    });
    const r = await request(app)
      .get('/api/jobs/employer/my-jobs')
      .set(createAuthHeaders(emp));
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/punëve tuaja/);
  });

  it('GET /:id returns 500 when Job.findOne throws (L702-703)', async () => {
    jest.spyOn(Job, 'findOne').mockImplementationOnce(() => {
      throw new Error('findOne fail');
    });
    const id = new mongoose.Types.ObjectId().toString();
    const r = await request(app).get(`/api/jobs/${id}`);
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/marrjen e punës/);
  });

  it('GET /:id returns 404 when job not found', async () => {
    const id = new mongoose.Types.ObjectId().toString();
    const r = await request(app).get(`/api/jobs/${id}`);
    expect(r.status).toBe(404);
    expect(r.body.message).toMatch(/Puna nuk u gjet/);
  });

  it('GET /:id/similar returns 500 when Job.findById throws (L794-795)', async () => {
    jest.spyOn(Job, 'findById').mockImplementationOnce(() => {
      throw new Error('similar fail');
    });
    const id = new mongoose.Types.ObjectId().toString();
    const r = await request(app).get(`/api/jobs/${id}/similar`);
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/punëve të ngjashme/);
  });

  it('PUT /:id returns 500 when Job.findOne throws (L1237-1238)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    jest.spyOn(Job, 'findOne').mockImplementationOnce(() => {
      throw new Error('update findOne fail');
    });
    const id = new mongoose.Types.ObjectId().toString();
    const r = await request(app)
      .put(`/api/jobs/${id}`)
      .set(createAuthHeaders(emp))
      .send({ title: 'Updated' });
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/përditësimin e punës/);
  });

  it('DELETE /:id returns 500 when softDelete throws (L1274-1275)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp);
    jest.spyOn(Job.prototype, 'softDelete').mockRejectedValueOnce(new Error('softDelete fail'));
    const r = await request(app)
      .delete(`/api/jobs/${job._id}`)
      .set(createAuthHeaders(emp));
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/fshirjen e punës/);
  });

  it('PATCH /:id/status returns 400 for invalid status (L1289-1294)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp);
    const r = await request(app)
      .patch(`/api/jobs/${job._id}/status`)
      .set(createAuthHeaders(emp))
      .send({ status: 'invalid_status' });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/active, paused, ose closed/);
  });

  it('PATCH /:id/status returns 404 for non-owned job (L1302-1307)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const id = new mongoose.Types.ObjectId().toString();
    const r = await request(app)
      .patch(`/api/jobs/${id}/status`)
      .set(createAuthHeaders(emp))
      .send({ status: 'paused' });
    expect(r.status).toBe(404);
  });

  it('PATCH /:id/status returns 500 when save throws (L1328-1329)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp);
    jest.spyOn(Job.prototype, 'save').mockRejectedValueOnce(new Error('save fail'));
    const r = await request(app)
      .patch(`/api/jobs/${job._id}/status`)
      .set(createAuthHeaders(emp))
      .send({ status: 'paused' });
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/përditësimin e statusit/);
  });

  it('POST /:id/renew returns 404 for non-owned job (L1347-1352)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const id = new mongoose.Types.ObjectId().toString();
    const r = await request(app)
      .post(`/api/jobs/${id}/renew`)
      .set(createAuthHeaders(emp));
    expect(r.status).toBe(404);
  });

  it('POST /:id/renew returns 400 for non-expired/closed job (L1354-1359)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp);
    // Job created as 'active'
    const r = await request(app)
      .post(`/api/jobs/${job._id}/renew`)
      .set(createAuthHeaders(emp));
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/skaduara ose të mbyllura/);
  });

  it('POST /:id/renew returns 500 when save throws (L1379-1380)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp);
    await Job.updateOne({ _id: job._id }, { $set: { status: 'closed' } });
    jest.spyOn(Job.prototype, 'save').mockRejectedValueOnce(new Error('save fail'));
    const r = await request(app)
      .post(`/api/jobs/${job._id}/renew`)
      .set(createAuthHeaders(emp));
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/ripostimin e punës/);
  });
});
