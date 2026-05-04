/**
 * applicants-message.spec.ts — employer/jobseeker message thread.
 *
 * 8 tests: 4 message types (text, interview_invite, offer, rejection),
 * bidirectional, length limits, sanitization, ownership.
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

test.describe('Employer / applicant messages', () => {
  test.beforeEach(async () => { await dbClear(); });

  test('AM.1 text message from employer persists in app.messages', async () => {
    const { emp, app } = await setup();
    const r = await fetch(`${API}/applications/${app._id}/message`, {
      method: 'POST', headers: authHeaders(emp.token),
      body: JSON.stringify({ message: 'Hello, interested in interview?', messageType: 'text' })
    });
    expect([200, 201]).toContain(r.status);

    const after = await dbFindOne('applications', { _id: app._id });
    expect((after.messages || []).length).toBeGreaterThanOrEqual(1);
    expect(after.messages[after.messages.length - 1].message).toBe('Hello, interested in interview?');
  });

  test('AM.2 interview_invite messageType', async () => {
    const { emp, app } = await setup();
    const r = await fetch(`${API}/applications/${app._id}/message`, {
      method: 'POST', headers: authHeaders(emp.token),
      body: JSON.stringify({
        message: 'Interview at our office on Monday at 10am',
        messageType: 'interview_invite'
      })
    });
    expect([200, 201]).toContain(r.status);
  });

  test('AM.3 offer messageType', async () => {
    const { emp, app } = await setup();
    const r = await fetch(`${API}/applications/${app._id}/message`, {
      method: 'POST', headers: authHeaders(emp.token),
      body: JSON.stringify({
        message: 'We would like to offer you the position with a salary of 2000 EUR/month',
        messageType: 'offer'
      })
    });
    expect([200, 201]).toContain(r.status);
  });

  test('AM.4 rejection messageType', async () => {
    const { emp, app } = await setup();
    const r = await fetch(`${API}/applications/${app._id}/message`, {
      method: 'POST', headers: authHeaders(emp.token),
      body: JSON.stringify({
        message: 'Thank you, but we have selected another candidate',
        messageType: 'rejection'
      })
    });
    expect([200, 201]).toContain(r.status);
  });

  test('AM.5 jobseeker can reply to employer thread', async () => {
    const { emp, js, app } = await setup();
    await fetch(`${API}/applications/${app._id}/message`, {
      method: 'POST', headers: authHeaders(emp.token),
      body: JSON.stringify({ message: 'Are you available?', messageType: 'text' })
    });
    const r = await fetch(`${API}/applications/${app._id}/message`, {
      method: 'POST', headers: authHeaders(js.token),
      body: JSON.stringify({ message: 'Yes, available', messageType: 'text' })
    });
    expect([200, 201]).toContain(r.status);

    const after = await dbFindOne('applications', { _id: app._id });
    expect((after.messages || []).length).toBeGreaterThanOrEqual(2);
  });

  test('AM.6 unrelated employer cannot post to this thread', async () => {
    const { app } = await setup();
    const otherEmp = await makeEmployer({ preApprove: true });
    const r = await fetch(`${API}/applications/${app._id}/message`, {
      method: 'POST', headers: authHeaders(otherEmp.token),
      body: JSON.stringify({ message: 'I should not see this', messageType: 'text' })
    });
    expect([403, 404]).toContain(r.status);
  });

  test('AM.7 empty message body → 400', async () => {
    const { emp, app } = await setup();
    const r = await fetch(`${API}/applications/${app._id}/message`, {
      method: 'POST', headers: authHeaders(emp.token),
      body: JSON.stringify({ message: '', messageType: 'text' })
    });
    expect(r.status).toBe(400);
  });

  test('AM.8 5000+ char message rejected', async () => {
    const { emp, app } = await setup();
    const r = await fetch(`${API}/applications/${app._id}/message`, {
      method: 'POST', headers: authHeaders(emp.token),
      body: JSON.stringify({ message: 'x'.repeat(5001), messageType: 'text' })
    });
    expect([400, 413]).toContain(r.status);
  });
});
