/**
 * Phase 28 — coverage push for routes/quickusers.js outer 500 catch
 * blocks and validation paths.
 *
 * Targets:
 *   - L342-343 POST / outer catch (QuickUser.findOne throws)
 *   - L390-391 POST /unsubscribe outer catch
 *   - L405-410 POST /track-click 400 when token missing
 *   - L415-420 POST /track-click 404 when user missing
 *   - L431-432 POST /track-click outer catch
 *   - L462-463 GET /analytics/overview outer catch
 *   - L477-482 POST /find-matches 400 when job missing
 *   - L502-508 POST /find-matches outer catch
 *   - L520-525 GET /:id 404 when not found
 *   - L548-549 GET /:id outer catch
 *   - L564-569 PUT /:id/preferences 401 when token missing
 *   - L571-576 PUT /:id/preferences 400 when preferences missing
 *   - L580-585 PUT /:id/preferences 404 when user missing or token mismatch
 *   - L615-616 PUT /:id/preferences outer catch
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, jest } from '@jest/globals';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createAdmin } from '../factories/user.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import QuickUser from '../../src/models/QuickUser.js';

async function seedQuickUser() {
  return await QuickUser.create({
    email: `qu-${Date.now()}@example.com`,
    firstName: 'Q',
    lastName: 'L',
    location: 'Tiranë',
    preferences: {},
  });
}

describe('quickusers.js — outer catch + validation paths', () => {
  beforeAll(async () => { await connectTestDB(); await seedLocations(); });
  afterEach(async () => {
    jest.restoreAllMocks();
    await clearTestDB();
    await seedLocations();
  });
  afterAll(async () => { await closeTestDB(); });

  it('POST /track-click returns 400 when token missing (L405-410)', async () => {
    const r = await request(app)
      .post('/api/quickusers/track-click')
      .send({});
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/Token është i detyrueshëm/);
  });

  it('POST /track-click returns 404 when user not found (L415-420)', async () => {
    const r = await request(app)
      .post('/api/quickusers/track-click')
      .send({ token: 'nonexistent-token' });
    expect(r.status).toBe(404);
    expect(r.body.message).toMatch(/Përdoruesi nuk u gjet/);
  });

  it('POST /track-click returns 500 when QuickUser.findOne throws (L431-432)', async () => {
    jest.spyOn(QuickUser, 'findOne').mockImplementationOnce(() => {
      throw new Error('findOne fail');
    });
    const r = await request(app)
      .post('/api/quickusers/track-click')
      .send({ token: 'whatever' });
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/regjistrimin e click/);
  });

  it('POST /track-click happy path increments emailClickCount', async () => {
    const qu = await seedQuickUser();
    const r = await request(app)
      .post('/api/quickusers/track-click')
      .send({ token: qu.unsubscribeToken });
    expect(r.status).toBe(200);
    const reloaded = await QuickUser.findById(qu._id);
    expect(reloaded.emailClickCount).toBeGreaterThan(0);
  });

  it('GET /analytics/overview returns 500 when QuickUser.getAnalytics throws (L462-463)', async () => {
    const { user: admin } = await createAdmin();
    jest.spyOn(QuickUser, 'getAnalytics').mockRejectedValueOnce(new Error('analytics fail'));
    const r = await request(app)
      .get('/api/quickusers/analytics/overview')
      .set(createAuthHeaders(admin));
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/marrjen e analizave/);
  });

  it('GET /analytics/overview returns default zero shape when no data', async () => {
    const { user: admin } = await createAdmin();
    const r = await request(app)
      .get('/api/quickusers/analytics/overview')
      .set(createAuthHeaders(admin));
    expect(r.status).toBe(200);
    expect(r.body.data.totalUsers).toBe(0);
    expect(r.body.data.activeUsers).toBe(0);
  });

  it('POST /find-matches returns 400 when job missing (L477-482)', async () => {
    const { user: admin } = await createAdmin();
    const r = await request(app)
      .post('/api/quickusers/find-matches')
      .set(createAuthHeaders(admin))
      .send({});
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/punës janë të detyrueshme/);
  });

  it('POST /find-matches returns 500 when findMatchesForJob throws (L502-508)', async () => {
    const { user: admin } = await createAdmin();
    jest.spyOn(QuickUser, 'findMatchesForJob').mockRejectedValueOnce(new Error('matches fail'));
    const r = await request(app)
      .post('/api/quickusers/find-matches')
      .set(createAuthHeaders(admin))
      .send({ job: { title: 'Test', category: 'IT', location: { city: 'Tiranë' } } });
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/gjetjen e përputhjes/);
  });

  it('GET /:id returns 404 when quick user not found (L520-525)', async () => {
    const { user: admin } = await createAdmin();
    const id = new mongoose.Types.ObjectId().toString();
    const r = await request(app)
      .get(`/api/quickusers/${id}`)
      .set(createAuthHeaders(admin));
    expect(r.status).toBe(404);
  });

  it('GET /:id returns 500 when QuickUser.findById throws (L548-549)', async () => {
    const { user: admin } = await createAdmin();
    jest.spyOn(QuickUser, 'findById').mockImplementationOnce(() => {
      throw new Error('findById fail');
    });
    const id = new mongoose.Types.ObjectId().toString();
    const r = await request(app)
      .get(`/api/quickusers/${id}`)
      .set(createAuthHeaders(admin));
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/të dhënave të përdoruesit/);
  });

  it('PUT /:id/preferences returns 401 when token missing (L564-569)', async () => {
    const id = new mongoose.Types.ObjectId().toString();
    const r = await request(app)
      .put(`/api/quickusers/${id}/preferences`)
      .send({ preferences: { emailFrequency: 'daily' } });
    expect(r.status).toBe(401);
    expect(r.body.message).toMatch(/Token i verifikimit/);
  });

  it('PUT /:id/preferences returns 400 when preferences missing (L571-576)', async () => {
    const id = new mongoose.Types.ObjectId().toString();
    const r = await request(app)
      .put(`/api/quickusers/${id}/preferences`)
      .send({ token: 'sometoken' });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/Preferencat janë të detyrueshme/);
  });

  it('PUT /:id/preferences returns 404 when user missing or token mismatch (L580-585)', async () => {
    const id = new mongoose.Types.ObjectId().toString();
    const r = await request(app)
      .put(`/api/quickusers/${id}/preferences`)
      .send({ token: 'wrong-token', preferences: { emailFrequency: 'daily' } });
    expect(r.status).toBe(404);
    expect(r.body.message).toMatch(/token i pavlefshëm/);
  });

  it('PUT /:id/preferences returns 500 when QuickUser.findById throws (L615-616)', async () => {
    jest.spyOn(QuickUser, 'findById').mockImplementationOnce(() => {
      throw new Error('preferences findById fail');
    });
    const id = new mongoose.Types.ObjectId().toString();
    const r = await request(app)
      .put(`/api/quickusers/${id}/preferences`)
      .send({ token: 'sometoken', preferences: { emailFrequency: 'daily' } });
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/përditësimin e preferencave/);
  });
});
