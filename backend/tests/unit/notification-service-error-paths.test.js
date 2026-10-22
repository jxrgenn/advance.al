/**
 * Phase 28 — coverage push for notificationService error/catch branches
 * not exercised by happy-path tests.
 *
 * Targets:
 *   - sendJobNotificationToFullUser catch returning {success:false, error, userId} (L232-235)
 *   - sendJobNotificationToUser catch returning failure shape (L279-286)
 *   - notifyMatchingUsers outer catch when DB load fails (L401-408)
 *   - sendDailyDigest / sendWeeklyDigest stub returns
 */

import { describe, it, expect, jest, afterEach } from '@jest/globals';
import notificationService from '../../src/lib/notificationService.js';
import QuickUser from '../../src/models/QuickUser.js';

describe('notificationService — error/catch branches', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sendJobNotificationToFullUser returns {success:false, error} when generator throws (L232-235)', async () => {
    // Force generator to throw by calling with a malformed user (no profile / undefined accesses)
    // Actually generator is permissive; force sendEmail to throw instead via spy
    const spy = jest.spyOn(notificationService, 'sendEmail').mockRejectedValueOnce(new Error('SMTP down'));
    const user = { _id: 'u1', email: 'x@x.com', profile: { firstName: 'A' } };
    const job = {
      _id: 'j1', title: 'T', description: 'd', category: 'IT',
      location: { city: 'Tiranë' }, employerId: { profile: { employerProfile: {} } },
      applicationDeadline: new Date(),
    };

    const r = await notificationService.sendJobNotificationToFullUser(user, job);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/SMTP down/);
    expect(r.userId).toBe('u1');
    spy.mockRestore();
  });

  it('sendJobNotificationToUser returns {success:false, error} when sendEmail throws, and gives the job back (slot + digest queue)', async () => {
    const spy = jest.spyOn(notificationService, 'sendEmail').mockRejectedValueOnce(new Error('email gone'));
    const claim = { claimed: true, previousLastNotifiedAt: null, claimedAt: new Date() };
    jest.spyOn(QuickUser, 'claimJobAlertSlot').mockResolvedValueOnce(claim);
    const giveBack = jest.spyOn(QuickUser, 'giveBackJobAlert').mockResolvedValueOnce(true);
    const user = {
      _id: 'u2', email: 'x@x.com', firstName: 'X',
      preferences: { smsNotifications: false },
      allInterests: ['IT'],
      unsubscribeToken: 'tok',
      getUnsubscribeUrl() { return 'https://x/u'; },
    };
    const job = {
      _id: 'j1', title: 'T', description: 'd', category: 'IT',
      location: { city: 'Tiranë' }, employerId: { profile: { employerProfile: {} } },
      applicationDeadline: new Date(),
    };

    const r = await notificationService.sendJobNotificationToUser(user, job);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/email gone/);
    expect(r.userId).toBe('u2');
    // slot released AND the job re-queued for the subscriber's next digest
    expect(giveBack).toHaveBeenCalledWith('u2', 'j1', claim, 0);
    spy.mockRestore();
  });

  // The admin digest triggers now run the real QuickUser digest flush; with
  // no subscriber due (stubbed query) they report zero sends.
  it('sendDailyDigest runs the QuickUser digest flush', async () => {
    jest.spyOn(QuickUser, 'find').mockReturnValue({ limit: async () => [] });
    const r = await notificationService.sendDailyDigest();
    expect(r).toEqual({ success: true, message: 'QuickUser digests sent: 0', stats: { processed: 0, sent: 0, errors: 0, skipped: 0 } });
  });

  it('sendWeeklyDigest runs the same flush', async () => {
    jest.spyOn(QuickUser, 'find').mockReturnValue({ limit: async () => [] });
    const r = await notificationService.sendWeeklyDigest();
    expect(r).toEqual({ success: true, message: 'QuickUser digests sent: 0', stats: { processed: 0, sent: 0, errors: 0, skipped: 0 } });
  });
});
