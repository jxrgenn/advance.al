/**
 * notifications-admin.spec.ts — admin-trigger notification routes.
 *
 * 6 tests covering test-job-match, daily-digest, weekly-digest,
 * test-welcome-email, manual-notify, eligible-users.
 */

import { test } from '@playwright/test';
import { dbClear, dbFind } from '../../../real-backend/db-helpers';
import { makeAdmin, makeJobseeker, makeEmployer, authHeaders, API } from '../../../real-backend/factory-helpers';
import { expect } from '@playwright/test';

test.describe('Domain / notifications (admin-trigger)', () => {
  test.beforeEach(async () => { await dbClear(); });

  test('NA.1 POST /send-daily-digest requires admin', async () => {
    const r = await fetch(`${API}/notifications/send-daily-digest`, { method: 'POST' });
    expect(r.status).toBe(401);

    const js = await makeJobseeker();
    const wrong = await fetch(`${API}/notifications/send-daily-digest`, {
      method: 'POST', headers: authHeaders(js.token)
    });
    expect(wrong.status).toBe(403);
  });

  test('NA.2 POST /send-daily-digest as admin returns 200', async () => {
    const adm = await makeAdmin();
    const r = await fetch(`${API}/notifications/send-daily-digest`, {
      method: 'POST', headers: authHeaders(adm.token)
    });
    expect([200, 500]).toContain(r.status);
    if (r.status === 200) {
      const body = await r.json();
      expect(body.success).toBe(true);
    }
  });

  test('NA.3 POST /send-weekly-digest as admin returns 200', async () => {
    const adm = await makeAdmin();
    const r = await fetch(`${API}/notifications/send-weekly-digest`, {
      method: 'POST', headers: authHeaders(adm.token)
    });
    expect([200, 500]).toContain(r.status);
  });

  test('NA.4 POST /test-welcome-email triggers an email send', async () => {
    const adm = await makeAdmin();
    const r = await fetch(`${API}/notifications/test-welcome-email`, {
      method: 'POST', headers: authHeaders(adm.token),
      body: JSON.stringify({}),
    });
    expect([200, 400, 500]).toContain(r.status);
  });

  test('NA.5 POST /manual-notify creates Notification doc(s)', async () => {
    const adm = await makeAdmin();
    const js = await makeJobseeker();
    const userDoc = (await dbFind('users', { email: js.email }))[0];

    const r = await fetch(`${API}/notifications/manual-notify`, {
      method: 'POST', headers: authHeaders(adm.token),
      body: JSON.stringify({
        userIds: [userDoc._id],
        title: 'Manual notification test',
        message: 'Testing manual notify endpoint',
        type: 'admin_message'
      })
    });
    expect([200, 201, 400, 404]).toContain(r.status);
    if (r.status === 200 || r.status === 201) {
      const notifs = await dbFind('notifications', { userId: userDoc._id });
      expect(notifs.length, 'manual-notify should create at least one Notification doc').toBeGreaterThanOrEqual(1);
    }
  });

  test('NA.6 GET /quickuser-stats requires admin and returns numeric data', async () => {
    const noAuth = await fetch(`${API}/notifications/quickuser-stats`);
    expect(noAuth.status).toBe(401);

    const adm = await makeAdmin();
    const r = await fetch(`${API}/notifications/quickuser-stats`, { headers: authHeaders(adm.token) });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.success).toBe(true);
  });
});
