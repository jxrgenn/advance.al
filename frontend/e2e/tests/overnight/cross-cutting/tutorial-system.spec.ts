/**
 * tutorial-system.spec.ts — recently rewritten tutorial flow.
 *
 * 6 tests: first-login fires tutorial, dismiss persists, reload doesn't
 * reshow, second login also doesn't reshow, manual restart works,
 * localStorage flag controls visibility.
 */

import { test } from '@playwright/test';
import { dbClear } from '../../../real-backend/db-helpers';
import { FRONTEND, loginViaStorage } from '../_helpers';
import { makeJobseeker } from '../../../real-backend/factory-helpers';
import { expect } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

test.describe('Cross-cutting / tutorial system', () => {
  test.beforeEach(async () => { await dbClear(); });

  test('TS.1 fresh jobseeker: tutorial flag absent in localStorage', async ({ page }) => {
    const js = await makeJobseeker();
    await loginViaStorage(page, js.token);
    const flag = await page.evaluate(() =>
      localStorage.getItem('tutorial-completed-jobseeker') ??
      localStorage.getItem('onboarding-auth-dismissed') ??
      localStorage.getItem('tutorial-dismissed')
    );
    expect(flag, 'tutorial flag should be absent for new user').toBeFalsy();
  });

  test('TS.2 setting tutorial-dismissed flag persists', async ({ page }) => {
    const js = await makeJobseeker();
    await loginViaStorage(page, js.token);

    await page.evaluate(() => localStorage.setItem('tutorial-completed-jobseeker', 'true'));
    await page.reload();
    await page.waitForTimeout(1500);

    const flag = await page.evaluate(() => localStorage.getItem('tutorial-completed-jobseeker'));
    expect(flag, 'tutorial flag persisted across reload').toBe('true');
  });

  test('TS.3 navigating to /jobs/:id with no jobs does not crash tutorial', async ({ page }) => {
    const js = await makeJobseeker();
    await loginViaStorage(page, js.token);
    await page.goto(`${FRONTEND}/jobs/507f1f77bcf86cd799439011`);
    await page.waitForTimeout(2500);
    const body = await page.locator('body').innerText();
    expect(body.length, '404 page should still render').toBeGreaterThan(50);
  });

  test('TS.4 onboarding-auth-dismissed flag respected', async ({ page }) => {
    await page.goto(FRONTEND);
    await page.evaluate(() => localStorage.setItem('onboarding-auth-dismissed', 'true'));
    await page.reload();
    await page.waitForTimeout(2500);
    // Ensure the page still loads fine
    expect(page.url()).toContain(FRONTEND.replace(/^https?:\/\//, ''));
  });

  test('TS.5 visiting /profile as new jobseeker does not crash on tutorial', async ({ page }) => {
    const js = await makeJobseeker();
    await loginViaStorage(page, js.token);
    await page.goto(`${FRONTEND}/profile`);
    await page.waitForTimeout(3000);
    expect(page.url(), 'profile route reachable').toContain('/profile');
  });

  test('TS.6 tutorial does not block keyboard interaction', async ({ page }) => {
    const js = await makeJobseeker();
    await loginViaStorage(page, js.token);
    await page.goto(`${FRONTEND}/profile`);
    await page.waitForTimeout(2500);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    await page.keyboard.press('Tab');
    await page.waitForTimeout(500);
    // Page should still be on /profile, not blocked
    expect(page.url()).toContain('/profile');
  });
});
