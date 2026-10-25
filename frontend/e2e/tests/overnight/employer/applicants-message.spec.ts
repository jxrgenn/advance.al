/**
 * applicants-message.spec.ts — the application message thread is GONE.
 *
 * POST /api/applications/:id/message was removed (finding 48, 2026-10-22):
 * no screen could send or read messages, yet the endpoint let either party
 * e-mail the other through the platform. These tests pin the removal: the
 * route 404s for both parties and nothing is written to application.messages.
 */

import { test } from '@playwright/test';
import { dbClear, dbFind, dbFindOne } from '../../../real-backend/db-helpers';
import { makeJobseeker, makeEmployer, authHeaders, API } from '../../../real-backend/factory-helpers';
import { expect } from '@playwright/test';

async function setup() {
  const emp = await makeEmployer({ preApprove: true });
  const js = await makeJobseeker();
  const jr = await fetch(`${API}/jobs`, {
    method: 'POST', headers: authHeaders(emp.token),
    body: JSON.stringify({
      title: 'Msg-Test', description: 'x'.repeat(80), category: 'Teknologji',
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
  return { emp, js, app };
}

test.describe('Employer / applicant messages (removed endpoint)', () => {
  test.beforeEach(async () => { await dbClear(); });

  for (const who of ['employer', 'jobseeker'] as const) {
    test(`AM.1 ${who} POST /applications/:id/message → 404, nothing persisted`, async () => {
      const { emp, js, app } = await setup();
      const token = who === 'employer' ? emp.token : js.token;
      const r = await fetch(`${API}/applications/${app._id}/message`, {
        method: 'POST', headers: authHeaders(token),
        body: JSON.stringify({ message: 'Hello, interested in interview?', messageType: 'text' })
      });
      expect(r.status).toBe(404);
      const after = await dbFindOne('applications', { _id: app._id });
      expect(after.messages ?? []).toEqual([]);
    });
  }
});
