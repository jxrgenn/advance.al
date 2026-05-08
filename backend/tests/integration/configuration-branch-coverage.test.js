/**
 * Phase 28 — coverage push for routes/configuration.js branches.
 *
 * Existing tests cover happy-path admin auth + 1-2 endpoints. This file fills:
 *   - GET / with ?category= filter (L67-68)
 *   - GET / with ?includeAudit=true → ConfigurationAudit.getRecentHistory (L83-85)
 *   - GET /public cache-hit branch (L111-117) and cache-miss → settingsMap path
 *   - PUT /pricing — each conditional update branch (standard/promoted/candidate/payment)
 *   - POST /:id/reset happy path (L323) — touches ConfigurationAudit.logChange
 *   - GET /audit/:id with pagination
 *   - GET /audit with ?category= (calls getCategoryHistory) and ?action=
 *   - GET /system-health twice — second call hits the stale-recheck branch (L456)
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
import SystemHealth from '../../src/models/SystemHealth.js';
import { cacheDelete } from '../../src/config/redis.js';

describe('configuration.js — branch coverage push', () => {
  beforeAll(async () => {
    await connectTestDB();
    await seedLocations();
  });

  afterEach(async () => {
    await clearTestDB();
    await seedLocations();
    await cacheDelete('config:public').catch(() => {});
  });

  afterAll(async () => {
    await closeTestDB();
  });

  it('GET /?category= filters via getByCategory (L67-68)', async () => {
    const { user: admin } = await createAdmin();
    await SystemConfiguration.create({
      category: 'payment', key: 'k_a', value: 1, dataType: 'number',
      description: 'd', lastModifiedBy: admin._id,
    });
    await SystemConfiguration.create({
      category: 'platform', key: 'k_b', value: 'x', dataType: 'string',
      description: 'd', lastModifiedBy: admin._id,
    });

    const r = await request(app)
      .get('/api/configuration?category=payment')
      .set(createAuthHeaders(admin));

    expect(r.status).toBe(200);
    const cats = Object.keys(r.body.data.settings);
    expect(cats).toContain('payment');
    expect(cats).not.toContain('platform');
  });

  it('GET /?includeAudit=true populates auditHistory (L83-85)', async () => {
    const { user: admin } = await createAdmin();
    const cfg = await SystemConfiguration.create({
      category: 'platform', key: 'audit_k', value: 'v', dataType: 'string',
      description: 'd', lastModifiedBy: admin._id,
    });
    // Seed an audit row so getRecentHistory returns a non-empty array
    await ConfigurationAudit.logChange(
      cfg._id, cfg.key, 'updated', 'old', 'new', admin._id, cfg.category,
      { reason: 'seed', ipAddress: '127.0.0.1', userAgent: 'test' }
    );

    const r = await request(app)
      .get('/api/configuration?includeAudit=true')
      .set(createAuthHeaders(admin));

    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.data.auditHistory)).toBe(true);
    expect(r.body.data.auditHistory.length).toBeGreaterThanOrEqual(1);
  });

  it('GET /?includeAudit=false skips auditHistory (default branch)', async () => {
    const { user: admin } = await createAdmin();
    const r = await request(app)
      .get('/api/configuration')
      .set(createAuthHeaders(admin));
    expect(r.status).toBe(200);
    expect(r.body.data.auditHistory).toBeNull();
  });

  it('GET /public — cache miss → DB query → settingsMap shape (L119-133)', async () => {
    // Seed at least one public-flagged setting
    const { user: admin } = await createAdmin();
    await SystemConfiguration.create({
      category: 'platform', key: 'public_setting', value: 'visible',
      dataType: 'string', description: 'd', isPublic: true,
      lastModifiedBy: admin._id,
    });

    const r = await request(app).get('/api/configuration/public');
    expect(r.status).toBe(200);
    expect(r.body.data.settings).toBeDefined();
    expect(r.body.data.settings.public_setting).toBe('visible');
  });

  it('GET /public twice — second call hits Redis cache branch (L112-117)', async () => {
    const { user: admin } = await createAdmin();
    await SystemConfiguration.create({
      category: 'platform', key: 'cached_pub', value: 'first',
      dataType: 'string', description: 'd', isPublic: true,
      lastModifiedBy: admin._id,
    });

    const first = await request(app).get('/api/configuration/public');
    expect(first.status).toBe(200);

    // Second call: cacheGet returns the previously cached settingsMap
    const second = await request(app).get('/api/configuration/public');
    expect(second.status).toBe(200);
    expect(second.body.data.settings.cached_pub).toBe('first');
  });

  it('PUT /pricing updates standardPosting + promotedPosting (L195-209)', async () => {
    const { user: admin } = await createAdmin();
    // Initialize defaults so the pricing settings exist
    await request(app)
      .post('/api/configuration/initialize-defaults')
      .set(createAuthHeaders(admin));

    const r = await request(app)
      .put('/api/configuration/pricing')
      .set(createAuthHeaders(admin))
      .send({ standardPosting: 35, promotedPosting: 60 });

    expect(r.status).toBe(200);
    expect(r.body.data.updatedKeys).toEqual(
      expect.arrayContaining(['pricing_standard_posting', 'pricing_promoted_posting'])
    );
    const std = await SystemConfiguration.findOne({ key: 'pricing_standard_posting' });
    expect(std.value).toBe(35);
  });

  it('PUT /pricing updates candidateViewing + paymentEnabled (L211-225)', async () => {
    const { user: admin } = await createAdmin();
    await request(app)
      .post('/api/configuration/initialize-defaults')
      .set(createAuthHeaders(admin));

    const r = await request(app)
      .put('/api/configuration/pricing')
      .set(createAuthHeaders(admin))
      .send({ candidateViewing: 25, paymentEnabled: true });

    expect(r.status).toBe(200);
    expect(r.body.data.updatedKeys).toEqual(
      expect.arrayContaining(['pricing_candidate_viewing', 'payment_enabled'])
    );
  });

  it('PUT /pricing with no body returns 200 with 0 updates (no fields touched)', async () => {
    const { user: admin } = await createAdmin();
    const r = await request(app)
      .put('/api/configuration/pricing')
      .set(createAuthHeaders(admin))
      .send({});
    expect(r.status).toBe(200);
    expect(r.body.data.updatedKeys).toEqual([]);
  });

  it('POST /:id/reset happy path resets a setting + writes audit (L307-352)', async () => {
    const { user: admin } = await createAdmin();
    const cfg = await SystemConfiguration.create({
      category: 'platform', key: 'reset_target',
      value: 'modified', defaultValue: 'default',
      dataType: 'string', description: 'd', lastModifiedBy: admin._id,
    });

    const auditBefore = await ConfigurationAudit.countDocuments({});

    const r = await request(app)
      .post(`/api/configuration/${cfg._id}/reset`)
      .set(createAuthHeaders(admin))
      .send({ reason: 'test reset' });

    expect(r.status).toBe(200);
    const refreshed = await SystemConfiguration.findById(cfg._id);
    expect(refreshed.value).toBe('default');

    const auditAfter = await ConfigurationAudit.countDocuments({});
    expect(auditAfter).toBe(auditBefore + 1);
  });

  it('GET /audit/:id with pagination params returns history (L367-405)', async () => {
    const { user: admin } = await createAdmin();
    const cfg = await SystemConfiguration.create({
      category: 'platform', key: 'audited_k', value: 'v', dataType: 'string',
      description: 'd', lastModifiedBy: admin._id,
    });
    // Seed 3 audit rows
    for (const v of ['v1', 'v2', 'v3']) {
      await ConfigurationAudit.logChange(
        cfg._id, cfg.key, 'updated', 'old', v, admin._id, cfg.category,
        { reason: 't', ipAddress: '1.1.1.1', userAgent: 'a' }
      );
    }

    const r = await request(app)
      .get(`/api/configuration/audit/${cfg._id}?page=1&limit=2`)
      .set(createAuthHeaders(admin));

    expect(r.status).toBe(200);
    expect(r.body.data.pagination.itemsPerPage).toBe(2);
    expect(r.body.data.pagination.totalItems).toBeGreaterThanOrEqual(3);
    expect(Array.isArray(r.body.data.auditHistory)).toBe(true);
  });

  it('GET /audit with ?category= calls getCategoryHistory (L418-423)', async () => {
    const { user: admin } = await createAdmin();
    const cfg = await SystemConfiguration.create({
      category: 'platform', key: 'cat_audit', value: 'v', dataType: 'string',
      description: 'd', lastModifiedBy: admin._id,
    });
    // Note: ConfigurationAudit category enum excludes 'payment' (only platform/users/content/email/system/features)
    await ConfigurationAudit.logChange(
      cfg._id, cfg.key, 'updated', 'a', 'b', admin._id, 'platform',
      { reason: 'r', ipAddress: '1.1.1.1', userAgent: 'a' }
    );

    const r = await request(app)
      .get('/api/configuration/audit?category=platform&action=updated')
      .set(createAuthHeaders(admin));

    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.data.auditHistory)).toBe(true);
    expect(r.body.data.auditHistory.length).toBeGreaterThanOrEqual(1);
  });

  it('GET /audit with ?days= and no category calls getRecentHistory (L425-430)', async () => {
    const { user: admin } = await createAdmin();
    const r = await request(app)
      .get('/api/configuration/audit?days=14&page=1&limit=5')
      .set(createAuthHeaders(admin));
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.data.auditHistory)).toBe(true);
  });

  it('GET /system-health uses fresh latestHealth on second call (L456 false branch)', async () => {
    const { user: admin } = await createAdmin();
    // First call creates a health check (no prior record)
    const first = await request(app)
      .get('/api/configuration/system-health')
      .set(createAuthHeaders(admin));
    expect(first.status).toBe(200);
    const firstId = first.body.data.currentHealth._id;

    // Second call within 5 minutes → reuses latestHealth (skip createHealthCheck)
    const second = await request(app)
      .get('/api/configuration/system-health')
      .set(createAuthHeaders(admin));
    expect(second.status).toBe(200);
    expect(second.body.data.currentHealth._id).toBe(firstId);
  });

  it('GET /system-health creates fresh check when latest is stale (L456 true branch)', async () => {
    const { user: admin } = await createAdmin();
    // Manually create a stale health record (>5 min ago)
    await SystemHealth.create({
      timestamp: new Date(Date.now() - 10 * 60 * 1000),
      overallStatus: 'healthy',
      services: {
        database: { status: 'healthy', responseTime: 10 },
        redis: { status: 'unknown', responseTime: 0 },
        email: { status: 'healthy', responseTime: 50 },
        sms: { status: 'unknown', responseTime: 0 },
        fileStorage: { status: 'healthy', responseTime: 5 },
      },
      systemMetrics: { uptime: 100, memoryUsage: { used: 10, free: 90, percentage: 10 } },
      databaseStats: { totalUsers: 0, totalJobs: 0, totalApplications: 0 },
    });

    const r = await request(app)
      .get('/api/configuration/system-health')
      .set(createAuthHeaders(admin));
    expect(r.status).toBe(200);
    // The new health check should be more recent than the stale one
    expect(new Date(r.body.data.currentHealth.timestamp).getTime())
      .toBeGreaterThan(Date.now() - 5 * 60 * 1000);
  });
});
