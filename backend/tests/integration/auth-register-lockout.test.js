/**
 * Phase 28 — coverage push for auth.js POST /register 5-tentativa lockout.
 *
 * After 5 wrong code attempts, the route deletes the pending registration
 * and returns "Shumë tentativa të gabuara. Ju lutemi filloni regjistrimin
 * përsëri." (L404-409). Existing tests only verify a single wrong code
 * decrements attempts.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, jest } from '@jest/globals';
import crypto from 'crypto';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';

const KNOWN_CODE = '424242';

describe('auth.js — POST /register 5-attempt lockout', () => {
  let randomIntSpy;

  beforeAll(async () => {
    await connectTestDB();
    await seedLocations();
  });

  afterEach(async () => {
    if (randomIntSpy) {
      randomIntSpy.mockRestore();
      randomIntSpy = null;
    }
    await clearTestDB();
    await seedLocations();
  });

  afterAll(async () => {
    await closeTestDB();
  });

  function pin() {
    randomIntSpy = jest.spyOn(crypto, 'randomInt').mockReturnValue(parseInt(KNOWN_CODE, 10));
  }

  it('5 wrong attempts deletes pending + returns lockout message (L404-409)', async () => {
    pin();
    const email = 'lockout@example.com';

    const init = await request(app)
      .post('/api/auth/initiate-registration')
      .send({
        email, password: 'StrongPass1', userType: 'jobseeker',
        firstName: 'Lock', lastName: 'Out', city: 'Tiranë',
      });
    expect(init.status).toBe(200);

    // Submit 4 wrong codes — each should decrement and return "tentativa"
    for (let i = 0; i < 4; i++) {
      const r = await request(app)
        .post('/api/auth/register')
        .send({ email, verificationCode: '111111' });
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/tentativa/i);
    }

    // 5th wrong attempt → triggers lockout (deletes pending)
    const final = await request(app)
      .post('/api/auth/register')
      .send({ email, verificationCode: '111111' });
    expect(final.status).toBe(400);
    expect(final.body.message).toMatch(/Shumë tentativa|filloni regjistrimin/i);

    // After lockout, even the correct code is rejected (pending was deleted)
    const afterLockout = await request(app)
      .post('/api/auth/register')
      .send({ email, verificationCode: KNOWN_CODE });
    expect(afterLockout.status).toBe(400);
    expect(afterLockout.body.message).toMatch(/skaduar|filloni/i);
  });

  it('register without email or verificationCode → 400 (L382-387)', async () => {
    const r1 = await request(app)
      .post('/api/auth/register')
      .send({ verificationCode: '123456' }); // missing email
    expect(r1.status).toBe(400);
    expect(r1.body.message).toMatch(/Email/);

    const r2 = await request(app)
      .post('/api/auth/register')
      .send({ email: 'x@y.z' }); // missing code
    expect(r2.status).toBe(400);
    expect(r2.body.message).toMatch(/kodi/i);
  });
});
