/**
 * #73 — an expired suspension is lifted with an atomic update, not a
 * full-document save(). A user whose stored document violates a validator
 * added later (here: a legacy phone number the current `match` rejects) used
 * to get 500 "Gabim në autentifikim" on EVERY request once the suspension
 * expired, because checkSuspensionStatus() → this.save() re-validated the
 * whole document; the 15-minute cron failed the same way.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import mongoose from 'mongoose';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import app from '../../server.js';
import User from '../../src/models/User.js';
import { createJobseeker, createEmployer } from '../factories/user.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';

const DAY = 24 * 60 * 60 * 1000;

// Write raw (bypassing Mongoose validation), the way legacy data exists.
async function rawSet(userId, set) {
  await mongoose.connection.db.collection('users').updateOne({ _id: userId }, { $set: set });
}

async function expiredSuspensionWithLegacyPhone(createFn = createJobseeker, extra = {}) {
  const { user } = await createFn();
  await rawSet(user._id, {
    status: 'suspended',
    'profile.phone': '069 12', // fails the current /^\+\d{8,}$/ match
    suspensionDetails: {
      reason: 'Spam',
      suspendedAt: new Date(Date.now() - 8 * DAY),
      expiresAt: new Date(Date.now() - 60 * 1000),
      permanent: false,
      ...extra,
    },
  });
  return user;
}

describe('#73 expired suspension lift is atomic', () => {
  beforeAll(connectTestDB);
  afterEach(clearTestDB);
  afterAll(closeTestDB);

  it('the legacy document really is invalid (precondition: save() would throw)', async () => {
    const user = await expiredSuspensionWithLegacyPhone();
    const doc = await User.findById(user._id);
    await expect(doc.validate()).rejects.toThrow(/Numri i telefonit duhet të ketë të paktën 8 shifra/);
  });

  it('authenticated request after expiry → 200 (was 500), status active, suspensionDetails removed, invalid field untouched', async () => {
    const user = await expiredSuspensionWithLegacyPhone();
    const r = await request(app).get('/api/auth/me').set(createAuthHeaders(user));
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);

    const raw = await mongoose.connection.db.collection('users').findOne({ _id: user._id });
    expect(raw.status).toBe('active');
    expect(raw.suspensionDetails).toBeUndefined();
    // Only the status paths were written — the legacy value is not "fixed" or lost.
    expect(raw.profile.phone).toBe('069 12');
  });

  it('a suspension that has NOT expired is still enforced (401 with the Albanian message)', async () => {
    const { user } = await createJobseeker();
    await rawSet(user._id, {
      status: 'suspended',
      suspensionDetails: { reason: 'Spam', suspendedAt: new Date(), expiresAt: new Date(Date.now() + DAY) },
    });
    const r = await request(app).get('/api/auth/me').set(createAuthHeaders(user));
    expect(r.status).toBe(401);
    expect(r.body.message).toMatch(/^Llogaria juaj është pezulluar deri më .*Arsyeja: Spam$/);
    const raw = await mongoose.connection.db.collection('users').findOne({ _id: user._id });
    expect(raw.status).toBe('suspended');
  });

  it('reuses the W2-1 lift rule: an unverified employer goes back to pending_verification', async () => {
    const user = await expiredSuspensionWithLegacyPhone(createEmployer, { previousStatus: 'pending_verification' });
    await User.findById(user._id).then((u) => u.checkSuspensionStatus());
    const raw = await mongoose.connection.db.collection('users').findOne({ _id: user._id });
    expect(raw.status).toBe('pending_verification');
    expect(raw.suspensionDetails).toBeUndefined();
  });

  it('a re-suspension that lands between read and lift is NOT lifted (compare-and-set on expiresAt)', async () => {
    const user = await expiredSuspensionWithLegacyPhone();
    const stale = await User.findById(user._id); // read the expired suspension
    const renewedUntil = new Date(Date.now() + 7 * DAY);
    await rawSet(user._id, { 'suspensionDetails.expiresAt': renewedUntil }); // admin re-suspends
    await stale.checkSuspensionStatus();
    expect(stale.status).toBe('suspended'); // in-memory view refreshed from the DB
    const raw = await mongoose.connection.db.collection('users').findOne({ _id: user._id });
    expect(raw.status).toBe('suspended');
    expect(raw.suspensionDetails.expiresAt.getTime()).toBe(renewedUntil.getTime());
  });

  it('the 15-minute cron (checkExpiredSuspensions) lifts every expired account, invalid legacy data included', async () => {
    const a = await expiredSuspensionWithLegacyPhone();
    const b = await expiredSuspensionWithLegacyPhone();
    const { user: c } = await createJobseeker();
    await rawSet(c._id, {
      status: 'suspended',
      suspensionDetails: { reason: 'x', suspendedAt: new Date(), expiresAt: new Date(Date.now() + DAY) },
    });

    const lifted = await User.checkExpiredSuspensions();
    expect(lifted).toBe(2);
    const statuses = await mongoose.connection.db.collection('users')
      .find({ _id: { $in: [a._id, b._id, c._id] } }).project({ status: 1 }).toArray();
    const byId = Object.fromEntries(statuses.map((s) => [String(s._id), s.status]));
    expect(byId).toEqual({ [String(a._id)]: 'active', [String(b._id)]: 'active', [String(c._id)]: 'suspended' });
  });
});
