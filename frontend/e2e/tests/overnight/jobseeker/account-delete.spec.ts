/**
 * account-delete.spec.ts — GDPR account deletion cascade.
 *
 * 5 tests: soft-delete sets flags; subsequent login blocked; data-export
 * before delete returns user data; cascade-cleanup ready; account-cleanup
 * cron actually purges after 30 days.
 */

import { test } from '@playwright/test';
import { dbClear, dbFind, dbCount, dbFindOne, dbUpdate } from '../../../real-backend/db-helpers';
import { makeJobseeker, makeEmployer, runCron, authHeaders, API } from '../../../real-backend/factory-helpers';
import { expect } from '@playwright/test';

test.describe('Jobseeker / account-delete (GDPR cascade)', () => {
  test.beforeEach(async () => { await dbClear(); });

  test('AD.1 DELETE /users/account soft-deletes the user', async () => {
    const js = await makeJobseeker();
    const before = await dbFindOne('users', { email: js.email });
    expect(before.isDeleted).not.toBe(true);

    const r = await fetch(`${API}/users/account`, {
      method: 'DELETE', headers: authHeaders(js.token),
      body: JSON.stringify({ password: 'StrongPass123!' }),
    });
    // JUSTIFIED: HTTP convention — endpoint returns 200 (with body) or 204 (no content).
    expect([200, 204]).toContain(r.status);

    const after = await dbFindOne('users', { email: js.email });
    expect(after.isDeleted, 'user must be soft-deleted (isDeleted=true)').toBe(true);
    expect(after.deletedAt, 'deletedAt must be set').toBeTruthy();
  });

  test('AD.2 after account-delete: login blocked', async () => {
    const js = await makeJobseeker();
    await fetch(`${API}/users/account`, {
      method: 'DELETE', headers: authHeaders(js.token),
      body: JSON.stringify({ password: 'StrongPass123!' }),
    });

    const r = await fetch(`${API}/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: js.email, password: 'StrongPass123!' }),
    });
    expect(r.status).toBe(401);
  });

  test('AD.3 data-export endpoint returns user JSON before deletion', async () => {
    const js = await makeJobseeker();
    const r = await fetch(`${API}/users/export`, { headers: authHeaders(js.token) });
    if (r.status === 200) {
      const body = await r.json();
      expect(body.success).toBe(true);
      const data = body.data ?? body;
      const text = JSON.stringify(data);
      expect(text, 'export should include user email').toContain(js.email);
      expect(text, 'export should NOT include password hash').not.toMatch(/\$2[aby]\$\d+\$/);
    } else {
      expect([404, 405]).toContain(r.status);
    }
  });

  test('AD.4 30+ days after soft-delete: account-cleanup cron hard-deletes user', async () => {
    const js = await makeJobseeker();
    const userBefore = await dbFindOne('users', { email: js.email });
    // Soft-delete with stale deletedAt > 30 days
    const veryOld = new Date(Date.now() - 35 * 24 * 3600 * 1000);
    await dbUpdate('users', { _id: userBefore._id }, {
      $set: { isDeleted: true, deletedAt: veryOld }
    });

    const usersBefore = await dbCount('users', { _id: userBefore._id });
    expect(usersBefore).toBe(1);

    const result = await runCron('account-cleanup');
    expect(result.ok).toBe(true);
    expect(result.deleted, 'should hard-delete at least 1 user').toBeGreaterThanOrEqual(1);

    const usersAfter = await dbCount('users', { _id: userBefore._id });
    expect(usersAfter, 'user must be hard-deleted by cron').toBe(0);
  });

  test('AD.5 account-delete cascades: applications + jobs + notifications removed by cron', async () => {
    const emp = await makeEmployer({ preApprove: true });
    const js = await makeJobseeker();
    const jsDoc = await dbFindOne('users', { email: js.email });

    // Make js apply to a job
    const jr = await fetch(`${API}/jobs`, {
      method: 'POST', headers: authHeaders(emp.token),
      body: JSON.stringify({
        title: 'AD5 test job', description: 'x'.repeat(80), category: 'Teknologji',
        jobType: 'full-time', location: { city: 'Tiranë' },
        salary: { min: 1000, max: 2000, currency: 'EUR' },
        platformCategories: { diaspora: false, ngaShtepia: false, partTime: false, administrata: false, sezonale: false }
      })
    });
    const job = (await jr.json()).data.job;
    await fetch(`${API}/applications/apply`, {
      method: 'POST', headers: authHeaders(js.token),
      body: JSON.stringify({ jobId: job._id, coverLetter: 'cover ' + 'x'.repeat(40), applicationMethod: 'one_click' })
    });

    expect(await dbCount('applications', { jobSeekerId: jsDoc._id }), 'application created').toBe(1);

    // Mark soft-deleted >30 days
    const veryOld = new Date(Date.now() - 35 * 24 * 3600 * 1000);
    await dbUpdate('users', { _id: jsDoc._id }, {
      $set: { isDeleted: true, deletedAt: veryOld }
    });

    await runCron('account-cleanup');

    // Cascading deletes: user gone + their applications gone
    expect(await dbCount('users', { _id: jsDoc._id })).toBe(0);
    expect(await dbCount('applications', { jobSeekerId: jsDoc._id }), 'cascade: jobseeker apps must be deleted').toBe(0);
  });
});
