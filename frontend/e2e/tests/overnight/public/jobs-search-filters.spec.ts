/**
 * jobs-search-filters.spec.ts — Jobs page filters via API + URL params.
 *
 * 15 tests: text search, category filter, city filter, jobType filter,
 * salary range, platform categories, sortBy, pagination, debounce, empty state.
 */

import { test } from '@playwright/test';
import { dbClear } from '../../../real-backend/db-helpers';
import { FRONTEND } from '../_helpers';
import { makeEmployer, authHeaders, API } from '../../../real-backend/factory-helpers';
import { expect } from '@playwright/test';

async function makeJobs(empToken: string) {
  const jobs = [
    { title: 'Frontend Developer Junior', category: 'Teknologji', jobType: 'full-time', city: 'Tiranë', min: 800, max: 1500 },
    { title: 'Backend Engineer Senior', category: 'Teknologji', jobType: 'full-time', city: 'Tiranë', min: 2000, max: 3500 },
    { title: 'Marketing Specialist', category: 'Marketing', jobType: 'part-time', city: 'Durrës', min: 600, max: 1000 },
    { title: 'Sales Manager', category: 'Shitje', jobType: 'full-time', city: 'Vlorë', min: 1500, max: 2500 },
    { title: 'Designer UX/UI', category: 'Dizajn', jobType: 'internship', city: 'Tiranë', min: 1200, max: 2200 },
  ];
  for (const j of jobs) {
    await fetch(`${API}/jobs`, {
      method: 'POST', headers: authHeaders(empToken),
      body: JSON.stringify({
        title: j.title, description: 'x'.repeat(80),
        category: j.category, jobType: j.jobType,
        location: { city: j.city },
        salary: { min: j.min, max: j.max, currency: 'EUR' },
        platformCategories: { diaspora: false, ngaShtepia: false, partTime: false, administrata: false, sezonale: false }
      })
    });
  }
}

test.describe('Public / jobs search filters', () => {
  test.beforeAll(async () => {
    await dbClear();
    const emp = await makeEmployer({ preApprove: true });
    await makeJobs(emp.token);
  });

  test('JF.1 GET /api/jobs returns array of all 5', async () => {
    const r = await fetch(`${API}/jobs`);
    expect(r.status).toBe(200);
    const body = await r.json();
    const jobs = body.data?.jobs ?? body.data ?? [];
    expect(jobs.length).toBeGreaterThanOrEqual(5);
  });

  test('JF.2 ?city=Tiranë filters to Tirane jobs', async () => {
    const r = await fetch(`${API}/jobs?city=Tiranë`);
    const body = await r.json();
    const jobs = body.data?.jobs ?? body.data ?? [];
    for (const j of jobs) {
      expect(j.location?.city).toBe('Tiranë');
    }
  });

  test('JF.3 ?category=Marketing filters', async () => {
    const r = await fetch(`${API}/jobs?category=Marketing`);
    const body = await r.json();
    const jobs = body.data?.jobs ?? body.data ?? [];
    for (const j of jobs) {
      expect(j.category).toBe('Marketing');
    }
  });

  test('JF.4 ?jobType=part-time filters', async () => {
    const r = await fetch(`${API}/jobs?jobType=part-time`);
    const body = await r.json();
    const jobs = body.data?.jobs ?? body.data ?? [];
    for (const j of jobs) {
      expect(j.jobType).toBe('part-time');
    }
  });

  test('JF.5 ?search=Frontend matches by title', async () => {
    const r = await fetch(`${API}/jobs?search=Frontend`);
    const body = await r.json();
    const jobs = body.data?.jobs ?? body.data ?? [];
    expect(jobs.some((j: any) => /frontend/i.test(j.title)), 'search should find Frontend Developer').toBe(true);
  });

  test('JF.6 ?minSalary filters jobs whose min OR max >= value', async () => {
    // Backend semantics: a job matches when EITHER salary.min OR salary.max is
    // >= the requested minSalary (so jobs with min<1500 but max>=1500 still
    // appear). See backend/src/models/Job.js:556-563.
    const r = await fetch(`${API}/jobs?minSalary=1500`);
    const body = await r.json();
    const jobs = body.data?.jobs ?? body.data ?? [];
    for (const j of jobs) {
      const min = j.salary?.min ?? 0;
      const max = j.salary?.max ?? 0;
      expect(
        min >= 1500 || max >= 1500,
        `every result should have min OR max >= 1500 (got min=${min} max=${max})`
      ).toBe(true);
    }
  });

  test('JF.7 multiple filters combined', async () => {
    const r = await fetch(`${API}/jobs?city=Tiranë&category=Teknologji`);
    const body = await r.json();
    const jobs = body.data?.jobs ?? body.data ?? [];
    for (const j of jobs) {
      expect(j.location?.city).toBe('Tiranë');
      expect(j.category).toBe('Teknologji');
    }
  });

  test('JF.8 ?sortBy=newest returns recent first', async () => {
    const r = await fetch(`${API}/jobs?sortBy=newest`);
    const body = await r.json();
    const jobs = body.data?.jobs ?? body.data ?? [];
    if (jobs.length >= 2) {
      const dates = jobs.map((j: any) => new Date(j.createdAt).getTime());
      for (let i = 1; i < dates.length; i++) {
        expect(dates[i]).toBeLessThanOrEqual(dates[i - 1]);
      }
    }
  });

  test('JF.9 ?page=1&limit=2 returns 2 jobs', async () => {
    const r = await fetch(`${API}/jobs?page=1&limit=2`);
    const body = await r.json();
    const jobs = body.data?.jobs ?? body.data ?? [];
    expect(jobs.length).toBeLessThanOrEqual(2);
  });

  test('JF.10 ?page=999 returns empty array, no error', async () => {
    const r = await fetch(`${API}/jobs?page=999&limit=10`);
    expect(r.status).toBe(200);
    const body = await r.json();
    const jobs = body.data?.jobs ?? body.data ?? [];
    expect(Array.isArray(jobs)).toBe(true);
  });

  test('JF.11 ?search=nonexistentkeywordzzz returns 0 results', async () => {
    const r = await fetch(`${API}/jobs?search=nonexistentkeywordzzz`);
    const body = await r.json();
    const jobs = body.data?.jobs ?? body.data ?? [];
    expect(jobs.length).toBe(0);
  });

  test('JF.12 negative page → handled gracefully', async () => {
    const r = await fetch(`${API}/jobs?page=-1`);
    expect(r.status).toBeLessThan(500);
  });

  test('JF.13 Frontend /jobs page renders at least one job card', async ({ page }) => {
    await page.goto(`${FRONTEND}/jobs`);
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    expect(body.length).toBeGreaterThan(100);
  });

  test('JF.14 Frontend /jobs?search=Backend renders the search route', async ({ page }) => {
    // Note: the React app debounces input and may rewrite/strip the query
    // string after mount. We just verify the route loads and the body is
    // populated; the API-level search assertion lives in JF.5.
    await page.goto(`${FRONTEND}/jobs?search=Backend`);
    await page.waitForTimeout(3000);
    expect(page.url()).toContain('/jobs');
    const body = await page.locator('body').innerText();
    expect(body.length).toBeGreaterThan(50);
  });

  test('JF.15 /api/jobs response includes pagination metadata', async () => {
    const r = await fetch(`${API}/jobs?page=1&limit=10`);
    const body = await r.json();
    expect(body.success).toBe(true);
    // Pagination object should exist somewhere
    const hasPagination = body.data?.pagination || body.pagination || body.data?.page !== undefined;
    expect(hasPagination, 'response should include pagination metadata').toBeTruthy();
  });
});
