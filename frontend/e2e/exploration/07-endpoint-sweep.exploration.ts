/**
 * Phase 24 / Tier 2 — Endpoint Sweep
 *
 * Goal: hit EVERY backend endpoint at least once with a sensible happy-path
 * request, capture status + key body fields as OBS, and flag any 5xx as
 * a finding. This closes the ~75% endpoint-coverage gap noted at the end of
 * Tier 1.
 *
 * What this is NOT: deep behavioral verification per endpoint. Phase 24 P1-P6
 * + Phase 23 spec re-run already covered the deep flows. This sweep is the
 * smoke-test layer that catches "endpoint silently broken" or "endpoint
 * crashes server" regressions across the full surface.
 *
 * Pattern per endpoint group:
 *  - Set up the right auth context once
 *  - Fire happy-path request (with realistic body for POST/PUT/PATCH)
 *  - Log OBS line: <ENDPOINT> status= <code>
 *  - expect(status).not.toBeGreaterThanOrEqual(500)  // no server errors
 *  - For role-gated endpoints, also fire without auth → expect 401, with wrong-role → expect 403 (only on a sample to keep this fast)
 *
 * 157 endpoints across 18 route files. Phase 24 P1-P6 already touched ~39.
 * Tier 2 sweep covers the rest + re-confirms the touched ones.
 */
import { test, expect } from '@playwright/test';
import { dbClear, dbFindOne, seedLocations } from '../real-backend/db-helpers';
import { makeJobseeker, makeEmployer, makeAdmin, authHeaders, dbInsert } from '../real-backend/factory-helpers';

const API = 'http://localhost:3001/api';

let admToken: string, admEmail: string;
let empToken: string, empEmail: string, empUserId: string;
let jsToken: string, jsEmail: string, jsUserId: string;
let testJobId: string;
let testApplicationId: string;
let testNotificationId: string;
let testReportId: string;
let testBulkNotifId: string;
let testCampaignId: string;
let testPricingRuleId: string;
let testConfigId: string;

const FINDINGS: { endpoint: string; status: number; note: string }[] = [];

async function recordIfErr(endpoint: string, status: number, body?: any) {
  if (status >= 500) {
    FINDINGS.push({ endpoint, status, note: `5xx server error: ${JSON.stringify(body).slice(0, 200)}` });
    console.log(`FINDING 5xx ${endpoint} status=${status} body=${JSON.stringify(body).slice(0, 200)}`);
  } else if (status === 400 || status === 422) {
    // Log 4xx bodies on happy-path attempts so we can triage which are
    // legitimate (test sent bogus input) vs. real (real call rejected).
    console.log(`OBS-DETAIL ${endpoint} status=${status} body=${JSON.stringify(body).slice(0, 300)}`);
  }
}

