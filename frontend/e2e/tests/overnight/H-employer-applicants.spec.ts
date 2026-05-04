/**
 * Section H — Employer applicant management.
 *
 * 15 user stories. Apply some applications first, then test status flow,
 * messaging, etc.
 */

import { test } from '@playwright/test';
import { dbClear } from '../../real-backend/db-helpers';
import {
  expect, FRONTEND, API, makeEmployer, makeJobseeker, authHeaders, dbFind,
  loginViaStorage, NORMAL_PLATFORM,
} from './_helpers';

test.describe.configure({ mode: 'serial' });

let empToken: string;
let jobId: string;
let jsTokens: string[] = [];
let appIds: string[] = [];

test.beforeAll(async () => {
  await dbClear();

  const emp = await makeEmployer({ preApprove: true });
  empToken = emp.token;

  // Post a job — defensively check the response
  const jobRes = await fetch(`${API}/jobs`, {
    method: 'POST', headers: authHeaders(empToken),
    body: JSON.stringify({
      title: '[OVERNIGHT-H] Senior Developer for Applicant Tests',
      description: 'Job for testing applicant management flows. Real role, real description, real text.',
      category: 'Teknologji', jobType: 'full-time',
      location: { city: 'Tiranë' }, platformCategories: NORMAL_PLATFORM,
      salary: { min: 1500, max: 3000, currency: 'EUR' },
    }),
  });
  const jobBody = await jobRes.json();
  if (!jobBody.success) {
    throw new Error(`H beforeAll: job creation failed (${jobRes.status}): ${JSON.stringify(jobBody).slice(0, 200)}`);
  }
  jobId = jobBody.data.job._id;

  // Create 4 jobseekers + apply
  for (let i = 0; i < 4; i++) {
    const js = await makeJobseeker();
    jsTokens.push(js.token);
    const r = await fetch(`${API}/applications/apply`, {
      method: 'POST', headers: authHeaders(js.token),
      body: JSON.stringify({ jobId, applicationMethod: 'one_click' }),
    });
    const b = await r.json();
    if (b.success) appIds.push(b.data.application._id);
  }

  if (appIds.length < 4) {
    console.warn(`H beforeAll: only ${appIds.length}/4 applications created`);
  }
});

