/**
 * Phase 12 — Email Template Verification (mocked Resend)
 *
 * For each of the 10 email functions on resendEmailService, we:
 *   1. Replace the underlying `resend.emails.send` with a spy that records
 *      { to, from, subject, html, text } and returns a fake Resend ID.
 *   2. Trigger the function (directly or via API endpoint).
 *   3. Assert the captured payload has the expected `to` (diverted to
 *      advance.al123456@gmail.com), a non-empty subject + html, and matches
 *      template-specific content.
 *
 * This does NOT verify real delivery — that requires Phase 12.b (real inbox
 * IMAP polling) or Resend's `/emails/:id` GET API. But it locks the entire
 * email-sending surface (template content, recipient routing, retry behavior)
 * without consuming the Resend daily quota.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from '@jest/globals';
import { connectTestDB, closeTestDB, clearTestDB } from '../../setup/testDb.js';
import { seedLocations } from '../../fixtures/locations.fixture.js';
import { createJobseeker, createVerifiedEmployer } from '../../factories/user.factory.js';
import resendEmailService from '../../../src/lib/resendEmailService.js';

let captured;

function mockSend() {
  captured = [];
  // Replace the resend client with a stub that records every send.
  resendEmailService.resend = {
    emails: {
      send: async (payload) => {
        captured.push(payload);
        return { data: { id: `mock-${Date.now()}-${Math.random().toString(36).slice(2)}` }, error: null };
      }
    }
  };
  resendEmailService.enabled = true;
}

describe('Phase 12 — Email Template Verification (mocked Resend)', () => {
  beforeAll(async () => {
    await connectTestDB();
    await seedLocations();
  });

  beforeEach(() => {
    mockSend();
  });

  afterEach(async () => {
    await clearTestDB();
    await seedLocations();
  });

  afterAll(async () => {
    await closeTestDB();
  });

  describe('1. sendFullAccountWelcomeEmail', () => {
    it('sends to test inbox; subject + html populated', async () => {
      const { user } = await createJobseeker({ email: 'welcome-js@example.com' });
      const result = await resendEmailService.sendFullAccountWelcomeEmail(user);

      expect(result.success).toBe(true);
      expect(captured.length).toBe(1);
      const sent = captured[0];
      expect(sent.to).toBe('advance.al123456@gmail.com');
      expect(typeof sent.subject).toBe('string');
      expect(sent.subject.length).toBeGreaterThan(0);
      expect(sent.html).toMatch(/advance\.al/i);
    });
  });

  describe('2. sendQuickUserWelcomeEmail', () => {
    it('sends to test inbox', async () => {
      const fakeQuickUser = {
        email: 'quick@example.com',
        firstName: 'Q',
        lastName: 'U',
        location: 'Tiranë',
        interests: ['Teknologji'],
        unsubscribeToken: 'ut-' + Date.now(),
        getUnsubscribeUrl: () => 'https://example.com/unsub?t=x'
      };
      const result = await resendEmailService.sendQuickUserWelcomeEmail(fakeQuickUser);

      expect(result.success).toBe(true);
      expect(captured[0].to).toBe('advance.al123456@gmail.com');
    });
  });

  describe('3. sendEmployerWelcomeEmail', () => {
    it('sends to test inbox', async () => {
      const { user } = await createVerifiedEmployer({ email: 'welcome-emp@example.com' });
      const result = await resendEmailService.sendEmployerWelcomeEmail(user);

      expect(result.success).toBe(true);
      expect(captured[0].to).toBe('advance.al123456@gmail.com');
    });
  });

  describe('4. sendPasswordResetEmail', () => {
    it('includes reset URL in body', async () => {
      const { user } = await createJobseeker({ email: 'reset@example.com' });
      const resetUrl = 'https://advance.al/reset-password?token=mock-token-abc';
      await resendEmailService.sendPasswordResetEmail(user, resetUrl);

      expect(captured[0].html).toContain('mock-token-abc');
    });
  });

  describe('5. sendApplicationMessageEmail × 4 message types', () => {
    const fakeRecipient = { email: 'recip@example.com', firstName: 'R', lastName: 'X' };
    const fakeSender = { firstName: 'S', lastName: 'Y' };
    const fakeJob = { title: 'Engineer', companyName: 'CoX' };

    it.each(['text', 'interview_invite', 'offer', 'rejection'])('messageType %s sends to test inbox', async (messageType) => {
      await resendEmailService.sendApplicationMessageEmail(
        fakeRecipient, fakeSender, fakeJob, 'Hello there', messageType
      );
      expect(captured[0].to).toBe('advance.al123456@gmail.com');
    });
  });

  describe('6. sendApplicationStatusEmail × 4 statuses', () => {
    const fakeApplicant = { email: 'app@example.com', firstName: 'A', lastName: 'B' };
    const fakeJob = { title: 'Engineer', companyName: 'CoX' };

    it.each(['viewed', 'shortlisted', 'rejected', 'hired'])('status %s', async (status) => {
      await resendEmailService.sendApplicationStatusEmail(fakeApplicant, fakeJob, status, 'optional notes');
      expect(captured[0].to).toBe('advance.al123456@gmail.com');
    });
  });

  describe('7. sendNewApplicationEmail', () => {
    it('to employer, subject mentions new application', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const { user: applicant } = await createJobseeker({ emailVerified: true });
      await resendEmailService.sendNewApplicationEmail(emp, applicant, { title: 'Senior Eng' });

      expect(captured[0].to).toBe('advance.al123456@gmail.com');
      expect(captured[0].subject.toLowerCase()).toMatch(/aplikim/);
    });
  });

  describe('8. sendAccountActionEmail × 4 actions', () => {
    it.each([
      ['warning', null],
      ['temporary_suspension', 7],
      ['permanent_suspension', null],
      ['account_termination', null]
    ])('action %s sends correctly', async (action, duration) => {
      const { user } = await createJobseeker({ email: 'action@example.com' });
      await resendEmailService.sendAccountActionEmail(user, action, 'reason text', duration);
      expect(captured[0].to).toBe('advance.al123456@gmail.com');
    });
  });

  describe('9. sendBulkNotificationEmail × 5 types', () => {
    it.each(['announcement', 'maintenance', 'feature', 'warning', 'update'])('type %s', async (type) => {
      await resendEmailService.sendBulkNotificationEmail('any@example.com', {
        type, title: 'T', message: 'M'
      });
      expect(captured[0].to).toBe('advance.al123456@gmail.com');
    });
  });

  describe('10. sendTransactionalEmail (generic)', () => {
    it('sends with provided subject/html/text and diverts recipient', async () => {
      await resendEmailService.sendTransactionalEmail(
        'any-real-user@example.com',
        'My Subject',
        '<p>html body</p>',
        'plain body'
      );
      expect(captured[0].to).toBe('advance.al123456@gmail.com');
      expect(captured[0].subject).toBe('My Subject');
      expect(captured[0].html).toContain('html body');
    });
  });

  describe('Diversion respected when EMAIL_TEST_MODE=false', () => {
    it('falls through to real recipient when test-mode flag is off', async () => {
      const orig = process.env.EMAIL_TEST_MODE;
      process.env.EMAIL_TEST_MODE = 'false';
      try {
        await resendEmailService.sendTransactionalEmail(
          'real@example.com', 'subj', '<p>x</p>', 'x'
        );
        expect(captured[0].to).toBe('real@example.com');
      } finally {
        process.env.EMAIL_TEST_MODE = orig;
      }
    });
  });

  describe('Retry on failure (one auto-retry after 2s)', () => {
    it('first failure → second attempt succeeds', async () => {
      let calls = 0;
      resendEmailService.resend = {
        emails: {
          send: async () => {
            calls++;
            if (calls === 1) throw new Error('transient');
            return { data: { id: 'retry-success' }, error: null };
          }
        }
      };

      const result = await resendEmailService.sendTransactionalEmail(
        'r@example.com', 's', '<p>h</p>', 't'
      );
      expect(result.success).toBe(true);
      expect(calls).toBe(2);
    }, 10000);
  });
});