test.describe('Phase 24 / Tier 2 / Endpoint Sweep', () => {
  test.beforeAll(async () => {
    await dbClear();
    await seedLocations();
    const adm = await makeAdmin();
    admToken = adm.token; admEmail = adm.email;
    const emp = await makeEmployer({ preApprove: true });
    empToken = emp.token; empEmail = emp.email;
    const empDoc = await dbFindOne('users', { email: empEmail });
    empUserId = String(empDoc._id);
    const js = await makeJobseeker();
    jsToken = js.token; jsEmail = js.email;
    const jsDoc = await dbFindOne('users', { email: jsEmail });
    jsUserId = String(jsDoc._id);

    // Seed: a job, an application, a notification, a report, a bulk-notif,
    // a campaign, a pricing rule, a config setting. Done via real API where
    // possible so we follow real validation paths.
    const jobR = await fetch(`${API}/jobs`, {
      method: 'POST', headers: authHeaders(empToken),
      body: JSON.stringify({
        title: 'Sweep test engineer',
        description: 'x'.repeat(80),
        category: 'Teknologji', jobType: 'full-time',
        location: { city: 'Tiranë' },
        salary: { min: 1000, max: 2000, currency: 'EUR' },
        platformCategories: { diaspora: false, ngaShtepia: false, partTime: false, administrata: false, sezonale: false }
      }),
    });
    const jobBody = await jobR.json();
    testJobId = jobBody?.data?.job?._id || '';
    console.log('SETUP testJobId=', testJobId);

    const appR = await fetch(`${API}/applications/apply`, {
      method: 'POST', headers: authHeaders(jsToken),
      body: JSON.stringify({ jobId: testJobId, coverLetter: 'cover ' + 'x'.repeat(40), applicationMethod: 'one_click' }),
    });
    const appBody = await appR.json();
    testApplicationId = appBody?.data?.application?._id || '';
    console.log('SETUP testApplicationId=', testApplicationId);

    // Initialize default configurations so configuration endpoints have data
    await fetch(`${API}/configuration/initialize-defaults`, {
      method: 'POST', headers: authHeaders(admToken),
    });
    const configsResp = await fetch(`${API}/configuration?category=content`, { headers: authHeaders(admToken) });
    const configsBody = await configsResp.json();
    const settings = configsBody?.data?.settings;
    if (Array.isArray(settings) && settings[0]) testConfigId = String(settings[0]._id);
    else if (settings?.content?.[0]) testConfigId = String(settings.content[0]._id);
    console.log('SETUP testConfigId=', testConfigId);
  });

  test.afterAll(async () => {
    console.log('=== Tier 2 SWEEP FINDINGS ===');
    if (FINDINGS.length === 0) console.log('No 5xx findings.');
    for (const f of FINDINGS) console.log(JSON.stringify(f));
  });

  // ─────────────────────────────────────────────────────────────────────
  // GROUP 1 — auth.js (11 endpoints)
  // ─────────────────────────────────────────────────────────────────────

  test('SW.auth.GET /me happy', async () => {
    const r = await fetch(`${API}/auth/me`, { headers: authHeaders(jsToken) });
    console.log('OBS GET /auth/me status=', r.status);
    await recordIfErr('GET /auth/me', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.auth.GET /me no-auth', async () => {
    const r = await fetch(`${API}/auth/me`);
    console.log('OBS GET /auth/me no-auth status=', r.status);
    expect(r.status).toBe(401);
  });

  test('SW.auth.PUT /change-password (existing user)', async () => {
    // Use a fresh jobseeker so we can change without affecting other tests
    const fresh = await makeJobseeker();
    const r = await fetch(`${API}/auth/change-password`, {
      method: 'PUT', headers: authHeaders(fresh.token),
      body: JSON.stringify({ currentPassword: 'StrongPass123!', newPassword: 'NewStrong123!' }),
    });
    const body = await r.clone().json().catch(() => ({}));
    console.log('OBS PUT /auth/change-password status=', r.status, 'success=', body.success);
    await recordIfErr('PUT /auth/change-password', r.status, body);
    expect(r.status).toBeLessThan(500);
  });

  test('SW.auth.POST /send-verification', async () => {
    const r = await fetch(`${API}/auth/send-verification`, {
      method: 'POST', headers: authHeaders(jsToken),
    });
    console.log('OBS POST /auth/send-verification status=', r.status);
    await recordIfErr('POST /auth/send-verification', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.auth.POST /verify-email with bogus code', async () => {
    const r = await fetch(`${API}/auth/verify-email`, {
      method: 'POST', headers: authHeaders(jsToken),
      body: JSON.stringify({ code: '000000' }),
    });
    console.log('OBS POST /auth/verify-email bogus status=', r.status);
    await recordIfErr('POST /auth/verify-email', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.auth.POST /logout', async () => {
    const fresh = await makeJobseeker();
    const r = await fetch(`${API}/auth/logout`, {
      method: 'POST', headers: authHeaders(fresh.token),
      body: JSON.stringify({ refreshToken: '' }),
    });
    console.log('OBS POST /auth/logout status=', r.status);
    await recordIfErr('POST /auth/logout', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  // initiate-registration / register / login / refresh / forgot-password / reset-password
  // already covered by Phase 24 P2 — re-running here for endpoint smoke
  test('SW.auth.POST /initiate-registration smoke', async () => {
    const email = `sweep-${Date.now()}@example.com`;
    const r = await fetch(`${API}/auth/initiate-registration`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email, password: 'StrongPass123!', userType: 'jobseeker',
        firstName: 'Sweep', lastName: 'User', city: 'Tiranë'
      })
    });
    console.log('OBS POST /auth/initiate-registration status=', r.status);
    await recordIfErr('POST /auth/initiate-registration', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.auth.POST /refresh smoke', async () => {
    const fresh = await makeJobseeker();
    // /refresh requires the refresh token from the registration response, but our factory doesn't return it.
    // Smoke with an empty body — expect 4xx, never 5xx.
    const r = await fetch(`${API}/auth/refresh`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    console.log('OBS POST /auth/refresh empty status=', r.status);
    await recordIfErr('POST /auth/refresh', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  // ─────────────────────────────────────────────────────────────────────
  // GROUP 2 — users.js (26 endpoints)
  // ─────────────────────────────────────────────────────────────────────

  test('SW.users.GET /profile', async () => {
    const r = await fetch(`${API}/users/profile`, { headers: authHeaders(jsToken) });
    console.log('OBS GET /users/profile status=', r.status);
    await recordIfErr('GET /users/profile', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.users.PUT /profile', async () => {
    const r = await fetch(`${API}/users/profile`, {
      method: 'PUT', headers: authHeaders(jsToken),
      body: JSON.stringify({ firstName: 'Updated', lastName: 'Name' }),
    });
    console.log('OBS PUT /users/profile status=', r.status);
    await recordIfErr('PUT /users/profile', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.users.GET /public-profile/:id', async () => {
    const r = await fetch(`${API}/users/public-profile/${jsUserId}`, { headers: authHeaders(empToken) });
    console.log('OBS GET /users/public-profile/:id status=', r.status);
    await recordIfErr('GET /users/public-profile/:id', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.users.GET /stats', async () => {
    const r = await fetch(`${API}/users/stats`, { headers: authHeaders(jsToken) });
    console.log('OBS GET /users/stats status=', r.status);
    await recordIfErr('GET /users/stats', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.users.GET /export', async () => {
    const r = await fetch(`${API}/users/export`, { headers: authHeaders(jsToken) });
    console.log('OBS GET /users/export status=', r.status);
    await recordIfErr('GET /users/export', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.users.POST /cookie-consent', async () => {
    const r = await fetch(`${API}/users/cookie-consent`, {
      method: 'POST', headers: authHeaders(jsToken),
      body: JSON.stringify({ accepted: true, categories: ['necessary'] }),
    });
    console.log('OBS POST /users/cookie-consent status=', r.status);
    await recordIfErr('POST /users/cookie-consent', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.users.work-experience CRUD', async () => {
    // POST
    const r1 = await fetch(`${API}/users/work-experience`, {
      method: 'POST', headers: authHeaders(jsToken),
      body: JSON.stringify({
        position: 'Test Engineer', company: 'TestCo',
        startDate: '2020-01-01', endDate: '2022-01-01',
        description: 'Tested things'
      }),
    });
    const body1 = await r1.clone().json().catch(() => ({}));
    console.log('OBS POST /users/work-experience status=', r1.status);
    await recordIfErr('POST /users/work-experience', r1.status, body1);

    const me = await dbFindOne('users', { email: jsEmail });
    const wes = me?.profile?.jobSeekerProfile?.workHistory || [];
    const firstId = String(wes[0]?._id || '');
    if (firstId) {
      const r2 = await fetch(`${API}/users/work-experience/${firstId}`, {
        method: 'PUT', headers: authHeaders(jsToken),
        body: JSON.stringify({ position: 'Updated' }),
      });
      console.log('OBS PUT /users/work-experience/:id status=', r2.status);
      await recordIfErr('PUT /users/work-experience/:id', r2.status, await r2.clone().json().catch(() => ({})));

      const r3 = await fetch(`${API}/users/work-experience/${firstId}`, {
        method: 'DELETE', headers: authHeaders(jsToken),
      });
      console.log('OBS DELETE /users/work-experience/:id status=', r3.status);
      await recordIfErr('DELETE /users/work-experience/:id', r3.status, await r3.clone().json().catch(() => ({})));
    }
    expect(r1.status).toBeLessThan(500);
  });

  test('SW.users.education CRUD', async () => {
    const r1 = await fetch(`${API}/users/education`, {
      method: 'POST', headers: authHeaders(jsToken),
      body: JSON.stringify({
        degree: 'BSc CS', school: 'UT', startDate: '2015-01-01', endDate: '2019-01-01'
      }),
    });
    console.log('OBS POST /users/education status=', r1.status);
    await recordIfErr('POST /users/education', r1.status, await r1.clone().json().catch(() => ({})));

    const me = await dbFindOne('users', { email: jsEmail });
    const eds = me?.profile?.jobSeekerProfile?.education || [];
    const firstId = String(eds[0]?._id || '');
    if (firstId) {
      const r2 = await fetch(`${API}/users/education/${firstId}`, {
        method: 'PUT', headers: authHeaders(jsToken),
        body: JSON.stringify({ degree: 'MSc CS' }),
      });
      console.log('OBS PUT /users/education/:id status=', r2.status);
      await recordIfErr('PUT /users/education/:id', r2.status, await r2.clone().json().catch(() => ({})));

      const r3 = await fetch(`${API}/users/education/${firstId}`, {
        method: 'DELETE', headers: authHeaders(jsToken),
      });
      console.log('OBS DELETE /users/education/:id status=', r3.status);
      await recordIfErr('DELETE /users/education/:id', r3.status, await r3.clone().json().catch(() => ({})));
    }
    expect(r1.status).toBeLessThan(500);
  });

  test('SW.users.saved-jobs CRUD', async () => {
    const r1 = await fetch(`${API}/users/saved-jobs/${testJobId}`, {
      method: 'POST', headers: authHeaders(jsToken),
    });
    console.log('OBS POST /users/saved-jobs/:id status=', r1.status);
    await recordIfErr('POST /users/saved-jobs/:id', r1.status, await r1.clone().json().catch(() => ({})));

    const r2 = await fetch(`${API}/users/saved-jobs`, { headers: authHeaders(jsToken) });
    console.log('OBS GET /users/saved-jobs status=', r2.status);
    await recordIfErr('GET /users/saved-jobs', r2.status, await r2.clone().json().catch(() => ({})));

    const r3 = await fetch(`${API}/users/saved-jobs/check/${testJobId}`, { headers: authHeaders(jsToken) });
    console.log('OBS GET /users/saved-jobs/check/:id status=', r3.status);
    await recordIfErr('GET /users/saved-jobs/check/:id', r3.status, await r3.clone().json().catch(() => ({})));

    const r4 = await fetch(`${API}/users/saved-jobs/check-bulk`, {
      method: 'POST', headers: authHeaders(jsToken),
      body: JSON.stringify({ jobIds: [testJobId] }),
    });
    console.log('OBS POST /users/saved-jobs/check-bulk status=', r4.status);
    await recordIfErr('POST /users/saved-jobs/check-bulk', r4.status, await r4.clone().json().catch(() => ({})));

    const r5 = await fetch(`${API}/users/saved-jobs/${testJobId}`, {
      method: 'DELETE', headers: authHeaders(jsToken),
    });
    console.log('OBS DELETE /users/saved-jobs/:id status=', r5.status);
    await recordIfErr('DELETE /users/saved-jobs/:id', r5.status, await r5.clone().json().catch(() => ({})));

    expect(r1.status).toBeLessThan(500);
    expect(r2.status).toBeLessThan(500);
  });

  test('SW.users.GET /admin/pending-employers', async () => {
    const r = await fetch(`${API}/users/admin/pending-employers`, { headers: authHeaders(admToken) });
    console.log('OBS GET /users/admin/pending-employers status=', r.status);
    await recordIfErr('GET /users/admin/pending-employers', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  // PATCH /admin/verify-employer/:id needs a pending employer
  test('SW.users.PATCH /admin/verify-employer/:id', async () => {
    const pendingEmp = await makeEmployer({ preApprove: false });
    const empDoc = await dbFindOne('users', { email: pendingEmp.email });
    const r = await fetch(`${API}/users/admin/verify-employer/${empDoc._id}`, {
      method: 'PATCH', headers: authHeaders(admToken),
      body: JSON.stringify({ verificationStatus: 'verified' }),
    });
    console.log('OBS PATCH /users/admin/verify-employer/:id status=', r.status);
    await recordIfErr('PATCH /users/admin/verify-employer/:id', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  // DELETE /account, /resume, parse-resume, upload-* covered by negative paths
  test('SW.users.DELETE /resume (no resume present)', async () => {
    const r = await fetch(`${API}/users/resume`, {
      method: 'DELETE', headers: authHeaders(jsToken),
    });
    console.log('OBS DELETE /users/resume status=', r.status);
    await recordIfErr('DELETE /users/resume', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  // ─────────────────────────────────────────────────────────────────────
  // GROUP 3 — jobs.js (10 endpoints)
  // ─────────────────────────────────────────────────────────────────────

  test('SW.jobs.GET /', async () => {
    const r = await fetch(`${API}/jobs`);
    console.log('OBS GET /jobs status=', r.status);
    await recordIfErr('GET /jobs', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.jobs.GET /recommendations', async () => {
    const r = await fetch(`${API}/jobs/recommendations`, { headers: authHeaders(jsToken) });
    console.log('OBS GET /jobs/recommendations status=', r.status);
    await recordIfErr('GET /jobs/recommendations', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.jobs.GET /employer/my-jobs', async () => {
    const r = await fetch(`${API}/jobs/employer/my-jobs`, { headers: authHeaders(empToken) });
    console.log('OBS GET /jobs/employer/my-jobs status=', r.status);
    await recordIfErr('GET /jobs/employer/my-jobs', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.jobs.GET /:id', async () => {
    const r = await fetch(`${API}/jobs/${testJobId}`);
    console.log('OBS GET /jobs/:id status=', r.status);
    await recordIfErr('GET /jobs/:id', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.jobs.GET /:id/similar', async () => {
    const r = await fetch(`${API}/jobs/${testJobId}/similar`);
    console.log('OBS GET /jobs/:id/similar status=', r.status);
    await recordIfErr('GET /jobs/:id/similar', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.jobs.PUT /:id', async () => {
    const r = await fetch(`${API}/jobs/${testJobId}`, {
      method: 'PUT', headers: authHeaders(empToken),
      body: JSON.stringify({ title: 'Sweep test engineer (updated)' }),
    });
    console.log('OBS PUT /jobs/:id status=', r.status);
    await recordIfErr('PUT /jobs/:id', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.jobs.PATCH /:id/status', async () => {
    const r = await fetch(`${API}/jobs/${testJobId}/status`, {
      method: 'PATCH', headers: authHeaders(empToken),
      body: JSON.stringify({ status: 'closed' }),
    });
    console.log('OBS PATCH /jobs/:id/status status=', r.status);
    await recordIfErr('PATCH /jobs/:id/status', r.status, await r.clone().json().catch(() => ({})));
    // Re-open for downstream tests
    await fetch(`${API}/jobs/${testJobId}/status`, {
      method: 'PATCH', headers: authHeaders(empToken),
      body: JSON.stringify({ status: 'active' }),
    });
    expect(r.status).toBeLessThan(500);
  });

  test('SW.jobs.POST /:id/renew', async () => {
    const r = await fetch(`${API}/jobs/${testJobId}/renew`, {
      method: 'POST', headers: authHeaders(empToken),
    });
    console.log('OBS POST /jobs/:id/renew status=', r.status);
    await recordIfErr('POST /jobs/:id/renew', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  // POST + DELETE already covered by setup + later tests

  // ─────────────────────────────────────────────────────────────────────
  // GROUP 4 — applications.js (9 endpoints)
  // ─────────────────────────────────────────────────────────────────────

  test('SW.applications.GET /applied-jobs', async () => {
    const r = await fetch(`${API}/applications/applied-jobs`, { headers: authHeaders(jsToken) });
    console.log('OBS GET /applications/applied-jobs status=', r.status);
    await recordIfErr('GET /applications/applied-jobs', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.applications.GET /my-applications', async () => {
    const r = await fetch(`${API}/applications/my-applications`, { headers: authHeaders(jsToken) });
    console.log('OBS GET /applications/my-applications status=', r.status);
    await recordIfErr('GET /applications/my-applications', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.applications.GET /job/:jobId', async () => {
    const r = await fetch(`${API}/applications/job/${testJobId}`, { headers: authHeaders(empToken) });
    console.log('OBS GET /applications/job/:jobId status=', r.status);
    await recordIfErr('GET /applications/job/:jobId', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.applications.GET /employer/all', async () => {
    const r = await fetch(`${API}/applications/employer/all`, { headers: authHeaders(empToken) });
    console.log('OBS GET /applications/employer/all status=', r.status);
    await recordIfErr('GET /applications/employer/all', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.applications.GET /:id', async () => {
    if (!testApplicationId) {
      console.log('OBS GET /applications/:id SKIPPED — no testApplicationId');
      return;
    }
    const r = await fetch(`${API}/applications/${testApplicationId}`, { headers: authHeaders(jsToken) });
    console.log('OBS GET /applications/:id status=', r.status);
    await recordIfErr('GET /applications/:id', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.applications.PATCH /:id/status', async () => {
    if (!testApplicationId) return;
    const r = await fetch(`${API}/applications/${testApplicationId}/status`, {
      method: 'PATCH', headers: authHeaders(empToken),
      body: JSON.stringify({ status: 'viewed' }),
    });
    console.log('OBS PATCH /applications/:id/status status=', r.status);
    await recordIfErr('PATCH /applications/:id/status', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.applications.POST /:id/message', async () => {
    if (!testApplicationId) return;
    const r = await fetch(`${API}/applications/${testApplicationId}/message`, {
      method: 'POST', headers: authHeaders(empToken),
      body: JSON.stringify({ body: 'sweep test message', messageType: 'text' }),
    });
    console.log('OBS POST /applications/:id/message status=', r.status);
    await recordIfErr('POST /applications/:id/message', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  // POST /apply + DELETE /:id covered in setup + later

  // ─────────────────────────────────────────────────────────────────────
  // GROUP 5 — admin.js (12 endpoints)
  // ─────────────────────────────────────────────────────────────────────

  test('SW.admin.GET /dashboard-stats', async () => {
    const r = await fetch(`${API}/admin/dashboard-stats`, { headers: authHeaders(admToken) });
    console.log('OBS GET /admin/dashboard-stats status=', r.status);
    await recordIfErr('GET /admin/dashboard-stats', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.admin.GET /analytics', async () => {
    const r = await fetch(`${API}/admin/analytics`, { headers: authHeaders(admToken) });
    console.log('OBS GET /admin/analytics status=', r.status);
    await recordIfErr('GET /admin/analytics', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.admin.GET /system-health', async () => {
    const r = await fetch(`${API}/admin/system-health`, { headers: authHeaders(admToken) });
    console.log('OBS GET /admin/system-health status=', r.status);
    await recordIfErr('GET /admin/system-health', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.admin.GET /users', async () => {
    const r = await fetch(`${API}/admin/users`, { headers: authHeaders(admToken) });
    console.log('OBS GET /admin/users status=', r.status);
    await recordIfErr('GET /admin/users', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.admin.GET /jobs', async () => {
    const r = await fetch(`${API}/admin/jobs`, { headers: authHeaders(admToken) });
    console.log('OBS GET /admin/jobs status=', r.status);
    await recordIfErr('GET /admin/jobs', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.admin.PATCH /users/:userId/manage', async () => {
    const target = await makeJobseeker();
    const targetDoc = await dbFindOne('users', { email: target.email });
    const r = await fetch(`${API}/admin/users/${targetDoc._id}/manage`, {
      method: 'PATCH', headers: authHeaders(admToken),
      body: JSON.stringify({ action: 'activate' }),
    });
    console.log('OBS PATCH /admin/users/:userId/manage status=', r.status);
    await recordIfErr('PATCH /admin/users/:userId/manage', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.admin.PATCH /jobs/:jobId/manage', async () => {
    const r = await fetch(`${API}/admin/jobs/${testJobId}/manage`, {
      method: 'PATCH', headers: authHeaders(admToken),
      body: JSON.stringify({ action: 'approve' }),
    });
    console.log('OBS PATCH /admin/jobs/:jobId/manage status=', r.status);
    await recordIfErr('PATCH /admin/jobs/:jobId/manage', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.admin.GET /user-insights', async () => {
    const r = await fetch(`${API}/admin/user-insights`, { headers: authHeaders(admToken) });
    console.log('OBS GET /admin/user-insights status=', r.status);
    await recordIfErr('GET /admin/user-insights', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.admin.PATCH /jobs/:id/approve', async () => {
    const r = await fetch(`${API}/admin/jobs/${testJobId}/approve`, {
      method: 'PATCH', headers: authHeaders(admToken),
    });
    console.log('OBS PATCH /admin/jobs/:id/approve status=', r.status);
    await recordIfErr('PATCH /admin/jobs/:id/approve', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.admin.GET /jobs/pending', async () => {
    const r = await fetch(`${API}/admin/jobs/pending`, { headers: authHeaders(admToken) });
    console.log('OBS GET /admin/jobs/pending status=', r.status);
    await recordIfErr('GET /admin/jobs/pending', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.admin.POST /backfill-user-embeddings', async () => {
    const r = await fetch(`${API}/admin/backfill-user-embeddings`, {
      method: 'POST', headers: authHeaders(admToken),
    });
    console.log('OBS POST /admin/backfill-user-embeddings status=', r.status);
    await recordIfErr('POST /admin/backfill-user-embeddings', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.admin.POST /backfill-job-embeddings', async () => {
    const r = await fetch(`${API}/admin/backfill-job-embeddings`, {
      method: 'POST', headers: authHeaders(admToken),
    });
    console.log('OBS POST /admin/backfill-job-embeddings status=', r.status);
    await recordIfErr('POST /admin/backfill-job-embeddings', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  // ─────────────────────────────────────────────────────────────────────
  // GROUP 6 — admin/embeddings.js (9 endpoints)
  // ─────────────────────────────────────────────────────────────────────

  test('SW.embeddings.GET /status', async () => {
    const r = await fetch(`${API}/admin/embeddings/status`, { headers: authHeaders(admToken) });
    console.log('OBS GET /admin/embeddings/status status=', r.status);
    await recordIfErr('GET /admin/embeddings/status', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.embeddings.GET /queue', async () => {
    const r = await fetch(`${API}/admin/embeddings/queue`, { headers: authHeaders(admToken) });
    console.log('OBS GET /admin/embeddings/queue status=', r.status);
    await recordIfErr('GET /admin/embeddings/queue', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.embeddings.GET /workers', async () => {
    const r = await fetch(`${API}/admin/embeddings/workers`, { headers: authHeaders(admToken) });
    console.log('OBS GET /admin/embeddings/workers status=', r.status);
    await recordIfErr('GET /admin/embeddings/workers', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.embeddings.POST /recompute-all', async () => {
    const r = await fetch(`${API}/admin/embeddings/recompute-all`, {
      method: 'POST', headers: authHeaders(admToken),
    });
    console.log('OBS POST /admin/embeddings/recompute-all status=', r.status);
    await recordIfErr('POST /admin/embeddings/recompute-all', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.embeddings.POST /retry-failed', async () => {
    const r = await fetch(`${API}/admin/embeddings/retry-failed`, {
      method: 'POST', headers: authHeaders(admToken),
    });
    console.log('OBS POST /admin/embeddings/retry-failed status=', r.status);
    await recordIfErr('POST /admin/embeddings/retry-failed', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.embeddings.POST /clear-old-queue', async () => {
    const r = await fetch(`${API}/admin/embeddings/clear-old-queue`, {
      method: 'POST', headers: authHeaders(admToken),
    });
    console.log('OBS POST /admin/embeddings/clear-old-queue status=', r.status);
    await recordIfErr('POST /admin/embeddings/clear-old-queue', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.embeddings.POST /toggle-debug', async () => {
    const r = await fetch(`${API}/admin/embeddings/toggle-debug`, {
      method: 'POST', headers: authHeaders(admToken),
      body: JSON.stringify({ enabled: false }),
    });
    console.log('OBS POST /admin/embeddings/toggle-debug status=', r.status);
    await recordIfErr('POST /admin/embeddings/toggle-debug', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.embeddings.POST /queue-job/:jobId', async () => {
    const r = await fetch(`${API}/admin/embeddings/queue-job/${testJobId}`, {
      method: 'POST', headers: authHeaders(admToken),
    });
    console.log('OBS POST /admin/embeddings/queue-job/:jobId status=', r.status);
    await recordIfErr('POST /admin/embeddings/queue-job/:jobId', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  // DELETE /queue-item/:queueId — needs a real queue item id; sample one if exists
  test('SW.embeddings.DELETE /queue-item/:queueId', async () => {
    const r1 = await fetch(`${API}/admin/embeddings/queue`, { headers: authHeaders(admToken) });
    const body1 = await r1.json();
    const item = body1?.data?.queueItems?.[0];
    if (!item?.queueId) {
      console.log('OBS DELETE /admin/embeddings/queue-item/:queueId SKIPPED — no queue items');
      return;
    }
    const r = await fetch(`${API}/admin/embeddings/queue-item/${item.queueId}`, {
      method: 'DELETE', headers: authHeaders(admToken),
    });
    console.log('OBS DELETE /admin/embeddings/queue-item/:queueId status=', r.status);
    await recordIfErr('DELETE /admin/embeddings/queue-item/:queueId', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  // ─────────────────────────────────────────────────────────────────────
  // GROUP 7 — business-control.js (17 endpoints)
  // ─────────────────────────────────────────────────────────────────────

  test('SW.business.campaigns CRUD smoke', async () => {
    const startDate = new Date(Date.now() + 86400_000).toISOString();
    const endDate = new Date(Date.now() + 7 * 86400_000).toISOString();
    const r1 = await fetch(`${API}/business-control/campaigns`, {
      method: 'POST', headers: authHeaders(admToken),
      body: JSON.stringify({
        name: 'Sweep test campaign',
        type: 'discount', description: 'sweep',
        startDate, endDate,
        targeting: { userType: 'all' },
        rules: { discountPercent: 10 }
      }),
    });
    const body1 = await r1.clone().json().catch(() => ({}));
    console.log('OBS POST /business-control/campaigns status=', r1.status);
    await recordIfErr('POST /business-control/campaigns', r1.status, body1);
    testCampaignId = body1?.data?.campaign?._id || '';

    const r2 = await fetch(`${API}/business-control/campaigns`, { headers: authHeaders(admToken) });
    console.log('OBS GET /business-control/campaigns status=', r2.status);
    await recordIfErr('GET /business-control/campaigns', r2.status, await r2.clone().json().catch(() => ({})));

    if (testCampaignId) {
      const r3 = await fetch(`${API}/business-control/campaigns/${testCampaignId}`, {
        method: 'PUT', headers: authHeaders(admToken),
        body: JSON.stringify({ name: 'Sweep updated' }),
      });
      console.log('OBS PUT /business-control/campaigns/:id status=', r3.status);
      await recordIfErr('PUT /business-control/campaigns/:id', r3.status, await r3.clone().json().catch(() => ({})));

      const r4 = await fetch(`${API}/business-control/campaigns/${testCampaignId}/activate`, {
        method: 'POST', headers: authHeaders(admToken),
      });
      console.log('OBS POST /business-control/campaigns/:id/activate status=', r4.status);
      await recordIfErr('POST /business-control/campaigns/:id/activate', r4.status, await r4.clone().json().catch(() => ({})));

      const r5 = await fetch(`${API}/business-control/campaigns/${testCampaignId}/pause`, {
        method: 'POST', headers: authHeaders(admToken),
      });
      console.log('OBS POST /business-control/campaigns/:id/pause status=', r5.status);
      await recordIfErr('POST /business-control/campaigns/:id/pause', r5.status, await r5.clone().json().catch(() => ({})));
    }
    expect(r1.status).toBeLessThan(500);
  });

  test('SW.business.pricing-rules CRUD smoke', async () => {
    const r1 = await fetch(`${API}/business-control/pricing-rules`, {
      method: 'POST', headers: authHeaders(admToken),
      body: JSON.stringify({
        name: 'Sweep rule',
        tier: 'standard',
        description: 'sweep',
        conditions: { jobType: 'full-time' },
        adjustments: { multiplier: 1.0 }
      }),
    });
    const body1 = await r1.clone().json().catch(() => ({}));
    console.log('OBS POST /business-control/pricing-rules status=', r1.status, 'success=', body1.success);
    await recordIfErr('POST /business-control/pricing-rules', r1.status, body1);
    testPricingRuleId = body1?.data?.rule?._id || body1?.data?._id || '';

    const r2 = await fetch(`${API}/business-control/pricing-rules`, { headers: authHeaders(admToken) });
    console.log('OBS GET /business-control/pricing-rules status=', r2.status);
    await recordIfErr('GET /business-control/pricing-rules', r2.status, await r2.clone().json().catch(() => ({})));

    if (testPricingRuleId) {
      const r3 = await fetch(`${API}/business-control/pricing-rules/${testPricingRuleId}`, {
        method: 'PUT', headers: authHeaders(admToken),
        body: JSON.stringify({ name: 'Sweep updated' }),
      });
      console.log('OBS PUT /business-control/pricing-rules/:id status=', r3.status);
      await recordIfErr('PUT /business-control/pricing-rules/:id', r3.status, await r3.clone().json().catch(() => ({})));

      const r4 = await fetch(`${API}/business-control/pricing-rules/${testPricingRuleId}/toggle`, {
        method: 'POST', headers: authHeaders(admToken),
      });
      console.log('OBS POST /business-control/pricing-rules/:id/toggle status=', r4.status);
      await recordIfErr('POST /business-control/pricing-rules/:id/toggle', r4.status, await r4.clone().json().catch(() => ({})));
    }
    expect(r1.status).toBeLessThan(500);
  });

  test('SW.business.GET /analytics/dashboard', async () => {
    const r = await fetch(`${API}/business-control/analytics/dashboard`, { headers: authHeaders(admToken) });
    console.log('OBS GET /business-control/analytics/dashboard status=', r.status);
    await recordIfErr('GET /business-control/analytics/dashboard', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.business.GET /analytics/revenue', async () => {
    const r = await fetch(`${API}/business-control/analytics/revenue`, { headers: authHeaders(admToken) });
    console.log('OBS GET /business-control/analytics/revenue status=', r.status);
    await recordIfErr('GET /business-control/analytics/revenue', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.business.POST /analytics/update', async () => {
    const r = await fetch(`${API}/business-control/analytics/update`, {
      method: 'POST', headers: authHeaders(admToken),
    });
    console.log('OBS POST /business-control/analytics/update status=', r.status);
    await recordIfErr('POST /business-control/analytics/update', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.business.POST /platform/emergency', async () => {
    const r = await fetch(`${API}/business-control/platform/emergency`, {
      method: 'POST', headers: authHeaders(admToken),
      body: JSON.stringify({ action: 'pause_jobs' }),
    });
    console.log('OBS POST /business-control/platform/emergency status=', r.status);
    await recordIfErr('POST /business-control/platform/emergency', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
    // Reset
    await fetch(`${API}/business-control/platform/emergency`, {
      method: 'POST', headers: authHeaders(admToken),
      body: JSON.stringify({ action: 'resume_jobs' }),
    });
  });

  test('SW.business.GET /whitelist', async () => {
    const r = await fetch(`${API}/business-control/whitelist`, { headers: authHeaders(admToken) });
    console.log('OBS GET /business-control/whitelist status=', r.status);
    await recordIfErr('GET /business-control/whitelist', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.business.POST then DELETE /whitelist/:employerId', async () => {
    const r1 = await fetch(`${API}/business-control/whitelist/${empUserId}`, {
      method: 'POST', headers: authHeaders(admToken),
      body: JSON.stringify({ reason: 'sweep test' }),
    });
    console.log('OBS POST /business-control/whitelist/:id status=', r1.status);
    await recordIfErr('POST /business-control/whitelist/:id', r1.status, await r1.clone().json().catch(() => ({})));

    const r2 = await fetch(`${API}/business-control/whitelist/${empUserId}`, {
      method: 'DELETE', headers: authHeaders(admToken),
    });
    console.log('OBS DELETE /business-control/whitelist/:id status=', r2.status);
    await recordIfErr('DELETE /business-control/whitelist/:id', r2.status, await r2.clone().json().catch(() => ({})));
    expect(r1.status).toBeLessThan(500);
  });

  test('SW.business.GET /employers/search', async () => {
    const r = await fetch(`${API}/business-control/employers/search?q=test`, { headers: authHeaders(admToken) });
    console.log('OBS GET /business-control/employers/search status=', r.status);
    await recordIfErr('GET /business-control/employers/search', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  // ─────────────────────────────────────────────────────────────────────
  // GROUP 8 — bulk-notifications.js (6 endpoints)
  // ─────────────────────────────────────────────────────────────────────

  test('SW.bulk.POST /', async () => {
    const r = await fetch(`${API}/bulk-notifications`, {
      method: 'POST', headers: authHeaders(admToken),
      body: JSON.stringify({
        title: 'Sweep notice',
        message: 'sweep test bulk',
        type: 'announcement',
        targetAudience: 'all',
        deliveryChannels: { inApp: true, email: false }
      }),
    });
    const body = await r.clone().json().catch(() => ({}));
    console.log('OBS POST /bulk-notifications status=', r.status);
    await recordIfErr('POST /bulk-notifications', r.status, body);
    testBulkNotifId = body?.data?.bulkNotification?._id || '';
    expect(r.status).toBeLessThan(500);
  });

  test('SW.bulk.GET /', async () => {
    const r = await fetch(`${API}/bulk-notifications`, { headers: authHeaders(admToken) });
    console.log('OBS GET /bulk-notifications status=', r.status);
    await recordIfErr('GET /bulk-notifications', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.bulk.GET /:id', async () => {
    if (!testBulkNotifId) return;
    const r = await fetch(`${API}/bulk-notifications/${testBulkNotifId}`, { headers: authHeaders(admToken) });
    console.log('OBS GET /bulk-notifications/:id status=', r.status);
    await recordIfErr('GET /bulk-notifications/:id', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.bulk.GET /templates/list', async () => {
    const r = await fetch(`${API}/bulk-notifications/templates/list`, { headers: authHeaders(admToken) });
    console.log('OBS GET /bulk-notifications/templates/list status=', r.status);
    await recordIfErr('GET /bulk-notifications/templates/list', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.bulk.DELETE /:id', async () => {
    if (!testBulkNotifId) return;
    const r = await fetch(`${API}/bulk-notifications/${testBulkNotifId}`, {
      method: 'DELETE', headers: authHeaders(admToken),
    });
    console.log('OBS DELETE /bulk-notifications/:id status=', r.status);
    await recordIfErr('DELETE /bulk-notifications/:id', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  // POST /templates/:id/create needs a template id — skip if no templates
  test('SW.bulk.POST /templates/:id/create', async () => {
    const tr = await fetch(`${API}/bulk-notifications/templates/list`, { headers: authHeaders(admToken) });
    const tl = await tr.json();
    const tpls = tl?.data?.templates ?? tl?.data ?? [];
    if (!Array.isArray(tpls) || tpls.length === 0) {
      console.log('OBS POST /bulk-notifications/templates/:id/create SKIPPED — no templates');
      return;
    }
    const tpl = tpls[0];
    const r = await fetch(`${API}/bulk-notifications/templates/${tpl._id}/create`, {
      method: 'POST', headers: authHeaders(admToken),
    });
    console.log('OBS POST /bulk-notifications/templates/:id/create status=', r.status);
    await recordIfErr('POST /bulk-notifications/templates/:id/create', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  // ─────────────────────────────────────────────────────────────────────
  // GROUP 9 — configuration.js (11 endpoints)
  // ─────────────────────────────────────────────────────────────────────

  test('SW.config.GET /', async () => {
    const r = await fetch(`${API}/configuration`, { headers: authHeaders(admToken) });
    console.log('OBS GET /configuration status=', r.status);
    await recordIfErr('GET /configuration', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.config.GET /public', async () => {
    const r = await fetch(`${API}/configuration/public`);
    console.log('OBS GET /configuration/public status=', r.status);
    await recordIfErr('GET /configuration/public', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.config.GET /pricing', async () => {
    const r = await fetch(`${API}/configuration/pricing`, { headers: authHeaders(admToken) });
    console.log('OBS GET /configuration/pricing status=', r.status);
    await recordIfErr('GET /configuration/pricing', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.config.PUT /pricing', async () => {
    const r = await fetch(`${API}/configuration/pricing`, {
      method: 'PUT', headers: authHeaders(admToken),
      body: JSON.stringify({ pricing: {} }),
    });
    console.log('OBS PUT /configuration/pricing status=', r.status);
    await recordIfErr('PUT /configuration/pricing', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.config.PUT /:id then POST /:id/reset', async () => {
    if (!testConfigId) {
      console.log('OBS config PUT/reset SKIPPED — no testConfigId');
      return;
    }
    const r1 = await fetch(`${API}/configuration/${testConfigId}`, {
      method: 'PUT', headers: authHeaders(admToken),
      body: JSON.stringify({ value: 31, reason: 'sweep test' }),
    });
    console.log('OBS PUT /configuration/:id status=', r1.status);
    await recordIfErr('PUT /configuration/:id', r1.status, await r1.clone().json().catch(() => ({})));

    const r2 = await fetch(`${API}/configuration/${testConfigId}/reset`, {
      method: 'POST', headers: authHeaders(admToken),
    });
    console.log('OBS POST /configuration/:id/reset status=', r2.status);
    await recordIfErr('POST /configuration/:id/reset', r2.status, await r2.clone().json().catch(() => ({})));
    expect(r1.status).toBeLessThan(500);
  });

  test('SW.config.GET /audit', async () => {
    const r = await fetch(`${API}/configuration/audit`, { headers: authHeaders(admToken) });
    console.log('OBS GET /configuration/audit status=', r.status);
    await recordIfErr('GET /configuration/audit', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.config.GET /audit/:id', async () => {
    if (!testConfigId) return;
    const r = await fetch(`${API}/configuration/audit/${testConfigId}`, { headers: authHeaders(admToken) });
    console.log('OBS GET /configuration/audit/:id status=', r.status);
    await recordIfErr('GET /configuration/audit/:id', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.config.GET /system-health', async () => {
    const r = await fetch(`${API}/configuration/system-health`, { headers: authHeaders(admToken) });
    console.log('OBS GET /configuration/system-health status=', r.status);
    await recordIfErr('GET /configuration/system-health', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.config.POST /maintenance-mode', async () => {
    const r = await fetch(`${API}/configuration/maintenance-mode`, {
      method: 'POST', headers: authHeaders(admToken),
      body: JSON.stringify({ enabled: false }),
    });
    console.log('OBS POST /configuration/maintenance-mode status=', r.status);
    await recordIfErr('POST /configuration/maintenance-mode', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  // POST /initialize-defaults already called in beforeAll

  // ─────────────────────────────────────────────────────────────────────
  // GROUP 10 — notifications.js (12 endpoints)
  // ─────────────────────────────────────────────────────────────────────

  test('SW.notifs.GET /', async () => {
    const r = await fetch(`${API}/notifications`, { headers: authHeaders(jsToken) });
    console.log('OBS GET /notifications status=', r.status);
    await recordIfErr('GET /notifications', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.notifs.GET /unread-count', async () => {
    const r = await fetch(`${API}/notifications/unread-count`, { headers: authHeaders(jsToken) });
    console.log('OBS GET /notifications/unread-count status=', r.status);
    await recordIfErr('GET /notifications/unread-count', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.notifs.PATCH /:id/read', async () => {
    // Insert a notification directly to get an id
    await dbInsert('notifications', {
      userId: jsUserId, type: 'general', title: 'sweep', message: 'sweep', isRead: false
    });
    const me = await dbFindOne('notifications', { userId: jsUserId });
    if (!me?._id) return;
    const r = await fetch(`${API}/notifications/${me._id}/read`, {
      method: 'PATCH', headers: authHeaders(jsToken),
    });
    console.log('OBS PATCH /notifications/:id/read status=', r.status);
    await recordIfErr('PATCH /notifications/:id/read', r.status, await r.clone().json().catch(() => ({})));
    testNotificationId = String(me._id);
    expect(r.status).toBeLessThan(500);
  });

  test('SW.notifs.PATCH /mark-all-read', async () => {
    const r = await fetch(`${API}/notifications/mark-all-read`, {
      method: 'PATCH', headers: authHeaders(jsToken),
    });
    console.log('OBS PATCH /notifications/mark-all-read status=', r.status);
    await recordIfErr('PATCH /notifications/mark-all-read', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.notifs.DELETE /:id', async () => {
    if (!testNotificationId) return;
    const r = await fetch(`${API}/notifications/${testNotificationId}`, {
      method: 'DELETE', headers: authHeaders(jsToken),
    });
    console.log('OBS DELETE /notifications/:id status=', r.status);
    await recordIfErr('DELETE /notifications/:id', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.notifs.POST /test-job-match', async () => {
    const r = await fetch(`${API}/notifications/test-job-match`, {
      method: 'POST', headers: authHeaders(admToken),
      body: JSON.stringify({ userId: jsUserId, jobId: testJobId }),
    });
    console.log('OBS POST /notifications/test-job-match status=', r.status);
    await recordIfErr('POST /notifications/test-job-match', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.notifs.POST /send-daily-digest', async () => {
    const r = await fetch(`${API}/notifications/send-daily-digest`, {
      method: 'POST', headers: authHeaders(admToken),
    });
    console.log('OBS POST /notifications/send-daily-digest status=', r.status);
    await recordIfErr('POST /notifications/send-daily-digest', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.notifs.POST /send-weekly-digest', async () => {
    const r = await fetch(`${API}/notifications/send-weekly-digest`, {
      method: 'POST', headers: authHeaders(admToken),
    });
    console.log('OBS POST /notifications/send-weekly-digest status=', r.status);
    await recordIfErr('POST /notifications/send-weekly-digest', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.notifs.POST /test-welcome-email', async () => {
    const r = await fetch(`${API}/notifications/test-welcome-email`, {
      method: 'POST', headers: authHeaders(admToken),
      body: JSON.stringify({ email: 'sweep-target@example.com', userType: 'jobseeker' }),
    });
    console.log('OBS POST /notifications/test-welcome-email status=', r.status);
    await recordIfErr('POST /notifications/test-welcome-email', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.notifs.GET /quickuser-stats', async () => {
    const r = await fetch(`${API}/notifications/quickuser-stats`, { headers: authHeaders(admToken) });
    console.log('OBS GET /notifications/quickuser-stats status=', r.status);
    await recordIfErr('GET /notifications/quickuser-stats', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.notifs.POST /manual-notify', async () => {
    const r = await fetch(`${API}/notifications/manual-notify`, {
      method: 'POST', headers: authHeaders(admToken),
      body: JSON.stringify({ jobId: testJobId, userIds: [jsUserId] }),
    });
    console.log('OBS POST /notifications/manual-notify status=', r.status);
    await recordIfErr('POST /notifications/manual-notify', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.notifs.GET /eligible-users/:jobId', async () => {
    const r = await fetch(`${API}/notifications/eligible-users/${testJobId}`, { headers: authHeaders(admToken) });
    console.log('OBS GET /notifications/eligible-users/:jobId status=', r.status);
    await recordIfErr('GET /notifications/eligible-users/:jobId', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  // ─────────────────────────────────────────────────────────────────────
  // GROUP 11 — quickusers.js (7 endpoints)
  // ─────────────────────────────────────────────────────────────────────

  test('SW.quick.POST / (signup)', async () => {
    const fd = new FormData();
    fd.append('firstName', 'Quick');
    fd.append('lastName', 'User');
    fd.append('email', `quick-${Date.now()}@example.com`);
    fd.append('location', 'Tiranë');
    fd.append('interests', JSON.stringify(['IT']));
    const r = await fetch(`${API}/quickusers`, { method: 'POST', body: fd });
    console.log('OBS POST /quickusers status=', r.status);
    await recordIfErr('POST /quickusers', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.quick.POST /unsubscribe', async () => {
    const r = await fetch(`${API}/quickusers/unsubscribe`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'bogus-token-sweep' }),
    });
    console.log('OBS POST /quickusers/unsubscribe status=', r.status);
    await recordIfErr('POST /quickusers/unsubscribe', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.quick.POST /track-click', async () => {
    const r = await fetch(`${API}/quickusers/track-click`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'bogus-token-sweep', target: 'unsubscribe' }),
    });
    console.log('OBS POST /quickusers/track-click status=', r.status);
    await recordIfErr('POST /quickusers/track-click', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.quick.GET /analytics/overview', async () => {
    const r = await fetch(`${API}/quickusers/analytics/overview`, { headers: authHeaders(admToken) });
    console.log('OBS GET /quickusers/analytics/overview status=', r.status);
    await recordIfErr('GET /quickusers/analytics/overview', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.quick.POST /find-matches', async () => {
    const r = await fetch(`${API}/quickusers/find-matches`, {
      method: 'POST', headers: authHeaders(admToken),
      body: JSON.stringify({ jobId: testJobId }),
    });
    console.log('OBS POST /quickusers/find-matches status=', r.status);
    await recordIfErr('POST /quickusers/find-matches', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.quick.GET /:id', async () => {
    // Find any quickuser
    const qu = await dbFindOne('quickusers', {});
    if (!qu?._id) {
      console.log('OBS GET /quickusers/:id SKIPPED — no quickusers');
      return;
    }
    const r = await fetch(`${API}/quickusers/${qu._id}`, { headers: authHeaders(admToken) });
    console.log('OBS GET /quickusers/:id status=', r.status);
    await recordIfErr('GET /quickusers/:id', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.quick.PUT /:id/preferences', async () => {
    const qu = await dbFindOne('quickusers', {});
    if (!qu?._id) return;
    const r = await fetch(`${API}/quickusers/${qu._id}/preferences`, {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: qu.unsubscribeToken, interests: ['IT'] }),
    });
    console.log('OBS PUT /quickusers/:id/preferences status=', r.status);
    await recordIfErr('PUT /quickusers/:id/preferences', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  // ─────────────────────────────────────────────────────────────────────
  // GROUP 12 — verification.js (5 endpoints)
  // ─────────────────────────────────────────────────────────────────────

  test('SW.verif.POST /request', async () => {
    const r = await fetch(`${API}/verification/request`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identifier: `verif-${Date.now()}@example.com`, method: 'email' }),
    });
    console.log('OBS POST /verification/request status=', r.status);
    await recordIfErr('POST /verification/request', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.verif.POST /verify (bogus)', async () => {
    const r = await fetch(`${API}/verification/verify`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identifier: 'no-such@example.com', code: '000000', method: 'email' }),
    });
    console.log('OBS POST /verification/verify status=', r.status);
    await recordIfErr('POST /verification/verify', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.verif.POST /validate-token', async () => {
    const r = await fetch(`${API}/verification/validate-token`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'bogus-validation-token' }),
    });
    console.log('OBS POST /verification/validate-token status=', r.status);
    await recordIfErr('POST /verification/validate-token', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.verif.POST /resend', async () => {
    const r = await fetch(`${API}/verification/resend`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identifier: 'no-such@example.com', method: 'email' }),
    });
    console.log('OBS POST /verification/resend status=', r.status);
    await recordIfErr('POST /verification/resend', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.verif.GET /status/:identifier', async () => {
    const r = await fetch(`${API}/verification/status/no-such@example.com`);
    console.log('OBS GET /verification/status/:identifier status=', r.status);
    await recordIfErr('GET /verification/status/:identifier', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  // ─────────────────────────────────────────────────────────────────────
  // GROUP 13 — cv.js (4 endpoints)
  // ─────────────────────────────────────────────────────────────────────

  test('SW.cv.GET /my-cv', async () => {
    const r = await fetch(`${API}/cv/my-cv`, { headers: authHeaders(jsToken) });
    console.log('OBS GET /cv/my-cv status=', r.status);
    await recordIfErr('GET /cv/my-cv', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  // POST /generate triggers OpenAI — skip in test env
  test('SW.cv.POST /generate (no real OpenAI; expect 4xx not 5xx)', async () => {
    const r = await fetch(`${API}/cv/generate`, {
      method: 'POST', headers: authHeaders(jsToken),
      body: JSON.stringify({ language: 'sq', tone: 'professional' }),
    });
    console.log('OBS POST /cv/generate status=', r.status);
    await recordIfErr('POST /cv/generate', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.cv.GET /download/:fileId (bogus)', async () => {
    const r = await fetch(`${API}/cv/download/${'a'.repeat(24)}`, { headers: authHeaders(jsToken) });
    console.log('OBS GET /cv/download/:fileId status=', r.status);
    await recordIfErr('GET /cv/download/:fileId', r.status, await r.clone().text().then(t => t.slice(0, 100)).catch(() => ''));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.cv.GET /preview/:fileId (bogus)', async () => {
    const r = await fetch(`${API}/cv/preview/${'a'.repeat(24)}`, { headers: authHeaders(jsToken) });
    console.log('OBS GET /cv/preview/:fileId status=', r.status);
    await recordIfErr('GET /cv/preview/:fileId', r.status, await r.clone().text().then(t => t.slice(0, 100)).catch(() => ''));
    expect(r.status).toBeLessThan(500);
  });

  // ─────────────────────────────────────────────────────────────────────
  // GROUP 14 — companies.js (3 endpoints)
  // ─────────────────────────────────────────────────────────────────────

  test('SW.companies.GET /', async () => {
    const r = await fetch(`${API}/companies`);
    console.log('OBS GET /companies status=', r.status);
    await recordIfErr('GET /companies', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.companies.GET /:id', async () => {
    const r = await fetch(`${API}/companies/${empUserId}`);
    console.log('OBS GET /companies/:id status=', r.status);
    await recordIfErr('GET /companies/:id', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.companies.GET /:id/jobs', async () => {
    const r = await fetch(`${API}/companies/${empUserId}/jobs`);
    console.log('OBS GET /companies/:id/jobs status=', r.status);
    await recordIfErr('GET /companies/:id/jobs', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  // ─────────────────────────────────────────────────────────────────────
  // GROUP 15 — locations.js (2 endpoints)
  // ─────────────────────────────────────────────────────────────────────

  test('SW.locs.GET /', async () => {
    const r = await fetch(`${API}/locations`);
    console.log('OBS GET /locations status=', r.status);
    await recordIfErr('GET /locations', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.locs.GET /popular', async () => {
    const r = await fetch(`${API}/locations/popular`);
    console.log('OBS GET /locations/popular status=', r.status);
    await recordIfErr('GET /locations/popular', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  // ─────────────────────────────────────────────────────────────────────
  // GROUP 16 — matching.js (4 endpoints)
  // ─────────────────────────────────────────────────────────────────────

  test('SW.match.GET /jobs/:jobId/candidates', async () => {
    const r = await fetch(`${API}/matching/jobs/${testJobId}/candidates`, { headers: authHeaders(empToken) });
    console.log('OBS GET /matching/jobs/:jobId/candidates status=', r.status);
    await recordIfErr('GET /matching/jobs/:jobId/candidates', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.match.POST /jobs/:jobId/purchase', async () => {
    const r = await fetch(`${API}/matching/jobs/${testJobId}/purchase`, {
      method: 'POST', headers: authHeaders(empToken),
    });
    console.log('OBS POST /matching/jobs/:jobId/purchase status=', r.status);
    // 503 here is the deterministic "payments not yet available" branch
    // (ENABLE_MOCK_PAYMENTS=false in the test launcher); not a server error.
    if (r.status !== 503) {
      await recordIfErr('POST /matching/jobs/:jobId/purchase', r.status, await r.clone().json().catch(() => ({})));
      expect(r.status).toBeLessThan(500);
    }
  });

  test('SW.match.POST /track-contact', async () => {
    const r = await fetch(`${API}/matching/track-contact`, {
      method: 'POST', headers: authHeaders(empToken),
      body: JSON.stringify({ candidateId: jsUserId, jobId: testJobId, channel: 'in-app' }),
    });
    console.log('OBS POST /matching/track-contact status=', r.status);
    await recordIfErr('POST /matching/track-contact', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.match.GET /jobs/:jobId/access', async () => {
    const r = await fetch(`${API}/matching/jobs/${testJobId}/access`, { headers: authHeaders(empToken) });
    console.log('OBS GET /matching/jobs/:jobId/access status=', r.status);
    await recordIfErr('GET /matching/jobs/:jobId/access', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  // ─────────────────────────────────────────────────────────────────────
  // GROUP 17 — reports.js (8 endpoints)
  // ─────────────────────────────────────────────────────────────────────

  test('SW.reports.POST /', async () => {
    const r = await fetch(`${API}/reports`, {
      method: 'POST', headers: authHeaders(jsToken),
      body: JSON.stringify({
        reportedUserId: empUserId,
        category: 'spam_behavior',
        description: 'sweep test report description'
      }),
    });
    const body = await r.clone().json().catch(() => ({}));
    console.log('OBS POST /reports status=', r.status);
    await recordIfErr('POST /reports', r.status, body);
    testReportId = body?.data?.report?._id || '';
    expect(r.status).toBeLessThan(500);
  });

  test('SW.reports.GET /', async () => {
    const r = await fetch(`${API}/reports`, { headers: authHeaders(jsToken) });
    console.log('OBS GET /reports status=', r.status);
    await recordIfErr('GET /reports', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.reports.GET /admin', async () => {
    const r = await fetch(`${API}/reports/admin`, { headers: authHeaders(admToken) });
    console.log('OBS GET /reports/admin status=', r.status);
    await recordIfErr('GET /reports/admin', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.reports.GET /admin/stats', async () => {
    const r = await fetch(`${API}/reports/admin/stats`, { headers: authHeaders(admToken) });
    console.log('OBS GET /reports/admin/stats status=', r.status);
    await recordIfErr('GET /reports/admin/stats', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.reports.GET /admin/:id', async () => {
    if (!testReportId) return;
    const r = await fetch(`${API}/reports/admin/${testReportId}`, { headers: authHeaders(admToken) });
    console.log('OBS GET /reports/admin/:id status=', r.status);
    await recordIfErr('GET /reports/admin/:id', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.reports.PUT /admin/:id', async () => {
    if (!testReportId) return;
    const r = await fetch(`${API}/reports/admin/${testReportId}`, {
      method: 'PUT', headers: authHeaders(admToken),
      body: JSON.stringify({ status: 'reviewed' }),
    });
    console.log('OBS PUT /reports/admin/:id status=', r.status);
    await recordIfErr('PUT /reports/admin/:id', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.reports.POST /admin/:id/action', async () => {
    if (!testReportId) return;
    const r = await fetch(`${API}/reports/admin/${testReportId}/action`, {
      method: 'POST', headers: authHeaders(admToken),
      body: JSON.stringify({ action: 'warning', notes: 'sweep test action' }),
    });
    console.log('OBS POST /reports/admin/:id/action status=', r.status);
    await recordIfErr('POST /reports/admin/:id/action', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.reports.POST /admin/:id/reopen', async () => {
    if (!testReportId) return;
    const r = await fetch(`${API}/reports/admin/${testReportId}/reopen`, {
      method: 'POST', headers: authHeaders(admToken),
    });
    console.log('OBS POST /reports/admin/:id/reopen status=', r.status);
    await recordIfErr('POST /reports/admin/:id/reopen', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  // ─────────────────────────────────────────────────────────────────────
  // GROUP 18 — stats.js (1 endpoint)
  // ─────────────────────────────────────────────────────────────────────

  test('SW.stats.GET /public', async () => {
    const r = await fetch(`${API}/stats/public`);
    console.log('OBS GET /stats/public status=', r.status);
    await recordIfErr('GET /stats/public', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  // ─────────────────────────────────────────────────────────────────────
  // CLEANUP — Delete the seed job + application
  // ─────────────────────────────────────────────────────────────────────

  test('SW.cleanup.application withdraw', async () => {
    if (!testApplicationId) return;
    const r = await fetch(`${API}/applications/${testApplicationId}`, {
      method: 'DELETE', headers: authHeaders(jsToken),
    });
    console.log('OBS DELETE /applications/:id status=', r.status);
    await recordIfErr('DELETE /applications/:id', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });

  test('SW.cleanup.job delete', async () => {
    const r = await fetch(`${API}/jobs/${testJobId}`, {
      method: 'DELETE', headers: authHeaders(empToken),
    });
    console.log('OBS DELETE /jobs/:id status=', r.status);
    await recordIfErr('DELETE /jobs/:id', r.status, await r.clone().json().catch(() => ({})));
    expect(r.status).toBeLessThan(500);
  });
});
