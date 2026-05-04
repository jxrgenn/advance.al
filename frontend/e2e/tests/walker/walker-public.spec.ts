/**
 * Walker — Public / logged-out browsing
 *
 * Visits every public page and captures a labelled full-page screenshot.
 * Reviewer scrolls the album in ~5 minutes to spot visual issues.
 */

import { test } from '@playwright/test';
import { dbClear } from '../../real-backend/db-helpers';
import { makeEmployer, authHeaders, API } from '../../real-backend/factory-helpers';
import { snap, FRONTEND, resetStepCounter } from './_helpers';

const NORMAL_PLATFORM = { diaspora: false, ngaShtepia: false, partTime: false, administrata: false, sezonale: false };

test.describe.configure({ mode: 'serial' });

test('walker: public — every logged-out page', async ({ page }, testInfo) => {
  resetStepCounter();
  await dbClear();

  // Seed one job + one employer so /jobs and /jobs/:id have real content
  const emp = await makeEmployer();
  const jobRes = await fetch(`${API}/jobs`, {
    method: 'POST', headers: authHeaders(emp.token),
    body: JSON.stringify({
      title: 'Senior Frontend Developer',
      description: 'Join our team building advance.al. We use React, TypeScript, Tailwind, and have a remote-friendly culture.',
      category: 'Teknologji', jobType: 'full-time',
      location: { city: 'Tiranë' }, platformCategories: NORMAL_PLATFORM,
      salary: { min: 1500, max: 2500, currency: 'EUR' }
    })
  });
  const job = (await jobRes.json()).data.job;

  await page.goto(`${FRONTEND}/`);
  await page.waitForLoadState('networkidle').catch(() => {});
  await snap(page, testInfo, 'home — landing');

  await page.goto(`${FRONTEND}/jobs`);
  await page.waitForLoadState('networkidle').catch(() => {});
  await snap(page, testInfo, 'jobs — listing default');

  await page.goto(`${FRONTEND}/jobs?q=developer`);
  await page.waitForLoadState('networkidle').catch(() => {});
  await snap(page, testInfo, 'jobs — search developer');

  await page.goto(`${FRONTEND}/jobs?city=Tiran%C3%AB`);
  await page.waitForLoadState('networkidle').catch(() => {});
  await snap(page, testInfo, 'jobs — filter Tirane');

  await page.goto(`${FRONTEND}/jobs/${job._id}`);
  await page.waitForLoadState('networkidle').catch(() => {});
  await snap(page, testInfo, 'jobs — detail page');

  await page.goto(`${FRONTEND}/jobs/000000000000000000000000`);
  await page.waitForLoadState('networkidle').catch(() => {});
  await snap(page, testInfo, 'jobs — detail bogus id (error state)');

  await page.goto(`${FRONTEND}/login`);
  await page.waitForLoadState('networkidle').catch(() => {});
  await snap(page, testInfo, 'login — empty form');

  await page.locator('input#email').fill('test@example.com');
  await page.locator('input#password').fill('Wrong123!');
  await page.getByRole('button', { name: /^Kyçu$/i }).click();
  await page.waitForTimeout(2000);
  await snap(page, testInfo, 'login — wrong creds error');

  await page.goto(`${FRONTEND}/forgot-password`);
  await page.waitForLoadState('networkidle').catch(() => {});
  await snap(page, testInfo, 'forgot-password — form');

  await page.goto(`${FRONTEND}/reset-password?token=test-token`);
  await page.waitForLoadState('networkidle').catch(() => {});
  await snap(page, testInfo, 'reset-password — invalid token');

  await page.goto(`${FRONTEND}/jobseekers`);
  await page.waitForLoadState('networkidle').catch(() => {});
  await snap(page, testInfo, 'jobseekers — landing');

  await page.goto(`${FRONTEND}/jobseekers?signup=true`);
  await page.waitForLoadState('networkidle').catch(() => {});
  await snap(page, testInfo, 'jobseekers — signup form');

  await page.goto(`${FRONTEND}/employers`);
  await page.waitForLoadState('networkidle').catch(() => {});
  await snap(page, testInfo, 'employers — landing');

  await page.goto(`${FRONTEND}/employers?signup=true`);
  await page.waitForLoadState('networkidle').catch(() => {});
  await snap(page, testInfo, 'employers — signup form');

  await page.goto(`${FRONTEND}/about`);
  await page.waitForLoadState('networkidle').catch(() => {});
  await snap(page, testInfo, 'about us');

  await page.goto(`${FRONTEND}/privacy`);
  await page.waitForLoadState('networkidle').catch(() => {});
  await snap(page, testInfo, 'privacy policy');

  await page.goto(`${FRONTEND}/terms`);
  await page.waitForLoadState('networkidle').catch(() => {});
  await snap(page, testInfo, 'terms of service');

  await page.goto(`${FRONTEND}/unsubscribe?token=invalid`);
  await page.waitForLoadState('networkidle').catch(() => {});
  await snap(page, testInfo, 'unsubscribe — invalid token');

  await page.goto(`${FRONTEND}/this-route-does-not-exist`);
  await page.waitForLoadState('networkidle').catch(() => {});
  await snap(page, testInfo, '404 — not found page');

  // Try common protected routes when logged out (should redirect to login)
  await page.goto(`${FRONTEND}/profile`);
  await page.waitForTimeout(1500);
  await snap(page, testInfo, 'protected /profile — logged-out redirect');

  await page.goto(`${FRONTEND}/admin`);
  await page.waitForTimeout(1500);
  await snap(page, testInfo, 'protected /admin — logged-out redirect');

  await page.goto(`${FRONTEND}/employer-dashboard`);
  await page.waitForTimeout(1500);
  await snap(page, testInfo, 'protected /employer-dashboard — logged-out redirect');

  await page.goto(`${FRONTEND}/post-job`);
  await page.waitForTimeout(1500);
  await snap(page, testInfo, 'protected /post-job — logged-out redirect');

  await page.goto(`${FRONTEND}/saved-jobs`);
  await page.waitForTimeout(1500);
  await snap(page, testInfo, 'protected /saved-jobs — logged-out redirect');
});
