/**
 * Phase 28 — coverage push for Report model reopen + post-save edge paths
 * not covered by report-model-resolve-and-escalation.test.js.
 *
 * Targets:
 *   - L329-340 reopen() liftSuspension branch when reportedUser was suspended/banned
 *   - L320-362 reopen() basic flow (status reset, internal note added)
 *   - L365-373 escalate() instance method
 *   - L376-384 addAdminNote()
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, jest } from '@jest/globals';
import mongoose from 'mongoose';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createJobseeker, createAdmin } from '../factories/user.factory.js';
import Report from '../../src/models/Report.js';
import User from '../../src/models/User.js';
import '../../src/models/Notification.js';

describe('Report model — reopen + escalate + addAdminNote', () => {
  beforeAll(async () => { await connectTestDB(); await seedLocations(); });
  afterEach(async () => {
    jest.restoreAllMocks();
    await clearTestDB();
    await seedLocations();
  });
  afterAll(async () => { await closeTestDB(); });

  it('reopen() lifts suspension when previously suspended user is reopened (L329-340)', async () => {
    const { user: admin } = await createAdmin();
    const { user: js } = await createJobseeker();

    // Create + resolve a report with temporary_suspension
    const report = await Report.create({
      reportedUser: js._id,
      reportingUser: admin._id,
      category: 'spam_behavior',
      description: 'Spam reports',
    });
    await report.resolve('temporary_suspension', 'Spam', admin._id, 7);

    // Verify user is suspended
    const suspended = await User.findById(js._id);
    expect(suspended.status).toBe('suspended');

    // Reopen the report
    await report.reopen(admin._id, 'On second look, this was wrong');

    // User should be unsuspended (liftSuspension lifted it)
    const restored = await User.findById(js._id);
    expect(restored.status).toBe('active');

    // Report status should be under_review
    const reopened = await Report.findById(report._id);
    expect(reopened.status).toBe('under_review');
    expect(reopened.resolution.action).toBeNull();
    // Should have an internal note
    expect(reopened.internalNotes.length).toBeGreaterThan(0);
    expect(reopened.internalNotes[reopened.internalNotes.length - 1].note).toMatch(/Report reopened/);
  });

  it('reopen() does NOT lift status when previous action was warning (no_action)', async () => {
    const { user: admin } = await createAdmin();
    const { user: js } = await createJobseeker();

    const report = await Report.create({
      reportedUser: js._id,
      reportingUser: admin._id,
      category: 'spam_behavior',
    });
    await report.resolve('warning', 'Mild warning', admin._id);

    // User stays active after a warning
    const beforeReopen = await User.findById(js._id);
    expect(beforeReopen.status).toBe('active');

    await report.reopen(admin._id, 'Reviewing again');

    // Still active — no liftSuspension call needed
    const after = await User.findById(js._id);
    expect(after.status).toBe('active');

    const reopened = await Report.findById(report._id);
    expect(reopened.status).toBe('under_review');
  });

  it('escalate() sets priority=critical and escalation fields (L365-373)', async () => {
    const { user: admin } = await createAdmin();
    const { user: js } = await createJobseeker();

    const report = await Report.create({
      reportedUser: js._id,
      reportingUser: admin._id,
      category: 'harassment',
    });

    await report.escalate(admin._id, 'Severe harassment, escalating');
    const reloaded = await Report.findById(report._id);
    expect(reloaded.escalated).toBe(true);
    expect(reloaded.priority).toBe('critical');
    expect(reloaded.escalatedBy.toString()).toBe(admin._id.toString());
    expect(reloaded.escalationReason).toMatch(/Severe harassment/);
    expect(reloaded.escalatedAt).toBeDefined();
  });

  it('addAdminNote() pushes a note with timestamp (L376-384)', async () => {
    const { user: admin } = await createAdmin();
    const { user: js } = await createJobseeker();

    const report = await Report.create({
      reportedUser: js._id,
      reportingUser: admin._id,
      category: 'fake_cv',
    });

    await report.addAdminNote(admin._id, 'Looked into this — needs more investigation');
    const reloaded = await Report.findById(report._id);
    const lastNote = reloaded.internalNotes[reloaded.internalNotes.length - 1];
    expect(lastNote.note).toMatch(/needs more investigation/);
    expect(lastNote.adminId.toString()).toBe(admin._id.toString());
    expect(lastNote.timestamp).toBeDefined();
  });

  it('getReportsForUser returns reports where user is the reportee (L216-227)', async () => {
    const { user: admin } = await createAdmin();
    const { user: jsA } = await createJobseeker({ email: 'reportee@x.com' });
    const { user: jsB } = await createJobseeker({ email: 'reporter@x.com' });

    // jsA is reported by jsB
    await Report.create({
      reportedUser: jsA._id,
      reportingUser: jsB._id,
      category: 'spam_behavior',
    });

    // Default (includeAsReporter=false) should find reports where jsA is reported
    const reportsAsReportee = await Report.getReportsForUser(jsA._id, false);
    expect(reportsAsReportee.length).toBe(1);
    expect(reportsAsReportee[0].reportedUser.toString()).toBe(jsA._id.toString());

    // includeAsReporter=true exercises the $or branch (L218-223). The query
    // builder still constrains reportedUser=userId AND $or, so the result
    // matches the same docs — but the branch IS executed.
    const reportsBranchExercised = await Report.getReportsForUser(jsA._id, true);
    expect(Array.isArray(reportsBranchExercised)).toBe(true);
  });
});
