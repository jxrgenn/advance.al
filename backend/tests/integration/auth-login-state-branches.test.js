/**
 * Phase 28 — coverage push for auth.js POST /login state branches:
 *   - isDeleted/status='deleted' user → 401 (L586-590)
 *   - employer with status='pending_verification' → 200 (O-52 owner ruling:
 *     pending employers can log in; publishing stays gated by
 *     requireVerifiedEmployer — see auth-session-hardening.test.js)
 *   - suspended user with expiresAt date → expiry-text branch (L598-600)
 *
 * Existing auth.test.js covers active/suspended/banned/wrong-password.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createJobseeker, createUnverifiedEmployer, createSuspendedUser } from '../factories/user.factory.js';
import User from '../../src/models/User.js';

describe('auth.js — POST /login state branches', () => {
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

  it('rejects soft-deleted user even with correct password (L586-590)', async () => {
    const { user, plainPassword } = await createJobseeker({ email: 'softdel@example.com' });
    // Soft-delete the user
    await User.updateOne(
      { _id: user._id },
      { $set: { isDeleted: true, status: 'deleted', deletedAt: new Date() } }
    );

    const r = await request(app)
      .post('/api/auth/login')
      .send({ email: 'softdel@example.com', password: plainPassword });
    expect(r.status).toBe(401);
    expect(r.body.message).toMatch(/çaktivizuar/i);
  });

  it('pending_verification employer CAN log in → 200 with tokens (O-52)', async () => {
    const { user, plainPassword } = await createUnverifiedEmployer({ email: 'unverif-emp@example.com' });
    expect(user.status).toBe('pending_verification');

    const r = await request(app)
      .post('/api/auth/login')
      .send({ email: 'unverif-emp@example.com', password: plainPassword });
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.data.user.email).toBe('unverif-emp@example.com');
    expect(r.body.data.user.status).toBe('pending_verification');
    expect(r.body.data.user.profile.employerProfile.verified).toBe(false);
    expect(typeof r.body.data.token).toBe('string');
    expect(typeof r.body.data.refreshToken).toBe('string');
  });

  it('suspended user with expiresAt → message includes expiry date (L598-600)', async () => {
    const { user, plainPassword } = await createSuspendedUser('jobseeker', { email: 'susp-exp@example.com' });
    // Set explicit expiry date
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await User.updateOne(
      { _id: user._id },
      { $set: { 'suspensionDetails.expiresAt': futureDate, 'suspensionDetails.reason': 'Spam reports' } }
    );

    const r = await request(app)
      .post('/api/auth/login')
      .send({ email: 'susp-exp@example.com', password: plainPassword });
    expect(r.status).toBe(401);
    expect(r.body.message).toMatch(/pezulluar.*deri më/i);
    expect(r.body.message).toMatch(/Spam reports/i);
  });

  it('suspended user without expiresAt → "përgjithmonë" branch (L600 else)', async () => {
    const { user, plainPassword } = await createSuspendedUser('jobseeker', { email: 'susp-perm@example.com' });
    // Clear expiresAt
    await User.updateOne(
      { _id: user._id },
      { $unset: { 'suspensionDetails.expiresAt': 1 } }
    );

    const r = await request(app)
      .post('/api/auth/login')
      .send({ email: 'susp-perm@example.com', password: plainPassword });
    expect(r.status).toBe(401);
    expect(r.body.message).toMatch(/përgjithmonë/i);
  });
});
