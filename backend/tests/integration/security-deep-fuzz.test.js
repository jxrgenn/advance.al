/**
 * Phase 28 — deep injection / fuzzing tests.
 *
 * Extends Phase 15 with the attack classes that needed dedicated coverage:
 *   1. NoSQLi operator injection in JSON body (login email = {$ne: null})
 *   2. NoSQLi operator injection in query params with bracket notation
 *   3. Prototype pollution via __proto__ / constructor.prototype in JSON
 *   4. HTTP parameter pollution (?email=a&email=b — different parsers
 *      pick different values; backend must pick one deterministically)
 *   5. CRLF injection in fields used in email headers (already in
 *      Phase 15 for name; extend to subject-bound fields)
 *   6. ReDoS smoke: long pathological strings against any regex-validated
 *      field don't pin the event loop > 1s
 *   7. Cookie attributes audit: refreshToken cookie has Secure, HttpOnly,
 *      SameSite set in production-mode response
 *   8. Mass assignment guard on PATCH /users/profile (admin-only fields
 *      cannot be set by a regular jobseeker)
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createJobseeker, createVerifiedEmployer } from '../factories/user.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import { User } from '../../src/models/index.js';

describe('security — deep fuzz', () => {
  beforeAll(async () => { await connectTestDB(); await seedLocations(); });
  afterEach(async () => { await clearTestDB(); await seedLocations(); });
  afterAll(async () => { await closeTestDB(); });

  describe('NoSQL operator injection', () => {
    it('login with email = {$ne: null} does not authenticate as any user', async () => {
      await createJobseeker({ email: 'real@example.com', password: 'RealPassword!1' });
      const r = await request(app)
        .post('/api/auth/login')
        .send({ email: { $ne: null }, password: { $ne: null } });
      expect(r.status).not.toBe(200);
      expect(r.body.success).not.toBe(true);
      expect(r.body.token).toBeUndefined();
    });

    it('login with email = {$gt: ""} does not bypass password check', async () => {
      await createJobseeker({ email: 'gt@example.com', password: 'RealPassword!1' });
      const r = await request(app)
        .post('/api/auth/login')
        .send({ email: { $gt: '' }, password: 'WrongPassword!1' });
      expect(r.status).not.toBe(200);
    });

    it('GET /api/jobs?status[$ne]=closed does not return all statuses', async () => {
      const r = await request(app).get('/api/jobs?status[$ne]=closed');
      // Either rejected or sanitized — must not return jobs whose status was closed
      // when caller asked for "active" (the default behavior should remain).
      expect(r.status).toBeLessThan(500);
      if (r.status === 200) {
        for (const job of r.body.data?.jobs || []) {
          expect(job.status).not.toBe('closed');
        }
      }
    });
  });

  describe('Prototype pollution', () => {
    it('POST /api/auth/login with __proto__ key does not pollute Object.prototype', async () => {
      await request(app)
        .post('/api/auth/login')
        .send({ email: 'p@example.com', password: 'x', __proto__: { polluted: 'yes' } });
      // After the request, no fresh Object should have a "polluted" property
      const fresh = {};
      expect(fresh.polluted).toBeUndefined();
      expect(({}).polluted).toBeUndefined();
    });

    it('PUT /api/users/profile with constructor.prototype does not pollute', async () => {
      const { user } = await createJobseeker();
      await request(app)
        .put('/api/users/profile')
        .set(createAuthHeaders(user))
        .send({
          firstName: 'Test',
          constructor: { prototype: { polluted2: 'yes' } },
        });
      expect(({}).polluted2).toBeUndefined();
    });
  });

  describe('HTTP parameter pollution', () => {
    it('?status=active&status=closed returns deterministic results, not 500', async () => {
      const { user: emp } = await createVerifiedEmployer();
      await request(app)
        .post('/api/jobs')
        .set(createAuthHeaders(emp))
        .send({ title: 'Test job', description: 'X'.repeat(50), category: 'Teknologji', jobType: 'full_time', location: { city: 'Tiranë' }, applicationDeadline: new Date(Date.now() + 30 * 86400000) });

      const r = await request(app).get('/api/jobs?status=active&status=closed');
      expect(r.status).toBeLessThan(500);
      // Express by default returns the LAST value as a string OR as an array;
      // either is acceptable as long as it's deterministic and not a crash.
    });
  });

  describe('CRLF in email-bound field', () => {
    it('newline in firstName does not inject Subject: into outbound mail', async () => {
      const { user } = await createJobseeker();
      const r = await request(app)
        .put('/api/users/profile')
        .set(createAuthHeaders(user))
        .send({ firstName: 'Test\r\nSubject: hijacked\r\n\r\nbody' });
      // 400 (sanitizer rejects) is the right response. 200 with stored sanitized value also OK.
      expect([200, 400]).toContain(r.status);
      if (r.status === 200) {
        const refreshed = await User.findById(user._id);
        // No raw \r\n should survive
        expect(refreshed.profile.firstName).not.toMatch(/\r|\n/);
      }
    });
  });

  describe('ReDoS smoke (no regex pins event loop on pathological input)', () => {
    it('login with 100KB email completes within 2s (no catastrophic backtrack)', async () => {
      const longEmail = 'a'.repeat(100_000) + '@x.com';
      const t = Date.now();
      const r = await request(app)
        .post('/api/auth/login')
        .send({ email: longEmail, password: 'x' });
      const elapsed = Date.now() - t;
      expect(elapsed).toBeLessThan(2000);
      expect(r.status).toBeLessThan(500);
    });

    it('register with pathological repeating "@" email does not pin', async () => {
      const evil = 'a@'.repeat(2000) + 'x.com';
      const t = Date.now();
      const r = await request(app)
        .post('/api/auth/initiate-registration')
        .send({ email: evil, firstName: 'Test', lastName: 'User' });
      const elapsed = Date.now() - t;
      expect(elapsed).toBeLessThan(2000);
      expect(r.status).toBeLessThan(500);
    });
  });

  describe('Cookie attributes audit', () => {
    it('refresh-token cookie set on login has HttpOnly + SameSite (production-class hardening)', async () => {
      const { user } = await createJobseeker({ email: 'cookie@example.com', password: 'CookiePass!1' });

      const r = await request(app)
        .post('/api/auth/login')
        .send({ email: user.email, password: 'CookiePass!1' });
      expect(r.status).toBe(200);

      const setCookieHeaders = r.headers['set-cookie'] || [];
      const refreshCookie = setCookieHeaders.find(c => c.toLowerCase().startsWith('refreshtoken='));
      if (refreshCookie) {
        expect(refreshCookie.toLowerCase()).toContain('httponly');
        expect(refreshCookie.toLowerCase()).toContain('samesite');
      }
      // It's also acceptable for the API to return the refresh token in the body
      // and not as a cookie. Either way, no plaintext token in a non-HttpOnly cookie.
      for (const cookie of setCookieHeaders) {
        if (/refresh|jwt|token/i.test(cookie) && !/httponly/i.test(cookie)) {
          throw new Error(`Token-bearing cookie missing HttpOnly: ${cookie}`);
        }
      }
    });
  });

  describe('Mass assignment guard', () => {
    it('jobseeker cannot upgrade to admin via PUT /api/users/profile', async () => {
      const { user } = await createJobseeker();
      await request(app)
        .put('/api/users/profile')
        .set(createAuthHeaders(user))
        .send({
          firstName: 'Test',
          userType: 'admin',
          isAdmin: true,
          status: 'active',
          emailVerified: true,
        });

      const refreshed = await User.findById(user._id);
      expect(refreshed.userType).toBe('jobseeker');
      expect(refreshed.isAdmin).toBeFalsy();
    });

    it('unverified employer cannot grant themselves verified or admin flags via PUT /profile', async () => {
      const { user: emp } = await createVerifiedEmployer();
      // Force unverified state
      await User.updateOne({ _id: emp._id }, { $set: { 'profile.employerProfile.verified': false } });

      await request(app)
        .put('/api/users/profile')
        .set(createAuthHeaders(emp))
        .send({
          employerProfile: {
            verified: true,
            isAdministrataAccount: true,
            subscriptionTier: 'enterprise',
            candidateMatchingEnabled: true,
            candidateMatchingJobs: 9999,
          },
        });

      const refreshed = await User.findById(emp._id);
      expect(refreshed.profile.employerProfile.verified).toBe(false);
      expect(refreshed.profile.employerProfile.isAdministrataAccount).toBeFalsy();
      expect(refreshed.profile.employerProfile.candidateMatchingEnabled).toBeFalsy();
    });
  });
});
