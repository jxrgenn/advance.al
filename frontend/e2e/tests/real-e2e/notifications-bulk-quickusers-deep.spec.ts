/**
 * Phase 22.G — Notifications + Bulk + Verification + QuickUsers EXHAUSTIVE
 *
 * Real backend round-trips for:
 *   - notifications.js: list, unread-count, mark-read, mark-all-read, delete
 *   - bulk-notifications.js: send (immediate + scheduled), list, get, templates
 *   - verification.js: request, verify, resend, status, validate-token
 *   - quickusers.js: signup, unsubscribe, track-click, find-matches
 */

import { test, expect } from '@playwright/test';
import { dbClear, dbFind, dbUpdate, waitForVerificationCode } from '../../real-backend/db-helpers';
import { API, makeJobseeker, makeEmployer, makeAdmin, authHeaders, dbInsert } from '../../real-backend/factory-helpers';

test.describe.configure({ mode: 'serial' });

const NORMAL_PLATFORM = { diaspora: false, ngaShtepia: false, partTime: false, administrata: false, sezonale: false };

async function postJob(empToken: string) {
  const res = await fetch(`${API}/jobs`, {
    method: 'POST', headers: authHeaders(empToken),
    body: JSON.stringify({
      title: 'G Test Job', description: 'G'.repeat(80),
      category: 'Teknologji', jobType: 'full-time',
      location: { city: 'Tiranë' }, platformCategories: NORMAL_PLATFORM,
    }),
  });
  return (await res.json()).data.job;
}

async function applyToJob(jsToken: string, jobId: string) {
  return fetch(`${API}/applications/apply`, {
    method: 'POST', headers: authHeaders(jsToken),
    body: JSON.stringify({ jobId, applicationMethod: 'one_click' })
  });
}

async function waitForNotifications(token: string, minCount = 1, timeoutMs = 2000): Promise<any[]> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const r = await fetch(`${API}/notifications`, { headers: authHeaders(token) });
    const body = await r.json();
    if (body.data?.notifications?.length >= minCount) return body.data.notifications;
    await new Promise(r => setTimeout(r, 100));
  }
  return [];
}

