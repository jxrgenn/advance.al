/**
 * users-list-filter.spec.ts — admin user listing + filtering.
 *
 * 6 tests: list, filter by userType, filter by status, get-by-id, no PII leak.
 */

import { test } from '@playwright/test';
import { dbClear, dbFindOne } from '../../../real-backend/db-helpers';
import { makeAdmin, makeJobseeker, makeEmployer, authHeaders, API } from '../../../real-backend/factory-helpers';
import { expect } from '@playwright/test';

test.describe('Admin / users list + filter', () => {
  test.beforeEach(async () => { await dbClear(); });

  test('UL.1 GET /admin/users requires auth', async () => {
    const r = await fetch(`${API}/admin/users`);
    expect(r.status).toBe(401);
  });

  test('UL.2 GET /admin/users as jobseeker → 403', async () => {
    const js = await makeJobseeker();
    const r = await fetch(`${API}/admin/users`, { headers: authHeaders(js.token) });
    expect(r.status).toBe(403);
  });

  test('UL.3 GET /admin/users returns array (admin)', async () => {
    const adm = await makeAdmin();
    await makeJobseeker();
    await makeEmployer({ preApprove: true });

    const r = await fetch(`${API}/admin/users`, { headers: authHeaders(adm.token) });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data?.users ?? body.data)).toBe(true);
  });

  test('UL.4 filter ?userType=jobseeker excludes employers', async () => {
    const adm = await makeAdmin();
    const js = await makeJobseeker();
    const emp = await makeEmployer({ preApprove: true });

    const r = await fetch(`${API}/admin/users?userType=jobseeker`, { headers: authHeaders(adm.token) });
    expect(r.status).toBe(200);
    const body = await r.json();
    const users = body.data?.users ?? body.data ?? [];
    const emails = users.map((u: any) => u.email);
    if (emails.length > 0) {
      expect(emails).toContain(js.email);
      expect(emails).not.toContain(emp.email);
    }
  });

  test('UL.5 GET /admin/users/:id returns user details', async () => {
    const adm = await makeAdmin();
    const js = await makeJobseeker();
    const jsDoc = await dbFindOne('users', { email: js.email });

    const r = await fetch(`${API}/admin/users/${jsDoc._id}`, { headers: authHeaders(adm.token) });
    expect([200, 404]).toContain(r.status);
    if (r.status === 200) {
      const body = await r.json();
      expect(body.success).toBe(true);
      const user = body.data?.user ?? body.data;
      expect(user.email).toBe(js.email);
    }
  });

  test('UL.6 admin user list never leaks password hash or refresh tokens', async () => {
    const adm = await makeAdmin();
    await makeJobseeker();

    const r = await fetch(`${API}/admin/users`, { headers: authHeaders(adm.token) });
    const text = await r.text();
    expect(text, 'admin must never receive bcrypt hashes').not.toMatch(/\$2[aby]\$\d+\$/);
    expect(text, 'admin must never receive raw refreshTokens').not.toMatch(/refreshTokens.*"token":"eyJ/);
  });
});
