/**
 * Phase 28 — coverage push for verification.js success paths.
 *
 * Existing verification.test.js only exercises rejection paths. This file
 * walks the happy flow:
 *   request → verify with correct code → validate-token success
 *
 * Plus untested edges:
 *   - SMS phone format validation (L242-249)
 *   - timing-safe comparison success branch (L367)
 *   - validate-token success path (L457-465)
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, jest } from '@jest/globals';
import crypto from 'crypto';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';

const KNOWN_CODE = '424242';

describe('verification.js — success flow', () => {
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
    randomIntSpy = jest.spyOn(crypto, 'randomInt').mockImplementation(() => parseInt(KNOWN_CODE, 10));
  }

  it('full success flow: request → verify → validate-token', async () => {
    pin();
    const email = 'success@example.com';

    // Step 1: request
    const r1 = await request(app)
      .post('/api/verification/request')
      .send({ identifier: email, method: 'email', userType: 'jobseeker' });
    expect(r1.status).toBe(200);

    // Step 2: verify with the known code (timing-safe comparison branch L366-374)
    const r2 = await request(app)
      .post('/api/verification/verify')
      .send({ identifier: email, method: 'email', code: KNOWN_CODE });
    expect(r2.status).toBe(200);
    expect(r2.body.data.verified).toBe(true);
    expect(r2.body.data.verificationToken).toMatch(/^[0-9a-f]{64}$/);

    const token = r2.body.data.verificationToken;

    // Step 3: validate-token (covers L457-465 success path)
    const r3 = await request(app)
      .post('/api/verification/validate-token')
      .send({ verificationToken: token });
    expect(r3.status).toBe(200);
    expect(r3.body.data.identifier).toBe(email);
    expect(r3.body.data.method).toBe('email');
    expect(r3.body.data.verified).toBe(true);
  }, 30000);

  it('verify clears the stored code so a re-verify with same code → 400', async () => {
    pin();
    const email = 'reverify@example.com';

    await request(app)
      .post('/api/verification/request')
      .send({ identifier: email, method: 'email', userType: 'jobseeker' });

    const r1 = await request(app)
      .post('/api/verification/verify')
      .send({ identifier: email, method: 'email', code: KNOWN_CODE });
    expect(r1.status).toBe(200);

    // Same code — but the stored code was deleted on success
    const r2 = await request(app)
      .post('/api/verification/verify')
      .send({ identifier: email, method: 'email', code: KNOWN_CODE });
    expect(r2.status).toBe(400);
    expect(r2.body.message).toMatch(/nuk u gjet|skaduar/i);
  }, 30000);

  describe('SMS validation (L242-249)', () => {
    it('rejects malformed Albanian phone (must match +355XXXXXXXX)', async () => {
      const r = await request(app)
        .post('/api/verification/request')
        .send({ identifier: '+1234567890', method: 'sms', userType: 'jobseeker' });
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/\+355/);
    });

    it('accepts valid +355 phone format', async () => {
      const r = await request(app)
        .post('/api/verification/request')
        .send({ identifier: '+355681234567', method: 'sms', userType: 'jobseeker' });
      expect(r.status).toBe(200);
      expect(r.body.data.method).toBe('sms');
    });
  });

  describe('validate-token edge', () => {
    it('rejects after token issued but with malformed token string', async () => {
      const r = await request(app)
        .post('/api/verification/validate-token')
        .send({ verificationToken: 'not-a-real-token' });
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/nuk u gjet|skaduar/i);
    });
  });
});
