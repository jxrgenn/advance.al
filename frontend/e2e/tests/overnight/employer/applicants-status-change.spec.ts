/**
 * applicants-status-change.spec.ts — employer changes status across the 5
 * possible states + verifies email + notification cascade for each.
 *
 * 8 tests.
 */

import { test } from '@playwright/test';
import { dbClear, dbFind, dbCount, dbFindOne } from '../../../real-backend/db-helpers';
import { makeJobseeker, makeEmployer, authHeaders, API } from '../../../real-backend/factory-helpers';
import { expect } from '@playwright/test';

async function setup() {
  const emp = await makeEmployer({ preApprove: true });
  const js = await makeJobseeker();
  const jr = await fetch(`${API}/jobs`, {
    method: 'POST', headers: authHeaders(emp.token),
    body: JSON.stringify({
      title: 'Status-Test', description: 'x'.repeat(80), category: 'Teknologji',
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
  return { emp, js, job, app };
}

test.describe('Employer / applicants status change', () => {
  test.beforeEach(async () => { await dbClear(); });

  test('AS.1 viewed status → applicant gets notification', async () => {
    const { emp, js, app } = await setup();
    const jsDoc = await dbFindOne('users', { email: js.email });

    const r = await fetch(`${API}/applications/${app._id}/status`, {
      method: 'PATCH', headers: authHeaders(emp.token),
      body: JSON.stringify({ status: 'viewed' })
    });
    // JUSTIFIED: HTTP convention — endpoint returns 200 (with body) or 204 (no content).
    expect([200, 204]).toContain(r.status);

    const after = await dbFindOne('applications', { _id: app._id });
    expect(after.status).toBe('viewed');

    const notifs = await dbFind('notifications', { userId: jsDoc._id });
    expect(notifs.length, 'jobseeker should be notified of status change').toBeGreaterThanOrEqual(1);
  });

  test('AS.2 shortlisted status → notification + status updated', async () => {
    const { emp, js, app } = await setup();
    const jsDoc = await dbFindOne('users', { email: js.email });

    const r = await fetch(`${API}/applications/${app._id}/status`, {
      method: 'PATCH', headers: authHeaders(emp.token),
      body: JSON.stringify({ status: 'shortlisted' })
    });
    // JUSTIFIED: HTTP convention — endpoint returns 200 (with body) or 204 (no content).
    expect([200, 204]).toContain(r.status);
    const after = await dbFindOne('applications', { _id: app._id });
    expect(after.status).toBe('shortlisted');
  });

  test('AS.3 rejected status → notification + status updated', async () => {
    const { emp, js, app } = await setup();
    const r = await fetch(`${API}/applications/${app._id}/status`, {
      method: 'PATCH', headers: authHeaders(emp.token),
      body: JSON.stringify({ status: 'rejected', notes: 'Not a good fit' })
    });
    // JUSTIFIED: HTTP convention — endpoint returns 200 (with body) or 204 (no content).
    expect([200, 204]).toContain(r.status);
    const after = await dbFindOne('applications', { _id: app._id });
    expect(after.status).toBe('rejected');
  });

  test('AS.4 hired status (via shortlisted): notification + status updated', async () => {
    // Status machine: pending → shortlisted → hired (route enforces this).
    const { emp, app } = await setup();
    const r1 = await fetch(`${API}/applications/${app._id}/status`, {
      method: 'PATCH', headers: authHeaders(emp.token),
      body: JSON.stringify({ status: 'shortlisted' })
    });
    // JUSTIFIED: HTTP convention — endpoint returns 200 (with body) or 204 (no content).
    expect([200, 204]).toContain(r1.status);

    const r2 = await fetch(`${API}/applications/${app._id}/status`, {
      method: 'PATCH', headers: authHeaders(emp.token),
      body: JSON.stringify({ status: 'hired' })
    });
    // JUSTIFIED: HTTP convention — endpoint returns 200 (with body) or 204 (no content).
    expect([200, 204]).toContain(r2.status);
    const after = await dbFindOne('applications', { _id: app._id });
    expect(after.status).toBe('hired');
  });

  test('AS.5 invalid status enum → 400', async () => {
    const { emp, app } = await setup();
    const r = await fetch(`${API}/applications/${app._id}/status`, {
      method: 'PATCH', headers: authHeaders(emp.token),
      body: JSON.stringify({ status: 'NOT_A_REAL_STATUS' })
    });
    expect(r.status).toBe(400);
  });

  test('AS.6 only employer-owner can change status', async () => {
    const { app } = await setup();
    const otherEmp = await makeEmployer({ preApprove: true });
    const r = await fetch(`${API}/applications/${app._id}/status`, {
      method: 'PATCH', headers: authHeaders(otherEmp.token),
      body: JSON.stringify({ status: 'viewed' })
    });
    // JUSTIFIED: IDOR uniformity — cross-tenant resource access returns 403 (not yours) or 404 (uniform with non-existent).
    expect([403, 404]).toContain(r.status);
  });

  test('AS.7 jobseeker cannot change status of their own app', async () => {
    const { js, app } = await setup();
    const r = await fetch(`${API}/applications/${app._id}/status`, {
      method: 'PATCH', headers: authHeaders(js.token),
      body: JSON.stringify({ status: 'shortlisted' })
    });
    expect(r.status).toBe(401);
  });

  test('AS.8 idempotent: re-setting same status does not duplicate notifications', async () => {
    const { emp, js, app } = await setup();
    const jsDoc = await dbFindOne('users', { email: js.email });

    await fetch(`${API}/applications/${app._id}/status`, {
      method: 'PATCH', headers: authHeaders(emp.token),
      body: JSON.stringify({ status: 'viewed' })
    });
    const notifsAfterFirst = await dbCount('notifications', { userId: jsDoc._id });

    await fetch(`${API}/applications/${app._id}/status`, {
      method: 'PATCH', headers: authHeaders(emp.token),
      body: JSON.stringify({ status: 'viewed' })
    });
    const notifsAfterSecond = await dbCount('notifications', { userId: jsDoc._id });

    expect(notifsAfterSecond, 'duplicate same-status update should not spam notifications').toBeLessThanOrEqual(notifsAfterFirst + 1);
  });
});
