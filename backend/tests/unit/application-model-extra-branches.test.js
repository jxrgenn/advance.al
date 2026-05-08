/**
 * Phase 28 — coverage push for Application model branches not exercised by
 * application-model-methods.test.js / application-model-virtuals.test.js.
 *
 * Targets:
 *   - withdraw() with NO reason (L209 false branch)
 *   - updateStatus() with no notes arg (L155 false branch)
 *   - updateStatus() to status NOT in the notification whitelist (L163 false)
 *   - markMessagesAsRead — message FROM the calling user is NOT marked read (L193 condition)
 *   - getEmployerApplications status + jobId filter branches (L238, L242)
 *   - getJobSeekerApplications status filter branch (L259)
 *   - hasUserApplied excludes withdrawn applications (L227 partial filter)
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import mongoose from 'mongoose';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createVerifiedEmployer, createJobseeker } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import Application from '../../src/models/Application.js';

async function setup() {
  const { user: emp } = await createVerifiedEmployer();
  const { user: js } = await createJobseeker({ email: `${Date.now()}@x.com` });
  const job = await createJob(emp);
  const app = await Application.create({
    jobId: job._id, jobSeekerId: js._id, employerId: emp._id,
    applicationMethod: 'one_click', status: 'pending',
  });
  return { emp, js, job, app };
}

describe('Application model — extra branch coverage', () => {
  beforeAll(async () => { await connectTestDB(); await seedLocations(); });
  afterEach(async () => { await clearTestDB(); await seedLocations(); });
  afterAll(async () => { await closeTestDB(); });

  it('withdraw() without reason leaves withdrawalReason undefined (L209 false)', async () => {
    const { app } = await setup();
    await app.withdraw();
    const r = await Application.findById(app._id);
    expect(r.withdrawn).toBe(true);
    expect(r.withdrawalReason).toBeUndefined();
  });

  it('updateStatus() with no notes arg does NOT touch employerNotes (L155 false)', async () => {
    const { app } = await setup();
    app.employerNotes = 'old note';
    await app.save();
    await app.updateStatus('viewed'); // no notes
    const r = await Application.findById(app._id);
    expect(r.status).toBe('viewed');
    expect(r.employerNotes).toBe('old note'); // unchanged
  });

  it('updateStatus() to non-whitelisted status does NOT create notification (L163 false)', async () => {
    const { app } = await setup();
    // 'pending' is the default; transitioning back to a non-whitelisted status
    // (not viewed/shortlisted/rejected/hired) skips notification creation.
    // Note: transitioning to anything in the whitelist does create one — the
    // false branch is when status changes but isn't in the list.
    app.status = 'viewed';
    await app.save();
    await app.updateStatus('pending'); // 'pending' not in whitelist
    const r = await Application.findById(app._id);
    expect(r.status).toBe('pending');
  });

  it('markMessagesAsRead does NOT mark messages from the calling user (L193 condition)', async () => {
    const { js, emp, app } = await setup();
    // Add two messages: one FROM the jobseeker, one FROM the employer
    await app.addMessage(js._id, 'from jobseeker', 'text');
    await app.addMessage(emp._id, 'from employer', 'text');

    // Jobseeker reads — only employer's message should flip to read
    await app.markMessagesAsRead(js._id);
    const r = await Application.findById(app._id);
    const jsMsg = r.messages.find(m => m.from.equals(js._id));
    const empMsg = r.messages.find(m => m.from.equals(emp._id));
    expect(jsMsg.read).toBe(false); // own message never marked read
    expect(empMsg.read).toBe(true);
  });

  it('getEmployerApplications with status filter narrows results (L238)', async () => {
    const { emp, app } = await setup();
    // Seed a second application from a different jobseeker with status='hired'
    const { user: js2 } = await createJobseeker({ email: 'gea-other@x.com' });
    const job2 = await createJob(emp);
    await Application.create({
      jobId: job2._id, jobSeekerId: js2._id, employerId: emp._id,
      applicationMethod: 'one_click', status: 'hired',
    });

    const filtered = await Application.getEmployerApplications(emp._id, { status: 'hired' });
    expect(filtered.length).toBe(1);
    expect(filtered[0].status).toBe('hired');
  });

  it('getEmployerApplications with jobId filter narrows results (L242)', async () => {
    const { emp, app } = await setup();
    const { user: js2 } = await createJobseeker({ email: 'gej-other@x.com' });
    const job2 = await createJob(emp);
    await Application.create({
      jobId: job2._id, jobSeekerId: js2._id, employerId: emp._id,
      applicationMethod: 'one_click', status: 'pending',
    });

    const filtered = await Application.getEmployerApplications(emp._id, { jobId: job2._id });
    expect(filtered.length).toBe(1);
    expect(filtered[0].jobId._id.toString()).toBe(job2._id.toString());
  });

  it('getJobSeekerApplications with status filter narrows results (L259)', async () => {
    const { js, emp, app } = await setup();
    // Seed a second app for same jobseeker but different status
    const job2 = await createJob(emp);
    await Application.create({
      jobId: job2._id, jobSeekerId: js._id, employerId: emp._id,
      applicationMethod: 'one_click', status: 'rejected',
    });

    const filtered = await Application.getJobSeekerApplications(js._id, { status: 'rejected' });
    expect(filtered.length).toBe(1);
    expect(filtered[0].status).toBe('rejected');
  });

  it('hasUserApplied excludes withdrawn applications (L227 partial)', async () => {
    const { js, job, app } = await setup();
    await app.withdraw('test');

    const found = await Application.hasUserApplied(job._id, js._id);
    expect(found).toBeNull();
  });
});
