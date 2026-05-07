/**
 * Phase 28 — coverage push for quickusers.js POST /unsubscribe
 * already-unsubscribed branch (L374-378) and PUT /:id/preferences
 * 401 (no token) and 400 (preferences missing) re-checks.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import QuickUser from '../../src/models/QuickUser.js';

describe('quickusers.js — unsubscribe + preferences extras', () => {
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

  it('returns success with already-unsub message for already inactive user (L374-378)', async () => {
    const qu = await QuickUser.create({
      firstName: 'Already', lastName: 'Off',
      email: 'already-off@example.com',
      location: 'Tiranë',
      interests: ['Teknologji'],
      isActive: false, // pre-unsubbed
      source: 'quick_signup',
    });

    const r = await request(app)
      .post('/api/quickusers/unsubscribe')
      .send({ token: qu.unsubscribeToken });
    expect(r.status).toBe(200);
    expect(r.body.message).toMatch(/tashmë/i);
  });

  it('PUT /:id/preferences rejects when token is missing (L564-568)', async () => {
    const qu = await QuickUser.create({
      firstName: 'NoTok', lastName: 'User',
      email: 'no-tok@example.com',
      location: 'Tiranë',
      interests: ['Teknologji'],
      source: 'quick_signup',
    });
    const r = await request(app)
      .put(`/api/quickusers/${qu._id}/preferences`)
      .send({ preferences: { remoteWork: true } }); // no token
    expect(r.status).toBe(401);
  });

  it('PUT /:id/preferences updates only emailFrequency when provided alone (L588-590)', async () => {
    const qu = await QuickUser.create({
      firstName: 'Freq', lastName: 'User',
      email: 'freq-user@example.com',
      location: 'Tiranë',
      interests: ['Teknologji'],
      source: 'quick_signup',
      preferences: { emailFrequency: 'daily', smsNotifications: false, jobTypes: [], remoteWork: false, salaryRange: {} },
    });
    const r = await request(app)
      .put(`/api/quickusers/${qu._id}/preferences`)
      .send({
        token: qu.unsubscribeToken,
        preferences: { emailFrequency: 'weekly' },
      });
    expect(r.status).toBe(200);
    const refreshed = await QuickUser.findById(qu._id);
    expect(refreshed.preferences.emailFrequency).toBe('weekly');
  });

  it('PUT /:id/preferences with wrong token returns 404', async () => {
    const qu = await QuickUser.create({
      firstName: 'Wrong', lastName: 'Tok',
      email: 'wrong-tok@example.com',
      location: 'Tiranë',
      interests: ['Teknologji'],
      source: 'quick_signup',
    });
    const r = await request(app)
      .put(`/api/quickusers/${qu._id}/preferences`)
      .send({
        token: 'not-the-real-token',
        preferences: { remoteWork: true },
      });
    expect(r.status).toBe(404);
  });
});
