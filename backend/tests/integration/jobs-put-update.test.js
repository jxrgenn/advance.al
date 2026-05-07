/**
 * Phase 28 — coverage push for PUT /api/jobs/:id (L1128-1243).
 *
 * Targets:
 *   - happy path with various field updates
 *   - 404 for non-owner
 *   - 400 for expired job
 *   - salary min > max validator
 *   - administrata flag enforcement (non-administrata employer cannot set true)
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createVerifiedEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import Job from '../../src/models/Job.js';
import User from '../../src/models/User.js';

describe('jobs.js — PUT /:id update', () => {
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

  it('owner updates title + salary, embedding re-queued (L1180-1209)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp);

    const r = await request(app)
      .put(`/api/jobs/${job._id}`)
      .set(createAuthHeaders(emp))
      .send({
        title: 'Updated Title XYZ',
        salary: { min: 1000, max: 2000, currency: 'EUR' },
      });
    expect(r.status).toBe(200);
    const refreshed = await Job.findById(job._id);
    expect(refreshed.title).toBe('Updated Title XYZ');
    expect(refreshed.salary.min).toBe(1000);
  });

  it('owner can update tags (capped at 10) (L1191)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp);
    const r = await request(app)
      .put(`/api/jobs/${job._id}`)
      .set(createAuthHeaders(emp))
      .send({
        tags: Array(15).fill().map((_, i) => `tag${i}`), // 15 tags
      });
    expect(r.status).toBe(200);
    const refreshed = await Job.findById(job._id);
    expect(refreshed.tags.length).toBe(10);
  });

  it('non-owner gets 404 (L1136-1140)', async () => {
    const { user: emp1 } = await createVerifiedEmployer({ email: 'pu1@example.com' });
    const { user: emp2 } = await createVerifiedEmployer({ email: 'pu2@example.com' });
    const job = await createJob(emp1);

    const r = await request(app)
      .put(`/api/jobs/${job._id}`)
      .set(createAuthHeaders(emp2))
      .send({ title: 'HACKED' });
    expect(r.status).toBe(404);
  });

  it('rejects update on expired job (L1144-1148)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp);
    // Make it expired by setting expiresAt in the past
    await Job.findByIdAndUpdate(job._id, {
      expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    });

    const r = await request(app)
      .put(`/api/jobs/${job._id}`)
      .set(createAuthHeaders(emp))
      .send({ title: 'Cannot Edit' });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/skaduar/i);
  });

  it('rejects salary min > max (L1172-1176)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp);
    const r = await request(app)
      .put(`/api/jobs/${job._id}`)
      .set(createAuthHeaders(emp))
      .send({ salary: { min: 5000, max: 1000, currency: 'EUR' } });
    expect(r.status).toBe(400);
  });

  it('non-administrata employer cannot set platformCategories.administrata=true (L1196-1204)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    // Ensure not an administrata account
    await User.findByIdAndUpdate(emp._id, {
      'profile.employerProfile.isAdministrataAccount': false,
    });
    const job = await createJob(emp);

    const r = await request(app)
      .put(`/api/jobs/${job._id}`)
      .set(createAuthHeaders(emp))
      .send({
        platformCategories: {
          diaspora: false, ngaShtepia: false, partTime: false,
          administrata: true, // attempt to set true
          sezonale: false,
        },
      });
    expect(r.status).toBe(200);
    const refreshed = await Job.findById(job._id);
    expect(refreshed.platformCategories.administrata).toBe(false); // server overrode
  });

  it('administrata employer CAN set platformCategories.administrata=true', async () => {
    const { user: emp } = await createVerifiedEmployer();
    await User.findByIdAndUpdate(emp._id, {
      'profile.employerProfile.isAdministrataAccount': true,
    });
    const job = await createJob(emp);

    const r = await request(app)
      .put(`/api/jobs/${job._id}`)
      .set(createAuthHeaders(emp))
      .send({
        platformCategories: {
          diaspora: false, ngaShtepia: false, partTime: false,
          administrata: true,
          sezonale: false,
        },
      });
    expect(r.status).toBe(200);
    const refreshed = await Job.findById(job._id);
    expect(refreshed.platformCategories.administrata).toBe(true);
  });
});
