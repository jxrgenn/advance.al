/**
 * Pre-launch fix batch C — admin user management + report actions
 *
 *   O-51  an admin cannot suspend/ban ANOTHER admin — neither through
 *         PATCH /api/admin/users/:id/manage nor through a report action
 *         (POST /api/reports/admin/:id/action → Report#resolve).
 *   O-50  'activate' on a soft-deleted account is refused (it used to answer
 *         "u aktivizua me sukses" while the user still could not log in).
 *   O-7   report actions no longer log "Failed to send notifications for
 *         report action" (dead notifyRelevantParties import); the reported
 *         user is still notified exactly once by Report#resolve; job-only
 *         reports can be actioned (no reportedUser → no 500).
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, jest } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createAdmin, createJobseeker, createVerifiedEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import User from '../../src/models/User.js';
import Report from '../../src/models/Report.js';
import ReportAction from '../../src/models/ReportAction.js';
import Notification from '../../src/models/Notification.js';
import Job from '../../src/models/Job.js';
import Location from '../../src/models/Location.js';
import logger from '../../src/config/logger.js';

const manage = (admin, userId, body) =>
  request(app).patch(`/api/admin/users/${userId}/manage`).set(createAuthHeaders(admin)).send(body);
const reportAction = (admin, reportId, body) =>
  request(app).post(`/api/reports/admin/${reportId}/action`).set(createAuthHeaders(admin)).send(body);

describe('admin protections + report actions (fix batch C)', () => {
  beforeAll(async () => {
    await connectTestDB();
    await seedLocations();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await clearTestDB();
    await seedLocations();
  });

  afterAll(async () => {
    await closeTestDB();
  });

  describe('O-51 PATCH /api/admin/users/:id/manage', () => {
    for (const action of ['suspend', 'ban']) {
      it(`${action} another admin → 403, target stays active`, async () => {
        const { user: admin } = await createAdmin({ email: `o51-${action}-a@advance.al` });
        const { user: other } = await createAdmin({ email: `o51-${action}-b@advance.al` });

        const r = await manage(admin, other._id, { action, reason: 'test' });
        expect(r.status).toBe(403);
        expect(r.body.message).toBe('Nuk mund të pezulloni ose ndaloni administratorë të tjerë');
        const fresh = await User.findById(other._id).lean();
        expect(fresh.status).toBe('active');
      });
    }

    it('suspending a jobseeker still works (control) → 200', async () => {
      const { user: admin } = await createAdmin();
      const { user: js } = await createJobseeker();
      const r = await manage(admin, js._id, { action: 'suspend', reason: 'test' });
      expect(r.status).toBe(200);
      expect((await User.findById(js._id).lean()).status).toBe('suspended');
    });
  });

  describe('O-51 POST /api/reports/admin/:id/action', () => {
    for (const action of ['temporary_suspension', 'permanent_suspension', 'account_termination']) {
      it(`${action} on a report against an admin → 403, admin + report untouched`, async () => {
        const { user: admin } = await createAdmin({ email: `o51r-${action}-a@advance.al` });
        const { user: target } = await createAdmin({ email: `o51r-${action}-b@advance.al` });
        const { user: reporter } = await createVerifiedEmployer();
        const report = await Report.create({ reportingUser: reporter._id, reportedUser: target._id, category: 'harassment', description: 'test' });

        const r = await reportAction(admin, report._id, { action, reason: 'test', duration: 7 });
        expect(r.status).toBe(403);
        expect(r.body.message).toBe('Nuk mund të pezulloni ose ndaloni administratorë të tjerë');
        expect((await User.findById(target._id).lean()).status).toBe('active');
        expect((await Report.findById(report._id).lean()).status).toBe('pending');
        expect(await ReportAction.countDocuments({ report: report._id })).toBe(0);
      });
    }

    it('a warning on a report against an admin is still allowed → 200', async () => {
      const { user: admin } = await createAdmin({ email: 'o51r-warn-a@advance.al' });
      const { user: target } = await createAdmin({ email: 'o51r-warn-b@advance.al' });
      const { user: reporter } = await createVerifiedEmployer();
      const report = await Report.create({ reportingUser: reporter._id, reportedUser: target._id, category: 'other', description: 'test' });

      const r = await reportAction(admin, report._id, { action: 'warning', reason: 'test' });
      expect(r.status).toBe(200);
      expect((await User.findById(target._id).lean()).status).toBe('active');
    });
  });

  describe('review #5: report sanctions close the employer\'s jobs like the manage route', () => {
    async function employerWithJobs(email) {
      const { user: emp } = await createVerifiedEmployer({ email });
      const active1 = await createJob(emp, { city: 'Tiranë' });
      const active2 = await createJob(emp, { city: 'Tiranë' });
      const closed = await createJob(emp, { status: 'closed' });
      return { emp, active1, active2, closed };
    }
    const jobsState = async (ids) => (await Job.find({ _id: { $in: ids } }).sort({ _id: 1 }).lean())
      .map((j) => [j.status, j.isDeleted]);

    it('temporary_suspension → active jobs closed (not deleted); Location.jobCount drops by 2; apply → 404', async () => {
      const { user: admin } = await createAdmin();
      const { user: reporter } = await createJobseeker();
      const { emp, active1, active2, closed } = await employerWithJobs('r5-susp@example.com');
      const report = await Report.create({ reportingUser: reporter._id, reportedUser: emp._id, category: 'other', description: 'test' });
      const countBefore = (await Location.findOne({ city: 'Tiranë' }).lean()).jobCount;

      const r = await reportAction(admin, report._id, { action: 'temporary_suspension', reason: 'test', duration: 7 });
      expect(r.status).toBe(200);
      expect((await User.findById(emp._id).lean()).status).toBe('suspended');
      expect(await jobsState([active1._id, active2._id, closed._id])).toEqual([
        ['closed', false], ['closed', false], ['closed', false],
      ]);
      expect((await Location.findOne({ city: 'Tiranë' }).lean()).jobCount).toBe(countBefore - 2);
      const { user: applicant } = await createJobseeker({ emailVerified: true });
      const apply = await request(app).post('/api/applications/apply').set(createAuthHeaders(applicant))
        .send({ jobId: active1._id.toString(), applicationMethod: 'one_click' });
      expect(apply.status).toBe(404);
    });

    for (const action of ['permanent_suspension', 'account_termination']) {
      it(`${action} → every job closed AND soft-deleted (same as manage "ban")`, async () => {
        const { user: admin } = await createAdmin();
        const { user: reporter } = await createJobseeker();
        const { emp, active1, active2, closed } = await employerWithJobs(`r5-${action}@example.com`);
        const report = await Report.create({ reportingUser: reporter._id, reportedUser: emp._id, category: 'other', description: 'test' });

        const r = await reportAction(admin, report._id, { action, reason: 'test' });
        expect(r.status).toBe(200);
        expect((await User.findById(emp._id).lean()).status).toBe('banned');
        expect(await jobsState([active1._id, active2._id, closed._id])).toEqual([
          ['closed', true], ['closed', true], ['closed', true],
        ]);
      });
    }

    it('a warning leaves the employer\'s jobs active', async () => {
      const { user: admin } = await createAdmin();
      const { user: reporter } = await createJobseeker();
      const { emp, active1 } = await employerWithJobs('r5-warn@example.com');
      const report = await Report.create({ reportingUser: reporter._id, reportedUser: emp._id, category: 'other', description: 'test' });
      expect((await reportAction(admin, report._id, { action: 'warning', reason: 'test' })).status).toBe(200);
      expect(await jobsState([active1._id])).toEqual([['active', false]]);
    });

    it('manage-route suspend (refactored onto the same helper) still closes active jobs', async () => {
      const { user: admin } = await createAdmin();
      const { emp, active1, closed } = await employerWithJobs('r5-manage@example.com');
      expect((await manage(admin, emp._id, { action: 'suspend', reason: 'test' })).status).toBe(200);
      expect(await jobsState([active1._id, closed._id])).toEqual([['closed', false], ['closed', false]]);
    });
  });

  describe('O-50 activate on a deleted account', () => {
    it('delete then activate → 400, account stays deleted', async () => {
      const { user: admin } = await createAdmin();
      const { user: js } = await createJobseeker();
      expect((await manage(admin, js._id, { action: 'delete' })).status).toBe(200);

      const r = await manage(admin, js._id, { action: 'activate' });
      expect(r.status).toBe(400);
      expect(r.body.message).toBe('Kjo llogari është fshirë dhe nuk mund të riaktivizohet');
      const fresh = await User.findById(js._id).lean();
      expect(fresh.isDeleted).toBe(true);
      expect(fresh.status).toBe('deleted');
    });

    it('activate a suspended (not deleted) user → 200, status active (control)', async () => {
      const { user: admin } = await createAdmin();
      const { user: js } = await createJobseeker();
      await manage(admin, js._id, { action: 'suspend', reason: 'test' });

      const r = await manage(admin, js._id, { action: 'activate' });
      expect(r.status).toBe(200);
      const fresh = await User.findById(js._id).lean();
      expect(fresh.status).toBe('active');
      expect(fresh.isDeleted).toBe(false);
    });
  });

  describe('O-7 report action side effects', () => {
    it('warning action: no notification error logged; reported user gets exactly one account_warning', async () => {
      const errorSpy = jest.spyOn(logger, 'error');
      const { user: admin } = await createAdmin();
      const { user: target } = await createJobseeker();
      const { user: reporter } = await createVerifiedEmployer();
      const report = await Report.create({ reportingUser: reporter._id, reportedUser: target._id, category: 'spam_behavior', description: 'test' });

      const r = await reportAction(admin, report._id, { action: 'warning', reason: 'test' });
      expect(r.status).toBe(200);
      await new Promise((res) => setTimeout(res, 300)); // post-save hooks are async

      const notifErrors = errorSpy.mock.calls.filter((c) => /report action/i.test(String(c[0])));
      expect(notifErrors).toEqual([]);
      const notes = await Notification.find({ userId: target._id }).lean();
      expect(notes.map((n) => n.type)).toEqual(['account_warning']);
      const actions = await ReportAction.find({ report: report._id }).lean();
      expect(actions.map((a) => [a.actionType, String(a.targetUser)])).toEqual([['user_warned', String(target._id)]]);
    });

    for (const action of ['warning', 'temporary_suspension', 'permanent_suspension', 'account_termination']) {
      it(`review #6: ${action} on a job-only report → 400, report stays pending, no audit record`, async () => {
        const { user: admin } = await createAdmin();
        const { user: emp } = await createVerifiedEmployer();
        const { user: reporter } = await createJobseeker();
        const job = await createJob(emp);
        const report = await Report.create({ reportingUser: reporter._id, reportedJob: job._id, category: 'fake_job_posting', description: 'test' });

        const r = await reportAction(admin, report._id, { action, reason: 'test', duration: 7 });
        expect(r.status).toBe(400);
        expect(r.body.message).toBe('Ky raportim i përket një pune, jo një përdoruesi. Paralajmërimi, pezullimi dhe mbyllja e llogarisë zbatohen vetëm ndaj përdoruesve — mbyllni raportimin me "Asnjë veprim" dhe menaxhoni punën ose punëdhënësin nga paneli i administratorit.');
        expect((await Report.findById(report._id).lean()).status).toBe('pending');
        expect(await ReportAction.countDocuments({ report: report._id })).toBe(0);
        expect((await User.findById(emp._id).lean()).status).toBe('active');
      });
    }

    it('action on a job-only report (no reportedUser) → 200, ReportAction without targetUser', async () => {
      const { user: admin } = await createAdmin();
      const { user: emp } = await createVerifiedEmployer();
      const { user: reporter } = await createJobseeker();
      const job = await createJob(emp);
      const report = await Report.create({ reportingUser: reporter._id, reportedJob: job._id, category: 'fake_job_posting', description: 'test' });

      const r = await reportAction(admin, report._id, { action: 'no_action', reason: 'nothing found' });
      expect(r.status).toBe(200);
      const actions = await ReportAction.find({ report: report._id }).lean();
      expect(actions).toHaveLength(1);
      expect(actions[0].actionType).toBe('report_resolved');
      expect(actions[0].targetUser).toBeUndefined();
      expect((await Report.findById(report._id).lean()).status).toBe('resolved');
    });
  });
});
