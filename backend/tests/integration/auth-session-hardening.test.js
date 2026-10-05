/**
 * Session hardening — O-40, O-41, O-14, O-52.
 *
 * O-40: the frontend refreshed WITHOUT credentials, so cross-origin the
 *       refresh_token cookie was never rotated: browsers held a stale cookie
 *       next to the live localStorage token. /refresh preferred the cookie
 *       (→ 401, forced logout) and /logout revoked only the cookie (→ the
 *       live token survived logout for 7 days). Now /refresh tries each
 *       presented copy and /logout revokes every copy.
 * O-41: cookie Max-Age was hard-coded (15 min) instead of following the JWT.
 * O-14: change-password revoked every refresh token incl. this device's and
 *       issued nothing → silent logout; other devices' access tokens stayed
 *       valid until expiry. Now this device gets a fresh pair and access
 *       tokens issued before the change are rejected everywhere.
 * O-52: pending employers can log in; publishing answers a clear 403.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import User from '../../src/models/User.js';
import { createJobseeker, createUnverifiedEmployer } from '../factories/user.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import { optionalAuth } from '../../src/middleware/auth.js';

const PASSWORD = 'Password123';
const PASSWORD_CHANGED_MESSAGE = 'Fjalëkalimi i llogarisë u ndryshua. Ju lutemi kyçuni përsëri.';

function parseSetCookie(header) {
  const out = {};
  for (const c of (Array.isArray(header) ? header : header ? [header] : [])) {
    const [pair, ...attrs] = c.split(';').map((s) => s.trim());
    const eq = pair.indexOf('=');
    const attrMap = {};
    for (const a of attrs) {
      const [k, v] = a.split('=');
      attrMap[k.toLowerCase()] = v === undefined ? true : v;
    }
    out[pair.slice(0, eq)] = { value: pair.slice(eq + 1), attrs: attrMap };
  }
  return out;
}

async function login(email, password = PASSWORD) {
  const r = await request(app).post('/api/auth/login').send({ email, password });
  expect(r.status).toBe(200);
  return { token: r.body.data.token, refreshToken: r.body.data.refreshToken, res: r };
}

const refresh = ({ cookie, body } = {}) => {
  const req = request(app).post('/api/auth/refresh');
  if (cookie) req.set('Cookie', `refresh_token=${cookie}`);
  return req.send(body ? { refreshToken: body } : {});
};

const storedRefreshHashes = async (userId) =>
  (await User.findById(userId).select('refreshTokens').lean()).refreshTokens.map((t) => t.token);
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

// An access token that predates "now" by `seconds` (as if issued on another
// device before the password change).
function backdatedAccessToken(user, seconds = 10) {
  const iat = Math.floor(Date.now() / 1000) - seconds;
  return jwt.sign(
    { id: user._id, email: user.email, userType: user.userType, iat },
    process.env.JWT_SECRET,
    { expiresIn: '1h' },
  );
}

describe('session hardening (O-40 / O-41 / O-14 / O-52)', () => {
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

  describe('O-40 — POST /api/auth/refresh with cookie and body copies', () => {
    it('stale (rotated-out) cookie + live body token → 200, rotates the live one', async () => {
      const { user } = await createJobseeker({ email: 'stale-cookie@example.com', password: PASSWORD });
      const { refreshToken: r1 } = await login(user.email);
      const rotated = await refresh({ body: r1 });
      expect(rotated.status).toBe(200);
      const r2 = rotated.body.data.refreshToken; // live; r1 is now revoked

      // What a browser on the old frontend sent: cookie still r1, localStorage r2.
      const r = await refresh({ cookie: r1, body: r2 });
      expect(r.status).toBe(200);
      const r3 = r.body.data.refreshToken;
      expect(r3).not.toBe(r2);

      // The response re-sets both cookies to the new pair.
      const cookies = parseSetCookie(r.headers['set-cookie']);
      expect(cookies.refresh_token.value).toBe(r3);
      expect(cookies.auth_token.value).toBe(r.body.data.token);

      // r2 was consumed by the rotation; only r3 is on the allow-list.
      expect(await storedRefreshHashes(user._id)).toEqual([sha256(r3)]);
      const replay = await refresh({ body: r2 });
      expect(replay.status).toBe(401);
      expect(replay.body.message).toBe('Refresh token i revokuar');
    });

    it('expired cookie + live body token → 200 (an expired copy no longer ends the session)', async () => {
      const { user } = await createJobseeker({ email: 'expired-cookie@example.com', password: PASSWORD });
      const { refreshToken: live } = await login(user.email);
      const expired = jwt.sign(
        { id: user._id, email: user.email, userType: 'jobseeker', jti: 'x', exp: Math.floor(Date.now() / 1000) - 60 },
        process.env.JWT_REFRESH_SECRET,
      );
      const r = await refresh({ cookie: expired, body: live });
      expect(r.status).toBe(200);
      expect(await storedRefreshHashes(user._id)).toEqual([sha256(r.body.data.refreshToken)]);
    });

    it('live cookie + garbage body → 200 via the cookie', async () => {
      const { user } = await createJobseeker({ email: 'live-cookie@example.com', password: PASSWORD });
      const { refreshToken } = await login(user.email);
      const r = await refresh({ cookie: refreshToken, body: 'not-a-jwt' });
      expect(r.status).toBe(200);
    });

    it('both copies revoked → 401 "Refresh token i revokuar"', async () => {
      const { user } = await createJobseeker({ email: 'both-stale@example.com', password: PASSWORD });
      const { refreshToken: r1 } = await login(user.email);
      const r2 = (await refresh({ body: r1 })).body.data.refreshToken;
      await refresh({ body: r2 }); // r2 rotated out as well
      const r = await refresh({ cookie: r1, body: r2 });
      expect(r.status).toBe(401);
      expect(r.body.message).toBe('Refresh token i revokuar');
    });

    it('only an expired copy → 401 with the expired message', async () => {
      const { user } = await createJobseeker({ email: 'only-expired@example.com', password: PASSWORD });
      const expired = jwt.sign(
        { id: user._id, jti: 'y', exp: Math.floor(Date.now() / 1000) - 60 },
        process.env.JWT_REFRESH_SECRET,
      );
      const r = await refresh({ cookie: expired });
      expect(r.status).toBe(401);
      expect(r.body.message).toBe('Refresh token ka skaduar, ju lutemi kyçuni përsëri');
    });

    it('non-string body token is ignored → 401 "Refresh token është i detyrueshëm"', async () => {
      const r = await request(app).post('/api/auth/refresh').send({ refreshToken: { a: 1 } });
      expect(r.status).toBe(401);
      expect(r.body.message).toBe('Refresh token është i detyrueshëm');
    });
  });

  describe('O-40 — POST /api/auth/logout revokes every presented copy', () => {
    it('stale cookie + live body (the O-40 scenario) → the live token is revoked', async () => {
      const { user } = await createJobseeker({ email: 'logout-stale@example.com', password: PASSWORD });
      const { refreshToken: r1 } = await login(user.email);
      const rotated = await refresh({ body: r1 });
      const { token: access, refreshToken: r2 } = rotated.body.data;

      const out = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${access}`)
        .set('Cookie', `refresh_token=${r1}`)
        .send({ refreshToken: r2 });
      expect(out.status).toBe(200);

      // Before the fix only the (already dead) cookie copy was revoked and r2
      // kept working for 7 days.
      const after = await refresh({ body: r2 });
      expect(after.status).toBe(401);
      expect(after.body.message).toBe('Refresh token i revokuar');
      expect(await storedRefreshHashes(user._id)).toEqual([]);
    });

    it('two live sessions presented (cookie A + body B) → both revoked, a third session survives', async () => {
      const { user } = await createJobseeker({ email: 'logout-two@example.com', password: PASSWORD });
      const a = await login(user.email);
      const b = await login(user.email);
      const c = await login(user.email);

      const out = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${a.token}`)
        .set('Cookie', `refresh_token=${a.refreshToken}`)
        .send({ refreshToken: b.refreshToken });
      expect(out.status).toBe(200);

      expect((await refresh({ body: a.refreshToken })).status).toBe(401);
      expect((await refresh({ body: b.refreshToken })).status).toBe(401);
      expect(await storedRefreshHashes(user._id)).toEqual([sha256(c.refreshToken)]);
    });
  });

  describe('O-41 — cookie lifetime follows the JWT', () => {
    it('login sets auth_token Max-Age = access-token lifetime and refresh_token Max-Age = refresh lifetime', async () => {
      const { user } = await createJobseeker({ email: 'maxage@example.com', password: PASSWORD });
      const { token, refreshToken, res } = await login(user.email);
      const cookies = parseSetCookie(res.headers['set-cookie']);

      const access = jwt.decode(token);
      const refreshClaims = jwt.decode(refreshToken);
      const accessMaxAge = Number(cookies.auth_token.attrs['max-age']);
      const refreshMaxAge = Number(cookies.refresh_token.attrs['max-age']);
      // exp-based, 1 s resolution; the fixed 900 s / 604800 s are gone.
      expect(accessMaxAge).toBeGreaterThanOrEqual(access.exp - access.iat - 2);
      expect(accessMaxAge).toBeLessThanOrEqual(access.exp - access.iat);
      expect(refreshMaxAge).toBeGreaterThanOrEqual(refreshClaims.exp - refreshClaims.iat - 2);
      expect(refreshMaxAge).toBeLessThanOrEqual(refreshClaims.exp - refreshClaims.iat);
    });
  });

  describe('O-14 — change-password keeps this session and ends the others', () => {
    it('returns + sets a fresh pair; other devices lose both their access and refresh tokens', async () => {
      const { user } = await createJobseeker({ email: 'chpw@example.com', password: PASSWORD });
      const deviceA = await login(user.email);
      const deviceB = await login(user.email);
      const deviceBAccess = backdatedAccessToken(user, 10);

      // Sanity: B's access token works before the change.
      expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${deviceBAccess}`)).status).toBe(200);

      const r = await request(app)
        .put('/api/auth/change-password')
        .set('Authorization', `Bearer ${deviceA.token}`)
        .send({ currentPassword: PASSWORD, newPassword: 'NewPassword456' });
      expect(r.status).toBe(200);
      expect(r.body.message).toBe('Fjalëkalimi u ndryshua me sukses');
      const { token: newAccess, refreshToken: newRefresh } = r.body.data;
      expect(jwt.verify(newAccess, process.env.JWT_SECRET).id).toBe(String(user._id));
      expect(jwt.verify(newRefresh, process.env.JWT_REFRESH_SECRET).id).toBe(String(user._id));

      const cookies = parseSetCookie(r.headers['set-cookie']);
      expect(cookies.auth_token.value).toBe(newAccess);
      expect(cookies.refresh_token.value).toBe(newRefresh);

      // This device: new access token works now, new refresh token works later.
      expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${newAccess}`)).status).toBe(200);
      expect(await storedRefreshHashes(user._id)).toEqual([sha256(newRefresh)]);
      expect((await refresh({ body: newRefresh })).status).toBe(200);

      // Other device: its access token dies immediately, its refresh token too.
      const meB = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${deviceBAccess}`);
      expect(meB.status).toBe(401);
      expect(meB.body.message).toBe(PASSWORD_CHANGED_MESSAGE);
      const refB = await refresh({ body: deviceB.refreshToken });
      expect(refB.status).toBe(401);
      expect(refB.body.message).toBe('Refresh token i revokuar');

      // One session generation consumed; this device's new tokens carry it.
      const stored = await User.findById(user._id).select('+tokenVersion').lean();
      expect(stored.tokenVersion).toBe(1);
      expect(jwt.decode(newAccess).tv).toBe(1);
      expect(jwt.decode(newRefresh).tv).toBe(1);

      expect((await request(app).post('/api/auth/login').send({ email: user.email, password: PASSWORD })).status).toBe(401);
      expect((await request(app).post('/api/auth/login').send({ email: user.email, password: 'NewPassword456' })).status).toBe(200);
    });

    it('an older-generation token: authenticate → 401, optionalAuth → anonymous; a current one works in both', async () => {
      const { user } = await createJobseeker({ email: 'chpw-optional@example.com', password: PASSWORD });
      // Minted before the field existed (no tv claim) = generation 0.
      const stale = backdatedAccessToken(user, 10);
      await User.updateOne({ _id: user._id }, { $set: { tokenVersion: 3 } });
      const fresh = jwt.sign({ id: user._id, email: user.email, userType: 'jobseeker', tv: 3 }, process.env.JWT_SECRET, { expiresIn: '1h' });
      const wrongGen = jwt.sign({ id: user._id, email: user.email, userType: 'jobseeker', tv: 2 }, process.env.JWT_SECRET, { expiresIn: '1h' });
      expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${wrongGen}`)).status).toBe(401);

      const strict = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${stale}`);
      expect(strict.status).toBe(401);
      expect(strict.body.message).toBe(PASSWORD_CHANGED_MESSAGE);
      expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${fresh}`)).status).toBe(200);

      const runOptional = async (token) => {
        const req = { headers: { authorization: `Bearer ${token}` }, cookies: {} };
        await optionalAuth(req, {}, () => {});
        return req.user;
      };
      expect(await runOptional(stale)).toBeUndefined();
      expect(await runOptional(wrongGen)).toBeUndefined();
      expect(String((await runOptional(fresh))._id)).toBe(String(user._id));
    });

    it('reset-password also ends live access tokens', async () => {
      const { user } = await createJobseeker({ email: 'reset-ends@example.com', password: PASSWORD });
      const stale = backdatedAccessToken(user, 10);
      const raw = crypto.randomBytes(32).toString('hex');
      await User.updateOne({ _id: user._id }, {
        $set: { passwordResetToken: sha256(raw), passwordResetExpires: new Date(Date.now() + 600_000) },
      });

      const r = await request(app).post('/api/auth/reset-password').send({ token: raw, password: 'ResetPass789' });
      expect(r.status).toBe(200);

      const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${stale}`);
      expect(me.status).toBe(401);
      expect(me.body.message).toBe(PASSWORD_CHANGED_MESSAGE);
    });

    it('tokenVersion never appears in user payloads (but is embedded in the tokens)', async () => {
      const { user } = await createJobseeker({ email: 'chpw-hidden@example.com', password: PASSWORD });
      await User.updateOne({ _id: user._id }, { $set: { tokenVersion: 2 } });
      const { token, refreshToken, res } = await login(user.email);
      expect(jwt.decode(token).tv).toBe(2);
      expect(jwt.decode(refreshToken).tv).toBe(2);
      expect(Object.keys(res.body.data.user)).not.toContain('tokenVersion');
      const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
      expect(me.status).toBe(200);
      expect(JSON.stringify(me.body)).not.toContain('tokenVersion');
    });

    it('non-string currentPassword / newPassword → 400 validation, not 500', async () => {
      const { user } = await createJobseeker({ email: 'chpw-types@example.com', password: PASSWORD });
      const headers = createAuthHeaders(user);
      const r1 = await request(app).put('/api/auth/change-password').set(headers)
        .send({ currentPassword: 12345678, newPassword: 'NewPassword456' });
      expect(r1.status).toBe(400);
      expect(r1.body.errors).toContainEqual({ field: 'currentPassword', message: 'Fjalëkalimi aktual është i detyrueshëm' });
      const r2 = await request(app).put('/api/auth/change-password').set(headers)
        .send({ currentPassword: PASSWORD, newPassword: ['NewPassword456'] });
      expect(r2.status).toBe(400);
      expect(r2.body.errors).toContainEqual({ field: 'newPassword', message: 'Fjalëkalimi i ri duhet të jetë tekst' });
    });
  });

  describe('O-52 — pending employers log in; publishing is gated with a clear 403', () => {
    it('pending employer: login 200, dashboard endpoints 200, POST /api/jobs → 403 EMPLOYER_VERIFICATION_PENDING', async () => {
      const { user, plainPassword } = await createUnverifiedEmployer({ email: 'pending-emp@example.com' });
      const { token } = await login(user.email, plainPassword);
      const auth = { Authorization: `Bearer ${token}` };

      const myJobs = await request(app).get('/api/jobs/employer/my-jobs').set(auth);
      expect(myJobs.status).toBe(200);
      expect(myJobs.body.data.jobs).toEqual([]);
      const profile = await request(app).get('/api/users/profile').set(auth);
      expect(profile.status).toBe(200);
      expect(profile.body.data.user.profile.employerProfile.verified).toBe(false);

      const post = await request(app).post('/api/jobs').set(auth).send({ title: 'X' });
      expect(post.status).toBe(403);
      expect(post.body).toEqual({
        success: false,
        code: 'EMPLOYER_VERIFICATION_PENDING',
        message: 'Llogaria juaj si punëdhënës është në pritje të verifikimit nga administratori. Do të mund të publikoni punë sapo të verifikohet — do t\'ju njoftojmë me email.',
      });
    });

    it('rejected employer: POST /api/jobs → 403 EMPLOYER_VERIFICATION_REJECTED', async () => {
      const { user, plainPassword } = await createUnverifiedEmployer({ email: 'rejected-emp@example.com' });
      await User.updateOne({ _id: user._id }, { $set: { 'profile.employerProfile.verificationStatus': 'rejected' } });
      const { token } = await login(user.email, plainPassword);
      const post = await request(app).post('/api/jobs').set('Authorization', `Bearer ${token}`).send({ title: 'X' });
      expect(post.status).toBe(403);
      expect(post.body.code).toBe('EMPLOYER_VERIFICATION_REJECTED');
      expect(post.body.message).toBe('Llogaria juaj si punëdhënës nuk u aprovua, prandaj nuk mund të publikoni punë. Për më shumë informacion na shkruani në info@advance.al.');
    });
  });
});
