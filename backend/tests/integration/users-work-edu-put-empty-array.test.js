/**
 * Phase 28 — coverage push for PUT /work-experience/:id and /education/:id
 * empty-array branches (L1447-1449, L1496-1498). Existing tests cover the
 * happy path + valid-array unmatched-id; this fills the empty-array case.
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

describe('users.js — PUT /work-experience and /education empty-array branches', () => {
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

  it('PUT /work-experience/:id returns 404 when workHistory empty (L1447-1449)', async () => {
    const { user } = await createJobseeker();
    await User.updateOne(
      { _id: user._id },
      { $set: { 'profile.jobSeekerProfile.workHistory': [] } }
    );

    const fakeId = new mongoose.Types.ObjectId();
    const r = await request(app)
      .put(`/api/users/work-experience/${fakeId}`)
      .set(createAuthHeaders(user))
      .send({ position: 'Updated' });
    expect(r.status).toBe(404);
    expect(r.body.message).toMatch(/Përvojë/i);
  });

  it('PUT /education/:id returns 404 when education empty (L1496-1498)', async () => {
    const { user } = await createJobseeker();
    await User.updateOne(
      { _id: user._id },
      { $set: { 'profile.jobSeekerProfile.education': [] } }
    );

    const fakeId = new mongoose.Types.ObjectId();
    const r = await request(app)
      .put(`/api/users/education/${fakeId}`)
      .set(createAuthHeaders(user))
      .send({ degree: 'PhD' });
    expect(r.status).toBe(404);
    expect(r.body.message).toMatch(/Arsimimi/i);
  });

  it('PUT /work-experience/:id returns 404 when id is unmatched (L1452-1454)', async () => {
    const { user } = await createJobseeker();
    // Factory has one entry; pass random id
    const fakeId = new mongoose.Types.ObjectId();
    const r = await request(app)
      .put(`/api/users/work-experience/${fakeId}`)
      .set(createAuthHeaders(user))
      .send({ position: 'New' });
    expect(r.status).toBe(404);
  });

  it('PUT /education/:id returns 404 when id is unmatched (L1501-1503)', async () => {
    const { user } = await createJobseeker();
    const fakeId = new mongoose.Types.ObjectId();
    const r = await request(app)
      .put(`/api/users/education/${fakeId}`)
      .set(createAuthHeaders(user))
      .send({ degree: 'PhD' });
    expect(r.status).toBe(404);
  });
});
