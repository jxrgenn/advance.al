/**
 * Configuration API Integration Tests — Phase 1
 *
 * Routes covered (11):
 *   GET  /api/configuration
 *   GET  /api/configuration/public
 *   GET  /api/configuration/pricing
 *   PUT  /api/configuration/pricing
 *   PUT  /api/configuration/:id
 *   POST /api/configuration/:id/reset
 *   GET  /api/configuration/audit/:id
 *   GET  /api/configuration/audit
 *   GET  /api/configuration/system-health
 *   POST /api/configuration/initialize-defaults
 *   POST /api/configuration/maintenance-mode
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createAdmin, createJobseeker } from '../factories/user.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import { SystemConfiguration, ConfigurationAudit } from '../../src/models/index.js';

describe('Configuration API - Integration Tests', () => {
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

  describe('Auth gate', () => {
    it('GET /api/configuration is admin-only', async () => {
      const { user } = await createJobseeker();
      const response = await request(app)
        .get('/api/configuration')
        .set(createAuthHeaders(user));
      expect(response.status).toBe(403);
    });
  });

  describe('GET /api/configuration/public', () => {
    it('returns public settings without auth', async () => {
      const { user: bootstrap } = await createAdmin({ email: 'bootstrap-cfg@advance.al' });
      await SystemConfiguration.create({
        category: 'platform',
        key: 'feature_x_enabled',
        value: true,
        dataType: 'boolean',
        description: 'Test setting',
        isPublic: true,
        lastModifiedBy: bootstrap._id
      });

      const response = await request(app).get('/api/configuration/public');
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('reports smsEnabled (false when Twilio env is not configured)', async () => {
      const saved = {
        sid: process.env.TWILIO_ACCOUNT_SID,
        token: process.env.TWILIO_AUTH_TOKEN,
        phone: process.env.TWILIO_PHONE,
      };
      delete process.env.TWILIO_ACCOUNT_SID;
      delete process.env.TWILIO_AUTH_TOKEN;
      delete process.env.TWILIO_PHONE;
      try {
        const r1 = await request(app).get('/api/configuration/public');
        expect(r1.body.data.smsEnabled).toBe(false);

        process.env.TWILIO_ACCOUNT_SID = 'AC_test';
        process.env.TWILIO_AUTH_TOKEN = 'tok_test';
        process.env.TWILIO_PHONE = '+15550001111';
        const r2 = await request(app).get('/api/configuration/public');
        expect(r2.body.data.smsEnabled).toBe(true);
      } finally {
        if (saved.sid === undefined) delete process.env.TWILIO_ACCOUNT_SID; else process.env.TWILIO_ACCOUNT_SID = saved.sid;
        if (saved.token === undefined) delete process.env.TWILIO_AUTH_TOKEN; else process.env.TWILIO_AUTH_TOKEN = saved.token;
        if (saved.phone === undefined) delete process.env.TWILIO_PHONE; else process.env.TWILIO_PHONE = saved.phone;
      }
    });
  });

  describe('GET /api/configuration', () => {
    it('admin can list all settings', async () => {
      const { user: admin } = await createAdmin();
      await SystemConfiguration.create({
        category: 'platform',
        key: 'cfg1', value: 'v1', dataType: 'string', description: 'd1', lastModifiedBy: admin._id
      });

      const response = await request(app)
        .get('/api/configuration')
        .set(createAuthHeaders(admin));
      expect(response.status).toBe(200);
    });
  });

  describe('PUT /api/configuration/:id — produces audit row', () => {
    it('admin updates a setting and ConfigurationAudit row is created', async () => {
      const { user: admin } = await createAdmin();
      const cfg = await SystemConfiguration.create({
        category: 'platform',
        key: 'changeable_key',
        value: 'old',
        dataType: 'string',
        description: 'Test',
        lastModifiedBy: admin._id
      });

      const auditBefore = await ConfigurationAudit.countDocuments({});

      const response = await request(app)
        .put(`/api/configuration/${cfg._id}`)
        .set(createAuthHeaders(admin))
        .send({ value: 'new', reason: 'test change' });

      expect(response.status).toBe(200);

      const updated = await SystemConfiguration.findById(cfg._id);
      expect(updated.value).toBe('new');

      const auditAfter = await ConfigurationAudit.countDocuments({});
      expect(auditAfter).toBeGreaterThan(auditBefore);
    });

    it('non-admin rejected', async () => {
      const { user } = await createJobseeker();
      const { user: setupAdmin } = await createAdmin({ email: 'setup@advance.al' });
      const cfg = await SystemConfiguration.create({
        category: 'platform', key: 'k', value: 'v', dataType: 'string', description: 'd', lastModifiedBy: setupAdmin._id
      });

      const response = await request(app)
        .put(`/api/configuration/${cfg._id}`)
        .set(createAuthHeaders(user))
        .send({ value: 'new' });

      expect(response.status).toBe(403);
    });
  });

  describe('GET /api/configuration/audit', () => {
    it('admin sees audit history', async () => {
      const { user: admin } = await createAdmin();
      const response = await request(app)
        .get('/api/configuration/audit')
        .set(createAuthHeaders(admin));
      expect(response.status).toBe(200);
    });
  });

  describe('POST /api/configuration/initialize-defaults', () => {
    it('admin can initialize defaults', async () => {
      const { user: admin } = await createAdmin();
      const response = await request(app)
        .post('/api/configuration/initialize-defaults')
        .set(createAuthHeaders(admin));
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data?.createdSettings)).toBe(true);
    });
  });

  describe('GET /api/configuration/system-health', () => {
    it('admin can fetch system health', async () => {
      const { user: admin } = await createAdmin();
      const response = await request(app)
        .get('/api/configuration/system-health')
        .set(createAuthHeaders(admin));
      expect(response.status).toBe(200);
    });
  });

  describe('POST /api/configuration/maintenance-mode', () => {
    it('admin can toggle maintenance mode after defaults initialized', async () => {
      const { user: admin } = await createAdmin();
      // Maintenance-mode setting only exists after initialize-defaults has run.
      await request(app)
        .post('/api/configuration/initialize-defaults')
        .set(createAuthHeaders(admin));

      const response = await request(app)
        .post('/api/configuration/maintenance-mode')
        .set(createAuthHeaders(admin))
        .send({ enabled: true, reason: 'test' });
      expect(response.status).toBe(200);
      expect(response.body.data.maintenanceMode).toBe(true);
    });

    it('returns 404 when maintenance setting does not exist (defaults not initialized)', async () => {
      const { user: admin } = await createAdmin();
      const response = await request(app)
        .post('/api/configuration/maintenance-mode')
        .set(createAuthHeaders(admin))
        .send({ enabled: true, reason: 'test' });
      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/configuration/pricing', () => {
    it('admin can fetch pricing settings', async () => {
      const { user: admin } = await createAdmin();
      const response = await request(app)
        .get('/api/configuration/pricing')
        .set(createAuthHeaders(admin));
      expect(response.status).toBe(200);
    });

    it('non-admin rejected (403)', async () => {
      const { user: js } = await createJobseeker();
      const response = await request(app)
        .get('/api/configuration/pricing')
        .set(createAuthHeaders(js));
      expect(response.status).toBe(403);
    });
  });

  describe('POST /api/configuration/:id/reset', () => {
    it('reset on non-existent id returns 404', async () => {
      const { user: admin } = await createAdmin();
      const response = await request(app)
        .post('/api/configuration/507f1f77bcf86cd799439099/reset')
        .set(createAuthHeaders(admin));
      expect(response.status).toBe(404);
    });

    it('reset with malformed id returns 400', async () => {
      const { user: admin } = await createAdmin();
      const response = await request(app)
        .post('/api/configuration/not-an-objectid/reset')
        .set(createAuthHeaders(admin));
      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/configuration/audit/:id', () => {
    it('audit on non-existent id returns 200 with empty history (no 404 — endpoint is lookup-only)', async () => {
      const { user: admin } = await createAdmin();
      const response = await request(app)
        .get('/api/configuration/audit/507f1f77bcf86cd799439099')
        .set(createAuthHeaders(admin));
      expect(response.status).toBe(200);
      expect(response.body.data.auditHistory).toEqual([]);
      expect(response.body.data.pagination.totalItems).toBe(0);
    });

    it('audit with malformed id returns 400', async () => {
      const { user: admin } = await createAdmin();
      const response = await request(app)
        .get('/api/configuration/audit/not-an-objectid')
        .set(createAuthHeaders(admin));
      expect(response.status).toBe(400);
    });
  });
});
