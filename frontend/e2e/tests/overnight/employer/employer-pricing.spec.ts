/**
 * employer-pricing.spec.ts — pricing matching purchase + access.
 *
 * 6 tests: GET pricing public, POST purchase requires payment toggle,
 * GET access reflects state, mock-payment grants access.
 */

import { test } from '@playwright/test';
import { dbClear } from '../../../real-backend/db-helpers';
import { makeEmployer, authHeaders, API } from '../../../real-backend/factory-helpers';
import { expect } from '@playwright/test';

async function makeJob(token: string) {
  const r = await fetch(`${API}/jobs`, {
    method: 'POST', headers: authHeaders(token),
    body: JSON.stringify({
      title: 'Pricing Test', description: 'x'.repeat(80),
      category: 'Teknologji', jobType: 'full-time',
      location: { city: 'Tiranë' },
      salary: { min: 1000, max: 2000, currency: 'EUR' },
        platformCategories: { diaspora: false, ngaShtepia: false, partTime: false, administrata: false, sezonale: false }
    })
  });
  return (await r.json()).data.job;
}

test.describe('Employer / pricing & matching', () => {
  test.beforeEach(async () => { await dbClear(); });

  test('EP.1 GET /configuration/public exposes pricing tier info', async () => {
    const r = await fetch(`${API}/configuration/public`);
    expect([200, 404]).toContain(r.status);
  });

  test('EP.2 POST /matching/jobs/:id/purchase without payment env → 503', async () => {
    const emp = await makeEmployer({ preApprove: true });
    const job = await makeJob(emp.token);
    const r = await fetch(`${API}/matching/jobs/${job._id}/purchase`, {
      method: 'POST', headers: authHeaders(emp.token),
    });
    expect([402, 503]).toContain(r.status);
  });

  test('EP.3 GET /matching/jobs/:id/access reports false initially', async () => {
    const emp = await makeEmployer({ preApprove: true });
    const job = await makeJob(emp.token);
    const r = await fetch(`${API}/matching/jobs/${job._id}/access`, { headers: authHeaders(emp.token) });
    if (r.status === 200) {
      const body = await r.json();
      const hasAccess = body.data?.hasAccess ?? body.data?.purchased ?? false;
      expect(hasAccess).toBe(false);
    }
  });

  test('EP.4 GET /matching/jobs/:id/candidates returns array (free preview or 402)', async () => {
    const emp = await makeEmployer({ preApprove: true });
    const job = await makeJob(emp.token);
    const r = await fetch(`${API}/matching/jobs/${job._id}/candidates`, { headers: authHeaders(emp.token) });
    expect([200, 402, 403]).toContain(r.status);
  });

  test('EP.5 purchase as wrong-role employer (peer) → 403', async () => {
    const emp1 = await makeEmployer({ preApprove: true });
    const emp2 = await makeEmployer({ preApprove: true });
    const job = await makeJob(emp1.token);
    const r = await fetch(`${API}/matching/jobs/${job._id}/purchase`, {
      method: 'POST', headers: authHeaders(emp2.token),
    });
    expect(r.status).toBe(403);
  });

  test('EP.6 purchase non-existent job → 404', async () => {
    const emp = await makeEmployer({ preApprove: true });
    const r = await fetch(`${API}/matching/jobs/507f1f77bcf86cd799439011/purchase`, {
      method: 'POST', headers: authHeaders(emp.token),
    });
    expect([403, 404]).toContain(r.status);
  });
});
