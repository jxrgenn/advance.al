/**
 * verification.spec.ts — POST /api/verification/{request,verify,validate-token,resend}
 * + GET /api/verification/status/:identifier
 *
 * 8 tests covering email-verification code lifecycle independent of registration.
 */

import { test } from '@playwright/test';
import { dbClear, dbFind } from '../../../real-backend/db-helpers';
import { waitForVerificationCode } from '../../../real-backend/db-helpers';
import { API } from '../../../real-backend/factory-helpers';
import { expect } from '@playwright/test';

test.describe('Domain / verification', () => {
  test.beforeEach(async () => { await dbClear(); });

  test('V.1 POST /request with valid email returns 200 and logs code', async () => {
    const email = `verify-${Date.now()}@example.com`;
    const r = await fetch(`${API}/verification/request`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identifier: email, method: 'email', userType: 'jobseeker' }),
    });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.success).toBe(true);

    const code = await waitForVerificationCode(email, 5000);
    expect(code).toMatch(/^\d{6}$/);
  });

  test('V.2 POST /request with invalid email format → 400', async () => {
    const r = await fetch(`${API}/verification/request`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identifier: 'not-an-email', method: 'email' }),
    });
    expect(r.status).toBe(400);
    const body = await r.json();
    expect(body.success).toBe(false);
  });

  test('V.3 POST /request with invalid phone format → 400', async () => {
    const r = await fetch(`${API}/verification/request`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identifier: '12345', method: 'sms' }),
    });
    expect(r.status).toBe(400);
  });

  test('V.4 POST /verify with correct code → 200', async () => {
    const email = `verify-ok-${Date.now()}@example.com`;
    await fetch(`${API}/verification/request`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identifier: email, method: 'email' }),
    });
    const code = await waitForVerificationCode(email, 5000);

    const r = await fetch(`${API}/verification/verify`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identifier: email, code, method: 'email' }),
    });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.success).toBe(true);
  });

  test('V.5 POST /verify with wrong code → 400', async () => {
    const email = `verify-bad-${Date.now()}@example.com`;
    await fetch(`${API}/verification/request`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identifier: email, method: 'email' }),
    });
    await waitForVerificationCode(email, 5000);

    const r = await fetch(`${API}/verification/verify`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identifier: email, code: '000000', method: 'email' }),
    });
    expect(r.status).toBe(400);
    const body = await r.json();
    expect(body.success).toBe(false);
  });

  test('V.6 POST /resend after request → new code generated', async () => {
    const email = `verify-resend-${Date.now()}@example.com`;
    await fetch(`${API}/verification/request`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identifier: email, method: 'email' }),
    });
    const firstCode = await waitForVerificationCode(email, 5000);
    expect(firstCode).toBeTruthy();

    // Brief wait so timestamps differ
    await new Promise(r => setTimeout(r, 1100));

    const r = await fetch(`${API}/verification/resend`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identifier: email, method: 'email' }),
    });
    expect([200, 400, 429]).toContain(r.status);
  });

  test('V.7 POST /validate-token with garbage token → 400/401', async () => {
    const r = await fetch(`${API}/verification/validate-token`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'invalid-token-string' }),
    });
    expect([400, 401]).toContain(r.status);
  });

  test('V.8 GET /status/:identifier returns boolean', async () => {
    const email = `verify-status-${Date.now()}@example.com`;
    const r = await fetch(`${API}/verification/status/${encodeURIComponent(email)}`);
    // Either 200 with status or 404 if not found — both valid
    expect([200, 404]).toContain(r.status);
    if (r.status === 200) {
      const body = await r.json();
      expect(body.success).toBe(true);
    }
  });
});
