/**
 * QA Round 2 — API data-exposure contract test.
 *
 * The companion to api-contract-drift.test.js. Where that test asserts
 * required fields are PRESENT, this one asserts forbidden fields are ABSENT:
 * it deep-scans every public read endpoint's JSON and fails if any sensitive
 * or internal field ever leaks. This is the permanent guardrail — if a future
 * change starts shipping a denylisted field, CI goes red here.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createJobseeker, createVerifiedEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import User from '../../src/models/User.js';

/** Recursively collect every object key that appears anywhere in `value`. */
function allKeys(value, acc = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) allKeys(item, acc);
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      acc.add(k);
      allKeys(v, acc);
    }
  }
  return acc;
}

function assertNoKeys(body, forbidden, label) {
  const present = allKeys(body);
  const leaked = forbidden.filter(k => present.has(k));
  if (leaked.length) {
    throw new Error(`${label} leaked forbidden field(s): ${leaked.join(', ')}`);
  }
}

// Secrets / auth material — must NEVER appear in any response.
const SECRETS = [
  'password', 'refreshTokens', 'passwordResetToken', 'passwordResetExpires',
  'emailVerificationToken', 'emailVerificationExpires', 'embedding',
];
// Internal Job operational state — must not ride along on public job payloads.
const JOB_INTERNAL = [
  'similarJobs', 'similarityMetadata', 'notification',
  'paymentId', 'paymentStatus', 'paidAt', 'paymentMethod',
];

describe('API data-exposure — public endpoints never leak sensitive/internal fields', () => {
  beforeAll(async () => { await connectTestDB(); await seedLocations(); });
  beforeEach(async () => { await clearTestDB(); await seedLocations(); });
  afterAll(async () => { await closeTestDB(); });

  it('GET /api/jobs (list, logged-out) — no secrets, no internal job fields', async () => {
    const { user: emp } = await createVerifiedEmployer();
    await createJob(emp);
    const r = await request(app).get('/api/jobs');
    expect(r.status).toBe(200);
    assertNoKeys(r.body, SECRETS, 'GET /api/jobs');
    assertNoKeys(r.body, JOB_INTERNAL, 'GET /api/jobs');
  });

  it('GET /api/jobs/:id (logged-out) — no secrets, no internals, no employer contact', async () => {
    const { user: emp } = await createVerifiedEmployer();
    await User.findByIdAndUpdate(emp._id, {
      'profile.employerProfile.phone': '+355691234567',
      'profile.employerProfile.whatsapp': '+355681234567',
    });
    const job = await createJob(emp);

    const r = await request(app).get(`/api/jobs/${job._id}`);
    expect(r.status).toBe(200);
    assertNoKeys(r.body, SECRETS, 'GET /api/jobs/:id anon');
    assertNoKeys(r.body, JOB_INTERNAL, 'GET /api/jobs/:id anon');
    // Employer/job contact details must not reach a logged-out caller
    // (covers employerProfile.phone/whatsapp AND job contactOverrides).
    assertNoKeys(r.body, ['phone', 'whatsapp', 'email', 'contactOverrides'], 'GET /api/jobs/:id anon');
  });

  it('GET /api/jobs/:id (logged-in) — employer contact restored, still no secrets/internals', async () => {
    const { user: emp } = await createVerifiedEmployer();
    await User.findByIdAndUpdate(emp._id, {
      'profile.employerProfile.phone': '+355691234567',
    });
    const job = await createJob(emp);
    const { user: seeker } = await createJobseeker();

    const r = await request(app)
      .get(`/api/jobs/${job._id}`)
      .set(createAuthHeaders(seeker));
    expect(r.status).toBe(200);
    assertNoKeys(r.body, SECRETS, 'GET /api/jobs/:id authed');
    assertNoKeys(r.body, JOB_INTERNAL, 'GET /api/jobs/:id authed');
    // Contact IS available to an authenticated viewer.
    expect(r.body.data.job.employerId.profile.employerProfile.phone).toBe('+355691234567');
  });

  it('GET /api/jobs/:id/similar — no secrets, no internal job fields', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp);
    const r = await request(app).get(`/api/jobs/${job._id}/similar`);
    expect(r.status).toBe(200);
    // `data.similarJobs` is the legitimate response key — scan the nested
    // job objects themselves for leaked internal/secret fields.
    const nestedJobs = (r.body.data?.similarJobs || []).map(s => s.job);
    assertNoKeys(nestedJobs, SECRETS, 'GET /api/jobs/:id/similar');
    assertNoKeys(nestedJobs, JOB_INTERNAL, 'GET /api/jobs/:id/similar');
  });

  it('GET /api/companies — no secrets', async () => {
    const { user: emp } = await createVerifiedEmployer();
    await createJob(emp);
    const r = await request(app).get('/api/companies');
    expect(r.status).toBe(200);
    assertNoKeys(r.body, SECRETS, 'GET /api/companies');
  });

  it('GET /api/companies/:id — no secrets', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const r = await request(app).get(`/api/companies/${emp._id}`);
    expect(r.status).toBe(200);
    assertNoKeys(r.body, SECRETS, 'GET /api/companies/:id');
  });

  it('GET /api/stats/public — no secrets', async () => {
    const r = await request(app).get('/api/stats/public');
    expect(r.status).toBe(200);
    assertNoKeys(r.body, SECRETS, 'GET /api/stats/public');
  });

  it('GET /api/locations — no secrets', async () => {
    const r = await request(app).get('/api/locations');
    expect(r.status).toBe(200);
    assertNoKeys(r.body, SECRETS, 'GET /api/locations');
  });
});
