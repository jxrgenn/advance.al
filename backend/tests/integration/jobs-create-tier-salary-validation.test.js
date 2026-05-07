/**
 * Phase 28 — coverage push for jobs.js POST / validation branches:
 *   - tier whitelist (L846-852)
 *   - salary.min > salary.max (L859-865)
 *   - non-administrata employer setting administrata=true (L854-857) — server silently strips
 *   - location not in active list (L867-874)
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createVerifiedEmployer } from '../factories/user.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';

function basePayload(overrides = {}) {
  return {
    title: 'Test Job Title',
    description: 'a sufficient description that passes the validator length minimum requirement',
    location: { city: 'Tiranë', remote: false },
    jobType: 'full-time',
    category: 'Teknologji',
    seniority: 'mid',
    salary: { min: 1000, max: 2000, currency: 'EUR' },
    platformCategories: {
      diaspora: false, ngaShtepia: false, partTime: false,
      administrata: false, sezonale: false,
    },
    ...overrides,
  };
}

describe('jobs.js — POST / validation branches', () => {
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

  it('rejects tier outside whitelist (L846-852)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const r = await request(app)
      .post('/api/jobs')
      .set(createAuthHeaders(emp))
      .send(basePayload({ tier: 'enterprise_unlimited' }));
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/Tier i pavlefshëm/i);
  });

  it('rejects salary.min > salary.max (L859-865)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const r = await request(app)
      .post('/api/jobs')
      .set(createAuthHeaders(emp))
      .send(basePayload({ salary: { min: 5000, max: 1000, currency: 'EUR' } }));
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/Paga minimale/i);
  });

  it('rejects unknown city (L867-874)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const r = await request(app)
      .post('/api/jobs')
      .set(createAuthHeaders(emp))
      .send(basePayload({ location: { city: 'Atlantis', remote: false } }));
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/Qyteti/i);
  });

  it('non-administrata employer setting administrata=true is silently stripped (L854-857)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const r = await request(app)
      .post('/api/jobs')
      .set(createAuthHeaders(emp))
      .send(basePayload({
        platformCategories: { diaspora: false, ngaShtepia: false, partTime: false, administrata: true, sezonale: false }
      }));
    expect(r.status).toBe(201);
    expect(r.body.data.job.platformCategories.administrata).toBe(false);
  });
});
