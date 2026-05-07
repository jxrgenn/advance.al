/**
 * Phase 28 — coverage push: Notification model statics + virtuals.
 *
 * Targets the untested static methods:
 *   - createApplicationStatusNotification (4 status branches)
 *   - createAccountActionNotification (5 action branches)
 *   - getUserNotifications (with unreadOnly filter)
 *   - markAllAsReadForUser
 *   - getUnreadCount
 *   - timeAgo virtual
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import mongoose from 'mongoose';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import Notification from '../../src/models/Notification.js';
import Application from '../../src/models/Application.js';
import Job from '../../src/models/Job.js';
import { createJobseeker, createVerifiedEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';

describe('Notification model — statics + virtuals', () => {
  beforeAll(async () => {
    await connectTestDB();
  });

  afterEach(async () => {
    await clearTestDB();
  });

  afterAll(async () => {
    await closeTestDB();
  });

  describe('timeAgo virtual', () => {
    it('returns "Tani" for just-now notifications', async () => {
      const userId = new mongoose.Types.ObjectId();
      const n = await Notification.create({
        userId, type: 'general', title: 'T', message: 'M',
      });
      expect(n.timeAgo).toBe('Tani');
    });

    it('returns "minuta më parë" for ~5 minutes ago', async () => {
      const userId = new mongoose.Types.ObjectId();
      const n = new Notification({
        userId, type: 'general', title: 'T', message: 'M',
      });
      n.createdAt = new Date(Date.now() - 5 * 60 * 1000);
      expect(n.timeAgo).toMatch(/minuta më parë/);
    });

    it('returns "orë më parë" for 2 hours ago', async () => {
      const userId = new mongoose.Types.ObjectId();
      const n = new Notification({
        userId, type: 'general', title: 'T', message: 'M',
      });
      n.createdAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
      expect(n.timeAgo).toMatch(/orë më parë/);
    });

    it('returns "ditë më parë" for 3 days ago', async () => {
      const userId = new mongoose.Types.ObjectId();
      const n = new Notification({
        userId, type: 'general', title: 'T', message: 'M',
      });
      n.createdAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      expect(n.timeAgo).toMatch(/ditë më parë/);
    });
  });

  describe('createApplicationStatusNotification', () => {
    async function setupApplication() {
      const { user: js } = await createJobseeker();
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp, { title: 'React Dev' });
      const app = await Application.create({
        jobId: job._id,
        jobSeekerId: js._id,
        employerId: emp._id,
        status: 'pending',
        applicationMethod: 'one_click',
        coverLetter: 'I am interested in this position and meet all requirements',
      });
      return { app, js, emp, job };
    }

    it('creates a "viewed" notification', async () => {
      const { app, js } = await setupApplication();
      const n = await Notification.createApplicationStatusNotification(app, 'pending', 'viewed');
      expect(n).toBeTruthy();
      expect(n.userId.toString()).toBe(js._id.toString());
      expect(n.type).toBe('application_status_changed');
      expect(n.title).toMatch(/u shikua/i);
    });

    it('creates a "shortlisted" notification', async () => {
      const { app } = await setupApplication();
      const n = await Notification.createApplicationStatusNotification(app, 'viewed', 'shortlisted');
      expect(n.title).toMatch(/listën e shkurtër/i);
    });

    it('creates a "rejected" notification', async () => {
      const { app } = await setupApplication();
      const n = await Notification.createApplicationStatusNotification(app, 'pending', 'rejected');
      expect(n.title).toMatch(/refuzua/i);
    });

    it('creates a "hired" notification', async () => {
      const { app } = await setupApplication();
      const n = await Notification.createApplicationStatusNotification(app, 'shortlisted', 'hired');
      expect(n.title).toMatch(/U pranuat/i);
    });

    it('returns undefined for unknown status (no message defined)', async () => {
      const { app } = await setupApplication();
      const n = await Notification.createApplicationStatusNotification(app, 'pending', 'unknown_status');
      expect(n).toBeUndefined();
    });
  });

  describe('createAccountActionNotification', () => {
    it('creates a warning notification', async () => {
      const userId = new mongoose.Types.ObjectId();
      const n = await Notification.createAccountActionNotification(
        userId, 'warning', 'Test reason', null, null
      );
      expect(n.type).toBe('account_warning');
      expect(n.message).toMatch(/Test reason/);
    });

    it('creates a temporary_suspension with duration', async () => {
      const userId = new mongoose.Types.ObjectId();
      const n = await Notification.createAccountActionNotification(
        userId, 'temporary_suspension', 'Spam', 7, null
      );
      expect(n.type).toBe('account_suspended');
      expect(n.message).toMatch(/7 ditë/);
    });

    it('creates a permanent_suspension', async () => {
      const userId = new mongoose.Types.ObjectId();
      const n = await Notification.createAccountActionNotification(
        userId, 'permanent_suspension', 'Severe', null, null
      );
      expect(n.type).toBe('account_banned');
      expect(n.message).toMatch(/mbyllur përgjithmonë/i);
    });

    it('creates an account_termination', async () => {
      const userId = new mongoose.Types.ObjectId();
      const n = await Notification.createAccountActionNotification(
        userId, 'account_termination', 'Final', null, null
      );
      expect(n.type).toBe('account_banned');
      expect(n.message).toMatch(/fshirë përgjithmonë/i);
    });

    it('creates an account_restored notification', async () => {
      const userId = new mongoose.Types.ObjectId();
      const n = await Notification.createAccountActionNotification(
        userId, 'account_restored', 'After review', null, null
      );
      expect(n.type).toBe('account_restored');
      expect(n.title).toMatch(/riaktivizuar/);
    });

    it('returns undefined for unknown action', async () => {
      const userId = new mongoose.Types.ObjectId();
      const n = await Notification.createAccountActionNotification(
        userId, 'bogus_action', 'whatever', null, null
      );
      expect(n).toBeUndefined();
    });

    it('falls back to default reason when null reason given (warning)', async () => {
      const userId = new mongoose.Types.ObjectId();
      const n = await Notification.createAccountActionNotification(
        userId, 'warning', null, null, null
      );
      expect(n.message).toMatch(/Shkelje/);
    });
  });

  describe('getUserNotifications + getUnreadCount + markAllAsReadForUser', () => {
    async function seedNotifications(userId, count = 3, opts = {}) {
      for (let i = 0; i < count; i++) {
        await Notification.create({
          userId, type: 'general',
          title: `Title ${i}`, message: `Msg ${i}`,
          read: opts.read ?? false,
        });
      }
    }

    it('returns notifications sorted by createdAt desc', async () => {
      const userId = new mongoose.Types.ObjectId();
      await seedNotifications(userId, 3);
      const r = await Notification.getUserNotifications(userId);
      expect(r.length).toBe(3);
      // Most recent first
      expect(r[0].title).toBe('Title 2');
    });

    it('respects unreadOnly filter', async () => {
      const userId = new mongoose.Types.ObjectId();
      await seedNotifications(userId, 2, { read: false });
      await seedNotifications(userId, 3, { read: true });
      const all = await Notification.getUserNotifications(userId);
      const unread = await Notification.getUserNotifications(userId, { unreadOnly: true });
      expect(all.length).toBe(5);
      expect(unread.length).toBe(2);
    });

    it('respects limit and skip pagination options', async () => {
      const userId = new mongoose.Types.ObjectId();
      await seedNotifications(userId, 10);
      const page1 = await Notification.getUserNotifications(userId, { limit: 3, skip: 0 });
      const page2 = await Notification.getUserNotifications(userId, { limit: 3, skip: 3 });
      expect(page1.length).toBe(3);
      expect(page2.length).toBe(3);
      expect(page1[0]._id.toString()).not.toBe(page2[0]._id.toString());
    });

    it('getUnreadCount returns correct unread count', async () => {
      const userId = new mongoose.Types.ObjectId();
      await seedNotifications(userId, 4, { read: false });
      await seedNotifications(userId, 6, { read: true });
      const count = await Notification.getUnreadCount(userId);
      expect(count).toBe(4);
    });

    it('markAllAsReadForUser marks every unread one as read', async () => {
      const userId = new mongoose.Types.ObjectId();
      await seedNotifications(userId, 5, { read: false });

      const result = await Notification.markAllAsReadForUser(userId);
      expect(result.modifiedCount).toBe(5);

      const stillUnread = await Notification.getUnreadCount(userId);
      expect(stillUnread).toBe(0);
    });
  });

  describe('markAsRead instance method', () => {
    it('sets read=true and readAt on a fresh notification', async () => {
      const userId = new mongoose.Types.ObjectId();
      const n = await Notification.create({
        userId, type: 'general', title: 'T', message: 'M', read: false,
      });
      const updated = await n.markAsRead();
      expect(updated.read).toBe(true);
      expect(updated.readAt).toBeInstanceOf(Date);
    });

    it('is a no-op when already read', async () => {
      const userId = new mongoose.Types.ObjectId();
      const n = await Notification.create({
        userId, type: 'general', title: 'T', message: 'M', read: true,
      });
      const updated = await n.markAsRead();
      expect(updated.read).toBe(true);
    });
  });
});
