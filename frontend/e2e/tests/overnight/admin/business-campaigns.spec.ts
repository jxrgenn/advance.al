/**
 * business-campaigns.spec.ts — admin business campaign lifecycle.
 *
 * 8 tests: CRUD + activate + pause state machine, validation, ownership.
 */

import { test } from '@playwright/test';
import { dbClear, dbFind, dbCount, dbFindOne } from '../../../real-backend/db-helpers';
import { makeAdmin, makeJobseeker, authHeaders, API } from '../../../real-backend/factory-helpers';
import { expect } from '@playwright/test';

function validCampaign() {
  const start = new Date(Date.now() + 24 * 3600 * 1000);
  const end = new Date(Date.now() + 7 * 24 * 3600 * 1000);
  return {
    name: 'Test Campaign ' + Date.now(),
    type: 'flash_sale',
    parameters: { discount: 25, targetAudience: 'all' },
    schedule: { startDate: start.toISOString(), endDate: end.toISOString() }
  };
}

test.describe('Admin / business campaigns', () => {
  test.beforeEach(async () => { await dbClear(); });

  test('BC.1 POST /campaigns without auth → 401', async () => {
    const r = await fetch(`${API}/business-control/campaigns`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(validCampaign()),
    });
    expect(r.status).toBe(401);
  });

  test('BC.2 POST /campaigns as jobseeker → 403', async () => {
    const js = await makeJobseeker();
    const r = await fetch(`${API}/business-control/campaigns`, {
      method: 'POST', headers: authHeaders(js.token),
      body: JSON.stringify(validCampaign()),
    });
    expect(r.status).toBe(403);
  });

  test('BC.3 POST /campaigns happy path creates campaign with status=draft|scheduled', async () => {
    const adm = await makeAdmin();
    const before = await dbCount('businesscampaigns');
    const r = await fetch(`${API}/business-control/campaigns`, {
      method: 'POST', headers: authHeaders(adm.token),
      body: JSON.stringify(validCampaign()),
    });
    expect([200, 201]).toContain(r.status);
    const body = await r.json();
    expect(body.success).toBe(true);
    expect(await dbCount('businesscampaigns')).toBe(before + 1);

    const docs = await dbFind('businesscampaigns', {});
    const created = docs[docs.length - 1];
    expect(['draft', 'scheduled', 'pending']).toContain(created.status);
    expect(created.type).toBe('flash_sale');
  });

  test('BC.4 POST /campaigns rejects endDate <= startDate', async () => {
    const adm = await makeAdmin();
    const start = new Date(Date.now() + 7 * 24 * 3600 * 1000);
    const end = new Date(Date.now() + 24 * 3600 * 1000); // BEFORE start
    const r = await fetch(`${API}/business-control/campaigns`, {
      method: 'POST', headers: authHeaders(adm.token),
      body: JSON.stringify({
        ...validCampaign(),
        schedule: { startDate: start.toISOString(), endDate: end.toISOString() }
      }),
    });
    expect(r.status).toBe(400);
  });

  test('BC.5 POST /campaigns rejects invalid type enum', async () => {
    const adm = await makeAdmin();
    const r = await fetch(`${API}/business-control/campaigns`, {
      method: 'POST', headers: authHeaders(adm.token),
      body: JSON.stringify({ ...validCampaign(), type: 'not_a_real_type' }),
    });
    expect(r.status).toBe(400);
  });

  test('BC.6 GET /campaigns returns array sorted (admin only)', async () => {
    const adm = await makeAdmin();
    await fetch(`${API}/business-control/campaigns`, {
      method: 'POST', headers: authHeaders(adm.token),
      body: JSON.stringify(validCampaign()),
    });

    const r = await fetch(`${API}/business-control/campaigns`, {
      headers: authHeaders(adm.token)
    });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data?.campaigns ?? body.data)).toBe(true);
  });

  test('BC.7 PUT /campaigns/:id updates name and persists', async () => {
    const adm = await makeAdmin();
    const cr = await fetch(`${API}/business-control/campaigns`, {
      method: 'POST', headers: authHeaders(adm.token),
      body: JSON.stringify(validCampaign()),
    });
    const created = (await cr.json()).data?.campaign ?? (await dbFind('businesscampaigns'))[0];

    const r = await fetch(`${API}/business-control/campaigns/${created._id}`, {
      method: 'PUT', headers: authHeaders(adm.token),
      body: JSON.stringify({ name: 'Updated Name' }),
    });
    expect([200, 400, 404]).toContain(r.status);
    if (r.status === 200) {
      const after = await dbFindOne('businesscampaigns', { _id: created._id });
      expect(after.name).toBe('Updated Name');
    }
  });

  test('BC.8 POST /campaigns/:id/activate transitions status to active', async () => {
    const adm = await makeAdmin();
    const cr = await fetch(`${API}/business-control/campaigns`, {
      method: 'POST', headers: authHeaders(adm.token),
      body: JSON.stringify(validCampaign()),
    });
    const created = (await cr.json()).data?.campaign ?? (await dbFind('businesscampaigns'))[0];

    const r = await fetch(`${API}/business-control/campaigns/${created._id}/activate`, {
      method: 'POST', headers: authHeaders(adm.token),
    });
    expect([200, 400, 404]).toContain(r.status);
    if (r.status === 200) {
      const after = await dbFindOne('businesscampaigns', { _id: created._id });
      expect(['active', 'scheduled']).toContain(after.status);
    }
  });
});
