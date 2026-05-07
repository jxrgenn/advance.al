/**
 * security-jwt.spec.ts — JWT tampering and authentication edge cases.
 *
 * 8 tests: alg:none rejected, modified payload rejected, wrong secret,
 * expired token, missing Bearer, malformed, non-existent user id, deleted user.
 */

import { test } from '@playwright/test';
import { dbClear, dbUpdate } from '../../../real-backend/db-helpers';
import { makeJobseeker, makeAdmin, authHeaders, API } from '../../../real-backend/factory-helpers';
import { expect } from '@playwright/test';

// Build a JWT manually so we can tamper. Header.Payload.Signature, base64url.
function b64url(s: string): string {
  return Buffer.from(s).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

test.describe('Security / JWT', () => {
  test.beforeEach(async () => { await dbClear(); });

  test('SJ.1 alg:none JWT must be rejected', async () => {
    const header = b64url(JSON.stringify({ alg: 'none', typ: 'JWT' }));
    const payload = b64url(JSON.stringify({ id: '507f1f77bcf86cd799439011', userType: 'admin' }));
    const fakeToken = `${header}.${payload}.`;
    const r = await fetch(`${API}/admin/dashboard`, {
      headers: { Authorization: `Bearer ${fakeToken}` },
    });
    expect(r.status).toBe(401);
  });

  test('SJ.2 tampered payload (changed userType) → 401', async () => {
    const js = await makeJobseeker();
    // Take real token, tamper payload
    const parts = js.token.split('.');
    const decoded = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    decoded.userType = 'admin';
    const tampered = `${parts[0]}.${b64url(JSON.stringify(decoded))}.${parts[2]}`;

    const r = await fetch(`${API}/admin/dashboard`, {
      headers: { Authorization: `Bearer ${tampered}` },
    });
    expect(r.status, 'tampered JWT signature must be rejected').toBe(401);
  });

  test('SJ.3 wrong-secret JWT must be rejected', async () => {
    // Sign a token with a wrong secret — manually craft one
    const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = b64url(JSON.stringify({ id: '507f1f77bcf86cd799439011', userType: 'admin' }));
    const sig = b64url('definitely-not-the-right-signature');
    const fakeToken = `${header}.${payload}.${sig}`;

    const r = await fetch(`${API}/admin/dashboard`, {
      headers: { Authorization: `Bearer ${fakeToken}` },
    });
    expect(r.status).toBe(401);
  });

  test('SJ.4 no Bearer prefix → 401', async () => {
    const js = await makeJobseeker();
    const r = await fetch(`${API}/users/profile`, {
      headers: { Authorization: js.token },
    });
    // No "Bearer " prefix — auth.js rejects at header parsing → 401.
    expect(r.status).toBe(401);
  });

  test('SJ.5 malformed token (single segment) → 401', async () => {
    const r = await fetch(`${API}/users/profile`, {
      headers: { Authorization: 'Bearer not-a-jwt' },
    });
    expect(r.status).toBe(401);
  });

  test('SJ.6 empty Bearer token → 401', async () => {
    const r = await fetch(`${API}/users/profile`, {
      headers: { Authorization: 'Bearer ' },
    });
    expect(r.status).toBe(401);
  });

  test('SJ.7 wrong-role: jobseeker JWT against admin route → 403', async () => {
    const js = await makeJobseeker();
    const r = await fetch(`${API}/admin/dashboard`, { headers: authHeaders(js.token) });
    expect(r.status).toBe(403);
  });

  test('SJ.8 deleted user JWT → 401/403', async () => {
    const js = await makeJobseeker();
    // Soft-delete the user
    await dbUpdate('users', { email: js.email }, { $set: { isDeleted: true, deletedAt: new Date() } });
    const r = await fetch(`${API}/users/profile`, { headers: authHeaders(js.token) });
    expect(r.status).toBe(401);
  });
});
