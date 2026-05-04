/**
 * locations.spec.ts — GET /api/locations + GET /api/locations/popular
 *
 * 4 tests covering the public location endpoints (powers the city dropdowns).
 */

import { test } from '@playwright/test';
import { dbClear, dbFind, dbUpdate } from '../../../real-backend/db-helpers';
import { makeEmployer, authHeaders, API } from '../../../real-backend/factory-helpers';
import { expect } from '@playwright/test';

test.describe('Domain / locations', () => {
  test.beforeEach(async () => { await dbClear(); });

  test('L.1 GET /api/locations returns active Albanian cities', async () => {
    const r = await fetch(`${API}/locations`);
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data?.locations)).toBe(true);
    const cities = body.data.locations.map((l: any) => l.city);
    expect(cities).toContain('Tiranë');
    expect(cities).toContain('Durrës');
    // Every returned location should be active
    for (const loc of body.data.locations) {
      expect(loc.isActive).toBe(true);
    }
  });

  test('L.2 inactive locations are filtered out', async () => {
    // Mark Berat inactive
    await dbUpdate('locations', { city: 'Berat' }, { $set: { isActive: false } });
    const r = await fetch(`${API}/locations`);
    const body = await r.json();
    const cities = body.data.locations.map((l: any) => l.city);
    expect(cities).not.toContain('Berat');
    // Restore for other tests in series
    await dbUpdate('locations', { city: 'Berat' }, { $set: { isActive: true } });
  });

  test('L.3 GET /api/locations/popular returns sorted by jobCount desc', async () => {
    // Seed 3 jobs in Tirane to bump its jobCount via post-save hook
    const emp = await makeEmployer({ preApprove: true });
    for (let i = 0; i < 3; i++) {
      await fetch(`${API}/jobs`, {
        method: 'POST', headers: authHeaders(emp.token),
        body: JSON.stringify({
          title: `Pop-${i}`, description: 'x'.repeat(80),
          category: 'Teknologji', jobType: 'full-time',
          location: { city: 'Tiranë' },
          salary: { min: 1000, max: 2000, currency: 'EUR' },
        platformCategories: { diaspora: false, ngaShtepia: false, partTime: false, administrata: false, sezonale: false }
        })
      });
    }

    const r = await fetch(`${API}/locations/popular`);
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data?.locations)).toBe(true);
    if (body.data.locations.length >= 2) {
      // Sorted by jobCount descending
      const counts = body.data.locations.map((l: any) => l.jobCount ?? 0);
      for (let i = 1; i < counts.length; i++) {
        expect(counts[i]).toBeLessThanOrEqual(counts[i - 1]);
      }
    }
    // Tiranë should be present (and its jobCount should be > 0)
    const tirane = body.data.locations.find((l: any) => l.city === 'Tiranë');
    expect(tirane, 'Tiranë should appear in popular locations after 3 job posts').toBeDefined();
    expect(tirane.jobCount, 'Tiranë jobCount should reflect 3 posted jobs').toBeGreaterThanOrEqual(3);
  });

  test('L.4 locations endpoint is public (no auth required)', async () => {
    const r = await fetch(`${API}/locations`);
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.success).toBe(true);
  });
});
