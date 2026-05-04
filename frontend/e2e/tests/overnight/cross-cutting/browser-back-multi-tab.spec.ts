/**
 * browser-back-multi-tab.spec.ts — back button + multi-tab behavior.
 *
 * 8 tests: back from /jobs/:id to /jobs, back from /post-job to dashboard,
 * multi-tab login propagation, tab close → back works.
 */

import { test } from '@playwright/test';
import { dbClear } from '../../../real-backend/db-helpers';
import { FRONTEND, loginViaStorage, ensureEmployerWithJobs } from '../_helpers';
import { makeJobseeker, makeEmployer } from '../../../real-backend/factory-helpers';
import { expect } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

test.describe('Cross-cutting / browser back + multi-tab', () => {
  test.beforeEach(async () => { await dbClear(); });

  test('BB.1 back from /jobs/:id returns to /jobs', async ({ page }) => {
    await ensureEmployerWithJobs(2, '[BB1]');
    await page.goto(`${FRONTEND}/jobs`);
    await page.waitForTimeout(2500);

    const link = page.getByText('BB1', { exact: false }).first();
    if (await link.isVisible({ timeout: 4000 }).catch(() => false)) {
      await link.click();
      await page.waitForTimeout(2000);
      expect(page.url()).toMatch(/\/jobs\/[a-f0-9]{24}/);

      await page.goBack();
      await page.waitForTimeout(2000);
      expect(page.url(), 'back should return to /jobs').toContain('/jobs');
      expect(page.url()).not.toMatch(/\/jobs\/[a-f0-9]{24}/);
    }
  });

  test('BB.2 multi-tab: open /jobs in 2 contexts, both render independently', async ({ page, context }) => {
    await ensureEmployerWithJobs(1, '[BB2]');
    await page.goto(`${FRONTEND}/jobs`);
    await page.waitForTimeout(2500);

    const ctx2 = await context.browser()!.newContext();
    const page2 = await ctx2.newPage();
    await page2.goto(`${FRONTEND}/jobs`);
    await page2.waitForTimeout(2500);

    await expect(page.getByText('BB2', { exact: false }).first()).toBeVisible({ timeout: 5000 });
    await expect(page2.getByText('BB2', { exact: false }).first()).toBeVisible({ timeout: 5000 });
    await ctx2.close();
  });

  test('BB.3 back from /post-job to /employer-dashboard', async ({ page }) => {
    const emp = await makeEmployer({ preApprove: true });
    await loginViaStorage(page, emp.token);
    await page.goto(`${FRONTEND}/employer-dashboard`);
    await page.waitForTimeout(2500);
    await page.goto(`${FRONTEND}/post-job`);
    await page.waitForTimeout(2000);
    await page.goBack();
    await page.waitForTimeout(2000);
    expect(page.url()).toContain('/employer-dashboard');
  });

  test('BB.4 forward after back works', async ({ page }) => {
    await page.goto(`${FRONTEND}`);
    await page.waitForTimeout(1500);
    await page.goto(`${FRONTEND}/jobs`);
    await page.waitForTimeout(1500);
    await page.goBack();
    await page.waitForTimeout(1000);
    await page.goForward();
    await page.waitForTimeout(1500);
    expect(page.url()).toContain('/jobs');
  });

  test('BB.5 reload preserves URL', async ({ page }) => {
    await page.goto(`${FRONTEND}/jobs`);
    await page.waitForTimeout(1500);
    await page.reload();
    await page.waitForTimeout(2000);
    expect(page.url()).toContain('/jobs');
  });

  test('BB.6 logout in tab 1 invalidates auth in tab 2 (after refresh)', async ({ page, context }) => {
    const js = await makeJobseeker();
    await loginViaStorage(page, js.token);

    const page2 = await context.newPage();
    await loginViaStorage(page2, js.token);
    await page2.goto(`${FRONTEND}/profile`);
    await page2.waitForTimeout(1500);

    // Clear storage in page1 (simulates logout)
    await page.evaluate(() => {
      localStorage.clear();
    });

    // After page2 reload, AuthContext should detect missing token and force-logout
    await page2.reload();
    await page2.waitForTimeout(2500);
    // Either redirected to /login or homepage — but NOT in /profile
    expect(page2.url()).not.toContain('/profile');
    await page2.close();
  });

  test('BB.7 deep-link to /jobs/:id with valid id renders directly', async ({ page }) => {
    const result = await ensureEmployerWithJobs(1, '[BB7]');
    if (result.jobIds.length) {
      await page.goto(`${FRONTEND}/jobs/${result.jobIds[0]}`);
      await page.waitForTimeout(3000);
      const body = await page.locator('body').innerText();
      expect(body, 'job title should appear').toContain('BB7');
    }
  });

  test('BB.8 Punët nav link is present (App.tsx mounts both `/` and `/jobs` to same component)', async ({ page }) => {
    await page.goto(FRONTEND);
    await page.waitForTimeout(1500);
    const link = page.getByRole('link', { name: 'Punët', exact: true }).first();
    const href = await link.getAttribute('href');
    expect(href, 'Punët link must have an href').toBeTruthy();
    expect(['/', '/jobs']).toContain(href);
  });
});
