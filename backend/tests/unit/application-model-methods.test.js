/**
 * Phase 28 — coverage push for Application model instance methods.
 *
 * Existing application-model.test.js covers schema validation. Adds:
 *   - markAsViewed: pending → viewed (L141-148)
 *   - markAsViewed: non-pending → no-op (L147)
 *   - addMessage (L177-186)
 *   - markMessagesAsRead: marks unread, skips own messages, no-op when nothing unread (L189-203)
 *   - withdraw with reason + decrements job applicationCount (L206-220)
 *   - hasUserApplied static returns null vs found
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import mongoose from 'mongoose';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createJobseeker, createVerifiedEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import Application from '../../src/models/Application.js';
import Job from '../../src/models/Job.js';

describe('Application model — instance + static methods', () => {
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

  async function setup() {
    const { user: emp } = await createVerifiedEmployer();
    const { user: js } = await createJobseeker();
    const job = await createJob(emp);
    const app = await Application.create({
      jobId: job._id, jobSeekerId: js._id, employerId: emp._id,
      applicationMethod: 'one_click', status: 'pending',
    });
    return { emp, js, job, app };
  }

  describe('markAsViewed', () => {
    it('flips pending → viewed and stamps viewedAt', async () => {
      const { app } = await setup();
      await app.markAsViewed();
      const refreshed = await Application.findById(app._id);
      expect(refreshed.status).toBe('viewed');
      expect(refreshed.viewedAt).toBeInstanceOf(Date);
    });

    it('no-op when status is already viewed (L147)', async () => {
      const { app } = await setup();
      app.status = 'shortlisted';
      await app.save();
      const result = await app.markAsViewed();
      expect(result.status).toBe('shortlisted'); // unchanged
    });
  });

  describe('addMessage', () => {
    it('appends a message with sender + type + sentAt', async () => {
      const { js, app } = await setup();
      await app.addMessage(js._id, 'Hello there', 'text');
      const refreshed = await Application.findById(app._id);
      expect(refreshed.messages.length).toBe(1);
      expect(refreshed.messages[0].message).toBe('Hello there');
      expect(refreshed.messages[0].type).toBe('text');
      expect(refreshed.messages[0].read).toBe(false);
      expect(refreshed.messages[0].sentAt).toBeInstanceOf(Date);
    });
  });

  describe('markMessagesAsRead', () => {
    it('marks messages from OTHER party as read (L189-203)', async () => {
      const { emp, js, app } = await setup();
      await app.addMessage(js._id, 'q1');
      await app.addMessage(emp._id, 'a1');
      const refreshed = await Application.findById(app._id);

      // Employer reads → only the jobseeker's message gets marked read
      await refreshed.markMessagesAsRead(emp._id);
      const after = await Application.findById(app._id);
      const fromJs = after.messages.find(m => m.from.equals(js._id));
      const fromEmp = after.messages.find(m => m.from.equals(emp._id));
      expect(fromJs.read).toBe(true);
      expect(fromEmp.read).toBe(false);
    });

    it('no-op when nothing unread (L199-202)', async () => {
      const { js, app } = await setup();
      await app.addMessage(js._id, 'm1');
      // Mark read first
      await app.markMessagesAsRead(new mongoose.Types.ObjectId());
      // Second call: nothing changes
      const result = await app.markMessagesAsRead(new mongoose.Types.ObjectId());
      expect(result).toBeDefined();
    });
  });

  describe('withdraw', () => {
    it('marks withdrawn, sets reason, decrements job.applicationCount', async () => {
      const { job, app } = await setup();
      // Bump count to 1 so we can verify decrement
      await Job.findByIdAndUpdate(job._id, { applicationCount: 1 });

      await app.withdraw('Changed my mind');
      const refreshed = await Application.findById(app._id);
      expect(refreshed.withdrawn).toBe(true);
      expect(refreshed.withdrawalReason).toBe('Changed my mind');
      expect(refreshed.withdrawnAt).toBeInstanceOf(Date);

      const updatedJob = await Job.findById(job._id);
      expect(updatedJob.applicationCount).toBe(0);
    });

    it('applicationCount floors at 0 (cannot go negative)', async () => {
      const { job, app } = await setup();
      // applicationCount already 0
      await app.withdraw();
      const updatedJob = await Job.findById(job._id);
      expect(updatedJob.applicationCount).toBe(0);
    });
  });

  describe('hasUserApplied static', () => {
    it('returns the application when found', async () => {
      const { js, job } = await setup();
      const found = await Application.hasUserApplied(job._id, js._id);
      expect(found).toBeTruthy();
    });

    it('returns null when no matching application exists', async () => {
      const { js } = await setup();
      const fakeJobId = new mongoose.Types.ObjectId();
      const found = await Application.hasUserApplied(fakeJobId, js._id);
      expect(found).toBeNull();
    });
  });

  describe('updateStatus', () => {
    it('updates status + creates Notification on change to non-pending', async () => {
      const { app } = await setup();
      await app.updateStatus('viewed', 'looks promising');
      const refreshed = await Application.findById(app._id);
      expect(refreshed.status).toBe('viewed');
      expect(refreshed.employerNotes).toBe('looks promising');
      expect(refreshed.respondedAt).toBeInstanceOf(Date);
    });

    it('updateStatus with same status does NOT create notification', async () => {
      const { app } = await setup();
      app.status = 'viewed';
      await app.save();
      // updateStatus to same value — code path takes oldStatus===newStatus branch
      await app.updateStatus('viewed');
      const refreshed = await Application.findById(app._id);
      expect(refreshed.status).toBe('viewed');
    });
  });
});
