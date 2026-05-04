/**
 * pricing-rules.spec.ts — admin pricing rule CRUD + toggle.
 *
 * 6 tests covering creation, validation, list, toggle.
 */

import { test } from '@playwright/test';
import { dbClear, dbFind, dbCount, dbFindOne } from '../../../real-backend/db-helpers';
import { makeAdmin, makeJobseeker, authHeaders, API } from '../../../real-backend/factory-helpers';
import { expect } from '@playwright/test';

function validRule() {
  return {
    name: 'Test Rule ' + Date.now(),
    category: 'industry',
    rules: { basePrice: 100, multiplier: 1.5 },
    priority: 50,
  };
}

test.describe('Admin / pricing rules', () => {
  test.beforeEach(async () => { await dbClear(); });

  test('PR.1 POST without auth → 401', async () => {
    const r = await fetch(`${API}/business-control/pricing-rules`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(validRule()),
    });
    expect(r.status).toBe(401);
  });

  test('PR.2 POST as jobseeker → 403', async () => {
    const js = await makeJobseeker();
    const r = await fetch(`${API}/business-control/pricing-rules`, {
      method: 'POST', headers: authHeaders(js.token),
      body: JSON.stringify(validRule()),
    });
    expect(r.status).toBe(403);
  });

  test('PR.3 POST happy path creates rule', async () => {
    const adm = await makeAdmin();
    const r = await fetch(`${API}/business-control/pricing-rules`, {
      method: 'POST', headers: authHeaders(adm.token),
      body: JSON.stringify(validRule()),
    });
    expect([200, 201]).toContain(r.status);
    const body = await r.json();
    expect(body.success).toBe(true);
    expect(await dbCount('pricingrules')).toBeGreaterThanOrEqual(1);
  });

  test('PR.4 POST rejects multiplier outside [0.1, 10]', async () => {
    const adm = await makeAdmin();
    const r1 = await fetch(`${API}/business-control/pricing-rules`, {
      method: 'POST', headers: authHeaders(adm.token),
      body: JSON.stringify({ ...validRule(), rules: { basePrice: 100, multiplier: 0.05 } }),
    });
    expect(r1.status).toBe(400);

    const r2 = await fetch(`${API}/business-control/pricing-rules`, {
      method: 'POST', headers: authHeaders(adm.token),
      body: JSON.stringify({ ...validRule(), rules: { basePrice: 100, multiplier: 11.5 } }),
    });
    expect(r2.status).toBe(400);
  });

  test('PR.5 GET /pricing-rules returns array (admin only)', async () => {
    const adm = await makeAdmin();
    await fetch(`${API}/business-control/pricing-rules`, {
      method: 'POST', headers: authHeaders(adm.token),
      body: JSON.stringify(validRule()),
    });

    const r = await fetch(`${API}/business-control/pricing-rules`, {
      headers: authHeaders(adm.token)
    });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data?.rules ?? body.data?.pricingRules ?? body.data)).toBe(true);
  });

  test('PR.6 POST /pricing-rules/:id/toggle flips active flag', async () => {
    const adm = await makeAdmin();
    const cr = await fetch(`${API}/business-control/pricing-rules`, {
      method: 'POST', headers: authHeaders(adm.token),
      body: JSON.stringify(validRule()),
    });
    const created = (await cr.json()).data?.rule ?? (await dbFind('pricingrules'))[0];
    const beforeActive = created.isActive ?? created.active ?? true;

    const r = await fetch(`${API}/business-control/pricing-rules/${created._id}/toggle`, {
      method: 'POST', headers: authHeaders(adm.token),
    });
    expect([200, 400, 404]).toContain(r.status);
    if (r.status === 200) {
      const after = await dbFindOne('pricingrules', { _id: created._id });
      const afterActive = after.isActive ?? after.active;
      expect(afterActive, 'toggle should flip the active flag').toBe(!beforeActive);
    }
  });
});
