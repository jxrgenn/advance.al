/**
 * Wave 2 (W2-5 #3) — admin reports showed "undefined undefined".
 *
 * Every report populate selected top-level `firstName lastName` (and a
 * non-existent `accountStatus`), but a User keeps its names under
 * `profile.*` and its account state in `status`. The populated users came
 * back with only _id/email, so the admin list, the details dialog
 * ("Raportuar nga"), the action history and the dashboard's
 * "Raportime & Pezullime" list rendered blanks / "undefined undefined".
 *
 * These tests assert the exact names / fields each endpoint now returns.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createAdmin, createJobseeker, createVerifiedEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import Report from '../../src/models/Report.js';
import ReportAction from '../../src/models/ReportAction.js';

async function seedPeople() {
  const { user: admin } = await createAdmin({ firstName: 'Ana', lastName: 'Admini', email: 'w2-rep-admin@example.com' });
  const { user: reporter } = await createJobseeker({ firstName: 'Blerta', lastName: 'Raportuesja', email: 'w2-rep-reporter@example.com' });
  const { user: reported } = await createVerifiedEmployer({
    firstName: 'Gent', lastName: 'Punëdhënësi', companyName: 'Gent Shpk', email: 'w2-rep-reported@example.com',
  });
  return { admin, reporter, reported };
}

async function submitReport(reporter, body) {
  const r = await request(app).post('/api/reports').set(createAuthHeaders(reporter)).send(body);
  expect(r.status).toBe(201);
  return r.body.data.reportId;
}

describe('W2-5 #3 — report populates return profile names', () => {
  beforeAll(async () => { await connectTestDB(); await seedLocations(); });
  afterEach(async () => { await clearTestDB(); await seedLocations(); });
  afterAll(async () => { await closeTestDB(); });

  it('GET /api/reports/admin returns reporter + reported names under profile, status instead of accountStatus', async () => {
    const { admin, reporter, reported } = await seedPeople();
    await submitReport(reporter, {
      reportedUserId: reported._id.toString(),
      category: 'suspicious_profile',
      description: 'Profili duket i dyshimtë dhe i kopjuar.',
    });

    const r = await request(app).get('/api/reports/admin').set(createAuthHeaders(admin));
    expect(r.status).toBe(200);
    expect(r.body.data.reports).toHaveLength(1);
    const rep = r.body.data.reports[0];

    expect(rep.reportingUser.profile.firstName).toBe('Blerta');
    expect(rep.reportingUser.profile.lastName).toBe('Raportuesja');
    expect(rep.reportingUser.email).toBe('w2-rep-reporter@example.com');
    expect(rep.reportingUser.userType).toBe('jobseeker');

    expect(rep.reportedUser.profile.firstName).toBe('Gent');
    expect(rep.reportedUser.profile.lastName).toBe('Punëdhënësi');
    expect(rep.reportedUser.profile.employerProfile.companyName).toBe('Gent Shpk');
    expect(rep.reportedUser.status).toBe('active');
    expect(rep.reportedUser).not.toHaveProperty('accountStatus');
    expect(rep.reportedUser).not.toHaveProperty('firstName');
    // Only the projected profile paths — no phone / CV data in the list.
    expect(rep.reportedUser.profile).not.toHaveProperty('phone');
  });

  it('GET /api/reports/admin populates a reported JOB title (job-only report)', async () => {
    const { admin, reporter, reported } = await seedPeople();
    const job = await createJob(reported, { title: 'Pozicion i Dyshimtë' });
    await submitReport(reporter, {
      reportedJobId: job._id.toString(),
      category: 'fake_job_posting',
      description: 'Njoftim pune që duket i rremë.',
    });

    const r = await request(app).get('/api/reports/admin').set(createAuthHeaders(admin));
    expect(r.status).toBe(200);
    const rep = r.body.data.reports[0];
    expect(rep.reportedJob.title).toBe('Pozicion i Dyshimtë');
    expect(rep.reportedJob.status).toBe('active');
  });

  it('GET /api/reports/admin/:id — details dialog + action history carry the names', async () => {
    const { admin, reporter, reported } = await seedPeople();
    const reportId = await submitReport(reporter, {
      reportedUserId: reported._id.toString(),
      category: 'spam_behavior',
      description: 'Dërgon mesazhe spam te kandidatët.',
    });

    const act = await request(app)
      .post(`/api/reports/admin/${reportId}/action`)
      .set(createAuthHeaders(admin))
      .send({ action: 'warning', reason: 'Paralajmërim i parë.' });
    expect(act.status).toBe(200);
    // The message names the action in Albanian, not the enum.
    expect(act.body.message).toBe('Veprimi "Paralajmërim" u krye me sukses');
    expect(act.body.data.report.resolution.resolvedBy.profile.firstName).toBe('Ana');

    const d = await request(app).get(`/api/reports/admin/${reportId}`).set(createAuthHeaders(admin));
    expect(d.status).toBe(200);
    expect(d.body.data.report.reportedUser.profile.firstName).toBe('Gent');
    expect(d.body.data.report.reportedUser.status).toBe('active');
    expect(d.body.data.report.reportingUser.profile.lastName).toBe('Raportuesja');
    expect(d.body.data.report.resolution.resolvedBy.profile.lastName).toBe('Admini');

    const performers = d.body.data.actions.map(a => a.performedBy.profile.firstName).sort();
    // report_created (by the reporter) + the admin's warning.
    expect(performers).toEqual(['Ana', 'Blerta']);
    // The audit text admins read is Albanian, not "Report submitted for spam_behavior".
    const created = d.body.data.actions.find(a => a.actionType === 'report_created');
    expect(created.actionDetails.actionData.reason).toBe('Raport i dërguar: Sjellje spam');
  });

  it('GET /api/reports (reporter\'s own list) shows the reported user\'s name but never their email', async () => {
    const { reporter, reported } = await seedPeople();
    await submitReport(reporter, {
      reportedUserId: reported._id.toString(),
      category: 'harassment',
      description: 'Sjellje e papranueshme gjatë intervistës.',
    });

    const r = await request(app).get('/api/reports').set(createAuthHeaders(reporter));
    expect(r.status).toBe(200);
    const rep = r.body.data.reports[0];
    expect(rep.reportedUser.profile.firstName).toBe('Gent');
    expect(rep.reportedUser.profile.lastName).toBe('Punëdhënësi');
    expect(rep.reportedUser).not.toHaveProperty('email');
  });

  it('GET /api/reports/admin/stats — topReportedUsers carries profile names', async () => {
    const { admin, reporter, reported } = await seedPeople();
    await submitReport(reporter, {
      reportedUserId: reported._id.toString(),
      category: 'other',
      description: 'Arsye tjetër e raportimit për test.',
    });

    const r = await request(app).get('/api/reports/admin/stats').set(createAuthHeaders(admin));
    expect(r.status).toBe(200);
    expect(r.body.data.topReportedUsers).toHaveLength(1);
    expect(r.body.data.topReportedUsers[0].user.profile.firstName).toBe('Gent');
    expect(r.body.data.topReportedUsers[0].count).toBe(1);
  });

  it('model statics (Report.getByStatus / getReportsForUser, ReportAction.getReportHistory) populate profile names', async () => {
    const { reporter, reported } = await seedPeople();
    const reportId = await submitReport(reporter, {
      reportedUserId: reported._id.toString(),
      category: 'impersonation',
      description: 'Përdor emrin e një kompanie tjetër.',
    });

    const [byStatus] = await Report.getByStatus('pending');
    expect(byStatus.reportedUser.profile.firstName).toBe('Gent');
    expect(byStatus.reportingUser.profile.firstName).toBe('Blerta');

    const [forUser] = await Report.getReportsForUser(reported._id);
    expect(forUser.reportingUser.profile.lastName).toBe('Raportuesja');

    const history = await ReportAction.getReportHistory(reportId);
    expect(history).toHaveLength(1);
    expect(history[0].performedBy.profile.firstName).toBe('Blerta');
    expect(history[0].targetUser.profile.firstName).toBe('Gent');
  });
});
