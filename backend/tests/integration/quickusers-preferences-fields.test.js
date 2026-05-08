/**
 * Phase 28 — coverage push for routes/quickusers.js PUT /:id/preferences
 * field-update branches not exercised by the existing tests:
 *   - jobTypes update (L591-593)
 *   - remoteWork update (L594-596)
 *   - salaryRange update (L597-602)
 *   - missing preferences body → 400 (L571-575)
 *   - non-existent QuickUser id → 404 (L580-585)
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import QuickUser from '../../src/models/QuickUser.js';

describe('quickusers.js — PUT /:id/preferences field branches', () => {
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

  async function seed() {
    return QuickUser.create({
      firstName: 'P', lastName: 'F',
      email: `pf-${Date.now()}-${Math.random()}@example.com`,
      location: 'Tiranë',
      interests: ['Teknologji'],
      preferences: {
        emailFrequency: 'immediate',
        jobTypes: [],
        remoteWork: false,
        salaryRange: { min: 0, max: 1000 },
      },
    });
  }

  it('updates jobTypes (L591-593)', async () => {
    const qu = await seed();
    const r = await request(app)
      .put(`/api/quickusers/${qu._id}/preferences`)
      .send({
        token: qu.unsubscribeToken,
        preferences: { jobTypes: ['full-time', 'contract'] },
      });
    expect(r.status).toBe(200);
    const refreshed = await QuickUser.findById(qu._id);
    // Mongoose subdoc array — compare with Array.from to drop subdoc internals
    expect(Array.from(refreshed.preferences.jobTypes)).toEqual(['full-time', 'contract']);
  });

  it('updates remoteWork (L594-596)', async () => {
    const qu = await seed();
    const r = await request(app)
      .put(`/api/quickusers/${qu._id}/preferences`)
      .send({
        token: qu.unsubscribeToken,
        preferences: { remoteWork: true },
      });
    expect(r.status).toBe(200);
    const refreshed = await QuickUser.findById(qu._id);
    expect(refreshed.preferences.remoteWork).toBe(true);
  });

  it('merges salaryRange (L597-602)', async () => {
    const qu = await seed();
    const r = await request(app)
      .put(`/api/quickusers/${qu._id}/preferences`)
      .send({
        token: qu.unsubscribeToken,
        preferences: { salaryRange: { min: 500 } }, // partial — only min, max should be preserved
      });
    expect(r.status).toBe(200);
    const refreshed = await QuickUser.findById(qu._id);
    expect(refreshed.preferences.salaryRange.min).toBe(500);
    expect(refreshed.preferences.salaryRange.max).toBe(1000); // preserved from spread
  });

  it('updates all four preference fields together', async () => {
    const qu = await seed();
    const r = await request(app)
      .put(`/api/quickusers/${qu._id}/preferences`)
      .send({
        token: qu.unsubscribeToken,
        preferences: {
          emailFrequency: 'weekly',
          jobTypes: ['part-time'],
          remoteWork: true,
          salaryRange: { min: 100, max: 999 },
        },
      });
    expect(r.status).toBe(200);
    const refreshed = await QuickUser.findById(qu._id);
    expect(refreshed.preferences.emailFrequency).toBe('weekly');
    expect(Array.from(refreshed.preferences.jobTypes)).toEqual(['part-time']);
    expect(refreshed.preferences.remoteWork).toBe(true);
    expect(refreshed.preferences.salaryRange.min).toBe(100);
    expect(refreshed.preferences.salaryRange.max).toBe(999);
  });

  it('returns 400 when token sent but preferences body missing (L571-575)', async () => {
    const qu = await seed();
    const r = await request(app)
      .put(`/api/quickusers/${qu._id}/preferences`)
      .send({ token: qu.unsubscribeToken });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/Preferenc/i);
  });

  it('returns 404 for non-existent QuickUser id', async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const r = await request(app)
      .put(`/api/quickusers/${fakeId}/preferences`)
      .send({ token: 'any-token', preferences: { emailFrequency: 'weekly' } });
    expect(r.status).toBe(404);
  });
});
