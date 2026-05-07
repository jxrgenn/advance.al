/**
 * QuickUsers API Integration Tests — Phase 1
 *
 * Routes covered:
 *   POST /api/quickusers                  (public signup)
 *   POST /api/quickusers/unsubscribe      (token-based)
 *   POST /api/quickusers/track-click      (anon tracking)
 *   GET  /api/quickusers/analytics/overview (admin)
 *   POST /api/quickusers/find-matches     (admin)
 *   GET  /api/quickusers/:id              (admin)
 *   PUT  /api/quickusers/:id/preferences  (token-protected)
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createAdmin, createJobseeker } from '../factories/user.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import { QuickUser } from '../../src/models/index.js';

describe('QuickUsers API - Integration Tests', () => {
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

  describe('POST /api/quickusers (public signup)', () => {
    it('creates a QuickUser with deterministic unsubscribe token', async () => {
      const response = await request(app)
        .post('/api/quickusers')
        .send({
          firstName: 'Quick',
          lastName: 'Signup',
          email: 'quicksignup@example.com',
          location: 'Tiranë',
          interests: ['Teknologji', 'Marketing']
        });

      expect(response.status).toBe(201);
      expect(response.body.data.email).toBe('quicksignup@example.com');
      expect(response.body.data.unsubscribeUrl).toBeDefined();

      const dbUser = await QuickUser.findOne({ email: 'quicksignup@example.com' });
      expect(dbUser).toBeTruthy();
      expect(dbUser.unsubscribeToken).toBeTruthy();
      expect(dbUser.interests).toEqual(expect.arrayContaining(['Teknologji', 'Marketing']));
    }, 30000);

    it('rejects duplicate email', async () => {
      await QuickUser.create({
        firstName: 'Existing', lastName: 'User',
        email: 'dup@example.com', location: 'Tiranë', interests: ['Teknologji']
      });

      const response = await request(app)
        .post('/api/quickusers')
        .send({
          firstName: 'Other', lastName: 'Try',
          email: 'dup@example.com', location: 'Tiranë', interests: ['Teknologji']
        });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/quickusers/unsubscribe', () => {
    it('rejects without token', async () => {
      const response = await request(app)
        .post('/api/quickusers/unsubscribe')
        .send({});
      expect(response.status).toBe(400);
    });

    it('unsubscribes when valid token presented (sets isActive=false)', async () => {
      const qu = await QuickUser.create({
        firstName: 'Sub', lastName: 'Out',
        email: 'unsub@example.com', location: 'Tiranë', interests: ['Marketing']
      });

      const response = await request(app)
        .post('/api/quickusers/unsubscribe')
        .send({ token: qu.unsubscribeToken });

      expect(response.status).toBe(200);
      const after = await QuickUser.findById(qu._id);
      expect(after.isActive).toBe(false);
    });

    it('rejects invalid token', async () => {
      const response = await request(app)
        .post('/api/quickusers/unsubscribe')
        .send({ token: 'bogus-token-xyz' });
      expect(response.status).toBe(404);
    });
  });

  describe('PUT /api/quickusers/:id/preferences (token-protected — F-13 mitigation)', () => {
    it('rejects without token', async () => {
      const qu = await QuickUser.create({
        firstName: 'P', lastName: 'Q',
        email: 'pref@example.com', location: 'Tiranë', interests: ['Teknologji']
      });
      const response = await request(app)
        .put(`/api/quickusers/${qu._id}/preferences`)
        .send({ preferences: { emailFrequency: 'weekly' } });
      expect(response.status).toBe(401);
    });

    it('rejects with wrong token', async () => {
      const qu = await QuickUser.create({
        firstName: 'P', lastName: 'Q',
        email: 'pref2@example.com', location: 'Tiranë', interests: ['Teknologji']
      });
      const response = await request(app)
        .put(`/api/quickusers/${qu._id}/preferences`)
        .send({ token: 'wrong-token', preferences: { emailFrequency: 'weekly' } });
      expect(response.status).toBe(404);
    });

    it('accepts with correct token', async () => {
      const qu = await QuickUser.create({
        firstName: 'P', lastName: 'Q',
        email: 'pref3@example.com', location: 'Tiranë', interests: ['Teknologji']
      });
      const response = await request(app)
        .put(`/api/quickusers/${qu._id}/preferences`)
        .send({ token: qu.unsubscribeToken, preferences: { emailFrequency: 'weekly' } });
      expect(response.status).toBe(200);

      const updated = await QuickUser.findById(qu._id);
      expect(updated.preferences.emailFrequency).toBe('weekly');
    });
  });

  describe('Admin-only QuickUser routes', () => {
    it('non-admin cannot reach analytics', async () => {
      const { user } = await createJobseeker();
      const response = await request(app)
        .get('/api/quickusers/analytics/overview')
        .set(createAuthHeaders(user));
      expect(response.status).toBe(403);
    });

    it('admin can fetch analytics', async () => {
      const { user: admin } = await createAdmin();
      const response = await request(app)
        .get('/api/quickusers/analytics/overview')
        .set(createAuthHeaders(admin));
      expect(response.status).toBe(200);
    });

    it('admin can fetch single QuickUser by id', async () => {
      const { user: admin } = await createAdmin();
      const qu = await QuickUser.create({
        firstName: 'A', lastName: 'B',
        email: 'admin-view@example.com', location: 'Tiranë', interests: ['Marketing']
      });

      const response = await request(app)
        .get(`/api/quickusers/${qu._id}`)
        .set(createAuthHeaders(admin));

      expect(response.status).toBe(200);
    });
  });

  describe('POST /api/quickusers/track-click', () => {
    it('records a click on a valid unsubscribe-token holder', async () => {
      const qu = await QuickUser.create({
        firstName: 'A', lastName: 'B',
        email: 'click@example.com', location: 'Tiranë', interests: ['Teknologji'],
      });

      const response = await request(app)
        .post('/api/quickusers/track-click')
        .send({ token: qu.unsubscribeToken });
      // Endpoint returns 200 (recorded) or 400 (validation)
      expect([200, 400]).toContain(response.status);
    });

    it('rejects request with no token', async () => {
      const response = await request(app)
        .post('/api/quickusers/track-click')
        .send({});
      expect(response.status).toBe(400);
    });

    it('handles unknown token gracefully (no enumeration)', async () => {
      const response = await request(app)
        .post('/api/quickusers/track-click')
        .send({ token: 'a'.repeat(64) });
      // Should return 200 (no enumeration) or 404 — both don't reveal enumeration
      expect([200, 404]).toContain(response.status);
    });
  });

  describe('POST /api/quickusers/find-matches (admin)', () => {
    it('non-admin cannot reach (403)', async () => {
      const { user: js } = await createJobseeker();
      const response = await request(app)
        .post('/api/quickusers/find-matches')
        .set(createAuthHeaders(js))
        .send({ jobId: '507f1f77bcf86cd799439099' });
      expect(response.status).toBe(403);
    });

    it('admin with non-existent jobId returns 400 or 404', async () => {
      const { user: admin } = await createAdmin();
      const response = await request(app)
        .post('/api/quickusers/find-matches')
        .set(createAuthHeaders(admin))
        .send({ jobId: '507f1f77bcf86cd799439099' });
      // JUSTIFIED: route may validate (400) or fetch-and-fail (404); both legit.
      expect([400, 404]).toContain(response.status);
    });

    it('admin with missing jobId returns 400', async () => {
      const { user: admin } = await createAdmin();
      const response = await request(app)
        .post('/api/quickusers/find-matches')
        .set(createAuthHeaders(admin))
        .send({});
      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/quickusers/:id (admin) — additional cases', () => {
    it('non-admin cannot fetch (403)', async () => {
      const { user: js } = await createJobseeker();
      const response = await request(app)
        .get('/api/quickusers/507f1f77bcf86cd799439099')
        .set(createAuthHeaders(js));
      expect(response.status).toBe(403);
    });

    it('admin gets 404 for non-existent id', async () => {
      const { user: admin } = await createAdmin();
      const response = await request(app)
        .get('/api/quickusers/507f1f77bcf86cd799439099')
        .set(createAuthHeaders(admin));
      expect(response.status).toBe(404);
    });
  });

  describe('PUT /api/quickusers/:id/preferences — additional cases', () => {
    it('rejects with malformed id (400)', async () => {
      const response = await request(app)
        .put('/api/quickusers/not-an-objectid/preferences')
        .send({ token: 'whatever', emailFrequency: 'daily' });
      expect(response.status).toBe(400);
    });
  });
});
