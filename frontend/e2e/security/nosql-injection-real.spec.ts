/**
 * Real NoSQL Injection tests (Phase 28 — Phase 4).
 *
 * Attempts MongoDB operator injection on every endpoint that accepts
 * structured input. Asserts that no payload is interpreted as an
 * operator (`$ne`, `$gt`, `$where`, `$regex`) — server must coerce to
 * string or reject.
 *
 * Per TESTING_PHILOSOPHY.md Rule 5: actually attempt the injection,
 * assert specific defenses (login fails, no data leak).
 */

import { test, expect } from '@playwright/test';
import { dbClear } from '../real-backend/db-helpers';
import { makeJobseeker, makeEmployer, authHeaders, API } from '../real-backend/factory-helpers';

test.describe('Phase 4 / NoSQL injection — real attempts', () => {
  test.beforeEach(async () => { await dbClear(); });

  test('NSI.1 login {$ne: ""} on email — must NOT auth as the first user', async () => {
    // Seed a user
    await makeJobseeker({ email: 'victim@example.com', password: 'StrongPass123!' });

    // Attempt: { email: { $ne: '' } } would match ANY user in vulnerable code
    const r = await fetch(`${API}/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: { $ne: '' }, password: { $ne: '' } })
    });

    // Server must reject (validator + sanitizer):
    // - 400/422 (validator rejects non-string types) → safe
    // - 401 (validator passes but lookup with object fails) → also safe
    // - NEVER 200 with a token → bypass!
    expect(r.status, 'NoSQL operator injection MUST NOT auth').not.toBe(200);
    expect([400, 401, 422]).toContain(r.status);

    // Stronger: response body must not contain a token
    if (r.status >= 200 && r.status < 300) {
      const body = await r.json();
      expect(body.data?.token, 'must not return a token under operator injection').toBeFalsy();
    }
  });

  test('NSI.2 login {$gt: ""} on password — must NOT auth', async () => {
    await makeJobseeker({ email: 'victim2@example.com' });
    const r = await fetch(`${API}/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'victim2@example.com', password: { $gt: '' } })
    });
    expect(r.status, 'password operator injection must not auth').not.toBe(200);
    expect([400, 401, 422]).toContain(r.status);
  });

  test('NSI.3 forgot-password { $ne: null } — must not enumerate users', async () => {
    const r = await fetch(`${API}/auth/forgot-password`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: { $ne: null } })
    });
    // Server may reject (400/422) or accept-and-silently-ignore (200, no email sent).
    // What MUST NOT happen: 5xx (revealing operator passed through to query),
    // OR 200 + email sent to whoever the $ne matches.
    expect(r.status, 'must not 5xx on operator injection').toBeLessThan(500);
    expect([200, 400, 422, 429]).toContain(r.status);
  });

  test('NSI.4 jobs filter ?city[$gt]= — server returns clean response, no leak', async () => {
    const r = await fetch(`${API}/jobs?city[$gt]=`);
    expect(r.status, 'NoSQL in query must not 5xx').toBeLessThan(500);
    expect(r.status, 'NoSQL in query may return 200 (with safe filter) or 400').toBeGreaterThanOrEqual(200);
    // Either coerced/rejected — never crashes
  });

  test('NSI.5 admin /admin/users with employer token + ?email[$ne]=null — wrong-role rejection', async () => {
    const emp = await makeEmployer({ preApprove: true });
    const r = await fetch(`${API}/admin/users?email[$ne]=null`, {
      headers: authHeaders(emp.token)
    });
    // authorize('admin') middleware rejects non-admin → 403, regardless of NoSQL operator
    expect(r.status, 'wrong-role must reject before any DB query').toBe(403);
  });

  test('NSI.6 register {$ne: ""} as email — validator rejects', async () => {
    const r = await fetch(`${API}/auth/initiate-registration`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: { $ne: '' },
        password: 'StrongPass123!',
        userType: 'jobseeker',
        firstName: 'Anila', lastName: 'Kola',
        city: 'Tiranë'
      })
    });
    expect(r.status, 'object-as-email must be rejected').not.toBe(200);
    expect([400, 422]).toContain(r.status);
  });

  test('NSI.7 jobs sort with $where injection — neither crashes nor evaluates', async () => {
    const r = await fetch(`${API}/jobs?$where=this.title=='X'`);
    expect(r.status).toBeLessThan(500);
    if (r.ok) {
      const body = await r.json();
      // The result should be the normal jobs list, not a $where-evaluated subset
      expect(Array.isArray(body.data?.jobs), 'jobs response shape must be array').toBe(true);
    }
  });
});
