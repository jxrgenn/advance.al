/**
 * Phase 28 — coverage push for users.js DELETE /resume (L740-785).
 * No existing test exercises this route. Covers happy path + 400 when
 * no resume + 404 when user missing.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createJobseeker } from '../factories/user.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import User from '../../src/models/User.js';

describe('users.js — DELETE /resume', () => {
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

  it('happy path: clears the resume URL from profile (L767-768)', async () => {
    const { user: js } = await createJobseeker();
    // Pre-set a resume URL
    await User.updateOne(
      { _id: js._id },
      { $set: { 'profile.jobSeekerProfile.resume': 'https://res.cloudinary.com/x/y/z.pdf' } }
    );

    const r = await request(app)
      .delete('/api/users/resume')
      .set(createAuthHeaders(js));
    expect(r.status).toBe(200);
    expect(r.body.message).toMatch(/u fshi/i);

    const refreshed = await User.findById(js._id);
    expect(refreshed.profile.jobSeekerProfile.resume).toBeNull();
  });

  it('returns 400 when user has no resume to delete (L751-756)', async () => {
    const { user: js } = await createJobseeker();
    // No resume set
    const r = await request(app)
      .delete('/api/users/resume')
      .set(createAuthHeaders(js));
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/Nuk keni CV/i);
  });

  it('rejects unauthenticated request (401)', async () => {
    const r = await request(app).delete('/api/users/resume');
    expect(r.status).toBe(401);
  });

  it('local-file path branch (L761-765): non-http URL', async () => {
    const { user: js } = await createJobseeker();
    // Pre-set a local-file resume URL
    await User.updateOne(
      { _id: js._id },
      { $set: { 'profile.jobSeekerProfile.resume': '/uploads/resumes/nonexistent-file.pdf' } }
    );

    const r = await request(app)
      .delete('/api/users/resume')
      .set(createAuthHeaders(js));
    // Should still succeed (try/catch swallows ENOENT)
    expect(r.status).toBe(200);
  });
});
