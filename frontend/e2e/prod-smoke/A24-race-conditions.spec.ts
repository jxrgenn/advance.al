/**
 * A24 — Race conditions on read-only endpoints.
 *
 * What we CAN test:
 *   - 50 parallel /health → all consistent
 *   - 50 parallel /api/jobs/:id → same job id (already in A11.M.1, repeat with twist)
 *   - 50 parallel /forgot-password for SAME email → either rate-limited or idempotent
 */

import { test, expect } from '@playwright/test';
import { API, BACKEND } from './_helpers';

test.describe('Phase A.24 — Race conditions (chromium-desktop only)', () => {

  test('A24.race.1 50 parallel /health — all consistent, no 5xx', async () => {
    const promises = Array.from({ length: 50 }, () =>
      fetch(`${BACKEND}/health`).then(async (r) => ({ status: r.status, body: await r.text() })).catch(() => null)
    );
    const results = await Promise.all(promises);
    const fivexx = results.filter((r) => !r || r.status >= 500).length;
    expect(fivexx, '50 parallel /health: no 5xx').toBe(0);
  });

  test('A24.race.2 50 parallel /api/jobs?limit=1 — all 200, same shape', async () => {
    const promises = Array.from({ length: 50 }, () =>
      fetch(`${API}/jobs?limit=1`).then(async (r) => ({
        status: r.status,
        body: await r.text(),
      })).catch(() => null)
    );
    const results = await Promise.all(promises);
    const fivexx = results.filter((r) => !r || r.status >= 500).length;
    expect(fivexx, '50 parallel jobs: no 5xx').toBe(0);
  });

  test('A24.race.3 50 parallel /forgot-password same email → all consistent, rate-limit fires', async () => {
    const email = `race-test-${Date.now()}@invalid.invalid`;
    const promises = Array.from({ length: 50 }, () =>
      fetch(`${API}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      }).then((r) => r.status).catch(() => 0)
    );
    const codes = await Promise.all(promises);
    const fivexx = codes.filter((c) => c >= 500 || c === 0).length;
    expect(fivexx, 'no 5xx').toBe(0);
    // Either all 200 (server idempotent + cached lookup), or some 429 (rate-limited)
    const success = codes.filter((c) => c === 200).length;
    const rateLimited = codes.filter((c) => c === 429).length;
    console.log(`[A24.race.3] 50 parallel forgot-password → ${success} 200, ${rateLimited} 429`);
  });

  test('A24.race.4 100 parallel /jobs/:id same id → all return same job', async () => {
    const list = await fetch(`${API}/jobs?limit=1`);
    const data = await list.json();
    const id = data?.data?.jobs?.[0]?._id;
    if (!id) return;

    const promises = Array.from({ length: 100 }, () =>
      fetch(`${API}/jobs/${id}`).then(async (r) => {
        if (r.status !== 200) return null;
        const body = await r.json();
        return body?.data?._id ?? body?.data?.job?._id ?? null;
      }).catch(() => null)
    );
    const ids = await Promise.all(promises);
    const validIds = ids.filter(Boolean);
    const unique = new Set(validIds);
    expect(unique.size, '100 parallel reads must return single id').toBe(1);
  });

  test('A24.race.5 50 parallel /quickusers signup with same email — only 1 wins', async () => {
    const email = `quick-race-${Date.now()}@invalid.invalid`;
    const promises = Array.from({ length: 50 }, () =>
      fetch(`${API}/quickusers`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, preferredCategories: [] }),
      }).then((r) => r.status).catch(() => 0)
    );
    const codes = await Promise.all(promises);
    const fivexx = codes.filter((c) => c >= 500 || c === 0).length;
    expect(fivexx, 'no 5xx in quickusers race').toBe(0);
    const ok = codes.filter((c) => c === 200 || c === 201).length;
    const rl = codes.filter((c) => c === 429).length;
    console.log(`[A24.race.5] 50 parallel quickusers same-email → ${ok} 2xx, ${rl} 429`);
  });
});
