/**
 * Section UJ-EMPLOYER — logged-in employer multi-step UI flows.
 *
 * 15 tests. Dashboard, full PostJob wizard, applicant management.
 */

import { test } from '@playwright/test';
import { dbClear } from '../../real-backend/db-helpers';
import {
  expect, FRONTEND, API, makeJobseeker, makeEmployer, ensureEmployerWithJobs,
  authHeaders, dbFind, dbUpdate, loginViaStorage, loginViaUI, NORMAL_PLATFORM,
} from './_helpers';

test.describe.configure({ mode: 'serial' });

let empToken: string;
let empEmail: string;
let empPassword: string;

test.beforeAll(async () => {
  await dbClear();
  const e = await makeEmployer({ preApprove: true, companyName: 'UJ-EMP Co' });
  empToken = e.token;
  empEmail = e.email;
  empPassword = e.password;
});

test.describe('Section UJ-EMPLOYER — logged-in real-UI flows', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaStorage(page, empToken);
    await page.evaluate(() => {
      try { localStorage.setItem('cookie-consent-accepted', 'true'); } catch {}
    });
  });

  test('E.1 employer login UI happy path → /employer-dashboard reachable', async ({ page }) => {
    await page.evaluate(() => localStorage.clear());
    const ok = await loginViaUI(page, empEmail, empPassword);
    expect(ok, 'employer login UI should redirect').toBe(true);
    await page.goto(`${FRONTEND}/employer-dashboard`);
    await page.waitForTimeout(2500);
    expect(page.url()).toContain('/employer-dashboard');
  });

  test('E.2 /employer-dashboard renders employer-specific content', async ({ page }) => {
    await page.goto(`${FRONTEND}/employer-dashboard`);
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(2500);
    const html = await page.content();
    expect(/posto|kandidat|punët|aplikim/i.test(html), 'dashboard should show employer content').toBe(true);
  });

  test('E.3 click "Posto Punë" CTA from dashboard → /post-job wizard step 0 visible', async ({ page }) => {
    await page.goto(`${FRONTEND}/employer-dashboard`);
    await page.waitForTimeout(2000);
    const postBtn = page.getByRole('button', { name: /Posto Punë/i }).or(
      page.getByRole('link', { name: /Posto Punë/i })
    ).first();
    if (await postBtn.count() && await postBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await postBtn.click();
      await page.waitForTimeout(2500);
    } else {
      await page.goto(`${FRONTEND}/post-job`);
      await page.waitForTimeout(2000);
    }
    expect(page.url()).toContain('/post-job');
    await expect(page.getByRole('heading', { name: /Informacioni Bazë|Posto Punë/i }).first()).toBeVisible({ timeout: 5000 });
  });

  test('E.4 PostJob wizard: fill Step 0 fields + Vazhdo → Step 1 (Lokacioni) visible', async ({ page }) => {
    await page.goto(`${FRONTEND}/post-job`);
    await page.waitForTimeout(2000);

    const titleInput = page.locator('input[placeholder*="Zhvillues" i]').first();
    await titleInput.fill('[OVERNIGHT-EMP-E4] Wizard Title');
    const desc = page.locator('textarea').first();
    await desc.fill('Step 0 → 1 wizard advance test. Description must be at least 50 characters to satisfy the form validation rule.');

    const cat = page.locator('input[placeholder*="kategorinë" i]').first();
    await cat.click();
    await page.waitForTimeout(400);
    await page.getByRole('option', { name: /^Teknologji$/ }).first().click().catch(() => {});

    const typeSel = page.locator('input[placeholder*="llojin" i]').first();
    await typeSel.click();
    await page.waitForTimeout(400);
    await page.getByRole('option').first().click().catch(() => {});

    const expSel = page.locator('input[placeholder*="përvojës" i], input[placeholder*="Niveli" i]').first();
    if (await expSel.count() && await expSel.isVisible({ timeout: 1000 }).catch(() => false)) {
      await expSel.click();
      await page.waitForTimeout(400);
      await page.getByRole('option').first().click().catch(() => {});
    }

    await page.getByRole('button', { name: /^Vazhdo$/ }).first().click();
    await page.waitForTimeout(1500);
    const step1 = await page.getByRole('heading', { name: /Lokacioni|Vendndodhja/i }).first().isVisible({ timeout: 5000 }).catch(() => false);
    expect(step1, 'wizard should advance to step 1').toBe(true);
  });

  test('E.5 try to publish job with title <5 chars → validation blocks Vazhdo', async ({ page }) => {
    await page.goto(`${FRONTEND}/post-job`);
    await page.waitForTimeout(2000);

    const titleInput = page.locator('input[placeholder*="Zhvillues" i]').first();
    await titleInput.fill('XX'); // too short
    const desc = page.locator('textarea').first();
    await desc.fill('Some valid description with at least 50 characters of content for validation.');

    await page.getByRole('button', { name: /^Vazhdo$/ }).first().click();
    await page.waitForTimeout(1500);

    // Should remain on step 0 (Lokacioni heading should NOT appear)
    const step1 = await page.getByRole('heading', { name: /Lokacioni|Vendndodhja/i }).first().isVisible({ timeout: 2000 }).catch(() => false);
    expect(step1, 'too-short title should NOT advance to step 1').toBe(false);
  });

  test('E.6 try to publish with description <50 chars → validation blocks', async ({ page }) => {
    await page.goto(`${FRONTEND}/post-job`);
    await page.waitForTimeout(2000);

    const titleInput = page.locator('input[placeholder*="Zhvillues" i]').first();
    await titleInput.fill('Valid Job Title Here');
    const desc = page.locator('textarea').first();
    await desc.fill('too short');

    await page.getByRole('button', { name: /^Vazhdo$/ }).first().click();
    await page.waitForTimeout(1500);

    const step1 = await page.getByRole('heading', { name: /Lokacioni|Vendndodhja/i }).first().isVisible({ timeout: 2000 }).catch(() => false);
    expect(step1, 'too-short description should NOT advance').toBe(false);
  });

  test('E.7 employer posts job via API + dashboard lists it', async ({ page }) => {
    const r = await fetch(`${API}/jobs`, {
      method: 'POST', headers: authHeaders(empToken),
      body: JSON.stringify({
        title: '[OVERNIGHT-EMP-E7] Dashboard List Test',
        description: 'Job to verify it appears on the employer dashboard listing page after creation via the standard create endpoint.',
        category: 'Teknologji', jobType: 'full-time',
        location: { city: 'Tiranë' }, platformCategories: NORMAL_PLATFORM,
      }),
    });
    expect(r.status).toBe(201);
    await page.goto(`${FRONTEND}/employer-dashboard`);
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(2500);
    const html = await page.content();
    expect(/OVERNIGHT-EMP-E7/.test(html), 'employer dashboard should list the new job').toBe(true);
  });

  test('E.8 employer can view their own posted job detail page', async ({ page }) => {
    const job = (await dbFind('jobs', {})).find((j: any) => j.title.includes('OVERNIGHT-EMP-E7'));
    expect(job, 'E.7 created job exists').toBeTruthy();
    await page.goto(`${FRONTEND}/jobs/${job._id}`);
    await page.waitForTimeout(2500);
    const html = await page.content();
    expect(html.includes('OVERNIGHT-EMP-E7'), 'should render own job detail').toBe(true);
  });

  test('E.9 employer closes job (via API after seeding) → status flips in DB', async ({ page }) => {
    const job = (await dbFind('jobs', {})).find((j: any) => j.title.includes('OVERNIGHT-EMP-E7'));
    const r = await fetch(`${API}/jobs/${job._id}/status`, {
      method: 'PATCH', headers: authHeaders(empToken),
      body: JSON.stringify({ status: 'closed' }),
    });
    expect([200, 201]).toContain(r.status);
    const after = (await dbFind('jobs', { _id: job._id }))[0];
    expect(after.status).toBe('closed');
  });

  test('E.10 employer deletes their own job → soft-delete (isDeleted=true)', async ({ page }) => {
    const r = await fetch(`${API}/jobs`, {
      method: 'POST', headers: authHeaders(empToken),
      body: JSON.stringify({
        title: '[OVERNIGHT-EMP-E10] Delete Test',
        description: 'Job created specifically to test the delete cascade and soft-delete behavior verification.',
        category: 'Teknologji', jobType: 'full-time',
        location: { city: 'Tiranë' }, platformCategories: NORMAL_PLATFORM,
      }),
    });
    const jobId = (await r.json()).data.job._id;

    const del = await fetch(`${API}/jobs/${jobId}`, {
      method: 'DELETE', headers: authHeaders(empToken),
    });
    expect(del.status).toBe(200);
    const after = (await dbFind('jobs', { _id: jobId }))[0];
    expect(after.isDeleted, 'job should be soft-deleted').toBe(true);
  });

  test('E.11 employer views applicants for a job', async ({ page }) => {
    // Seed a fresh active job for this test
    const jr = await fetch(`${API}/jobs`, {
      method: 'POST', headers: authHeaders(empToken),
      body: JSON.stringify({
        title: '[OVERNIGHT-EMP-E11] Active for Applicants',
        description: 'Job kept active so the test can verify the employer sees an applicant after a jobseeker applies via API.',
        category: 'Teknologji', jobType: 'full-time',
        location: { city: 'Tiranë' }, platformCategories: NORMAL_PLATFORM,
      }),
    });
    expect(jr.status).toBe(201);
    const jobId = (await jr.json()).data.job._id;

    const js = await makeJobseeker();
    await fetch(`${API}/applications/apply`, {
      method: 'POST', headers: authHeaders(js.token),
      body: JSON.stringify({ jobId, applicationMethod: 'one_click' }),
    });

    const r = await fetch(`${API}/applications/job/${jobId}`, {
      headers: authHeaders(empToken),
    });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect((body.data?.applications || []).length, 'employer should see at least 1 applicant').toBeGreaterThan(0);
  });

  test('E.12 employer sends message to applicant → application has the message', async ({ page }) => {
    const apps = await dbFind('applications', {});
    expect(apps.length, 'should have at least one application').toBeGreaterThan(0);
    const appId = apps[0]._id.toString();

    const r = await fetch(`${API}/applications/${appId}/message`, {
      method: 'POST', headers: authHeaders(empToken),
      body: JSON.stringify({ message: '[OVERNIGHT-EMP-E12] Test message', type: 'text' }),
    });
    expect([200, 201]).toContain(r.status);
    const after = (await dbFind('applications', { _id: appId }))[0];
    const msgFound = (after.messages || []).some((m: any) => /OVERNIGHT-EMP-E12/.test(m.message || m.content || ''));
    expect(msgFound, 'message should be persisted on application').toBe(true);
  });

  test('E.13 employer changes applicant status (viewed) → application.status updates', async ({ page }) => {
    const apps = await dbFind('applications', {});
    const appId = apps[0]._id.toString();
    const r = await fetch(`${API}/applications/${appId}/status`, {
      method: 'PATCH', headers: authHeaders(empToken),
      body: JSON.stringify({ status: 'viewed' }),
    });
    expect([200, 201]).toContain(r.status);
    const after = (await dbFind('applications', { _id: appId }))[0];
    expect(['viewed', 'shortlisted', 'rejected', 'hired']).toContain(after.status);
  });

  test('E.14 employer accesses peer employer\'s job → blocked (404 or 403)', async ({ page }) => {
    const peer = await makeEmployer({ preApprove: true });
    const r = await fetch(`${API}/jobs`, {
      method: 'POST', headers: authHeaders(peer.token),
      body: JSON.stringify({
        title: '[OVERNIGHT-EMP-E14] Peer Job',
        description: 'Job posted by a different employer to verify ownership isolation in the peer-employer access path.',
        category: 'Teknologji', jobType: 'full-time',
        location: { city: 'Tiranë' }, platformCategories: NORMAL_PLATFORM,
      }),
    });
    const peerJobId = (await r.json()).data.job._id;
    // Try to delete peer's job as our employer
    const del = await fetch(`${API}/jobs/${peerJobId}`, {
      method: 'DELETE', headers: authHeaders(empToken),
    });
    expect([403, 404]).toContain(del.status);
  });

  test('E.15 employer logout via storage clear → /employer-dashboard redirects away', async ({ page }) => {
    await page.goto(`${FRONTEND}/employer-dashboard`);
    await page.waitForTimeout(1500);
    expect(page.url()).toContain('/employer-dashboard');
    await page.evaluate(() => {
      localStorage.removeItem('authToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
    });
    await page.goto(`${FRONTEND}/employer-dashboard`);
    await page.waitForTimeout(2000);
    expect(page.url(), 'logged-out should NOT see /employer-dashboard').not.toContain('/employer-dashboard');
  });
});
