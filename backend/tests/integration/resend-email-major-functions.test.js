/**
 * Phase 28 — coverage push for resendEmailService major functions
 * (welcome / account-action / password-reset / employer welcome).
 *
 * Mocks resendEmailService.resend to capture sends without real API.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from '@jest/globals';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import resendEmailService from '../../src/lib/resendEmailService.js';

let captured;
let originalResend;
let originalEnabled;

function mockSend() {
  captured = [];
  resendEmailService.resend = {
    emails: {
      send: async (payload) => {
        captured.push(payload);
        return { data: { id: `mock-${Date.now()}` }, error: null };
      },
    },
  };
  resendEmailService.enabled = true;
}

describe('resendEmailService — major functions', () => {
  beforeAll(async () => {
    await connectTestDB();
    await seedLocations();
    originalResend = resendEmailService.resend;
    originalEnabled = resendEmailService.enabled;
  });

  beforeEach(() => mockSend());

  afterEach(async () => {
    await clearTestDB();
    await seedLocations();
  });

  afterAll(async () => {
    resendEmailService.resend = originalResend;
    resendEmailService.enabled = originalEnabled;
    await closeTestDB();
  });

  describe('sendFullAccountWelcomeEmail', () => {
    it('returns success and sends correct subject for jobseeker (L70-204)', async () => {
      const user = {
        email: 'newjs@x.com',
        profile: {
          firstName: 'John',
          lastName: 'Doe',
          location: { city: 'Tiranë' },
        },
      };
      const r = await resendEmailService.sendFullAccountWelcomeEmail(user);
      expect(r.success).toBe(true);
      expect(captured.length).toBe(1);
      expect(captured[0].subject).toMatch(/Mirë se vini/);
      expect(captured[0].html).toContain('John');
    });

    it('returns disabled-state shape when service is disabled', async () => {
      resendEmailService.enabled = false;
      const r = await resendEmailService.sendFullAccountWelcomeEmail({ email: 'x@y.com', profile: {} });
      expect(r.success).toBe(false);
      expect(r.message).toMatch(/disabled/);
      resendEmailService.enabled = true;
    });

    it('throws when Resend returns a non-transient error', async () => {
      // 4xx → non-transient → surfaced to the caller (transient errors are
      // instead queued to the EmailOutbox, covered by the outbox tests).
      resendEmailService.resend = {
        emails: {
          send: async () => ({ data: null, error: { message: 'API down', statusCode: 422 } }),
        },
      };
      const user = { email: 'fail@x.com', profile: { firstName: 'X', lastName: 'Y', location: {} } };
      await expect(resendEmailService.sendFullAccountWelcomeEmail(user))
        .rejects.toThrow(/Failed to send email/);
    });
  });

  describe('sendQuickUserWelcomeEmail', () => {
    it('returns success for quick user with interests (L207-355)', async () => {
      const qu = {
        email: 'qu@x.com',
        firstName: 'Quick',
        lastName: 'User',
        location: 'Tiranë',
        interests: ['Teknologji', 'Marketing'],
        customInterests: ['Custom1'],
        getUnsubscribeUrl: () => 'https://x.test/unsub',
      };
      const r = await resendEmailService.sendQuickUserWelcomeEmail(qu);
      expect(r.success).toBe(true);
      expect(captured[0].html).toContain('Quick');
      expect(captured[0].html).toContain('Teknologji');
      expect(captured[0].html).toContain('Custom1');
    });

    it('returns disabled-state when service disabled', async () => {
      resendEmailService.enabled = false;
      const r = await resendEmailService.sendQuickUserWelcomeEmail({
        email: 'x@y.com', firstName: 'X', lastName: 'Y', location: 'X', interests: [],
        getUnsubscribeUrl: () => 'https://x',
      });
      expect(r.success).toBe(false);
      resendEmailService.enabled = true;
    });

    it('omits customInterests block when empty array', async () => {
      const qu = {
        email: 'qu2@x.com',
        firstName: 'Q',
        lastName: 'U',
        location: 'Tiranë',
        interests: ['Teknologji'],
        customInterests: [],
        getUnsubscribeUrl: () => 'https://x.test/unsub',
      };
      const r = await resendEmailService.sendQuickUserWelcomeEmail(qu);
      expect(r.success).toBe(true);
      expect(captured[0].html).not.toMatch(/Interesat e tjera/);
    });
  });

  describe('sendAccountActionEmail', () => {
    const baseUser = { email: 'js@x.com', profile: { firstName: 'A' } };

    it('warning action sends with warning subject', async () => {
      const r = await resendEmailService.sendAccountActionEmail(baseUser, 'warning', 'Spam content');
      expect(r.success).toBe(true);
      expect(captured[0].subject).toMatch(/Paralajmërim/);
    });

    it('temporary_suspension includes duration', async () => {
      const r = await resendEmailService.sendAccountActionEmail(baseUser, 'temporary_suspension', 'Spam', 7);
      expect(r.success).toBe(true);
      expect(captured[0].subject).toMatch(/pezulluar/);
      expect(captured[0].html).toMatch(/7 ditë/);
    });

    it('permanent_suspension uses ban template', async () => {
      const r = await resendEmailService.sendAccountActionEmail(baseUser, 'permanent_suspension', 'Severe');
      expect(r.success).toBe(true);
      expect(captured[0].subject).toMatch(/mbyllur|përgjithmonë/);
    });

    it('account_termination uses termination template', async () => {
      const r = await resendEmailService.sendAccountActionEmail(baseUser, 'account_termination', 'Severe');
      expect(r.success).toBe(true);
      expect(captured[0].subject).toBeTruthy();
    });

    it('returns disabled when service disabled', async () => {
      resendEmailService.enabled = false;
      const r = await resendEmailService.sendAccountActionEmail(baseUser, 'warning', 'X');
      expect(r.success).toBe(false);
      resendEmailService.enabled = true;
    });
  });

  describe('sendPasswordResetEmail', () => {
    it('sends reset link with correct subject (L853-944)', async () => {
      const user = { email: 'reset@x.com', profile: { firstName: 'Reset' } };
      const r = await resendEmailService.sendPasswordResetEmail(user, 'https://x.test/reset?token=abc');
      expect(r.success).toBe(true);
      expect(captured[0].subject).toMatch(/Rivendos|fjalëkalim/i);
      expect(captured[0].html).toMatch(/https:\/\/x\.test\/reset/);
    });

    it('returns disabled when service disabled', async () => {
      resendEmailService.enabled = false;
      const r = await resendEmailService.sendPasswordResetEmail(
        { email: 'x@y.com', profile: { firstName: 'X' } },
        'https://x'
      );
      expect(r.success).toBe(false);
      resendEmailService.enabled = true;
    });
  });

  describe('sendEmployerWelcomeEmail', () => {
    it('sends welcome with company name (L946-1041)', async () => {
      const employer = {
        email: 'emp@x.com',
        profile: {
          firstName: 'Emp',
          lastName: 'L',
          location: { city: 'Tiranë' },
          employerProfile: { companyName: 'TestCo', industry: 'IT' },
        },
      };
      const r = await resendEmailService.sendEmployerWelcomeEmail(employer);
      expect(r.success).toBe(true);
      expect(captured[0].subject).toMatch(/Mirë se vini|punëdhënës/i);
      expect(captured[0].html).toContain('TestCo');
    });

    it('returns disabled when service disabled', async () => {
      resendEmailService.enabled = false;
      const r = await resendEmailService.sendEmployerWelcomeEmail({
        email: 'x@y.com',
        profile: { firstName: 'X', employerProfile: { companyName: 'X' }, location: {} },
      });
      expect(r.success).toBe(false);
      resendEmailService.enabled = true;
    });
  });
});
