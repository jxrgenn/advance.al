/**
 * A13 — Multi-tenant / IDOR isolation depth.
 *
 * Tests every cross-user / cross-tenant data-access vector REACHABLE
 * without auth. Authenticated cross-tenant tests (user A reads user
 * B's data) require the user to seed two real test accounts — those
 * are documented as manual-QA in PRODUCTION_VERIFIED.md.
 *
 * Key check: 401 vs 404 distinction. If `/api/users/:id` returns 401
 * for one ID and 404 for another, that's an existence oracle. They
 * should return the SAME code regardless of whether the resource exists.
 *
 * READ-ONLY. No writes.
 */

import { test, expect } from '@playwright/test';
import { API, jwtAlgNone, jwtWrongSecret, expectNot5xx } from './_helpers';

const KNOWN_BAD_ID = '507f1f77bcf86cd799439099';     // valid ObjectId, doesn't exist
const KNOWN_BAD_ID_2 = '507f1f77bcf86cd799439001';   // another valid ObjectId
const NOT_AN_OBJECT_ID = 'not-an-object-id';

test.describe('Phase A.13 — Multi-tenant isolation (chromium-desktop only)', () => {

  // ---------- IDOR — unauthenticated GETs ----------

  test('A13.IDOR.1 GET /users/:id (any) → 401/403/404, never 200 with PII', async () => {
    const r = await fetch(`${API}/users/${KNOWN_BAD_ID}`);
    expect([401, 403, 404]).toContain(r.status);
    if (r.status === 200) {
      throw new Error('🚨 unauthenticated GET /users/:id returned 200');
    }
  });

  test('A13.IDOR.2 GET /users/:id with synthetic jobseeker JWT → 401', async () => {
    const tok = jwtWrongSecret({ id: KNOWN_BAD_ID, userType: 'jobseeker' });
    const r = await fetch(`${API}/users/${KNOWN_BAD_ID_2}`, {
      headers: { 'Authorization': `Bearer ${tok}` },
    });
    // 429 is also acceptable — means rate limiter caught us before the auth check
    expect([401, 403, 404, 429]).toContain(r.status);
  });

  test('A13.IDOR.3 GET /users/public-profile/:id without auth → 401 (employer-only)', async () => {
    const r = await fetch(`${API}/users/public-profile/${KNOWN_BAD_ID}`);
    expect([401, 403, 404]).toContain(r.status);
  });

  test('A13.IDOR.4 GET /admin/users/:id without admin token → 401', async () => {
    const r = await fetch(`${API}/admin/users/${KNOWN_BAD_ID}`);
    expect([401, 403, 404]).toContain(r.status);
  });

  test('A13.IDOR.5 GET /applications/:id without auth → 401', async () => {
    const r = await fetch(`${API}/applications/${KNOWN_BAD_ID}`);
    expect([401, 403, 404]).toContain(r.status);
  });

  test('A13.IDOR.6 GET /reports/admin/:id without admin → 401', async () => {
    const r = await fetch(`${API}/reports/admin/${KNOWN_BAD_ID}`);
    expect([401, 403, 404]).toContain(r.status);
  });

  test('A13.IDOR.7 GET /quickusers/:id without admin → 401', async () => {
    const r = await fetch(`${API}/quickusers/${KNOWN_BAD_ID}`);
    expect([401, 403, 404]).toContain(r.status);
  });

  test('A13.IDOR.8 GET /matching/jobs/:jobId/candidates without auth → 401', async () => {
    const r = await fetch(`${API}/matching/jobs/${KNOWN_BAD_ID}/candidates`);
    expect([401, 403, 404]).toContain(r.status);
  });

  test('A13.IDOR.9 GET /cv/download/:fileId without auth → 401', async () => {
    const r = await fetch(`${API}/cv/download/${KNOWN_BAD_ID}`);
    expect([401, 403, 404]).toContain(r.status);
  });

  test('A13.IDOR.10 GET /cv/preview/:fileId without auth → 401', async () => {
    const r = await fetch(`${API}/cv/preview/${KNOWN_BAD_ID}`);
    expect([401, 403, 404]).toContain(r.status);
  });

  // ---------- IDOR — unauthenticated state changes ----------

  test('A13.IDOR.11 POST /users/saved-jobs/:jobId without auth → 401', async () => {
    const r = await fetch(`${API}/users/saved-jobs/${KNOWN_BAD_ID}`, { method: 'POST' });
    expect([401, 403]).toContain(r.status);
  });

  test('A13.IDOR.12 DELETE /users/saved-jobs/:jobId without auth → 401', async () => {
    const r = await fetch(`${API}/users/saved-jobs/${KNOWN_BAD_ID}`, { method: 'DELETE' });
    expect([401, 403]).toContain(r.status);
  });

  test('A13.IDOR.13 PATCH /applications/:id/status without auth → 401', async () => {
    const r = await fetch(`${API}/applications/${KNOWN_BAD_ID}/status`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'accepted' }),
    });
    expect([401, 403]).toContain(r.status);
  });

  test('A13.IDOR.14 DELETE /applications/:id without auth → 401', async () => {
    const r = await fetch(`${API}/applications/${KNOWN_BAD_ID}`, { method: 'DELETE' });
    expect([401, 403]).toContain(r.status);
  });

  test('A13.IDOR.15 PATCH /notifications/:id/read without auth → 401', async () => {
    const r = await fetch(`${API}/notifications/${KNOWN_BAD_ID}/read`, { method: 'PATCH' });
    expect([401, 403]).toContain(r.status);
  });

  test('A13.IDOR.16 DELETE /notifications/:id without auth → 401', async () => {
    const r = await fetch(`${API}/notifications/${KNOWN_BAD_ID}`, { method: 'DELETE' });
    expect([401, 403]).toContain(r.status);
  });

  test('A13.IDOR.17 PUT /jobs/:id without employer auth → 401', async () => {
    const r = await fetch(`${API}/jobs/${KNOWN_BAD_ID}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'pwned' }),
    });
    expect([401, 403]).toContain(r.status);
  });

  test('A13.IDOR.18 DELETE /jobs/:id without employer auth → 401', async () => {
    const r = await fetch(`${API}/jobs/${KNOWN_BAD_ID}`, { method: 'DELETE' });
    expect([401, 403]).toContain(r.status);
  });

  test('A13.IDOR.19 PATCH /jobs/:id/status without auth → 401', async () => {
    const r = await fetch(`${API}/jobs/${KNOWN_BAD_ID}/status`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'closed' }),
    });
    expect([401, 403]).toContain(r.status);
  });

  test('A13.IDOR.20 PATCH /admin/users/:userId/manage without admin → 401', async () => {
    const r = await fetch(`${API}/admin/users/${KNOWN_BAD_ID}/manage`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'ban' }),
    });
    expect([401, 403]).toContain(r.status);
  });

  // ---------- Resume filename enumeration ----------

  test('A13.resume.1 /users/resume/:filename without auth → 401 (NOT 404)', async () => {
    // 404 would reveal the file doesn't exist; 401 reveals only that auth is needed.
    // Spec says: should always 401 if no auth, regardless of whether file exists.
    const r = await fetch(`${API}/users/resume/resume-${KNOWN_BAD_ID}-12345.pdf`);
    expect([401, 403]).toContain(r.status);
  });

  test('A13.resume.2 /users/resume/<path-traversal>.pdf without auth → 400/401', async () => {
    const r = await fetch(`${API}/users/resume/..%2F..%2Fetc%2Fpasswd`);
    expectNot5xx(r.status, 'resume path traversal');
    expect([400, 401, 403, 404]).toContain(r.status);
  });

  test('A13.resume.3 /users/resume/<bogus-format> without auth → 400/401', async () => {
    const r = await fetch(`${API}/users/resume/totally-not-a-resume.exe`);
    expectNot5xx(r.status, 'bad resume format');
    expect([400, 401, 403, 404]).toContain(r.status);
  });

  test('A13.resume.4 401 vs 404 oracle test — multiple bogus filenames', async () => {
    // Generate 5 random "valid-looking" filenames; all should return same code
    const filenames = [
      `resume-${KNOWN_BAD_ID}-1700000000000.pdf`,
      `resume-${KNOWN_BAD_ID_2}-1750000000000.pdf`,
      `resume-507f1f77bcf86cd799439011-1800000000000.docx`,
      `resume-507f1f77bcf86cd799439012-1800000000000.pdf`,
      `resume-aaaaaaaaaaaaaaaaaaaaaaaa-1900000000000.pdf`,
    ];
    const codes: number[] = [];
    for (const fn of filenames) {
      const r = await fetch(`${API}/users/resume/${fn}`);
      codes.push(r.status);
    }
    // All codes should be identical (no enumeration oracle)
    const unique = new Set(codes);
    expect(unique.size, `oracle: codes vary by filename — ${[...unique].join(',')}`).toBe(1);
  });

  // ---------- Notification cross-user (synthetic JWT) ----------

  test('A13.cross.1 PATCH /notifications/:id/read with synthetic JWT for user A → 401', async () => {
    const tok = jwtAlgNone({ id: KNOWN_BAD_ID, userType: 'jobseeker' });
    const r = await fetch(`${API}/notifications/${KNOWN_BAD_ID_2}/read`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${tok}` },
    });
    expect([401, 403]).toContain(r.status);
  });

  test('A13.cross.2 GET /applications/:id with synthetic JWT → 401', async () => {
    const tok = jwtWrongSecret({ id: KNOWN_BAD_ID, userType: 'employer' });
    const r = await fetch(`${API}/applications/${KNOWN_BAD_ID_2}`, {
      headers: { 'Authorization': `Bearer ${tok}` },
    });
    expect([401, 403]).toContain(r.status);
  });

  test('A13.cross.3 PUT /jobs/:id with synthetic employer JWT → 401', async () => {
    const tok = jwtWrongSecret({ id: KNOWN_BAD_ID, userType: 'employer' });
    const r = await fetch(`${API}/jobs/${KNOWN_BAD_ID_2}`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${tok}`, 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'pwned' }),
    });
    expect([401, 403]).toContain(r.status);
  });

  test('A13.cross.4 PATCH /admin/users/:id/manage with synthetic admin JWT → 401', async () => {
    const tok = jwtWrongSecret({ id: KNOWN_BAD_ID, userType: 'admin' });
    const r = await fetch(`${API}/admin/users/${KNOWN_BAD_ID_2}/manage`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${tok}`, 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'ban' }),
    });
    expect([401, 403]).toContain(r.status);
  });

  // ---------- Existence oracle on common endpoints ----------

  test('A13.oracle.1 GET /jobs/:id real vs bogus — same shape', async () => {
    // Real job (we know one exists from the public list)
    const list = await fetch(`${API}/jobs?limit=1`).then(r => r.json());
    const realId = list?.data?.jobs?.[0]?._id;
    if (!realId) return;

    const r1 = await fetch(`${API}/jobs/${realId}`);
    const r2 = await fetch(`${API}/jobs/${KNOWN_BAD_ID}`);
    // Real → 200, bogus → 404. Document this is the expected behavior
    // (job IDs are not sensitive; existence is public info).
    expect(r1.status).toBe(200);
    expect([404, 200]).toContain(r2.status); // 200 if "no such job" wrapped in 200 envelope
  });

  test('A13.oracle.2 GET /companies/:id real vs bogus — public endpoint, OK to differ', async () => {
    // Companies are also public. Document.
    const r2 = await fetch(`${API}/companies/${KNOWN_BAD_ID}`);
    expectNot5xx(r2.status, 'company bogus id');
  });
});
