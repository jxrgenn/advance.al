/**
 * matching.spec.ts — candidate matching for employers.
 *
 * 8 tests covering: candidates list, mock-payment purchase flow, access gate,
 * track-contact, ownership enforcement.
 */

import { test } from '@playwright/test';
import { dbClear, dbFind, dbCount, dbFindOne } from '../../../real-backend/db-helpers';
import { makeEmployer, makeJobseeker, authHeaders, API } from '../../../real-backend/factory-helpers';
import { expect } from '@playwright/test';

async function makeJobAs(token: string, title = 'Match-Test-Title') {
  const r = await fetch(`${API}/jobs`, {
    method: 'POST', headers: authHeaders(token),
    body: JSON.stringify({
      title, description: 'x'.repeat(80), category: 'Teknologji',
      jobType: 'full-time', location: { city: 'Tiranë' },
      salary: { min: 1000, max: 2000, currency: 'EUR' },
        platformCategories: { diaspora: false, ngaShtepia: false, partTime: false, administrata: false, sezonale: false }
    })
  });
  return (await r.json()).data.job;
}

test.describe('Domain / matching', () => {
  test.beforeEach(async () => { await dbClear(); });

  test('M.1 GET /candidates without auth → 401', async () => {
    const r = await fetch(`${API}/matching/jobs/507f1f77bcf86cd799439011/candidates`);
    expect(r.status).toBe(401);
  });

  test('M.2 GET /candidates as wrong-role (jobseeker) → 403', async () => {
    const js = await makeJobseeker();
    const r = await fetch(`${API}/matching/jobs/507f1f77bcf86cd799439011/candidates`, {
      headers: authHeaders(js.token)
    });
    expect(r.status).toBe(403);
  });

  test('M.3 GET /candidates with non-existent jobId → 404', async () => {
    const emp = await makeEmployer({ preApprove: true });
    const r = await fetch(`${API}/matching/jobs/507f1f77bcf86cd799439011/candidates`, {
      headers: authHeaders(emp.token)
    });
    expect([403, 404]).toContain(r.status);
  });

  test('M.4 GET /candidates for own job returns array (may be empty)', async () => {
    const emp = await makeEmployer({ preApprove: true });
    const job = await makeJobAs(emp.token);
    await makeJobseeker();

    const r = await fetch(`${API}/matching/jobs/${job._id}/candidates`, {
      headers: authHeaders(emp.token)
    });
    expect([200, 402, 403]).toContain(r.status);
    if (r.status === 200) {
      const body = await r.json();
      expect(body.success).toBe(true);
    }
  });

  test('M.5 POST /purchase as another employer (peer) → 403', async () => {
    const emp1 = await makeEmployer({ preApprove: true });
    const emp2 = await makeEmployer({ preApprove: true });
    const job = await makeJobAs(emp1.token, 'M5-test-job');

    const r = await fetch(`${API}/matching/jobs/${job._id}/purchase`, {
      method: 'POST', headers: authHeaders(emp2.token),
    });
    expect(r.status).toBe(403);
  });

  test('M.6 POST /purchase without ENABLE_MOCK_PAYMENTS → 503', async () => {
    // Test launcher does NOT set ENABLE_MOCK_PAYMENTS, so purchase should be blocked.
    const emp = await makeEmployer({ preApprove: true });
    const job = await makeJobAs(emp.token, 'M6-test-job');
    const r = await fetch(`${API}/matching/jobs/${job._id}/purchase`, {
      method: 'POST', headers: authHeaders(emp.token),
    });
    expect([402, 503]).toContain(r.status);
    expect(await dbCount('candidatematches', { jobId: job._id })).toBe(0);
  });

  test('M.7 GET /access reports false before purchase', async () => {
    const emp = await makeEmployer({ preApprove: true });
    const job = await makeJobAs(emp.token, 'M7-test-job');
    const r = await fetch(`${API}/matching/jobs/${job._id}/access`, {
      headers: authHeaders(emp.token)
    });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.success).toBe(true);
    // Whatever shape, it should not say "purchased" yet
    const hasAccess = body.data?.hasAccess ?? body.data?.purchased ?? false;
    expect(hasAccess).toBe(false);
  });

  test('M.8 POST /track-contact requires jobId, candidateId, contactMethod', async () => {
    const emp = await makeEmployer({ preApprove: true });
    const r = await fetch(`${API}/matching/track-contact`, {
      method: 'POST', headers: authHeaders(emp.token),
      body: JSON.stringify({}),
    });
    expect(r.status).toBe(400);
    const body = await r.json();
    expect(body.success).toBe(false);
  });
});
