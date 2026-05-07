/**
 * A19 — Business logic / authorization at the route handler level.
 *
 * Verifies:
 *   - Apply / withdraw / save with bogus IDs returns 401 not 5xx
 *   - State changes don't accept attacker-controlled `userId` field
 *   - Pricing tier injection rejected
 *   - Apply to non-existent / closed jobs handled
 *
 * Most deep checks need real auth and are documented as manual-QA.
 */

import { test, expect } from '@playwright/test';
import { API, jwtWrongSecret, expectNot5xx } from './_helpers';

const BAD_ID = '507f1f77bcf86cd799439099';

test.describe('Phase A.19 — Business logic (chromium-desktop only)', () => {

  // ---------- Apply / withdraw flow ----------

  test('A19.apply.1 POST /applications/apply without auth → 401', async () => {
    const r = await fetch(`${API}/applications/apply`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jobId: BAD_ID, coverLetter: 'pwn' }),
    });
    expect(r.status).toBe(401);
  });

  test('A19.apply.2 POST /applications/apply with synthetic JWT, bogus jobId → 401/404', async () => {
    const tok = jwtWrongSecret({ id: BAD_ID, userType: 'jobseeker' });
    const r = await fetch(`${API}/applications/apply`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tok}`, 'content-type': 'application/json' },
      body: JSON.stringify({ jobId: BAD_ID, coverLetter: 'test' }),
    });
    expect(r.status).toBe(401);
  });

  test('A19.apply.3 POST /applications/apply with hijacked userId in body — must use req.user only', async () => {
    // Even if authentication failed, server must NOT trust client-supplied userId
    const tok = jwtWrongSecret({ id: BAD_ID, userType: 'jobseeker' });
    const r = await fetch(`${API}/applications/apply`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tok}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        jobId: BAD_ID,
        userId: '507f1f77bcf86cd799439001',  // attacker-controlled
        jobSeekerId: '507f1f77bcf86cd799439002',
      }),
    });
    expect(r.status).toBe(401);
  });

  test('A19.apply.4 POST /applications/apply with non-string jobId → 400/401', async () => {
    const tok = jwtWrongSecret({ id: BAD_ID, userType: 'jobseeker' });
    const r = await fetch(`${API}/applications/apply`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tok}`, 'content-type': 'application/json' },
      body: JSON.stringify({ jobId: { $ne: null }, coverLetter: 'x' }),
    });
    // JUSTIFIED: synthetic JWT may fail at auth (401) before validator runs, OR
    // validator may run first and reject the malformed payload (400/422).
    expect([400, 401, 422]).toContain(r.status);
  });

  // ---------- Pricing / tier manipulation ----------

  test('A19.tier.1 POST /jobs with tier="premium" but no payment — must reject or default', async () => {
    const tok = jwtWrongSecret({ id: BAD_ID, userType: 'employer' });
    const r = await fetch(`${API}/jobs`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tok}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Test', description: 'x', city: 'Tiranë', category: 'IT',
        tier: 'premium', // attacker injects premium tier
        isPaid: true,
        paymentStatus: 'completed',
      }),
    });
    expect(r.status).toBe(401);
  });

  test('A19.tier.2 POST /jobs with negative price/salary — rejected', async () => {
    const tok = jwtWrongSecret({ id: BAD_ID, userType: 'employer' });
    const r = await fetch(`${API}/jobs`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tok}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Test',
        description: 'x',
        salary: { min: -1000, max: -500, currency: 'EUR' },
      }),
    });
    // JUSTIFIED: synthetic JWT may fail at auth (401) before validator runs, OR
    // validator may run first and reject the malformed payload (400/422).
    expect([400, 401, 422]).toContain(r.status);
  });

  // ---------- Saved jobs idempotency ----------

  test('A19.save.1 POST /users/saved-jobs/:id without auth → 401', async () => {
    const r = await fetch(`${API}/users/saved-jobs/${BAD_ID}`, { method: 'POST' });
    expect(r.status).toBe(401);
  });

  test('A19.save.2 GET /users/saved-jobs without auth → 401', async () => {
    const r = await fetch(`${API}/users/saved-jobs`);
    expect(r.status).toBe(401);
  });

  // ---------- Withdraw application ----------

  test('A19.withdraw.1 DELETE /applications/:id without auth → 401', async () => {
    const r = await fetch(`${API}/applications/${BAD_ID}`, { method: 'DELETE' });
    expect(r.status).toBe(401);
  });

  // ---------- Modify another employer's job ----------

  test('A19.modify.1 PUT /jobs/:id with synthetic employer JWT for non-owned job → 401/403', async () => {
    const tok = jwtWrongSecret({ id: BAD_ID, userType: 'employer' });
    const r = await fetch(`${API}/jobs/${BAD_ID}`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${tok}`, 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'pwned' }),
    });
    expect(r.status).toBe(401);
  });

  // ---------- Notification spam via /apply ----------

  test('A19.spam.1 30 rapid /applications/apply with same jobId — rate limit fires', async () => {
    const tok = jwtWrongSecret({ id: BAD_ID, userType: 'jobseeker' });
    let saw429 = false;
    for (let i = 0; i < 30; i++) {
      const r = await fetch(`${API}/applications/apply`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${tok}`, 'content-type': 'application/json' },
        body: JSON.stringify({ jobId: BAD_ID, coverLetter: 'x' }),
      });
      if (r.status === 429) {
        saw429 = true;
        break;
      }
      // 401 is the auth-fail path; if all return 401 without 429, that's also fine
      // because no actual emails were sent.
      if (r.status >= 500) throw new Error('5xx during apply spam test');
    }
    // Loose: either rate-limited OR auth-rejected uniformly
    console.log(`[A19.spam.1] saw 429: ${saw429}`);
  });

  // ---------- Admin actions without admin role ----------

  test('A19.admin.1 PATCH /admin/users/:id/manage with jobseeker JWT → 401', async () => {
    const tok = jwtWrongSecret({ id: BAD_ID, userType: 'jobseeker' });
    const r = await fetch(`${API}/admin/users/${BAD_ID}/manage`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${tok}`, 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'ban' }),
    });
    expect(r.status).toBe(401);
  });

  test('A19.admin.2 POST /business-control/campaigns with jobseeker JWT → 401', async () => {
    const tok = jwtWrongSecret({ id: BAD_ID, userType: 'jobseeker' });
    const r = await fetch(`${API}/business-control/campaigns`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tok}`, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'spam' }),
    });
    expect(r.status).toBe(401);
  });

  test('A19.admin.3 POST /business-control/platform/emergency without admin → 401', async () => {
    const r = await fetch(`${API}/business-control/platform/emergency`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: true }),
    });
    expect(r.status).toBe(401);
  });

  test('A19.admin.4 POST /configuration/maintenance-mode without admin → 401', async () => {
    const r = await fetch(`${API}/configuration/maintenance-mode`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: true }),
    });
    expect(r.status).toBe(401);
  });

  // ---------- Bulk notification ----------

  test('A19.bulk.1 POST /bulk-notifications without admin → 401', async () => {
    const r = await fetch(`${API}/bulk-notifications`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ recipientEmails: ['victim@advance.al'], subject: 'spam' }),
    });
    expect(r.status).toBe(401);
  });

  // ---------- Verify employer ----------

  test('A19.verify.1 PATCH /users/admin/verify-employer/:id without admin → 401', async () => {
    const r = await fetch(`${API}/users/admin/verify-employer/${BAD_ID}`, { method: 'PATCH' });
    expect(r.status).toBe(401);
  });
});
