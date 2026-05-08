/**
 * Phase 28 — coverage push for routes/configuration.js error/catch paths.
 *
 * Targets every catch block not already exercised by happy-path tests:
 *   - L96-97   GET /              (find throws)
 *   - L136-137 GET /public        (getPublicSettings throws)
 *   - L179-180 GET /pricing       (getSettingValue throws)
 *   - L236-237 PUT /pricing       (getSetting throws)
 *   - L295-296 PUT /:id           (updateValue throws — typically validation)
 *   - L355-356 POST /:id/reset    (resetToDefault throws)
 *   - L398-399 GET /audit/:id     (getConfigurationHistory throws)
 *   - L438-439 GET /audit         (getRecentHistory throws)
 *   - L472-473 GET /system-health (getLatestHealth throws)
 *   - L495-496 POST /initialize-defaults (createDefaultSettings throws)
 *   - L548-549 POST /maintenance-mode    (getSetting throws)
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, jest } from '@jest/globals';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createAdmin } from '../factories/user.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import { SystemConfiguration, ConfigurationAudit, SystemHealth } from '../../src/models/index.js';

describe('configuration.js — error/catch paths', () => {
  beforeAll(async () => { await connectTestDB(); await seedLocations(); });
  afterEach(async () => {
    jest.restoreAllMocks();
    await clearTestDB();
    await seedLocations();
  });
  afterAll(async () => { await closeTestDB(); });

  it('GET / returns 500 when SystemConfiguration.find throws (L96-97)', async () => {
    const { user: admin } = await createAdmin();
    jest.spyOn(SystemConfiguration, 'find').mockImplementationOnce(() => {
      throw new Error('find blew up');
    });
    const r = await request(app)
      .get('/api/configuration')
      .set(createAuthHeaders(admin));
    expect(r.status).toBe(500);
    expect(r.body.success).toBe(false);
    expect(r.body.message).toMatch(/ngarkimin e konfigurimit/);
  });

  it('GET /public returns 500 when getPublicSettings throws (L136-137)', async () => {
    jest.spyOn(SystemConfiguration, 'getPublicSettings').mockRejectedValueOnce(new Error('oops'));
    const r = await request(app).get('/api/configuration/public');
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/rregullimeve publike/);
  });

  it('GET /pricing returns 500 when getSettingValue throws (L179-180)', async () => {
    const { user: admin } = await createAdmin();
    jest.spyOn(SystemConfiguration, 'getSettingValue').mockRejectedValueOnce(new Error('pricing fetch failed'));
    const r = await request(app)
      .get('/api/configuration/pricing')
      .set(createAuthHeaders(admin));
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/ngarkimin e çmimeve/);
  });

  it('PUT /pricing returns 400 when getSetting throws (L236-237)', async () => {
    const { user: admin } = await createAdmin();
    jest.spyOn(SystemConfiguration, 'getSetting').mockRejectedValueOnce(new Error('pricing-update failed'));
    const r = await request(app)
      .put('/api/configuration/pricing')
      .set(createAuthHeaders(admin))
      .send({ standardPosting: 99 });
    expect(r.status).toBe(400);
    expect(r.body.success).toBe(false);
    expect(r.body.message).toMatch(/pricing-update failed/);
  });

  it('PUT /:id returns 400 when updateValue throws — e.g. validation error (L295-296)', async () => {
    const { user: admin } = await createAdmin();
    // Create a real setting then mock its updateValue to throw
    const setting = await SystemConfiguration.create({
      key: 'test_validation_setting',
      value: 5,
      defaultValue: 5,
      dataType: 'number',
      category: 'platform',
      description: 'test',
      isPublic: false,
      lastModifiedBy: admin._id,
    });
    jest.spyOn(SystemConfiguration.prototype, 'updateValue').mockRejectedValueOnce(new Error('Vlera nuk është valide'));
    const r = await request(app)
      .put(`/api/configuration/${setting._id}`)
      .set(createAuthHeaders(admin))
      .send({ value: 999, reason: 'test' });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/Vlera nuk është valide/);
  });

  it('POST /:id/reset returns 400 when resetToDefault throws (L355-356)', async () => {
    const { user: admin } = await createAdmin();
    const setting = await SystemConfiguration.create({
      key: 'test_reset_setting',
      value: 10,
      defaultValue: 5,
      dataType: 'number',
      category: 'platform',
      description: 'test',
      isPublic: false,
      lastModifiedBy: admin._id,
    });
    jest.spyOn(SystemConfiguration.prototype, 'resetToDefault').mockRejectedValueOnce(new Error('reset failed'));
    const r = await request(app)
      .post(`/api/configuration/${setting._id}/reset`)
      .set(createAuthHeaders(admin))
      .send({ reason: 'test' });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/reset failed/);
  });

  it('GET /audit/:id returns 500 when getConfigurationHistory throws (L398-399)', async () => {
    const { user: admin } = await createAdmin();
    jest.spyOn(ConfigurationAudit, 'getConfigurationHistory').mockRejectedValueOnce(new Error('audit fetch failed'));
    const validId = new mongoose.Types.ObjectId().toString();
    const r = await request(app)
      .get(`/api/configuration/audit/${validId}`)
      .set(createAuthHeaders(admin));
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/ndryshimeve/);
  });

  it('GET /audit returns 500 when getRecentHistory throws (L438-439)', async () => {
    const { user: admin } = await createAdmin();
    jest.spyOn(ConfigurationAudit, 'getRecentHistory').mockRejectedValueOnce(new Error('recent audit failed'));
    const r = await request(app)
      .get('/api/configuration/audit')
      .set(createAuthHeaders(admin));
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/ndryshimeve/);
  });

  it('GET /system-health returns 500 when getLatestHealth throws (L472-473)', async () => {
    const { user: admin } = await createAdmin();
    jest.spyOn(SystemHealth, 'getLatestHealth').mockRejectedValueOnce(new Error('health fetch failed'));
    const r = await request(app)
      .get('/api/configuration/system-health')
      .set(createAuthHeaders(admin));
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/statusit të sistemit/);
  });

  it('POST /initialize-defaults returns 500 when createDefaultSettings throws (L495-496)', async () => {
    const { user: admin } = await createAdmin();
    jest.spyOn(SystemConfiguration, 'createDefaultSettings').mockRejectedValueOnce(new Error('init failed'));
    const r = await request(app)
      .post('/api/configuration/initialize-defaults')
      .set(createAuthHeaders(admin));
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/rregullimeve të paracaktuara/);
  });

  it('POST /maintenance-mode returns 500 when getSetting throws (L548-549)', async () => {
    const { user: admin } = await createAdmin();
    jest.spyOn(SystemConfiguration, 'getSetting').mockRejectedValueOnce(new Error('maint setting failed'));
    const r = await request(app)
      .post('/api/configuration/maintenance-mode')
      .set(createAuthHeaders(admin))
      .send({ enabled: true, reason: 'test' });
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/modalitetit të mirëmbajtjes/);
  });

  it('POST /maintenance-mode returns 404 when maintenance_mode setting does not exist (L513-516)', async () => {
    const { user: admin } = await createAdmin();
    jest.spyOn(SystemConfiguration, 'getSetting').mockResolvedValueOnce(null);
    const r = await request(app)
      .post('/api/configuration/maintenance-mode')
      .set(createAuthHeaders(admin))
      .send({ enabled: true });
    expect(r.status).toBe(404);
    expect(r.body.message).toMatch(/Rregullimi i mirëmbajtjes nuk u gjet/);
  });
});
