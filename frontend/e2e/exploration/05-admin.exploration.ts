/**
 * 05-admin.exploration.ts — Phase 24 / P5
 *
 * Walk every admin capability with focus on the Phase 23 unverified findings:
 *   - F-23-001 cache invalidation (admin dashboard)
 *   - F-23-002 configuration audit row creation
 *   - F-23-003 reports persistence
 *   - F-23-011/12 bulk notification per-user creation
 *   - F-23-031 admin moderation status drift
 *
 * Reproduce each one MANUALLY here, with diagnostic logs, before claiming bug.
 */

import { test, expect } from '@playwright/test';
import { setupEvidence } from './_evidence';
import { dbClear, dbFind, dbFindOne, dbCount } from '../real-backend/db-helpers';
import { makeAdmin, makeJobseeker, makeEmployer, authHeaders, API } from '../real-backend/factory-helpers';

test.describe.configure({ mode: 'serial' });

async function makeJob(empToken: string, opts: any = {}) {
  const r = await fetch(`${API}/jobs`, {
    method: 'POST', headers: authHeaders(empToken),
    body: JSON.stringify({
      title: opts.title ?? 'Admin Test Job',
      description: 'x'.repeat(80),
      category: 'Teknologji', jobType: 'full-time',
      location: { city: 'Tiranë' },
      salary: { min: 1000, max: 2000, currency: 'EUR' },
      platformCategories: { diaspora: false, ngaShtepia: false, partTime: false, administrata: false, sezonale: false },
      ...opts
    })
  });
  return (await r.json()).data?.job;
}

