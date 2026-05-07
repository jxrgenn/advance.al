/**
 * Phase 28 — coverage push for users.js /education routes that no test
 * currently exercises:
 *   - POST /education with isCurrentStudy=true → endDate becomes null (L1400-1401)
 *   - PUT /education/:id with isCurrentStudy=true → endDate cleared (L1511-1512)
 *   - PUT /education/:id year computed from endDate (L1519)
 *   - PUT /education/:id year computed from startDate when no endDate (L1520)
 *   - DELETE /education/:id 404 when no education entries
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

describe('users.js — /education isCurrentStudy + year branches', () => {
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

  it('POST /education with isCurrentStudy=true sets endDate to null (L1400-1401)', async () => {
    const { user } = await createJobseeker({ email: 'cur-study@example.com' });
    const r = await request(app)
      .post('/api/users/education')
      .set(createAuthHeaders(user))
      .send({
        degree: 'PhD',
        institution: 'Univ. of Tirana',
        startDate: '2024-09-01',
        isCurrentStudy: true,
        endDate: '2027-06-01', // should be ignored
      });
    expect(r.status).toBe(200);
    const dbUser = await User.findById(user._id);
    const entry = dbUser.profile.jobSeekerProfile.education.find(e => e.degree === 'PhD');
    expect(entry).toBeDefined();
    expect(entry.endDate).toBeFalsy();
  });

  it('PUT /education/:id with isCurrentStudy=true clears endDate (L1511-1512)', async () => {
    const { user } = await createJobseeker({ email: 'edit-cur-study@example.com' });
    // Seed an education entry with endDate
    user.profile.jobSeekerProfile.education = [{
      _id: new mongoose.Types.ObjectId(),
      degree: 'BSc',
      institution: 'A',
      startDate: '2018-09-01',
      endDate: '2022-06-01',
      isCurrentStudy: false,
    }];
    await user.save({ validateBeforeSave: false });
    const id = user.profile.jobSeekerProfile.education[0]._id.toString();

    const r = await request(app)
      .put(`/api/users/education/${id}`)
      .set(createAuthHeaders(user))
      .send({ isCurrentStudy: true });
    expect(r.status).toBe(200);

    const dbUser = await User.findById(user._id);
    const entry = dbUser.profile.jobSeekerProfile.education[0];
    expect(entry.endDate).toBeFalsy();
  });

  it('PUT /education/:id sets year from endDate (L1519)', async () => {
    const { user } = await createJobseeker({ email: 'edit-year-end@example.com' });
    user.profile.jobSeekerProfile.education = [{
      _id: new mongoose.Types.ObjectId(),
      degree: 'BSc', institution: 'A', startDate: '2018-09-01',
    }];
    await user.save({ validateBeforeSave: false });
    const id = user.profile.jobSeekerProfile.education[0]._id.toString();

    const r = await request(app)
      .put(`/api/users/education/${id}`)
      .set(createAuthHeaders(user))
      .send({ endDate: '2023-06-15' });
    expect(r.status).toBe(200);

    const dbUser = await User.findById(user._id);
    expect(dbUser.profile.jobSeekerProfile.education[0].year).toBe(2023);
  });

  it('PUT /education/:id sets year from startDate when no endDate (L1520)', async () => {
    const { user } = await createJobseeker({ email: 'edit-year-start@example.com' });
    user.profile.jobSeekerProfile.education = [{
      _id: new mongoose.Types.ObjectId(),
      degree: 'BSc', institution: 'A',
    }];
    await user.save({ validateBeforeSave: false });
    const id = user.profile.jobSeekerProfile.education[0]._id.toString();

    const r = await request(app)
      .put(`/api/users/education/${id}`)
      .set(createAuthHeaders(user))
      .send({ startDate: '2019-09-01' });
    expect(r.status).toBe(200);

    const dbUser = await User.findById(user._id);
    expect(dbUser.profile.jobSeekerProfile.education[0].year).toBe(2019);
  });

  it('DELETE /education/:id 404 when no education entries exist', async () => {
    const { user } = await createJobseeker({ email: 'del-edu-empty@example.com' });
    const fakeId = new mongoose.Types.ObjectId().toString();
    const r = await request(app)
      .delete(`/api/users/education/${fakeId}`)
      .set(createAuthHeaders(user));
    expect(r.status).toBe(404);
  });
});
