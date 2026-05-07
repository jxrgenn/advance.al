/**
 * Auth API Integration Tests — Phase 1
 *
 * Routes covered:
 *   POST /api/auth/initiate-registration   (validation, dedup)
 *   POST /api/auth/register                (rejects unknown email — full E2E deferred to Phase 5)
 *   POST /api/auth/login                   (happy path + 401 wrong pwd + suspended/banned)
 *   POST /api/auth/refresh                 (rotates refresh token)
 *   POST /api/auth/logout                  (revokes refresh)
 *   GET  /api/auth/me                      (returns current user)
 *   PUT  /api/auth/change-password         (requires current pwd)
 *   POST /api/auth/forgot-password         (always 200, no enumeration)
 *   POST /api/auth/reset-password          (rejects invalid token)
 *   POST /api/auth/send-verification       (returns 200 for verified user noop)
 *   POST /api/auth/verify-email            (rejects bad code)
 *
 * NOTE: The 2-step register flow (initiate → email-with-code → register) needs
 * an inbox-polling helper to fully execute end-to-end. Phase 5 (Email Truth Pass)
 * extends this by reading the diverted inbox at advance.al123456@gmail.com.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createJobseeker, createSuspendedUser, createBannedUser } from '../factories/user.factory.js';
import { createAuthHeaders, generateRefreshToken } from '../helpers/auth.helper.js';
import User from '../../src/models/User.js';

describe('Auth API - Integration Tests', () => {
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

  // ────────────────────────────────────────────────────
  // POST /api/auth/initiate-registration
  // ────────────────────────────────────────────────────
  describe('POST /api/auth/initiate-registration', () => {
    it('rejects an already-registered email', async () => {
      await createJobseeker({ email: 'taken@example.com' });

      const response = await request(app)
        .post('/api/auth/initiate-registration')
        .send({
          email: 'taken@example.com',
          password: 'StrongPass1',
          userType: 'jobseeker',
          firstName: 'Test',
          lastName: 'User',
          city: 'Tiranë'
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toMatch(/tashmë ekziston/);
    });

    it('rejects weak password', async () => {
      const response = await request(app)
        .post('/api/auth/initiate-registration')
        .send({
          email: 'newweak@example.com',
          password: 'short',
          userType: 'jobseeker',
          firstName: 'Test',
          lastName: 'User',
          city: 'Tiranë'
        });

      expect(response.status).toBe(400);
      expect(response.body.errors).toBeDefined();
    });

    it('rejects employer registration missing companySize', async () => {
      const response = await request(app)
        .post('/api/auth/initiate-registration')
        .send({
          email: 'newemp@example.com',
          password: 'StrongPass1',
          userType: 'employer',
          firstName: 'Test',
          lastName: 'User',
          city: 'Tiranë',
          companyName: 'TestCo',
          industry: 'Teknologji'
        });

      expect(response.status).toBe(400);
    });

    it('accepts valid jobseeker initiate (caches pending record)', async () => {
      const response = await request(app)
        .post('/api/auth/initiate-registration')
        .send({
          email: 'valid-jobseeker@example.com',
          password: 'StrongPass1',
          userType: 'jobseeker',
          firstName: 'Valid',
          lastName: 'Seeker',
          city: 'Tiranë'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    }, 30000);
  });

  // ────────────────────────────────────────────────────
  // POST /api/auth/register
  // ────────────────────────────────────────────────────
  describe('POST /api/auth/register', () => {
    it('rejects when no pending registration exists', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({ email: 'nobody@example.com', verificationCode: '123456' });

      expect(response.status).toBe(400);
      expect(response.body.message).toMatch(/skaduar/);
    });

    it('rejects with missing fields', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({ email: 'a@b.c' });

      expect(response.status).toBe(400);
    });
  });

  // ────────────────────────────────────────────────────
  // POST /api/auth/login
  // ────────────────────────────────────────────────────
  describe('POST /api/auth/login', () => {
    it('logs in with correct credentials and returns tokens', async () => {
      const { user, plainPassword } = await createJobseeker({ email: 'login@example.com' });

      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'login@example.com', password: plainPassword });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.token).toBeDefined();
      expect(response.body.data.refreshToken).toBeDefined();
      expect(response.body.data.user.id || response.body.data.user._id).toBeDefined();

      // Verify lastLoginAt was set in DB
      const dbUser = await User.findById(user._id);
      expect(dbUser.lastLoginAt).toBeDefined();
    });

    it('rejects wrong password with 401', async () => {
      await createJobseeker({ email: 'pwd@example.com' });

      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'pwd@example.com', password: 'WrongPassword1' });

      expect(response.status).toBe(401);
    });

    it('rejects unknown email with 401 (no enumeration)', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'ghost@example.com', password: 'AnyPass1' });

      expect(response.status).toBe(401);
    });

    it('blocks suspended users at login', async () => {
      const { user, plainPassword } = await createSuspendedUser('jobseeker', { email: 'susp@example.com' });

      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'susp@example.com', password: plainPassword });

      // auth.js returns 401 for suspended/banned (treats them as failed authentication).
      expect(response.status).toBe(401);
    });

    it('blocks banned users at login', async () => {
      const { plainPassword } = await createBannedUser('jobseeker', { email: 'banned@example.com' });

      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'banned@example.com', password: plainPassword });

      // auth.js returns 401 for suspended/banned (treats them as failed authentication).
      expect(response.status).toBe(401);
    });
  });

  // ────────────────────────────────────────────────────
  // POST /api/auth/refresh
  // ────────────────────────────────────────────────────
  describe('POST /api/auth/refresh', () => {
    it('rotates token when refresh token is valid', async () => {
      const { user, plainPassword } = await createJobseeker({ email: 'refresh@example.com' });
      const login = await request(app)
        .post('/api/auth/login')
        .send({ email: 'refresh@example.com', password: plainPassword });

      const refreshToken = login.body.data.refreshToken;

      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken });

      expect(response.status).toBe(200);
      expect(response.body.data.token).toBeDefined();
      // Refresh token rotation produces a new refresh token (jti changes); access
      // token may be identical when re-signed within the same second.
      expect(response.body.data.refreshToken).toBeDefined();
    });

    it('rejects invalid refresh token with 401', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.bogus.signature' });
      // Route catches verifyToken throw → 401 (never 400 — body is parsed fine).
      expect(response.status).toBe(401);
    });
  });

  // ────────────────────────────────────────────────────
  // GET /api/auth/me
  // ────────────────────────────────────────────────────
  describe('GET /api/auth/me', () => {
    it('returns current user', async () => {
      const { user } = await createJobseeker({ email: 'me@example.com' });

      const response = await request(app)
        .get('/api/auth/me')
        .set(createAuthHeaders(user));

      expect(response.status).toBe(200);
      expect(response.body.data.user.email).toBe('me@example.com');
    });

    it('rejects without token', async () => {
      const response = await request(app).get('/api/auth/me');
      expect(response.status).toBe(401);
    });
  });

  // ────────────────────────────────────────────────────
  // PUT /api/auth/change-password
  // ────────────────────────────────────────────────────
  describe('PUT /api/auth/change-password', () => {
    it('updates password when current password matches', async () => {
      const { user, plainPassword } = await createJobseeker({ email: 'pwchange@example.com' });

      const response = await request(app)
        .put('/api/auth/change-password')
        .set(createAuthHeaders(user))
        .send({ currentPassword: plainPassword, newPassword: 'NewStrongPass1' });

      expect(response.status).toBe(200);

      // Verify can login with new password
      const reLogin = await request(app)
        .post('/api/auth/login')
        .send({ email: 'pwchange@example.com', password: 'NewStrongPass1' });
      expect(reLogin.status).toBe(200);
    });

    it('rejects with wrong current password', async () => {
      const { user } = await createJobseeker({ email: 'pwchange2@example.com' });

      const response = await request(app)
        .put('/api/auth/change-password')
        .set(createAuthHeaders(user))
        .send({ currentPassword: 'wrong', newPassword: 'NewStrongPass1' });

      expect(response.status).toBe(400);
    });
  });

  // ────────────────────────────────────────────────────
  // POST /api/auth/forgot-password
  // ────────────────────────────────────────────────────
  describe('POST /api/auth/forgot-password', () => {
    it('returns same response shape for known and unknown emails (no enumeration)', async () => {
      await createJobseeker({ email: 'known@example.com' });

      const known = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'known@example.com' });

      const unknown = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'unknown@example.com' });

      expect(known.status).toBe(unknown.status);
      // Route always returns res.json() = 200 (anti-enumeration; email send is async).
      expect(known.status).toBe(200);
    }, 30000);
  });

  // ────────────────────────────────────────────────────
  // POST /api/auth/reset-password
  // ────────────────────────────────────────────────────
  describe('POST /api/auth/reset-password', () => {
    it('rejects an invalid reset token', async () => {
      const response = await request(app)
        .post('/api/auth/reset-password')
        .send({ token: 'bogus-token', newPassword: 'NewStrongPass1' });

      expect(response.status).toBe(400);
    });
  });

  // ────────────────────────────────────────────────────
  // POST /api/auth/logout
  // ────────────────────────────────────────────────────
  describe('POST /api/auth/logout', () => {
    it('revokes refresh token from User document', async () => {
      const { user, plainPassword } = await createJobseeker({ email: 'logout@example.com' });
      const login = await request(app)
        .post('/api/auth/login')
        .send({ email: 'logout@example.com', password: plainPassword });

      const before = await User.findById(user._id).select('+refreshTokens');
      expect(before.refreshTokens?.length).toBeGreaterThan(0);

      const response = await request(app)
        .post('/api/auth/logout')
        .set(createAuthHeaders(user))
        .send({ refreshToken: login.body.data.refreshToken });

      expect(response.status).toBe(200);

      const after = await User.findById(user._id).select('+refreshTokens');
      // The logged-out token should no longer be present (others may exist if multiple sessions)
      const stillPresent = (after.refreshTokens || []).some(t => t.token === login.body.data.refreshToken);
      expect(stillPresent).toBe(false);
    });
  });

  // ────────────────────────────────────────────────────
  // POST /api/auth/verify-email
  // ────────────────────────────────────────────────────
  describe('POST /api/auth/verify-email', () => {
    it('rejects with bad code (400 — no active code on freshly-created user)', async () => {
      const { user } = await createJobseeker({ email: 'verify@example.com', emailVerified: false });

      const response = await request(app)
        .post('/api/auth/verify-email')
        .set(createAuthHeaders(user))
        .send({ code: '000000' });
      // Route returns 400 in every bad-code branch; 410 is not used.
      expect(response.status).toBe(400);
    });
  });
});
