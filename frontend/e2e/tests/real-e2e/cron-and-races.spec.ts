/**
 * Phase 22.I — Cron + Cascades + Races EXHAUSTIVE
 *
 * Uses /__test/cron/run-* side-channel endpoints to fire crons synchronously,
 * then asserts side effects.
 *
 * Race conditions: applies/posts/saves with Promise.all and verifies counters
 * + uniqueness invariants stay intact.
 */

import { test, expect } from '@playwright/test';
import { dbClear, dbFind, dbUpdate } from '../../real-backend/db-helpers';
import { API, makeJobseeker, makeEmployer, makeAdmin, runCron, authHeaders } from '../../real-backend/factory-helpers';

test.describe.configure({ mode: 'serial' });

const NORMAL_PLATFORM = { diaspora: false, ngaShtepia: false, partTime: false, administrata: false, sezonale: false };

async function postJob(empToken: string, overrides: any = {}) {
  const res = await fetch(`${API}/jobs`, {
    method: 'POST', headers: authHeaders(empToken),
    body: JSON.stringify({
      title: 'I Test Job ' + Math.random().toString(36).slice(2, 6),
      description: 'I'.repeat(80), category: 'Teknologji', jobType: 'full-time',
      location: { city: 'Tiranë' }, platformCategories: NORMAL_PLATFORM,
      ...overrides
    }),
  });
  const body = await res.json();
  if (!body.success) throw new Error('postJob failed: ' + JSON.stringify(body));
  return body.data.job;
}

async function applyToJob(jsToken: string, jobId: string) {
  return fetch(`${API}/applications/apply`, {
    method: 'POST', headers: authHeaders(jsToken),
    body: JSON.stringify({ jobId, applicationMethod: 'one_click' })
  });
}

