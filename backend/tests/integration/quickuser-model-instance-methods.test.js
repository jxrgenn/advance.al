/**
 * Phase 28 — coverage push for QuickUser instance methods that need .save():
 *   - recordNotificationSent (L256-262)
 *   - recordEmailClick (L265-270)
 *   - unsubscribe (L273-276)
 *   - convertToFullUser (L279-286)
 *   - getUnsubscribeUrl (L425-427)
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import mongoose from 'mongoose';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import QuickUser from '../../src/models/QuickUser.js';

describe('QuickUser model — instance methods', () => {
  beforeAll(async () => {
    await connectTestDB();
  });

  afterEach(async () => {
    await clearTestDB();
  });

  afterAll(async () => {
    await closeTestDB();
  });

  async function mk(overrides = {}) {
    return QuickUser.create({
      firstName: 'A', lastName: 'B',
      email: `qu-${Date.now()}-${Math.random()}@example.com`,
      location: 'Tiranë',
      interests: ['Teknologji'],
      isActive: true,
      preferences: { emailFrequency: 'immediate', smsNotifications: false, jobTypes: [], remoteWork: false, salaryRange: {} },
      ...overrides,
    });
  }

  it('recordNotificationSent: bumps counters + sets lastNotifiedAt (L256-262)', async () => {
    const qu = await mk();
    await qu.recordNotificationSent(new mongoose.Types.ObjectId());
    const refreshed = await QuickUser.findById(qu._id);
    expect(refreshed.lastNotifiedAt).toBeInstanceOf(Date);
    expect(refreshed.notificationCount).toBe(1);
    expect(refreshed.totalEmailsSent).toBe(1);
  });

  it('recordNotificationSent: increments on second call', async () => {
    const qu = await mk();
    await qu.recordNotificationSent(new mongoose.Types.ObjectId());
    await qu.recordNotificationSent(new mongoose.Types.ObjectId());
    const refreshed = await QuickUser.findById(qu._id);
    expect(refreshed.notificationCount).toBe(2);
    expect(refreshed.totalEmailsSent).toBe(2);
  });

  it('recordEmailClick: bumps emailClickCount + lastLoginAt (L265-270)', async () => {
    const qu = await mk();
    await qu.recordEmailClick();
    const refreshed = await QuickUser.findById(qu._id);
    expect(refreshed.emailClickCount).toBe(1);
    expect(refreshed.lastLoginAt).toBeInstanceOf(Date);
  });

  it('unsubscribe: flips isActive to false (L273-276)', async () => {
    const qu = await mk({ isActive: true });
    await qu.unsubscribe();
    const refreshed = await QuickUser.findById(qu._id);
    expect(refreshed.isActive).toBe(false);
  });

  it('convertToFullUser: marks converted + deactivates (L279-286)', async () => {
    const qu = await mk();
    const fullUserId = new mongoose.Types.ObjectId();
    await qu.convertToFullUser(fullUserId);
    const refreshed = await QuickUser.findById(qu._id);
    expect(refreshed.convertedToFullUser).toBe(true);
    expect(refreshed.fullUserId.toString()).toBe(fullUserId.toString());
    expect(refreshed.convertedAt).toBeInstanceOf(Date);
    expect(refreshed.isActive).toBe(false);
  });

  it('getUnsubscribeUrl: builds URL with default baseUrl (L425-427)', async () => {
    const qu = await mk();
    const url = qu.getUnsubscribeUrl();
    expect(url).toMatch(/^https:\/\/advance\.al\/unsubscribe\?token=/);
    expect(url).toContain(qu.unsubscribeToken);
  });

  it('getUnsubscribeUrl: respects custom baseUrl', async () => {
    const qu = await mk();
    const url = qu.getUnsubscribeUrl('http://localhost:3000');
    expect(url).toMatch(/^http:\/\/localhost:3000\/unsubscribe\?token=/);
  });
});
