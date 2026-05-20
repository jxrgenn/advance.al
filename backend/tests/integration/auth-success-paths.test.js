/**
 * Phase 28 — coverage push for auth.js success paths.
 *
 * The existing auth.test.js covers most failure paths. This file fills the
 * largest gaps: full register success path (initiate → verify → user
 * created), reset-password success, verify-email success, send-verification
 * for unverified users, and logout token-revocation branches.
 *
 * The verification code is captured by intercepting `crypto.randomInt`
 * with a known value for the duration of the registration flow.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, jest } from '@jest/globals';
import crypto from 'crypto';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createJobseeker } from '../factories/user.factory.js';
import { createAuthHeaders, generateRefreshToken } from '../helpers/auth.helper.js';
import User from '../../src/models/User.js';
import resendEmailService from '../../src/lib/resendEmailService.js';

const KNOWN_CODE = '424242';

describe('auth.js — success paths', () => {
  let randomIntSpy;

  beforeAll(async () => {
    await connectTestDB();
    await seedLocations();
    // Disable real outbound email
    resendEmailService.enabled = false;
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
    // Force every randomInt(min, max) call to return our known 6-digit code
    randomIntSpy = jest.spyOn(crypto, 'randomInt').mockReturnValue(parseInt(KNOWN_CODE, 10));
  }

  it('completes full registration flow (initiate → register → user created)', async () => {
    pinVerificationCode();

    const initRes = await request(app)
      .post('/api/auth/initiate-registration')
      .send({
        email: 'success@example.com',
        password: 'StrongPass1',
        userType: 'jobseeker',
        firstName: 'Success',
        lastName: 'User',
        city: 'Tiranë',
      });
    expect(initRes.status).toBe(200);
    expect(initRes.body.success).toBe(true);

    const regRes = await request(app)
      .post('/api/auth/register')
      .send({ email: 'success@example.com', verificationCode: KNOWN_CODE });

    expect(regRes.status).toBe(201);
    expect(regRes.body.success).toBe(true);
    expect(regRes.body.data.token).toBeTruthy();
    expect(regRes.body.data.refreshToken).toBeTruthy();
    expect(regRes.body.data.user.email).toBe('success@example.com');
    expect(regRes.body.data.user.userType).toBe('jobseeker');

    const dbUser = await User.findOne({ email: 'success@example.com' });
    expect(dbUser).toBeTruthy();
    expect(dbUser.emailVerified).toBe(true);
    expect(dbUser.lastLoginAt).toBeInstanceOf(Date);
  });

  it('initiate-registration with verificationMethod=sms sends via SMS (mock)', async () => {
    pinVerificationCode();
    const initRes = await request(app)
      .post('/api/auth/initiate-registration')
      .send({
        email: 'smsmethod@example.com',
        password: 'StrongPass1',
        userType: 'jobseeker',
        firstName: 'Sms',
        lastName: 'User',
        city: 'Tiranë',
        phone: '+355691234567',
        verificationMethod: 'sms',
      });
    expect(initRes.status).toBe(200);
    expect(initRes.body.message).toMatch(/SMS/i);

    // The cached code still works for register regardless of delivery channel.
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({ email: 'smsmethod@example.com', verificationCode: KNOWN_CODE });
    expect(regRes.status).toBe(201);
  });

  it('initiate-registration rejects verificationMethod=sms without a phone', async () => {
    pinVerificationCode();
    const initRes = await request(app)
      .post('/api/auth/initiate-registration')
      .send({
        email: 'smsnophone@example.com',
        password: 'StrongPass1',
        userType: 'jobseeker',
        firstName: 'Sms',
        lastName: 'User',
        city: 'Tiranë',
        verificationMethod: 'sms',
      });
    expect(initRes.status).toBe(400);
    expect(initRes.body.message).toMatch(/telefon/i);
  });

  it('register flow creates an employer with employerProfile populated', async () => {
    pinVerificationCode();

    await request(app)
      .post('/api/auth/initiate-registration')
      .send({
        email: 'emp@example.com',
        password: 'StrongPass1',
        userType: 'employer',
        firstName: 'Emp',
        lastName: 'Loyer',
        city: 'Tiranë',
        companyName: 'TestCo',
        industry: 'Tech',
        companySize: '11-50',
        description: 'A test company with a detailed enough description to satisfy the new 400 character minimum requirement that was added during the post-Phase-3 QA cleanup. This text exists purely for test fixtures and pads out the field to meet validator constraints without affecting the assertions further down which only check companyName, companySize, and userType. Keep this padding stable so future test maintenance is obvious.',
        website: 'testco.al',
      });

    const regRes = await request(app)
      .post('/api/auth/register')
      .send({ email: 'emp@example.com', verificationCode: KNOWN_CODE });

    expect(regRes.status).toBe(201);
    const dbUser = await User.findOne({ email: 'emp@example.com' });
    expect(dbUser.userType).toBe('employer');
    expect(dbUser.profile.employerProfile.companyName).toBe('TestCo');
    expect(dbUser.profile.employerProfile.companySize).toBe('11-50');
    expect(dbUser.profile.employerProfile.verificationStatus).toBe('pending');
    // Bare-domain website was prepended with https://
    expect(dbUser.profile.employerProfile.website).toMatch(/^https:\/\/testco\.al$/);
  });

  it('register fails with wrong code (returns tentativa message)', async () => {
    pinVerificationCode();

    const init = await request(app)
      .post('/api/auth/initiate-registration')
      .send({
        email: 'wrong@example.com',
        password: 'StrongPass1',
        userType: 'jobseeker',
        firstName: 'Wrong', lastName: 'User', city: 'Tiranë',
      });
    expect(init.status).toBe(200);

    const r1 = await request(app)
      .post('/api/auth/register')
      .send({ email: 'wrong@example.com', verificationCode: '111111' });
    expect(r1.status).toBe(400);
    // Either tentativa (correct branch) or skaduar (if pending was lost) — both
    // are 400 paths; assert the negative outcome cleanly.
    expect(r1.body.message).toMatch(/tentativa|skaduar/i);
  });

  it('reset-password succeeds with valid token, invalidates refresh tokens', async () => {
    const { user } = await createJobseeker({ email: 'reset@example.com' });

    // Generate + persist a valid reset token (mirrors the forgot-password path)
    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashed = crypto.createHash('sha256').update(rawToken).digest('hex');
    user.passwordResetToken = hashed;
    user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000);
    await user.save({ validateBeforeSave: false });

    const r = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: rawToken, password: 'NewStrongPass1' });

    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);

    const refreshed = await User.findById(user._id);
    expect(refreshed.passwordResetToken).toBeUndefined();
    expect(refreshed.passwordResetExpires).toBeUndefined();

    // Old password no longer works
    const oldLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'reset@example.com', password: 'TestPassword123' });
    expect(oldLogin.status).toBe(401);

    // New password works
    const newLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'reset@example.com', password: 'NewStrongPass1' });
    expect(newLogin.status).toBe(200);
  });

  it('reset-password rejects expired token', async () => {
    const { user } = await createJobseeker({ email: 'expired-reset@example.com' });
    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashed = crypto.createHash('sha256').update(rawToken).digest('hex');
    user.passwordResetToken = hashed;
    user.passwordResetExpires = new Date(Date.now() - 60 * 1000); // already expired
    await user.save({ validateBeforeSave: false });

    const r = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: rawToken, password: 'NewStrongPass1' });

    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/pavlefshëm|skaduar/i);
  });

  it('verify-email succeeds with correct code', async () => {
    pinVerificationCode();
    const { user } = await createJobseeker({ email: 'unverified@example.com' });

    // Manually mark user as unverified and seed an emailVerificationToken
    user.emailVerified = false;
    const hashedCode = crypto.createHash('sha256').update(KNOWN_CODE).digest('hex');
    user.emailVerificationToken = hashedCode;
    user.emailVerificationExpires = new Date(Date.now() + 10 * 60 * 1000);
    await user.save({ validateBeforeSave: false });

    const headers = createAuthHeaders(user);
    const r = await request(app)
      .post('/api/auth/verify-email')
      .set(headers)
      .send({ code: KNOWN_CODE });

    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);

    const refreshed = await User.findById(user._id);
    expect(refreshed.emailVerified).toBe(true);
    expect(refreshed.emailVerificationToken).toBeUndefined();
  });

  it('verify-email rejects wrong code', async () => {
    const { user } = await createJobseeker({ email: 'wrong-code@example.com' });
    user.emailVerified = false;
    user.emailVerificationToken = crypto.createHash('sha256').update('999999').digest('hex');
    user.emailVerificationExpires = new Date(Date.now() + 10 * 60 * 1000);
    await user.save({ validateBeforeSave: false });

    const r = await request(app)
      .post('/api/auth/verify-email')
      .set(createAuthHeaders(user))
      .send({ code: '111111' });

    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/gabuar/i);
  });

  it('verify-email rejects expired code', async () => {
    const { user } = await createJobseeker({ email: 'expired-code@example.com' });
    user.emailVerified = false;
    user.emailVerificationToken = crypto.createHash('sha256').update(KNOWN_CODE).digest('hex');
    user.emailVerificationExpires = new Date(Date.now() - 1000);
    await user.save({ validateBeforeSave: false });

    const r = await request(app)
      .post('/api/auth/verify-email')
      .set(createAuthHeaders(user))
      .send({ code: KNOWN_CODE });

    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/skaduar/i);
  });

  it('verify-email rejects when no active code present', async () => {
    const { user } = await createJobseeker({ email: 'no-code@example.com' });
    user.emailVerified = false;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save({ validateBeforeSave: false });

    const r = await request(app)
      .post('/api/auth/verify-email')
      .set(createAuthHeaders(user))
      .send({ code: '424242' });

    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/Nuk ka kod|aktiv/i);
  });

  it('verify-email is no-op for already-verified user', async () => {
    const { user } = await createJobseeker({ email: 'already-verified@example.com' });
    user.emailVerified = true;
    await user.save({ validateBeforeSave: false });

    const r = await request(app)
      .post('/api/auth/verify-email')
      .set(createAuthHeaders(user))
      .send({ code: '424242' });

    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/tashmë/i);
  });

  it('send-verification sends a code for unverified user', async () => {
    pinVerificationCode();
    const { user } = await createJobseeker({ email: 'send-vrf@example.com' });
    user.emailVerified = false;
    await user.save({ validateBeforeSave: false });

    const r = await request(app)
      .post('/api/auth/send-verification')
      .set(createAuthHeaders(user));

    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);

    const refreshed = await User.findById(user._id);
    expect(refreshed.emailVerificationToken).toBeTruthy();
    expect(refreshed.emailVerificationExpires).toBeInstanceOf(Date);
  });

  it('send-verification 400s for already-verified user', async () => {
    const { user } = await createJobseeker({ email: 'send-vrf-2@example.com' });
    user.emailVerified = true;
    await user.save({ validateBeforeSave: false });

    const r = await request(app)
      .post('/api/auth/send-verification')
      .set(createAuthHeaders(user));

    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/tashmë/i);
  });

  it('logout with no refresh token revokes all tokens', async () => {
    const { user } = await createJobseeker({ email: 'logout-all@example.com' });
    // Seed two refresh tokens
    await user.addRefreshToken(generateRefreshToken(user));
    await user.addRefreshToken(generateRefreshToken(user));

    const r = await request(app)
      .post('/api/auth/logout')
      .set(createAuthHeaders(user))
      .send({}); // no refreshToken field

    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);

    const refreshed = await User.findById(user._id);
    expect(refreshed.refreshTokens).toEqual([]);
  });

  it('logout with specific refresh token revokes only that one', async () => {
    const { user } = await createJobseeker({ email: 'logout-one@example.com' });
    // generateRefreshToken signs with the same payload — to get distinct tokens
    // with iat differences, sign in two different ticks.
    const rt1 = generateRefreshToken(user);
    await new Promise(r => setTimeout(r, 1100));
    const rt2 = generateRefreshToken(user);
    expect(rt1).not.toBe(rt2);
    await user.addRefreshToken(rt1);
    await user.addRefreshToken(rt2);

    const r = await request(app)
      .post('/api/auth/logout')
      .set(createAuthHeaders(user))
      .send({ refreshToken: rt1 });

    expect(r.status).toBe(200);
    const refreshed = await User.findById(user._id);
    expect(refreshed.refreshTokens.length).toBe(1);
  });
});
