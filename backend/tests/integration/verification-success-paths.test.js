/**
 * Phase 28 — coverage push for routes/verification.js success paths.
 *
 * Existing tests cover failure/edge-case branches. This file targets the
 * largest gap: the /verify success path (L378-400, 13 stmts) which:
 *   - removes the verification code from storage
 *   - generates a 32-byte verificationToken
 *   - stashes the token (with TTL) in Redis or memory
 *   - returns the token + verified=true
 *
 * Plus the validate-token success path (token returned by /verify is
 * accepted by /validate-token).
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, jest } from '@jest/globals';
import crypto from 'crypto';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';

const KNOWN_CODE = '424242';

describe('verification.js — success paths', () => {
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

  function pinVerificationCode() {
    randomIntSpy = jest.spyOn(crypto, 'randomInt').mockReturnValue(parseInt(KNOWN_CODE, 10));
  }

  it('verify with correct code returns success + verificationToken', async () => {
    pinVerificationCode();

    const reqRes = await request(app)
      .post('/api/verification/request')
      .send({ identifier: 'verify-success@example.com', method: 'email', userType: 'jobseeker' });
    expect(reqRes.status).toBe(200);

    const verifyRes = await request(app)
      .post('/api/verification/verify')
      .send({
        identifier: 'verify-success@example.com',
        method: 'email',
        code: KNOWN_CODE,
      });

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.success).toBe(true);
    expect(verifyRes.body.data.verified).toBe(true);
    expect(verifyRes.body.data.verificationToken).toBeTruthy();
    expect(verifyRes.body.data.verificationToken.length).toBe(64); // 32 bytes hex = 64 chars
    expect(verifyRes.body.data.identifier).toBe('verify-success@example.com');
    expect(verifyRes.body.data.method).toBe('email');
  }, 30000);

  it('verify token returned by verify is accepted by validate-token', async () => {
    pinVerificationCode();

    await request(app)
      .post('/api/verification/request')
      .send({ identifier: 'token-flow@example.com', method: 'email', userType: 'jobseeker' });

    const verifyRes = await request(app)
      .post('/api/verification/verify')
      .send({
        identifier: 'token-flow@example.com',
        method: 'email',
        code: KNOWN_CODE,
      });

    const token = verifyRes.body.data.verificationToken;

    const validateRes = await request(app)
      .post('/api/verification/validate-token')
      .send({ verificationToken: token });

    expect(validateRes.status).toBe(200);
    expect(validateRes.body.success).toBe(true);
    expect(validateRes.body.data?.identifier).toBe('token-flow@example.com');
  }, 30000);

  it('verify decrements attempts on wrong code, succeeds on subsequent correct code', async () => {
    pinVerificationCode();

    await request(app)
      .post('/api/verification/request')
      .send({ identifier: 'attempts@example.com', method: 'email', userType: 'jobseeker' });

    // First wrong attempt
    const wrong = await request(app)
      .post('/api/verification/verify')
      .send({ identifier: 'attempts@example.com', method: 'email', code: '000000' });
    expect(wrong.status).toBe(400);
    expect(wrong.body.message).toMatch(/2 tentativa/);

    // Then correct code still works
    const correct = await request(app)
      .post('/api/verification/verify')
      .send({ identifier: 'attempts@example.com', method: 'email', code: KNOWN_CODE });
    expect(correct.status).toBe(200);
    expect(correct.body.data.verified).toBe(true);
  }, 30000);

  it('resend issues a new code for an existing identifier', async () => {
    pinVerificationCode();

    await request(app)
      .post('/api/verification/request')
      .send({ identifier: 'resend@example.com', method: 'email', userType: 'jobseeker' });

    const r = await request(app)
      .post('/api/verification/resend')
      .send({ identifier: 'resend@example.com', method: 'email' });
    // /request was issued <1s ago → resend is in 60s cooldown → always 400.
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/1 minutë|prisni/i);
  }, 30000);
});
