/**
 * Walker — Mobile viewport flows
 *
 * Drives the same critical flows as desktop walkers but on Pixel 5 + iPhone 12
 * device profiles. Captures screenshots so reviewer can spot mobile-only
 * layout issues (overflow, tap-target size, modal coverage, keyboard issues).
 *
 * To run only mobile: `--project=mobile-pixel5` or `--project=mobile-iphone12`.
 */

import { test } from '@playwright/test';
import { dbClear } from '../../real-backend/db-helpers';
import { makeJobseeker, makeEmployer, authHeaders, API } from '../../real-backend/factory-helpers';
import { snap, FRONTEND, resetStepCounter } from './_helpers';

const NORMAL_PLATFORM = { diaspora: false, ngaShtepia: false, partTime: false, administrata: false, sezonale: false };

test.describe.configure({ mode: 'serial' });

test('walker: mobile — public + jobseeker flow', async ({ page }, testInfo) => {
  resetStepCounter();
  await dbClear();

  const emp = await makeEmployer();
  for (const title of ['Mobile-friendly Backend', 'iOS Developer']) {
    await fetch(`${API}/jobs`, {
      method: 'POST', headers: authHeaders(emp.token),
      body: JSON.stringify({
        title, description: `${title} — work from anywhere with our team.`,
        category: 'Teknologji', jobType: 'full-time',
        location: { city: 'Tiranë' }, platformCategories: NORMAL_PLATFORM,
        salary: { min: 1500, max: 3000, currency: 'EUR' }
      })
    });
  }

  await page.goto(`${FRONTEND}/`);
  await page.waitForLoadState('networkidle').catch(() => {});
  await snap(page, testInfo, 'mobile — home');

  // Open hamburger menu if it exists
  const hamburger = page.getByRole('button', { name: /menu|menu/i }).first();
  if (await hamburger.count() > 0) {
    await hamburger.click();
    await page.waitForTimeout(300);
    await snap(page, testInfo, 'mobile — nav drawer open');
  }

  await page.goto(`${FRONTEND}/jobs`);
  await page.waitForLoadState('networkidle').catch(() => {});
  await snap(page, testInfo, 'mobile — jobs listing');

  // Open filter modal
  const filterBtn = page.getByRole('button', { name: /Filtra|Filter/i }).first();
  if (await filterBtn.count() > 0) {
    await filterBtn.click();
    await page.waitForTimeout(300);
    await snap(page, testInfo, 'mobile — filters modal open');
  }

  await page.goto(`${FRONTEND}/login`);
  await page.waitForLoadState('networkidle').catch(() => {});
  await snap(page, testInfo, 'mobile — login form');

  // Logged-in jobseeker
  const js = await makeJobseeker();
  await page.evaluate(({ token }) => localStorage.setItem('authToken', token), { token: js.token });
  await page.goto(`${FRONTEND}/profile`);
  await page.waitForLoadState('networkidle').catch(() => {});
  await snap(page, testInfo, 'mobile — profile (jobseeker)');

  await page.goto(`${FRONTEND}/saved-jobs`);
  await page.waitForLoadState('networkidle').catch(() => {});
  await snap(page, testInfo, 'mobile — saved-jobs');

  await page.goto(`${FRONTEND}/jobs`);
  await page.waitForLoadState('networkidle').catch(() => {});
  await snap(page, testInfo, 'mobile — jobs logged-in');

  await page.goto(`${FRONTEND}/privacy`);
  await page.waitForLoadState('networkidle').catch(() => {});
  await snap(page, testInfo, 'mobile — privacy');
});

test('walker: mobile — employer flow', async ({ page }, testInfo) => {
  resetStepCounter();
  const emp = await makeEmployer();

  await page.goto(`${FRONTEND}/`);
  await page.evaluate(({ token }) => localStorage.setItem('authToken', token), { token: emp.token });

  await page.goto(`${FRONTEND}/employer-dashboard`);
  await page.waitForLoadState('networkidle').catch(() => {});
  await snap(page, testInfo, 'mobile — employer dashboard');

  await page.goto(`${FRONTEND}/post-job`);
  await page.waitForLoadState('networkidle').catch(() => {});
  await snap(page, testInfo, 'mobile — post-job wizard');
});
