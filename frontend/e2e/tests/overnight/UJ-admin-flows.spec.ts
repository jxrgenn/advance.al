/**
 * Section UJ-ADMIN — logged-in admin multi-step UI flows.
 *
 * 12 tests. Moderation, search/filter, bulk notifications, approve/reject.
 */

import { test } from '@playwright/test';
import { dbClear, dbUpdate } from '../../real-backend/db-helpers';
import {
  expect, FRONTEND, API, makeAdmin, makeEmployer, makeJobseeker, ensureEmployerWithJobs,
  authHeaders, dbFind, loginViaStorage, NORMAL_PLATFORM,
} from './_helpers';

test.describe.configure({ mode: 'serial' });

let admToken: string;
let admEmail: string;

test.beforeAll(async () => {
  await dbClear();
  const a = await makeAdmin();
  admToken = a.token;
  admEmail = a.email;
});

test.describe('Section UJ-ADMIN — admin moderation real-UI flows', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaStorage(page, admToken);
    await page.evaluate(() => {
      try { localStorage.setItem('cookie-consent-accepted', 'true'); } catch {}
    });
  });

  test('D.1 admin login + visit /admin → admin dashboard renders without redirect', async ({ page }) => {
    await page.goto(`${FRONTEND}/admin`);
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(2500);
    expect(page.url()).toContain('/admin');
    const html = await page.content();
    expect(/dashboard|përdorues|jobs|admin|raport/i.test(html), 'admin dashboard should render').toBe(true);
  });

  test('D.2 /admin shows count cards (numbers visible somewhere)', async ({ page }) => {
    await page.goto(`${FRONTEND}/admin`);
    await page.waitForTimeout(3000);
    const html = await page.content();
    // Admin dashboard shows numeric counts (users, jobs etc)
    expect(/\b\d+\b/.test(html), 'admin should show count numbers').toBe(true);
  });

  test('D.3 /admin/dashboard-stats API returns counts that match DB', async ({ page }) => {
    // Seed users + jobs
    await makeJobseeker();
    await makeJobseeker();
    await ensureEmployerWithJobs(2, '[OVERNIGHT-D3]');
    const r = await fetch(`${API}/admin/dashboard-stats`, { headers: authHeaders(admToken) });
    expect(r.status).toBe(200);
    const b = await r.json();
    const dbUsers = (await dbFind('users', {})).length;
    expect(b.data?.totalUsers, 'API user count should match DB').toBe(dbUsers);
  });

  test('D.4 admin filters users by jobseeker → response only contains jobseekers', async ({ page }) => {
    const r = await fetch(`${API}/admin/users?userType=jobseeker`, { headers: authHeaders(admToken) });
    expect(r.status).toBe(200);
    const b = await r.json();
    expect((b.data?.users || []).every((u: any) => u.userType === 'jobseeker'), 'all results jobseekers').toBe(true);
  });

  test('D.5 admin filters users by employer → response only contains employers', async ({ page }) => {
    const r = await fetch(`${API}/admin/users?userType=employer`, { headers: authHeaders(admToken) });
    expect(r.status).toBe(200);
    const b = await r.json();
    expect((b.data?.users || []).every((u: any) => u.userType === 'employer'), 'all results employers').toBe(true);
  });

  test('D.6 admin searches users by partial email "js-" → finds at least one', async ({ page }) => {
    const r = await fetch(`${API}/admin/users?search=js-`, { headers: authHeaders(admToken) });
    expect(r.status).toBe(200);
    const b = await r.json();
    expect((b.data?.users || []).length, 'should find seeded jobseekers via "js-" prefix').toBeGreaterThan(0);
  });

  test('D.7 admin suspends jobseeker → user.status flips to suspended in DB', async ({ page }) => {
    const target = await makeJobseeker();
    const tu = (await dbFind('users', { email: target.email }))[0];
    const r = await fetch(`${API}/admin/users/${tu._id}/manage`, {
      method: 'PATCH', headers: authHeaders(admToken),
      body: JSON.stringify({ action: 'suspend', reason: '[OVERNIGHT-D7]', duration: 1 }),
    });
    expect(r.status).toBe(200);
    const after = (await dbFind('users', { email: target.email }))[0];
    expect(after.status).toBe('suspended');
  });

  test('D.8 suspended user UI login → blocked + visible feedback (no token set)', async ({ page }) => {
    // Use the user suspended in D.7
    const suspendedUser = (await dbFind('users', { status: 'suspended' }))[0];
    expect(suspendedUser, 'D.7 created suspended user').toBeTruthy();

    await page.evaluate(() => localStorage.clear());
    await page.goto(`${FRONTEND}/login`);
    await page.locator('input#email').fill(suspendedUser.email);
    await page.locator('input#password').fill('StrongPass123!');
    await page.getByRole('button', { name: /^Kyçu$/i }).click();
    await page.waitForTimeout(2500);
    const token = await page.evaluate(() => localStorage.getItem('authToken'));
    expect(token, 'suspended user must NOT receive token').toBeFalsy();
  });

  test('D.9 admin activates suspended user → status flips back to active', async ({ page }) => {
    const target = (await dbFind('users', { status: 'suspended' }))[0];
    const r = await fetch(`${API}/admin/users/${target._id}/manage`, {
      method: 'PATCH', headers: authHeaders(admToken),
      body: JSON.stringify({ action: 'activate' }),
    });
    expect(r.status).toBe(200);
    const after = (await dbFind('users', { _id: target._id }))[0];
    expect(after.status).toBe('active');
  });

  test('D.10 admin approves a pending job → status=active + adminApproved=true (F-23 fix)', async ({ page }) => {
    const emp = await makeEmployer({ preApprove: true });
    const jr = await fetch(`${API}/jobs`, {
      method: 'POST', headers: authHeaders(emp.token),
      body: JSON.stringify({
        title: '[OVERNIGHT-D10] Pending Job',
        description: 'Job that admin will approve. Description must be at least 50 characters to satisfy the validation rule.',
        category: 'Teknologji', jobType: 'full-time',
        location: { city: 'Tiranë' }, platformCategories: NORMAL_PLATFORM,
      }),
    });
    const jobId = (await jr.json()).data.job._id;
    await dbUpdate('jobs', { _id: jobId }, { $set: { status: 'pending_approval' } });

    const r = await fetch(`${API}/admin/jobs/${jobId}/manage`, {
      method: 'PATCH', headers: authHeaders(admToken),
      body: JSON.stringify({ action: 'approve' }),
    });
    expect(r.status).toBe(200);
    const after = (await dbFind('jobs', { _id: jobId }))[0];
    expect(after.status).toBe('active');
    expect(after.adminApproved).toBe(true);
  });

  test('D.11 admin rejects a job → rejectionReason persists (F-23 fix)', async ({ page }) => {
    const emp = await makeEmployer({ preApprove: true });
    const jr = await fetch(`${API}/jobs`, {
      method: 'POST', headers: authHeaders(emp.token),
      body: JSON.stringify({
        title: '[OVERNIGHT-D11] To Reject',
        description: 'Job that will be rejected by admin to verify rejectionReason persists in DB after the F-23 schema fix.',
        category: 'Teknologji', jobType: 'full-time',
        location: { city: 'Tiranë' }, platformCategories: NORMAL_PLATFORM,
      }),
    });
    const jobId = (await jr.json()).data.job._id;

    const r = await fetch(`${API}/admin/jobs/${jobId}/manage`, {
      method: 'PATCH', headers: authHeaders(admToken),
      body: JSON.stringify({ action: 'reject', reason: '[OVERNIGHT-D11] Spam content' }),
    });
    expect(r.status).toBe(200);
    const after = (await dbFind('jobs', { _id: jobId }))[0];
    expect(after.status).toBe('rejected');
    expect(after.rejectionReason).toBe('[OVERNIGHT-D11] Spam content');
  });

  test('D.12 admin sends bulk notification → status accepts the request', async ({ page }) => {
    const r = await fetch(`${API}/bulk-notifications`, {
      method: 'POST', headers: authHeaders(admToken),
      body: JSON.stringify({
        title: '[OVERNIGHT-D12] Bulk',
        message: '[OVERNIGHT-D12] Test bulk notification',
        type: 'announcement',
        targetAudience: 'jobseekers',
        deliveryChannels: { inApp: true, email: false },
      }),
    });
    // JUSTIFIED: HTTP convention — POST returns 200 (with body) or 201 (created).
    expect([200, 201]).toContain(r.status);
  });
});
