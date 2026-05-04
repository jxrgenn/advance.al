/**
 * Walker — Employer full lifecycle
 */

import { test } from '@playwright/test';
import { dbClear } from '../../real-backend/db-helpers';
import { makeEmployer, makeJobseeker, authHeaders, API } from '../../real-backend/factory-helpers';
import { snap, FRONTEND, resetStepCounter } from './_helpers';

const NORMAL_PLATFORM = { diaspora: false, ngaShtepia: false, partTime: false, administrata: false, sezonale: false };

test.describe.configure({ mode: 'serial' });

test('walker: employer — full lifecycle', async ({ page }, testInfo) => {
  resetStepCounter();
  await dbClear();

  const emp = await makeEmployer({ preApprove: true, companyName: 'Advance Tech Sh.p.k.' });

  await page.goto(`${FRONTEND}/`);
  await page.evaluate(({ token }) => localStorage.setItem('authToken', token), { token: emp.token });

  await page.goto(`${FRONTEND}/employer-dashboard`);
  await page.waitForLoadState('networkidle').catch(() => {});
  await snap(page, testInfo, 'employer-dashboard — empty (no jobs yet)');

  await page.goto(`${FRONTEND}/post-job`);
  await page.waitForLoadState('networkidle').catch(() => {});
  await snap(page, testInfo, 'post-job — wizard step 1');

  // Seed 3 jobs via API to populate dashboard view
  for (const title of ['Senior Frontend Engineer', 'Product Designer', 'Customer Success Manager']) {
    await fetch(`${API}/jobs`, {
      method: 'POST', headers: authHeaders(emp.token),
      body: JSON.stringify({
        title, description: `${title} — full-time role at advance.al. Hybrid Tirane / remote.`,
        category: 'Teknologji', jobType: 'full-time',
        location: { city: 'Tiranë' }, platformCategories: NORMAL_PLATFORM,
        salary: { min: 1500, max: 3000, currency: 'EUR' }
      })
    });
  }

  await page.goto(`${FRONTEND}/employer-dashboard`);
  await page.waitForLoadState('networkidle').catch(() => {});
  await snap(page, testInfo, 'employer-dashboard — 3 jobs populated');

  // Seed 4 applications from different jobseekers to one of the jobs
  const jobsRes = await (await fetch(`${API}/jobs/employer/my-jobs`, { headers: authHeaders(emp.token) })).json();
  const targetJobId = jobsRes.data?.jobs?.[0]?._id || jobsRes.data?.[0]?._id;

  if (targetJobId) {
    for (let i = 0; i < 4; i++) {
      const seeker = await makeJobseeker();
      await fetch(`${API}/users/profile`, {
        method: 'PUT', headers: authHeaders(seeker.token),
        body: JSON.stringify({
          firstName: ['Arben', 'Ermira', 'Besnik', 'Drita'][i],
          lastName: ['Hoxha', 'Mema', 'Berisha', 'Zogu'][i],
          jobSeekerProfile: {
            title: 'Software Developer',
            skills: ['React', 'Node.js']
          }
        })
      });
      await fetch(`${API}/applications/apply`, {
        method: 'POST', headers: authHeaders(seeker.token),
        body: JSON.stringify({ jobId: targetJobId, applicationMethod: 'one_click' })
      });
    }
  }

  await page.reload();
  await page.waitForLoadState('networkidle').catch(() => {});
  await snap(page, testInfo, 'employer-dashboard — with applicants count');

  // Click into first job → applicants view
  const jobLink = page.locator('a[href^="/edit-job/"], a[href*="applicants"]').first();
  if (await jobLink.count() > 0) {
    await jobLink.click();
    await page.waitForLoadState('networkidle').catch(() => {});
    await snap(page, testInfo, 'edit-job or applicants view');
  }

  // Edit job page directly
  if (targetJobId) {
    await page.goto(`${FRONTEND}/edit-job/${targetJobId}`);
    await page.waitForLoadState('networkidle').catch(() => {});
    await snap(page, testInfo, 'edit-job — pre-filled form');
  }
});
