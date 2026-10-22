/**
 * Locations API Integration Tests — Phase 1
 *
 * Routes covered:
 *   GET /api/locations         (public, all active)
 *   GET /api/locations/popular (public, top-N by jobCount)
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import Location from '../../src/models/Location.js';
import Job from '../../src/models/Job.js';
import { createVerifiedEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';

describe('Locations API - Integration Tests', () => {
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

  describe('GET /api/locations', () => {
    it('returns the seeded active Albanian cities', async () => {
      const response = await request(app).get('/api/locations');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data.locations)).toBe(true);
      expect(response.body.data.locations.length).toBeGreaterThanOrEqual(15);
      const cities = response.body.data.locations.map(l => l.city);
      expect(cities).toEqual(expect.arrayContaining(['Tiranë', 'Durrës', 'Vlorë']));
    });

    it('omits locations whose isActive=false', async () => {
      await Location.updateOne({ city: 'Tiranë' }, { $set: { isActive: false } });

      const response = await request(app).get('/api/locations');

      expect(response.status).toBe(200);
      const cities = response.body.data.locations.map(l => l.city);
      expect(cities).not.toContain('Tiranë');
    });
  });

  describe('GET /api/locations/popular', () => {
    it('orders by the LIVE number of open jobs desc, respecting limit (#117)', async () => {
      const { user: emp } = await createVerifiedEmployer();
      for (let i = 0; i < 3; i++) await createJob(emp, { city: 'Durrës' });
      for (let i = 0; i < 2; i++) await createJob(emp, { city: 'Vlorë' });
      await createJob(emp, { city: 'Tiranë' });
      // Expired-by-date (cron not run yet), closed and deleted jobs don't count.
      const late = await createJob(emp, { city: 'Tiranë' });
      await Job.updateOne({ _id: late._id }, { $set: { expiresAt: new Date(Date.now() - 60_000) } });
      await createJob(emp, { city: 'Tiranë', status: 'closed' });
      const gone = await createJob(emp, { city: 'Tiranë' });
      await Job.updateOne({ _id: gone._id }, { $set: { isDeleted: true } });
      // A drifted stored counter (what bulk updates used to leave) is ignored.
      await Location.updateOne({ city: 'Tiranë' }, { $set: { jobCount: 50 } });

      const response = await request(app).get('/api/locations/popular?limit=2');

      expect(response.status).toBe(200);
      expect(response.body.data.locations.map(l => [l.city, l.jobCount])).toEqual([['Durrës', 3], ['Vlorë', 2]]);
    });

    it('clamps insanely high limits to a sane ceiling', async () => {
      const response = await request(app).get('/api/locations/popular?limit=999999');

      expect(response.status).toBe(200);
      expect(response.body.data.locations.length).toBeLessThanOrEqual(50);
    });
  });
});
