/**
 * Phase 28 — coverage push for jobs.js GET /?category= single-category branch.
 *
 * Existing tests cover ?categories=A,B (CSV/multiple, L237-244) but not the
 * legacy ?category=A single-value branch (L245-248). Adds direct coverage
 * to ensure backward compatibility with old clients.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createVerifiedEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';

describe('jobs.js — GET /?category= single-category filter', () => {
  beforeAll(async () => {
    await connectTestDB();
    await seedLocations();
  });

  afterEach(async () => {
    await clearTestDB();
    await seedLocations();
  });

  afterAll(async () => {
    await closeTestDB();
  });

  it('?category=Teknologji filters to Teknologji jobs only (L245-248)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    await createJob(emp, { category: 'Teknologji', title: 'Tech Job' });
    await createJob(emp, { category: 'Marketing', title: 'Mkt Job' });

    const r = await request(app).get('/api/jobs?category=Teknologji');
    expect(r.status).toBe(200);
    expect(r.body.data.jobs.every(j => j.category === 'Teknologji')).toBe(true);
    expect(r.body.data.jobs.length).toBeGreaterThanOrEqual(1);
  });

  it('?category= overridden by ?categories= when both present (L237 priority)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    await createJob(emp, { category: 'Teknologji' });
    await createJob(emp, { category: 'Marketing' });

    // categories= takes precedence over category=
    const r = await request(app).get('/api/jobs?category=Marketing&categories=Teknologji,Marketing');
    expect(r.status).toBe(200);
    // Both should be returned because categories= wins
    expect(r.body.data.jobs.length).toBeGreaterThanOrEqual(2);
  });
});