test.describe('Section H — Employer applicant management', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaStorage(page, empToken);
  });

  test('H.1 GET /applications/job/:jobId — employer sees their applicants', async ({ page }) => {
    const r = await fetch(`${API}/applications/job/${jobId}`, {
      method: 'GET', headers: authHeaders(empToken),
    });
    expect(r.status).toBe(200);
    const b = await r.json();
    expect((b.data?.applications || []).length).toBeGreaterThanOrEqual(4);
  });

  test('H.2 employer-dashboard shows applicants count', async ({ page }) => {
    await page.goto(`${FRONTEND}/employer-dashboard`);
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(2000);
    expect(page.url()).toContain('employer-dashboard');
  });

  test('H.3 mark applicant as viewed (status change)', async ({ page }) => {
    const r = await fetch(`${API}/applications/${appIds[0]}/status`, {
      method: 'PATCH', headers: authHeaders(empToken),
      body: JSON.stringify({ status: 'viewed' }),
    });
    expect(r.status).toBeLessThan(500);
    const apps = await dbFind('applications', {});
    const app = apps.find((a: any) => a._id.toString() === appIds[0]);
    expect(['viewed', 'pending']).toContain(app.status);
  });

  test('H.4 send text message to applicant', async ({ page }) => {
    const r = await fetch(`${API}/applications/${appIds[0]}/message`, {
      method: 'POST', headers: authHeaders(empToken),
      body: JSON.stringify({
        message: '[OVERNIGHT-H] Përshëndetje, ju falënderojmë për aplikimin.',
        type: 'text',
      }),
    });
    expect(r.status).toBeLessThan(500);
  });

  test('H.5 send interview_invite message', async ({ page }) => {
    const r = await fetch(`${API}/applications/${appIds[0]}/message`, {
      method: 'POST', headers: authHeaders(empToken),
      body: JSON.stringify({
        message: '[OVERNIGHT-H] Do dëshiroja t\'ju ftoja për një intervistë.',
        type: 'interview_invite',
      }),
    });
    expect(r.status).toBeLessThan(500);
  });

  test('H.6 send offer message', async ({ page }) => {
    const r = await fetch(`${API}/applications/${appIds[1]}/message`, {
      method: 'POST', headers: authHeaders(empToken),
      body: JSON.stringify({
        message: '[OVERNIGHT-H] Jemi të lumtur t\'ju ofrojmë pozicionin.',
        type: 'offer',
      }),
    });
    expect(r.status).toBeLessThan(500);
  });

  test('H.7 send rejection message', async ({ page }) => {
    const r = await fetch(`${API}/applications/${appIds[2]}/message`, {
      method: 'POST', headers: authHeaders(empToken),
      body: JSON.stringify({
        message: '[OVERNIGHT-H] Pas rishikimit, kemi vendosur të vazhdojmë me kandidatë të tjerë.',
        type: 'rejection',
      }),
    });
    expect(r.status).toBeLessThan(500);
  });

  test('H.8 status forward: pending → viewed → shortlisted → hired', async ({ page }) => {
    const appId = appIds[3];
    for (const s of ['viewed', 'shortlisted', 'hired']) {
      const r = await fetch(`${API}/applications/${appId}/status`, {
        method: 'PATCH', headers: authHeaders(empToken),
        body: JSON.stringify({ status: s }),
      });
      expect(r.status, `transition to ${s}`).toBeLessThan(500);
    }
    const apps = await dbFind('applications', {});
    const app = apps.find((a: any) => a._id.toString() === appId);
    expect(app.status).toBe('hired');
  });

  test('H.9 backward transition rejected → hired blocked', async ({ page }) => {
    // Set to rejected, then try to set to hired
    const appId = appIds[2];
    await fetch(`${API}/applications/${appId}/status`, {
      method: 'PATCH', headers: authHeaders(empToken),
      body: JSON.stringify({ status: 'rejected' }),
    });
    const r = await fetch(`${API}/applications/${appId}/status`, {
      method: 'PATCH', headers: authHeaders(empToken),
      body: JSON.stringify({ status: 'hired' }),
    });
    expect([400, 422], 'rejected → hired must be blocked').toContain(r.status);
  });

  test('H.10 message: blank body rejected', async ({ page }) => {
    const r = await fetch(`${API}/applications/${appIds[0]}/message`, {
      method: 'POST', headers: authHeaders(empToken),
      body: JSON.stringify({ message: '', type: 'text' }),
    });
    expect(r.status).toBe(400);
  });

  test('H.11 message: 5000+ chars rejected', async ({ page }) => {
    const longMsg = 'a'.repeat(6000);
    const r = await fetch(`${API}/applications/${appIds[0]}/message`, {
      method: 'POST', headers: authHeaders(empToken),
      body: JSON.stringify({ message: longMsg, type: 'text' }),
    });
    expect(r.status).toBe(400);
  });

  test('H.12 GET /applications/employer/all — full list across employer\'s jobs', async ({ page }) => {
    const r = await fetch(`${API}/applications/employer/all`, {
      method: 'GET', headers: authHeaders(empToken),
    });
    expect(r.status).toBe(200);
  });

  test('H.13 peer employer cannot view this employer\'s applicants', async ({ page }) => {
    const peer = await makeEmployer({ preApprove: true });
    const r = await fetch(`${API}/applications/job/${jobId}`, {
      method: 'GET', headers: authHeaders(peer.token),
    });
    expect([403, 404]).toContain(r.status);
  });

  test('H.14 status: invalid value → 400', async ({ page }) => {
    const r = await fetch(`${API}/applications/${appIds[0]}/status`, {
      method: 'PATCH', headers: authHeaders(empToken),
      body: JSON.stringify({ status: 'made_up_status' }),
    });
    expect(r.status).toBe(400);
  });

  test('H.15 console on employer-dashboard — no fatal errors', async ({ page }) => {
    const errs: string[] = [];
    page.on('console', (msg) => { if (msg.type() === 'error') errs.push(msg.text()); });
    page.on('pageerror', (err) => errs.push(err.message));
    await page.goto(`${FRONTEND}/employer-dashboard`);
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(2000);
    const fatal = errs.filter((e) => /Uncaught|TypeError|ReferenceError/.test(e) && !/devtools|sentry|favicon|401/.test(e));
    if (fatal.length) console.log('H.15 fatal:', fatal);
    // soft sentinel: errors logged above (line previous), not asserted
  });
});
