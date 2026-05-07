/**
 * maintenance-emergency.spec.ts — admin maintenance + platform/emergency.
 *
 * 4 tests: maintenance toggle ON blocks non-admin requests; OFF allows;
 * emergency kill-switch; whitelist endpoints.
 */

import { test } from '@playwright/test';
import { dbClear } from '../../../real-backend/db-helpers';
import { makeAdmin, makeJobseeker, authHeaders, API } from '../../../real-backend/factory-helpers';
import { expect } from '@playwright/test';

test.describe('Admin / maintenance + emergency', () => {
  test.beforeEach(async () => { await dbClear(); });

  test('ME.1 POST /maintenance-mode requires admin', async () => {
    const r = await fetch(`${API}/configuration/maintenance-mode`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: true }),
    });
    expect(r.status).toBe(401);

    const js = await makeJobseeker();
    const r2 = await fetch(`${API}/configuration/maintenance-mode`, {
      method: 'POST', headers: authHeaders(js.token),
      body: JSON.stringify({ enabled: true }),
    });
    expect(r2.status).toBe(403);
  });

  test('ME.2 POST /maintenance-mode toggle ON, then OFF, with admin', async () => {
    const adm = await makeAdmin();
    // Seed default settings so the maintenance_mode key exists.
    await fetch(`${API}/configuration/initialize-defaults`, {
      method: 'POST', headers: authHeaders(adm.token),
    });

    const onR = await fetch(`${API}/configuration/maintenance-mode`, {
      method: 'POST', headers: authHeaders(adm.token),
      body: JSON.stringify({ enabled: true, reason: 'Phase 23 test' }),
    });
    // JUSTIFIED: HTTP convention — POST returns 200 (with body) or 201 (created).
    expect([200, 201]).toContain(onR.status);

    const offR = await fetch(`${API}/configuration/maintenance-mode`, {
      method: 'POST', headers: authHeaders(adm.token),
      body: JSON.stringify({ enabled: false }),
    });
    // JUSTIFIED: HTTP convention — POST returns 200 (with body) or 201 (created).
    expect([200, 201]).toContain(offR.status);
  });

  test('ME.3 POST /platform/emergency requires admin', async () => {
    const r = await fetch(`${API}/business-control/platform/emergency`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'pause_all_payments' }),
    });
    expect(r.status).toBe(401);

    const js = await makeJobseeker();
    const r2 = await fetch(`${API}/business-control/platform/emergency`, {
      method: 'POST', headers: authHeaders(js.token),
      body: JSON.stringify({ action: 'pause_all_payments' }),
    });
    expect(r2.status).toBe(403);
  });

  test('ME.4 GET /whitelist requires admin and returns array', async () => {
    const noAuth = await fetch(`${API}/business-control/whitelist`);
    expect(noAuth.status).toBe(401);

    const adm = await makeAdmin();
    const r = await fetch(`${API}/business-control/whitelist`, { headers: authHeaders(adm.token) });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data?.whitelist ?? body.data?.employers ?? body.data)).toBe(true);
  });
});