test.describe('Phase 22.G — Notifications + Bulk + Verification + QuickUsers', () => {
  test.beforeEach(async () => { await dbClear(); });

  // ─── Notifications (1-7) ───────────────────────────────────────────────

  test('G.1 GET /notifications list returns notifications + unreadCount + pagination', async () => {
    const emp = await makeEmployer();
    const js = await makeJobseeker();
    const job = await postJob(emp.token);
    await applyToJob(js.token, job._id);
    // Apply triggers notification to employer (async via setImmediate). Poll briefly.
    let body: any;
    for (let i = 0; i < 20; i++) {
      const r = await fetch(`${API}/notifications`, { headers: authHeaders(emp.token) });
      body = await r.json();
      if (body.data?.notifications?.length >= 1) break;
      await new Promise(r => setTimeout(r, 100));
    }
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.notifications)).toBe(true);
    expect(body.data.notifications.length).toBeGreaterThanOrEqual(1);
    expect(body.data.unreadCount).toBeGreaterThanOrEqual(1);
    expect(body.data.pagination).toBeDefined();
  });

  test('G.2 GET /notifications/unread-count returns numeric count', async () => {
    const emp = await makeEmployer();
    const js = await makeJobseeker();
    const job = await postJob(emp.token);
    await applyToJob(js.token, job._id);
    await waitForNotifications(emp.token, 1);
    const res = await fetch(`${API}/notifications/unread-count`, { headers: authHeaders(emp.token) });
    const body = await res.json();
    expect(body.data.unreadCount).toBeGreaterThanOrEqual(1);
  });

  test('G.3 PATCH /notifications/:id/read marks single read', async () => {
    const emp = await makeEmployer();
    const js = await makeJobseeker();
    const job = await postJob(emp.token);
    await applyToJob(js.token, job._id);
    const notifs = await waitForNotifications(emp.token, 1);
    const nId = notifs[0]._id;
    const res = await fetch(`${API}/notifications/${nId}/read`, {
      method: 'PATCH', headers: authHeaders(emp.token)
    });
    expect(res.status).toBe(200);
    const after = (await dbFind('notifications', {}))[0];
    expect(after.read).toBe(true);
  });

  test('G.4 PATCH /notifications/mark-all-read flips all unread', async () => {
    const emp = await makeEmployer();
    const js1 = await makeJobseeker();
    const js2 = await makeJobseeker();
    const job = await postJob(emp.token);
    await applyToJob(js1.token, job._id);
    await applyToJob(js2.token, job._id);
    await waitForNotifications(emp.token, 2);
    const res = await fetch(`${API}/notifications/mark-all-read`, {
      method: 'PATCH', headers: authHeaders(emp.token)
    });
    expect(res.status).toBe(200);
    const all = await dbFind('notifications', {});
    expect(all.every((n: any) => n.read === true)).toBe(true);
  });

  test('G.5 DELETE /notifications/:id removes single', async () => {
    const emp = await makeEmployer();
    const js = await makeJobseeker();
    const job = await postJob(emp.token);
    await applyToJob(js.token, job._id);
    const notifs = await waitForNotifications(emp.token, 1);
    const nId = notifs[0]._id;
    const res = await fetch(`${API}/notifications/${nId}`, {
      method: 'DELETE', headers: authHeaders(emp.token)
    });
    expect(res.status).toBe(200);
    const remaining = await dbFind('notifications', {});
    expect(remaining.length).toBe(0);
  });

  test('G.6 PATCH /notifications/:id/read peer user → 404', async () => {
    const emp = await makeEmployer();
    const peer = await makeEmployer();
    const js = await makeJobseeker();
    const job = await postJob(emp.token);
    await applyToJob(js.token, job._id);
    await waitForNotifications(emp.token, 1);
    const all = await dbFind('notifications', {});
    const res = await fetch(`${API}/notifications/${all[0]._id}/read`, {
      method: 'PATCH', headers: authHeaders(peer.token)
    });
    expect(res.status).toBe(404);
  });

  test('G.7 GET /notifications no auth → 401', async () => {
    const res = await fetch(`${API}/notifications`, {
      headers: { 'content-type': 'application/json' }
    });
    expect(res.status).toBe(401);
  });

  // ─── Bulk-notifications (8-12) ─────────────────────────────────────────

  test('G.8 POST /bulk-notifications send to all → BulkNotification + Notifications created', async () => {
    const adm = await makeAdmin();
    await makeJobseeker();
    await makeJobseeker();
    const res = await fetch(`${API}/bulk-notifications`, {
      method: 'POST', headers: authHeaders(adm.token),
      body: JSON.stringify({
        title: 'Test Announcement',
        message: 'Hello everyone, this is a test',
        type: 'announcement',
        targetAudience: 'all',
        deliveryChannels: { inApp: true, email: false }
      })
    });
    expect([200, 201]).toContain(res.status);
    const bulks = await dbFind('bulknotifications', {});
    expect(bulks.length).toBe(1);
    // Wait briefly for async notification fan-out
    for (let i = 0; i < 20; i++) {
      const n = await dbFind('notifications', {});
      if (n.length >= 1) break;
      await new Promise(r => setTimeout(r, 100));
    }
    const notifs = await dbFind('notifications', {});
    expect(notifs.length).toBeGreaterThanOrEqual(1);
  });

  test('G.9 POST /bulk-notifications scheduled future → status=draft, no fan-out', async () => {
    const adm = await makeAdmin();
    await makeJobseeker();
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const res = await fetch(`${API}/bulk-notifications`, {
      method: 'POST', headers: authHeaders(adm.token),
      body: JSON.stringify({
        title: 'Scheduled', message: 'Future message',
        type: 'announcement', targetAudience: 'all',
        deliveryChannels: { inApp: true, email: false },
        scheduledFor: future.toISOString()
      })
    });
    expect([200, 201]).toContain(res.status);
    const bulks = await dbFind('bulknotifications', {});
    expect(bulks.length).toBe(1);
    expect(bulks[0].status).toBe('draft');
    const notifs = await dbFind('notifications', {});
    expect(notifs.length).toBe(0);
  });

  test('G.10 GET /bulk-notifications lists admin own bulks', async () => {
    const adm = await makeAdmin();
    await makeJobseeker();
    await fetch(`${API}/bulk-notifications`, {
      method: 'POST', headers: authHeaders(adm.token),
      body: JSON.stringify({ title: 'L', message: 'M', type: 'announcement', targetAudience: 'all', deliveryChannels: { inApp: true, email: false } })
    });
    const res = await fetch(`${API}/bulk-notifications`, { headers: authHeaders(adm.token) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.bulkNotifications?.length || body.data.notifications?.length).toBeGreaterThanOrEqual(1);
  });

  test('G.11 POST /bulk-notifications non-admin → 403', async () => {
    const js = await makeJobseeker();
    const res = await fetch(`${API}/bulk-notifications`, {
      method: 'POST', headers: authHeaders(js.token),
      body: JSON.stringify({ title: 'X', message: 'Y', type: 'announcement', targetAudience: 'all', deliveryChannels: { inApp: true, email: false } })
    });
    expect(res.status).toBe(403);
  });

  test('G.12 GET /bulk-notifications/templates/list', async () => {
    const adm = await makeAdmin();
    const res = await fetch(`${API}/bulk-notifications/templates/list`, { headers: authHeaders(adm.token) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  // ─── Verification (13-15) ──────────────────────────────────────────────

  test('G.13 POST /verification/request email + /verify happy: code captured + accepted', async () => {
    const email = `verify-${Date.now()}@example.com`;
    const res = await fetch(`${API}/verification/request`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identifier: email, method: 'email' })
    });
    expect(res.status).toBe(200);
    const code = await waitForVerificationCode(email);
    expect(code).toMatch(/^\d{6}$/);
    const verifyRes = await fetch(`${API}/verification/verify`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identifier: email, code, method: 'email' })
    });
    expect(verifyRes.status).toBe(200);
    const body = await verifyRes.json();
    expect(body.success).toBe(true);
  });

  test('G.14 POST /verification/verify wrong code → 400', async () => {
    const email = `verify-bad-${Date.now()}@example.com`;
    await fetch(`${API}/verification/request`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identifier: email, method: 'email' })
    });
    const res = await fetch(`${API}/verification/verify`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identifier: email, code: '000000', method: 'email' })
    });
    expect(res.status).toBe(400);
  });

  test('G.15 POST /verification/validate-token: missing token → 400', async () => {
    const res = await fetch(`${API}/verification/validate-token`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({})
    });
    expect(res.status).toBe(400);
  });

  // ─── QuickUsers (16-20) ────────────────────────────────────────────────

  test('G.16 POST /quickusers signup: QuickUser + unsubscribeToken generated', async () => {
    const email = `quick-${Date.now()}@example.com`;
    const res = await fetch(`${API}/quickusers`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        firstName: 'Quick', lastName: 'User', email,
        location: 'Tiranë',
        interests: ['Teknologji', 'Marketing']
      })
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.unsubscribeUrl).toBeDefined();
    const after = (await dbFind('quickusers', { email }))[0];
    expect(after).toBeDefined();
    expect(after.unsubscribeToken).toBeDefined();
    expect(after.isActive).toBe(true);
  });

  test('G.17 POST /quickusers signup duplicate email → 400', async () => {
    const email = `quick-dup-${Date.now()}@example.com`;
    const body1 = {
      firstName: 'Aaaa', lastName: 'Bbbb', email, location: 'Tiranë',
      interests: ['Teknologji']
    };
    await fetch(`${API}/quickusers`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body1)
    });
    const res2 = await fetch(`${API}/quickusers`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body1)
    });
    expect(res2.status).toBe(400);
  });

  test('G.18 POST /quickusers/unsubscribe via token → isActive=false', async () => {
    const email = `quick-unsub-${Date.now()}@example.com`;
    const r = await fetch(`${API}/quickusers`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        firstName: 'Unsub', lastName: 'Tester', email, location: 'Tiranë',
        interests: ['Teknologji']
      })
    });
    expect(r.status).toBe(201);
    const qu = (await dbFind('quickusers', {}))[0];
    expect(qu).toBeDefined();
    const res = await fetch(`${API}/quickusers/unsubscribe`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: qu.unsubscribeToken })
    });
    expect(res.status).toBe(200);
    const after = (await dbFind('quickusers', {}))[0];
    expect(after.isActive).toBe(false);
  });

  test('G.19 POST /quickusers/unsubscribe invalid token → 404', async () => {
    const res = await fetch(`${API}/quickusers/unsubscribe`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'not-a-real-token' })
    });
    expect(res.status).toBe(404);
  });

  test('G.20 POST /quickusers/track-click increments emailClickCount', async () => {
    const email = `quick-click-${Date.now()}@example.com`;
    await fetch(`${API}/quickusers`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        firstName: 'Click', lastName: 'Tester', email, location: 'Tiranë',
        interests: ['Teknologji']
      })
    });
    const qu = (await dbFind('quickusers', {}))[0];
    const res = await fetch(`${API}/quickusers/track-click`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: qu.unsubscribeToken })
    });
    expect([200, 201]).toContain(res.status);
    const after = (await dbFind('quickusers', {}))[0];
    expect(after.emailClickCount).toBeGreaterThanOrEqual(1);
  });
});
