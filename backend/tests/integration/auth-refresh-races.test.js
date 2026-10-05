/**
 * Review follow-up to O-14 — sessions must not survive a password change
 * through refresh races, and one refresh token must not fork.
 *
 *  1. Fork: refresh rotated with verify → $pull → $push. N parallel refreshes
 *     with ONE token all passed the "still on the allow-list" check before any
 *     $pull, so several new tokens were minted and all stayed usable.
 *  2. Change/reset racing a refresh: a refresh that verified before the
 *     password change's `$set: { refreshTokens: [] }` pushed its new token
 *     after it → the attacker's session lived on.
 *  3. Same second: access tokens were invalidated with iat < passwordChangedAt
 *     at 1-second resolution, so a token minted in the same second as the
 *     change kept working.
 *
 * Fix: atomic conditional rotation (replace the presented token in place, or
 * 401 when it is no longer there) + a per-user tokenVersion embedded in every
 * access/refresh token and bumped by change/reset password.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import User from '../../src/models/User.js';
import { createJobseeker } from '../factories/user.factory.js';

const PASSWORD = 'Password123';
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

async function login(email, password = PASSWORD) {
  const r = await request(app).post('/api/auth/login').send({ email, password });
  expect(r.status).toBe(200);
  return r.body.data;
}
const refresh = (refreshToken) => request(app).post('/api/auth/refresh').send({ refreshToken });
const me = (token) => request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
const storedHashes = async (id) =>
  (await User.findById(id).select('refreshTokens').lean()).refreshTokens.map((t) => t.token);

describe('refresh races (O-14 follow-up)', () => {
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

  it('5 parallel refreshes with ONE token → exactly one 200; only its new token is stored and usable', async () => {
    const { user } = await createJobseeker({ email: 'fork@example.com', password: PASSWORD });
    const { refreshToken } = await login(user.email);

    const rs = await Promise.all(Array.from({ length: 5 }, () => refresh(refreshToken)));
    const ok = rs.filter((r) => r.status === 200);
    const rejected = rs.filter((r) => r.status === 401);
    expect(ok).toHaveLength(1);
    expect(rejected).toHaveLength(4);
    for (const r of rejected) expect(r.body.message).toBe('Refresh token i revokuar');

    const winner = ok[0].body.data.refreshToken;
    expect(await storedHashes(user._id)).toEqual([sha256(winner)]);
    expect((await refresh(winner)).status).toBe(200);
  });

  it('change-password racing a refresh (12 trials): the refreshing session never survives', async () => {
    const survivors = [];
    for (let trial = 0; trial < 12; trial++) {
      const email = `race-${trial}@example.com`;
      const pw = `Password${trial}A`;
      const { user } = await createJobseeker({ email, password: pw });
      const attacker = await login(email, pw);
      const owner = await login(email, pw);

      const [ref, change] = await Promise.all([
        refresh(attacker.refreshToken),
        request(app).put('/api/auth/change-password')
          .set('Authorization', `Bearer ${owner.token}`)
          .send({ currentPassword: pw, newPassword: `NewPassword${trial}B` }),
      ]);
      expect(change.status).toBe(200);

      if (ref.status === 200) {
        const accessAlive = (await me(ref.body.data.token)).status === 200;
        const refreshAlive = (await refresh(ref.body.data.refreshToken)).status === 200;
        if (accessAlive || refreshAlive) survivors.push({ trial, accessAlive, refreshAlive });
      }
      // The owner's fresh pair from change-password keeps working.
      expect((await me(change.body.data.token)).status).toBe(200);
      await User.deleteOne({ _id: user._id });
    }
    expect(survivors).toEqual([]);
  }, 60000);

  it('reset-password racing a refresh (8 trials): the refreshing session never survives', async () => {
    const survivors = [];
    for (let trial = 0; trial < 8; trial++) {
      const email = `reset-race-${trial}@example.com`;
      const { user } = await createJobseeker({ email, password: PASSWORD });
      const attacker = await login(email);
      const raw = crypto.randomBytes(32).toString('hex');
      await User.updateOne({ _id: user._id }, {
        $set: { passwordResetToken: sha256(raw), passwordResetExpires: new Date(Date.now() + 600_000) },
      });

      const [ref, reset] = await Promise.all([
        refresh(attacker.refreshToken),
        request(app).post('/api/auth/reset-password').send({ token: raw, password: `ResetPass${trial}9` }),
      ]);
      expect(reset.status).toBe(200);
      if (ref.status === 200) {
        const accessAlive = (await me(ref.body.data.token)).status === 200;
        const refreshAlive = (await refresh(ref.body.data.refreshToken)).status === 200;
        if (accessAlive || refreshAlive) survivors.push({ trial, accessAlive, refreshAlive });
      }
      expect((await me(attacker.token)).status).toBe(401);
      await User.deleteOne({ _id: user._id });
    }
    expect(survivors).toEqual([]);
  }, 60000);

  it('same second: an access token minted moments before the change is rejected (no 1-second iat window)', async () => {
    const { user } = await createJobseeker({ email: 'same-second@example.com', password: PASSWORD });
    // The owner's token is pre-minted (no login bcrypt), so the change lands
    // ~0.5 s after the other device's login — inside the same second, which
    // the old iat < passwordChangedAt check could not see.
    const ownerToken = jwt.sign({ id: user._id, email: user.email, userType: 'jobseeker' }, process.env.JWT_SECRET, { expiresIn: '1h' });
    await new Promise((r) => setTimeout(r, 1000 - (Date.now() % 1000) + 20));
    const second = Math.floor(Date.now() / 1000);
    const other = await login(user.email);
    const change = await request(app).put('/api/auth/change-password')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ currentPassword: PASSWORD, newPassword: 'NewPassword456' });
    expect(change.status).toBe(200);
    expect(jwt.decode(other.token).iat).toBe(second);

    const r = await me(other.token);
    expect(r.status).toBe(401);
    expect(r.body.message).toBe('Fjalëkalimi i llogarisë u ndryshua. Ju lutemi kyçuni përsëri.');
    const ref = await refresh(other.refreshToken);
    expect(ref.status).toBe(401);
    expect(ref.body.message).toBe('Refresh token i revokuar');
    expect((await me(change.body.data.token)).status).toBe(200);
  });
});
