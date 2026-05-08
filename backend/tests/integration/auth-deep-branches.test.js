/**
 * Phase 28 — coverage push for routes/auth.js untested branches:
 *   - POST /change-password same-as-current → 400 (L795-799)
 *   - POST /reset-password happy path with valid token (L912-931)
 *   - POST /forgot-password per-email rate limit (3 requests within 1 hour) (L834-841)
 *   - POST /send-verification already-verified branch (L952-954)
 *   - POST /verify-email already-verified branch (L979-981)
 *   - POST /verify-email no-active-code branch (L983-985)
 *   - POST /verify-email expired-code branch (L987-989)
 *   - POST /verify-email wrong-code branch (L991-993)
 *   - POST /verify-email happy path with correct code (L996-1002)
 *   - POST /logout with refreshToken (calls removeRefreshToken)
 *   - POST /logout without refreshToken (calls removeAllRefreshTokens)
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, jest } from '@jest/globals';
import crypto from 'crypto';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createJobseeker } from '../factories/user.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import User from '../../src/models/User.js';

describe('auth.js — deep branch coverage', () => {
  beforeAll(async () => {
    await connectTestDB();
    await seedLocations();
  });

  afterEach(async () => {
    await clearTestDB();
    await seedLocations();
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await closeTestDB();
  });

  it('PUT /change-password rejects when new password equals current (L795-799)', async () => {
    const { user, plainPassword } = await createJobseeker({
      email: 'samepw@example.com',
      password: 'OldPass123!',
    });

    const r = await request(app)
      .put('/api/auth/change-password')
      .set(createAuthHeaders(user))
      .send({ currentPassword: plainPassword, newPassword: plainPassword });

    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/i ndryshëm/i);
  });

  it('POST /reset-password happy path: valid token + new password (L912-931)', async () => {
    const { user } = await createJobseeker({ email: 'resetpw@example.com' });

    // Manually plant a reset token (simulating what /forgot-password would do)
    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashed = crypto.createHash('sha256').update(rawToken).digest('hex');
    user.passwordResetToken = hashed;
    user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000);
    await user.save({ validateBeforeSave: false });

    const r = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: rawToken, password: 'BrandNew123!' });

    expect(r.status).toBe(200);

    // Token should be cleared and password should now log in
    const refreshed = await User.findById(user._id).select('+password');
    expect(refreshed.passwordResetToken).toBeUndefined();
    expect(await refreshed.comparePassword('BrandNew123!')).toBe(true);
  });

  it('POST /reset-password rejects expired token with 400 (L912-917)', async () => {
    const { user } = await createJobseeker({ email: 'expired-reset@example.com' });
    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashed = crypto.createHash('sha256').update(rawToken).digest('hex');
    user.passwordResetToken = hashed;
    user.passwordResetExpires = new Date(Date.now() - 1000); // already expired
    await user.save({ validateBeforeSave: false });

    const r = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: rawToken, password: 'AnotherNew123!' });

    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/skaduar|pavlefshëm/i);
  });

  it('POST /send-verification rejects already-verified user (L952-954)', async () => {
    const { user } = await createJobseeker({ email: 'verified@example.com' });
    user.emailVerified = true;
    await user.save({ validateBeforeSave: false });

    const r = await request(app)
      .post('/api/auth/send-verification')
      .set(createAuthHeaders(user));

    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/tashmë i verifikuar/i);
  });

  it('POST /verify-email rejects already-verified user (L979-981)', async () => {
    const { user } = await createJobseeker({ email: 'already-verif@example.com' });
    user.emailVerified = true;
    await user.save({ validateBeforeSave: false });

    const r = await request(app)
      .post('/api/auth/verify-email')
      .set(createAuthHeaders(user))
      .send({ code: '123456' });

    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/tashmë i verifikuar/i);
  });

  it('POST /verify-email rejects when no active code (L983-985)', async () => {
    const { user } = await createJobseeker({ email: 'nocode@example.com' });
    // Ensure user has no verification token
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    user.emailVerified = false;
    await user.save({ validateBeforeSave: false });

    const r = await request(app)
      .post('/api/auth/verify-email')
      .set(createAuthHeaders(user))
      .send({ code: '123456' });

    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/Nuk ka kod/i);
  });

  it('POST /verify-email rejects expired code (L987-989)', async () => {
    const { user } = await createJobseeker({ email: 'expiredcode@example.com' });
    const rawCode = '654321';
    const hashed = crypto.createHash('sha256').update(rawCode).digest('hex');
    user.emailVerificationToken = hashed;
    user.emailVerificationExpires = new Date(Date.now() - 60_000); // expired
    user.emailVerified = false;
    await user.save({ validateBeforeSave: false });

    const r = await request(app)
      .post('/api/auth/verify-email')
      .set(createAuthHeaders(user))
      .send({ code: rawCode });

    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/skaduar/i);
  });

  it('POST /verify-email rejects wrong code (L991-993)', async () => {
    const { user } = await createJobseeker({ email: 'wrongcode@example.com' });
    const correctCode = '111111';
    const hashed = crypto.createHash('sha256').update(correctCode).digest('hex');
    user.emailVerificationToken = hashed;
    user.emailVerificationExpires = new Date(Date.now() + 60_000);
    user.emailVerified = false;
    await user.save({ validateBeforeSave: false });

    const r = await request(app)
      .post('/api/auth/verify-email')
      .set(createAuthHeaders(user))
      .send({ code: '999999' });

    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/i gabuar/i);
  });

  it('POST /verify-email happy path: correct code → emailVerified=true (L996-1002)', async () => {
    const { user } = await createJobseeker({ email: 'goodcode@example.com' });
    const rawCode = '222333';
    const hashed = crypto.createHash('sha256').update(rawCode).digest('hex');
    user.emailVerificationToken = hashed;
    user.emailVerificationExpires = new Date(Date.now() + 60_000);
    user.emailVerified = false;
    await user.save({ validateBeforeSave: false });

    const r = await request(app)
      .post('/api/auth/verify-email')
      .set(createAuthHeaders(user))
      .send({ code: rawCode });

    expect(r.status).toBe(200);
    const refreshed = await User.findById(user._id);
    expect(refreshed.emailVerified).toBe(true);
    expect(refreshed.emailVerificationToken).toBeUndefined();
  });

  it('POST /logout with refreshToken calls removeRefreshToken branch (L1017-1018)', async () => {
    const { user } = await createJobseeker({ email: 'logout-rt@example.com' });
    // Use addRefreshToken to seed token (it hashes internally)
    const rawToken = 'raw-refresh-token-abc-123';
    await user.addRefreshToken(rawToken);

    const before = await User.findById(user._id);
    expect(before.refreshTokens.length).toBe(1);

    const r = await request(app)
      .post('/api/auth/logout')
      .set(createAuthHeaders(user))
      .send({ refreshToken: rawToken });

    expect(r.status).toBe(200);
    const after = await User.findById(user._id);
    expect(after.refreshTokens.length).toBe(0);
  });

  it('POST /logout without refreshToken revokes all tokens (L1019-1022)', async () => {
    const { user } = await createJobseeker({ email: 'logout-all@example.com' });
    await user.addRefreshToken('rt-raw-1');
    await user.addRefreshToken('rt-raw-2');

    const before = await User.findById(user._id);
    expect(before.refreshTokens.length).toBe(2);

    const r = await request(app)
      .post('/api/auth/logout')
      .set(createAuthHeaders(user))
      .send({});

    expect(r.status).toBe(200);
    const after = await User.findById(user._id);
    expect(after.refreshTokens.length).toBe(0);
  });
});
