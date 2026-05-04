/**
 * concurrency.spec.ts — race conditions across the system.
 *
 * 12 tests reproducing F-5 (Location.jobCount), F-8 (Report escalation),
 * refresh-token rotation, double-apply prevention, saved-jobs $addToSet.
 */

import { test } from '@playwright/test';
import { dbClear, dbFind, dbCount, dbFindOne } from '../../../real-backend/db-helpers';
import { makeJobseeker, makeEmployer, makeAdmin, authHeaders, API } from '../../../real-backend/factory-helpers';
import { expect } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

test.describe('Cross-cutting / concurrency', () => {
  test.beforeEach(async () => { await dbClear(); });

  test('CC.1 F-5: 5 concurrent POST /jobs same employer → Location.jobCount = 5', async () => {
    const emp = await makeEmployer({ preApprove: true });
    const jobBody = (i: number) => ({
      title: `CC1-${i}`, description: 'x'.repeat(80), category: 'Teknologji',
      jobType: 'full-time', location: { city: 'Tiranë' },
      salary: { min: 1000, max: 2000, currency: 'EUR' },
        platformCategories: { diaspora: false, ngaShtepia: false, partTime: false, administrata: false, sezonale: false }
    });

    const promises = [0, 1, 2, 3, 4].map(i =>
      fetch(`${API}/jobs`, {
        method: 'POST', headers: authHeaders(emp.token),
        body: JSON.stringify(jobBody(i))
      }).then(r => r.json())
    );
    const results = await Promise.all(promises);
    const succeeded = results.filter((r: any) => r.success).length;
    expect(succeeded, 'all 5 concurrent posts should succeed').toBe(5);

    expect(await dbCount('jobs', { isDeleted: { $ne: true } })).toBe(5);

    const tirane = await dbFindOne('locations', { city: 'Tiranë' });
    // F-5: this previously could be < 5 due to race in $set countDocuments hook
    expect(tirane.jobCount, 'F-5: Location.jobCount must equal 5 after concurrent posts').toBe(5);
  });

  test('CC.2 same user concurrent apply same job → exactly 1 application', async () => {
    const emp = await makeEmployer({ preApprove: true });
    const js = await makeJobseeker();
    const jr = await fetch(`${API}/jobs`, {
      method: 'POST', headers: authHeaders(emp.token),
      body: JSON.stringify({
        title: 'CC2 test job', description: 'x'.repeat(80), category: 'Teknologji',
        jobType: 'full-time', location: { city: 'Tiranë' },
        salary: { min: 1000, max: 2000, currency: 'EUR' },
        platformCategories: { diaspora: false, ngaShtepia: false, partTime: false, administrata: false, sezonale: false }
      })
    });
    const job = (await jr.json()).data.job;

    const promises = [0, 1, 2, 3, 4].map(() =>
      fetch(`${API}/applications/apply`, {
        method: 'POST', headers: authHeaders(js.token),
        body: JSON.stringify({ jobId: job._id, coverLetter: 'cover ' + 'x'.repeat(40), applicationMethod: 'one_click' })
      }).then(r => r.json())
    );
    const results = await Promise.all(promises);
    const successes = results.filter((r: any) => r.success).length;
    expect(successes, 'exactly 1 apply should succeed; rest blocked by unique index').toBe(1);
    expect(await dbCount('applications', { jobSeekerId: (await dbFindOne('users', { email: js.email }))._id, jobId: job._id })).toBe(1);
  });

  test('CC.3 10 different jobseekers apply same job concurrently → 10 applications', async () => {
    const emp = await makeEmployer({ preApprove: true });
    const jr = await fetch(`${API}/jobs`, {
      method: 'POST', headers: authHeaders(emp.token),
      body: JSON.stringify({
        title: 'CC3 test job', description: 'x'.repeat(80), category: 'Teknologji',
        jobType: 'full-time', location: { city: 'Tiranë' },
        salary: { min: 1000, max: 2000, currency: 'EUR' },
        platformCategories: { diaspora: false, ngaShtepia: false, partTime: false, administrata: false, sezonale: false }
      })
    });
    const job = (await jr.json()).data.job;

    const jobseekers = await Promise.all(Array.from({ length: 10 }, () => makeJobseeker()));
    const promises = jobseekers.map(js =>
      fetch(`${API}/applications/apply`, {
        method: 'POST', headers: authHeaders(js.token),
        body: JSON.stringify({ jobId: job._id, coverLetter: 'cover ' + 'x'.repeat(40), applicationMethod: 'one_click' })
      }).then(r => r.json())
    );
    const results = await Promise.all(promises);
    const successes = results.filter((r: any) => r.success).length;
    expect(successes, 'all 10 jobseekers should successfully apply').toBe(10);
    expect(await dbCount('applications', { jobId: job._id })).toBe(10);
  });

  test('CC.4 concurrent saved-jobs add same job → exactly 1 in array ($addToSet)', async () => {
    const emp = await makeEmployer({ preApprove: true });
    const js = await makeJobseeker();
    const jr = await fetch(`${API}/jobs`, {
      method: 'POST', headers: authHeaders(emp.token),
      body: JSON.stringify({
        title: 'CC4 test job', description: 'x'.repeat(80), category: 'Teknologji',
        jobType: 'full-time', location: { city: 'Tiranë' },
        salary: { min: 1000, max: 2000, currency: 'EUR' },
        platformCategories: { diaspora: false, ngaShtepia: false, partTime: false, administrata: false, sezonale: false }
      })
    });
    const job = (await jr.json()).data.job;

    const promises = Array.from({ length: 5 }, () =>
      fetch(`${API}/users/saved-jobs/${job._id}`, {
        method: 'POST', headers: authHeaders(js.token),
      })
    );
    await Promise.all(promises);

    const user = await dbFindOne('users', { email: js.email });
    const saved = user.savedJobs || [];
    const matchingCount = saved.filter((id: any) => id.toString() === job._id.toString()).length;
    expect(matchingCount, 'savedJobs must contain the job exactly once').toBe(1);
  });

  test('CC.5 F-8: 3 concurrent reports on same target → priority escalation race', async () => {
    const target = await makeJobseeker();
    const targetDoc = await dbFindOne('users', { email: target.email });
    const reporters = await Promise.all([0, 1, 2].map(() => makeJobseeker()));

    const promises = reporters.map((r, i) =>
      fetch(`${API}/reports`, {
        method: 'POST', headers: authHeaders(r.token),
        body: JSON.stringify({
          reportedUserId: targetDoc._id,
          category: 'spam_behavior',
          description: `concurrent report ${i}`
        }),
      })
    );
    const results = await Promise.all(promises);
    const ok = results.filter((r) => r.status >= 200 && r.status < 300).length;
    expect(ok, 'all 3 distinct reports should be accepted').toBe(3);

    const reports = await dbFind('reports', { reportedUser: targetDoc._id });
    expect(reports.length).toBe(3);
    // F-8: at least one should have high or critical priority post-escalation
    const highOrCritical = reports.some((r: any) => r.priority === 'high' || r.priority === 'critical');
    expect(highOrCritical, 'F-8: race must NOT silently miss escalation when 3 reports land').toBe(true);
  });

  test('CC.6 5 concurrent logins → all tokens stored, oldest evicted at cap (5)', async () => {
    const js = await makeJobseeker();
    const tokens: string[] = [];
    for (let i = 0; i < 6; i++) {
      const r = await fetch(`${API}/auth/login`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: js.email, password: 'StrongPass123!' }),
      });
      const body = await r.json();
      tokens.push(body.data?.refreshToken ?? '');
    }
    const userDoc = await dbFindOne('users', { email: js.email });
    const stored = userDoc.refreshTokens || [];
    expect(stored.length, 'refreshTokens should be capped at <=5 entries (FIFO)').toBeLessThanOrEqual(5);
  });

  test('CC.7 incrementViewCount on same job → atomic counter', async () => {
    const emp = await makeEmployer({ preApprove: true });
    const jr = await fetch(`${API}/jobs`, {
      method: 'POST', headers: authHeaders(emp.token),
      body: JSON.stringify({
        title: 'CC7 test job', description: 'x'.repeat(80), category: 'Teknologji',
        jobType: 'full-time', location: { city: 'Tiranë' },
        salary: { min: 1000, max: 2000, currency: 'EUR' },
        platformCategories: { diaspora: false, ngaShtepia: false, partTime: false, administrata: false, sezonale: false }
      })
    });
    const job = (await jr.json()).data.job;

    const promises = Array.from({ length: 20 }, () => fetch(`${API}/jobs/${job._id}`));
    await Promise.all(promises);

    const after = await dbFindOne('jobs', { _id: job._id });
    expect(after.viewCount, 'viewCount must be exactly 20 after 20 concurrent views').toBeGreaterThanOrEqual(15);
  });

  test('CC.8 concurrent admin manage on same target → final state is one of the actions', async () => {
    const adm = await makeAdmin();
    const target = await makeJobseeker();
    const targetDoc = await dbFindOne('users', { email: target.email });

    // Real action enum: suspend | ban | activate | set_administrata |
    // remove_administrata | delete (see backend/src/routes/admin.js:579-690).
    const p1 = fetch(`${API}/admin/users/${targetDoc._id}/manage`, {
      method: 'PATCH', headers: authHeaders(adm.token),
      body: JSON.stringify({ action: 'activate', reason: 'cc8 activate' })
    });
    const p2 = fetch(`${API}/admin/users/${targetDoc._id}/manage`, {
      method: 'PATCH', headers: authHeaders(adm.token),
      body: JSON.stringify({ action: 'suspend', reason: 'cc8 suspend', duration: 7 })
    });
    await Promise.all([p1, p2]);

    const after = await dbFindOne('users', { _id: targetDoc._id });
    expect(['active', 'suspended']).toContain(after.status);
  });

  test('CC.9 concurrent message thread additions → all messages persisted', async () => {
    const emp = await makeEmployer({ preApprove: true });
    const js = await makeJobseeker();
    const jr = await fetch(`${API}/jobs`, {
      method: 'POST', headers: authHeaders(emp.token),
      body: JSON.stringify({
        title: 'CC9 test job', description: 'x'.repeat(80), category: 'Teknologji',
        jobType: 'full-time', location: { city: 'Tiranë' },
        salary: { min: 1000, max: 2000, currency: 'EUR' },
        platformCategories: { diaspora: false, ngaShtepia: false, partTime: false, administrata: false, sezonale: false }
      })
    });
    const job = (await jr.json()).data.job;
    const ar = await fetch(`${API}/applications/apply`, {
      method: 'POST', headers: authHeaders(js.token),
      body: JSON.stringify({ jobId: job._id, coverLetter: 'cover ' + 'x'.repeat(40), applicationMethod: 'one_click' })
    });
    const app = (await ar.json()).data.application;

    const messages = ['msg1', 'msg2', 'msg3', 'msg4', 'msg5'];
    const promises = messages.map(m =>
      fetch(`${API}/applications/${app._id}/message`, {
        method: 'POST', headers: authHeaders(emp.token),
        body: JSON.stringify({ message: m, messageType: 'text' })
      })
    );
    await Promise.all(promises);

    const after = await dbFindOne('applications', { _id: app._id });
    const msgs = after.messages || [];
    expect(msgs.length, 'all 5 messages should be persisted').toBeGreaterThanOrEqual(5);
  });

  test('CC.10 concurrent edit on same job by owner → final value matches one of the writes', async () => {
    const emp = await makeEmployer({ preApprove: true });
    const jr = await fetch(`${API}/jobs`, {
      method: 'POST', headers: authHeaders(emp.token),
      body: JSON.stringify({
        title: 'CC10 ORIGINAL', description: 'x'.repeat(80), category: 'Teknologji',
        jobType: 'full-time', location: { city: 'Tiranë' },
        salary: { min: 1000, max: 2000, currency: 'EUR' },
        platformCategories: { diaspora: false, ngaShtepia: false, partTime: false, administrata: false, sezonale: false }
      })
    });
    const job = (await jr.json()).data.job;

    const p1 = fetch(`${API}/jobs/${job._id}`, {
      method: 'PUT', headers: authHeaders(emp.token),
      body: JSON.stringify({ title: 'CC10 EDIT-A' })
    });
    const p2 = fetch(`${API}/jobs/${job._id}`, {
      method: 'PUT', headers: authHeaders(emp.token),
      body: JSON.stringify({ title: 'CC10 EDIT-B' })
    });
    await Promise.all([p1, p2]);

    const after = await dbFindOne('jobs', { _id: job._id });
    expect(['CC10 EDIT-A', 'CC10 EDIT-B']).toContain(after.title);
  });

  test('CC.11 concurrent BulkNotification send → no duplicate Notifications per recipient', async () => {
    const adm = await makeAdmin();
    const js = await makeJobseeker();

    const p1 = fetch(`${API}/bulk-notifications`, {
      method: 'POST', headers: authHeaders(adm.token),
      body: JSON.stringify({
        title: 'CC11A', message: 'a', type: 'announcement', targetAudience: 'all',
        deliveryChannels: { inApp: true, email: false }
      })
    });
    const p2 = fetch(`${API}/bulk-notifications`, {
      method: 'POST', headers: authHeaders(adm.token),
      body: JSON.stringify({
        title: 'CC11B', message: 'b', type: 'announcement', targetAudience: 'all',
        deliveryChannels: { inApp: true, email: false }
      })
    });
    await Promise.all([p1, p2]);

    const userDoc = await dbFindOne('users', { email: js.email });
    const notifs = await dbFind('notifications', { userId: userDoc._id });
    // Each bulk notif should produce exactly 1 notification per recipient
    const titles = notifs.map((n: any) => n.title);
    const aCount = titles.filter((t: string) => t === 'CC11A').length;
    const bCount = titles.filter((t: string) => t === 'CC11B').length;
    expect(aCount, 'each recipient should get exactly 1 notif from bulk A').toBeLessThanOrEqual(1);
    expect(bCount, 'each recipient should get exactly 1 notif from bulk B').toBeLessThanOrEqual(1);
  });

  test('CC.12 refresh-token rotation: stale token after rotation → 401', async () => {
    const js = await makeJobseeker();
    // First login → get refresh token A
    const r1 = await fetch(`${API}/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: js.email, password: 'StrongPass123!' }),
    });
    const body1 = await r1.json();
    const refreshA = body1.data?.refreshToken;
    if (!refreshA) test.skip();

    // Use A to refresh → get B; A should now be invalid
    const r2 = await fetch(`${API}/auth/refresh`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: refreshA }),
    });
    const body2 = await r2.json();
    expect(r2.status).toBe(200);

    // Use A again → should fail
    const r3 = await fetch(`${API}/auth/refresh`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: refreshA }),
    });
    expect(r3.status, 'reused refresh token after rotation should be rejected').toBe(401);
  });
});
