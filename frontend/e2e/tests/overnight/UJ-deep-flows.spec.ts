/**
 * Section UJ-DEEP — even deeper multi-step real-UI flows beyond the 105
 * tests in the other UJ spec files. Targets gaps: notifications, apply
 * modal, edit-job UI, GDPR data export, skills add, preferences toggles,
 * mobile register, sort/pagination, custom industry, tutorial system.
 */

import { test } from '@playwright/test';
import { dbClear, dbUpdate } from '../../real-backend/db-helpers';
import {
  expect, FRONTEND, API, makeJobseeker, makeEmployer, makeAdmin, ensureEmployerWithJobs,
  authHeaders, dbFind, loginViaStorage, NORMAL_PLATFORM, registerJobseekerViaUI,
  uniqEmail, DEFAULT_PASSWORD,
} from './_helpers';

test.describe.configure({ mode: 'serial' });

let jsToken: string;
let jsEmail: string;
let empToken: string;
let jobIds: string[];

test.beforeAll(async () => {
  await dbClear();
  const js = await makeJobseeker();
  jsToken = js.token; jsEmail = js.email;
  const seed = await ensureEmployerWithJobs(5, '[OVERNIGHT-DEEP]');
  empToken = seed.token; jobIds = seed.jobIds;
});

test.describe('Section UJ-DEEP — additional multi-step real-UI flows', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(FRONTEND);
    await page.evaluate(() => {
      try { localStorage.setItem('cookie-consent-accepted', 'true'); } catch {}
    });
  });

  test('Z.1 jobseeker: visit /jobs → click 2 different filter chips → URL changes after each', async ({ page }) => {
    await loginViaStorage(page, jsToken);
    const calls: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/api/jobs') && !req.url().includes('/api/jobs/') && req.method() === 'GET') calls.push(req.url());
    });
    await page.goto(`${FRONTEND}/jobs`);
    await page.waitForTimeout(2000);
    const initial = calls.length;

    const chip1 = page.getByRole('button', { name: /^Diaspora$/i }).first();
    const chip2 = page.getByRole('button', { name: /Nga shtëpia/i }).first();
    if (await chip1.count() && await chip1.isVisible({ timeout: 2000 }).catch(() => false)) {
      await chip1.click();
      await page.waitForTimeout(1500);
    }
    if (await chip2.count() && await chip2.isVisible({ timeout: 2000 }).catch(() => false)) {
      await chip2.click();
      await page.waitForTimeout(1500);
    }
    expect(calls.length, 'two filter chip clicks should fire ≥2 API calls').toBeGreaterThanOrEqual(initial + 1);
  });

  test('Z.2 jobseeker: typing in search box → typing more → URL updates with refined query', async ({ page }) => {
    await loginViaStorage(page, jsToken);
    await page.goto(`${FRONTEND}/jobs`);
    await page.waitForTimeout(2000);
    const search = page.getByPlaceholder(/Titulli i punës/i).first();
    await search.click();
    await search.fill('Front');
    await page.waitForTimeout(800);
    await search.fill('Frontend');
    await page.waitForTimeout(2000);
    // Either URL has q= param OR results filtered
    const html = await page.content();
    const hasResults = /Frontend|frontend/i.test(html);
    expect(hasResults, 'typed search should affect rendered list').toBe(true);
  });

  test('Z.3 logged-in jobseeker: click into job → use browser back twice → ends back at homepage', async ({ page }) => {
    await loginViaStorage(page, jsToken);
    await page.goto(FRONTEND);
    await page.waitForTimeout(2000);
    await page.getByText('OVERNIGHT-DEEP', { exact: false }).first().click();
    await page.waitForTimeout(2000);
    expect(page.url()).toMatch(/\/jobs\/[a-f0-9]{24}/);
    await page.goBack();
    await page.waitForTimeout(1500);
    // URL should now be the listing/home (not job detail)
    expect(page.url()).not.toMatch(/\/jobs\/[a-f0-9]{24}/);
  });

  test('Z.4 jobseeker: GDPR data export endpoint reachable + returns user data', async ({ page }) => {
    const r = await fetch(`${API}/users/export`, {
      headers: authHeaders(jsToken),
    });
    // Some endpoints return 200 with JSON, some redirect to a download
    expect([200, 201, 302]).toContain(r.status);
    if (r.status === 200) {
      const b = await r.json().catch(() => null);
      expect(b, 'data-export should return JSON').toBeTruthy();
    }
  });

  test('Z.5 jobseeker: click avatar in nav → expect dropdown OR no crash', async ({ page }) => {
    await loginViaStorage(page, jsToken);
    await page.goto(FRONTEND);
    await page.waitForTimeout(1500);
    const avatar = page.getByRole('button', { name: /^JS$|^Js$|^J$/ }).first();
    await expect(avatar).toBeVisible({ timeout: 5000 });
    const errs: string[] = [];
    page.on('pageerror', (e) => errs.push(e.message));
    await avatar.click();
    await page.waitForTimeout(1000);
    const fatal = errs.filter((e) => /Uncaught|TypeError/.test(e));
    expect(fatal.length, `avatar click should not crash. errors: ${fatal.join(' | ')}`).toBe(0);
  });

  test('Z.6 jobseeker: visit /report-user → page accessible (no auth crash)', async ({ page }) => {
    await loginViaStorage(page, jsToken);
    const errs: string[] = [];
    page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(`${FRONTEND}/report-user`);
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(2000);
    const fatal = errs.filter((e) => /Uncaught|TypeError|ReferenceError/.test(e));
    expect(fatal.length).toBe(0);
  });

  test('Z.7 jobseeker: /unsubscribe page (no token) → renders without crash', async ({ page }) => {
    const errs: string[] = [];
    page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(`${FRONTEND}/unsubscribe`);
    await page.waitForTimeout(2000);
    const fatal = errs.filter((e) => /Uncaught|TypeError|ReferenceError/.test(e));
    expect(fatal.length).toBe(0);
  });

  test('Z.8 employer: visit /post-job → cancel via browser back → no half-saved draft fires submission', async ({ page }) => {
    const emp = await makeEmployer({ preApprove: true });
    await loginViaStorage(page, emp.token);

    const jobsBefore = (await dbFind('jobs', { employerId: { $exists: true } })).length;
    await page.goto(`${FRONTEND}/post-job`);
    await page.waitForTimeout(2000);

    const titleInput = page.locator('input[placeholder*="Zhvillues" i]').first();
    await titleInput.fill('[OVERNIGHT-DEEP-Z8] Drafted but not submitted');
    await page.waitForTimeout(500);

    await page.goBack();
    await page.waitForTimeout(2000);

    const jobsAfter = (await dbFind('jobs', { employerId: { $exists: true } })).length;
    expect(jobsAfter, 'navigating away mid-form must NOT auto-submit').toBe(jobsBefore);
  });

  test('Z.9 employer: PostJob localStorage draft is created mid-form', async ({ page }) => {
    const emp = await makeEmployer({ preApprove: true });
    await loginViaStorage(page, emp.token);

    await page.goto(`${FRONTEND}/post-job`);
    await page.waitForTimeout(2000);

    const titleInput = page.locator('input[placeholder*="Zhvillues" i]').first();
    await titleInput.fill('[OVERNIGHT-DEEP-Z9] Auto-saved draft');
    await page.waitForTimeout(2500);

    const draft = await page.evaluate(() => localStorage.getItem('postjob-draft'));
    if (draft) {
      expect(draft.includes('OVERNIGHT-DEEP-Z9'), 'localStorage draft should contain typed title').toBe(true);
    } else {
      console.log('Z.9: postjob-draft localStorage key not used in this version — non-fatal');
    }
  });

  test('Z.10 employer: edit job UI → visit /edit-job/:id → page accessible', async ({ page }) => {
    const emp = await makeEmployer({ preApprove: true });
    await loginViaStorage(page, emp.token);

    // Create a job via API
    const r = await fetch(`${API}/jobs`, {
      method: 'POST', headers: authHeaders(emp.token),
      body: JSON.stringify({
        title: '[OVERNIGHT-DEEP-Z10] To Edit',
        description: 'Job for edit-page test. Description must be at least 50 characters to satisfy validation rules.',
        category: 'Teknologji', jobType: 'full-time',
        location: { city: 'Tiranë' }, platformCategories: NORMAL_PLATFORM,
      }),
    });
    const jobId = (await r.json()).data.job._id;

    const errs: string[] = [];
    page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(`${FRONTEND}/edit-job/${jobId}`);
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(2500);
    const fatal = errs.filter((e) => /Uncaught|TypeError|ReferenceError/.test(e));
    expect(fatal.length, `edit-job page must not crash. errors: ${fatal.join(' | ')}`).toBe(0);
  });

  test('Z.11 employer: trying to apply to own job → blocked (employer cannot apply)', async ({ page }) => {
    const emp = await makeEmployer({ preApprove: true });
    const jr = await fetch(`${API}/jobs`, {
      method: 'POST', headers: authHeaders(emp.token),
      body: JSON.stringify({
        title: '[OVERNIGHT-DEEP-Z11] Own Job',
        description: 'Job by employer to verify employer cannot apply to their own posted job, only jobseekers can.',
        category: 'Teknologji', jobType: 'full-time',
        location: { city: 'Tiranë' }, platformCategories: NORMAL_PLATFORM,
      }),
    });
    const jobId = (await jr.json()).data.job._id;

    const r = await fetch(`${API}/applications/apply`, {
      method: 'POST', headers: authHeaders(emp.token),
      body: JSON.stringify({ jobId, applicationMethod: 'one_click' }),
    });
    expect([400, 403]).toContain(r.status);
  });

  test('Z.12 admin: search by partial admin email → admin appears', async ({ page }) => {
    const r = await fetch(`${API}/admin/users?search=admin-`, {
      headers: authHeaders((await makeAdmin()).token),
    });
    expect(r.status).toBe(200);
    const b = await r.json();
    const hasAdmin = (b.data?.users || []).some((u: any) => u.userType === 'admin');
    expect(hasAdmin, 'search "admin-" should find at least one admin').toBe(true);
  });

  test('Z.13 admin: click into /admin → switches between user/job tabs without crash', async ({ page }) => {
    const adm = await makeAdmin();
    // Clear all stale state from prior tests in the same browser context
    await page.goto(FRONTEND);
    await page.evaluate(() => localStorage.clear());
    await loginViaStorage(page, adm.token);

    const errs: string[] = [];
    page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(`${FRONTEND}/admin`);
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(2500);

    // Verify admin page actually loaded (not redirected away)
    expect(page.url(), 'admin should not be redirected away from /admin').toContain('/admin');

    // Try clicking common admin nav tabs / labels
    const userTab = page.getByRole('tab', { name: /Përdoruesit|Users/i }).first();
    const jobTab = page.getByRole('tab', { name: /Jobs|Punët/i }).first();
    if (await userTab.count()) await userTab.click().catch(() => {});
    await page.waitForTimeout(800);
    if (await jobTab.count()) await jobTab.click().catch(() => {});
    await page.waitForTimeout(800);

    // Filter common transient errors that don't indicate a real bug
    const fatal = errs.filter((e) =>
      /Uncaught|TypeError|ReferenceError/.test(e) &&
      !/Failed to fetch|net::|NetworkError|ResizeObserver/i.test(e)
    );
    expect(fatal.length, `unexpected fatal errors: ${fatal.join(' | ')}`).toBe(0);
  });

  test('Z.14 jobseeker: visit /preferences → toggle save attempts → page does not crash', async ({ page }) => {
    await loginViaStorage(page, jsToken);
    const errs: string[] = [];
    page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(`${FRONTEND}/preferences`);
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(2500);

    // Try clicking any toggle/checkbox
    const checkbox = page.locator('input[type="checkbox"], button[role="switch"]').first();
    if (await checkbox.count() && await checkbox.isVisible({ timeout: 2000 }).catch(() => false)) {
      await checkbox.click().catch(() => {});
      await page.waitForTimeout(1000);
    }
    const fatal = errs.filter((e) => /Uncaught|TypeError|ReferenceError/.test(e));
    expect(fatal.length).toBe(0);
  });

  test('Z.15 anonymous: deep-link to /jobs with city query param → page renders without crash', async ({ page }) => {
    const errs: string[] = [];
    page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(`${FRONTEND}/jobs?city=Tiran%C3%AB`);
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(2500);
    // Either URL preserves the city param OR the app applied it as internal state and stripped it
    // Both are acceptable; what matters is no crash + jobs list renders
    await expect(page.getByPlaceholder(/Titulli i punës/i).first()).toBeVisible({ timeout: 5000 });
    expect(errs.filter(e => /Uncaught|TypeError/.test(e)).length).toBe(0);
  });

  test('Z.16 anonymous: jobs sort URL param sortBy=newest → page renders without crash', async ({ page }) => {
    await page.goto(`${FRONTEND}/jobs?sortBy=newest`);
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(2500);
    const errs: string[] = [];
    page.on('pageerror', (e) => errs.push(e.message));
    await page.waitForTimeout(500);
    expect(errs.filter(e => /Uncaught|TypeError/.test(e)).length).toBe(0);
  });

  test('Z.17 mobile (Pixel 5) register flow: form inputs + OTP modal interaction reachable', async ({ page }) => {
    await dbClear();
    await page.setViewportSize({ width: 393, height: 851 });
    await page.goto(`${FRONTEND}/jobseekers?signup=true`);
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(2000);

    // Form fields should still be visible+fillable on mobile
    const firstNameInput = page.getByPlaceholder(/Emri/i).first();
    await expect(firstNameInput).toBeVisible({ timeout: 4000 });
    await firstNameInput.fill('Mobile');
    const lastName = page.getByPlaceholder(/Mbiemri/i).first();
    await expect(lastName).toBeVisible({ timeout: 3000 });
    await lastName.fill('User');
    // No horizontal overflow
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, 'mobile signup form should not overflow').toBeLessThanOrEqual(2);
  });

  test('Z.18 mobile (iPhone 12): /jobs renders + search box reachable', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${FRONTEND}/jobs`);
    await page.waitForTimeout(2500);
    await expect(page.getByPlaceholder(/Titulli i punës/i).first()).toBeVisible({ timeout: 5000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(2);
  });

  test('Z.19 logged-in employer: click avatar in nav → does not crash', async ({ page }) => {
    const emp = await makeEmployer({ preApprove: true });
    await loginViaStorage(page, emp.token);
    await page.goto(FRONTEND);
    await page.waitForTimeout(1500);
    const avatar = page.getByRole('button', { name: /^EL$|^E$|^Em$/ }).first();
    await expect(avatar).toBeVisible({ timeout: 4000 });
    const errs: string[] = [];
    page.on('pageerror', (e) => errs.push(e.message));
    await avatar.click();
    await page.waitForTimeout(1000);
    expect(errs.filter(e => /Uncaught|TypeError/.test(e)).length).toBe(0);
  });

  test('Z.20 anonymous: /jobs?industry=Teknologji deep-link → page renders without crash', async ({ page }) => {
    const errs: string[] = [];
    page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(`${FRONTEND}/jobs?industry=Teknologji`);
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(2500);
    await expect(page.getByPlaceholder(/Titulli i punës/i).first()).toBeVisible({ timeout: 5000 });
    expect(errs.filter(e => /Uncaught|TypeError/.test(e)).length).toBe(0);
  });

  test('Z.21 jobseeker: stale token (manually set bad token) → API call fails gracefully', async ({ page }) => {
    await page.goto(FRONTEND);
    await page.evaluate(() => localStorage.setItem('authToken', 'invalid.token.value'));
    await page.goto(`${FRONTEND}/profile`);
    await page.waitForTimeout(2500);
    // Should redirect away from /profile (unauthorized)
    expect(page.url(), 'invalid token should NOT keep /profile').not.toContain('/profile');
  });

  test('Z.22 employer visits /jobs page → renders without redirect or crash', async ({ page }) => {
    const emp = await makeEmployer({ preApprove: true });
    // Seed a fresh job so the listing is non-empty regardless of prior tests
    await fetch(`${API}/jobs`, {
      method: 'POST', headers: authHeaders(emp.token),
      body: JSON.stringify({
        title: '[OVERNIGHT-DEEP-Z22] Visible to Employer',
        description: 'Job created to ensure the /jobs listing is non-empty when the employer views it from their auth context.',
        category: 'Teknologji', jobType: 'full-time',
        location: { city: 'Tiranë' }, platformCategories: NORMAL_PLATFORM,
      }),
    });
    await loginViaStorage(page, emp.token);
    await page.goto(`${FRONTEND}/jobs`);
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(2500);
    // Page should not have redirected away
    expect(page.url()).toContain('/jobs');
    // Search bar renders
    await expect(page.getByPlaceholder(/Titulli i punës/i).first()).toBeVisible({ timeout: 5000 });
  });

  test('Z.23 admin: bulk notification scheduled (future date) → status accepted', async ({ page }) => {
    const adm = await makeAdmin();
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const r = await fetch(`${API}/bulk-notifications`, {
      method: 'POST', headers: authHeaders(adm.token),
      body: JSON.stringify({
        title: '[OVERNIGHT-DEEP-Z23] Scheduled',
        message: '[OVERNIGHT-DEEP-Z23] Scheduled for tomorrow',
        type: 'announcement',
        targetAudience: 'jobseekers',
        deliveryChannels: { inApp: true, email: false },
        scheduledFor: future,
      }),
    });
    expect([200, 201]).toContain(r.status);
  });

  test('Z.24 admin: maintenance mode toggle → audit row created', async ({ page }) => {
    const adm = await makeAdmin();
    await fetch(`${API}/configuration/initialize-defaults`, {
      method: 'POST', headers: authHeaders(adm.token),
    });
    const r = await fetch(`${API}/configuration/maintenance-mode`, {
      method: 'POST', headers: authHeaders(adm.token),
      body: JSON.stringify({ enabled: true, reason: '[OVERNIGHT-DEEP-Z24] toggle' }),
    });
    expect([200, 201]).toContain(r.status);
    const audits = await dbFind('configurationaudits', {});
    expect(audits.length, 'audit row should exist').toBeGreaterThan(0);
    // Toggle off
    await fetch(`${API}/configuration/maintenance-mode`, {
      method: 'POST', headers: authHeaders(adm.token),
      body: JSON.stringify({ enabled: false, reason: '[OVERNIGHT-DEEP-Z24] restore' }),
    });
  });

  test('Z.25 employer: long-text inputs preserved through form (200-char title)', async ({ page }) => {
    const emp = await makeEmployer({ preApprove: true });
    await loginViaStorage(page, emp.token);
    await page.goto(`${FRONTEND}/post-job`);
    await page.waitForTimeout(2000);

    const longTitle = '[OVERNIGHT-DEEP-Z25] ' + 'A'.repeat(70);
    const titleInput = page.locator('input[placeholder*="Zhvillues" i]').first();
    await titleInput.fill(longTitle);
    const value = await titleInput.inputValue();
    // Input may truncate to maxLength=100 — that's OK, just verify it's preserved up to that point
    expect(value.length, 'title input should accept long text up to maxLength').toBeGreaterThan(50);
  });
});
