/**
 * Phase 22.F — Reports + Escalation EXHAUSTIVE
 *
 * Verifies F-8 fix (post-save atomic re-check escalation) plus the full
 * report lifecycle: create → admin list → update → action → reopen.
 */

import { test, expect } from '@playwright/test';
import { dbClear, dbFind, dbUpdate } from '../../real-backend/db-helpers';
import { API, makeJobseeker, makeEmployer, makeAdmin, authHeaders } from '../../real-backend/factory-helpers';

test.describe.configure({ mode: 'serial' });

test.describe('Phase 22.F — Reports + Escalation EXHAUSTIVE', () => {
  test.beforeEach(async () => { await dbClear(); });

  test('F.1 create report happy: Report doc + ReportAction created', async () => {
    const reporter = await makeJobseeker();
    const target = await makeJobseeker();
    const targetUser = (await dbFind('users', { email: target.email }))[0];

    const res = await fetch(`${API}/reports`, {
      method: 'POST', headers: authHeaders(reporter.token),
      body: JSON.stringify({
        reportedUserId: targetUser._id,
        category: 'spam_behavior',
        description: 'Sending repeated spam messages'
      })
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.reportId).toBeDefined();
    expect(body.data.status).toBe('pending');

    // Verify Report + ReportAction in DB
    const reports = await dbFind('reports', {});
    expect(reports.length).toBe(1);
    const actions = await dbFind('report_actions', {});
    expect(actions.length).toBeGreaterThanOrEqual(1);
    expect(actions[0].actionType).toBe('report_created');
  });

  test('F.2 dedup: same reporter+target within 24h → 429', async () => {
    const reporter = await makeJobseeker();
    const target = await makeJobseeker();
    const targetUser = (await dbFind('users', { email: target.email }))[0];

    await fetch(`${API}/reports`, {
      method: 'POST', headers: authHeaders(reporter.token),
      body: JSON.stringify({ reportedUserId: targetUser._id, category: 'spam_behavior' })
    });
    const res2 = await fetch(`${API}/reports`, {
      method: 'POST', headers: authHeaders(reporter.token),
      body: JSON.stringify({ reportedUserId: targetUser._id, category: 'harassment' })
    });
    expect(res2.status).toBe(429);
  });

  test('F.3 self-report → 400', async () => {
    const me = await makeJobseeker();
    const myUser = (await dbFind('users', { email: me.email }))[0];

    const res = await fetch(`${API}/reports`, {
      method: 'POST', headers: authHeaders(me.token),
      body: JSON.stringify({ reportedUserId: myUser._id, category: 'spam_behavior' })
    });
    expect(res.status).toBe(400);
  });

  test('F.4 report nonexistent user → 404', async () => {
    const reporter = await makeJobseeker();
    const res = await fetch(`${API}/reports`, {
      method: 'POST', headers: authHeaders(reporter.token),
      body: JSON.stringify({ reportedUserId: '5fdfffffffffffffffffffff', category: 'spam_behavior' })
    });
    expect(res.status).toBe(404);
  });

  test('F.5 escalation: 3 reports → priority=high (F-8 fix)', async () => {
    const target = await makeJobseeker();
    const targetUser = (await dbFind('users', { email: target.email }))[0];
    // Create 3 distinct reporters (must be different users; dedup is per reporter)
    const reporters = [];
    for (let i = 0; i < 3; i++) reporters.push(await makeJobseeker());
    for (const r of reporters) {
      const res = await fetch(`${API}/reports`, {
        method: 'POST', headers: authHeaders(r.token),
        body: JSON.stringify({ reportedUserId: targetUser._id, category: 'spam_behavior' })
      });
      expect(res.status).toBe(201);
    }
    // Wait briefly for the post-save handler to run
    await new Promise(r => setTimeout(r, 200));
    const reports = await dbFind('reports', {});
    // At least one report should be priority=high after the 3rd insert.
    const priorities = reports.map((r: any) => r.priority);
    expect(priorities).toContain('high');
  });

  test('F.6 escalation: 5 reports → escalated=true + priority=critical', async () => {
    const target = await makeJobseeker();
    const targetUser = (await dbFind('users', { email: target.email }))[0];
    const reporters = [];
    for (let i = 0; i < 5; i++) reporters.push(await makeJobseeker());
    for (const r of reporters) {
      await fetch(`${API}/reports`, {
        method: 'POST', headers: authHeaders(r.token),
        body: JSON.stringify({ reportedUserId: targetUser._id, category: 'spam_behavior' })
      });
    }
    await new Promise(r => setTimeout(r, 300));
    const reports = await dbFind('reports', {});
    const escalated = reports.filter((r: any) => r.escalated === true);
    expect(escalated.length).toBeGreaterThanOrEqual(1);
    const priorities = reports.map((r: any) => r.priority);
    expect(priorities).toContain('critical');
  });

  test('F.7 GET /api/reports (my-reports) returns reporter own reports', async () => {
    const reporter = await makeJobseeker();
    const target = await makeJobseeker();
    const targetUser = (await dbFind('users', { email: target.email }))[0];
    await fetch(`${API}/reports`, {
      method: 'POST', headers: authHeaders(reporter.token),
      body: JSON.stringify({ reportedUserId: targetUser._id, category: 'spam_behavior' })
    });
    const res = await fetch(`${API}/reports`, { headers: authHeaders(reporter.token) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.reports.length).toBe(1);
    expect(body.data.reports[0].category).toBe('spam_behavior');
  });

  test('F.8 GET /api/reports/admin lists all (admin only)', async () => {
    const adm = await makeAdmin();
    const reporter = await makeJobseeker();
    const target = await makeJobseeker();
    const targetUser = (await dbFind('users', { email: target.email }))[0];
    await fetch(`${API}/reports`, {
      method: 'POST', headers: authHeaders(reporter.token),
      body: JSON.stringify({ reportedUserId: targetUser._id, category: 'spam_behavior' })
    });

    const res = await fetch(`${API}/reports/admin`, { headers: authHeaders(adm.token) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.reports.length).toBeGreaterThanOrEqual(1);
    // Non-admin must NOT access
    const res2 = await fetch(`${API}/reports/admin`, { headers: authHeaders(reporter.token) });
    expect(res2.status).toBe(403);
  });

  test('F.9 PUT /admin/:id update status + priority', async () => {
    const adm = await makeAdmin();
    const reporter = await makeJobseeker();
    const target = await makeJobseeker();
    const targetUser = (await dbFind('users', { email: target.email }))[0];
    await fetch(`${API}/reports`, {
      method: 'POST', headers: authHeaders(reporter.token),
      body: JSON.stringify({ reportedUserId: targetUser._id, category: 'spam_behavior' })
    });
    const reports = await dbFind('reports', {});
    const reportId = reports[0]._id;

    const res = await fetch(`${API}/reports/admin/${reportId}`, {
      method: 'PUT', headers: authHeaders(adm.token),
      body: JSON.stringify({ status: 'under_review', priority: 'high' })
    });
    expect(res.status).toBe(200);
    const after = (await dbFind('reports', {}))[0];
    expect(after.status).toBe('under_review');
    expect(after.priority).toBe('high');
    // ReportAction created for the change
    const actions = await dbFind('report_actions', {});
    expect(actions.length).toBeGreaterThanOrEqual(2);
  });

  test('F.10 POST /admin/:id/action warning: ReportAction recorded', async () => {
    const adm = await makeAdmin();
    const reporter = await makeJobseeker();
    const target = await makeJobseeker();
    const targetUser = (await dbFind('users', { email: target.email }))[0];
    await fetch(`${API}/reports`, {
      method: 'POST', headers: authHeaders(reporter.token),
      body: JSON.stringify({ reportedUserId: targetUser._id, category: 'spam_behavior' })
    });
    const reports = await dbFind('reports', {});
    const reportId = reports[0]._id;

    const res = await fetch(`${API}/reports/admin/${reportId}/action`, {
      method: 'POST', headers: authHeaders(adm.token),
      body: JSON.stringify({
        action: 'warning',
        reason: 'First-time spam offense'
      })
    });
    // JUSTIFIED: HTTP convention — POST returns 200 (with body) or 201 (created).
    expect([200, 201]).toContain(res.status);
    const actions = await dbFind('report_actions', {});
    // Action recorded for the warning (in addition to report_created)
    expect(actions.length).toBeGreaterThanOrEqual(2);
  });
});
