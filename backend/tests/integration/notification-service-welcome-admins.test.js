/**
 * Phase 28 — coverage push for notificationService.sendWelcomeEmail (L527-618)
 * + notifyAdmins (L621-645).
 *
 * Targets:
 *   - sendWelcomeEmail: happy path → result returned
 *   - sendWelcomeEmail: throws when sendEmail rejects (L614-616)
 *   - notifyAdmins: no admins → success short-circuit
 *   - notifyAdmins: per-admin send error swallowed (L636-637)
 *   - notifyAdmins: User.find throws → success=false (L641-643)
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, jest } from '@jest/globals';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createAdmin } from '../factories/user.factory.js';
import notificationService from '../../src/lib/notificationService.js';
import User from '../../src/models/User.js';
import QuickUser from '../../src/models/QuickUser.js';

describe('notificationService — sendWelcomeEmail + notifyAdmins', () => {
  beforeAll(async () => { await connectTestDB(); await seedLocations(); });
  afterEach(async () => {
    jest.restoreAllMocks();
    await clearTestDB();
    await seedLocations();
  });
  afterAll(async () => { await closeTestDB(); });

  describe('sendWelcomeEmail', () => {
    it('returns success when sendEmail resolves (happy path)', async () => {
      const qu = await QuickUser.create({
        email: `welcome-${Date.now()}@example.com`,
        firstName: 'New',
        lastName: 'User',
        location: 'Tiranë',
        interests: ['Teknologji', 'Marketing'],
        preferences: {},
      });
      jest.spyOn(notificationService, 'sendEmail').mockResolvedValueOnce({ success: true, messageId: 'mock-1' });

      const r = await notificationService.sendWelcomeEmail(qu);
      expect(r.success).toBe(true);
    });

    it('throws when sendEmail rejects (L614-616)', async () => {
      const qu = await QuickUser.create({
        email: `welcome-fail-${Date.now()}@example.com`,
        firstName: 'New',
        lastName: 'User',
        location: 'Tiranë',
        interests: ['Teknologji'],
        preferences: {},
      });
      jest.spyOn(notificationService, 'sendEmail').mockRejectedValueOnce(new Error('SMTP down'));

      await expect(notificationService.sendWelcomeEmail(qu)).rejects.toThrow(/SMTP down/);
    });
  });

  describe('notifyAdmins', () => {
    it('returns short-circuit success when no admins exist', async () => {
      // Empty DB → no admins
      const r = await notificationService.notifyAdmins('new_report', { reason: 'spam' });
      expect(r.success).toBe(true);
      expect(r.message).toMatch(/No admins/);
    });

    it('iterates admins and reports success count', async () => {
      const { user: a1 } = await createAdmin({ email: 'a1@x.com' });
      const { user: a2 } = await createAdmin({ email: 'a2@x.com' });
      jest.spyOn(notificationService, 'sendEmail').mockResolvedValue({ success: true, messageId: 'mock' });

      const r = await notificationService.notifyAdmins('new_report', { reason: 'harassment' });
      expect(r.success).toBe(true);
      expect(r.message).toMatch(/Notified 2/);
      void a1; void a2;
    });

    it('swallows per-admin send error (L636-637)', async () => {
      const { user: a1 } = await createAdmin({ email: 'a3@x.com' });
      const { user: a2 } = await createAdmin({ email: 'a4@x.com' });
      const sendEmailSpy = jest.spyOn(notificationService, 'sendEmail');
      sendEmailSpy.mockRejectedValueOnce(new Error('first admin send fail'));
      sendEmailSpy.mockResolvedValueOnce({ success: true, messageId: 'mock' });

      const r = await notificationService.notifyAdmins('new_report', { reason: 'spam' });
      // Per-admin .catch swallows error, returns success=true with both notified count
      expect(r.success).toBe(true);
      expect(r.message).toMatch(/Notified 2/);
      void a1; void a2;
    });

    it('returns success=false when User.find throws (L641-643)', async () => {
      jest.spyOn(User, 'find').mockImplementationOnce(() => {
        throw new Error('user find fail');
      });
      const r = await notificationService.notifyAdmins('new_report', { reason: 'spam' });
      expect(r.success).toBe(false);
      expect(r.error).toMatch(/user find fail/);
    });
  });

  describe('digests', () => {
    it('sendDailyDigest returns stub success', async () => {
      const r = await notificationService.sendDailyDigest();
      expect(r.success).toBe(true);
      expect(r.message).toMatch(/Daily/);
    });

    it('sendWeeklyDigest returns stub success', async () => {
      const r = await notificationService.sendWeeklyDigest();
      expect(r.success).toBe(true);
      expect(r.message).toMatch(/Weekly/);
    });
  });
});
