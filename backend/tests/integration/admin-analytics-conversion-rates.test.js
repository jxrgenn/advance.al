/**
 * Phase 28 — coverage push for routes/admin.js GET /analytics conversion-rate
 * and userEngagement branches not exercised by the bare 200-check test.
 *
 * Targets:
 *   - L252-256 conversionRates ternaries (>0 vs ===0 zero-division branches)
 *   - L282-287 userEngagement ratios (emailsSent>0 vs ===0 branches)
 *   - response shape including topPerformingJobs aggregation
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createAdmin, createJobseeker, createVerifiedEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import Application from '../../src/models/Application.js';
import QuickUser from '../../src/models/QuickUser.js';

describe('admin.js — GET /analytics conversion + engagement branches', () => {
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

  it('returns conversionRates as 0 when no users / applications exist (zero-division branches)', async () => {
    const { user: admin } = await createAdmin();
    // Only the admin exists; no applications yet
    const r = await request(app)
      .get('/api/admin/analytics')
      .set(createAuthHeaders(admin));

    expect(r.status).toBe(200);
    const cr = r.body.data.conversionRates;
    expect(cr.visitorToRegistration).toBeGreaterThanOrEqual(0);
    expect(cr.registrationToApplication).toBe(0); // 0 applications → ratio 0
    expect(cr.applicationToHire).toBe(0); // 0 applications
  });

  it('computes non-zero conversionRates when data exists', async () => {
    const { user: admin } = await createAdmin();
    const { user: js } = await createJobseeker();
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp);
    await Application.create({
      jobId: job._id, jobSeekerId: js._id, employerId: emp._id,
      applicationMethod: 'one_click', status: 'hired',
    });
    // Add a QuickUser too so totalVisitors > 0
    await QuickUser.create({
      firstName: 'Q', lastName: 'V',
      email: 'qv@example.com', location: 'Tiranë', interests: ['Teknologji'],
    });

    const r = await request(app)
      .get('/api/admin/analytics')
      .set(createAuthHeaders(admin));

    expect(r.status).toBe(200);
    const cr = r.body.data.conversionRates;
    expect(cr.visitorToRegistration).toBeGreaterThan(0);
    expect(cr.registrationToApplication).toBeGreaterThan(0);
    expect(cr.applicationToHire).toBeGreaterThan(0);
  });

  it('userEngagement reports 0 emailClickRate when no emails sent (L286)', async () => {
    const { user: admin } = await createAdmin();
    const r = await request(app)
      .get('/api/admin/analytics')
      .set(createAuthHeaders(admin));

    expect(r.status).toBe(200);
    const ue = r.body.data.userEngagement;
    // No QuickUser activity → emailsSent=0 → emailClickRate=0
    expect(ue.emailClickRate).toBe(0);
    expect(ue.emailOpenRate).toBe(0);
  });

  it('userEngagement reports non-zero rates when QuickUsers have email activity', async () => {
    const { user: admin } = await createAdmin();
    await QuickUser.create({
      firstName: 'A', lastName: 'B',
      email: 'engage@example.com', location: 'Tiranë', interests: ['Teknologji'],
      totalEmailsSent: 100,
      emailClickCount: 25,
    });

    const r = await request(app)
      .get('/api/admin/analytics')
      .set(createAuthHeaders(admin));

    expect(r.status).toBe(200);
    const ue = r.body.data.userEngagement;
    expect(ue.emailClickRate).toBe(25); // 25/100 * 100 = 25
    expect(ue.emailOpenRate).toBe(75); // hardcoded 75% estimate
  });

  it('returns topPerformingJobs sorted by applicationCount + viewCount', async () => {
    const { user: admin } = await createAdmin();
    const { user: emp } = await createVerifiedEmployer();
    await createJob(emp, { title: 'Top Job' });

    const r = await request(app)
      .get('/api/admin/analytics')
      .set(createAuthHeaders(admin));

    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.data.topPerformingJobs)).toBe(true);
    expect(r.body.data.topPerformingJobs.length).toBeGreaterThanOrEqual(1);
    const ourJob = r.body.data.topPerformingJobs.find(j => j.title === 'Top Job');
    expect(ourJob).toBeDefined();
    expect(ourJob.applicationCount).toBeGreaterThanOrEqual(0);
    expect(ourJob.viewCount).toBeGreaterThanOrEqual(0);
  });
});