test.describe('Phase 24 / P5 / Admin domain', () => {
  test.beforeEach(async () => { await dbClear(); });

  test('P5.DASH.shape', async () => {
    const adm = await makeAdmin();
    const r = await fetch(`${API}/admin/dashboard-stats`, { headers: authHeaders(adm.token) });
    const body = await r.json();
    console.log('OBS GET /admin/dashboard-stats status=', r.status);
    console.log('OBS dashboard data shape:', Object.keys(body.data ?? {}).slice(0, 30));
    console.log('OBS dashboard data sample:', JSON.stringify(body.data).slice(0, 800));
  });

  test('P5.DASH.cache-invalidation-after-job-post (F-23-001)', async () => {
    const adm = await makeAdmin();
    const emp = await makeEmployer({ preApprove: true });

    // 1. Get baseline dashboard count
    const r1 = await fetch(`${API}/admin/dashboard-stats`, { headers: authHeaders(adm.token) });
    const b1 = await r1.json();
    console.log('OBS dashboard #1 raw:', JSON.stringify(b1.data).slice(0, 600));

    // Identify the field that holds total job count
    // Possible: data.totalJobs / data.stats.jobs.total / data.jobs.total
    const beforeJobs =
      b1.data?.totalJobs ??
      b1.data?.stats?.jobs?.total ??
      b1.data?.stats?.totalJobs ??
      b1.data?.jobs?.total ?? 0;
    console.log('OBS dashboard #1 totalJobs:', beforeJobs);

    // 2. Post a job
    const job = await makeJob(emp.token);
    console.log('OBS posted job _id=', job?._id);

    // 3. Re-fetch dashboard
    const r2 = await fetch(`${API}/admin/dashboard-stats`, { headers: authHeaders(adm.token) });
    const b2 = await r2.json();
    const afterJobs =
      b2.data?.totalJobs ??
      b2.data?.stats?.jobs?.total ??
      b2.data?.stats?.totalJobs ??
      b2.data?.jobs?.total ?? 0;
    console.log('OBS dashboard #2 totalJobs:', afterJobs);

    if (afterJobs > beforeJobs) {
      console.log('OBS F-23-001 NOT REPRODUCED: cache invalidation working — count went from', beforeJobs, '→', afterJobs);
    } else {
      console.log('FINDING F-23-001 CONFIRMED: cache stale — count unchanged after job post (', beforeJobs, '→', afterJobs, ')');
    }
  });

  test('P5.CONFIG.audit-row-on-update (F-23-002)', async () => {
    const adm = await makeAdmin();

    // First initialize defaults so we have something to update
    const init = await fetch(`${API}/configuration/initialize-defaults`, {
      method: 'POST', headers: authHeaders(adm.token)
    });
    console.log('OBS init-defaults status=', init.status);

    // List configurations
    const list = await fetch(`${API}/configuration`, { headers: authHeaders(adm.token) });
    const listBody = await list.json();
    console.log('OBS list config status=', list.status);
    console.log('OBS list shape:', JSON.stringify(listBody).slice(0, 600));

    const configs = listBody.data?.configurations ?? listBody.data ?? [];
    if (!configs.length) {
      console.log('FINDING F-23-002 SETUP: no configurations exist after initialize-defaults — cannot test audit cascade');
      return;
    }
    const target = configs[0];
    console.log('OBS target config:', JSON.stringify({ id: target._id, key: target.key, value: target.value }));

    const auditBefore = await dbCount('configurationaudits', { configurationId: target._id });
    console.log('OBS audit rows before update:', auditBefore);

    // Update it
    const upd = await fetch(`${API}/configuration/${target._id}`, {
      method: 'PUT', headers: authHeaders(adm.token),
      body: JSON.stringify({ value: 'updated value ' + Date.now() })
    });
    const updBody = await upd.json();
    console.log('OBS update status=', upd.status, 'body=', JSON.stringify(updBody).slice(0, 400));

    const auditAfter = await dbCount('configurationaudits', { configurationId: target._id });
    console.log('OBS audit rows after update:', auditAfter);

    if (upd.status === 200 && auditAfter > auditBefore) {
      console.log('OBS F-23-002 NOT REPRODUCED: audit row WAS created (', auditBefore, '→', auditAfter, ')');
    } else if (upd.status === 200) {
      console.log('FINDING F-23-002 CONFIRMED: update succeeded (200) but no audit row created (', auditBefore, '→', auditAfter, ')');
    } else {
      console.log('OBS F-23-002 INCONCLUSIVE: update failed with status', upd.status);
    }
  });

  test('P5.REPORT.create-persists (F-23-003)', async () => {
    const reporter = await makeJobseeker();
    const target = await makeJobseeker();
    const targetUser = await dbFindOne('users', { email: target.email });

    const r = await fetch(`${API}/reports`, {
      method: 'POST', headers: authHeaders(reporter.token),
      body: JSON.stringify({
        targetUserId: targetUser._id,
        category: 'spam',
        reason: 'This user posted spam in their messages',
        description: 'Detailed reason ' + 'x'.repeat(50)
      })
    });
    const body = await r.json();
    console.log('OBS POST /reports status=', r.status, 'body=', JSON.stringify(body).slice(0, 400));

    const reports = await dbFind('reports', { targetUserId: targetUser._id });
    console.log('OBS reports in DB:', reports.length, JSON.stringify(reports[0] ?? null).slice(0, 400));

    if (r.status === 200 || r.status === 201) {
      if (reports.length === 1) {
        console.log('OBS F-23-003 NOT REPRODUCED: report persisted');
      } else {
        console.log('FINDING F-23-003 CONFIRMED: API success but no report in DB');
      }
    } else {
      console.log('OBS F-23-003 INCONCLUSIVE: API rejected with status', r.status, '— check request shape');
    }
  });

  test('P5.BULK.create-notifications-per-user (F-23-011/12)', async () => {
    const adm = await makeAdmin();
    // Seed 3 jobseekers + 1 employer
    const js1 = await makeJobseeker();
    const js2 = await makeJobseeker();
    const js3 = await makeJobseeker();
    const emp = await makeEmployer({ preApprove: true });

    const r = await fetch(`${API}/bulk-notifications`, {
      method: 'PATCH', headers: authHeaders(adm.token),
      body: JSON.stringify({
        title: 'Test announcement',
        message: 'This is a test bulk notification',
        type: 'announcement',
        targetAudience: 'all',
        sendImmediately: true
      })
    });
    const body = await r.json();
    console.log('OBS POST /bulk-notifications status=', r.status, 'body=', JSON.stringify(body).slice(0, 600));

    // Wait briefly for async processing
    await new Promise(r => setTimeout(r, 1000));

    const bulkDocs = await dbFind('bulknotifications', {});
    console.log('OBS bulkNotifications docs:', bulkDocs.length);

    // Per-user notifications: should have one for each of js1, js2, js3, emp = 4
    const allNotifs = await dbFind('notifications', { type: 'announcement' });
    console.log('OBS per-user announcement notifications:', allNotifs.length);
    console.log('OBS sample notif:', JSON.stringify(allNotifs[0] ?? null).slice(0, 300));

    if (r.status === 200 || r.status === 201) {
      if (allNotifs.length >= 3) {
        console.log('OBS F-23-011/12 NOT REPRODUCED: per-user notifications created (', allNotifs.length, ')');
      } else {
        console.log('FINDING F-23-011/12 CONFIRMED: bulk-notification API success but only', allNotifs.length, 'per-user notif rows');
      }
    } else {
      console.log('OBS F-23-011/12 INCONCLUSIVE: bulk-notif API failed with', r.status);
    }
  });

  test('P5.MODERATE.warn-action (F-23-031)', async () => {
    const adm = await makeAdmin();
    const target = await makeJobseeker();
    const targetUser = await dbFindOne('users', { email: target.email });

    const r = await fetch(`${API}/admin/users/${targetUser._id}/manage`, {
      method: 'PATCH', headers: authHeaders(adm.token),
      body: JSON.stringify({ action: 'warn', reason: 'First warning for spam' })
    });
    const body = await r.json();
    console.log('OBS warn-action status=', r.status, 'body=', JSON.stringify(body).slice(0, 400));

    const after = await dbFindOne('users', { _id: targetUser._id });
    console.log('OBS user after warn:', JSON.stringify({
      status: after?.status,
      warningCount: after?.warningCount,
      suspensionDetails: after?.suspensionDetails,
      isDeleted: after?.isDeleted,
    }));
  });

  test('P5.MODERATE.suspend-action', async () => {
    const adm = await makeAdmin();
    const target = await makeJobseeker();
    const targetUser = await dbFindOne('users', { email: target.email });

    const r = await fetch(`${API}/admin/users/${targetUser._id}/manage`, {
      method: 'PATCH', headers: authHeaders(adm.token),
      body: JSON.stringify({
        action: 'temporary_suspension',
        reason: 'Spamming reports',
        durationDays: 7
      })
    });
    const body = await r.json();
    console.log('OBS suspend status=', r.status, 'body=', JSON.stringify(body).slice(0, 400));

    const after = await dbFindOne('users', { _id: targetUser._id });
    console.log('OBS user after suspend:', JSON.stringify({
      status: after?.status,
      suspensionDetails: after?.suspensionDetails,
    }));
  });

  test('P5.MODERATE.permanent-ban', async () => {
    const adm = await makeAdmin();
    const target = await makeJobseeker();
    const targetUser = await dbFindOne('users', { email: target.email });

    const r = await fetch(`${API}/admin/users/${targetUser._id}/manage`, {
      method: 'PATCH', headers: authHeaders(adm.token),
      body: JSON.stringify({ action: 'permanent_suspension', reason: 'Severe abuse' })
    });
    console.log('OBS permanent-ban status=', r.status);

    const after = await dbFindOne('users', { _id: targetUser._id });
    console.log('OBS user after perm-ban:', JSON.stringify({
      status: after?.status,
      suspensionDetails: after?.suspensionDetails,
    }));
  });

  test('P5.MODERATE.account-termination', async () => {
    const adm = await makeAdmin();
    const target = await makeJobseeker();
    const targetUser = await dbFindOne('users', { email: target.email });

    const r = await fetch(`${API}/admin/users/${targetUser._id}/manage`, {
      method: 'PATCH', headers: authHeaders(adm.token),
      body: JSON.stringify({ action: 'account_termination', reason: 'Final action' })
    });
    console.log('OBS termination status=', r.status);

    const after = await dbFindOne('users', { _id: targetUser._id });
    console.log('OBS user after termination:', JSON.stringify({
      status: after?.status,
      isDeleted: after?.isDeleted,
      deletedAt: after?.deletedAt,
    }));
  });

  test('P5.MODERATE.self-action-blocked', async () => {
    const adm = await makeAdmin();
    const admUser = await dbFindOne('users', { email: adm.email });

    const r = await fetch(`${API}/admin/users/${admUser._id}/manage`, {
      method: 'PATCH', headers: authHeaders(adm.token),
      body: JSON.stringify({ action: 'permanent_suspension', reason: 'self-suspend' })
    });
    const body = await r.json();
    console.log('OBS self-suspend status=', r.status, 'body=', JSON.stringify(body).slice(0, 400));
    expect(r.status, 'admin cannot self-action').not.toBe(200);
  });
});
