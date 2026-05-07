/**
 * Phase 28 — coverage push for quickusers.js POST /unsubscribe
 * query-param token branch (L355: req.body?.token || req.query?.token).
 * Existing tests only exercise body-token; this hits the query-token path
 * used by some email clients.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import QuickUser from '../../src/models/QuickUser.js';

describe('quickusers.js — POST /unsubscribe ?token query branch', () => {
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

  it('accepts token via query string when no body provided (L355)', async () => {
    const qu = await QuickUser.create({
      firstName: 'Q', lastName: 'T',
      email: 'qutok@example.com',
      location: 'Tiranë',
      interests: ['Marketing'],
      isActive: true,
    });

    const r = await request(app)
      .post(`/api/quickusers/unsubscribe?token=${qu.unsubscribeToken}`);
    expect(r.status).toBe(200);
    const after = await QuickUser.findById(qu._id);
    expect(after.isActive).toBe(false);
  });

  it('body token wins over query token if both present', async () => {
    const qu = await QuickUser.create({
      firstName: 'Q2', lastName: 'T2',
      email: 'qutok2@example.com',
      location: 'Tiranë',
      interests: ['Marketing'],
      isActive: true,
    });

    const r = await request(app)
      .post(`/api/quickusers/unsubscribe?token=garbage`)
      .send({ token: qu.unsubscribeToken });
    // body wins → unsubscribe succeeds
    expect(r.status).toBe(200);
    const after = await QuickUser.findById(qu._id);
    expect(after.isActive).toBe(false);
  });
});
