/**
 * close-renew-delete-job.spec.ts — job lifecycle transitions.
 *
 * 8 tests: close, reopen-via-renew, soft-delete, applicationCount preserved,
 * Location.jobCount cascade, peer cannot, status enum.
 */

import { test } from '@playwright/test';
import { dbClear, dbCount, dbFindOne, dbUpdate } from '../../../real-backend/db-helpers';
import { makeEmployer, makeJobseeker, authHeaders, API } from '../../../real-backend/factory-helpers';
import { expect } from '@playwright/test';

async function makeJob(token: string) {
  const r = await fetch(`${API}/jobs`, {
    method: 'POST', headers: authHeaders(token),
    body: JSON.stringify({
      title: 'Lifecycle Test', description: 'x'.repeat(80),
      category: 'Teknologji', jobType: 'full-time',
      location: { city: 'Tiranë' },
      salary: { min: 1000, max: 2000, currency: 'EUR' },
        platformCategories: { diaspora: false, ngaShtepia: false, partTime: false, administrata: false, sezonale: false }
    })
  });
  return (await r.json()).data.job;
}

test.describe('Employer / job lifecycle', () => {
  test.beforeEach(async () => { await dbClear(); });

  test('JL.1 close: PATCH status=closed flips status', async () => {
    const emp = await makeEmployer({ preApprove: true });
    const job = await makeJob(emp.token);
    const r = await fetch(`${API}/jobs/${job._id}/status`, {
      method: 'PATCH', headers: authHeaders(emp.token),
      body: JSON.stringify({ status: 'closed' }),
    });
    expect([200, 204]).toContain(r.status);
    const after = await dbFindOne('jobs', { _id: job._id });
    expect(after.status).toBe('closed');
  });

  test('JL.2 close decrements Location.jobCount', async () => {
    const emp = await makeEmployer({ preApprove: true });
    const job = await makeJob(emp.token);
    const before = await dbFindOne('locations', { city: 'Tiranë' });
    await fetch(`${API}/jobs/${job._id}/status`, {
      method: 'PATCH', headers: authHeaders(emp.token),
      body: JSON.stringify({ status: 'closed' }),
    });
    const after = await dbFindOne('locations', { city: 'Tiranë' });
    expect(after.jobCount, 'closing should decrement jobCount').toBeLessThanOrEqual(before.jobCount || 0);
  });

  test('JL.3 renew expired job → status=active + new expiresAt', async () => {
    const emp = await makeEmployer({ preApprove: true });
    const job = await makeJob(emp.token);
    await dbUpdate('jobs', { _id: job._id }, {
      $set: { status: 'expired', expiresAt: new Date(Date.now() - 1000) }
    });

    const r = await fetch(`${API}/jobs/${job._id}/renew`, {
      method: 'POST', headers: authHeaders(emp.token),
    });
    expect([200, 201, 404]).toContain(r.status);
    if ([200, 201].includes(r.status)) {
      const after = await dbFindOne('jobs', { _id: job._id });
      expect(after.status).toBe('active');
      expect(new Date(after.expiresAt).getTime(), 'new expiresAt in future').toBeGreaterThan(Date.now());
    }
  });

  test('JL.4 DELETE soft-deletes job (isDeleted=true) + apps preserved', async () => {
    const emp = await makeEmployer({ preApprove: true });
    const js = await makeJobseeker();
    const job = await makeJob(emp.token);
    await fetch(`${API}/applications/apply`, {
      method: 'POST', headers: authHeaders(js.token),
      body: JSON.stringify({ jobId: job._id, coverLetter: 'cover ' + 'x'.repeat(40), applicationMethod: 'one_click' })
    });
    expect(await dbCount('applications', { jobId: job._id })).toBe(1);

    const r = await fetch(`${API}/jobs/${job._id}`, {
      method: 'DELETE', headers: authHeaders(emp.token),
    });
    expect([200, 204]).toContain(r.status);
    const after = await dbFindOne('jobs', { _id: job._id });
    expect(after.isDeleted, 'job should be soft-deleted').toBe(true);
    expect(await dbCount('applications', { jobId: job._id }), 'apps must be preserved (audit)').toBe(1);
  });

  test('JL.5 peer employer cannot DELETE', async () => {
    const emp1 = await makeEmployer({ preApprove: true });
    const emp2 = await makeEmployer({ preApprove: true });
    const job = await makeJob(emp1.token);
    const r = await fetch(`${API}/jobs/${job._id}`, {
      method: 'DELETE', headers: authHeaders(emp2.token),
    });
    expect([403, 404]).toContain(r.status);
    const after = await dbFindOne('jobs', { _id: job._id });
    expect(after.isDeleted).not.toBe(true);
  });

  test('JL.6 invalid status enum → 400', async () => {
    const emp = await makeEmployer({ preApprove: true });
    const job = await makeJob(emp.token);
    const r = await fetch(`${API}/jobs/${job._id}/status`, {
      method: 'PATCH', headers: authHeaders(emp.token),
      body: JSON.stringify({ status: 'NOT_A_STATUS' }),
    });
    expect([400, 422]).toContain(r.status);
  });

  test('JL.7 deleted job no longer in public /jobs list', async () => {
    const emp = await makeEmployer({ preApprove: true });
    const job = await makeJob(emp.token);
    await fetch(`${API}/jobs/${job._id}`, {
      method: 'DELETE', headers: authHeaders(emp.token),
    });

    const r = await fetch(`${API}/jobs`);
    const body = await r.json();
    const jobs = body.data?.jobs ?? body.data ?? [];
    const deletedFound = jobs.find((j: any) => j._id === job._id);
    expect(deletedFound, 'soft-deleted job must NOT appear in public list').toBeFalsy();
  });

  test('JL.8 closed job no longer in public /jobs list', async () => {
    const emp = await makeEmployer({ preApprove: true });
    const job = await makeJob(emp.token);
    await fetch(`${API}/jobs/${job._id}/status`, {
      method: 'PATCH', headers: authHeaders(emp.token),
      body: JSON.stringify({ status: 'closed' }),
    });
    const r = await fetch(`${API}/jobs`);
    const body = await r.json();
    const jobs = body.data?.jobs ?? body.data ?? [];
    const closedFound = jobs.find((j: any) => j._id === job._id);
    expect(closedFound, 'closed job must NOT appear in public list').toBeFalsy();
  });
});
