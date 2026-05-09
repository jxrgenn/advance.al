/**
 * Phase 28 — coverage push for routes/quickusers.js
 *   - L341-347 POST / outer catch (QuickUser save throws)
 *   - L389-395 POST /unsubscribe outer catch (QuickUser.findOne throws)
 *
 * Both branches surface a generic Albanian 500 to the client and log the
 * underlying error server-side. The error message must NOT leak the original
 * exception string (defense against information disclosure).
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, jest } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import QuickUser from '../../src/models/QuickUser.js';

describe('quickusers.js — create + unsubscribe outer 500 catches', () => {
  beforeAll(async () => { await connectTestDB(); await seedLocations(); });
  afterEach(async () => {
    jest.restoreAllMocks();
    await clearTestDB();
    await seedLocations();
  });
  afterAll(async () => { await closeTestDB(); });

  it('POST / returns 500 when QuickUser.findOne throws (L341-347)', async () => {
    jest.spyOn(QuickUser, 'findOne').mockImplementationOnce(() => {
      throw new Error('mongo down — atlas blip');
    });

    const r = await request(app)
      .post('/api/quickusers')
      .send({
        firstName: 'Out',
        lastName: 'Catch',
        email: 'outcatch@example.com',
        location: 'Tiranë',
        interests: ['Teknologji'],
      });

    expect(r.status).toBe(500);
    expect(r.body.success).toBe(false);
    expect(r.body.message).toMatch(/Gabim në regjistrimin për njoftimet/);
    expect(r.body.message).not.toMatch(/atlas blip|mongo down/);
  });

  it('POST /unsubscribe returns 500 when QuickUser.findOne throws (L389-395)', async () => {
    jest.spyOn(QuickUser, 'findOne').mockImplementationOnce(() => {
      throw new Error('unsub findOne fail');
    });

    const r = await request(app)
      .post('/api/quickusers/unsubscribe')
      .send({ token: 'any-token-value' });

    expect(r.status).toBe(500);
    expect(r.body.success).toBe(false);
    expect(r.body.message).toMatch(/Gabim në çregjistrim/);
    expect(r.body.message).not.toMatch(/findOne fail/);
  });
});
