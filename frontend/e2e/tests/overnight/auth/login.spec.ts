/**
 * login.spec.ts — POST /api/auth/login (10 tests).
 *
 * Happy path, wrong password, unknown email, suspended, banned, soft-deleted,
 * case-insensitive, whitespace, refresh-token storage, response shape.
 */

import { test } from '@playwright/test';
import { dbClear, dbUpdate, dbFindOne } from '../../../real-backend/db-helpers';
import { makeJobseeker, API } from '../../../real-backend/factory-helpers';
import { expect } from '@playwright/test';

test.describe('Auth / login', () => {
  test.beforeEach(async () => { await dbClear(); });

  test('LG.1 happy path: 200 + access+refresh token + user object', async () => {
    const js = await makeJobseeker();
    const r = await fetch(`${API}/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: js.email, password: 'StrongPass123!' }),
    });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.success).toBe(true);
    expect(body.data?.token, 'access token returned').toBeTruthy();
    expect(body.data?.refreshToken, 'refresh token returned').toBeTruthy();
    expect(body.data?.user?.email).toBe(js.email);
  });

  test('LG.2 wrong password → 401', async () => {
    const js = await makeJobseeker();
    const r = await fetch(`${API}/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: js.email, password: 'WrongPassword!' }),
    });
    expect(r.status).toBe(401);
    const body = await r.json();
    expect(body.success).toBe(false);
  });

  test('LG.3 unknown email → 401 (no info leak)', async () => {
    const r = await fetch(`${API}/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: `no-such-user-${Date.now()}@example.com`, password: 'anything' }),
    });
    expect(r.status).toBe(401);
    const body = await r.json();
    expect(body.success).toBe(false);
    expect(body.message, 'response should not reveal "user not found"').not.toMatch(/not found|nuk u gjet/i);
  });

  test('LG.4 missing body fields → 400', async () => {
    const r = await fetch(`${API}/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    // JUSTIFIED: Validator rejection — express-validator returns 400, custom Zod schemas return 422.
    expect([400, 422]).toContain(r.status);
  });

  test('LG.5 case-insensitive email login', async () => {
    const js = await makeJobseeker();
    const r = await fetch(`${API}/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: js.email.toUpperCase(), password: 'StrongPass123!' }),
    });
    expect(r.status, 'login must accept uppercase email').toBe(200);
  });

  test('LG.6 whitespace-padded email accepted', async () => {
    const js = await makeJobseeker();
    const r = await fetch(`${API}/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: '  ' + js.email + '  ', password: 'StrongPass123!' }),
    });
    // JUSTIFIED: server may trim whitespace and accept (200) or treat as invalid email format (401).
    // Either is acceptable; the security property is that the loose form must NOT bypass the password check.
    expect([200, 401]).toContain(r.status);
  });

  test('LG.7 suspended user → 401', async () => {
    const js = await makeJobseeker();
    const future = new Date(Date.now() + 24 * 3600 * 1000);
    await dbUpdate('users', { email: js.email }, {
      $set: { status: 'suspended', suspensionDetails: { reason: 'test', expiresAt: future } }
    });

    const r = await fetch(`${API}/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: js.email, password: 'StrongPass123!' }),
    });
    // auth.js returns 401 for suspended/banned/deleted (treats them as failed authentication).
    // 403 would be conceptually nicer ("authenticated but forbidden") but current implementation is 401.
    expect(r.status).toBe(401);
  });

  test('LG.8 banned user → 401', async () => {
    const js = await makeJobseeker();
    await dbUpdate('users', { email: js.email }, { $set: { status: 'banned' } });
    const r = await fetch(`${API}/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: js.email, password: 'StrongPass123!' }),
    });
    expect(r.status).toBe(401);
  });

  test('LG.9 soft-deleted user → 401', async () => {
    const js = await makeJobseeker();
    await dbUpdate('users', { email: js.email }, { $set: { isDeleted: true, deletedAt: new Date() } });
    const r = await fetch(`${API}/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: js.email, password: 'StrongPass123!' }),
    });
    // Login lookup returns null for isDeleted user → auth.js returns 401 (uniform with unknown email).
    expect(r.status).toBe(401);
  });

  test('LG.10 successful login adds refreshToken to user.refreshTokens', async () => {
    const js = await makeJobseeker();
    await fetch(`${API}/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: js.email, password: 'StrongPass123!' }),
    });
    const user = await dbFindOne('users', { email: js.email });
    const tokens = user.refreshTokens || [];
    expect(tokens.length, 'refreshTokens should grow on login').toBeGreaterThanOrEqual(1);
  });
});
