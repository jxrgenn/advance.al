/**
 * Stats API Integration Tests — Phase 1
 *
 * Routes covered:
 *   GET /api/stats/public  — homepage stats, real DB counts
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createVerifiedEmployer, createJobseeker, createJobseekers } from '../factories/user.factory.js';
import { createJob, createJobs } from '../factories/job.factory.js';

describe('Stats API - Integration Tests', () => {
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

  describe('GET /api/stats/public', () => {
    // The route maintains an in-memory 5-min cache as Redis fallback. We seed
    // data BEFORE the very first call so the cache is populated correctly,
    // then the second call serves from cache (which is the production behaviour).
    it('reflects DB state and serves a cached payload thereafter', async () => {
      const { user: employer } = await createVerifiedEmployer();
      await createJobseekers(3);
      await createJobs(employer, 5);

      const response = await request(app).get('/api/stats/public');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.totalJobs).toBe(5);
      expect(response.body.data.activeJobs).toBe(5);
      expect(response.body.data.totalCompanies).toBe(1);
      expect(response.body.data.totalJobSeekers).toBe(3);
      expect(response.body.data.recentJobs.length).toBeLessThanOrEqual(6);
      expect(response.body.data.recentJobs[0]).toHaveProperty('title');
      expect(response.body.data.recentJobs[0]).toHaveProperty('timeAgo');

      // Second call: cache hit path. Same payload.
      const cached = await request(app).get('/api/stats/public');
      expect(cached.status).toBe(200);
      expect(cached.body.data.totalJobs).toBe(5);
    });

    it('does not require authentication', async () => {
      const response = await request(app).get('/api/stats/public');
      expect(response.status).toBe(200);
    });
  });
});
