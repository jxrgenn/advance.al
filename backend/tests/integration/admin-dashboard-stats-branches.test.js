/**
 * Phase 28 — coverage push for routes/admin.js GET /dashboard-stats branches
 * not exercised by the bare existence test:
 *   - L78-83 growth-percentage ternaries (zero-division branches and 100%
 *     fallback when previous=0 but current>0)
 *   - L122-138 recentActivity formatting (employer vs jobseeker userType,
 *     companyName fallback to 'Kompani', jobSeekerId fallback to 'Përdorues')
 *   - L141-145 totalRevenue calc with mix of premium + featured jobs
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createAdmin, createJobseeker, createVerifiedEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import Job from '../../src/models/Job.js';
import User from '../../src/models/User.js';

describe('admin.js — GET /dashboard-stats branch coverage', () => {
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

  it('returns userGrowth=0 when both periods have 0 new users', async () => {
    const { user: admin } = await createAdmin();
    // Backdate admin's createdAt to outside both windows (>60 days ago)
    await User.collection.updateOne(
      { _id: admin._id },
      { $set: { createdAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) } }
    );

    const r = await request(app)
      .get('/api/admin/dashboard-stats')
      .set(createAuthHeaders(admin));

    expect(r.status).toBe(200);
    expect(r.body.data.monthlyGrowth.users).toBe(0);
    expect(r.body.data.monthlyGrowth.jobs).toBe(0);
    expect(r.body.data.monthlyGrowth.applications).toBe(0);
  });

  it('returns 100% growth when previous=0 but current>0 (L78-83)', async () => {
    const { user: admin } = await createAdmin();
    await createJobseeker(); // current period (just created)

    const r = await request(app)
      .get('/api/admin/dashboard-stats')
      .set(createAuthHeaders(admin));

    expect(r.status).toBe(200);
    // current users > 0, previous = 0 → 100%
    expect(r.body.data.monthlyGrowth.users).toBe(100);
  });

  it('totalRevenue reflects premium + featured tier counts', async () => {
    const { user: admin } = await createAdmin();
    const { user: emp } = await createVerifiedEmployer();
    // Create 2 premium + 1 featured directly in DB to set tier
    const j1 = await createJob(emp);
    const j2 = await createJob(emp);
    const j3 = await createJob(emp);
    await Job.updateOne({ _id: j1._id }, { $set: { tier: 'premium' } });
    await Job.updateOne({ _id: j2._id }, { $set: { tier: 'premium' } });
    await Job.updateOne({ _id: j3._id }, { $set: { tier: 'featured' } });

    const r = await request(app)
      .get('/api/admin/dashboard-stats')
      .set(createAuthHeaders(admin));

    expect(r.status).toBe(200);
    // 2 premium × 28 + 1 featured × 42 = 56 + 42 = 98
    expect(r.body.data.totalRevenue).toBe(98);
  });

  it('recentActivity formats employer vs jobseeker correctly (L128-130)', async () => {
    const { user: admin } = await createAdmin();
    await createJobseeker({ email: 'js-act@example.com' });
    const { user: emp } = await createVerifiedEmployer({ email: 'emp-act@example.com' });
    await createJob(emp, { title: 'Test Activity Job' });

    const r = await request(app)
      .get('/api/admin/dashboard-stats')
      .set(createAuthHeaders(admin));

    expect(r.status).toBe(200);
    const activity = r.body.data.recentActivity;
    // Should have user_registered entries for both employer and jobseeker
    const userEntries = activity.filter(a => a.type === 'user_registered');
    const empEntry = userEntries.find(a => /punëdhënës/.test(a.description));
    const jsEntry = userEntries.find(a => /kërkues pune/.test(a.description));
    expect(empEntry).toBeDefined();
    expect(jsEntry).toBeDefined();

    // Should have job_posted entry with the job title
    const jobEntry = activity.find(a => a.type === 'job_posted' && /Test Activity Job/.test(a.description));
    expect(jobEntry).toBeDefined();
  });

  it('"Kompani" fallback when employer has no companyName (L125)', async () => {
    const { user: admin } = await createAdmin();
    const { user: emp } = await createVerifiedEmployer();
    // Strip companyName
    await User.updateOne(
      { _id: emp._id },
      { $unset: { 'profile.employerProfile.companyName': 1 } }
    );
    await createJob(emp, { title: 'No Company Job' });

    const r = await request(app)
      .get('/api/admin/dashboard-stats')
      .set(createAuthHeaders(admin));

    expect(r.status).toBe(200);
    const jobEntry = r.body.data.recentActivity.find(
      a => a.type === 'job_posted' && /No Company Job/.test(a.description)
    );
    expect(jobEntry).toBeDefined();
    expect(jobEntry.description).toMatch(/^Kompani postoi/);
  });
});
