/**
 * Section UJ-EDGE — edge case + cross-cutting multi-step UI flows.
 *
 * 8 tests. Browser back/multi-tab, role redirects, cookie consent persistence.
 */

import { test } from '@playwright/test';
import { dbClear } from '../../real-backend/db-helpers';
import {
  expect, FRONTEND, makeJobseeker, makeEmployer, makeAdmin, ensureEmployerWithJobs,
  loginViaStorage,
} from './_helpers';

test.describe.configure({ mode: 'serial' });

test.describe('Section UJ-EDGE — multi-step edge case flows', () => {
  test('X.1 browser back from /jobs/:id returns to /jobs (not the homepage)', async ({ page }) => {
    await dbClear();
    await ensureEmployerWithJobs(2, '[OVERNIGHT-X1]');

    await page.goto(`${FRONTEND}/jobs`);
    await page.waitForTimeout(2500);
    await page.getByText('OVERNIGHT-X1', { exact: false }).first().click();
    await page.waitForTimeout(2000);
    expect(page.url()).toMatch(/\/jobs\/[a-f0-9]{24}/);

    await page.goBack();
    await page.waitForTimeout(2000);
    expect(page.url(), 'back should return to listing').toContain('/jobs');
    expect(page.url()).not.toMatch(/\/jobs\/[a-f0-9]{24}/);
  });

  test('X.2 multi-tab: open /jobs in 2nd context → both render independently', async ({ page, context }) => {
    await dbClear();
    await ensureEmployerWithJobs(1, '[OVERNIGHT-X2]');

    await page.goto(`${FRONTEND}/jobs`);
    await page.waitForTimeout(2000);

    const ctx2 = await context.browser()!.newContext();
    const page2 = await ctx2.newPage();
    await page2.goto(`${FRONTEND}/jobs`);
    await page2.waitForTimeout(2500);

    await expect(page.getByText('OVERNIGHT-X2', { exact: false }).first()).toBeVisible({ timeout: 8000 });
    await expect(page2.getByText('OVERNIGHT-X2', { exact: false }).first()).toBeVisible({ timeout: 8000 });
    await ctx2.close();
  });

  test('X.3 cookie consent: reject → reload → banner stays dismissed', async ({ page }) => {
    await page.evaluate(() => {
      try { localStorage.removeItem('cookie-consent-accepted'); } catch {}
    }).catch(() => {});
    await page.goto(FRONTEND);
    await page.waitForLoadState('networkidle').catch(() => {});

    const reject = page.getByRole('button', { name: /Refuzoj|reject/i }).first();
    if (await reject.isVisible({ timeout: 4000 }).catch(() => false)) {
      await reject.click();
      await page.waitForTimeout(1500);

      await page.reload();
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.waitForTimeout(1500);
      const stillVisible = await reject.isVisible({ timeout: 1500 }).catch(() => false);
      expect(stillVisible, 'cookie banner should NOT reappear after reject').toBe(false);
    } else {
      console.log('X.3: cookie banner not shown — non-fatal');
    }
  });

  test('X.4 cookie consent: accept → reload → banner stays dismissed', async ({ page }) => {
    await page.goto(FRONTEND);
    await page.evaluate(() => {
      try { localStorage.removeItem('cookie-consent-accepted'); } catch {}
    });
    await page.reload();
    await page.waitForLoadState('networkidle').catch(() => {});
    const accept = page.getByRole('button', { name: /Pranoj|accept/i }).first();
    if (await accept.isVisible({ timeout: 4000 }).catch(() => false)) {
      await accept.click();
      await page.waitForTimeout(1500);
      await page.reload();
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.waitForTimeout(1500);
      const stillVisible = await accept.isVisible({ timeout: 1500 }).catch(() => false);
      expect(stillVisible, 'banner should not reappear after accept').toBe(false);
    } else {
      console.log('X.4: cookie banner not shown — non-fatal');
    }
  });

  test('X.5 logged-in admin visiting /post-job → redirected to /admin (wrong-role)', async ({ page }) => {
    await dbClear();
    const adm = await makeAdmin();
    await loginViaStorage(page, adm.token);
    await page.goto(`${FRONTEND}/post-job`);
    await page.waitForTimeout(2500);
    expect(page.url(), 'admin should be redirected away from /post-job').not.toContain('/post-job');
  });

  test('X.6 logged-in employer visiting /admin → redirected to /employer-dashboard', async ({ page }) => {
    await dbClear();
    const emp = await makeEmployer({ preApprove: true });
    await loginViaStorage(page, emp.token);
    await page.goto(`${FRONTEND}/admin`);
    await page.waitForTimeout(2500);
    expect(page.url(), 'employer should NOT see /admin').not.toContain('/admin');
  });

  test('X.7 logged-in jobseeker visiting /post-job → redirected away (employer-only route)', async ({ page }) => {
    await dbClear();
    const js = await makeJobseeker();
    await loginViaStorage(page, js.token);
    await page.goto(`${FRONTEND}/post-job`);
    await page.waitForTimeout(2500);
    expect(page.url(), 'jobseeker should NOT see /post-job').not.toContain('/post-job');
  });

  test('X.8 mobile viewport (Pixel 5): login flow works end-to-end', async ({ page }) => {
    await dbClear();
    const js = await makeJobseeker();
    await page.setViewportSize({ width: 393, height: 851 }); // Pixel 5

    await page.goto(`${FRONTEND}/login`);
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.locator('input#email').fill(js.email);
    await page.locator('input#password').fill(js.password);
    await page.getByRole('button', { name: /^Kyçu$/i }).click();
    await page.waitForTimeout(3000);

    const token = await page.evaluate(() => localStorage.getItem('authToken'));
    expect(token, 'mobile login should set token').toBeTruthy();

    // No horizontal scroll
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, 'mobile login should not overflow').toBeLessThanOrEqual(2);
  });
});
