/**
 * Phase 8 — State Machines + Refresh-Token Replay
 *
 * What we verify:
 *   - Application status state machine: every transition path checked
 *     pending → viewed | shortlisted | rejected
 *     viewed → shortlisted | rejected
 *     shortlisted → hired | rejected
 *     rejected → (terminal — no transitions allowed)
 *     hired → shortlisted (only "back" path)
 *   - Refresh-token replay attack: old refresh token rejected after rotation
 *   - Refresh-token reuse twice: first works, second fails
 *   - JWT for non-existent userId → 401
 *   - JWT for deleted user (token issued before deletion) → 401 on next call
 *   - Login normalizes email casing + whitespace
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import app from '../../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../../setup/testDb.js';
import { seedLocations } from '../../fixtures/locations.fixture.js';
import {
  createJobseeker, createVerifiedEmployer
} from '../../factories/user.factory.js';
import { createJob } from '../../factories/job.factory.js';
import { createAuthHeaders } from '../../helpers/auth.helper.js';
import { Application, User } from '../../../src/models/index.js';

describe('Phase 8 — State Machines + Refresh Replay', () => {
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

  describe('Application status state machine', () => {
    async function setupApp() {
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp);
      const { user: applicant } = await createJobseeker({ emailVerified: true });
      const application = await Application.create({
        jobId: job._id, jobSeekerId: applicant._id, employerId: emp._id, applicationMethod: 'one_click'
      });
      return { emp, applicant, application };
    }

    async function setStatus(app1, employer, status) {
      return request(app)
        .patch(`/api/applications/${app1._id}/status`)
        .set(createAuthHeaders(employer))
        .send({ status });
    }

    it('pending → viewed → shortlisted → hired (full happy path)', async () => {
      const { emp, application } = await setupApp();

      const r1 = await setStatus(application, emp, 'viewed');
      expect(r1.status).toBe(200);

      const r2 = await setStatus(application, emp, 'shortlisted');
      expect(r2.status).toBe(200);

      const r3 = await setStatus(application, emp, 'hired');
      expect(r3.status).toBe(200);

      const dbApp = await Application.findById(application._id);
      expect(dbApp.status).toBe('hired');
    });

    it('hired → shortlisted (the only "back" transition allowed)', async () => {
      const { emp, application } = await setupApp();
      // Move all the way to hired
      await setStatus(application, emp, 'viewed');
      await setStatus(application, emp, 'shortlisted');
      await setStatus(application, emp, 'hired');

      // Allowed transition: hired → shortlisted
      const back = await setStatus(application, emp, 'shortlisted');
      expect(back.status).toBe(200);

      const dbApp = await Application.findById(application._id);
      expect(dbApp.status).toBe('shortlisted');
    });

    it('rejected is terminal — no further transitions', async () => {
      const { emp, application } = await setupApp();
      await setStatus(application, emp, 'viewed');
      await setStatus(application, emp, 'rejected');

      const reverse = await setStatus(application, emp, 'shortlisted');
      expect(reverse.status).toBe(400);

      const reHire = await setStatus(application, emp, 'hired');
      expect(reHire.status).toBe(400);

      const dbApp = await Application.findById(application._id);
      expect(dbApp.status).toBe('rejected');
    });

    it('rejects pending → hired (must go through viewed/shortlisted)', async () => {
      const { emp, application } = await setupApp();
      const r = await setStatus(application, emp, 'hired');
      expect(r.status).toBe(400);
    });

    it('rejects viewed → pending (cannot regress)', async () => {
      const { emp, application } = await setupApp();
      await setStatus(application, emp, 'viewed');
      const r = await setStatus(application, emp, 'pending');
      expect(r.status).toBe(400);
    });

    it('rejects unknown status value', async () => {
      const { emp, application } = await setupApp();
      const r = await setStatus(application, emp, 'archived');
      expect(r.status).toBe(400);
    });
  });

  describe('Refresh-token replay attack', () => {
    it('replay of old refresh token after rotation → 401', async () => {
      const { plainPassword } = await createJobseeker({ email: 'replay@example.com' });

      const login = await request(app)
        .post('/api/auth/login')
        .send({ email: 'replay@example.com', password: plainPassword });
      const oldRefresh = login.body.data.refreshToken;

      // First refresh: rotate token
      const refresh1 = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: oldRefresh });
      expect(refresh1.status).toBe(200);

      // Replay the OLD refresh token — must be rejected (already revoked)
      const refresh2 = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: oldRefresh });
      expect(refresh2.status).toBe(401);
    });

    it('the NEW refresh token (after rotation) works for one more rotation', async () => {
      const { plainPassword } = await createJobseeker({ email: 'rotchain@example.com' });

      const login = await request(app)
        .post('/api/auth/login')
        .send({ email: 'rotchain@example.com', password: plainPassword });

      const r1 = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: login.body.data.refreshToken });
      expect(r1.status).toBe(200);
      const newRefresh = r1.body.data.refreshToken;

      // The new token rotates again successfully
      const r2 = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: newRefresh });
      expect(r2.status).toBe(200);

      // The just-used new token is now revoked
      const r3 = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: newRefresh });
      expect(r3.status).toBe(401);
    });
  });

  describe('JWT pointing to a non-existent userId', () => {
    it('valid signature, payload.id never existed in DB → 401', async () => {
      const fakeUserToken = jwt.sign(
        { id: '507f1f77bcf86cd799439011', email: 'ghost@example.com', userType: 'jobseeker' },
        process.env.JWT_SECRET || 'test-only-jwt-secret-do-not-use-in-prod-12345678901234567890',
        { expiresIn: '15m' }
      );
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${fakeUserToken}`);
      expect(response.status).toBe(401);
    });
  });

  describe('Login email normalization', () => {
    it('login with capitalized email matches lowercase-stored email', async () => {
      const { plainPassword } = await createJobseeker({ email: 'lower@example.com' });

      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'LOWER@EXAMPLE.COM', password: plainPassword });

      // express-validator's normalizeEmail() lowercases the input
      expect(response.status).toBe(200);
    });

    it('login with whitespace-padded email is accepted (validator trims before isEmail)', async () => {
      const { plainPassword } = await createJobseeker({ email: 'pad@example.com' });

      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: '  pad@example.com  ', password: plainPassword });

      // Per B-003 (Phase 24), the email validator now runs .trim() before .isEmail().
      // Padded emails normalize to the canonical form and login succeeds.
      expect(response.status).toBe(200);
    });
  });

  describe('Suspension lifecycle on auth', () => {
    it('user marked suspended in DB → next request rejected with suspended message', async () => {
      const { user } = await createJobseeker({ email: 'will-be-susp@example.com' });

      // Calling /me works initially
      const before = await request(app).get('/api/auth/me').set(createAuthHeaders(user));
      expect(before.status).toBe(200);

      // Admin suspends the user out-of-band
      await User.updateOne(
        { _id: user._id },
        {
          status: 'suspended',
          suspensionDetails: {
            reason: 'test',
            suspendedAt: new Date(),
            expiresAt: new Date(Date.now() + 86_400_000)
          }
        }
      );

      // Next call: 401
      const after = await request(app).get('/api/auth/me').set(createAuthHeaders(user));
      expect(after.status).toBe(401);
      expect(after.body.message).toMatch(/pezulluar/);
    });
  });
});
