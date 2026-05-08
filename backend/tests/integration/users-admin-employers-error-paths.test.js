/**
 * Phase 28 — coverage push for routes/users.js admin employer routes.
 *
 * Targets:
 *   - L1220-1226 GET /admin/pending-employers catch
 *   - L1236-1241 PATCH /admin/verify-employer/:id action validation 400
 *   - L1249-1254 PATCH /admin/verify-employer/:id employer not found 404
 *   - L1256-1265 PATCH approve vs reject branches (success path)
 *   - L1292-1298 PATCH /admin/verify-employer/:id catch
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, jest } from '@jest/globals';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createAdmin, createUnverifiedEmployer, createVerifiedEmployer } from '../factories/user.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import User from '../../src/models/User.js';

describe('users.js — admin/pending-employers + verify-employer', () => {
  beforeAll(async () => { await connectTestDB(); await seedLocations(); });
  afterEach(async () => {
    jest.restoreAllMocks();
    await clearTestDB();
    await seedLocations();
  });
  afterAll(async () => { await closeTestDB(); });

  it('GET /admin/pending-employers returns 500 when User.find throws (L1220-1226)', async () => {
    const { user: admin } = await createAdmin();
    const realFind = User.find.bind(User);
    jest.spyOn(User, 'find').mockImplementationOnce(function (...args) {
      if (args[0]?.userType === 'employer' && args[0]?.status === 'pending_verification') {
        throw new Error('find blew up');
      }
      return realFind(...args);
    });
    const r = await request(app)
      .get('/api/users/admin/pending-employers')
      .set(createAuthHeaders(admin));
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/punëdhënësve në pritje/);
  });

  it('GET /admin/pending-employers returns paginated empty list when no pending', async () => {
    const { user: admin } = await createAdmin();
    const r = await request(app)
      .get('/api/users/admin/pending-employers?page=1&limit=5')
      .set(createAuthHeaders(admin));
    expect(r.status).toBe(200);
    expect(r.body.data.employers).toEqual([]);
    expect(r.body.data.pagination.totalItems).toBe(0);
  });

  it('GET /admin/pending-employers returns pending employer when one exists', async () => {
    const { user: admin } = await createAdmin();
    await createUnverifiedEmployer();
    const r = await request(app)
      .get('/api/users/admin/pending-employers')
      .set(createAuthHeaders(admin));
    expect(r.status).toBe(200);
    expect(r.body.data.employers.length).toBe(1);
    expect(r.body.data.pagination.totalItems).toBe(1);
  });

  it('PATCH /admin/verify-employer/:id rejects invalid action (L1236-1241)', async () => {
    const { user: admin } = await createAdmin();
    const id = new mongoose.Types.ObjectId().toString();
    const r = await request(app)
      .patch(`/api/users/admin/verify-employer/${id}`)
      .set(createAuthHeaders(admin))
      .send({ action: 'maybe' });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/approve ose reject/);
  });

  it('PATCH /admin/verify-employer/:id returns 404 when no pending employer matches (L1249-1254)', async () => {
    const { user: admin } = await createAdmin();
    const id = new mongoose.Types.ObjectId().toString();
    const r = await request(app)
      .patch(`/api/users/admin/verify-employer/${id}`)
      .set(createAuthHeaders(admin))
      .send({ action: 'approve' });
    expect(r.status).toBe(404);
    expect(r.body.message).toMatch(/Punëdhënësi nuk u gjet/);
  });

  it('PATCH /admin/verify-employer/:id approves pending employer (L1256-1260)', async () => {
    const { user: admin } = await createAdmin();
    const { user: emp } = await createUnverifiedEmployer();
    const r = await request(app)
      .patch(`/api/users/admin/verify-employer/${emp._id}`)
      .set(createAuthHeaders(admin))
      .send({ action: 'approve' });
    expect(r.status).toBe(200);
    expect(r.body.data.employer.status).toBe('active');
    expect(r.body.data.employer.profile.employerProfile.verified).toBe(true);
    expect(r.body.data.employer.profile.employerProfile.verificationStatus).toBe('approved');
  });

  it('PATCH /admin/verify-employer/:id rejects pending employer (L1261-1265)', async () => {
    const { user: admin } = await createAdmin();
    const { user: emp } = await createUnverifiedEmployer();
    const r = await request(app)
      .patch(`/api/users/admin/verify-employer/${emp._id}`)
      .set(createAuthHeaders(admin))
      .send({ action: 'reject' });
    expect(r.status).toBe(200);
    expect(r.body.data.employer.profile.employerProfile.verified).toBe(false);
    expect(r.body.data.employer.profile.employerProfile.verificationStatus).toBe('rejected');
    // Status stays 'pending_verification' (not 'rejected' since enum doesn't allow it)
    expect(r.body.data.employer.status).toBe('pending_verification');
  });

  it('PATCH /admin/verify-employer/:id returns 500 when save throws (L1292-1298)', async () => {
    const { user: admin } = await createAdmin();
    const { user: emp } = await createUnverifiedEmployer();
    jest.spyOn(User.prototype, 'save').mockRejectedValueOnce(new Error('save failed'));
    const r = await request(app)
      .patch(`/api/users/admin/verify-employer/${emp._id}`)
      .set(createAuthHeaders(admin))
      .send({ action: 'approve' });
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/verifikimin e punëdhënësit/);
  });
});
