/**
 * Phase 28 — coverage push for routes/users.js GET/PUT /profile error paths.
 *
 * Targets:
 *   - L281-285 GET /profile 404 when user not found in DB (token user deleted)
 *   - L294-295 GET /profile catch (User.findById throws)
 *   - L309-313 PUT /profile 404 (user deleted)
 *   - L322-323 PUT /profile admin path (validation = [])
 *   - L417-428 PUT /profile ValidationError → 400 branch
 *   - L428+ PUT /profile generic 500 catch
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, jest } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createJobseeker, createAdmin } from '../factories/user.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import User from '../../src/models/User.js';

describe('users.js — GET/PUT /profile error paths', () => {
  beforeAll(async () => { await connectTestDB(); await seedLocations(); });
  afterEach(async () => {
    jest.restoreAllMocks();
    await clearTestDB();
    await seedLocations();
  });
  afterAll(async () => { await closeTestDB(); });

  it('GET /profile returns 500 when User.findById throws (L294-295)', async () => {
    const { user: js } = await createJobseeker();
    const realFindById = User.findById.bind(User);
    let firstCall = true;
    jest.spyOn(User, 'findById').mockImplementation(function (...args) {
      // First call is auth middleware, second call is the route's findById
      if (firstCall) {
        firstCall = false;
        return realFindById(...args);
      }
      throw new Error('findById exploded');
    });
    const r = await request(app)
      .get('/api/users/profile')
      .set(createAuthHeaders(js));
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/marrjen e profilit/);
  });

  it('PUT /profile returns 400 with field errors when Mongoose ValidationError fires (L417-428)', async () => {
    const { user: js } = await createJobseeker();
    // Force user.save() to throw a ValidationError
    const validationError = Object.assign(new Error('Validation failed'), {
      name: 'ValidationError',
      errors: {
        'profile.jobSeekerProfile.bio': { message: 'Bio is too long' },
        'profile.jobSeekerProfile.skills': { message: 'Too many skills' },
      },
    });
    jest.spyOn(User.prototype, 'save').mockRejectedValueOnce(validationError);

    const r = await request(app)
      .put('/api/users/profile')
      .set(createAuthHeaders(js))
      .send({ jobSeekerProfile: { title: 'New Title' } });

    expect(r.status).toBe(400);
    expect(r.body.success).toBe(false);
    expect(r.body.message).toMatch(/Të dhënat e profilit/);
    expect(r.body.errors).toEqual(expect.arrayContaining(['Bio is too long', 'Too many skills']));
  });

  it('PUT /profile returns 500 when user.save throws non-validation error (L428+)', async () => {
    const { user: js } = await createJobseeker();
    jest.spyOn(User.prototype, 'save').mockRejectedValueOnce(new Error('mongo write failed'));
    const r = await request(app)
      .put('/api/users/profile')
      .set(createAuthHeaders(js))
      .send({ jobSeekerProfile: { title: 'New Title' } });
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/profilit/);
  });

  it('PUT /profile admin path skips validation (L322-323)', async () => {
    const { user: admin } = await createAdmin();
    // Admin validation array is empty, so any input should pass through.
    // Must use a known admin field — admins may not have employerProfile.
    const r = await request(app)
      .put('/api/users/profile')
      .set(createAuthHeaders(admin))
      .send({ firstName: 'AdminUpdated' });
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.data.user.profile.firstName).toBe('AdminUpdated');
  });
});
