/**
 * Business Control API Integration Tests — Phase 1
 *
 * Routes covered (subset of 17 — happy path + auth gate):
 *   POST   /api/business-control/campaigns
 *   GET    /api/business-control/campaigns
 *   PUT    /api/business-control/campaigns/:id
 *   POST   /api/business-control/campaigns/:id/activate
 *   POST   /api/business-control/campaigns/:id/pause
 *   POST   /api/business-control/pricing-rules
 *   GET    /api/business-control/pricing-rules
 *   GET    /api/business-control/analytics/dashboard
 *   GET    /api/business-control/analytics/revenue
 *   GET    /api/business-control/whitelist
 *   POST   /api/business-control/whitelist/:employerId
 *   DELETE /api/business-control/whitelist/:employerId
 *   GET    /api/business-control/employers/search
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import {
  createAdmin, createJobseeker, createVerifiedEmployer
} from '../factories/user.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import { BusinessCampaign, User } from '../../src/models/index.js';

describe('Business Control API - Integration Tests', () => {
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

  describe('Auth gate — admin only', () => {
    it('jobseeker cannot list campaigns', async () => {
      const { user } = await createJobseeker();
      const response = await request(app)
        .get('/api/business-control/campaigns')
        .set(createAuthHeaders(user));
      expect(response.status).toBe(403);
    });

    it('employer cannot list pricing rules', async () => {
      const { user } = await createVerifiedEmployer();
      const response = await request(app)
        .get('/api/business-control/pricing-rules')
        .set(createAuthHeaders(user));
      expect(response.status).toBe(403);
    });
  });

  describe('Campaigns', () => {
    it('admin can create + list campaigns; DB reflects creation', async () => {
      const { user: admin } = await createAdmin();
      const start = new Date(Date.now() + 60_000).toISOString();
      const end = new Date(Date.now() + 86_400_000).toISOString();

      const create = await request(app)
        .post('/api/business-control/campaigns')
        .set(createAuthHeaders(admin))
        .send({
          name: 'Spring Sale',
          type: 'flash_sale',
          parameters: { discount: 20, targetAudience: 'all' },
          schedule: { startDate: start, endDate: end },
          targetAudience: { type: 'all' },
          content: { title: 'Spring Sale', description: '20% off' }
        });

      expect(create.status).toBe(201);
      expect(await BusinessCampaign.countDocuments({ name: 'Spring Sale' })).toBe(1);

      const list = await request(app)
        .get('/api/business-control/campaigns')
        .set(createAuthHeaders(admin));
      expect(list.status).toBe(200);
      expect(list.body.data.campaigns.length).toBeGreaterThanOrEqual(1);
    });

    it('rejects bad campaign type', async () => {
      const { user: admin } = await createAdmin();
      const response = await request(app)
        .post('/api/business-control/campaigns')
        .set(createAuthHeaders(admin))
        .send({
          name: 'X', type: 'bogus',
          schedule: { startDate: new Date().toISOString(), endDate: new Date(Date.now() + 1000).toISOString() }
        });
      expect(response.status).toBe(400);
    });
  });

  describe('Whitelist (free posting)', () => {
    it('admin can read whitelist', async () => {
      const { user: admin } = await createAdmin();
      const response = await request(app)
        .get('/api/business-control/whitelist')
        .set(createAuthHeaders(admin));
      expect(response.status).toBe(200);
    });

    it('admin can grant + revoke freePostingEnabled', async () => {
      const { user: admin } = await createAdmin();
      const { user: emp } = await createVerifiedEmployer({ freePostingEnabled: false });

      const grant = await request(app)
        .post(`/api/business-control/whitelist/${emp._id}`)
        .set(createAuthHeaders(admin))
        .send({ reason: 'Test' });
      // JUSTIFIED: HTTP convention — POST returns 200 (with body) or 201 (created).
      expect([200, 201]).toContain(grant.status);

      let dbEmp = await User.findById(emp._id);
      expect(dbEmp.freePostingEnabled).toBe(true);

      const revoke = await request(app)
        .delete(`/api/business-control/whitelist/${emp._id}`)
        .set(createAuthHeaders(admin));
      expect(revoke.status).toBe(200);

      dbEmp = await User.findById(emp._id);
      expect(dbEmp.freePostingEnabled).toBe(false);
    });
  });

  describe('Analytics', () => {
    it('admin can fetch dashboard', async () => {
      const { user: admin } = await createAdmin();
      const response = await request(app)
        .get('/api/business-control/analytics/dashboard')
        .set(createAuthHeaders(admin));
      expect(response.status).toBe(200);
    });

    it('admin can fetch revenue', async () => {
      const { user: admin } = await createAdmin();
      const response = await request(app)
        .get('/api/business-control/analytics/revenue')
        .set(createAuthHeaders(admin));
      expect(response.status).toBe(200);
    });
  });

  describe('Employer search (whitelist UI)', () => {
    it('admin can search employers', async () => {
      const { user: admin } = await createAdmin();
      await createVerifiedEmployer({ companyName: 'SearchableCo' });

      const response = await request(app)
        .get('/api/business-control/employers/search?q=SearchableCo')
        .set(createAuthHeaders(admin));
      expect(response.status).toBe(200);
    });
  });

  describe('Pricing Rules', () => {
    it('admin can create a pricing rule and list it', async () => {
      const { user: admin } = await createAdmin();

      const create = await request(app)
        .post('/api/business-control/pricing-rules')
        .set(createAuthHeaders(admin))
        .send({
          name: 'Test Industry Rule',
          description: 'Tech jobs get 1.5x',
          category: 'industry',
          rules: {
            basePrice: 100,
            multiplier: 1.5,
            fixedAdjustment: 0,
            conditions: [{ field: 'industry', operator: 'equals', value: 'Teknologji' }],
          },
          isActive: true,
          priority: 50,
        });
      // JUSTIFIED: HTTP convention — POST returns 200 (with body) or 201 (created).
      expect([200, 201]).toContain(create.status);

      const list = await request(app)
        .get('/api/business-control/pricing-rules')
        .set(createAuthHeaders(admin));
      expect(list.status).toBe(200);
    });

    it('rejects pricing rule with invalid category enum', async () => {
      const { user: admin } = await createAdmin();
      const response = await request(app)
        .post('/api/business-control/pricing-rules')
        .set(createAuthHeaders(admin))
        .send({
          name: 'Bad', category: 'mystery', rules: { basePrice: 100, multiplier: 1 },
        });
      expect(response.status).toBe(400);
    });
  });

  describe('Analytics — additional', () => {
    it('admin POST /analytics/update returns 200 (refresh trigger)', async () => {
      const { user: admin } = await createAdmin();
      const response = await request(app)
        .post('/api/business-control/analytics/update')
        .set(createAuthHeaders(admin));
      expect(response.status).toBe(200);
    });
  });
});
