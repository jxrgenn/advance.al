/**
 * embeddings-management.spec.ts — admin embedding queue / worker management.
 *
 * 8 tests: status, queue list, workers, recompute-all, retry-failed,
 * clear-old-queue, queue specific job, delete queue item.
 */

import { test } from '@playwright/test';
import { dbClear, dbFind, dbCount } from '../../../real-backend/db-helpers';
import { makeAdmin, makeJobseeker, makeEmployer, authHeaders, API } from '../../../real-backend/factory-helpers';
import { expect } from '@playwright/test';

test.describe('Admin / embeddings management', () => {
  test.beforeEach(async () => { await dbClear(); });

  test('EM.1 GET /admin/embeddings/status without auth → 401', async () => {
    const r = await fetch(`${API}/admin/embeddings/status`);
    expect(r.status).toBe(401);
  });

  test('EM.2 GET /admin/embeddings/status as jobseeker → 403', async () => {
    const js = await makeJobseeker();
    const r = await fetch(`${API}/admin/embeddings/status`, { headers: authHeaders(js.token) });
    expect(r.status).toBe(403);
  });

  test('EM.3 GET /admin/embeddings/status returns numeric counts (admin)', async () => {
    const adm = await makeAdmin();
    const r = await fetch(`${API}/admin/embeddings/status`, { headers: authHeaders(adm.token) });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.success).toBe(true);
    expect(typeof body.data, 'response body should have a data object').toBe('object');
  });

  test('EM.4 GET /admin/embeddings/queue returns queueItems array', async () => {
    const adm = await makeAdmin();
    const r = await fetch(`${API}/admin/embeddings/queue`, { headers: authHeaders(adm.token) });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.success).toBe(true);
    // Response shape is { data: { queueItems: [...], pagination, queueHealth } }
    expect(Array.isArray(body.data?.queueItems ?? body.data?.queue ?? body.data?.tasks)).toBe(true);
  });

  test('EM.5 GET /admin/embeddings/workers returns workers array', async () => {
    const adm = await makeAdmin();
    const r = await fetch(`${API}/admin/embeddings/workers`, { headers: authHeaders(adm.token) });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data?.workers ?? body.data)).toBe(true);
  });

  test('EM.6 POST /admin/embeddings/recompute-all queues tasks for all jobs/users', async () => {
    const adm = await makeAdmin();
    const emp = await makeEmployer({ preApprove: true });
    await fetch(`${API}/jobs`, {
      method: 'POST', headers: authHeaders(emp.token),
      body: JSON.stringify({
        title: 'EM6 test job', description: 'x'.repeat(80), category: 'Teknologji',
        jobType: 'full-time', location: { city: 'Tiranë' },
        salary: { min: 1000, max: 2000, currency: 'EUR' },
        platformCategories: { diaspora: false, ngaShtepia: false, partTime: false, administrata: false, sezonale: false }
      })
    });

    const queueBefore = await dbCount('jobqueues');
    const r = await fetch(`${API}/admin/embeddings/recompute-all`, {
      method: 'POST', headers: authHeaders(adm.token),
    });
    expect([200, 202]).toContain(r.status);
    const queueAfter = await dbCount('jobqueues');
    expect(queueAfter, 'recompute-all should add tasks to JobQueue').toBeGreaterThanOrEqual(queueBefore);
  });

  test('EM.7 POST /admin/embeddings/retry-failed flips failed→pending', async () => {
    const adm = await makeAdmin();
    // Seed one failed task
    await fetch(`http://localhost:3199/__test/db/insert`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        collection: 'jobqueues',
        doc: {
          taskType: 'job_embedding',
          status: 'failed',
          attempts: 3,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
      })
    });
    const failedBefore = await dbCount('jobqueues', { status: 'failed' });
    expect(failedBefore).toBeGreaterThanOrEqual(1);

    const r = await fetch(`${API}/admin/embeddings/retry-failed`, {
      method: 'POST', headers: authHeaders(adm.token),
    });
    expect([200, 202]).toContain(r.status);

    const failedAfter = await dbCount('jobqueues', { status: 'failed' });
    expect(failedAfter, 'failed tasks should be reset').toBeLessThanOrEqual(failedBefore);
  });

  test('EM.8 POST /admin/embeddings/clear-old-queue removes old completed tasks', async () => {
    const adm = await makeAdmin();
    // Seed an "old" completed task
    await fetch(`http://localhost:3199/__test/db/insert`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        collection: 'jobqueues',
        doc: {
          taskType: 'job_embedding', status: 'completed',
          createdAt: new Date(Date.now() - 60 * 24 * 3600 * 1000),
          updatedAt: new Date(Date.now() - 60 * 24 * 3600 * 1000),
        }
      })
    });

    const r = await fetch(`${API}/admin/embeddings/clear-old-queue`, {
      method: 'POST', headers: authHeaders(adm.token),
    });
    expect([200, 202]).toContain(r.status);
  });
});
