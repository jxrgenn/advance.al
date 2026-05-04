/**
 * Walker — Jobseeker full lifecycle
 *
 * Logged-in jobseeker flow with screenshots at each meaningful UI state.
 */

import { test } from '@playwright/test';
import { dbClear } from '../../real-backend/db-helpers';
import { makeJobseeker, makeEmployer, authHeaders, API } from '../../real-backend/factory-helpers';
import { snap, FRONTEND, resetStepCounter } from './_helpers';

const NORMAL_PLATFORM = { diaspora: false, ngaShtepia: false, partTime: false, administrata: false, sezonale: false };

test.describe.configure({ mode: 'serial' });

test('walker: jobseeker — full lifecycle', async ({ page }, testInfo) => {
  resetStepCounter();
  await dbClear();

  // Seed: employer + 3 jobs so jobseeker has things to apply to
  const emp = await makeEmployer();
  for (const title of ['Junior React Dev', 'Backend Node.js Engineer', 'Marketing Manager']) {
    await fetch(`${API}/jobs`, {
      method: 'POST', headers: authHeaders(emp.token),
      body: JSON.stringify({
        title, description: `${title} — work on advance.al with a great team. Remote-friendly.`,
        category: 'Teknologji', jobType: 'full-time',
        location: { city: 'Tiranë' }, platformCategories: NORMAL_PLATFORM,
        salary: { min: 1000, max: 2000, currency: 'EUR' }
      })
    });
  }

  const js = await makeJobseeker();

  // Inject auth token to skip the form interaction (already covered in walker-public)
  await page.goto(`${FRONTEND}/`);
  await page.evaluate(({ token }) => localStorage.setItem('authToken', token), { token: js.token });

  await page.goto(`${FRONTEND}/profile`);
  await page.waitForLoadState('networkidle').catch(() => {});
  await snap(page, testInfo, 'profile — fresh just-registered');

  // Update profile via API (faster than UI fill, captures the after state)
  await fetch(`${API}/users/profile`, {
    method: 'PUT', headers: authHeaders(js.token),
    body: JSON.stringify({
      firstName: 'Anila', lastName: 'Krasniqi', phone: '+355681234567',
      jobSeekerProfile: {
        title: 'Senior Full-Stack Developer',
        bio: 'Passionate developer with 6 years of experience in React, Node.js, MongoDB. Looking for remote-friendly roles in Tiranë or Europe.',
        experience: '5-10 vjet',
        skills: ['JavaScript', 'TypeScript', 'React', 'Node.js', 'MongoDB', 'AWS', 'Docker']
      }
    })
  });
  await fetch(`${API}/users/work-experience`, {
    method: 'POST', headers: authHeaders(js.token),
    body: JSON.stringify({ position: 'Senior Developer', company: 'TechShqip', startDate: '2020-01-01', endDate: '2024-01-01', description: 'Led frontend team of 5' })
  });
  await fetch(`${API}/users/education`, {
    method: 'POST', headers: authHeaders(js.token),
    body: JSON.stringify({ degree: 'Bachelor', fieldOfStudy: 'Computer Science', institution: 'University of Tirana', startDate: '2014-09-01', endDate: '2018-06-30' })
  });

  await page.reload();
  await page.waitForLoadState('networkidle').catch(() => {});
  await snap(page, testInfo, 'profile — populated with skills + work + edu');

  await page.goto(`${FRONTEND}/jobs`);
  await page.waitForLoadState('networkidle').catch(() => {});
  await snap(page, testInfo, 'jobs — logged-in listing');

  // Click first job
  const firstJobLink = page.locator('a[href^="/jobs/"]').first();
  if (await firstJobLink.count() > 0) {
    await firstJobLink.click();
    await page.waitForLoadState('networkidle').catch(() => {});
    await snap(page, testInfo, 'jobs — detail logged-in (apply button visible)');
  }

  // Save a job via API to populate /saved-jobs
  const jobs = await (await fetch(`${API}/jobs`, { headers: authHeaders(js.token) })).json();
  const firstJobId = jobs.data?.jobs?.[0]?._id;
  if (firstJobId) {
    await fetch(`${API}/users/saved-jobs/${firstJobId}`, { method: 'POST', headers: authHeaders(js.token) });
    await fetch(`${API}/applications/apply`, {
      method: 'POST', headers: authHeaders(js.token),
      body: JSON.stringify({ jobId: firstJobId, applicationMethod: 'one_click' })
    });
  }

  await page.goto(`${FRONTEND}/saved-jobs`);
  await page.waitForLoadState('networkidle').catch(() => {});
  await snap(page, testInfo, 'saved-jobs — has 1 saved');

  await page.goto(`${FRONTEND}/preferences`);
  await page.waitForLoadState('networkidle').catch(() => {});
  await snap(page, testInfo, 'preferences — notification settings');

  await page.goto(`${FRONTEND}/profile`);
  await page.waitForLoadState('networkidle').catch(() => {});
  await snap(page, testInfo, 'profile — after applying to 1 job');

  // Empty saved-jobs state — unsave then revisit
  if (firstJobId) {
    await fetch(`${API}/users/saved-jobs/${firstJobId}`, { method: 'DELETE', headers: authHeaders(js.token) });
    await page.goto(`${FRONTEND}/saved-jobs`);
    await page.waitForLoadState('networkidle').catch(() => {});
    await snap(page, testInfo, 'saved-jobs — empty state after unsave');
  }
});
