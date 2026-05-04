/**
 * stats.spec.ts — GET /api/stats/public
 *
 * 3 tests covering the homepage public-stats endpoint.
 */

import { test } from '@playwright/test';
import { dbClear } from '../../../real-backend/db-helpers';
import { makeEmployer, makeJobseeker, authHeaders, API } from '../../../real-backend/factory-helpers';
import { expect } from '@playwright/test';

test.describe('Domain / public stats', () => {
  test.beforeEach(async () => { await dbClear(); });

  test('S.1 GET /api/stats/public returns numeric counts and is public', async () => {
    const r = await fetch(`${API}/stats/public`);
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.success).toBe(true);
    // Documented response fields — must exist as numbers
    const data = body.data ?? body;
    const numericFields = ['totalJobs', 'totalJobSeekers', 'totalCompanies'];
    for (const field of numericFields) {
      // Either at top level or nested under stats
      const v = data[field] ?? data.stats?.[field];
      expect(typeof v, `field ${field} should be a number`).toBe('number');
      expect(v, `field ${field} should be >= 0`).toBeGreaterThanOrEqual(0);
    }
  });

  test('S.2 stats reflect new users and jobs when added (after setup, before first call)', async () => {
    // /stats/public uses an in-memory cache (5min TTL) seeded on first call,
    // so we must add fixtures BEFORE the first call; otherwise the cache holds
    // stale zeros until expiry. Hit endpoint just once after setup.
    await makeJobseeker();
    const emp = await makeEmployer({ preApprove: true });
    await fetch(`${API}/jobs`, {
      method: 'POST', headers: authHeaders(emp.token),
      body: JSON.stringify({
        title: 'StatsTest', description: 'x'.repeat(80), category: 'Teknologji',
        jobType: 'full-time', location: { city: 'Tiranë' },
        salary: { min: 1000, max: 2000, currency: 'EUR' },
        platformCategories: { diaspora: false, ngaShtepia: false, partTime: false, administrata: false, sezonale: false }
      })
    });

    const after = await fetch(`${API}/stats/public`).then(r => r.json());
    const afterData = after.data ?? after;
    const afterUsers = afterData.totalJobSeekers ?? afterData.stats?.totalJobSeekers ?? 0;
    const afterCompanies = afterData.totalCompanies ?? afterData.stats?.totalCompanies ?? 0;
    expect(afterUsers, 'totalJobSeekers should be >= 1 (one created above)').toBeGreaterThanOrEqual(1);
    expect(afterCompanies, 'totalCompanies should be >= 1').toBeGreaterThanOrEqual(1);
  });

  test('S.3 stats endpoint never returns 5xx and never includes internal fields', async () => {
    const r = await fetch(`${API}/stats/public`);
    expect(r.status).toBe(200);
    const text = await r.text();
    // Should not leak internal mongoose fields, _id arrays, stack traces, etc.
    expect(text, 'public stats must not include stack traces').not.toMatch(/at .* \(.*\.js:\d+:\d+\)/);
    expect(text, 'public stats must not include MongoDB connection strings').not.toMatch(/mongodb\+srv:|mongodb:\/\//);
    expect(text, 'public stats must not include API keys').not.toMatch(/sk-[a-zA-Z0-9]{20}/);
  });
});
