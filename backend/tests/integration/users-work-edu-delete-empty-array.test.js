/**
 * Phase 28 — coverage push for users.js DELETE /work-experience/:id and
 * /education/:id empty-array branches (L1549-1551, L1586-1588). Factory
 * seeds one entry each — clear them via DB update before delete to
 * exercise the empty-array path.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createJobseeker } from '../factories/user.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import User from '../../src/models/User.js';

describe('users.js — DELETE /work-experience and /education empty-array branches', () => {
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

  it('DELETE /work-experience/:id returns 404 when workHistory is empty (L1549-1551)', async () => {
    const { user } = await createJobseeker();
    // Clear workHistory
    await User.updateOne(
      { _id: user._id },
      { $set: { 'profile.jobSeekerProfile.workHistory': [] } }
    );

    const fakeId = new mongoose.Types.ObjectId();
    const r = await request(app)
      .delete(`/api/users/work-experience/${fakeId}`)
      .set(createAuthHeaders(user));
    expect(r.status).toBe(404);
    expect(r.body.message).toMatch(/Përvojë/i);
  });

  it('DELETE /education/:id returns 404 when education is empty (L1586-1588)', async () => {
    const { user } = await createJobseeker();
    // Clear education
    await User.updateOne(
      { _id: user._id },
      { $set: { 'profile.jobSeekerProfile.education': [] } }
    );

    const fakeId = new mongoose.Types.ObjectId();
    const r = await request(app)
      .delete(`/api/users/education/${fakeId}`)
      .set(createAuthHeaders(user));
    expect(r.status).toBe(404);
    expect(r.body.message).toMatch(/Arsimimi/i);
  });

  it('DELETE /work-experience/:id with valid array but unmatched id returns 404 (L1554-1556)', async () => {
    const { user } = await createJobseeker();
    // Factory creates one entry; pass a different id
    const fakeId = new mongoose.Types.ObjectId();
    const r = await request(app)
      .delete(`/api/users/work-experience/${fakeId}`)
      .set(createAuthHeaders(user));
    expect(r.status).toBe(404);
  });

  it('DELETE /education/:id with valid array but unmatched id returns 404 (L1591-1593)', async () => {
    const { user } = await createJobseeker();
    const fakeId = new mongoose.Types.ObjectId();
    const r = await request(app)
      .delete(`/api/users/education/${fakeId}`)
      .set(createAuthHeaders(user));
    expect(r.status).toBe(404);
  });
});
