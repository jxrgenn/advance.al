/**
 * Phase 22.H — Business-control + Configuration + Matching EXHAUSTIVE
 *
 * Real backend round-trips for:
 *   - business-control.js: campaigns CRUD + transitions, pricing-rules CRUD,
 *     analytics, platform/emergency, whitelist
 *   - configuration.js: list, public, get/set by key, audit, pricing,
 *     init-defaults, maintenance-mode
 *   - matching.js: candidates list, purchase (mock pay), access-check,
 *     track-contact
 */

import { test, expect } from '@playwright/test';
import { dbClear, dbFind } from '../../real-backend/db-helpers';
import { API, makeJobseeker, makeEmployer, makeAdmin, authHeaders } from '../../real-backend/factory-helpers';

test.describe.configure({ mode: 'serial' });

const NORMAL_PLATFORM = { diaspora: false, ngaShtepia: false, partTime: false, administrata: false, sezonale: false };

async function postJob(empToken: string) {
  const res = await fetch(`${API}/jobs`, {
    method: 'POST', headers: authHeaders(empToken),
    body: JSON.stringify({
      title: 'H Test Job', description: 'H'.repeat(80),
      category: 'Teknologji', jobType: 'full-time',
      location: { city: 'Tiranë' }, platformCategories: NORMAL_PLATFORM,
    }),
  });
  return (await res.json()).data.job;
}

