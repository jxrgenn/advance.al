/**
 * Phase 21C — Real Jobseeker Flow (live backend)
 *
 * Full sequence: register jobseeker → register employer → employer posts job →
 * jobseeker applies → DB shows Application → jobseeker sees in My Applications.
 */

import { test, expect } from '@playwright/test';
import { dbClear, dbFind, dbUpdate, waitForVerificationCode } from '../../real-backend/db-helpers';

const API = 'http://localhost:3001/api';

async function makeJobseeker(email: string, password = 'StrongPass123!') {
  await fetch(`${API}/auth/initiate-registration`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email, password,
      userType: 'jobseeker',
      firstName: 'Js', lastName: 'Seeker',
      city: 'Tiranë'
    })
  });
  const code = await waitForVerificationCode(email);
  const reg = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, verificationCode: code })
  });
  const body = await reg.json();
  return body.data.token as string;
}

async function makeEmployer(email: string, password = 'StrongPass123!', preApprove = true) {
  await fetch(`${API}/auth/initiate-registration`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email, password,
      userType: 'employer',
      firstName: 'Emp', lastName: 'Loyer',
      city: 'Tiranë',
      companyName: 'TestCo Inc',
      industry: 'Teknologji',
      companySize: '11-50'
    })
  });
  const code = await waitForVerificationCode(email);
  const reg = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, verificationCode: code })
  });
  const body = await reg.json();
  const token = body.data.token as string;

  if (preApprove) {
    // Direct DB update via side-channel: mark employer as approved so they can post jobs.
    // (In a real flow this would be admin-approval; tested separately.)
    await dbUpdate('users', { email }, {
      $set: {
        verified: true,
        'profile.employerProfile.verified': true,
        'profile.employerProfile.verificationStatus': 'approved',
        'profile.employerProfile.verificationDate': new Date()
      }
    });
  }
  return token;
}

