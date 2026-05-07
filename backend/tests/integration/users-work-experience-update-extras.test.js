/**
 * Phase 28 — coverage push for users.js PUT /work-experience/:id branches.
 *
 * Existing test sets isCurrentJob=true. Adds:
 *   - isCurrentJob=false + endDate provided → endDate stored (L1463-1464)
 *   - Partial update: only position changed → other fields untouched
 *   - achievements / description undefined skips assignment (L1466-1467)
 *   - DELETE 404 when work history empty
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

describe('users.js — PUT /work-experience/:id update extras', () => {
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

  async function seedWE(email, extras = {}) {
    const { user } = await createJobseeker({ email });
    await request(app)
      .post('/api/users/work-experience')
      .set(createAuthHeaders(user))
      .send({
        position: 'Original',
        company: 'OrigCo',
        location: 'Tiranë',
        startDate: '2020-01-01',
        endDate: '2022-01-01',
        isCurrentJob: false,
        description: 'Old desc',
        achievements: 'Old ach',
        ...extras,
      });
    const refreshed = await User.findById(user._id);
    const seeded = refreshed.profile.jobSeekerProfile.workHistory.find(e => e.position === 'Original');
    return { user, id: seeded._id };
  }

  it('PUT with endDate (isCurrentJob=false) stores the new endDate (L1463-1464)', async () => {
    const { user, id } = await seedWE('end-date-update@example.com');
    const r = await request(app)
      .put(`/api/users/work-experience/${id}`)
      .set(createAuthHeaders(user))
      .send({ isCurrentJob: false, endDate: '2024-06-30' });
    expect(r.status).toBe(200);

    const after = await User.findById(user._id);
    const entry = after.profile.jobSeekerProfile.workHistory.id(id);
    // Verify the new endDate landed (could be Date or string depending on schema)
    const yr = entry.endDate instanceof Date
      ? entry.endDate.getUTCFullYear()
      : new Date(entry.endDate).getUTCFullYear();
    expect(yr).toBe(2024);
  });

  it('partial update: only position changes; other fields preserved', async () => {
    const { user, id } = await seedWE('partial-update@example.com');
    const r = await request(app)
      .put(`/api/users/work-experience/${id}`)
      .set(createAuthHeaders(user))
      .send({ position: 'PromotedTitle' });
    expect(r.status).toBe(200);

    const after = await User.findById(user._id);
    const entry = after.profile.jobSeekerProfile.workHistory.id(id);
    expect(entry.position).toBe('PromotedTitle');
    expect(entry.company).toBe('OrigCo');
    expect(entry.description).toBe('Old desc');
  });

  it('PUT with empty description string clears it via stripHtml fallback (L1466)', async () => {
    const { user, id } = await seedWE('empty-desc@example.com');
    const r = await request(app)
      .put(`/api/users/work-experience/${id}`)
      .set(createAuthHeaders(user))
      .send({ description: '' });
    expect(r.status).toBe(200);

    const after = await User.findById(user._id);
    const entry = after.profile.jobSeekerProfile.workHistory.id(id);
    expect(entry.description).toBe('');
  });

  it('DELETE 404 when work history empty', async () => {
    const { user } = await createJobseeker({ email: 'del-we-empty@example.com' });
    await User.updateOne({ _id: user._id }, {
      $set: { 'profile.jobSeekerProfile.workHistory': [] },
    });
    const fakeId = new mongoose.Types.ObjectId().toString();
    const r = await request(app)
      .delete(`/api/users/work-experience/${fakeId}`)
      .set(createAuthHeaders(user));
    expect(r.status).toBe(404);
  });

  it('description with HTML tags is stripped by stripHtml (L1466)', async () => {
    const { user, id } = await seedWE('html-strip@example.com');
    const r = await request(app)
      .put(`/api/users/work-experience/${id}`)
      .set(createAuthHeaders(user))
      .send({ description: '<script>alert(1)</script>safe text' });
    expect(r.status).toBe(200);

    const after = await User.findById(user._id);
    const entry = after.profile.jobSeekerProfile.workHistory.id(id);
    expect(entry.description).not.toMatch(/<script/i);
    expect(entry.description).toContain('safe text');
  });
});
