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
    it('orders by jobCount desc, respecting limit', async () => {
      await Location.updateOne({ city: 'Tiranë' }, { $set: { jobCount: 50 } });
      await Location.updateOne({ city: 'Durrës' }, { $set: { jobCount: 20 } });
      await Location.updateOne({ city: 'Vlorë' }, { $set: { jobCount: 5 } });

      const response = await request(app).get('/api/locations/popular?limit=2');

      expect(response.status).toBe(200);
      expect(response.body.data.locations).toHaveLength(2);
      expect(response.body.data.locations[0].city).toBe('Tiranë');
      expect(response.body.data.locations[1].city).toBe('Durrës');
    });

    it('clamps insanely high limits to a sane ceiling', async () => {
      const response = await request(app).get('/api/locations/popular?limit=999999');

      expect(response.status).toBe(200);
      expect(response.body.data.locations.length).toBeLessThanOrEqual(50);
    });
  });
});
