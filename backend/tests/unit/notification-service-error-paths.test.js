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

  it('sendJobNotificationToUser returns {success:false, error} when sendEmail throws (L279-286)', async () => {
    const spy = jest.spyOn(notificationService, 'sendEmail').mockRejectedValueOnce(new Error('email gone'));
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
    spy.mockRestore();
  });

  it('sendDailyDigest returns stub success (L649-651)', async () => {
    const r = await notificationService.sendDailyDigest();
    expect(r.success).toBe(true);
    expect(r.message).toMatch(/not yet implemented|Daily/i);
  });

  it('sendWeeklyDigest returns stub success (L653-655)', async () => {
    const r = await notificationService.sendWeeklyDigest();
    expect(r.success).toBe(true);
    expect(r.message).toMatch(/not yet implemented|Weekly/i);
  });
});
