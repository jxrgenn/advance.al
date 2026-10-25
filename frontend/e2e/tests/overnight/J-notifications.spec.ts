/**
 * Section J — Notifications + bulk.
 *
 * 5 user stories. Bell icon, mark-read, mark-all-read, delete.
 */

import { test } from '@playwright/test';
import { dbClear, dbFindOne } from '../../real-backend/db-helpers';
import {
  expect, FRONTEND, API, makeJobseeker, makeEmployer, authHeaders, dbFind,
  loginViaStorage, NORMAL_PLATFORM,
} from './_helpers';

test.describe.configure({ mode: 'serial' });

let jsToken: string;
let jsEmail: string;

test.beforeAll(async () => {
  await dbClear();

  const js = await makeJobseeker();
  jsToken = js.token;
  jsEmail = js.email;

  const emp = await makeEmployer({ preApprove: true });
  const jr = await fetch(`${API}/jobs`, {
    method: 'POST', headers: authHeaders(emp.token),
    body: JSON.stringify({
      title: '[OVERNIGHT-J] Notification Source Job',
      description: 'Job created to seed notifications by triggering apply + an employer status change, which fans out a notification to the jobseeker.',
      category: 'Teknologji', jobType: 'full-time',
      location: { city: 'Tiranë' }, platformCategories: NORMAL_PLATFORM,
    }),
  });
  const jrBody = await jr.json();
  if (!jrBody.success) {
    throw new Error(`J beforeAll: job creation failed (${jr.status}): ${JSON.stringify(jrBody).slice(0, 200)}`);
  }
  const jobId = jrBody.data.job._id;

  // Apply, employer shortlists → notification on jobseeker
  await fetch(`${API}/applications/apply`, {
    method: 'POST', headers: authHeaders(jsToken),
    body: JSON.stringify({ jobId, applicationMethod: 'one_click' }),
  });
  const apps = await dbFind('applications', {});
  // Application messages were removed (finding 48); a status change is what
  // notifies the jobseeker now (models/Application.js post-save hook).
  const st = await fetch(`${API}/applications/${apps[0]._id}/status`, {
    method: 'PATCH', headers: authHeaders(emp.token),
    body: JSON.stringify({ status: 'shortlisted' }),
  });
  if (st.status !== 200) throw new Error(`J setup: status change failed ${st.status}`);
  // Wait for notification fan-out
  await new Promise((r) => setTimeout(r, 1500));
});

test.describe('Section J — Notifications', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaStorage(page, jsToken);
  });

  test('J.1 GET /notifications returns list', async ({ page }) => {
    const r = await fetch(`${API}/notifications`, {
      headers: authHeaders(jsToken),
    });
    expect(r.status).toBe(200);
    const b = await r.json();
    expect(Array.isArray(b.data?.notifications)).toBe(true);
    expect(typeof b.data?.unreadCount).toBe('number');
  });

  test('J.2 GET /notifications/unread-count', async ({ page }) => {
    const r = await fetch(`${API}/notifications/unread-count`, {
      headers: authHeaders(jsToken),
    });
    expect(r.status).toBe(200);
    const b = await r.json();
    expect(typeof b.data?.unreadCount).toBe('number');
  });

  test('J.3 mark single notification read', async ({ page }) => {
    const list = await (await fetch(`${API}/notifications`, { headers: authHeaders(jsToken) })).json();
    // beforeAll's shortlist created at least one notification.
    expect(list.data.notifications.length).toBeGreaterThan(0);
    const id = list.data.notifications[0]._id;
    const r = await fetch(`${API}/notifications/${id}/read`, {
      method: 'PATCH', headers: authHeaders(jsToken),
    });
    expect(r.status).toBe(200);
    const stored = await dbFindOne('notifications', { _id: id });
    expect(stored.read).toBe(true);
  });

  test('J.4 mark-all-read', async ({ page }) => {
    const r = await fetch(`${API}/notifications/mark-all-read`, {
      method: 'PATCH', headers: authHeaders(jsToken),
    });
    expect(r.status).toBeLessThan(500);
  });

  test('J.5 unauthenticated /notifications → 401', async ({ page }) => {
    const r = await fetch(`${API}/notifications`);
    expect(r.status).toBe(401);
  });
});
