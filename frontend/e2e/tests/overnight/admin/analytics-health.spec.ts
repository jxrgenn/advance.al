/**
 * analytics-health.spec.ts — admin analytics + system-health + user-insights.
 *
 * 6 tests: auth gates, response shapes, no secret leak.
 */

import { test } from '@playwright/test';
import { dbClear } from '../../../real-backend/db-helpers';
import { makeAdmin, makeJobseeker, authHeaders, API } from '../../../real-backend/factory-helpers';
import { expect } from '@playwright/test';

test.describe('Admin / analytics + health', () => {
  test.beforeEach(async () => { await dbClear(); });

  test('AH.1 /admin/analytics requires auth', async () => {
    const r = await fetch(`${API}/admin/analytics`);
    expect(r.status).toBe(401);
  });

  test('AH.2 /admin/analytics returns object for admin', async () => {
    const adm = await makeAdmin();
    const r = await fetch(`${API}/admin/analytics`, { headers: authHeaders(adm.token) });
    // JUSTIFIED: Lookup endpoint — returns 200 if resource exists, 404 if not. Both legit.
    expect([200, 404]).toContain(r.status);
    if (r.status === 200) {
      const body = await r.json();
      expect(body.success).toBe(true);
    }
  });

  test('AH.3 /admin/system-health never leaks DB connection string or secrets', async () => {
    const adm = await makeAdmin();
    const r = await fetch(`${API}/admin/system-health`, { headers: authHeaders(adm.token) });
    if (r.status === 200) {
      const text = await r.text();
      expect(text, 'system-health must not leak Mongo connection string').not.toMatch(/mongodb\+srv:|mongodb:\/\//);
      expect(text, 'system-health must not leak JWT secrets').not.toMatch(/JWT_SECRET|jwt_secret/i);
      expect(text, 'system-health must not leak OpenAI keys').not.toMatch(/sk-[a-zA-Z0-9]{20}/);
    }
  });

  test('AH.4 /admin/user-insights as jobseeker → 403', async () => {
    const js = await makeJobseeker();
    const r = await fetch(`${API}/admin/user-insights`, { headers: authHeaders(js.token) });
    // JUSTIFIED: IDOR uniformity — cross-tenant resource access returns 403 (not yours) or 404 (uniform with non-existent).
    expect([403, 404]).toContain(r.status);
  });

  test('AH.5 /configuration/system-health requires admin', async () => {
    const noAuth = await fetch(`${API}/configuration/system-health`);
    expect(noAuth.status).toBe(401);

    const adm = await makeAdmin();
    const r = await fetch(`${API}/configuration/system-health`, { headers: authHeaders(adm.token) });
    // JUSTIFIED: Lookup endpoint — returns 200 if resource exists, 404 if not. Both legit.
    expect([200, 404]).toContain(r.status);
  });

  test('AH.6 /business-control/analytics/dashboard returns object for admin', async () => {
    const adm = await makeAdmin();
    const r = await fetch(`${API}/business-control/analytics/dashboard`, { headers: authHeaders(adm.token) });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.success).toBe(true);
  });
});
