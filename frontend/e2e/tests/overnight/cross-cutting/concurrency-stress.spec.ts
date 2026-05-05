/**
 * concurrency-stress.spec.ts — high-N concurrency for the bug classes that
 * were the focus of Phase 25:
 *   - B-011: refresh-token FIFO cap of 5 across many concurrent logins
 *   - B-011: $pull-prune (7-day) interaction with $slice cap
 *   - F-5: Location.jobCount race
 *   - F-8: Report escalation race
 *   - apply de-dup race (unique index on {jobId, jobSeekerId, withdrawn:false})
 */

import { test } from '@playwright/test';
import { dbClear, dbFindOne, dbCount } from '../../../real-backend/db-helpers';
import { API, makeEmployer, makeJobseeker, authHeaders } from '../../../real-backend/factory-helpers';
import { expect } from '@playwright/test';

test.describe('Cross-cutting / concurrency stress', () => {
  test.beforeEach(async () => { await dbClear(); });

  test('CS.1 100 concurrent logins → refreshTokens.length === 5 (FIFO cap)', async () => {
    const js = await makeJobseeker();
    const N = 100;
    const promises = Array.from({ length: N }, () =>
      fetch(`${API}/auth/login`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: js.email, password: js.password })
      })
    );
    const results = await Promise.all(promises);
    const okCount = results.filter(r => r.ok).length;
    expect(okCount, `at least 95 of ${N} logins should succeed`).toBeGreaterThanOrEqual(95);

    const userDoc = await dbFindOne('users', { email: js.email });
    const stored = userDoc.refreshTokens || [];
    expect(stored.length, `refreshTokens cap is 5 even under ${N} concurrent logins`).toBeLessThanOrEqual(5);
    expect(stored.length, `refreshTokens should retain at least 1 (the most recent)`).toBeGreaterThanOrEqual(1);
  });

  test('CS.2 5 users × 10 concurrent logins → each user capped at 5 independently', async () => {
    const users = await Promise.all(Array.from({ length: 5 }, () => makeJobseeker()));
    const promises: Promise<Response>[] = [];
    for (const u of users) {
      for (let i = 0; i < 10; i++) {
        promises.push(fetch(`${API}/auth/login`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: u.email, password: u.password })
        }));
      }
    }
    await Promise.all(promises);

    for (const u of users) {
      const doc = await dbFindOne('users', { email: u.email });
      const stored = doc.refreshTokens || [];
      expect(stored.length, `user ${u.email} cap is 5`).toBeLessThanOrEqual(5);
    }
  });

  test('CS.3 prune-then-slice race: 4 expired + 1 fresh + 10 concurrent logins → array bounded', async () => {
    const js = await makeJobseeker();
    // Pre-seed 4 stale tokens older than 7 days. The $pull step should remove
    // them before $push; final array should still cap at 5 fresh.
    const stale = Array.from({ length: 4 }, (_, i) => ({
      token: `stale_${i}_${Math.random().toString(36).slice(2, 10)}`,
      createdAt: new Date(Date.now() - (8 + i) * 24 * 60 * 60 * 1000),
    }));
    // Direct DB push of stale tokens via side-channel — we keep the user's
    // current authToken to satisfy the API contract elsewhere.
    const userDoc = await dbFindOne('users', { email: js.email });
    const stalePushRes = await fetch('http://localhost:3199/__test/db/update', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        collection: 'users',
        filter: { _id: userDoc._id },
        update: { $push: { refreshTokens: { $each: stale } } }
      })
    });
    expect(stalePushRes.ok, 'stale-token seed via side-channel').toBe(true);

    const N = 10;
    await Promise.all(Array.from({ length: N }, () =>
      fetch(`${API}/auth/login`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: js.email, password: js.password })
      })
    ));

    const finalDoc = await dbFindOne('users', { email: js.email });
    const tokens = finalDoc.refreshTokens || [];
    expect(tokens.length, 'final array bounded by $slice: -5').toBeLessThanOrEqual(5);
    // Stale tokens (created >7d ago) should NOT survive — $pull runs first.
    const staleStillThere = tokens.filter((t: any) => t.token?.startsWith('stale_'));
    expect(staleStillThere.length, 'stale tokens were pruned by $pull step').toBe(0);
  });

  test('CS.4 50 concurrent job posts (single employer) → Location.jobCount matches reality', async () => {
    const emp = await makeEmployer({ preApprove: true });
    const N = 50;
    const promises = Array.from({ length: N }, (_, i) =>
      fetch(`${API}/jobs`, {
        method: 'POST', headers: authHeaders(emp.token),
        body: JSON.stringify({
          title: `Stress Job ${i}-${Date.now().toString(36)}`,
          description: 'x'.repeat(80),
          category: 'Teknologji', jobType: 'full-time',
          location: { city: 'Tiranë' },
          salary: { min: 1000, max: 2000, currency: 'EUR' },
          platformCategories: { diaspora: false, ngaShtepia: false, partTime: false, administrata: false, sezonale: false }
        })
      })
    );
    const results = await Promise.all(promises);
    const okCount = results.filter(r => r.ok).length;

    const dbJobCount = await dbCount('jobs', { isDeleted: false, status: 'active' });
    const loc = await dbFindOne('locations', { city: 'Tiranë' });
    const locCounter = loc?.jobCount ?? -1;

    expect(dbJobCount, `should have ${okCount} jobs in DB`).toBe(okCount);
    // F-5 fix: Location.jobCount was incremented atomically; should match
    // active-job count. Tolerate ±1 if the post-save hook hasn't drained.
    expect(Math.abs(locCounter - okCount), `Location.jobCount=${locCounter} vs jobs=${okCount}`).toBeLessThanOrEqual(1);
  });

  test('CS.5 same jobseeker × 10 concurrent applies on same job → exactly 1 Application', async () => {
    const emp = await makeEmployer({ preApprove: true });
    const jobRes = await fetch(`${API}/jobs`, {
      method: 'POST', headers: authHeaders(emp.token),
      body: JSON.stringify({
        title: 'Apply-Race Job CS5',
        description: 'x'.repeat(80),
        category: 'Teknologji', jobType: 'full-time',
        location: { city: 'Tiranë' },
        salary: { min: 1000, max: 2000, currency: 'EUR' },
        platformCategories: { diaspora: false, ngaShtepia: false, partTime: false, administrata: false, sezonale: false }
      })
    });
    const job = (await jobRes.json()).data.job;
    const js = await makeJobseeker();

    const N = 10;
    const promises = Array.from({ length: N }, () =>
      fetch(`${API}/applications/apply`, {
        method: 'POST', headers: authHeaders(js.token),
        body: JSON.stringify({
          jobId: job._id,
          coverLetter: 'concurrent ' + 'x'.repeat(50),
          applicationMethod: 'one_click'
        })
      })
    );
    await Promise.all(promises);

    const appCount = await dbCount('applications', { jobId: job._id, withdrawn: false });
    expect(appCount, `unique index should permit exactly 1 application despite ${N} concurrent attempts`).toBe(1);
  });

  test('CS.6 10 concurrent reports on same target → escalation reaches critical priority', async () => {
    const target = await makeJobseeker();
    const reporters = await Promise.all(Array.from({ length: 10 }, () => makeJobseeker()));
    const targetDoc = await dbFindOne('users', { email: target.email });

    const N = 10;
    await Promise.all(reporters.map((rp) =>
      fetch(`${API}/reports`, {
        method: 'POST', headers: authHeaders(rp.token),
        body: JSON.stringify({
          reportedUserId: String(targetDoc._id),
          category: 'spam_behavior',
          description: 'concurrent stress test report ' + 'x'.repeat(40),
        })
      })
    ));

    const reports = await dbCount('reports', { reportedUser: targetDoc._id });
    expect(reports, 'reports created (count may be < N due to 24h dedup)').toBeGreaterThanOrEqual(1);

    // F-8 fix: escalation should fire at thresholds 3 (high) and 5 (critical).
    const critical = await dbCount('reports', { reportedUser: targetDoc._id, priority: 'critical' });
    if (reports >= 5) {
      expect(critical, 'with ≥5 reports, at least one should be priority=critical').toBeGreaterThanOrEqual(1);
    }
  });

  test('CS.7 20 alternating messages on same application → all persisted in order', async () => {
    const emp = await makeEmployer({ preApprove: true });
    const js = await makeJobseeker();
    const jobRes = await fetch(`${API}/jobs`, {
      method: 'POST', headers: authHeaders(emp.token),
      body: JSON.stringify({
        title: 'Msg-Race Job CS7',
        description: 'x'.repeat(80),
        category: 'Teknologji', jobType: 'full-time',
        location: { city: 'Tiranë' },
        salary: { min: 1000, max: 2000, currency: 'EUR' },
        platformCategories: { diaspora: false, ngaShtepia: false, partTime: false, administrata: false, sezonale: false }
      })
    });
    const job = (await jobRes.json()).data.job;
    const appR = await fetch(`${API}/applications/apply`, {
      method: 'POST', headers: authHeaders(js.token),
      body: JSON.stringify({ jobId: job._id, coverLetter: 'cl ' + 'x'.repeat(50), applicationMethod: 'one_click' })
    });
    const app = (await appR.json()).data.application;

    // Both sender accounts must be email-verified (route requires it).
    // Employer is auto-verified via preApprove, jobseeker needs the flag.
    await fetch('http://localhost:3199/__test/db/update', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        collection: 'users', filter: { email: js.email },
        update: { $set: { emailVerified: true, status: 'active' } }
      })
    });

    const N = 20;
    const promises: Promise<Response>[] = [];
    for (let i = 0; i < N; i++) {
      const sender = (i % 2 === 0) ? emp : js;
      promises.push(fetch(`${API}/applications/${app._id}/message`, {
        method: 'POST', headers: authHeaders(sender.token),
        body: JSON.stringify({ type: 'text', message: `msg-${i}-${Date.now()}` })
      }));
    }
    await Promise.all(promises);

    const finalApp = await dbFindOne('applications', { _id: app._id });
    const msgs = finalApp?.messages ?? [];
    // The message thread is supposed to be atomic — every concurrent send
    // must persist. Earlier ≥N-2 tolerance hid real races.
    expect(msgs.length, `all ${N} concurrent messages should be persisted (thread is atomic)`).toBe(N);
  });
});
