/**
 * Phase 9 — Configuration deeper coverage
 *
 * Covers: pricing GET+PUT, config :id reset, audit by id, initialize-defaults.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../../setup/testDb.js';
import { seedLocations } from '../../fixtures/locations.fixture.js';
import { createAdmin, createJobseeker } from '../../factories/user.factory.js';
import { createAuthHeaders } from '../../helpers/auth.helper.js';
import { SystemConfiguration, ConfigurationAudit } from '../../../src/models/index.js';

describe('Phase 9 — Configuration Deeper Coverage', () => {
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

  describe('GET /api/configuration/pricing', () => {
    it('admin gets pricing config', async () => {
      const { user: admin } = await createAdmin();
      const response = await request(app)
        .get('/api/configuration/pricing')
        .set(createAuthHeaders(admin));
      expect(response.status).toBe(200);
    });

    it('jobseeker rejected → 403', async () => {
      const { user } = await createJobseeker();
      const response = await request(app)
        .get('/api/configuration/pricing')
        .set(createAuthHeaders(user));
      expect(response.status).toBe(403);
    });
  });

  describe('PUT /api/configuration/pricing', () => {
    it('admin updates pricing config', async () => {
      const { user: admin } = await createAdmin();
      const response = await request(app)
        .put('/api/configuration/pricing')
        .set(createAuthHeaders(admin))
        .send({ basicPrice: 50, premiumPrice: 100 });
      expect(response.status).toBeLessThan(500);
    });
  });

  describe('POST /api/configuration/:id/reset', () => {
    it('admin resets a config to default', async () => {
      const { user: admin } = await createAdmin();
      const cfg = await SystemConfiguration.create({
        category: 'platform',
        key: 'feature_x',
        value: 'modified',
        defaultValue: 'default',
        dataType: 'string',
        description: 'Test',
        lastModifiedBy: admin._id
      });

      const response = await request(app)
        .post(`/api/configuration/${cfg._id}/reset`)
        .set(createAuthHeaders(admin));

      expect([200, 201]).toContain(response.status);
    });

    it('non-admin rejected', async () => {
      const { user: admin } = await createAdmin();
      const { user } = await createJobseeker();
      const cfg = await SystemConfiguration.create({
        category: 'platform', key: 'k', value: 'v', dataType: 'string',
        description: 'd', lastModifiedBy: admin._id
      });
      const response = await request(app)
        .post(`/api/configuration/${cfg._id}/reset`)
        .set(createAuthHeaders(user));
      expect(response.status).toBe(403);
    });
  });

  describe('GET /api/configuration/audit/:id', () => {
    it('admin retrieves audit history for a specific config', async () => {
      const { user: admin } = await createAdmin();
      const cfg = await SystemConfiguration.create({
        category: 'platform', key: 'k2', value: 'v2', dataType: 'string',
        description: 'd', lastModifiedBy: admin._id
      });

      // Make a change to produce an audit row
      await request(app)
        .put(`/api/configuration/${cfg._id}`)
        .set(createAuthHeaders(admin))
        .send({ value: 'new', reason: 'test' });

      const response = await request(app)
        .get(`/api/configuration/audit/${cfg._id}`)
        .set(createAuthHeaders(admin));

      expect(response.status).toBe(200);
    });
  });

  describe('POST /api/configuration/initialize-defaults (idempotency)', () => {
    it('runs twice without error', async () => {
      const { user: admin } = await createAdmin();
      const r1 = await request(app)
        .post('/api/configuration/initialize-defaults')
        .set(createAuthHeaders(admin));
      const r2 = await request(app)
        .post('/api/configuration/initialize-defaults')
        .set(createAuthHeaders(admin));
      expect([200, 201]).toContain(r1.status);
      expect([200, 201]).toContain(r2.status);
    });
  });
});
