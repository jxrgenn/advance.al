/**
 * Walker — Admin full lifecycle
 */

import { test } from '@playwright/test';
import { dbClear, dbFind } from '../../real-backend/db-helpers';
import { makeAdmin, makeEmployer, makeJobseeker, authHeaders, API } from '../../real-backend/factory-helpers';
import { snap, FRONTEND, resetStepCounter } from './_helpers';

const NORMAL_PLATFORM = { diaspora: false, ngaShtepia: false, partTime: false, administrata: false, sezonale: false };

test.describe.configure({ mode: 'serial' });

test('walker: admin — full lifecycle', async ({ page }, testInfo) => {
  resetStepCounter();
  await dbClear();

  const adm = await makeAdmin();

  // Seed: 2 employers, 5 jobseekers, 3 jobs, 5 applications, 2 reports
  const emp1 = await makeEmployer({ companyName: 'CoOne' });
  const emp2 = await makeEmployer({ companyName: 'CoTwo', preApprove: false });
  const seekers = [];
  for (let i = 0; i < 5; i++) seekers.push(await makeJobseeker());

  for (const title of ['Senior Dev', 'Junior Designer', 'Marketing Lead']) {
    const r = await fetch(`${API}/jobs`, {
      method: 'POST', headers: authHeaders(emp1.token),
      body: JSON.stringify({
        title, description: `${title} — at advance.al with full-time benefits and remote options.`,
        category: 'Teknologji', jobType: 'full-time',
        location: { city: 'Tiranë' }, platformCategories: NORMAL_PLATFORM,
        salary: { min: 1000, max: 2000, currency: 'EUR' }
      })
    });
    if (!r.ok) console.warn('Walker admin: job seed failed', r.status, await r.text());
  }

  const jobsList = await dbFind('jobs', {});
  const firstJob = jobsList[0];
  if (firstJob) {
    for (let i = 0; i < 3; i++) {
      await fetch(`${API}/applications/apply`, {
        method: 'POST', headers: authHeaders(seekers[i].token),
        body: JSON.stringify({ jobId: firstJob._id, applicationMethod: 'one_click' })
      });
    }
  }

  // Two reports against the same target so escalation kicks in
  const reportTarget = (await dbFind('users', { email: seekers[4].email }))[0];
  for (let i = 0; i < 3; i++) {
    await fetch(`${API}/reports`, {
      method: 'POST', headers: authHeaders(seekers[i].token),
      body: JSON.stringify({ reportedUserId: reportTarget._id, category: 'spam_behavior', description: `Report ${i+1}` })
    });
  }

  await page.goto(`${FRONTEND}/`);
  await page.evaluate(({ token }) => localStorage.setItem('authToken', token), { token: adm.token });

  await page.goto(`${FRONTEND}/admin`);
  await page.waitForLoadState('networkidle').catch(() => {});
  await snap(page, testInfo, 'admin-dashboard — counts + recent activity');

  await page.goto(`${FRONTEND}/admin/reports`);
  await page.waitForLoadState('networkidle').catch(() => {});
  await snap(page, testInfo, 'admin-reports — queue with escalation');

  // Tabs / sections within admin dashboard if they exist
  const userTab = page.getByRole('tab', { name: /Përdorues|Users/i }).first();
  if (await userTab.count() > 0) {
    await userTab.click();
    await page.waitForTimeout(500);
    await snap(page, testInfo, 'admin — users tab');
  }

  const jobTab = page.getByRole('tab', { name: /Punët|Jobs/i }).first();
  if (await jobTab.count() > 0) {
    await jobTab.click();
    await page.waitForTimeout(500);
    await snap(page, testInfo, 'admin — jobs tab');
  }

  const embedTab = page.getByRole('tab', { name: /Embedding/i }).first();
  if (await embedTab.count() > 0) {
    await embedTab.click();
    await page.waitForTimeout(500);
    await snap(page, testInfo, 'admin — embeddings tab');
  }
});
