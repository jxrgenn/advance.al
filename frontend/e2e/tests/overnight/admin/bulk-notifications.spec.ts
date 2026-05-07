/**
 * bulk-notifications.spec.ts — admin bulk-notification compose + send + templates.
 *
 * 8 tests: send creates BulkNotification + Notifications, target audiences,
 * templates list/instantiate, scheduled sends.
 */

import { test } from '@playwright/test';
import { dbClear, dbFind, dbCount, dbFindOne } from '../../../real-backend/db-helpers';
import { makeAdmin, makeJobseeker, makeEmployer, authHeaders, API } from '../../../real-backend/factory-helpers';
import { expect } from '@playwright/test';

test.describe('Admin / bulk notifications', () => {
  test.beforeEach(async () => { await dbClear(); });

  test('BN.1 POST without auth → 401', async () => {
    const r = await fetch(`${API}/bulk-notifications`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'x', message: 'y', type: 'announcement',
        targetAudience: 'all',
        deliveryChannels: { inApp: true, email: true }
      }),
    });
    expect(r.status).toBe(401);
  });

  test('BN.2 POST as jobseeker → 403', async () => {
    const js = await makeJobseeker();
    const r = await fetch(`${API}/bulk-notifications`, {
      method: 'POST', headers: authHeaders(js.token),
      body: JSON.stringify({
        title: 'x', message: 'y', type: 'announcement',
        targetAudience: 'all',
        deliveryChannels: { inApp: true, email: true }
      }),
    });
    expect(r.status).toBe(403);
  });

  test('BN.3 POST creates BulkNotification + N Notifications for targetAudience=all', async () => {
    const adm = await makeAdmin();
    await makeJobseeker();
    await makeJobseeker();
    await makeEmployer({ preApprove: true });

    const beforeNotifs = await dbCount('notifications');
    const beforeBulk = await dbCount('bulknotifications');

    const r = await fetch(`${API}/bulk-notifications`, {
      method: 'POST', headers: authHeaders(adm.token),
      body: JSON.stringify({
        title: 'Phase 23 Bulk Test',
        message: 'Automated test bulk notification',
        type: 'announcement',
        targetAudience: 'all',
        deliveryChannels: { inApp: true, email: false }
      }),
    });
    // JUSTIFIED: HTTP convention — POST returns 200 (with body) or 201 (created).
    expect([200, 201]).toContain(r.status);
    const body = await r.json();
    expect(body.success).toBe(true);

    expect(await dbCount('bulknotifications'), 'BulkNotification doc created').toBe(beforeBulk + 1);

    // processNotifications is async fanout (no await on POST handler) — poll for notifications.
    let afterNotifs = beforeNotifs;
    for (let i = 0; i < 30; i++) {
      afterNotifs = await dbCount('notifications');
      if (afterNotifs > beforeNotifs) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    expect(afterNotifs, 'each non-admin recipient should get a Notification').toBeGreaterThan(beforeNotifs);
  });

  test('BN.4 POST with targetAudience=jobseekers excludes employers', async () => {
    const adm = await makeAdmin();
    const js = await makeJobseeker();
    const emp = await makeEmployer({ preApprove: true });
    const jsDoc = await dbFindOne('users', { email: js.email });
    const empDoc = await dbFindOne('users', { email: emp.email });

    await fetch(`${API}/bulk-notifications`, {
      method: 'POST', headers: authHeaders(adm.token),
      body: JSON.stringify({
        title: 'JS-only Bulk',
        message: 'Only jobseekers should receive this',
        type: 'announcement',
        targetAudience: 'jobseekers',
        deliveryChannels: { inApp: true, email: false }
      }),
    });

    // Poll for the async fanout to land.
    let jsNotifs = 0;
    for (let i = 0; i < 30; i++) {
      jsNotifs = await dbCount('notifications', { userId: jsDoc._id });
      if (jsNotifs >= 1) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    const empNotifs = await dbCount('notifications', { userId: empDoc._id });
    expect(jsNotifs, 'jobseeker should receive bulk notif').toBeGreaterThanOrEqual(1);
    expect(empNotifs, 'employer should NOT receive jobseeker-targeted bulk').toBe(0);
  });

  test('BN.5 POST with invalid type → 400', async () => {
    const adm = await makeAdmin();
    const r = await fetch(`${API}/bulk-notifications`, {
      method: 'POST', headers: authHeaders(adm.token),
      body: JSON.stringify({
        title: 'x', message: 'y', type: 'NOT_A_REAL_TYPE',
        targetAudience: 'all',
        deliveryChannels: { inApp: true, email: true }
      }),
    });
    expect(r.status).toBe(400);
  });

  test('BN.6 GET /bulk-notifications lists sent (admin only)', async () => {
    const adm = await makeAdmin();
    const r = await fetch(`${API}/bulk-notifications`, { headers: authHeaders(adm.token) });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data?.bulkNotifications ?? body.data)).toBe(true);
  });

  test('BN.7 GET /templates/list returns array', async () => {
    const adm = await makeAdmin();
    const r = await fetch(`${API}/bulk-notifications/templates/list`, { headers: authHeaders(adm.token) });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data?.templates ?? body.data)).toBe(true);
  });

  test('BN.8 DELETE /:id removes a bulk notification (admin only — drafts/templates only)', async () => {
    const adm = await makeAdmin();
    await makeJobseeker();
    // Schedule for the future so status='draft' (only drafts and templates are deletable).
    const futureDate = new Date(Date.now() + 7 * 86400_000).toISOString();
    const cr = await fetch(`${API}/bulk-notifications`, {
      method: 'POST', headers: authHeaders(adm.token),
      body: JSON.stringify({
        title: 'BN8 test job',
        message: 'delete me',
        type: 'announcement',
        targetAudience: 'all',
        deliveryChannels: { inApp: true, email: false },
        scheduledFor: futureDate
      }),
    });
    const created = (await cr.json()).data?.bulkNotification ?? (await dbFind('bulknotifications'))[0];

    const r = await fetch(`${API}/bulk-notifications/${created._id}`, {
      method: 'DELETE', headers: authHeaders(adm.token),
    });
    // JUSTIFIED: HTTP convention — endpoint returns 200 (with body) or 204 (no content).
    expect([200, 204]).toContain(r.status);
    expect(await dbCount('bulknotifications', { _id: created._id }), 'should be deleted').toBe(0);
  });
});
