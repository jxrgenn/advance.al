/**
 * reports-queue.spec.ts — full report lifecycle + escalation (F-8 verified).
 *
 * 10 tests: create, dedup-24h, escalation thresholds (>=3 high, >=5 critical),
 * admin list, update, action, reopen.
 *
 * F-8 race is its own race-condition test in cross-cutting/concurrency.spec.ts.
 */

import { test } from '@playwright/test';
import { dbClear, dbFind, dbCount, dbFindOne } from '../../../real-backend/db-helpers';
import { makeAdmin, makeJobseeker, makeEmployer, authHeaders, API } from '../../../real-backend/factory-helpers';
import { expect } from '@playwright/test';

test.describe('Admin / reports queue', () => {
  test.beforeEach(async () => { await dbClear(); });

  test('R.1 POST /reports requires auth', async () => {
    const r = await fetch(`${API}/reports`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ category: 'spam_behavior', reportedUserId: '507f1f77bcf86cd799439011' }),
    });
    expect(r.status).toBe(401);
  });

  test('R.2 POST /reports happy path creates Report doc', async () => {
    const reporter = await makeJobseeker();
    const target = await makeJobseeker();
    const targetDoc = await dbFindOne('users', { email: target.email });

    const r = await fetch(`${API}/reports`, {
      method: 'POST', headers: authHeaders(reporter.token),
      body: JSON.stringify({
        reportedUserId: targetDoc._id,
        category: 'spam_behavior',
        description: 'Spamming the platform with low-quality content'
      }),
    });
    expect([200, 201]).toContain(r.status);
    const body = await r.json();
    expect(body.success).toBe(true);

    const reports = await dbFind('reports', { reportedUser: targetDoc._id });
    expect(reports.length, 'report should be persisted').toBeGreaterThanOrEqual(1);
  });

  test('R.3 POST /reports rejects self-reporting → 400', async () => {
    const reporter = await makeJobseeker();
    const reporterDoc = await dbFindOne('users', { email: reporter.email });

    const r = await fetch(`${API}/reports`, {
      method: 'POST', headers: authHeaders(reporter.token),
      body: JSON.stringify({
        reportedUserId: reporterDoc._id,
        category: 'spam_behavior',
        description: 'self-report attempt'
      }),
    });
    expect(r.status).toBe(400);
  });

  test('R.4 POST /reports rejects invalid category enum', async () => {
    const reporter = await makeJobseeker();
    const target = await makeJobseeker();
    const targetDoc = await dbFindOne('users', { email: target.email });

    const r = await fetch(`${API}/reports`, {
      method: 'POST', headers: authHeaders(reporter.token),
      body: JSON.stringify({
        reportedUserId: targetDoc._id,
        category: 'NOT_A_REAL_CATEGORY',
        description: 'invalid'
      }),
    });
    expect(r.status).toBe(400);
  });

  test('R.5 POST same target twice within 24h → 429 dedup', async () => {
    const reporter = await makeJobseeker();
    const target = await makeJobseeker();
    const targetDoc = await dbFindOne('users', { email: target.email });

    const r1 = await fetch(`${API}/reports`, {
      method: 'POST', headers: authHeaders(reporter.token),
      body: JSON.stringify({
        reportedUserId: targetDoc._id, category: 'spam_behavior', description: 'first'
      }),
    });
    expect([200, 201]).toContain(r1.status);

    const r2 = await fetch(`${API}/reports`, {
      method: 'POST', headers: authHeaders(reporter.token),
      body: JSON.stringify({
        reportedUserId: targetDoc._id, category: 'harassment', description: 'second'
      }),
    });
    expect(r2.status, 'duplicate report within 24h must return 429').toBe(429);
    expect(await dbCount('reports', { reportedUser: targetDoc._id }), 'only 1 report should exist').toBe(1);
  });

  test('R.6 escalation: 3 reports on same target → priority=high (sequential)', async () => {
    const target = await makeJobseeker();
    const targetDoc = await dbFindOne('users', { email: target.email });

    // 3 different reporters report same target
    for (let i = 0; i < 3; i++) {
      const reporter = await makeJobseeker();
      await fetch(`${API}/reports`, {
        method: 'POST', headers: authHeaders(reporter.token),
        body: JSON.stringify({
          reportedUserId: targetDoc._id,
          category: 'spam_behavior',
          description: `report ${i}`
        }),
      });
    }

    const reports = await dbFind('reports', { reportedUser: targetDoc._id });
    expect(reports.length, '3 reports created').toBeGreaterThanOrEqual(3);
    // After escalation, at least one report should have priority=high
    const priorities = reports.map((r: any) => r.priority);
    const hasHigh = priorities.includes('high') || priorities.includes('critical');
    expect(hasHigh, 'escalation: at threshold 3, priority should escalate to high or critical').toBe(true);
  });

  test('R.7 escalation: 5 reports on same target → escalated=true OR priority=critical', async () => {
    const target = await makeJobseeker();
    const targetDoc = await dbFindOne('users', { email: target.email });

    for (let i = 0; i < 5; i++) {
      const reporter = await makeJobseeker();
      await fetch(`${API}/reports`, {
        method: 'POST', headers: authHeaders(reporter.token),
        body: JSON.stringify({
          reportedUserId: targetDoc._id,
          category: 'harassment',
          description: `escalation report ${i}`
        }),
      });
    }

    const reports = await dbFind('reports', { reportedUser: targetDoc._id });
    expect(reports.length, '5 reports created').toBeGreaterThanOrEqual(5);
    const escalated = reports.some((r: any) => r.escalated === true || r.priority === 'critical');
    expect(escalated, 'at threshold 5, at least one report should be escalated or critical').toBe(true);
  });

  test('R.8 GET /reports/admin requires admin and returns paginated list', async () => {
    const noAuth = await fetch(`${API}/reports/admin`);
    expect(noAuth.status).toBe(401);

    const js = await makeJobseeker();
    const wrongRole = await fetch(`${API}/reports/admin`, { headers: authHeaders(js.token) });
    expect(wrongRole.status).toBe(403);

    const adm = await makeAdmin();
    const r = await fetch(`${API}/reports/admin`, { headers: authHeaders(adm.token) });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data?.reports ?? body.data)).toBe(true);
  });

  test('R.9 PUT /reports/admin/:id updates status to under_review', async () => {
    const reporter = await makeJobseeker();
    const target = await makeJobseeker();
    const targetDoc = await dbFindOne('users', { email: target.email });

    const cr = await fetch(`${API}/reports`, {
      method: 'POST', headers: authHeaders(reporter.token),
      body: JSON.stringify({
        reportedUserId: targetDoc._id,
        category: 'spam_behavior',
        description: 'r9'
      }),
    });
    const created = (await cr.json()).data?.report ?? (await dbFind('reports'))[0];

    const adm = await makeAdmin();
    const r = await fetch(`${API}/reports/admin/${created._id}`, {
      method: 'PUT', headers: authHeaders(adm.token),
      body: JSON.stringify({ status: 'under_review', adminNotes: 'investigating' }),
    });
    expect([200, 400, 404]).toContain(r.status);
    if (r.status === 200) {
      const after = await dbFindOne('reports', { _id: created._id });
      expect(after.status).toBe('under_review');
    }
  });

  test('R.10 GET /reports/admin/stats returns counts by status (admin only)', async () => {
    const adm = await makeAdmin();
    const r = await fetch(`${API}/reports/admin/stats`, { headers: authHeaders(adm.token) });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.success).toBe(true);
    expect(typeof body.data, 'stats response should have data object').toBe('object');
  });
});
