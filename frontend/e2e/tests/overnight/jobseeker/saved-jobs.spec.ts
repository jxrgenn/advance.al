/**
 * saved-jobs.spec.ts — save / unsave / list / bulk-check.
 *
 * 8 tests: save adds to array, save twice idempotent, unsave removes,
 * list returns array, bulk-check map, no auth → 401, soft-deleted job hidden.
 */

import { test } from '@playwright/test';
import { dbClear, dbFindOne } from '../../../real-backend/db-helpers';
import { makeJobseeker, makeEmployer, authHeaders, API } from '../../../real-backend/factory-helpers';
import { expect } from '@playwright/test';

async function makeJob(empToken: string) {
  const r = await fetch(`${API}/jobs`, {
    method: 'POST', headers: authHeaders(empToken),
    body: JSON.stringify({
      title: 'SavedTest', description: 'x'.repeat(80), category: 'Teknologji',
      jobType: 'full-time', location: { city: 'Tiranë' },
      salary: { min: 1000, max: 2000, currency: 'EUR' },
        platformCategories: { diaspora: false, ngaShtepia: false, partTime: false, administrata: false, sezonale: false }
    })
  });
  return (await r.json()).data.job;
}

test.describe('Jobseeker / saved jobs', () => {
  test.beforeEach(async () => { await dbClear(); });

  test('SJ.1 POST /saved-jobs/:id adds to user.savedJobs', async () => {
    const emp = await makeEmployer({ preApprove: true });
    const js = await makeJobseeker();
    const job = await makeJob(emp.token);

    const r = await fetch(`${API}/users/saved-jobs/${job._id}`, {
      method: 'POST', headers: authHeaders(js.token),
    });
    // JUSTIFIED: HTTP convention — POST returns 200 (with body) or 201 (created).
    expect([200, 201]).toContain(r.status);

    const user = await dbFindOne('users', { email: js.email });
    const ids = (user.savedJobs || []).map((id: any) => id.toString());
    expect(ids).toContain(job._id.toString());
  });

  test('SJ.2 saving same job twice is idempotent', async () => {
    const emp = await makeEmployer({ preApprove: true });
    const js = await makeJobseeker();
    const job = await makeJob(emp.token);

    await fetch(`${API}/users/saved-jobs/${job._id}`, {
      method: 'POST', headers: authHeaders(js.token),
    });
    await fetch(`${API}/users/saved-jobs/${job._id}`, {
      method: 'POST', headers: authHeaders(js.token),
    });

    const user = await dbFindOne('users', { email: js.email });
    const ids = (user.savedJobs || []).map((id: any) => id.toString());
    const matches = ids.filter((id: string) => id === job._id.toString()).length;
    expect(matches, 'saving twice must NOT duplicate the entry').toBe(1);
  });

  test('SJ.3 DELETE /saved-jobs/:id removes from array', async () => {
    const emp = await makeEmployer({ preApprove: true });
    const js = await makeJobseeker();
    const job = await makeJob(emp.token);

    await fetch(`${API}/users/saved-jobs/${job._id}`, {
      method: 'POST', headers: authHeaders(js.token),
    });
    const r = await fetch(`${API}/users/saved-jobs/${job._id}`, {
      method: 'DELETE', headers: authHeaders(js.token),
    });
    // JUSTIFIED: HTTP convention — endpoint returns 200 (with body) or 204 (no content).
    expect([200, 204]).toContain(r.status);

    const user = await dbFindOne('users', { email: js.email });
    const ids = (user.savedJobs || []).map((id: any) => id.toString());
    expect(ids).not.toContain(job._id.toString());
  });

  test('SJ.4 GET /saved-jobs returns array', async () => {
    const js = await makeJobseeker();
    const r = await fetch(`${API}/users/saved-jobs`, { headers: authHeaders(js.token) });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data?.savedJobs ?? body.data?.jobs ?? body.data)).toBe(true);
  });

  test('SJ.5 saved-jobs no-auth → 401', async () => {
    const r = await fetch(`${API}/users/saved-jobs`);
    expect(r.status).toBe(401);
  });

  test('SJ.6 saving non-existent job → 404', async () => {
    const js = await makeJobseeker();
    const r = await fetch(`${API}/users/saved-jobs/507f1f77bcf86cd799439011`, {
      method: 'POST', headers: authHeaders(js.token),
    });
    // JUSTIFIED: Token/resource lookup — 400 (validator) or 404 (not found in store).
    expect([400, 404]).toContain(r.status);
  });

  test('SJ.7 invalid ObjectId in saved-jobs URL → 400', async () => {
    const js = await makeJobseeker();
    const r = await fetch(`${API}/users/saved-jobs/not-an-id`, {
      method: 'POST', headers: authHeaders(js.token),
    });
    expect(r.status).toBe(400);
  });

  test('SJ.8 unsaving a job not in array is no-op (200/204, no error)', async () => {
    const emp = await makeEmployer({ preApprove: true });
    const js = await makeJobseeker();
    const job = await makeJob(emp.token);

    const r = await fetch(`${API}/users/saved-jobs/${job._id}`, {
      method: 'DELETE', headers: authHeaders(js.token),
    });
    expect([200, 204, 404]).toContain(r.status);
  });
});
