/**
 * A2 — API contract conformance against the live backend.
 *
 * Hits every public/optional-auth endpoint, asserts response shape,
 * pagination math, filter parity, sort order. Pure HTTP via fetch —
 * no browser, runs only on chromium-desktop project to avoid 5x duplication.
 */

import { test, expect } from '@playwright/test';
import { API, BACKEND, fetchAnyPublicJobId, fetchAnyCompanyId, expectNot5xx } from './_helpers';

test.describe('Phase A.2 — API contract conformance (chromium-desktop only via config testMatch)', () => {
  test('A2.1 GET /health → {success, message, redis}', async () => {
    const r = await fetch(`${BACKEND}/health`);
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.success).toBe(true);
    expect(typeof body.message).toBe('string');
    expect(body.timestamp).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(['connected', 'not_configured', 'error']).toContain(body.redis);
    // Production /health response is the minimal shape (no `environment`,
    // `uptime`, etc.) — confirms NODE_ENV=production on Render.
    expect(body.environment, 'prod /health must NOT leak environment field').toBeUndefined();
    expect(body.uptime, 'prod /health must NOT leak uptime').toBeUndefined();
  });

  test('A2.2 GET /api/jobs returns shape {success, data: { jobs, pagination }}', async () => {
    const r = await fetch(`${API}/jobs?limit=5`);
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data?.jobs)).toBe(true);
    expect(body.data.pagination, 'pagination object present').toBeTruthy();
    expect(typeof body.data.pagination.totalPages).toBe('number');
    expect(typeof body.data.pagination.totalJobs ?? body.data.pagination.total).toBe('number');
  });

  test('A2.3 /api/jobs job records have required fields', async () => {
    const r = await fetch(`${API}/jobs?limit=3`);
    const body = await r.json();
    const jobs = body.data?.jobs ?? [];
    expect(jobs.length, 'must return at least 1 job').toBeGreaterThan(0);
    for (const j of jobs) {
      expect(j._id, 'job _id present').toBeTruthy();
      expect(j.title, 'job title present').toBeTruthy();
      expect(j.location?.city, 'job city present').toBeTruthy();
      expect(j.category, 'job category present').toBeTruthy();
      expect(j.jobType, 'job jobType present').toBeTruthy();
    }
  });

  test('A2.4 /api/jobs?city= filter parity (returns only that city)', async () => {
    const r = await fetch(`${API}/jobs?city=Tiran%C3%AB&limit=20`);
    expect(r.status).toBe(200);
    const body = await r.json();
    const jobs = body.data?.jobs ?? [];
    if (jobs.length > 0) {
      for (const j of jobs) {
        expect(j.location?.city, 'city filter must return only Tiranë jobs').toBe('Tiranë');
      }
    }
    // 0 jobs is also valid — just ensure the request didn't 5xx
  });

  test('A2.5 /api/jobs pagination math (page 2)', async () => {
    const page1 = await fetch(`${API}/jobs?page=1&limit=5`).then(r => r.json());
    const page2 = await fetch(`${API}/jobs?page=2&limit=5`).then(r => r.json());
    expect(page1.success).toBe(true);
    expect(page2.success).toBe(true);
    if (page1.data.pagination.totalPages >= 2) {
      // hasNextPage / hasPrevPage if exposed
      const ids1 = page1.data.jobs.map((j: any) => j._id);
      const ids2 = page2.data.jobs.map((j: any) => j._id);
      const intersection = ids1.filter((id: string) => ids2.includes(id));
      expect(intersection.length, 'page 1 and page 2 must not overlap').toBe(0);
    }
  });

  test('A2.6 /api/jobs?sortBy=postedAt&sortOrder=desc returns newest first', async () => {
    const r = await fetch(`${API}/jobs?sortBy=postedAt&sortOrder=desc&limit=10`);
    const body = await r.json();
    const jobs = body.data?.jobs ?? [];
    if (jobs.length >= 2) {
      const dates = jobs.map((j: any) => new Date(j.postedAt).getTime());
      for (let i = 0; i < dates.length - 1; i++) {
        expect(dates[i], `sort desc: jobs[${i}].postedAt >= jobs[${i+1}].postedAt`).toBeGreaterThanOrEqual(dates[i+1]);
      }
    }
  });

  test('A2.7 /api/jobs/:id detail shape', async () => {
    const id = await fetchAnyPublicJobId();
    const r = await fetch(`${API}/jobs/${id}`);
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.success).toBe(true);
    expect(body.data?.job?._id ?? body.data?._id).toBeTruthy();
  });

  test('A2.8 /api/jobs/:id with bogus ObjectId → 404, never 5xx', async () => {
    const r = await fetch(`${API}/jobs/000000000000000000000000`);
    expect(r.status).toBe(404);
    expectNot5xx(r.status, '/api/jobs/:bogus');
  });

  test('A2.9 /api/jobs/:id/similar returns array', async () => {
    const id = await fetchAnyPublicJobId();
    const r = await fetch(`${API}/jobs/${id}/similar`);
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.success).toBe(true);
    // Production response shape is `{success, data: {similarJobs: [...], count, cached}}`.
    // Accept either `similarJobs`, `jobs`, or top-level `data` array for forward compat.
    const similar = body.data?.similarJobs ?? body.data?.jobs ?? body.data ?? [];
    expect(Array.isArray(similar), 'similar response must be an array').toBe(true);
  });

  test('A2.10 /api/locations returns Albanian cities', async () => {
    const r = await fetch(`${API}/locations`);
    expect(r.status).toBe(200);
    const body = await r.json();
    const locs = body.data?.locations ?? [];
    expect(locs.length, 'at least 1 location seeded').toBeGreaterThan(0);
    const cities = locs.map((l: any) => l.city);
    expect(cities.some((c: string) => /Tiranë|Durrës|Vlorë|Shkodër/.test(c)), 'major Albanian cities present').toBe(true);
  });

  test('A2.11 /api/locations/popular sorted by jobCount desc', async () => {
    const r = await fetch(`${API}/locations/popular`);
    expect(r.status).toBe(200);
    const body = await r.json();
    const locs = body.data?.locations ?? [];
    if (locs.length >= 2) {
      for (let i = 0; i < locs.length - 1; i++) {
        const a = locs[i].jobCount ?? 0;
        const b = locs[i+1].jobCount ?? 0;
        expect(a, 'popular sorted desc by jobCount').toBeGreaterThanOrEqual(b);
      }
    }
  });

  test('A2.12 /api/stats/public returns numeric counts', async () => {
    const r = await fetch(`${API}/stats/public`);
    expect(r.status).toBe(200);
    const body = await r.json();
    const d = body.data ?? {};
    expect(typeof d.totalJobs).toBe('number');
    expect(typeof d.activeJobs).toBe('number');
    expect(typeof d.totalCompanies).toBe('number');
    expect(typeof d.totalJobSeekers).toBe('number');
    expect(typeof d.totalApplications).toBe('number');
    expect(d.activeJobs, 'activeJobs <= totalJobs').toBeLessThanOrEqual(d.totalJobs);
    expect(Array.isArray(d.recentJobs), 'recentJobs is array').toBe(true);
  });

  test('A2.13 /api/companies pagination shape', async () => {
    const r = await fetch(`${API}/companies?limit=5`);
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data?.companies)).toBe(true);
  });

  test('A2.14 /api/companies/:id detail or graceful 404', async () => {
    const id = await fetchAnyCompanyId();
    if (id) {
      const r = await fetch(`${API}/companies/${id}`);
      expectNot5xx(r.status, '/api/companies/:id');
      expect([200, 404]).toContain(r.status);
    }
  });

  test('A2.15 /api/companies/:bogus → 404', async () => {
    const r = await fetch(`${API}/companies/000000000000000000000000`);
    expect(r.status).toBe(404);
  });

  test('A2.16 /api/configuration/public returns settings', async () => {
    const r = await fetch(`${API}/configuration/public`);
    expectNot5xx(r.status, '/api/configuration/public');
    expect([200, 404]).toContain(r.status);
    if (r.status === 200) {
      const body = await r.json();
      expect(body.success).toBe(true);
      expect(typeof body.data === 'object').toBe(true);
    }
  });

  test('A2.17 GET /api/configuration (auth-required) → 401 without token', async () => {
    const r = await fetch(`${API}/configuration`);
    expect([401, 403]).toContain(r.status);
  });

  test('A2.18 GET /api/users/profile → 401 without token', async () => {
    const r = await fetch(`${API}/users/profile`);
    expect(r.status).toBe(401);
  });

  test('A2.19 GET /api/admin/dashboard → 401 without token', async () => {
    const r = await fetch(`${API}/admin/dashboard`);
    expect(r.status).toBe(401);
  });

  test('A2.20 Error response shape consistency on 4xx', async () => {
    // Invalid request body to /api/auth/login → expect {success: false, message}
    const r = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect([400, 401]).toContain(r.status);
    const body = await r.json();
    expect(body.success).toBe(false);
    expect(typeof body.message).toBe('string');
    expect(body.message.length).toBeGreaterThan(0);
  });

  test('A2.21 Error response has no stack trace in production', async () => {
    const r = await fetch(`${API}/jobs/000000000000000000000000`);
    const body = await r.json();
    expect(JSON.stringify(body).toLowerCase(), 'no stack-trace leak').not.toMatch(/at \w+\.\w+\s*\(/);
    expect(JSON.stringify(body).toLowerCase(), 'no /node_modules/ path leak').not.toContain('/node_modules/');
  });

  test('A2.22 Date format is ISO 8601 across endpoints', async () => {
    const r = await fetch(`${API}/jobs?limit=1`);
    const body = await r.json();
    const j = body.data?.jobs?.[0];
    if (j?.postedAt) {
      expect(j.postedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    }
    if (j?.expiresAt) {
      expect(j.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    }
  });

  test('A2.23 /api/auth/me → 401 with descriptive message', async () => {
    const r = await fetch(`${API}/auth/me`);
    expect(r.status).toBe(401);
    const body = await r.json();
    expect(body.success).toBe(false);
    expect(typeof body.message).toBe('string');
    // Must not reveal internal info ("jwt expired" specifically vs generic message)
    expect(body.message, 'no internal detail leak').not.toMatch(/stack|TypeError|ReferenceError/i);
  });

  test('A2.24 unknown route /api/does-not-exist → 404', async () => {
    const r = await fetch(`${API}/does-not-exist`);
    expect(r.status).toBe(404);
  });

  test('A2.25 /api/notifications → 401 without token', async () => {
    const r = await fetch(`${API}/notifications`);
    expect(r.status).toBe(401);
  });
});
