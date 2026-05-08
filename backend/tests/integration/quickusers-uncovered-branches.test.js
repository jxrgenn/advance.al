/**
 * Phase 28 — coverage push for routes/quickusers.js untested branches:
 *   - POST /unsubscribe — already-inactive idempotent branch (L374-379)
 *   - POST /unsubscribe — token from ?token= query param vs body (L355)
 *   - POST /find-matches — missing job in body returns 400 (L477-482)
 *   - POST /find-matches — happy path with seeded job
 *   - GET /analytics/overview with startDate + endDate params
 *   - POST / (signup) — phone field branch (L262-264)
 *   - PUT /:id/preferences — preferences=undefined returns 400 (L571-575)
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createAdmin } from '../factories/user.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import QuickUser from '../../src/models/QuickUser.js';

describe('quickusers.js — uncovered branches', () => {
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

  it('POST /unsubscribe is idempotent for already-inactive user (L374-379)', async () => {
    const qu = await QuickUser.create({
      firstName: 'X', lastName: 'Y',
      email: 'idempotent@example.com', location: 'Tiranë', interests: ['Marketing'],
      isActive: false,
    });

    const r = await request(app)
      .post('/api/quickusers/unsubscribe')
      .send({ token: qu.unsubscribeToken });
    expect(r.status).toBe(200);
    expect(r.body.message).toMatch(/tashmë i çregjistruar/i);
  });

  it('POST /unsubscribe accepts token from ?token= query param (L355)', async () => {
    const qu = await QuickUser.create({
      firstName: 'Q', lastName: 'P',
      email: 'queryparam@example.com', location: 'Tiranë', interests: ['Marketing'],
    });

    const r = await request(app)
      .post(`/api/quickusers/unsubscribe?token=${qu.unsubscribeToken}`);
    expect(r.status).toBe(200);
    const after = await QuickUser.findById(qu._id);
    expect(after.isActive).toBe(false);
  });

  it('POST /find-matches returns 400 when job is missing from body (L477-482)', async () => {
    const { user: admin } = await createAdmin();
    const r = await request(app)
      .post('/api/quickusers/find-matches')
      .set(createAuthHeaders(admin))
      .send({});
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/punës janë të detyrueshme/i);
  });

  it('POST /find-matches returns matches array on happy path (L484-499)', async () => {
    const { user: admin } = await createAdmin();
    await QuickUser.create({
      firstName: 'M', lastName: 'A',
      email: 'matchy@example.com', location: 'Tiranë', interests: ['Teknologji'],
    });

    const r = await request(app)
      .post('/api/quickusers/find-matches')
      .set(createAuthHeaders(admin))
      .send({
        job: {
          title: 'Software Engineer',
          location: 'Tiranë',
          category: 'Teknologji',
        },
      });

    expect(r.status).toBe(200);
    expect(typeof r.body.data.totalMatches).toBe('number');
    expect(Array.isArray(r.body.data.matches)).toBe(true);
  });

  it('GET /analytics/overview accepts startDate + endDate query params (L444)', async () => {
    const { user: admin } = await createAdmin();
    await QuickUser.create({
      firstName: 'A', lastName: 'B',
      email: 'analytics@example.com', location: 'Tiranë', interests: ['Marketing'],
    });

    const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const end = new Date().toISOString();
    const r = await request(app)
      .get(`/api/quickusers/analytics/overview?startDate=${start}&endDate=${end}`)
      .set(createAuthHeaders(admin));

    expect(r.status).toBe(200);
    expect(r.body.data).toBeDefined();
    expect(typeof r.body.data.totalUsers).toBe('number');
  });

  it('PUT /:id/preferences returns 400 when preferences body field missing (L571-575)', async () => {
    const qu = await QuickUser.create({
      firstName: 'P', lastName: 'Q',
      email: 'no-prefs@example.com', location: 'Tiranë', interests: ['Teknologji'],
    });

    const r = await request(app)
      .put(`/api/quickusers/${qu._id}/preferences`)
      .send({ token: qu.unsubscribeToken });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/Preferencat janë të detyrueshme/i);
  });

  it('POST / signup persists phone field when provided (L262-264)', async () => {
    const r = await request(app)
      .post('/api/quickusers')
      .send({
        firstName: 'Phone',
        lastName: 'Owner',
        email: 'phoneowner@example.com',
        phone: '+355691234567',
        location: 'Tiranë',
        interests: ['Marketing'],
      });

    expect(r.status).toBe(201);
    const created = await QuickUser.findOne({ email: 'phoneowner@example.com' });
    expect(created.phone).toBe('+355691234567');
  });

  it('GET /:id returns 404 for non-existent quickuser (L520-524)', async () => {
    const { user: admin } = await createAdmin();
    const r = await request(app)
      .get('/api/quickusers/507f1f77bcf86cd799439099')
      .set(createAuthHeaders(admin));
    expect(r.status).toBe(404);
  });
});
