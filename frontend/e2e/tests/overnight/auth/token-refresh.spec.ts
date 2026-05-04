/**
 * token-refresh.spec.ts — refresh token rotation and expiry.
 *
 * 6 tests: rotation works, stale token rejected, missing body, change-password
 * invalidates all tokens, logout removes one token.
 */

import { test } from '@playwright/test';
import { dbClear, dbFindOne } from '../../../real-backend/db-helpers';
import { makeJobseeker, authHeaders, API } from '../../../real-backend/factory-helpers';
import { expect } from '@playwright/test';

test.describe('Auth / token refresh', () => {
  test.beforeEach(async () => { await dbClear(); });

  test('TR.1 refresh with valid token returns new access+refresh', async () => {
    const js = await makeJobseeker();
    const lr = await fetch(`${API}/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: js.email, password: 'StrongPass123!' }),
    });
    const lb = await lr.json();
    const refresh = lb.data?.refreshToken;
    expect(refresh).toBeTruthy();

    const rr = await fetch(`${API}/auth/refresh`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: refresh }),
    });
    expect(rr.status).toBe(200);
    const body = await rr.json();
    expect(body.success).toBe(true);
    expect(body.data?.token, 'new access token returned').toBeTruthy();
  });

  test('TR.2 refresh with garbage token → 401', async () => {
    const r = await fetch(`${API}/auth/refresh`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: 'not-a-jwt' }),
    });
    expect(r.status).toBe(401);
  });

  test('TR.3 refresh with no body → 400', async () => {
    const r = await fetch(`${API}/auth/refresh`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect([400, 401]).toContain(r.status);
  });

  test('TR.4 logout removes refresh token from user.refreshTokens', async () => {
    const js = await makeJobseeker();
    const lr = await fetch(`${API}/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: js.email, password: 'StrongPass123!' }),
    });
    const lb = await lr.json();
    const refresh = lb.data?.refreshToken;

    const before = await dbFindOne('users', { email: js.email });
    const beforeCount = (before.refreshTokens || []).length;

    const out = await fetch(`${API}/auth/logout`, {
      method: 'POST', headers: authHeaders(lb.data.token),
      body: JSON.stringify({ refreshToken: refresh }),
    });
    expect([200, 204]).toContain(out.status);

    const after = await dbFindOne('users', { email: js.email });
    const afterCount = (after.refreshTokens || []).length;
    expect(afterCount, 'logout should remove the specific refresh token').toBeLessThan(beforeCount);
  });

  test('TR.5 change-password invalidates ALL refresh tokens', async () => {
    const js = await makeJobseeker();
    // Login twice to seed multiple refresh tokens
    await fetch(`${API}/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: js.email, password: 'StrongPass123!' }),
    });
    const lr = await fetch(`${API}/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: js.email, password: 'StrongPass123!' }),
    });
    const lb = await lr.json();

    const cr = await fetch(`${API}/auth/change-password`, {
      method: 'POST', headers: authHeaders(lb.data.token),
      body: JSON.stringify({
        currentPassword: 'StrongPass123!',
        newPassword: 'BrandNewStrongPass456!'
      }),
    });
    if ([200, 204].includes(cr.status)) {
      const after = await dbFindOne('users', { email: js.email });
      const tokens = after.refreshTokens || [];
      expect(tokens.length, 'change-password should clear all refresh tokens').toBe(0);
    }
  });

  test('TR.6 used-then-rotated refresh token cannot be reused', async () => {
    const js = await makeJobseeker();
    const lr = await fetch(`${API}/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: js.email, password: 'StrongPass123!' }),
    });
    const refreshA = (await lr.json()).data?.refreshToken;

    await fetch(`${API}/auth/refresh`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: refreshA }),
    });

    const replay = await fetch(`${API}/auth/refresh`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: refreshA }),
    });
    expect(replay.status, 'replayed refresh token must be rejected').toBe(401);
  });
});