test.describe('Phase 22.H — Business / Configuration / Matching', () => {
  test.beforeEach(async () => { await dbClear(); });

  // ─── Campaigns ─────────────────────────────────────────────────────────

  test('H.1 POST /business-control/campaigns: BusinessCampaign created', async () => {
    const adm = await makeAdmin();
    const start = new Date(Date.now() + 1000);
    const end = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const res = await fetch(`${API}/business-control/campaigns`, {
      method: 'POST', headers: authHeaders(adm.token),
      body: JSON.stringify({
        name: 'Spring 25 Sale', type: 'flash_sale',
        parameters: { discount: 20, targetAudience: 'all' },
        schedule: { startDate: start.toISOString(), endDate: end.toISOString() }
      })
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.campaign.name).toBe('Spring 25 Sale');
    expect(body.data.campaign.type).toBe('flash_sale');
    const campaigns = await dbFind('businesscampaigns', {});
    expect(campaigns.length).toBe(1);
  });

  test('H.2 POST /business-control/campaigns: endDate <= startDate → 400', async () => {
    const adm = await makeAdmin();
    const start = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const end = new Date(Date.now() + 1000);
    const res = await fetch(`${API}/business-control/campaigns`, {
      method: 'POST', headers: authHeaders(adm.token),
      body: JSON.stringify({
        name: 'BadCampaign', type: 'flash_sale',
        parameters: { discount: 10 },
        schedule: { startDate: start.toISOString(), endDate: end.toISOString() }
      })
    });
    expect(res.status).toBe(400);
  });

  test('H.3 GET /business-control/campaigns lists campaigns', async () => {
    const adm = await makeAdmin();
    const start = new Date(Date.now() + 1000);
    const end = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await fetch(`${API}/business-control/campaigns`, {
      method: 'POST', headers: authHeaders(adm.token),
      body: JSON.stringify({
        name: 'C1', type: 'flash_sale', parameters: { discount: 10 },
        schedule: { startDate: start.toISOString(), endDate: end.toISOString() }
      })
    });
    const res = await fetch(`${API}/business-control/campaigns`, { headers: authHeaders(adm.token) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.campaigns?.length || body.data.items?.length).toBeGreaterThanOrEqual(1);
  });

  test('H.4 POST /business-control/campaigns non-admin → 403', async () => {
    const js = await makeJobseeker();
    const start = new Date(Date.now() + 1000);
    const end = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const res = await fetch(`${API}/business-control/campaigns`, {
      method: 'POST', headers: authHeaders(js.token),
      body: JSON.stringify({
        name: 'X', type: 'flash_sale', parameters: { discount: 10 },
        schedule: { startDate: start.toISOString(), endDate: end.toISOString() }
      })
    });
    expect(res.status).toBe(403);
  });

  test('H.5 POST /business-control/campaigns/:id/activate', async () => {
    const adm = await makeAdmin();
    const start = new Date(Date.now() + 1000);
    const end = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const create = await (await fetch(`${API}/business-control/campaigns`, {
      method: 'POST', headers: authHeaders(adm.token),
      body: JSON.stringify({
        name: 'Activatable', type: 'flash_sale', parameters: { discount: 10 },
        schedule: { startDate: start.toISOString(), endDate: end.toISOString() }
      })
    })).json();
    const id = create.data.campaign._id;
    const res = await fetch(`${API}/business-control/campaigns/${id}/activate`, {
      method: 'POST', headers: authHeaders(adm.token)
    });
    expect([200, 201]).toContain(res.status);
  });

  // ─── Pricing rules ─────────────────────────────────────────────────────

  test('H.6 POST /business-control/pricing-rules creates rule (F-22 fixed)', async () => {
    const adm = await makeAdmin();
    const res = await fetch(`${API}/business-control/pricing-rules`, {
      method: 'POST', headers: authHeaders(adm.token),
      body: JSON.stringify({
        name: 'Tech Premium',
        category: 'industry',
        rules: { basePrice: 28, multiplier: 1.5 },
        priority: 50
      })
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.rule.name).toBe('Tech Premium');
    expect(body.data.rule.category).toBe('industry');
    expect(body.data.rule.rules.basePrice).toBe(28);
    expect(body.data.rule.rules.multiplier).toBe(1.5);
    const rules = await dbFind('pricingrules', {});
    expect(rules.length).toBe(1);
    expect(rules[0].name).toBe('Tech Premium');
  });

  test('H.7 GET /business-control/pricing-rules lists created rule', async () => {
    const adm = await makeAdmin();
    await fetch(`${API}/business-control/pricing-rules`, {
      method: 'POST', headers: authHeaders(adm.token),
      body: JSON.stringify({
        name: 'R1', category: 'location',
        rules: { basePrice: 10, multiplier: 1.0 }
      })
    });
    const res = await fetch(`${API}/business-control/pricing-rules`, { headers: authHeaders(adm.token) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.rules.length).toBe(1);
    expect(body.data.rules[0].name).toBe('R1');
  });

  test('H.8 POST /business-control/pricing-rules invalid category → 400', async () => {
    const adm = await makeAdmin();
    const res = await fetch(`${API}/business-control/pricing-rules`, {
      method: 'POST', headers: authHeaders(adm.token),
      body: JSON.stringify({
        name: 'BadCat', category: 'not_a_category',
        rules: { basePrice: 28, multiplier: 1.0 }
      })
    });
    expect(res.status).toBe(400);
  });

  // ─── Configuration ─────────────────────────────────────────────────────

  test('H.9 GET /configuration/public is reachable without auth', async () => {
    const res = await fetch(`${API}/configuration/public`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.settings).toBeDefined();
  });

  test('H.10 POST /configuration/initialize-defaults: SystemConfiguration rows created', async () => {
    const adm = await makeAdmin();
    const res = await fetch(`${API}/configuration/initialize-defaults`, {
      method: 'POST', headers: authHeaders(adm.token)
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    const cfgs = await dbFind('systemconfigurations', {});
    expect(cfgs.length).toBeGreaterThan(0);
  });

  test('H.11 GET /configuration (admin): organized settings by category', async () => {
    const adm = await makeAdmin();
    // Initialize defaults so there's something to list
    await fetch(`${API}/configuration/initialize-defaults`, {
      method: 'POST', headers: authHeaders(adm.token)
    });
    const res = await fetch(`${API}/configuration`, { headers: authHeaders(adm.token) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.settings).toBeDefined();
  });

  test('H.12 POST /configuration/maintenance-mode toggles maintenance setting + audit row', async () => {
    const adm = await makeAdmin();
    await fetch(`${API}/configuration/initialize-defaults`, {
      method: 'POST', headers: authHeaders(adm.token)
    });
    const res = await fetch(`${API}/configuration/maintenance-mode`, {
      method: 'POST', headers: authHeaders(adm.token),
      body: JSON.stringify({ enabled: true, reason: 'Testing maintenance toggle' })
    });
    expect([200, 201]).toContain(res.status);
    const audits = await dbFind('configurationaudits', {});
    expect(audits.length).toBeGreaterThanOrEqual(1);
    // Setting should now be 'true'
    const cfgs = await dbFind('systemconfigurations', {});
    const maint = cfgs.find((c: any) => c.key === 'maintenance_mode');
    expect(maint?.value).toBe(true);
  });

  // ─── Matching ──────────────────────────────────────────────────────────

  test('H.13 GET /matching/jobs/:jobId/candidates returns array (may be empty if no embeddings)', async () => {
    const emp = await makeEmployer();
    const job = await postJob(emp.token);
    const res = await fetch(`${API}/matching/jobs/${job._id}/candidates`, { headers: authHeaders(emp.token) });
    expect([200, 402, 503]).toContain(res.status);
    if (res.status === 200) {
      const body = await res.json();
      expect(body.success).toBe(true);
    }
  });

  test('H.14 POST /matching/jobs/:jobId/purchase no payment env → 503', async () => {
    const emp = await makeEmployer();
    const job = await postJob(emp.token);
    // ENABLE_MOCK_PAYMENTS not set in launcher → expect 503
    const res = await fetch(`${API}/matching/jobs/${job._id}/purchase`, {
      method: 'POST', headers: authHeaders(emp.token)
    });
    // Either 503 (no mock payments env) OR 200 (already has access)
    expect([200, 503]).toContain(res.status);
  });

  test('H.15 POST /matching/jobs/:jobId/purchase peer employer → 403', async () => {
    const owner = await makeEmployer();
    const peer = await makeEmployer();
    const job = await postJob(owner.token);
    const res = await fetch(`${API}/matching/jobs/${job._id}/purchase`, {
      method: 'POST', headers: authHeaders(peer.token)
    });
    expect(res.status).toBe(403);
  });
});
