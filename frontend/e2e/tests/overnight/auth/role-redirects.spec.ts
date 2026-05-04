/**
 * role-redirects.spec.ts — UI-level role-based route protection.
 *
 * 12 tests: jobseeker/employer/admin × visits to /admin, /employer-dashboard,
 * /post-job, /profile, /edit-job → expect appropriate redirect.
 */

import { test } from '@playwright/test';
import { dbClear } from '../../../real-backend/db-helpers';
import { FRONTEND, loginViaStorage } from '../_helpers';
import { makeJobseeker, makeEmployer, makeAdmin } from '../../../real-backend/factory-helpers';
import { expect } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

test.describe('Auth / role redirects', () => {
  test.beforeEach(async () => { await dbClear(); });

  test('RR.1 anonymous → /admin redirects to /login', async ({ page }) => {
    await page.goto(`${FRONTEND}/admin`);
    await page.waitForTimeout(2000);
    expect(page.url()).not.toContain('/admin');
  });

  test('RR.2 anonymous → /post-job redirects to /login', async ({ page }) => {
    await page.goto(`${FRONTEND}/post-job`);
    await page.waitForTimeout(2000);
    expect(page.url()).not.toContain('/post-job');
  });

  test('RR.3 anonymous → /profile redirects to /login', async ({ page }) => {
    await page.goto(`${FRONTEND}/profile`);
    await page.waitForTimeout(2000);
    expect(page.url()).not.toContain('/profile');
  });

  test('RR.4 anonymous → /employer-dashboard redirects', async ({ page }) => {
    await page.goto(`${FRONTEND}/employer-dashboard`);
    await page.waitForTimeout(2000);
    expect(page.url()).not.toContain('/employer-dashboard');
  });

  test('RR.5 jobseeker → /admin redirected away', async ({ page }) => {
    const js = await makeJobseeker();
    await loginViaStorage(page, js.token);
    await page.goto(`${FRONTEND}/admin`);
    await page.waitForTimeout(2500);
    expect(page.url(), 'jobseeker should not see /admin').not.toContain('/admin');
  });

  test('RR.6 jobseeker → /employer-dashboard redirected away', async ({ page }) => {
    const js = await makeJobseeker();
    await loginViaStorage(page, js.token);
    await page.goto(`${FRONTEND}/employer-dashboard`);
    await page.waitForTimeout(2500);
    expect(page.url()).not.toContain('/employer-dashboard');
  });

  test('RR.7 jobseeker → /post-job redirected away', async ({ page }) => {
    const js = await makeJobseeker();
    await loginViaStorage(page, js.token);
    await page.goto(`${FRONTEND}/post-job`);
    await page.waitForTimeout(2500);
    expect(page.url(), 'jobseeker cannot post jobs').not.toContain('/post-job');
  });

  test('RR.8 employer → /admin redirected away', async ({ page }) => {
    const emp = await makeEmployer({ preApprove: true });
    await loginViaStorage(page, emp.token);
    await page.goto(`${FRONTEND}/admin`);
    await page.waitForTimeout(2500);
    expect(page.url()).not.toContain('/admin');
  });

  test('RR.9 employer → /post-job allowed', async ({ page }) => {
    const emp = await makeEmployer({ preApprove: true });
    await loginViaStorage(page, emp.token);
    await page.goto(`${FRONTEND}/post-job`);
    await page.waitForTimeout(2500);
    expect(page.url(), 'employer should reach /post-job').toContain('/post-job');
  });

  test('RR.10 admin → /post-job redirected away', async ({ page }) => {
    const adm = await makeAdmin();
    await loginViaStorage(page, adm.token);
    await page.goto(`${FRONTEND}/post-job`);
    await page.waitForTimeout(2500);
    expect(page.url(), 'admin should not see /post-job').not.toContain('/post-job');
  });

  test('RR.11 admin → /admin allowed', async ({ page }) => {
    const adm = await makeAdmin();
    await loginViaStorage(page, adm.token);
    await page.goto(`${FRONTEND}/admin`);
    await page.waitForTimeout(2500);
    expect(page.url(), 'admin should reach /admin').toContain('/admin');
  });

  test('RR.12 admin → /employer-dashboard redirected away', async ({ page }) => {
    const adm = await makeAdmin();
    await loginViaStorage(page, adm.token);
    await page.goto(`${FRONTEND}/employer-dashboard`);
    await page.waitForTimeout(2500);
    expect(page.url(), 'admin should not see /employer-dashboard').not.toContain('/employer-dashboard');
  });
});
