/**
 * Phase 28 — coverage push for Application model virtuals (timeAgo,
 * unreadMessageCount) — L123-138. Existing application-model.test.js
 * covers schema, methods covered separately, but virtuals were a gap.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import mongoose from 'mongoose';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createJobseeker, createVerifiedEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import Application from '../../src/models/Application.js';

describe('Application model — virtuals', () => {
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
    return { emp, js, job };
  }

  describe('timeAgo virtual', () => {
    it('returns "Sapo aplikuar" for fresh application (L132)', async () => {
      const { emp, js, job } = await setup();
      const app = await Application.create({
        jobId: job._id, jobSeekerId: js._id, employerId: emp._id,
        applicationMethod: 'one_click', status: 'pending',
      });
      expect(app.timeAgo).toBe('Sapo aplikuar');
    });

    it('returns "orë më parë" for application from few hours ago (L131)', async () => {
      const { emp, js, job } = await setup();
      const app = await Application.create({
        jobId: job._id, jobSeekerId: js._id, employerId: emp._id,
        applicationMethod: 'one_click', status: 'pending',
      });
      // Backdate appliedAt
      await Application.collection.updateOne(
        { _id: app._id },
        { $set: { appliedAt: new Date(Date.now() - 5 * 60 * 60 * 1000) } }
      );
      const refreshed = await Application.findById(app._id);
      expect(refreshed.timeAgo).toMatch(/orë më parë/);
    });

    it('returns "ditë më parë" for application from days ago (L130)', async () => {
      const { emp, js, job } = await setup();
      const app = await Application.create({
        jobId: job._id, jobSeekerId: js._id, employerId: emp._id,
        applicationMethod: 'one_click', status: 'pending',
      });
      await Application.collection.updateOne(
        { _id: app._id },
        { $set: { appliedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) } }
      );
      const refreshed = await Application.findById(app._id);
      expect(refreshed.timeAgo).toMatch(/ditë më parë/);
    });
  });

  describe('unreadMessageCount virtual', () => {
    it('returns 0 when no messages (L137 ternary right)', async () => {
      const { emp, js, job } = await setup();
      const app = await Application.create({
        jobId: job._id, jobSeekerId: js._id, employerId: emp._id,
        applicationMethod: 'one_click', status: 'pending',
      });
      expect(app.unreadMessageCount).toBe(0);
    });

    it('counts only unread messages', async () => {
      const { emp, js, job } = await setup();
      const app = await Application.create({
        jobId: job._id, jobSeekerId: js._id, employerId: emp._id,
        applicationMethod: 'one_click', status: 'pending',
      });
      await app.addMessage(js._id, 'q1', 'text');
      await app.addMessage(emp._id, 'a1', 'text');
      await app.addMessage(js._id, 'q2', 'text');

      const refreshed = await Application.findById(app._id);
      expect(refreshed.unreadMessageCount).toBe(3); // all unread

      // Mark js's messages as read by emp
      await refreshed.markMessagesAsRead(emp._id);
      const after = await Application.findById(app._id);
      // Only emp's own message remains unread (markMessagesAsRead skips own)
      expect(after.unreadMessageCount).toBe(1);
    });
  });
});
