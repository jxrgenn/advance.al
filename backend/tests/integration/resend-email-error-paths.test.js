/**
 * Phase 28 — coverage push for resendEmailService error/catch paths.
 *
 * Covers the catch block + Resend-error branch in every major function
 * by configuring a stub `resend` that returns {error} or throws.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from '@jest/globals';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import resendEmailService from '../../src/lib/resendEmailService.js';

let originalResend;
let originalEnabled;

function mockResendError(errorMessage = 'Resend API down') {
  resendEmailService.resend = {
    emails: {
      send: async () => ({ data: null, error: { message: errorMessage } }),
    },
  };
  resendEmailService.enabled = true;
}

function mockResendThrow(error = new Error('Network failure')) {
  resendEmailService.resend = {
    emails: {
      send: async () => { throw error; },
    },
  };
  resendEmailService.enabled = true;
}

describe('resendEmailService — error/catch paths', () => {
  beforeAll(async () => {
    await connectTestDB();
    await seedLocations();
    originalResend = resendEmailService.resend;
    originalEnabled = resendEmailService.enabled;
  });

  afterEach(async () => {
    await clearTestDB();
    await seedLocations();
  });

  afterAll(async () => {
    resendEmailService.resend = originalResend;
    resendEmailService.enabled = originalEnabled;
    await closeTestDB();
  });

  describe('sendFullAccountWelcomeEmail catch', () => {
    it('rethrows when send throws (L200-203)', async () => {
      mockResendThrow();
      await expect(resendEmailService.sendFullAccountWelcomeEmail({
        email: 'x@y.com', profile: { firstName: 'A', lastName: 'B', location: { city: 'X' } },
      })).rejects.toThrow(/Network failure/);
    });
  });

  describe('sendQuickUserWelcomeEmail error', () => {
    it('throws when Resend returns error (L341-343)', async () => {
      mockResendError();
      await expect(resendEmailService.sendQuickUserWelcomeEmail({
        email: 'x@y.com', firstName: 'A', lastName: 'B', location: 'X', interests: ['Teknologji'],
        getUnsubscribeUrl: () => 'https://x',
      })).rejects.toThrow(/Failed to send email|Resend|API down/i);
    });
  });

  describe('sendAccountActionEmail error', () => {
    it('throws when Resend returns error (L533-534)', async () => {
      mockResendError();
      await expect(resendEmailService.sendAccountActionEmail(
        { email: 'x@y.com', profile: { firstName: 'A' } },
        'warning', 'Spam'
      )).rejects.toThrow(/Failed to send/);
    });
  });

  describe('sendBulkNotificationEmail error', () => {
    it('throws when Resend returns error', async () => {
      mockResendError();
      await expect(resendEmailService.sendBulkNotificationEmail('x@y.com', {
        type: 'announcement', title: 'T', message: 'M', userName: 'U',
      })).rejects.toThrow(/Failed to send/);
    });
  });

  describe('sendTransactionalEmail error', () => {
    it('returns success=false when Resend returns error (L698-700, L704-706)', async () => {
      mockResendError();
      const r = await resendEmailService.sendTransactionalEmail(
        'x@y.com', 'Subject', '<p>html</p>', 'plain'
      );
      expect(r.success).toBe(false);
      expect(r.error).toMatch(/Failed to send transactional/);
    });

    it('returns success=false when send throws (L704-706)', async () => {
      mockResendThrow();
      const r = await resendEmailService.sendTransactionalEmail(
        'x@y.com', 'Subject', '<p>html</p>', 'plain'
      );
      expect(r.success).toBe(false);
      expect(r.error).toMatch(/Network failure/);
    }, 10000);
  });

  describe('sendApplicationMessageEmail error', () => {
    it('throws when Resend returns error (L837-838)', async () => {
      mockResendError();
      await expect(resendEmailService.sendApplicationMessageEmail(
        { email: 'r@x.com', firstName: 'R', lastName: 'X' },
        { firstName: 'S', lastName: 'Y' },
        { title: 'J', companyName: 'C' },
        'hello',
        'text'
      )).rejects.toThrow(/Failed to send/);
    });
  });

  describe('sendPasswordResetEmail error', () => {
    it('throws when Resend returns error (L934-935)', async () => {
      mockResendError();
      await expect(resendEmailService.sendPasswordResetEmail(
        { email: 'r@x.com', profile: { firstName: 'R' } },
        'https://x.test/reset?token=abc'
      )).rejects.toThrow(/Failed to send/);
    });
  });

  describe('sendEmployerWelcomeEmail error', () => {
    it('throws when Resend returns error (L1031-1032)', async () => {
      mockResendError();
      await expect(resendEmailService.sendEmployerWelcomeEmail({
        email: 'emp@x.com',
        profile: {
          firstName: 'E',
          lastName: 'L',
          location: { city: 'X' },
          employerProfile: { companyName: 'Co', industry: 'IT' },
        },
      })).rejects.toThrow(/Failed to send/);
    });
  });

  describe('sendApplicationStatusEmail error', () => {
    it('throws when Resend returns error (L1124-1125)', async () => {
      mockResendError();
      await expect(resendEmailService.sendApplicationStatusEmail(
        { email: 'a@x.com', profile: { firstName: 'A' } },
        { title: 'T', companyName: 'C' },
        'viewed',
        null
      )).rejects.toThrow(/Failed to send/);
    });
  });

  describe('sendNewApplicationEmail error', () => {
    it('throws when Resend returns error (L1203-1204)', async () => {
      mockResendError();
      await expect(resendEmailService.sendNewApplicationEmail(
        { email: 'emp@x.com', profile: { firstName: 'E' } },
        { profile: { firstName: 'A', lastName: 'B' } },
        { title: 'JobTitle' }
      )).rejects.toThrow(/Failed to send/);
    });
  });
});
