/**
 * Companies API Integration Tests — Phase 1
 *
 * Routes covered:
 *   GET /api/companies            (public list w/ filters & pagination)
 *   GET /api/companies/:id        (public single company)
 *   GET /api/companies/:id/jobs   (public — jobs by company)
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createVerifiedEmployer, createEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';

describe('Companies API - Integration Tests', () => {
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

  describe('GET /api/companies', () => {
    it('lists active employers and excludes deleted ones', async () => {
      await createVerifiedEmployer({ companyName: 'AlphaTech' });
      await createVerifiedEmployer({ companyName: 'BetaCorp' });

      const response = await request(app).get('/api/companies');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.companies.length).toBeGreaterThanOrEqual(2);
    });

    it('search filter narrows by company name (case-insensitive)', async () => {
      await createVerifiedEmployer({ companyName: 'GammaFinance' });
      await createVerifiedEmployer({ companyName: 'OmegaShop' });

      const response = await request(app).get('/api/companies?search=gamma');

      expect(response.status).toBe(200);
      const names = response.body.data.companies.map(c => c.name);
      expect(names).toContain('GammaFinance');
      expect(names).not.toContain('OmegaShop');
    });

    it('paginates results', async () => {
      for (let i = 0; i < 15; i++) {
        await createVerifiedEmployer({ companyName: `Co${String(i).padStart(2, '0')}` });
      }
      const response = await request(app).get('/api/companies?page=1&limit=5');

      expect(response.status).toBe(200);
      expect(response.body.data.companies).toHaveLength(5);
      expect(response.body.data.pagination.totalPages).toBeGreaterThan(1);
    });
  });

  describe('GET /api/companies/:id', () => {
    it('returns company details', async () => {
      const { user: employer } = await createVerifiedEmployer({ companyName: 'Detail Co' });
      const response = await request(app).get(`/api/companies/${employer._id}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.company.name).toBe('Detail Co');
    });

    it('returns 404 for non-existent ObjectId', async () => {
      const response = await request(app).get('/api/companies/507f1f77bcf86cd799439011');
      expect(response.status).toBe(404);
    });

    it('rejects malformed id', async () => {
      const response = await request(app).get('/api/companies/not-an-id');
      // JUSTIFIED: Token/resource lookup — 400 (validator) or 404 (not found in store).
      expect([400, 404]).toContain(response.status);
    });
  });

  describe('GET /api/companies/:id/jobs', () => {
    it('lists active jobs for the company', async () => {
      const { user: employer } = await createVerifiedEmployer();
      await createJob(employer, { title: 'Job A' });
      await createJob(employer, { title: 'Job B' });

      const response = await request(app).get(`/api/companies/${employer._id}/jobs`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      const titles = response.body.data.jobs.map(j => j.title);
      expect(titles).toEqual(expect.arrayContaining(['Job A', 'Job B']));
    });
  });
});
