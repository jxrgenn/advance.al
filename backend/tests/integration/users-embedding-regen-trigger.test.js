/**
 * Verifies that the HTTP routes fire embedding regen via setImmediate when
 * semantically relevant profile fields change. Tests the route-level wiring,
 * not the service internals (those are covered in user-embedding-generate-paths).
 *
 * Stubs jobEmbeddingService.callOpenAIWithRetry so no real OpenAI call.
 * Flushes setImmediate by yielding the Node.js event loop before asserting.
 *
 * Targets (users.js):
 *   PUT /profile    — title/skills/bio/experience/location.city → regen
 *   PUT /profile    — non-semantic fields (availability, openToRemote) → no regen
 *   POST /work-experience  → regen
 *   PUT  /work-experience/:id → regen
 *   DELETE /work-experience/:id → regen
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, jest } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createJobseeker } from '../factories/user.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import User from '../../src/models/User.js';
import userEmbeddingService from '../../src/services/userEmbeddingService.js';
import jobEmbeddingService from '../../src/services/jobEmbeddingService.js';

// Flush enough of the event loop for setImmediate + one Promise microtask inside it.
const flushImmediate = () => new Promise(resolve => setImmediate(() => setImmediate(resolve)));

const FAKE_VECTOR = Array.from({ length: 1536 }, (_, i) => Math.cos(i) * 0.5);

describe('users.js — embedding regen trigger (setImmediate routes)', () => {
  beforeAll(async () => {
    await connectTestDB();
    await seedLocations();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await clearTestDB();
    await seedLocations();
  });

  afterAll(async () => { await closeTestDB(); });

  // Helper: spy on generateJobSeekerEmbedding, stub the underlying OpenAI call
  function spyRegen() {
    jest.spyOn(jobEmbeddingService, 'callOpenAIWithRetry').mockResolvedValue(FAKE_VECTOR);
    return jest.spyOn(userEmbeddingService, 'generateJobSeekerEmbedding');
  }

  describe('PUT /api/users/profile — semantic field changes', () => {
    it('title change triggers regen', async () => {
      const { user } = await createJobseeker();
      const spy = spyRegen();

      const r = await request(app)
        .put('/api/users/profile')
        .set(createAuthHeaders(user))
        .send({ jobSeekerProfile: { title: 'Senior Backend Engineer' } });

      expect(r.status).toBe(200);
      await flushImmediate();
      expect(spy).toHaveBeenCalled();
    });

    it('skills change triggers regen', async () => {
      const { user } = await createJobseeker();
      const spy = spyRegen();

      const r = await request(app)
        .put('/api/users/profile')
        .set(createAuthHeaders(user))
        .send({ jobSeekerProfile: { skills: ['Node.js', 'React', 'MongoDB'] } });

      expect(r.status).toBe(200);
      await flushImmediate();
      expect(spy).toHaveBeenCalled();
    });

    it('experience change triggers regen', async () => {
      const { user } = await createJobseeker();
      const spy = spyRegen();

      const r = await request(app)
        .put('/api/users/profile')
        .set(createAuthHeaders(user))
        .send({ jobSeekerProfile: { experience: '5-10 vjet' } });

      expect(r.status).toBe(200);
      await flushImmediate();
      expect(spy).toHaveBeenCalled();
    });

    it('location.city change triggers regen', async () => {
      const { user } = await createJobseeker();
      const spy = spyRegen();

      const r = await request(app)
        .put('/api/users/profile')
        .set(createAuthHeaders(user))
        .send({ location: { city: 'Vlorë' } });

      expect(r.status).toBe(200);
      await flushImmediate();
      expect(spy).toHaveBeenCalled();
    });

    it('non-semantic fields (openToRemote, availability) do NOT trigger regen', async () => {
      const { user } = await createJobseeker();
      const spy = spyRegen();

      const r = await request(app)
        .put('/api/users/profile')
        .set(createAuthHeaders(user))
        .send({ jobSeekerProfile: { openToRemote: true, availability: 'immediately' } });

      expect(r.status).toBe(200);
      await flushImmediate();
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('Work-experience routes trigger regen', () => {
    it('POST /work-experience triggers regen', async () => {
      const { user } = await createJobseeker();
      const spy = spyRegen();

      const r = await request(app)
        .post('/api/users/work-experience')
        .set(createAuthHeaders(user))
        .send({
          position: 'Software Engineer',
          company: 'ACME Corp',
          startDate: '2022-01-01',
          isCurrentJob: true,
          description: 'Built microservices',
        });

      expect(r.status).toBe(200);
      await flushImmediate();
      expect(spy).toHaveBeenCalled();
    });

    it('PUT /work-experience/:id triggers regen', async () => {
      const { user } = await createJobseeker();

      // Seed an experience entry directly so we have an ID to edit
      const workEntry = {
        position: 'Junior Dev',
        company: 'StartupXYZ',
        startDate: '2021-06-01',
        isCurrentJob: true,
      };
      await User.updateOne({ _id: user._id }, { $push: { 'profile.jobSeekerProfile.workHistory': workEntry } });
      const updated = await User.findById(user._id);
      const entryId = updated.profile.jobSeekerProfile.workHistory[0]._id.toString();

      const spy = spyRegen();

      const r = await request(app)
        .put(`/api/users/work-experience/${entryId}`)
        .set(createAuthHeaders(user))
        .send({ position: 'Mid-Level Developer', company: 'StartupXYZ', startDate: '2021-06-01', isCurrentJob: true });

      expect(r.status).toBe(200);
      await flushImmediate();
      expect(spy).toHaveBeenCalled();
    });

    it('DELETE /work-experience/:id triggers regen', async () => {
      const { user } = await createJobseeker();

      const workEntry = {
        position: 'Junior Dev',
        company: 'StartupXYZ',
        startDate: '2021-06-01',
        isCurrentJob: true,
      };
      await User.updateOne({ _id: user._id }, { $push: { 'profile.jobSeekerProfile.workHistory': workEntry } });
      const updated = await User.findById(user._id);
      const entryId = updated.profile.jobSeekerProfile.workHistory[0]._id.toString();

      const spy = spyRegen();

      const r = await request(app)
        .delete(`/api/users/work-experience/${entryId}`)
        .set(createAuthHeaders(user));

      expect(r.status).toBe(200);
      await flushImmediate();
      expect(spy).toHaveBeenCalled();
    });
  });
});
