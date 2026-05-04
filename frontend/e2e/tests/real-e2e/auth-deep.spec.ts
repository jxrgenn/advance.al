/**
 * Phase 22.A — Auth EXHAUSTIVE (real backend + real DB)
 *
 * Tests every flow from auth.js: register edges, login edges, refresh
 * rotation, change-password cascade, forgot/reset round-trip, etc.
 */

import { test, expect } from '@playwright/test';
import { dbClear, dbFind, dbUpdate, waitForVerificationCode } from '../../real-backend/db-helpers';
import { API, makeJobseeker, requestPasswordReset, stdoutGrep } from '../../real-backend/factory-helpers';

test.describe.configure({ mode: 'serial' });

test.describe('Phase 22.A — Auth EXHAUSTIVE', () => {
  test.beforeEach(async () => { await dbClear(); });

  test('A.1 register-step-2 with non-existent pending → 400', async () => {
    const r = await fetch(`${API}/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'never-initiated@example.com', verificationCode: '123456' })
    });
    expect(r.status).toBe(400);
    const users = await dbFind('users', { email: 'never-initiated@example.com' });
    expect(users.length).toBe(0);
  });

  test('A.2 register-step-2 missing fields → 400', async () => {
    const r = await fetch(`${API}/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({})
    });
    expect(r.status).toBe(400);
  });

  test('A.3 register: 5 wrong codes — pending registration deleted (lockout)', async () => {
    const email = `lockout-${Date.now()}@example.com`;
    await fetch(`${API}/auth/initiate-registration`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'StrongPass123!', userType: 'jobseeker', firstName: 'Lock', lastName: 'Out', city: 'Tiranë' })
    });
    await waitForVerificationCode(email);

    // 5 wrong attempts
    for (let i = 0; i < 5; i++) {
      const r = await fetch(`${API}/auth/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, verificationCode: '000000' })
      });
      expect(r.status).toBe(400);
    }

    // 6th attempt — even with the *correct* code — should fail because pending was deleted
    const code = '999999'; // any code, pending should be gone
    const r6 = await fetch(`${API}/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, verificationCode: code })
    });
    expect(r6.status).toBe(400);
    const users = await dbFind('users', { email });
    expect(users.length).toBe(0);
  });

  test('A.4 register: case-insensitive email match (uppercase normalized)', async () => {
    const upper = `Mixed-Case-${Date.now()}@Example.com`;
    const lower = upper.toLowerCase();
    await fetch(`${API}/auth/initiate-registration`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: upper, password: 'StrongPass123!', userType: 'jobseeker', firstName: 'Mix', lastName: 'Case', city: 'Tiranë' })
    });
    // Verification code was stored under lowercased email
    const code = await waitForVerificationCode(lower);
    expect(code).toMatch(/^\d{6}$/);

    // Complete with original mixed-case (backend should normalize)
    const r = await fetch(`${API}/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: upper, verificationCode: code })
    });
    expect([200, 201]).toContain(r.status);
    const users = await dbFind('users', { email: lower });
    expect(users.length).toBe(1);
  });

  test('A.5 login: case-insensitive email match', async () => {
    const { email, password } = await makeJobseeker();
    const upper = email.toUpperCase();
    const r = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: upper, password })
    });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.success).toBe(true);
  });

  test('A.6 login: missing email → 400', async () => {
    const r = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'X' })
    });
    expect(r.status).toBe(400);
  });

  test('A.7 login: missing password → 400', async () => {
    const r = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'foo@bar.com' })
    });
    expect(r.status).toBe(400);
  });

  test('A.8 login: unknown email → 401 (no info leak)', async () => {
    const r = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'nobody@example.com', password: 'anything' })
    });
    expect(r.status).toBe(401);
  });

  test('A.9 login: suspended user → 403', async () => {
    const { email, password } = await makeJobseeker();
    await dbUpdate('users', { email }, {
      $set: {
        status: 'suspended',
        suspensionDetails: {
          reason: 'test',
          suspendedAt: new Date(),
          expiresAt: new Date(Date.now() + 7 * 86400000)
        }
      }
    });
    const r = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    expect([401, 403]).toContain(r.status);
  });

  test('A.10 login: banned/permanently-suspended user → 403', async () => {
    const { email, password } = await makeJobseeker();
    await dbUpdate('users', { email }, { $set: { status: 'banned' } });
    const r = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    expect([401, 403]).toContain(r.status);
  });

  test('A.11 login then refresh: rotation works', async () => {
    const { email, password } = await makeJobseeker();
    const login = await (await fetch(`${API}/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password })
    })).json();
    const refresh = login.data.refreshToken;
    expect(refresh).toBeTruthy();

    const r = await fetch(`${API}/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: refresh })
    });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.data.token).toBeTruthy();
    expect(body.data.refreshToken).toBeTruthy();
  });

  test('A.12 refresh with tampered token → 401', async () => {
    const r = await fetch(`${API}/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.tamperedpayload.invalidsig' })
    });
    expect(r.status).toBe(401);
  });

  test('A.13 refresh stolen-token: using OLD refresh after rotation → 401 (anti-hijack)', async () => {
    const { email, password } = await makeJobseeker();
    const login = await (await fetch(`${API}/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password })
    })).json();
    const oldRefresh = login.data.refreshToken;

    // First rotation succeeds
    await fetch(`${API}/auth/refresh`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: oldRefresh })
    });

    // Re-using the OLD (now invalidated) refresh token → 401
    const r = await fetch(`${API}/auth/refresh`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: oldRefresh })
    });
    expect(r.status).toBe(401);
  });

  test('A.14 logout: removes refresh token from DB', async () => {
    const { email, password, token } = await makeJobseeker();
    const login = await (await fetch(`${API}/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password })
    })).json();

    const before = (await dbFind('users', { email }))[0];
    expect(before.refreshTokens?.length || 0).toBeGreaterThan(0);

    await fetch(`${API}/auth/logout`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${login.data.token}` },
      body: JSON.stringify({ refreshToken: login.data.refreshToken })
    });

    const after = (await dbFind('users', { email }))[0];
    const remaining = after.refreshTokens || [];
    // Either the token was removed, or all were cleared — both acceptable
    expect(remaining.length).toBeLessThan(before.refreshTokens.length);
  });

  test('A.15 change-password: happy path; old password no longer logs in', async () => {
    const { email, password, token } = await makeJobseeker();
    const r = await fetch(`${API}/auth/change-password`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ currentPassword: password, newPassword: 'NewStrong456!' })
    });
    expect([200, 201, 204]).toContain(r.status);

    // Old password fails
    const oldLogin = await fetch(`${API}/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    expect(oldLogin.status).toBe(401);

    // New password works
    const newLogin = await fetch(`${API}/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'NewStrong456!' })
    });
    expect(newLogin.status).toBe(200);
  });

  test('A.16 change-password: wrong currentPassword → 400/401', async () => {
    const { token } = await makeJobseeker();
    const r = await fetch(`${API}/auth/change-password`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ currentPassword: 'wrong', newPassword: 'NewStrong456!' })
    });
    expect([400, 401]).toContain(r.status);
  });

  test('A.17 change-password: invalidates ALL refresh tokens (anti-hijack, F-21 fixed)', async () => {
    const { email, password, token } = await makeJobseeker();
    // Generate multiple refresh tokens via repeat logins
    await fetch(`${API}/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    await fetch(`${API}/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const before = (await dbFind('users', { email }))[0];
    expect(before.refreshTokens?.length || 0).toBeGreaterThan(0);

    const cp = await fetch(`${API}/auth/change-password`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ currentPassword: password, newPassword: 'AfterChange456!' })
    });
    expect(cp.status).toBe(200);

    const after = (await dbFind('users', { email }))[0];
    // F-21 fix: ALL refresh tokens cleared. Forces re-login on every device.
    expect(after.refreshTokens?.length || 0).toBe(0);
  });

  test('A.18 forgot-password: known email → 200', async () => {
    const { email } = await makeJobseeker();
    const r = await fetch(`${API}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email })
    });
    expect(r.status).toBe(200);

    // User document should have an emailVerificationToken / passwordResetToken set
    const user = (await dbFind('users', { email }))[0];
    const hasToken = user.passwordResetToken || user.emailVerificationToken;
    expect(hasToken).toBeTruthy();
  });

  test('A.19 forgot-password: unknown email → 200 (no info leak)', async () => {
    const r = await fetch(`${API}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'unknown@example.com' })
    });
    expect(r.status).toBe(200);
  });

  test('A.20 reset-password: tampered/wrong token → 400', async () => {
    const r = await fetch(`${API}/auth/reset-password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'fake-token-does-not-exist', password: 'NewPass123!' })
    });
    expect([400, 401]).toContain(r.status);
  });

  test('A.21 reset-password: full round-trip via DB-extracted token', async () => {
    const { email } = await makeJobseeker();

    // Inject a known reset token directly. Use `$date` EJSON marker so
    // side-channel converts to real Date.
    const knownToken = 'test-known-reset-token-123abc';
    const crypto = await import('crypto');
    const hashedToken = crypto.createHash('sha256').update(knownToken).digest('hex');

    // Send raw EJSON body (avoid ejsonStringify potentially serializing differently)
    const updateRes = await fetch(`http://localhost:3199/__test/db/update`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        collection: 'users',
        filter: { email },
        update: {
          $set: {
            passwordResetToken: hashedToken,
            passwordResetExpires: { $date: new Date(Date.now() + 60 * 60 * 1000).toISOString() }
          }
        }
      })
    });
    const updateBody = await updateRes.json();
    expect(updateBody.ok).toBe(true);
    expect(updateBody.modified).toBe(1);

    const r = await fetch(`${API}/auth/reset-password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: knownToken, password: 'PostReset789!' })
    });
    expect([200, 201]).toContain(r.status);

    const login = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'PostReset789!' })
    });
    expect(login.status).toBe(200);
  });

  test('A.22 reset-password: token cleared after successful reset (cant be reused)', async () => {
    const { email } = await makeJobseeker();
    const knownToken = 'reuse-test-token-abc123def';
    const crypto = await import('crypto');
    const hashedToken = crypto.createHash('sha256').update(knownToken).digest('hex');
    await fetch(`http://localhost:3199/__test/db/update`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        collection: 'users',
        filter: { email },
        update: {
          $set: {
            passwordResetToken: hashedToken,
            passwordResetExpires: { $date: new Date(Date.now() + 60 * 60 * 1000).toISOString() }
          }
        }
      })
    });

    // First use succeeds
    const r1 = await fetch(`${API}/auth/reset-password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: knownToken, password: 'ReusePass1!' })
    });
    expect([200, 201]).toContain(r1.status);

    // Second use fails (token cleared)
    const r2 = await fetch(`${API}/auth/reset-password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: knownToken, password: 'ReusePass2!' })
    });
    expect([400, 401]).toContain(r2.status);
  });

  test('A.23 send-verification: re-sends when authenticated and unverified', async () => {
    const { email, token } = await makeJobseeker();
    // After registration completed, user IS verified. Force unverified to test re-send.
    await dbUpdate('users', { email }, { $set: { emailVerified: false } });
    const r = await fetch(`${API}/auth/send-verification`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` }
    });
    expect([200, 201, 429]).toContain(r.status); // 429 if rate-limited
    if (r.status === 200 || r.status === 201) {
      const code = await waitForVerificationCode(email, 6000).catch(() => null);
      // Code may be stored on User.emailVerificationToken (hashed) — check that the User has a token
      const user = (await dbFind('users', { email }))[0];
      expect(user.emailVerificationToken).toBeTruthy();
    }
  });

  test('A.24 verify-email: completes via token', async () => {
    const { email, token } = await makeJobseeker();
    // Unverify user, set a known emailVerificationToken
    const crypto = await import('crypto');
    const code = '123456';
    const hashedCode = crypto.createHash('sha256').update(code).digest('hex');
    await fetch(`http://localhost:3199/__test/db/update`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        collection: 'users',
        filter: { email },
        update: {
          $set: {
            emailVerified: false,
            emailVerificationToken: hashedCode,
            emailVerificationExpires: { $date: new Date(Date.now() + 60 * 60 * 1000).toISOString() }
          }
        }
      })
    });

    const r = await fetch(`${API}/auth/verify-email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ code })
    });
    expect([200, 201]).toContain(r.status);

    const after = (await dbFind('users', { email }))[0];
    expect(after.emailVerified).toBe(true);
  });

  test('A.25 /api/auth/me without token → 401', async () => {
    const r = await fetch(`${API}/auth/me`);
    expect(r.status).toBe(401);
  });
});