test.describe('Phase 22.I — Cron + Races', () => {
  test.beforeEach(async () => { await dbClear(); });

  // ─── Cron: job expiry ──────────────────────────────────────────────────

  test('I.1 cron job-expiry: active jobs past expiresAt → status=expired', async () => {
    const emp = await makeEmployer();
    const j1 = await postJob(emp.token);
    const j2 = await postJob(emp.token);

    // Force one job's expiresAt into the past
    await dbUpdate('jobs', { _id: j1._id }, { $set: { expiresAt: { $date: new Date(Date.now() - 1000).toISOString() } } });

    const r = await runCron('job-expiry');
    expect(r.ok).toBe(true);
    expect(r.modified).toBeGreaterThanOrEqual(1);

    const jobs = await dbFind('jobs', {});
    const expired = jobs.filter((j: any) => j.status === 'expired');
    const active = jobs.filter((j: any) => j.status === 'active');
    expect(expired.length).toBeGreaterThanOrEqual(1);
    expect(active.length).toBeGreaterThanOrEqual(1);  // j2 still active
  });

  test('I.2 cron job-expiry: deleted jobs not affected', async () => {
    const emp = await makeEmployer();
    const j = await postJob(emp.token);
    await dbUpdate('jobs', { _id: j._id }, {
      $set: {
        expiresAt: { $date: new Date(Date.now() - 1000).toISOString() },
        isDeleted: true, status: 'closed'
      }
    });
    await runCron('job-expiry');
    const after = (await dbFind('jobs', {}))[0];
    expect(after.status).toBe('closed');  // not flipped to 'expired'
    expect(after.isDeleted).toBe(true);
  });

  // ─── Cron: suspension lift ─────────────────────────────────────────────

  test('I.3 cron suspension-lift: expiresAt past → status=active', async () => {
    const adm = await makeAdmin();
    const target = await makeJobseeker();
    const tu = (await dbFind('users', { email: target.email }))[0];

    // Suspend (admin manage)
    await fetch(`${API}/admin/users/${tu._id}/manage`, {
      method: 'PATCH', headers: authHeaders(adm.token),
      body: JSON.stringify({ action: 'suspend', reason: 'Test', duration: 1 })
    });
    // Force suspensionDetails.expiresAt into the past
    await dbUpdate('users', { _id: tu._id }, {
      $set: { 'suspensionDetails.expiresAt': { $date: new Date(Date.now() - 1000).toISOString() } }
    });

    const r = await runCron('suspension-lift');
    expect(r.ok).toBe(true);
    expect(r.modified).toBeGreaterThanOrEqual(1);
    const after = (await dbFind('users', { email: target.email }))[0];
    expect(after.status).toBe('active');
  });

  test('I.4 cron suspension-lift: future expiresAt → still suspended', async () => {
    const adm = await makeAdmin();
    const target = await makeJobseeker();
    const tu = (await dbFind('users', { email: target.email }))[0];
    await fetch(`${API}/admin/users/${tu._id}/manage`, {
      method: 'PATCH', headers: authHeaders(adm.token),
      body: JSON.stringify({ action: 'suspend', reason: 'Test', duration: 7 })
    });
    await runCron('suspension-lift');
    const after = (await dbFind('users', { email: target.email }))[0];
    expect(after.status).toBe('suspended');
  });

  // ─── Cron: data retention ──────────────────────────────────────────────

  test('I.5 cron data-retention: 60+-day-old expired jobs soft-deleted', async () => {
    const emp = await makeEmployer();
    const j = await postJob(emp.token);
    const sixtyOne = new Date(Date.now() - 61 * 24 * 60 * 60 * 1000);
    await dbUpdate('jobs', { _id: j._id }, {
      $set: { status: 'expired', expiresAt: { $date: sixtyOne.toISOString() } }
    });
    const r = await runCron('data-retention');
    expect(r.ok).toBe(true);
    expect(r.jobsModified).toBeGreaterThanOrEqual(1);
    const after = (await dbFind('jobs', {}))[0];
    expect(after.isDeleted).toBe(true);
  });

  test('I.6 cron data-retention: 1y+-old hired/rejected apps archived (withdrawn)', async () => {
    const emp = await makeEmployer();
    const js = await makeJobseeker();
    const job = await postJob(emp.token);
    await applyToJob(js.token, job._id);
    const apps = await dbFind('applications', {});
    const oneYearOneDay = new Date(Date.now() - 366 * 24 * 60 * 60 * 1000);
    await dbUpdate('applications', { _id: apps[0]._id }, {
      $set: { status: 'rejected', updatedAt: { $date: oneYearOneDay.toISOString() } }
    });
    const r = await runCron('data-retention');
    expect(r.ok).toBe(true);
    expect(r.appsModified).toBeGreaterThanOrEqual(1);
    const after = (await dbFind('applications', {}))[0];
    expect(after.withdrawn).toBe(true);
  });

  // ─── Cron: account cleanup ─────────────────────────────────────────────

  test('I.7 cron account-cleanup: 30+-day soft-deleted user hard-deleted', async () => {
    const target = await makeJobseeker();
    const tu = (await dbFind('users', { email: target.email }))[0];
    const thirtyOne = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    await dbUpdate('users', { _id: tu._id }, {
      $set: { isDeleted: true, deletedAt: { $date: thirtyOne.toISOString() } }
    });
    const before = await dbFind('users', { email: target.email });
    expect(before.length).toBe(1);

    const r = await runCron('account-cleanup');
    expect(r.ok).toBe(true);

    // After cleanup, the soft-deleted user is fully removed from the collection.
    const after = await dbFind('users', { email: target.email });
    expect(after.length).toBe(0);
  });

  // ─── Race: concurrent posts → Location.jobCount = N ────────────────────

  test('I.8 race: 5 concurrent POST /jobs from same employer → Location.jobCount = 5', async () => {
    const emp = await makeEmployer();
    const before = await dbFind('locations', { city: 'Tiranë' });
    const baseCount = before[0]?.jobCount || 0;

    await Promise.all(Array.from({ length: 5 }, () => postJob(emp.token)));

    const after = await dbFind('locations', { city: 'Tiranë' });
    expect(after[0].jobCount).toBe(baseCount + 5);
  });

  // ─── Race: 10 jobseekers apply same job → applicationCount = 10 ────────

  test('I.9 race: 10 different jobseekers apply same job → applicationCount = 10', async () => {
    const emp = await makeEmployer();
    const job = await postJob(emp.token);

    const seekers = await Promise.all(Array.from({ length: 10 }, () => makeJobseeker()));
    await Promise.all(seekers.map(s => applyToJob(s.token, job._id)));

    const after = (await dbFind('jobs', {}))[0];
    expect(after.applicationCount).toBe(10);
    const apps = await dbFind('applications', {});
    expect(apps.length).toBe(10);
  });

  // ─── Race: same user 5x apply same job → 1 success + 4 rejections ─────

  test('I.10 race: same user 5x apply same job → 1 success + ≥4 rejections', async () => {
    const emp = await makeEmployer();
    const js = await makeJobseeker();
    const job = await postJob(emp.token);

    const results = await Promise.all(Array.from({ length: 5 }, () => applyToJob(js.token, job._id)));
    const statuses = results.map(r => r.status);
    const successes = statuses.filter(s => s === 201);
    const rejects = statuses.filter(s => s === 400 || s === 409);
    expect(successes.length).toBe(1);
    expect(rejects.length).toBeGreaterThanOrEqual(4);
    const apps = await dbFind('applications', {});
    expect(apps.length).toBe(1);
  });

  // ─── Race: 3 reports → escalation race (F-8) ────────────────────────────

  test('I.11 race: 3 concurrent reports on same target → at least one priority=high', async () => {
    const target = await makeJobseeker();
    const tu = (await dbFind('users', { email: target.email }))[0];
    const reporters = await Promise.all(Array.from({ length: 3 }, () => makeJobseeker()));
    await Promise.all(reporters.map(r =>
      fetch(`${API}/reports`, {
        method: 'POST', headers: authHeaders(r.token),
        body: JSON.stringify({ reportedUserId: tu._id, category: 'spam_behavior' })
      })
    ));
    await new Promise(r => setTimeout(r, 300));
    const reports = await dbFind('reports', {});
    expect(reports.length).toBe(3);
    const priorities = reports.map((r: any) => r.priority);
    expect(priorities).toContain('high');
  });

  // ─── Race: concurrent saved-jobs add → exactly 1 entry ($addToSet) ─────

  test('I.12 race: 5 concurrent saved-jobs add same job → 1 entry', async () => {
    const emp = await makeEmployer();
    const js = await makeJobseeker();
    const job = await postJob(emp.token);

    await Promise.all(Array.from({ length: 5 }, () =>
      fetch(`${API}/users/saved-jobs/${job._id}`, {
        method: 'POST', headers: authHeaders(js.token)
      })
    ));
    const after = (await dbFind('users', { email: js.email }))[0];
    const matches = after.savedJobs.filter((id: any) => id.toString() === job._id.toString());
    expect(matches.length).toBe(1);
  });

  // ─── Race: concurrent application status updates → consistent state ───

  test('I.13 race: concurrent status changes → final state is one of the requested values', async () => {
    const emp = await makeEmployer();
    const js = await makeJobseeker();
    const job = await postJob(emp.token);
    await applyToJob(js.token, job._id);
    const apps = await dbFind('applications', {});
    const appId = apps[0]._id;

    // Two simultaneous status changes
    await Promise.all([
      fetch(`${API}/applications/${appId}/status`, {
        method: 'PATCH', headers: authHeaders(emp.token),
        body: JSON.stringify({ status: 'shortlisted' })
      }),
      fetch(`${API}/applications/${appId}/status`, {
        method: 'PATCH', headers: authHeaders(emp.token),
        body: JSON.stringify({ status: 'viewed' })
      })
    ]);
    const after = (await dbFind('applications', {}))[0];
    expect(['shortlisted', 'viewed']).toContain(after.status);
  });

  // ─── Race: refresh-token rotation race ─────────────────────────────────

  test('I.14 race: concurrent refresh of same refreshToken → at least 1 succeeds, no crash', async () => {
    const js = await makeJobseeker();
    const loginRes = await fetch(`${API}/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: js.email, password: js.password })
    });
    const loginBody = await loginRes.json();
    const refreshToken = loginBody.data?.refreshToken;
    expect(refreshToken).toBeTruthy();

    const results = await Promise.all([
      fetch(`${API}/auth/refresh`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken })
      }),
      fetch(`${API}/auth/refresh`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken })
      })
    ]);
    const statuses = results.map(r => r.status);
    // At least one must succeed; no 5xx errors on either branch.
    const successes = statuses.filter(s => s === 200).length;
    expect(successes).toBeGreaterThanOrEqual(1);
    expect(statuses.every(s => s < 500)).toBe(true);
  });

  // ─── Race: concurrent admin actions on same target ─────────────────────

  test('I.15 race: concurrent suspend + ban on same target → final state is one action', async () => {
    const adm = await makeAdmin();
    const target = await makeJobseeker();
    const tu = (await dbFind('users', { email: target.email }))[0];

    await Promise.all([
      fetch(`${API}/admin/users/${tu._id}/manage`, {
        method: 'PATCH', headers: authHeaders(adm.token),
        body: JSON.stringify({ action: 'suspend', reason: 'A', duration: 7 })
      }),
      fetch(`${API}/admin/users/${tu._id}/manage`, {
        method: 'PATCH', headers: authHeaders(adm.token),
        body: JSON.stringify({ action: 'ban', reason: 'B' })
      })
    ]);
    const after = (await dbFind('users', { email: target.email }))[0];
    expect(['suspended', 'banned']).toContain(after.status);
  });
});
