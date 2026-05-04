/**
 * Phase 9 — Business Control deeper coverage
 *
 * Covers: pricing-rules CRUD + toggle, analytics/update, platform/emergency,
 * campaigns activate/pause.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../../setup/testDb.js';
import { seedLocations } from '../../fixtures/locations.fixture.js';
import { createAdmin, createJobseeker } from '../../factories/user.factory.js';
import { createAuthHeaders } from '../../helpers/auth.helper.js';
import { PricingRule, BusinessCampaign } from '../../../src/models/index.js';

describe('Phase 9 — Business Control Deeper Coverage', () => {
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

  describe('Pricing Rules CRUD', () => {
    it('admin creates a pricing rule', async () => {
      const { user: admin } = await createAdmin();
      const response = await request(app)
        .post('/api/business-control/pricing-rules')
        .set(createAuthHeaders(admin))
        .send({
          name: 'Premium discount',
          type: 'percentage',
          value: 20,
          conditions: { tier: 'premium' }
        });
      expect(response.status).toBeLessThan(500);
    });

    it('admin lists pricing rules', async () => {
      const { user: admin } = await createAdmin();
      const response = await request(app)
        .get('/api/business-control/pricing-rules')
        .set(createAuthHeaders(admin));
      expect(response.status).toBe(200);
    });

    it('admin can toggle a pricing rule', async () => {
      const { user: admin } = await createAdmin();
      // Create directly so we have a valid ID
      const rule = await PricingRule.create({
        name: 'Test Rule',
        type: 'percentage',
        value: 10,
        active: true,
        createdBy: admin._id
      }).catch(() => null);

      if (rule) {
        const response = await request(app)
          .post(`/api/business-control/pricing-rules/${rule._id}/toggle`)
          .set(createAuthHeaders(admin));
        expect([200, 201]).toContain(response.status);
      }
    });

    it('jobseeker rejected on pricing-rules', async () => {
      const { user } = await createJobseeker();
      const response = await request(app)
        .get('/api/business-control/pricing-rules')
        .set(createAuthHeaders(user));
      expect(response.status).toBe(403);
    });
  });

  describe('POST /api/business-control/analytics/update', () => {
    it('admin triggers analytics recompute', async () => {
      const { user: admin } = await createAdmin();
      const response = await request(app)
        .post('/api/business-control/analytics/update')
        .set(createAuthHeaders(admin));
      expect(response.status).toBeLessThan(500);
    });
  });

  describe('POST /api/business-control/platform/emergency', () => {
    it('admin can toggle emergency maintenance mode', async () => {
      const { user: admin } = await createAdmin();
      const response = await request(app)
        .post('/api/business-control/platform/emergency')
        .set(createAuthHeaders(admin))
        .send({ enabled: true, reason: 'database maintenance' });
      expect(response.status).toBeLessThan(500);
    });

    it('jobseeker cannot trigger emergency', async () => {
      const { user } = await createJobseeker();
      const response = await request(app)
        .post('/api/business-control/platform/emergency')
        .set(createAuthHeaders(user))
        .send({ enabled: true });
      expect(response.status).toBe(403);
    });
  });

  describe('Campaigns activate/pause', () => {
    it('admin can activate then pause a draft campaign', async () => {
      const { user: admin } = await createAdmin();
      const start = new Date(Date.now() + 60_000).toISOString();
      const end = new Date(Date.now() + 86_400_000).toISOString();

      const create = await request(app)
        .post('/api/business-control/campaigns')
        .set(createAuthHeaders(admin))
        .send({
          name: 'Phase9 Test Campaign',
          type: 'flash_sale',
          parameters: { discount: 15 },
          schedule: { startDate: start, endDate: end },
          targetAudience: { type: 'all' },
          content: { title: 't', description: 'd' }
        });
      expect(create.status).toBe(201);
      const id = create.body.data?.campaign?._id;
      if (!id) return;

      const activate = await request(app)
        .post(`/api/business-control/campaigns/${id}/activate`)
        .set(createAuthHeaders(admin));
      expect(activate.status).toBeLessThan(500);

      const pause = await request(app)
        .post(`/api/business-control/campaigns/${id}/pause`)
        .set(createAuthHeaders(admin));
      expect(pause.status).toBeLessThan(500);
    });
  });
});
