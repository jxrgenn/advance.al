/**
 * Phase 28 — coverage push for routes/reports.js gaps not hit by other suites.
 *
 *   - L150-158 POST /reports — reportedUser not found 404 path
 *   - L598-606 PUT /admin/:id — report not found 404 path
 *   - L709-718 POST /admin/:id/action — report not found 404 path
 *   - L813-822 POST /admin/:id/reopen — happy path (calls report.reopen())
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import {
  createAdmin, createJobseeker
} from '../factories/user.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import { Report } from '../../src/models/index.js';
import mongoose from 'mongoose';

const NONEXIST_ID = '507f1f77bcf86cd799439099';

async function seedResolvedReport(reportingUserId, reportedUserId, adminId) {
  // Create directly via the model so wasNew/post-save hooks fire correctly.
  const report = await Report.create({
    reportingUser: reportingUserId,
    reportedUser: reportedUserId,
    category: 'spam_behavior',
    description: 'Repeated spam reports for reopen-happy-path test of the admin queue',
  });
  // Mark resolved so reopen branch is reachable
  report.status = 'resolved';
  report.resolvedBy = adminId;
  report.resolvedAt = new Date();
  await report.save();
  return report;
}

describe('reports.js — additional branches', () => {
  beforeAll(async () => { await connectTestDB(); await seedLocations(); });
  afterEach(async () => { await clearTestDB(); await seedLocations(); });
  afterAll(async () => { await closeTestDB(); });

  it('POST /reports returns 404 when reportedUser does not exist (L154)', async () => {
    const { user: js } = await createJobseeker();
    const r = await request(app)
      .post('/api/reports')
      .set(createAuthHeaders(js))
      .send({
        reportedUserId: NONEXIST_ID,
        category: 'spam_behavior',
        description: 'Description for ghost-user report — testing 404 branch',
      });
    expect(r.status).toBe(404);
    expect(r.body.message).toMatch(/Përdoruesi i raportuar nuk u gjet/);
  });

  it('PUT /admin/:id returns 404 when report does not exist (L604)', async () => {
    const { user: admin } = await createAdmin();
    const r = await request(app)
      .put(`/api/reports/admin/${NONEXIST_ID}`)
      .set(createAuthHeaders(admin))
      .send({ priority: 'high' });
    expect(r.status).toBe(404);
    expect(r.body.message).toMatch(/Raportimi nuk u gjet/);
  });

  it('POST /admin/:id/action returns 404 when report does not exist (L715)', async () => {
    const { user: admin } = await createAdmin();
    const r = await request(app)
      .post(`/api/reports/admin/${NONEXIST_ID}/action`)
      .set(createAuthHeaders(admin))
      .send({ action: 'no_action', reason: 'r' });
    expect(r.status).toBe(404);
    expect(r.body.message).toMatch(/Raportimi nuk u gjet/);
  });

  it('POST /admin/:id/reopen happy path calls report.reopen() (L814-822)', async () => {
    const { user: admin } = await createAdmin();
    const { user: js } = await createJobseeker();
    const { user: target } = await createJobseeker({ email: 'reopen-target@example.com' });
    const report = await seedResolvedReport(js._id, target._id, admin._id);

    expect(report.status).toBe('resolved');

    const r = await request(app)
      .post(`/api/reports/admin/${report._id}/reopen`)
      .set(createAuthHeaders(admin))
      .send({ reason: 'New evidence surfaced — needs second look' });

    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.message).toMatch(/u rihap me sukses/);

    // Verify the report status actually changed in DB
    const fresh = await Report.findById(report._id);
    expect(fresh.status).not.toBe('resolved');
  });
});
