/**
 * Phase 28 — coverage push for routes/admin.js outer 500 catch blocks.
 *
 * Targets:
 *   - L176-177 GET /dashboard-stats catch
 *   - L310-311 GET /analytics catch
 *   - L425-426 GET /system-health catch (countDocuments throws)
 *   - L500-501 GET /users catch
 *   - L568-569 GET /jobs catch
 *   - L693-694 PATCH /users/:userId/manage catch
 *   - L775-776 PATCH /jobs/:jobId/manage catch
 *   - L931-932 GET /user-insights catch
 *   - L1009-1010 PATCH /jobs/:id/approve catch
 *   - L1050-1051 GET /jobs/pending catch
 *   - L1099-1100 POST /backfill-user-embeddings catch
 *   - L1135-1136 POST /backfill-job-embeddings catch
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, jest } from '@jest/globals';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createAdmin } from '../factories/user.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import User from '../../src/models/User.js';
import Job from '../../src/models/Job.js';

describe('admin.js — outer catch paths', () => {
  beforeAll(async () => { await connectTestDB(); await seedLocations(); });
  afterEach(async () => {
    jest.restoreAllMocks();
    await clearTestDB();
    await seedLocations();
  });
  afterAll(async () => { await closeTestDB(); });

  it('GET /dashboard-stats returns 500 when User.countDocuments throws (L176-177)', async () => {
    const { user: admin } = await createAdmin();
    jest.spyOn(User, 'countDocuments').mockRejectedValueOnce(new Error('count fail'));
    const r = await request(app).get('/api/admin/dashboard-stats').set(createAuthHeaders(admin));
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/dashboard-it/);
  });

  it('GET /analytics returns 500 when User.countDocuments throws (L310-311)', async () => {
    const { user: admin } = await createAdmin();
    jest.spyOn(User, 'countDocuments').mockRejectedValueOnce(new Error('count fail'));
    const r = await request(app).get('/api/admin/analytics').set(createAuthHeaders(admin));
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/analizave/);
  });

  it('GET /system-health returns 500 when countDocuments throws after probe (L425-426)', async () => {
    const { user: admin } = await createAdmin();
    jest.spyOn(User, 'countDocuments').mockRejectedValueOnce(new Error('count fail'));
    const r = await request(app).get('/api/admin/system-health').set(createAuthHeaders(admin));
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/shëndetit të sistemit/);
  });

  it('GET /users returns 500 when User.countDocuments throws (L500-501)', async () => {
    const { user: admin } = await createAdmin();
    jest.spyOn(User, 'countDocuments').mockRejectedValueOnce(new Error('count fail'));
    const r = await request(app).get('/api/admin/users').set(createAuthHeaders(admin));
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/marrjen e përdoruesve/);
  });

  it('GET /jobs returns 500 when Job.countDocuments throws (L568-569)', async () => {
    const { user: admin } = await createAdmin();
    jest.spyOn(Job, 'countDocuments').mockRejectedValueOnce(new Error('count fail'));
    const r = await request(app).get('/api/admin/jobs').set(createAuthHeaders(admin));
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/marrjen e punëve/);
  });

  it('PATCH /users/:userId/manage 400 for invalid ObjectId', async () => {
    const { user: admin } = await createAdmin();
    const r = await request(app)
      .patch('/api/admin/users/not-an-objectid/manage')
      .set(createAuthHeaders(admin))
      .send({ action: 'suspend' });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/ID i pavlefshëm/);
  });

  it('PATCH /users/:userId/manage 500 when User.findById throws (L693-694)', async () => {
    const { user: admin } = await createAdmin();
    const realFindById = User.findById.bind(User);
    let calls = 0;
    jest.spyOn(User, 'findById').mockImplementation(function (...args) {
      calls++;
      if (calls === 1) return realFindById(...args); // auth middleware
      throw new Error('manage findById fail');
    });
    const id = new mongoose.Types.ObjectId().toString();
    const r = await request(app)
      .patch(`/api/admin/users/${id}/manage`)
      .set(createAuthHeaders(admin))
      .send({ action: 'suspend', reason: 'spam' });
    expect(r.status).toBe(500);
  });

  it('PATCH /jobs/:jobId/manage 500 when Job.findById throws (L775-776)', async () => {
    const { user: admin } = await createAdmin();
    jest.spyOn(Job, 'findById').mockImplementationOnce(() => {
      throw new Error('manage job findById fail');
    });
    const id = new mongoose.Types.ObjectId().toString();
    const r = await request(app)
      .patch(`/api/admin/jobs/${id}/manage`)
      .set(createAuthHeaders(admin))
      .send({ action: 'delete' });
    expect(r.status).toBe(500);
  });

  it('GET /user-insights 500 when User.aggregate throws (L931-932)', async () => {
    const { user: admin } = await createAdmin();
    jest.spyOn(User, 'aggregate').mockRejectedValueOnce(new Error('aggregate fail'));
    const r = await request(app).get('/api/admin/user-insights').set(createAuthHeaders(admin));
    expect(r.status).toBe(500);
  });

  it('PATCH /jobs/:id/approve 500 when Job.findById throws (L1009-1010)', async () => {
    const { user: admin } = await createAdmin();
    jest.spyOn(Job, 'findById').mockImplementationOnce(() => {
      throw new Error('approve findById fail');
    });
    const id = new mongoose.Types.ObjectId().toString();
    const r = await request(app)
      .patch(`/api/admin/jobs/${id}/approve`)
      .set(createAuthHeaders(admin))
      .send({ action: 'approve' });
    expect(r.status).toBe(500);
  });

  it('GET /jobs/pending 500 when Job.find throws (L1050-1051)', async () => {
    const { user: admin } = await createAdmin();
    jest.spyOn(Job, 'find').mockImplementationOnce(() => {
      throw new Error('pending find fail');
    });
    const r = await request(app).get('/api/admin/jobs/pending').set(createAuthHeaders(admin));
    expect(r.status).toBe(500);
  });

  it('POST /backfill-user-embeddings 500 when User.find throws (L1099-1100)', async () => {
    const { user: admin } = await createAdmin();
    const realFind = User.find.bind(User);
    jest.spyOn(User, 'find').mockImplementationOnce(function (...args) {
      // Only fail the userType:jobseeker query (the backfill query)
      if (args[0]?.userType === 'jobseeker') throw new Error('backfill find fail');
      return realFind(...args);
    });
    const r = await request(app)
      .post('/api/admin/backfill-user-embeddings')
      .set(createAuthHeaders(admin));
    expect(r.status).toBe(500);
  });

  it('POST /backfill-job-embeddings 500 when Job.find throws (L1135-1136)', async () => {
    const { user: admin } = await createAdmin();
    jest.spyOn(Job, 'find').mockImplementationOnce(() => {
      throw new Error('backfill jobs find fail');
    });
    const r = await request(app)
      .post('/api/admin/backfill-job-embeddings')
      .set(createAuthHeaders(admin));
    expect(r.status).toBe(500);
  });
});
