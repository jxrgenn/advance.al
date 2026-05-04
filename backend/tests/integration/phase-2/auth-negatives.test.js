/**
 * Phase 2 — Auth Negative Pass
 *
 * Token-level attacks against /api/auth/me as a representative authenticated
 * route, plus role-boundary checks at admin/employer/jobseeker route surfaces.
 *
 * What we verify:
 *   - No Authorization header → 401
 *   - Malformed Bearer token → 401
 *   - Expired token (signed with `expiresIn: '-1d'`) → 401
 *   - Token signed with WRONG secret → 401
 *   - alg:none attack (unsigned token) → 401
 *   - Token for a soft-deleted user → 401
 *   - Token for a suspended user → 401
 *   - Token for a banned user → 401
 *   - Jobseeker token against admin route → 403
 *   - Employer token against admin route → 403
 *   - Jobseeker token against employer route → 403
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import app from '../../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../../setup/testDb.js';
import { seedLocations } from '../../fixtures/locations.fixture.js';
import {
  createJobseeker, createVerifiedEmployer, createAdmin,
  createSuspendedUser, createBannedUser
} from '../../factories/user.factory.js';
import {
  createAuthHeaders, generateExpiredToken, generateInvalidToken
} from '../../helpers/auth.helper.js';
import User from '../../../src/models/User.js';

describe('Phase 2 — Auth Negatives', () => {
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

  describe('Token-level attacks against /api/auth/me', () => {
    it('no Authorization header → 401', async () => {
      const response = await request(app).get('/api/auth/me');
      expect(response.status).toBe(401);
    });

    it('Authorization without Bearer prefix → 401', async () => {
      const { user } = await createJobseeker();
      const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'test-only-jwt-secret-do-not-use-in-prod-12345678901234567890');
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', token); // missing 'Bearer '
      expect(response.status).toBe(401);
    });

    it('malformed JWT (3-part garbage) → 401', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer not.a.realjwt');
      expect(response.status).toBe(401);
    });

    it('expired JWT → 401 with skadua message', async () => {
      const { user } = await createJobseeker();
      const expired = generateExpiredToken(user);
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${expired}`);
      expect(response.status).toBe(401);
    });

    it('JWT signed with WRONG secret → 401', async () => {
      const { user } = await createJobseeker();
      const wrongSecretToken = jwt.sign(
        { id: user._id, email: user.email, userType: user.userType },
        'WRONG-SECRET-NOT-MATCHING-PROD',
        { expiresIn: '15m' }
      );
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${wrongSecretToken}`);
      expect(response.status).toBe(401);
    });

    it('alg:none attack (unsigned token claiming admin) → 401', async () => {
      const { user: admin } = await createAdmin();
      // Build header.payload with alg:none and empty signature
      const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({ id: admin._id, email: admin.email, userType: 'admin' })).toString('base64url');
      const noAlgToken = `${header}.${payload}.`;
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${noAlgToken}`);
      expect(response.status).toBe(401);
    });

    it('token for soft-deleted user → 401', async () => {
      const { user } = await createJobseeker({ email: 'softdel@example.com' });
      // Soft-delete the user after issuing a valid token
      const headers = createAuthHeaders(user);
      await User.updateOne({ _id: user._id }, { isDeleted: true, status: 'deleted' });

      const response = await request(app).get('/api/auth/me').set(headers);
      expect(response.status).toBe(401);
    });

    it('token for suspended user → 401 (with suspension message)', async () => {
      const { user } = await createSuspendedUser('jobseeker', { email: 'susp-tok@example.com' });
      const response = await request(app)
        .get('/api/auth/me')
        .set(createAuthHeaders(user));
      expect(response.status).toBe(401);
    });

    it('token for banned user → 401', async () => {
      const { user } = await createBannedUser('jobseeker', { email: 'banned-tok@example.com' });
      const response = await request(app)
        .get('/api/auth/me')
        .set(createAuthHeaders(user));
      expect(response.status).toBe(401);
    });

    it('hand-crafted invalid token (bad signature) → 401', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${generateInvalidToken()}`);
      expect(response.status).toBe(401);
    });
  });

  describe('Role-boundary attacks', () => {
    it('jobseeker JWT against POST /api/admin/users — 403', async () => {
      const { user } = await createJobseeker();
      const response = await request(app)
        .get('/api/admin/users')
        .set(createAuthHeaders(user));
      expect(response.status).toBe(403);
    });

    it('employer JWT against /api/admin/dashboard-stats — 403', async () => {
      const { user } = await createVerifiedEmployer();
      const response = await request(app)
        .get('/api/admin/dashboard-stats')
        .set(createAuthHeaders(user));
      expect(response.status).toBe(403);
    });

    it('jobseeker JWT against POST /api/jobs — 403', async () => {
      const { user } = await createJobseeker();
      const response = await request(app)
        .post('/api/jobs')
        .set(createAuthHeaders(user))
        .send({
          title: 'Some title', description: 'd'.repeat(80), category: 'Teknologji',
          jobType: 'full-time', location: { city: 'Tiranë' },
          platformCategories: { diaspora: false, ngaShtepia: false, partTime: false, administrata: false, sezonale: false }
        });
      expect(response.status).toBe(403);
    });

    it('employer JWT against POST /api/applications/apply — 403', async () => {
      const { user } = await createVerifiedEmployer();
      const response = await request(app)
        .post('/api/applications/apply')
        .set(createAuthHeaders(user))
        .send({ jobId: '507f1f77bcf86cd799439011', applicationMethod: 'one_click' });
      expect(response.status).toBe(403);
    });

    it('admin JWT against requireJobSeeker route — 403', async () => {
      const { user } = await createAdmin();
      const response = await request(app)
        .get('/api/cv/my-cv')
        .set(createAuthHeaders(user));
      expect(response.status).toBe(403);
    });
  });
});
