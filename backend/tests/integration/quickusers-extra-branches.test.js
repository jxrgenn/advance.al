/**
 * Phase 28 — coverage push for quickusers.js extra branches.
 *
 * Targets:
 *   - PUT /:id/preferences without preferences body (L571-576)
 *   - PUT /:id/preferences updates jobTypes / remoteWork / salaryRange (L591-602)
 *   - POST /find-matches with valid job (L485-498 happy path)
 *   - POST / signup with phone provided (L262-264)
 *   - POST / validation: missing required field
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createAdmin } from '../factories/user.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import QuickUser from '../../src/models/QuickUser.js';

async function seedQuickUser(overrides = {}) {
  const qu = new QuickUser({
    firstName: 'Quick',
    lastName: 'Tester',
    email: `qu-${Date.now()}-${Math.random()}@example.com`,
    location: 'Tiranë',
    interests: ['Teknologji'],
    customInterests: [],
    preferences: {
      emailFrequency: 'immediate',
      smsNotifications: false,
      jobTypes: [],
      remoteWork: false,
      salaryRange: {},
    },
    source: 'quick_signup',
    ...overrides,
  });
  await qu.save();
  return qu;
}

describe('quickusers.js — extra branches', () => {
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

  describe('POST / signup branches', () => {
    it('rejects missing firstName (validation L31-40)', async () => {
      const r = await request(app)
        .post('/api/quickusers')
        .send({
          lastName: 'NoFirst',
          email: 'nofirst@example.com',
          location: 'Tiranë',
          interests: ['Teknologji'],
        });
      expect(r.status).toBe(400);
    });

    it('accepts signup with phone field (L262-264)', async () => {
      const r = await request(app)
        .post('/api/quickusers')
        .send({
          firstName: 'WithPhone',
          lastName: 'User',
          email: 'phoneqs@example.com',
          phone: '+355691234567',
          location: 'Tiranë',
          interests: ['Teknologji'],
        });
      expect(r.status).toBe(201);
      const dbUser = await QuickUser.findOne({ email: 'phoneqs@example.com' });
      expect(dbUser.phone).toBe('+355691234567');
    });
  });

  describe('PUT /:id/preferences', () => {
    it('rejects when preferences body missing (L571-576)', async () => {
      const qu = await seedQuickUser();
      const r = await request(app)
        .put(`/api/quickusers/${qu._id}/preferences`)
        .send({ token: qu.unsubscribeToken });
      expect(r.status).toBe(400);
    });

    it('updates jobTypes (L591-593)', async () => {
      const qu = await seedQuickUser();
      const r = await request(app)
        .put(`/api/quickusers/${qu._id}/preferences`)
        .send({
          token: qu.unsubscribeToken,
          preferences: { jobTypes: ['full-time', 'part-time'] },
        });
      expect(r.status).toBe(200);
      const refreshed = await QuickUser.findById(qu._id);
      expect(refreshed.preferences.jobTypes).toEqual(['full-time', 'part-time']);
    });

    it('updates remoteWork toggle (L594-596)', async () => {
      const qu = await seedQuickUser();
      const r = await request(app)
        .put(`/api/quickusers/${qu._id}/preferences`)
        .send({
          token: qu.unsubscribeToken,
          preferences: { remoteWork: true },
        });
      expect(r.status).toBe(200);
      const refreshed = await QuickUser.findById(qu._id);
      expect(refreshed.preferences.remoteWork).toBe(true);
    });

    it('updates salaryRange (L597-602)', async () => {
      const qu = await seedQuickUser();
      const r = await request(app)
        .put(`/api/quickusers/${qu._id}/preferences`)
        .send({
          token: qu.unsubscribeToken,
          preferences: { salaryRange: { min: 800, max: 1500, currency: 'EUR' } },
        });
      expect(r.status).toBe(200);
      const refreshed = await QuickUser.findById(qu._id);
      expect(refreshed.preferences.salaryRange.min).toBe(800);
      expect(refreshed.preferences.salaryRange.max).toBe(1500);
    });
  });

  describe('POST /find-matches success path (L485-498)', () => {
    it('admin can find matching quickusers for a job', async () => {
      const { user: admin } = await createAdmin();
      // Seed a quickuser interested in Teknologji in Tiranë
      await seedQuickUser({
        email: 'match-target@example.com',
        location: 'Tiranë',
        interests: ['Teknologji'],
      });

      const r = await request(app)
        .post('/api/quickusers/find-matches')
        .set(createAuthHeaders(admin))
        .send({
          job: {
            title: 'Software Engineer',
            location: 'Tiranë',
            category: 'Teknologji',
            jobType: 'full-time',
          },
        });

      expect(r.status).toBe(200);
      expect(r.body.data).toHaveProperty('totalMatches');
      expect(r.body.data).toHaveProperty('matches');
      expect(Array.isArray(r.body.data.matches)).toBe(true);
    });
  });
});
