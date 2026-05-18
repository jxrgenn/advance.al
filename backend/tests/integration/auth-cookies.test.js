/**
 * Round O-F — httpOnly cookie auth + refresh-token replay
 *
 * Verifies the bidirectional auth flow:
 *   - login/register set both `auth_token` and `refresh_token` httpOnly cookies
 *   - protected routes accept the cookie (no Authorization header needed)
 *   - protected routes still accept the legacy Authorization header (backward compat)
 *   - logout clears both cookies
 *   - /refresh accepts the token from cookie OR body
 *
 * Plus the audit-flagged GAP test (item #11):
 *   - refresh token rotation is enforced: replaying a used refresh token → 401
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createJobseeker } from '../factories/user.factory.js';

// Parse `Set-Cookie` array (or single string) into a normalized lookup keyed
// by cookie name → { value, attrs: {HttpOnly:true, SameSite:'Lax', ...} }.
function parseSetCookieHeader(header) {
  if (!header) return {};
  const cookies = Array.isArray(header) ? header : [header];
  const out = {};
  for (const c of cookies) {
    const [pair, ...attrs] = c.split(';').map((s) => s.trim());
    const eq = pair.indexOf('=');
    const name = pair.slice(0, eq);
    const value = pair.slice(eq + 1);
    const attrMap = {};
    for (const a of attrs) {
      const [k, v] = a.split('=');
      attrMap[k] = v === undefined ? true : v;
    }
    out[name] = { value, attrs: attrMap };
  }
  return out;
}

describe('Round O-F — auth cookies + refresh-token replay', () => {
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

  // We construct login via the existing register/login flow rather than
  // a low-level seed so we exercise the real handler end-to-end.
  async function registerAndLogin(emailLocalPart = 'cookie-user') {
    const password = 'Password123';
    const { user } = await createJobseeker({ email: `${emailLocalPart}@example.com`, password });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password });
    return { user, password, response: res };
  }

  describe('login Set-Cookie shape', () => {
    it('sets auth_token + refresh_token cookies on successful login', async () => {
      const { response } = await registerAndLogin();
      expect(response.status).toBe(200);

      const cookies = parseSetCookieHeader(response.headers['set-cookie']);
      expect(cookies.auth_token).toBeDefined();
      expect(cookies.refresh_token).toBeDefined();

      // HttpOnly so JS can't read them (XSS exfil mitigation).
      expect(cookies.auth_token.attrs.HttpOnly).toBe(true);
      expect(cookies.refresh_token.attrs.HttpOnly).toBe(true);

      // SameSite=Lax is our CSRF defense — browser refuses to attach the
      // cookie on cross-origin POST/PUT/DELETE from a malicious site.
      expect(cookies.auth_token.attrs.SameSite).toBe('Lax');
      expect(cookies.refresh_token.attrs.SameSite).toBe('Lax');

      // Refresh cookie scoped to auth routes only (defence-in-depth).
      expect(cookies.refresh_token.attrs.Path).toBe('/api/auth');
      expect(cookies.auth_token.attrs.Path).toBe('/');
    });

    it('JSON body still carries token + refreshToken (backward compat)', async () => {
      const { response } = await registerAndLogin('compat-user');
      expect(response.body.success).toBe(true);
      expect(typeof response.body.data.token).toBe('string');
      expect(typeof response.body.data.refreshToken).toBe('string');
    });
  });

  describe('protected route accepts cookie OR header', () => {
    it('accepts request with ONLY the auth_token cookie (no Authorization header)', async () => {
      const { response } = await registerAndLogin();
      const cookies = parseSetCookieHeader(response.headers['set-cookie']);
      const cookieHeader = `auth_token=${cookies.auth_token.value}`;

      const r = await request(app)
        .get('/api/users/profile')
        .set('Cookie', cookieHeader);

      expect(r.status).toBe(200);
      expect(r.body.data.user.email).toContain('@example.com');
    });

    it('still accepts the legacy Authorization: Bearer header (backward compat)', async () => {
      const { response } = await registerAndLogin('header-user');
      const token = response.body.data.token;

      const r = await request(app)
        .get('/api/users/profile')
        .set('Authorization', `Bearer ${token}`);

      expect(r.status).toBe(200);
    });

    it('rejects with 401 when neither cookie nor header is provided', async () => {
      const r = await request(app).get('/api/users/profile');
      expect(r.status).toBe(401);
    });
  });

  describe('logout clears cookies', () => {
    it('Set-Cookie clears both auth_token and refresh_token (Max-Age=0 or Expires past)', async () => {
      const { response: loginRes } = await registerAndLogin();
      const cookies = parseSetCookieHeader(loginRes.headers['set-cookie']);
      const cookieHeader = `auth_token=${cookies.auth_token.value}; refresh_token=${cookies.refresh_token.value}`;

      const r = await request(app)
        .post('/api/auth/logout')
        .set('Cookie', cookieHeader)
        .send({});

      expect(r.status).toBe(200);
      const clearCookies = parseSetCookieHeader(r.headers['set-cookie']);
      // express clearCookie() emits Expires=Thu, 01 Jan 1970 00:00:00 GMT.
      expect(clearCookies.auth_token).toBeDefined();
      expect(clearCookies.refresh_token).toBeDefined();
      expect(clearCookies.auth_token.value).toBe('');
      expect(clearCookies.refresh_token.value).toBe('');
    });
  });

  describe('/refresh accepts cookie or body', () => {
    it('accepts refresh token via httpOnly cookie (no body)', async () => {
      const { response: loginRes } = await registerAndLogin();
      const cookies = parseSetCookieHeader(loginRes.headers['set-cookie']);
      const cookieHeader = `refresh_token=${cookies.refresh_token.value}`;

      const r = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', cookieHeader)
        .send({});

      expect(r.status).toBe(200);
      expect(typeof r.body.data.token).toBe('string');
      expect(typeof r.body.data.refreshToken).toBe('string');
    });

    it('still accepts refresh token in JSON body (backward compat)', async () => {
      const { response: loginRes } = await registerAndLogin('body-refresh');
      const refreshToken = loginRes.body.data.refreshToken;

      const r = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken });

      expect(r.status).toBe(200);
      expect(typeof r.body.data.token).toBe('string');
    });
  });

  // ─── Refresh-token replay test (audit gap #11) ─────────────────────────
  // The /refresh handler rotates: removeRefreshToken(old) then
  // addRefreshToken(new). A stolen-and-replayed refresh token should fail
  // because it's no longer in the user's whitelist. This test confirms
  // that property; previously the suite had NO test exercising replay,
  // making rotation a verify-by-reading-code claim.
  describe('refresh-token replay rejection', () => {
    it('rejects a refresh token that has already been rotated out', async () => {
      const { response: loginRes } = await registerAndLogin('replay-user');
      const refreshA = loginRes.body.data.refreshToken;

      // First /refresh — should succeed and rotate A → B.
      const refresh1 = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: refreshA });
      expect(refresh1.status).toBe(200);
      expect(refresh1.body.data.refreshToken).not.toBe(refreshA);

      // Second /refresh using the ORIGINAL refresh token (replay attack).
      // Must be rejected — A has been removed from the user's whitelist.
      const refresh2 = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: refreshA });
      expect(refresh2.status).toBe(401);
    });
  });
});
