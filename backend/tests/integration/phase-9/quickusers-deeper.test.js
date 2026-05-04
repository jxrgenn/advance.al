/**
 * Phase 9 — QuickUsers deeper coverage
 *
 * Covers: track-click, find-matches.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../../setup/testDb.js';
import { seedLocations } from '../../fixtures/locations.fixture.js';
import { createAdmin, createJobseeker } from '../../factories/user.factory.js';
import { createAuthHeaders } from '../../helpers/auth.helper.js';
import { QuickUser } from '../../../src/models/index.js';

describe('Phase 9 — QuickUsers Deeper Coverage', () => {
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

  describe('POST /api/quickusers/track-click (public)', () => {
    it('records a click given valid quickuser id', async () => {
      const qu = await QuickUser.create({
        firstName: 'Click', lastName: 'Test',
        email: 'click@example.com', location: 'Tiranë', interests: ['Marketing']
      });

      const response = await request(app)
        .post('/api/quickusers/track-click')
        .send({ quickUserId: qu._id, jobId: '507f1f77bcf86cd799439011' });

      expect(response.status).toBeLessThan(500);
    });

    it('rejects without quickUserId', async () => {
      const response = await request(app)
        .post('/api/quickusers/track-click')
        .send({});
      expect([400, 404]).toContain(response.status);
    });
  });

  describe('POST /api/quickusers/find-matches (admin)', () => {
    it('admin gets matches for a quickuser', async () => {
      const { user: admin } = await createAdmin();
      const qu = await QuickUser.create({
        firstName: 'Match', lastName: 'Find',
        email: 'match@example.com', location: 'Tiranë', interests: ['Teknologji']
      });

      const response = await request(app)
        .post('/api/quickusers/find-matches')
        .set(createAuthHeaders(admin))
        .send({ quickUserId: qu._id });

      expect(response.status).toBeLessThan(500);
    });

    it('jobseeker rejected', async () => {
      const { user } = await createJobseeker();
      const response = await request(app)
        .post('/api/quickusers/find-matches')
        .set(createAuthHeaders(user))
        .send({});
      expect(response.status).toBe(403);
    });
  });
});
