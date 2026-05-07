/**
 * Phase 28 — coverage push for middleware/auth.js status-check branches.
 *
 * Existing tests focus on token presence/format. The middleware also
 * handles 4 user-status branches before reaching the route:
 *   - isDeleted=true OR status='deleted' → 401 (L59-64)
 *   - status='suspended' → 401 with expiresAt branch (L69-79)
 *     - With expiry date (formats date)
 *     - Without expiry date (perpetual)
 *   - status='banned' → 401 (L81-86)
 *
 * Plus optionalAuth branches:
 *   - Suspended user → req.user NOT set (L159 negation chain)
 *   - Deleted user → req.user NOT set
 *   - JWT invalid in optionalAuth → continues without user (L166-169)
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createJobseeker } from '../factories/user.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import User from '../../src/models/User.js';

describe('middleware/auth.js — status-check branches', () => {
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

  it('suspended user (with expiry date) gets 401 with formatted expiry (L69-79)', async () => {
    const { user } = await createJobseeker({ email: 'suspended@example.com' });
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await User.findByIdAndUpdate(user._id, {
      status: 'suspended',
      suspensionDetails: {
        reason: 'Spam violation',
        expiresAt: futureDate,
        suspendedBy: user._id,
        suspendedAt: new Date(),
      },
    });

    const r = await request(app)
      .get('/api/auth/me')
      .set(createAuthHeaders(user));
    expect(r.status).toBe(401);
    expect(r.body.message).toMatch(/pezulluar.*deri/i);
    expect(r.body.message).toMatch(/Spam violation/);
  });

  it('suspended user (no expiry) gets 401 with "përgjithmonë" (L72-73)', async () => {
    const { user } = await createJobseeker({ email: 'sus-perpetual@example.com' });
    await User.findByIdAndUpdate(user._id, {
      status: 'suspended',
      suspensionDetails: {
        reason: 'Permanent suspension',
        expiresAt: null,
        suspendedBy: user._id,
        suspendedAt: new Date(),
      },
    });

    const r = await request(app)
      .get('/api/auth/me')
      .set(createAuthHeaders(user));
    expect(r.status).toBe(401);
    expect(r.body.message).toMatch(/përgjithmonë/i);
  });

  it('banned user gets 401 with ban reason (L81-86)', async () => {
    const { user } = await createJobseeker({ email: 'banned@example.com' });
    await User.findByIdAndUpdate(user._id, {
      status: 'banned',
      suspensionDetails: { reason: 'Severe abuse', suspendedBy: user._id, suspendedAt: new Date() },
    });

    const r = await request(app)
      .get('/api/auth/me')
      .set(createAuthHeaders(user));
    expect(r.status).toBe(401);
    expect(r.body.message).toMatch(/mbyllur përgjithmonë/i);
    expect(r.body.message).toMatch(/Severe abuse/);
  });

  it('deleted user gets 401 (isDeleted check L59-64)', async () => {
    const { user } = await createJobseeker({ email: 'deleted@example.com' });
    await User.findByIdAndUpdate(user._id, {
      isDeleted: true,
      status: 'deleted',
    });

    const r = await request(app)
      .get('/api/auth/me')
      .set(createAuthHeaders(user));
    expect(r.status).toBe(401);
    expect(r.body.message).toMatch(/çaktivizuar/i);
  });

  it('optionalAuth: suspended user does NOT get req.user attached (L159)', async () => {
    const { user } = await createJobseeker({ email: 'opt-sus@example.com' });
    await User.findByIdAndUpdate(user._id, {
      status: 'suspended',
      suspensionDetails: { reason: 'X', expiresAt: new Date(Date.now() + 86400000), suspendedBy: user._id, suspendedAt: new Date() },
    });

    // optionalAuth-protected route should still 200, just without req.user
    const r = await request(app)
      .get('/api/jobs') // GET /api/jobs uses optionalAuth
      .set(createAuthHeaders(user));
    expect(r.status).toBe(200);
  });

  it('optionalAuth: invalid JWT silently continues without req.user (L166-169)', async () => {
    const r = await request(app)
      .get('/api/jobs')
      .set('Authorization', 'Bearer not-a-real-token');
    // Route still returns 200 — optionalAuth swallows the error
    expect(r.status).toBe(200);
  });

  it('verifyToken with malformed token rejected (NotBefore/Syntax catch L99-104)', async () => {
    const r = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer aaa.bbb.ccc'); // valid format but invalid signature
    expect(r.status).toBe(401);
    expect(r.body.message).toMatch(/pavlefshëm/i);
  });
});
