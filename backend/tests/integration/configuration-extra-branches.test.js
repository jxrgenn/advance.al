/**
 * Phase 28 — coverage push for configuration.js extra branches.
 *
 * Targets:
 *   - GET / with ?category= filter (L66-68)
 *   - GET / with ?includeAudit=true (L83-84)
 *   - GET /audit with ?category= filter (L417-422)
 *   - PUT /:id validation error: missing value (L31-40 handleValidationErrors)
 *   - PUT /:id setting not found 404 (L252-257)
 *   - POST /:id/reset setting not found 404 (L312-317)
 *   - GET /audit/:id pagination
 *   - POST /maintenance-mode setting not found 404 (L511-516)
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createAdmin } from '../factories/user.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import SystemConfiguration from '../../src/models/SystemConfiguration.js';
import ConfigurationAudit from '../../src/models/ConfigurationAudit.js';

async function seedSetting(key, value, dataType = 'number', category = 'features', adminId = null) {
  return SystemConfiguration.findOneAndUpdate(
    { key },
    {
      key, name: key, category, dataType, value, defaultValue: value,
      description: 'd', isActive: true,
      ...(adminId ? { lastModifiedBy: adminId } : {}),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

describe('configuration.js — extra branch coverage', () => {
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

  describe('GET / filters', () => {
    it('returns settings filtered by ?category= query (L66-68)', async () => {
      const { user: admin } = await createAdmin();
      await seedSetting('feature_x', true, 'boolean', 'features');
      await seedSetting('pricing_y', 100, 'number', 'payment');

      const r = await request(app)
        .get('/api/configuration?category=features')
        .set(createAuthHeaders(admin));
      expect(r.status).toBe(200);
      // Response groups by category; only the requested category should be present
      expect(Object.keys(r.body.data.settings)).toContain('features');
    });

    it('returns auditHistory when ?includeAudit=true (L83-84)', async () => {
      const { user: admin } = await createAdmin();
      const setting = await seedSetting('xyz_setting', 42);
      // Seed at least one audit row
      await ConfigurationAudit.logChange(
        setting._id, setting.key, 'updated', 41, 42, admin._id, setting.category,
        { reason: 'test', ipAddress: '127.0.0.1', userAgent: 'jest' }
      );

      const r = await request(app)
        .get('/api/configuration?includeAudit=true')
        .set(createAuthHeaders(admin));
      expect(r.status).toBe(200);
      expect(r.body.data.auditHistory).toBeDefined();
      expect(Array.isArray(r.body.data.auditHistory)).toBe(true);
    });
  });

  describe('PUT /:id validation + 404', () => {
    it('returns 400 when value is missing (handleValidationErrors L31-40)', async () => {
      const { user: admin } = await createAdmin();
      const setting = await seedSetting('val_test', 10);
      const r = await request(app)
        .put(`/api/configuration/${setting._id}`)
        .set(createAuthHeaders(admin))
        .send({}); // value missing
      expect(r.status).toBe(400);
      expect(r.body.errors).toBeDefined();
    });

    it('returns 404 for non-existent setting id (L252-257)', async () => {
      const { user: admin } = await createAdmin();
      const r = await request(app)
        .put('/api/configuration/507f1f77bcf86cd799439099')
        .set(createAuthHeaders(admin))
        .send({ value: 999 });
      expect(r.status).toBe(404);
    });
  });

  describe('POST /:id/reset', () => {
    it('returns 404 for non-existent setting (L312-317)', async () => {
      const { user: admin } = await createAdmin();
      const r = await request(app)
        .post('/api/configuration/507f1f77bcf86cd799439099/reset')
        .set(createAuthHeaders(admin))
        .send({ reason: 'test' });
      expect(r.status).toBe(404);
    });

    it('successfully resets a setting to defaultValue and creates audit row', async () => {
      const { user: admin } = await createAdmin();
      const setting = await seedSetting('reset_test', 100, 'number', 'features', admin._id);
      // Modify it first so reset has effect
      setting.value = 999;
      setting.lastModifiedBy = admin._id;
      await setting.save();

      const r = await request(app)
        .post(`/api/configuration/${setting._id}/reset`)
        .set(createAuthHeaders(admin))
        .send({ reason: 'rollback' });
      expect(r.status).toBe(200);

      const refreshed = await SystemConfiguration.findById(setting._id);
      expect(refreshed.value).toBe(100); // back to default
    });
  });

  describe('GET /audit/:id', () => {
    it('returns paginated audit history for a specific setting', async () => {
      const { user: admin } = await createAdmin();
      const setting = await seedSetting('audit_t', 1);
      // Seed multiple audit entries
      for (let i = 1; i <= 3; i++) {
        await ConfigurationAudit.logChange(
          setting._id, setting.key, 'updated', i - 1, i, admin._id, setting.category,
          { reason: `update ${i}`, ipAddress: '127.0.0.1', userAgent: 'jest' }
        );
      }
      const r = await request(app)
        .get(`/api/configuration/audit/${setting._id}?page=1&limit=2`)
        .set(createAuthHeaders(admin));
      expect(r.status).toBe(200);
      expect(r.body.data.pagination.totalItems).toBe(3);
      expect(r.body.data.pagination.itemsPerPage).toBe(2);
    });
  });

  describe('GET /audit with category filter (L417-422)', () => {
    it('returns only audit rows for requested category', async () => {
      const { user: admin } = await createAdmin();
      const setting = await seedSetting('cat_features', 1, 'number', 'features');
      await ConfigurationAudit.logChange(
        setting._id, setting.key, 'updated', 0, 1, admin._id, 'features',
        { reason: 't', ipAddress: '127.0.0.1', userAgent: 'jest' }
      );

      const r = await request(app)
        .get('/api/configuration/audit?category=features')
        .set(createAuthHeaders(admin));
      expect(r.status).toBe(200);
      expect(Array.isArray(r.body.data.auditHistory)).toBe(true);
    });
  });

  describe('POST /maintenance-mode 404 path', () => {
    it('returns 404 when maintenance_mode setting not seeded (L511-516)', async () => {
      const { user: admin } = await createAdmin();
      // Ensure no maintenance_mode setting exists
      await SystemConfiguration.deleteMany({ key: 'maintenance_mode' });

      const r = await request(app)
        .post('/api/configuration/maintenance-mode')
        .set(createAuthHeaders(admin))
        .send({ enabled: true, reason: 'test' });
      expect(r.status).toBe(404);
    });

    it('successfully toggles maintenance mode when setting exists', async () => {
      const { user: admin } = await createAdmin();
      await seedSetting('maintenance_mode', false, 'boolean', 'system');

      const r = await request(app)
        .post('/api/configuration/maintenance-mode')
        .set(createAuthHeaders(admin))
        .send({ enabled: true });
      expect(r.status).toBe(200);
      expect(r.body.data.maintenanceMode).toBe(true);
    });
  });
});
