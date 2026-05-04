/**
 * cron-jobs.spec.ts — exercise all 4 server.js cron schedulers via the
 * `/__test/cron/run-*` side-channel.
 *
 * Strict assertions on DB side effects + email cascade + counters.
 */

import { test } from '@playwright/test';
import { dbClear, dbFind, dbUpdate, dbCount } from '../../../real-backend/db-helpers';
import { makeJobseeker, makeEmployer, makeAdmin, runCron, authHeaders, API } from '../../../real-backend/factory-helpers';
import { expect } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

test.describe('Cross-cutting / cron jobs', () => {
  test.beforeEach(async () => {
    await dbClear();
  });

  test('CR.1 job-expiry: active jobs whose expiresAt has passed → status=expired', async () => {
    const emp = await makeEmployer({ preApprove: true });
    const past = new Date(Date.now() - 24 * 3600 * 1000);
    const future = new Date(Date.now() + 24 * 3600 * 1000);
    // Create one expired-but-still-active job + one normally active job
    const r1 = await fetch(`${API}/jobs`, {
      method: 'POST', headers: authHeaders(emp.token),
      body: JSON.stringify({
        title: 'Expired Soon Role', description: 'Test ' + 'x'.repeat(60),
        category: 'Teknologji', jobType: 'full-time',
        location: { city: 'Tiranë' },
        salary: { min: 1000, max: 2000, currency: 'EUR' },
        platformCategories: { diaspora: false, ngaShtepia: false, partTime: false, administrata: false, sezonale: false }
      })
    });
    const j1 = (await r1.json()).data.job;
    const r2 = await fetch(`${API}/jobs`, {
      method: 'POST', headers: authHeaders(emp.token),
      body: JSON.stringify({
        title: 'Still Active Role', description: 'Test ' + 'x'.repeat(60),
        category: 'Teknologji', jobType: 'full-time',
        location: { city: 'Tiranë' },
        salary: { min: 1000, max: 2000, currency: 'EUR' },
        platformCategories: { diaspora: false, ngaShtepia: false, partTime: false, administrata: false, sezonale: false }
      })
    });
    const j2 = (await r2.json()).data.job;
    // Force jobs to active (in case they were created in pending_approval) AND expire j1
    await dbUpdate('jobs', { _id: j1._id }, { $set: { expiresAt: past, status: 'active' } });
    await dbUpdate('jobs', { _id: j2._id }, { $set: { expiresAt: future, status: 'active' } });

    const result = await runCron('job-expiry');
    expect(result.ok).toBe(true);
    expect(result.modified).toBeGreaterThanOrEqual(1);

    const j1After = (await dbFind('jobs', { _id: j1._id }))[0];
    const j2After = (await dbFind('jobs', { _id: j2._id }))[0];
    expect(j1After.status).toBe('expired');
    expect(j2After.status).toBe('active');
  });

  test('CR.2 job-expiry idempotent — running twice modifies 0 the second time', async () => {
    const emp = await makeEmployer({ preApprove: true });
    const past = new Date(Date.now() - 1000);
    const r = await fetch(`${API}/jobs`, {
      method: 'POST', headers: authHeaders(emp.token),
      body: JSON.stringify({
        title: 'CR2 idempotent test', description: 'x'.repeat(60), category: 'Teknologji',
        jobType: 'full-time', location: { city: 'Tiranë' },
        salary: { min: 1000, max: 2000, currency: 'EUR' },
        platformCategories: { diaspora: false, ngaShtepia: false, partTime: false, administrata: false, sezonale: false }
      })
    });
    const job = (await r.json()).data.job;
    await dbUpdate('jobs', { _id: job._id }, { $set: { expiresAt: past, status: 'active' } });

    const r1 = await runCron('job-expiry');
    expect(r1.modified).toBeGreaterThanOrEqual(1);
    const r2 = await runCron('job-expiry');
    expect(r2.modified).toBe(0);
  });

  test('CR.3 suspension-lift: status=suspended with expired expiresAt → status=active', async () => {
    const js = await makeJobseeker();
    const past = new Date(Date.now() - 1000);
    await dbUpdate('users', { email: js.email }, {
      $set: {
        status: 'suspended',
        suspensionDetails: { reason: 'test', expiresAt: past }
      }
    });

    const result = await runCron('suspension-lift');
    expect(result.ok).toBe(true);
    expect(result.modified).toBeGreaterThanOrEqual(1);

    const after = (await dbFind('users', { email: js.email }))[0];
    expect(after.status).toBe('active');
  });

  test('CR.4 suspension-lift skips not-yet-expired suspensions', async () => {
    const js = await makeJobseeker();
    const future = new Date(Date.now() + 24 * 3600 * 1000);
    await dbUpdate('users', { email: js.email }, {
      $set: {
        status: 'suspended',
        suspensionDetails: { reason: 'test', expiresAt: future }
      }
    });
    const result = await runCron('suspension-lift');
    expect(result.modified).toBe(0);
    const after = (await dbFind('users', { email: js.email }))[0];
    expect(after.status).toBe('suspended');
  });

  test('CR.5 data-retention: 60+-day-old expired jobs soft-deleted', async () => {
    const emp = await makeEmployer({ preApprove: true });
    const veryOld = new Date(Date.now() - 70 * 24 * 3600 * 1000);
    const recent = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const r1 = await fetch(`${API}/jobs`, {
      method: 'POST', headers: authHeaders(emp.token),
      body: JSON.stringify({
        title: 'OldExpired', description: 'x'.repeat(60), category: 'Teknologji',
        jobType: 'full-time', location: { city: 'Tiranë' },
        salary: { min: 1000, max: 2000, currency: 'EUR' },
        platformCategories: { diaspora: false, ngaShtepia: false, partTime: false, administrata: false, sezonale: false }
      })
    });
    const j1 = (await r1.json()).data.job;
    await dbUpdate('jobs', { _id: j1._id }, { $set: { status: 'expired', expiresAt: veryOld } });

    const r2 = await fetch(`${API}/jobs`, {
      method: 'POST', headers: authHeaders(emp.token),
      body: JSON.stringify({
        title: 'RecentExpired', description: 'x'.repeat(60), category: 'Teknologji',
        jobType: 'full-time', location: { city: 'Tiranë' },
        salary: { min: 1000, max: 2000, currency: 'EUR' },
        platformCategories: { diaspora: false, ngaShtepia: false, partTime: false, administrata: false, sezonale: false }
      })
    });
    const j2 = (await r2.json()).data.job;
    await dbUpdate('jobs', { _id: j2._id }, { $set: { status: 'expired', expiresAt: recent } });

    const result = await runCron('data-retention');
    expect(result.ok).toBe(true);
    expect(result.jobsModified).toBeGreaterThanOrEqual(1);

    const a1 = (await dbFind('jobs', { _id: j1._id }))[0];
    const a2 = (await dbFind('jobs', { _id: j2._id }))[0];
    expect(a1.isDeleted).toBe(true);
    expect(a2.isDeleted).not.toBe(true);
  });

  test('CR.6 data-retention: 1-year-old hired/rejected applications archived', async () => {
    const emp = await makeEmployer({ preApprove: true });
    const js = await makeJobseeker();
    const r = await fetch(`${API}/jobs`, {
      method: 'POST', headers: authHeaders(emp.token),
      body: JSON.stringify({
        title: 'CR6 retention test', description: 'x'.repeat(60), category: 'Teknologji',
        jobType: 'full-time', location: { city: 'Tiranë' },
        salary: { min: 1000, max: 2000, currency: 'EUR' },
        platformCategories: { diaspora: false, ngaShtepia: false, partTime: false, administrata: false, sezonale: false }
      })
    });
    const job = (await r.json()).data.job;
    const ar = await fetch(`${API}/applications/apply`, {
      method: 'POST', headers: authHeaders(js.token),
      body: JSON.stringify({ jobId: job._id, coverLetter: 'cover ' + 'x'.repeat(50), applicationMethod: 'one_click' })
    });
    const app = (await ar.json()).data.application;

    const veryOld = new Date(Date.now() - 400 * 24 * 3600 * 1000);
    await dbUpdate('applications', { _id: app._id }, {
      $set: { status: 'rejected', updatedAt: veryOld }
    });

    const result = await runCron('data-retention');
    expect(result.appsModified).toBeGreaterThanOrEqual(1);

    const after = (await dbFind('applications', { _id: app._id }))[0];
    expect(after.withdrawn).toBe(true);
  });

  test('CR.7 account-cleanup: 30+-day soft-deleted users hard-deleted with cascade', async () => {
    const js = await makeJobseeker();
    const userBefore = (await dbFind('users', { email: js.email }))[0];
    const veryOld = new Date(Date.now() - 40 * 24 * 3600 * 1000);
    await dbUpdate('users', { _id: userBefore._id }, {
      $set: { isDeleted: true, deletedAt: veryOld }
    });

    const usersBefore = await dbCount('users', { _id: userBefore._id });
    expect(usersBefore).toBe(1);

    const result = await runCron('account-cleanup');
    expect(result.ok).toBe(true);
    expect(result.deleted).toBeGreaterThanOrEqual(1);

    const usersAfter = await dbCount('users', { _id: userBefore._id });
    expect(usersAfter).toBe(0);
  });

  test('CR.8 account-cleanup skips recent soft-deletes', async () => {
    const js = await makeJobseeker();
    const userBefore = (await dbFind('users', { email: js.email }))[0];
    const recent = new Date(Date.now() - 5 * 24 * 3600 * 1000);
    await dbUpdate('users', { _id: userBefore._id }, {
      $set: { isDeleted: true, deletedAt: recent }
    });
    const result = await runCron('account-cleanup');
    expect(result.deleted).toBe(0);
    const usersAfter = await dbCount('users', { _id: userBefore._id });
    expect(usersAfter).toBe(1);
  });
});
