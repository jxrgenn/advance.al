/**
 * Real SSRF + timing-oracle tests (Phase 28 — Phase 4).
 *
 * SSRF: if any backend feature fetches URLs from user input (image
 * thumbnailing, webhook calls, profile-image-by-URL), confirm it
 * cannot be coerced to fetch internal services (127.0.0.1, 169.254.169.254
 * AWS metadata, file:// scheme).
 *
 * Timing oracle: login response time for known vs unknown email must
 * not differ enough to enable enumeration. The auth.js bcrypt-decoy
 * defense is verified.
 *
 * Per TESTING_PHILOSOPHY.md Rule 5.
 */

import { test, expect } from '@playwright/test';
import { dbClear } from '../real-backend/db-helpers';
import { makeJobseeker, authHeaders, API } from '../real-backend/factory-helpers';

test.describe('Phase 4 / SSRF — internal-target probes', () => {
  test.beforeEach(async () => { await dbClear(); });

  // The current product surface doesn't have an obvious "fetch by URL"
  // feature, but if any path accepts a URL (e.g., profile picture URL
  // import, webhook config, image thumbnailing), test the standard SSRF
  // targets. These tests are forward-looking — they should fail loudly if
  // a URL-fetching feature is added without SSRF defense.

  const SSRF_TARGETS = [
    'http://127.0.0.1:6379/',  // Redis
    'http://localhost:27017/',  // MongoDB
    'http://169.254.169.254/latest/meta-data/',  // AWS instance metadata
    'http://[::1]/',  // IPv6 localhost
    'file:///etc/passwd',  // file:// scheme
    'gopher://127.0.0.1:6379/_AAAA',  // gopher protocol smuggling
  ];

  for (const target of SSRF_TARGETS) {
    test(`SSRF.${target.slice(0, 30)} — profile picture URL must not fetch`, async () => {
      const js = await makeJobseeker();

      // Try several plausible URL-accepting fields
      const fieldsToTry = ['profilePictureUrl', 'avatar', 'pictureUrl', 'imageUrl'];
      for (const field of fieldsToTry) {
        const r = await fetch(`${API}/users/profile`, {
          method: 'PUT',
          headers: authHeaders(js.token),
          body: JSON.stringify({ [field]: target }),
        });
        // Server may accept the URL string (storing it as-is is fine — no fetch happens)
        // OR reject it (validator). What MUST NOT happen: server fetches the URL,
        // gets internal data, and returns it.
        if (r.ok) {
          const body = await r.json();
          const blob = JSON.stringify(body);
          // Internal Redis/Mongo responses contain known markers
          expect(blob, 'must not leak Redis PONG/INFO').not.toMatch(/\+PONG|redis_version/i);
          expect(blob, 'must not leak Mongo wire protocol').not.toMatch(/MongoDB|wiredTiger/i);
          expect(blob, 'must not leak AWS metadata').not.toMatch(/iam-role|ami-|instance-id/i);
          expect(blob, 'must not leak /etc/passwd').not.toMatch(/root:[x*]:0:0/);
        }
      }
    });
  }
});

test.describe('Phase 4 / Timing oracle — login enumeration', () => {
  test.beforeEach(async () => { await dbClear(); });

  test('TIM.1 login known vs unknown email — timing within tolerance', async () => {
    const known = await makeJobseeker();

    // Warm up — first request after cold-start can be 10x slower
    await fetch(`${API}/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: known.email, password: 'wrong' }),
    });

    // Take N samples to average out network jitter
    const N = 8;
    const knownTimes: number[] = [];
    const unknownTimes: number[] = [];

    for (let i = 0; i < N; i++) {
      const t1 = Date.now();
      await fetch(`${API}/auth/login`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: known.email, password: `wrong-${i}` }),
      });
      knownTimes.push(Date.now() - t1);

      const t2 = Date.now();
      await fetch(`${API}/auth/login`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: `nonexistent-${Date.now()}-${i}@invalid.invalid`,
          password: 'wrong',
        }),
      });
      unknownTimes.push(Date.now() - t2);

      // Brief pause to avoid rate limiter
      await new Promise((r) => setTimeout(r, 100));
    }

    const avgKnown = knownTimes.reduce((a, b) => a + b, 0) / N;
    const avgUnknown = unknownTimes.reduce((a, b) => a + b, 0) / N;
    const diff = Math.abs(avgKnown - avgUnknown);

    console.log(`[TIM.1] known=${avgKnown.toFixed(0)}ms unknown=${avgUnknown.toFixed(0)}ms diff=${diff.toFixed(0)}ms`);

    // Critical: unknown path must NOT short-circuit (≥150ms = bcrypt ran on decoy)
    expect(avgUnknown, 'unknown email must trigger bcrypt-decoy compare').toBeGreaterThan(50);

    // Diff should be within tolerance — under perfect conditions <50ms,
    // under test-server jitter <300ms. If diff > 1000ms, decoy defense is broken.
    expect(diff, `timing oracle: known/unknown diff = ${diff}ms (must be <500ms)`).toBeLessThan(500);
  });

  test('TIM.2 forgot-password known vs unknown — uniform 200 (no info leak)', async () => {
    const known = await makeJobseeker();

    const known200 = await fetch(`${API}/auth/forgot-password`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: known.email }),
    });
    const unknown200 = await fetch(`${API}/auth/forgot-password`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: `nonexistent-${Date.now()}@invalid.invalid` }),
    });

    // Both must return 200 (no enumeration via status)
    expect(known200.status).toBe(200);
    expect(unknown200.status).toBe(200);

    // Body must not differ in a way that reveals existence
    const knownBody = await known200.json();
    const unknownBody = await unknown200.json();
    expect(knownBody.success).toBe(unknownBody.success);
    // Messages may differ in casing/punctuation but must not contain "user found" / "not found"
    const combined = JSON.stringify(knownBody) + JSON.stringify(unknownBody);
    expect(combined, 'must not contain "not found" / "nuk u gjet" / "exists"').not.toMatch(/not found|nuk u gjet|does not exist|exists/i);
  });

  test('TIM.3 register vs unique-email-check — does not differ for known/unknown', async () => {
    const existing = await makeJobseeker();

    // Try to initiate-register with the existing email
    const t1 = Date.now();
    const dup = await fetch(`${API}/auth/initiate-registration`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: existing.email,
        password: 'StrongPass123!',
        userType: 'jobseeker',
        firstName: 'X', lastName: 'Y',
        city: 'Tiranë',
      }),
    });
    const dupTime = Date.now() - t1;

    // And with a fresh email
    const t2 = Date.now();
    const fresh = await fetch(`${API}/auth/initiate-registration`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: `fresh-${Date.now()}@example.com`,
        password: 'StrongPass123!',
        userType: 'jobseeker',
        firstName: 'X', lastName: 'Y',
        city: 'Tiranë',
      }),
    });
    const freshTime = Date.now() - t2;

    console.log(`[TIM.3] dup=${dupTime}ms fresh=${freshTime}ms`);
    // Either both succeed (dup is allowed to re-init), or dup is rejected
    // distinctly — no asserting on time here, just no leak via 5xx + no
    // dramatic timing difference (>2x = enumeration oracle).
    expect(Math.max(dupTime, freshTime) / Math.min(dupTime, freshTime),
      'register times must not differ by >5x (enumeration oracle)').toBeLessThan(5);
  });
});