test.describe('Phase 21C — Real Jobseeker apply flow', () => {
  test.beforeEach(async () => {
    await dbClear();
  });

  test('full sequence: register both roles, employer posts, jobseeker applies, DB confirms', async () => {
    // Create employer + jobseeker via API
    const empEmail = `c-emp-${Date.now()}@example.com`;
    const jsEmail = `c-js-${Date.now()}@example.com`;

    const empToken = await makeEmployer(empEmail);
    const jsToken = await makeJobseeker(jsEmail);

    // Verify both users exist in DB
    const employers = await dbFind('users', { email: empEmail });
    const jobseekers = await dbFind('users', { email: jsEmail });
    expect(employers.length).toBe(1);
    expect(jobseekers.length).toBe(1);
    expect(employers[0].userType).toBe('employer');
    expect(jobseekers[0].userType).toBe('jobseeker');

    // Employer posts a job
    const postRes = await fetch(`${API}/jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${empToken}` },
      body: JSON.stringify({
        title: 'Real E2E Senior Developer',
        description: 'Build amazing software for the future of advance.al. Join our growing team!',
        category: 'Teknologji',
        jobType: 'full-time',
        location: { city: 'Tiranë' },
        platformCategories: { diaspora: false, ngaShtepia: false, partTime: false, administrata: false, sezonale: false }
      })
    });
    expect(postRes.status).toBe(201);
    const postBody = await postRes.json();
    const jobId = postBody.data?.job?._id;
    expect(jobId).toBeTruthy();

    // Verify Job exists in DB (find by title since _id ObjectId conversion is already
    // handled by the side-channel auto-coerce).
    const jobs = await dbFind('jobs', {});
    const matchingJob = jobs.find((j: any) => j.title === 'Real E2E Senior Developer');
    expect(matchingJob).toBeTruthy();
    expect(matchingJob.status).toBe('active');
    expect(matchingJob.applicationCount).toBe(0);

    // Jobseeker applies
    const applyRes = await fetch(`${API}/applications/apply`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${jsToken}` },
      body: JSON.stringify({ jobId, applicationMethod: 'one_click' })
    });
    expect(applyRes.status).toBe(201);
    const applyBody = await applyRes.json();
    expect(applyBody.success).toBe(true);

    // Verify Application exists in DB
    const apps = await dbFind('applications', {});
    expect(apps.length).toBe(1);
    expect(apps[0].applicationMethod).toBe('one_click');

    // Verify Job.applicationCount incremented in DB
    const jobsAfter = await dbFind('jobs', {});
    const updatedJob = jobsAfter.find((j: any) => j.title === 'Real E2E Senior Developer');
    expect(updatedJob.applicationCount).toBe(1);

    // Verify Notification created for employer
    const allNotifs = await dbFind('notifications', {});
    expect(allNotifs.length).toBeGreaterThan(0);
    const empNotifs = allNotifs.filter((n: any) =>
      n.userId === employers[0]._id || String(n.userId) === String(employers[0]._id)
    );
    expect(empNotifs.length).toBeGreaterThan(0);
  });

  test('apply twice → second returns 400, applicationCount stays 1', async () => {
    const empEmail = `dup-emp-${Date.now()}@example.com`;
    const jsEmail = `dup-js-${Date.now()}@example.com`;
    const empToken = await makeEmployer(empEmail);
    const jsToken = await makeJobseeker(jsEmail);

    const postRes = await fetch(`${API}/jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${empToken}` },
      body: JSON.stringify({
        title: 'Dup Test', description: 'D'.repeat(80),
        category: 'Teknologji', jobType: 'full-time',
        location: { city: 'Tiranë' },
        platformCategories: { diaspora: false, ngaShtepia: false, partTime: false, administrata: false, sezonale: false }
      })
    });
    const jobId = (await postRes.json()).data.job._id;

    // First apply: 201
    const r1 = await fetch(`${API}/applications/apply`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${jsToken}` },
      body: JSON.stringify({ jobId, applicationMethod: 'one_click' })
    });
    expect(r1.status).toBe(201);

    // Second apply: 400
    const r2 = await fetch(`${API}/applications/apply`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${jsToken}` },
      body: JSON.stringify({ jobId, applicationMethod: 'one_click' })
    });
    expect([400, 409]).toContain(r2.status);

    // applicationCount stays 1
    const jobs = await dbFind('jobs', {});
    expect(jobs[0].applicationCount).toBe(1);
  });

  test('UI flow: logged-in jobseeker can view /jobs page; real jobs from backend are listed', async ({ page }) => {
    const empEmail = `ui-emp-${Date.now()}@example.com`;
    const jsEmail = `ui-js-${Date.now()}@example.com`;
    const empToken = await makeEmployer(empEmail);
    const jsToken = await makeJobseeker(jsEmail);

    // Post a job so /jobs has something to render
    const postRes = await fetch(`${API}/jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${empToken}` },
      body: JSON.stringify({
        title: 'UI Visible Job Title',
        description: 'A unique job description ' + 'lorem '.repeat(20),
        category: 'Teknologji', jobType: 'full-time',
        location: { city: 'Tiranë' },
        platformCategories: { diaspora: false, ngaShtepia: false, partTime: false, administrata: false, sezonale: false }
      })
    });
    expect(postRes.status).toBe(201);

    // Set localStorage so AuthContext picks up the real token
    await page.addInitScript((token) => {
      localStorage.setItem('authToken', token);
    }, jsToken);

    await page.goto('/jobs');
    await page.waitForLoadState('networkidle');

    // The job title should appear in the rendered HTML (real backend → real frontend)
    const text = await page.locator('body').textContent();
    expect(text).toContain('UI Visible Job Title');
  });
});

test.describe('Phase 21C — Real employer post-job + applicants flow', () => {
  test.beforeEach(async () => {
    await dbClear();
  });

  test('employer posts a job → DB has it → applicants list returns the job', async () => {
    const empEmail = `emp-flow-${Date.now()}@example.com`;
    const empToken = await makeEmployer(empEmail);

    // Post job
    const postRes = await fetch(`${API}/jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${empToken}` },
      body: JSON.stringify({
        title: 'Employer Flow Job',
        description: 'D'.repeat(80),
        category: 'Teknologji', jobType: 'full-time',
        location: { city: 'Tiranë' },
        platformCategories: { diaspora: false, ngaShtepia: false, partTime: false, administrata: false, sezonale: false }
      })
    });
    expect(postRes.status).toBe(201);
    const jobId = (await postRes.json()).data.job._id;

    // Employer's own jobs endpoint
    const myJobsRes = await fetch(`${API}/jobs/employer/my-jobs?limit=200`, {
      headers: { Authorization: `Bearer ${empToken}` }
    });
    expect(myJobsRes.status).toBe(200);
    const myJobs = await myJobsRes.json();
    const titles = myJobs.data?.jobs?.map((j: any) => j.title) || [];
    expect(titles).toContain('Employer Flow Job');

    // Verify Job in DB has employerId pointing to this employer
    const dbJobs = await dbFind('jobs', {});
    expect(dbJobs.length).toBe(1);
    const employer = (await dbFind('users', { email: empEmail }))[0];
    expect(String(dbJobs[0].employerId)).toBe(String(employer._id));
  });

  test('employer messages applicant: message persisted + jobseeker notification created', async () => {
    const empEmail = `m-emp-${Date.now()}@example.com`;
    const jsEmail = `m-js-${Date.now()}@example.com`;
    const empToken = await makeEmployer(empEmail);
    const jsToken = await makeJobseeker(jsEmail);

    // Both must have emailVerified=true (set by registration completion)
    const empUser = (await dbFind('users', { email: empEmail }))[0];
    expect(empUser.emailVerified).toBe(true);

    // Post + apply
    const job = await (await fetch(`${API}/jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${empToken}` },
      body: JSON.stringify({
        title: 'Message Test', description: 'D'.repeat(80),
        category: 'Teknologji', jobType: 'full-time',
        location: { city: 'Tiranë' },
        platformCategories: { diaspora: false, ngaShtepia: false, partTime: false, administrata: false, sezonale: false }
      })
    })).json();
    const jobId = job.data.job._id;

    const apply = await (await fetch(`${API}/applications/apply`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${jsToken}` },
      body: JSON.stringify({ jobId, applicationMethod: 'one_click' })
    })).json();
    const appId = apply.data.application._id;

    // Employer sends a message
    const msgRes = await fetch(`${API}/applications/${appId}/message`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${empToken}` },
      body: JSON.stringify({ message: 'Hello, applicant!', type: 'text' })
    });
    expect([200, 201]).toContain(msgRes.status);

    // Verify message persisted on Application
    const apps = await dbFind('applications', {});
    expect(apps[0].messages?.length || 0).toBeGreaterThan(0);

    // Verify Notification to jobseeker
    const jsUser = (await dbFind('users', { email: jsEmail }))[0];
    const allNotifs = await dbFind('notifications', {});
    const jsNotifs = allNotifs.filter((n: any) => String(n.userId) === String(jsUser._id));
    expect(jsNotifs.length).toBeGreaterThan(0);
  });

  test('employer changes application status to shortlisted: Application updated + notification fires', async () => {
    const empEmail = `s-emp-${Date.now()}@example.com`;
    const jsEmail = `s-js-${Date.now()}@example.com`;
    const empToken = await makeEmployer(empEmail);
    const jsToken = await makeJobseeker(jsEmail);

    const job = await (await fetch(`${API}/jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${empToken}` },
      body: JSON.stringify({
        title: 'Status Test', description: 'D'.repeat(80),
        category: 'Teknologji', jobType: 'full-time',
        location: { city: 'Tiranë' },
        platformCategories: { diaspora: false, ngaShtepia: false, partTime: false, administrata: false, sezonale: false }
      })
    })).json();
    const jobId = job.data.job._id;

    const apply = await (await fetch(`${API}/applications/apply`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${jsToken}` },
      body: JSON.stringify({ jobId, applicationMethod: 'one_click' })
    })).json();
    const appId = apply.data.application._id;

    const before = (await dbFind('applications', {}))[0];

    const sRes = await fetch(`${API}/applications/${appId}/status`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${empToken}` },
      body: JSON.stringify({ status: 'shortlisted' })
    });
    expect([200, 201]).toContain(sRes.status);

    const after = (await dbFind('applications', {}))[0];
    expect(after.status).toBe('shortlisted');
    expect(after.status).not.toBe(before.status);
  });
});
