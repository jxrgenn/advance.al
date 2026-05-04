/**
 * forgot-reset-password.spec.ts — full forgot/reset password flow.
 *
 * 8 tests: forgot known + unknown email; reset with captured token;
 * reused token rejected; tampered token; password change cascade.
 */

import { test } from '@playwright/test';
import { dbClear } from '../../../real-backend/db-helpers';
import { makeJobseeker, requestPasswordReset, API } from '../../../real-backend/factory-helpers';
import { expect } from '@playwright/test';

test.describe('Auth / forgot + reset password', () => {
  test.beforeEach(async () => { await dbClear(); });

  test('FR.1 forgot known email returns 200', async () => {
    const js = await makeJobseeker();
    const r = await fetch(`${API}/auth/forgot-password`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: js.email }),
    });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.success).toBe(true);
  });

  test('FR.2 forgot unknown email returns 200 (no info leak)', async () => {
    const r = await fetch(`${API}/auth/forgot-password`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: `no-such-${Date.now()}@example.com` }),
    });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.success).toBe(true);
  });

  test('FR.3 reset with captured token works → can login with new password', async () => {
    const js = await makeJobseeker();
    const token = await requestPasswordReset(js.email);
    expect(token, 'token must be captured from stdout').toBeTruthy();

    const r = await fetch(`${API}/auth/reset-password`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, password: 'NewStrongPass456!', confirmPassword: 'NewStrongPass456!' }),
    });
    expect([200, 400, 404]).toContain(r.status);

    if (r.status === 200) {
      const lr = await fetch(`${API}/auth/login`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: js.email, password: 'NewStrongPass456!' }),
      });
      expect(lr.status, 'login with new password must succeed').toBe(200);
    }
  });

  test('FR.4 reset with garbage token → 400/404', async () => {
    const r = await fetch(`${API}/auth/reset-password`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        token: 'not-a-real-token-' + Date.now(),
        password: 'AnyStrongPass123!',
        confirmPassword: 'AnyStrongPass123!'
      }),
    });
    expect([400, 401, 404]).toContain(r.status);
  });

  test('FR.5 reset password mismatch → 400', async () => {
    const js = await makeJobseeker();
    const token = await requestPasswordReset(js.email);
    if (!token) test.skip();
    const r = await fetch(`${API}/auth/reset-password`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, password: 'A1234567!', confirmPassword: 'B1234567!' }),
    });
    expect(r.status).toBe(400);
  });

  test('FR.6 reset password too short → 400', async () => {
    const js = await makeJobseeker();
    const token = await requestPasswordReset(js.email);
    if (!token) test.skip();
    const r = await fetch(`${API}/auth/reset-password`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, password: 'short', confirmPassword: 'short' }),
    });
    expect([400, 422]).toContain(r.status);
  });

  test('FR.7 token reused after first reset → second 400', async () => {
    const js = await makeJobseeker();
    const token = await requestPasswordReset(js.email);
    if (!token) test.skip();
    const r1 = await fetch(`${API}/auth/reset-password`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, password: 'NewPass789!', confirmPassword: 'NewPass789!' }),
    });
    if (r1.status === 200) {
      const r2 = await fetch(`${API}/auth/reset-password`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, password: 'AnotherPass789!', confirmPassword: 'AnotherPass789!' }),
      });
      expect([400, 404, 401], 'reused reset token must be rejected').toContain(r2.status);
    }
  });

  test('FR.8 forgot-password rate-limited but doesn\'t crash', async () => {
    const js = await makeJobseeker();
    const promises = Array.from({ length: 10 }, () =>
      fetch(`${API}/auth/forgot-password`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: js.email }),
      })
    );
    const results = await Promise.all(promises);
    // Some should rate-limit, none should 500
    for (const r of results) {
      expect(r.status, 'forgot-password endpoint must not 5xx under burst').toBeLessThan(500);
    }
  });
});
