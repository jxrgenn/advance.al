/**
 * Phase 28 — coverage push for routes/reports.js GET /admin filter branches.
 *
 * The admin queue route has filter branches (status, priority, category,
 * assignedAdmin, search) that aren't exercised by existing tests.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createAdmin, createJobseeker } from '../factories/user.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import Report from '../../src/models/Report.js';

async function seedReport(overrides = {}) {
  return Report.create({
    reportingUser: overrides.reportingUser || new mongoose.Types.ObjectId(),
    reportedUser: overrides.reportedUser || new mongoose.Types.ObjectId(),
    category: overrides.category || 'spam_behavior',
    description: overrides.description || 'Long enough description for the test',
    status: overrides.status || 'pending',
    priority: overrides.priority || 'medium',
    assignedAdmin: overrides.assignedAdmin,
  });
}

describe('reports.js — GET /admin filter coverage', () => {
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

  it('filters by status', async () => {
    const { user: admin } = await createAdmin();
    await seedReport({ status: 'pending' });
    await seedReport({ status: 'resolved' });

    const r = await request(app)
      .get('/api/reports/admin?status=resolved')
      .set(createAuthHeaders(admin));

    expect(r.status).toBe(200);
    expect(r.body.data.reports.length).toBe(1);
    expect(r.body.data.reports[0].status).toBe('resolved');
  });

  it('filters by priority', async () => {
    const { user: admin } = await createAdmin();
    await seedReport({ priority: 'high' });
    await seedReport({ priority: 'low' });

    const r = await request(app)
      .get('/api/reports/admin?priority=high')
      .set(createAuthHeaders(admin));

    expect(r.status).toBe(200);
    expect(r.body.data.reports.length).toBe(1);
    expect(r.body.data.reports[0].priority).toBe('high');
  });

  it('filters by category', async () => {
    const { user: admin } = await createAdmin();
    await seedReport({ category: 'spam_behavior' });
    await seedReport({ category: 'fake_cv' });

    const r = await request(app)
      .get('/api/reports/admin?category=fake_cv')
      .set(createAuthHeaders(admin));

    expect(r.status).toBe(200);
    expect(r.body.data.reports.length).toBe(1);
    expect(r.body.data.reports[0].category).toBe('fake_cv');
  });

  it('filters by assignedAdmin=unassigned', async () => {
    const { user: admin } = await createAdmin();
    await seedReport({ assignedAdmin: admin._id });
    await seedReport({ assignedAdmin: null });

    const r = await request(app)
      .get('/api/reports/admin?assignedAdmin=unassigned')
      .set(createAuthHeaders(admin));

    expect(r.status).toBe(200);
    expect(r.body.data.reports.length).toBe(1);
  });

  it('filters by assignedAdmin=<id>', async () => {
    const { user: admin } = await createAdmin();
    await seedReport({ assignedAdmin: admin._id });
    await seedReport({ assignedAdmin: null });

    const r = await request(app)
      .get(`/api/reports/admin?assignedAdmin=${admin._id}`)
      .set(createAuthHeaders(admin));

    expect(r.status).toBe(200);
    expect(r.body.data.reports.length).toBe(1);
  });

  it('search filter matches description (regex)', async () => {
    const { user: admin } = await createAdmin();
    await seedReport({ description: 'This contains the word matchme inside' });
    await seedReport({ description: 'Other report with no marker' });

    const r = await request(app)
      .get('/api/reports/admin?search=matchme')
      .set(createAuthHeaders(admin));

    expect(r.status).toBe(200);
    expect(r.body.data.reports.length).toBe(1);
  });

  it('sorts by allowed field (priority desc) ', async () => {
    const { user: admin } = await createAdmin();
    await seedReport({ priority: 'low' });
    await seedReport({ priority: 'critical' });
    await seedReport({ priority: 'high' });

    const r = await request(app)
      .get('/api/reports/admin?sortBy=priority&sortOrder=desc')
      .set(createAuthHeaders(admin));

    expect(r.status).toBe(200);
    expect(r.body.data.reports.length).toBe(3);
  });

  it('falls back to default sort for unknown sortBy', async () => {
    const { user: admin } = await createAdmin();
    await seedReport();

    const r = await request(app)
      .get('/api/reports/admin?sortBy=injection_attempt')
      .set(createAuthHeaders(admin));

    expect(r.status).toBe(200);
  });
});
