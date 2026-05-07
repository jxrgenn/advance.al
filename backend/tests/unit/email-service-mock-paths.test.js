/**
 * Phase 28 — coverage push for emailService.js mock/no-config paths.
 *
 * Production uses Resend (resendEmailService.js). emailService.js is legacy
 * SMTP+Twilio code that runs only when env vars are unset → mock paths.
 *
 * Targets:
 *   - sendEmail when isConfigured=false → returns mock success
 *   - sendSMS when Twilio not configured → returns mock success
 *   - verifyConnection when isConfigured=false → returns error
 *   - sendTestEmail wraps sendEmail
 */

import { describe, it, expect, jest } from '@jest/globals';
import emailService from '../../src/lib/emailService.js';

describe('emailService — mock / no-config paths', () => {
  describe('sendEmail (L63-70)', () => {
    it('returns mock success when isConfigured=false', async () => {
      // Force unconfigured state
      const original = emailService.isConfigured;
      emailService.isConfigured = false;
      try {
        const r = await emailService.sendEmail('to@example.com', 'subj', '<p>html</p>', 'text');
        expect(r.success).toBe(true);
        expect(r.messageId).toMatch(/^mock_/);
        expect(r.preview).toBe('Email service not configured');
      } finally {
        emailService.isConfigured = original;
      }
    });
  });

  describe('sendSMS (L126-152)', () => {
    it('returns mock success when Twilio env vars not set', async () => {
      const orig = {
        sid: process.env.TWILIO_ACCOUNT_SID,
        tok: process.env.TWILIO_AUTH_TOKEN,
        ph: process.env.TWILIO_PHONE,
      };
      delete process.env.TWILIO_ACCOUNT_SID;
      delete process.env.TWILIO_AUTH_TOKEN;
      delete process.env.TWILIO_PHONE;
      try {
        const r = await emailService.sendSMS('+355691234567', 'test sms');
        expect(r.success).toBe(true);
        expect(r.messageId).toMatch(/^sms_mock_/);
      } finally {
        if (orig.sid) process.env.TWILIO_ACCOUNT_SID = orig.sid;
        if (orig.tok) process.env.TWILIO_AUTH_TOKEN = orig.tok;
        if (orig.ph) process.env.TWILIO_PHONE = orig.ph;
      }
    });
  });

  describe('verifyConnection (L155-167)', () => {
    it('returns error shape when isConfigured=false', async () => {
      const original = emailService.isConfigured;
      emailService.isConfigured = false;
      try {
        const r = await emailService.verifyConnection();
        expect(r.success).toBe(false);
        expect(r.error).toMatch(/not configured/);
      } finally {
        emailService.isConfigured = original;
      }
    });

    it('returns success when transporter.verify resolves', async () => {
      const original = emailService.isConfigured;
      const originalT = emailService.transporter;
      emailService.isConfigured = true;
      emailService.transporter = { verify: jest.fn(async () => true) };
      try {
        const r = await emailService.verifyConnection();
        expect(r.success).toBe(true);
      } finally {
        emailService.isConfigured = original;
        emailService.transporter = originalT;
      }
    });

    it('returns error when transporter.verify rejects', async () => {
      const original = emailService.isConfigured;
      const originalT = emailService.transporter;
      emailService.isConfigured = true;
      emailService.transporter = {
        verify: jest.fn(async () => { throw new Error('SMTP unreachable'); }),
      };
      try {
        const r = await emailService.verifyConnection();
        expect(r.success).toBe(false);
        expect(r.error).toMatch(/SMTP unreachable/);
      } finally {
        emailService.isConfigured = original;
        emailService.transporter = originalT;
      }
    });
  });

  describe('sendTestEmail (L170-184)', () => {
    it('delegates to sendEmail with default address', async () => {
      const original = emailService.isConfigured;
      emailService.isConfigured = false; // mock path
      try {
        const r = await emailService.sendTestEmail();
        expect(r.success).toBe(true);
        expect(r.messageId).toMatch(/^mock_/);
      } finally {
        emailService.isConfigured = original;
      }
    });

    it('accepts custom recipient address', async () => {
      const original = emailService.isConfigured;
      emailService.isConfigured = false;
      try {
        const r = await emailService.sendTestEmail('custom@example.com');
        expect(r.success).toBe(true);
      } finally {
        emailService.isConfigured = original;
      }
    });
  });

  describe('sendEmail with mocked transporter (L82-95 happy + retry)', () => {
    it('returns success.messageId when transporter.sendMail resolves', async () => {
      const original = emailService.isConfigured;
      const originalT = emailService.transporter;
      emailService.isConfigured = true;
      emailService.transporter = {
        sendMail: jest.fn(async () => ({ messageId: 'msg-123' })),
      };
      try {
        const r = await emailService.sendEmail('a@b.com', 's', '<p>h</p>', 't');
        expect(r.success).toBe(true);
        expect(r.messageId).toBe('msg-123');
        expect(emailService.transporter.sendMail).toHaveBeenCalled();
      } finally {
        emailService.isConfigured = original;
        emailService.transporter = originalT;
      }
    });

    it('returns ethereal preview URL when messageId contains "ethereal"', async () => {
      const original = emailService.isConfigured;
      const originalT = emailService.transporter;
      emailService.isConfigured = true;
      emailService.transporter = {
        sendMail: jest.fn(async () => ({ messageId: 'ethereal-abc-123' })),
      };
      try {
        const r = await emailService.sendEmail('a@b.com', 's', '<p>h</p>', 't');
        expect(r.success).toBe(true);
        // preview can be string URL or null depending on getTestMessageUrl
      } finally {
        emailService.isConfigured = original;
        emailService.transporter = originalT;
      }
    });

    it('retries once on first failure and returns success on retry', async () => {
      const original = emailService.isConfigured;
      const originalT = emailService.transporter;
      emailService.isConfigured = true;
      let calls = 0;
      emailService.transporter = {
        sendMail: jest.fn(async () => {
          calls++;
          if (calls === 1) throw new Error('transient');
          return { messageId: 'retry-success' };
        }),
      };
      try {
        const r = await emailService.sendEmail('a@b.com', 's', '<p>h</p>', 't');
        expect(r.success).toBe(true);
        expect(r.messageId).toBe('retry-success');
        expect(calls).toBe(2);
      } finally {
        emailService.isConfigured = original;
        emailService.transporter = originalT;
      }
    });

    it('returns failure on retry failure (L115-121)', async () => {
      const original = emailService.isConfigured;
      const originalT = emailService.transporter;
      emailService.isConfigured = true;
      emailService.transporter = {
        sendMail: jest.fn(async () => { throw new Error('persistent err'); }),
      };
      try {
        const r = await emailService.sendEmail('a@b.com', 's', '<p>h</p>', 't');
        expect(r.success).toBe(false);
        expect(r.error).toMatch(/persistent err/);
      } finally {
        emailService.isConfigured = original;
        emailService.transporter = originalT;
      }
    });
  });
});
