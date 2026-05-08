/**
 * Phase 28 — coverage push for users.js work-experience + education
 * route catch blocks.
 *
 * Targets:
 *   - L1360-1361 POST /work-experience catch (save throws)
 *   - L1428-1429 POST /education catch (save throws)
 *   - L1480-1481 PUT /work-experience/:id catch (save throws)
 *   - L1533-1534 PUT /education/:id catch (save throws)
 *   - L1570-1571 DELETE /work-experience/:id catch (save throws)
 *   - L1607-1608 DELETE /education/:id catch (save throws)
 *   - L1340-1342 first work entry initialization (workHistory undefined)
 *   - L1408-1410 first education entry initialization (education undefined)
 *   - L1447-1449 PUT /work-experience/:id 404 when no work history
 *   - L1496-1498 PUT /education/:id 404 when no education array
 *   - L1549-1551 DELETE /work-experience/:id 404 when no work history
 *   - L1586-1588 DELETE /education/:id 404 when no education array
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, jest } from '@jest/globals';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createJobseeker } from '../factories/user.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import User from '../../src/models/User.js';

describe('users.js — work-experience + education error/404 paths', () => {
  beforeAll(async () => { await connectTestDB(); await seedLocations(); });
  afterEach(async () => {
    jest.restoreAllMocks();
    await clearTestDB();
    await seedLocations();
  });
  afterAll(async () => { await closeTestDB(); });

  it('POST /work-experience initializes empty workHistory then adds (L1340-1342)', async () => {
    const { user } = await createJobseeker();
    // Verify the user has no workHistory by default (or empty)
    const r = await request(app)
      .post('/api/users/work-experience')
      .set(createAuthHeaders(user))
      .send({ position: 'Eng', company: 'Co', startDate: '2020-01-01' });
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.data.experience.position).toBe('Eng');
  });

  it('POST /work-experience returns 500 when save throws (L1360-1361)', async () => {
    const { user } = await createJobseeker();
    jest.spyOn(User.prototype, 'save').mockRejectedValueOnce(new Error('save fail'));
    const r = await request(app)
      .post('/api/users/work-experience')
      .set(createAuthHeaders(user))
      .send({ position: 'Eng', company: 'Co', startDate: '2020-01-01' });
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/shtimin e përvojës/);
  });

  it('POST /education initializes empty education then adds', async () => {
    const { user } = await createJobseeker();
    const r = await request(app)
      .post('/api/users/education')
      .set(createAuthHeaders(user))
      .send({ degree: 'BSc', institution: 'UoT', startDate: '2018-09-01' });
    expect(r.status).toBe(200);
    expect(r.body.data.education.degree).toBe('BSc');
  });

  it('POST /education returns 500 when save throws (L1428-1429)', async () => {
    const { user } = await createJobseeker();
    jest.spyOn(User.prototype, 'save').mockRejectedValueOnce(new Error('save fail'));
    const r = await request(app)
      .post('/api/users/education')
      .set(createAuthHeaders(user))
      .send({ degree: 'BSc', institution: 'UoT' });
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/shtimin e arsimimit/);
  });

  it('PUT /work-experience/:id returns 404 when workHistory empty (L1447-1449)', async () => {
    const { user } = await createJobseeker();
    const id = new mongoose.Types.ObjectId().toString();
    const r = await request(app)
      .put(`/api/users/work-experience/${id}`)
      .set(createAuthHeaders(user))
      .send({ position: 'Updated' });
    expect(r.status).toBe(404);
    expect(r.body.message).toMatch(/Përvojë e punës nuk u gjet/);
  });

  it('PUT /work-experience/:id returns 404 when entry not in workHistory (L1452-1454)', async () => {
    const { user } = await createJobseeker();
    // Add one entry to populate workHistory, but request a different id
    await request(app)
      .post('/api/users/work-experience')
      .set(createAuthHeaders(user))
      .send({ position: 'P', company: 'C', startDate: '2020-01-01' });
    const otherId = new mongoose.Types.ObjectId().toString();
    const r = await request(app)
      .put(`/api/users/work-experience/${otherId}`)
      .set(createAuthHeaders(user))
      .send({ position: 'Updated' });
    expect(r.status).toBe(404);
  });

  it('PUT /work-experience/:id returns 500 when save throws (L1480-1481)', async () => {
    const { user } = await createJobseeker();
    await request(app)
      .post('/api/users/work-experience')
      .set(createAuthHeaders(user))
      .send({ position: 'P', company: 'C', startDate: '2020-01-01' });
    const refreshed = await User.findById(user._id);
    const entryId = refreshed.profile.jobSeekerProfile.workHistory[0]._id.toString();

    jest.spyOn(User.prototype, 'save').mockRejectedValueOnce(new Error('save fail'));
    const r = await request(app)
      .put(`/api/users/work-experience/${entryId}`)
      .set(createAuthHeaders(user))
      .send({ position: 'Updated' });
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/përditësimin e përvojës/);
  });

  it('PUT /education/:id returns 404 when education empty (L1496-1498)', async () => {
    const { user } = await createJobseeker();
    const id = new mongoose.Types.ObjectId().toString();
    const r = await request(app)
      .put(`/api/users/education/${id}`)
      .set(createAuthHeaders(user))
      .send({ degree: 'MSc' });
    expect(r.status).toBe(404);
    expect(r.body.message).toMatch(/Arsimimi nuk u gjet/);
  });

  it('PUT /education/:id returns 500 when save throws (L1533-1534)', async () => {
    const { user } = await createJobseeker();
    await request(app)
      .post('/api/users/education')
      .set(createAuthHeaders(user))
      .send({ degree: 'BSc', institution: 'UoT' });
    const refreshed = await User.findById(user._id);
    const entryId = refreshed.profile.jobSeekerProfile.education[0]._id.toString();

    jest.spyOn(User.prototype, 'save').mockRejectedValueOnce(new Error('save fail'));
    const r = await request(app)
      .put(`/api/users/education/${entryId}`)
      .set(createAuthHeaders(user))
      .send({ degree: 'MSc' });
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/përditësimin e arsimimit/);
  });

  it('DELETE /work-experience/:id returns 404 when workHistory empty (L1549-1551)', async () => {
    const { user } = await createJobseeker();
    const id = new mongoose.Types.ObjectId().toString();
    const r = await request(app)
      .delete(`/api/users/work-experience/${id}`)
      .set(createAuthHeaders(user));
    expect(r.status).toBe(404);
  });

  it('DELETE /work-experience/:id returns 500 when save throws (L1570-1571)', async () => {
    const { user } = await createJobseeker();
    await request(app)
      .post('/api/users/work-experience')
      .set(createAuthHeaders(user))
      .send({ position: 'P', company: 'C', startDate: '2020-01-01' });
    const refreshed = await User.findById(user._id);
    const entryId = refreshed.profile.jobSeekerProfile.workHistory[0]._id.toString();

    jest.spyOn(User.prototype, 'save').mockRejectedValueOnce(new Error('save fail'));
    const r = await request(app)
      .delete(`/api/users/work-experience/${entryId}`)
      .set(createAuthHeaders(user));
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/fshirjen e përvojës/);
  });

  it('DELETE /education/:id returns 404 when education empty (L1586-1588)', async () => {
    const { user } = await createJobseeker();
    const id = new mongoose.Types.ObjectId().toString();
    const r = await request(app)
      .delete(`/api/users/education/${id}`)
      .set(createAuthHeaders(user));
    expect(r.status).toBe(404);
  });

  it('DELETE /education/:id returns 500 when save throws (L1607-1608)', async () => {
    const { user } = await createJobseeker();
    await request(app)
      .post('/api/users/education')
      .set(createAuthHeaders(user))
      .send({ degree: 'BSc', institution: 'UoT' });
    const refreshed = await User.findById(user._id);
    const entryId = refreshed.profile.jobSeekerProfile.education[0]._id.toString();

    jest.spyOn(User.prototype, 'save').mockRejectedValueOnce(new Error('save fail'));
    const r = await request(app)
      .delete(`/api/users/education/${entryId}`)
      .set(createAuthHeaders(user));
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/fshirjen e arsimimit/);
  });

  it('POST /work-experience returns 400 for missing position (L1310-1315)', async () => {
    const { user } = await createJobseeker();
    const r = await request(app)
      .post('/api/users/work-experience')
      .set(createAuthHeaders(user))
      .send({ company: 'NoPosition' });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/nuk janë të vlefshme/);
  });

  it('POST /education returns 400 for missing degree (L1378-1382)', async () => {
    const { user } = await createJobseeker();
    const r = await request(app)
      .post('/api/users/education')
      .set(createAuthHeaders(user))
      .send({ institution: 'NoDegree' });
    expect(r.status).toBe(400);
  });
});
