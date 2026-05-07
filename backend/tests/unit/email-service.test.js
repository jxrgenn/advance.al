/**
 * Unit tests for emailService.js (Phase 28 — Phase 6).
 *
 * Baseline 25.9%. Most of this file's email-via-SMTP path is dead
 * (production uses Resend, see notificationService.js: "kept for SMS only").
 * The actively-used surface is `sendSMS`, which has a documented mock
 * fallback path when Twilio is not configured.
 *
 * Tests cover:
 *   - sendSMS mock path (no Twilio env) — returns success with mock id
 *   - sendEmail mock path (isConfigured=false) — returns success with mock id
 *   - verifyConnection when not configured — returns failure
 *   - sendTestEmail flows through sendEmail
 *
 * The real-SMTP/Twilio paths require live credentials (out of scope here —
 * Twilio is a documented gap per EXTERNAL_SERVICE_GAPS.md).
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

describe('emailService.sendSMS — mock fallback', () => {
  const SAVED_ENV = {};

  beforeEach(() => {
    // Snapshot Twilio env keys, then unset them so sendSMS hits the mock branch
    for (const key of ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE']) {
      SAVED_ENV[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(SAVED_ENV)) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  });

  it('returns mock success when no Twilio env vars present', async () => {
    const { default: emailService } = await import('../../src/lib/emailService.js');
    const r = await emailService.sendSMS('+355691234567', 'Test message');
    expect(r.success).toBe(true);
    expect(r.messageId).toMatch(/^sms_mock_\d+/);
  });

  it('mock success even when ACCOUNT_SID set but TOKEN missing', async () => {
    process.env.TWILIO_ACCOUNT_SID = 'AC123';
    const { default: emailService } = await import('../../src/lib/emailService.js');
    const r = await emailService.sendSMS('+355691234567', 'partial-config test');
    expect(r.success).toBe(true);
    expect(r.messageId).toMatch(/^sms_mock_/);
  });

  it('mock success when TOKEN set but PHONE missing', async () => {
    process.env.TWILIO_ACCOUNT_SID = 'AC123';
    process.env.TWILIO_AUTH_TOKEN = 'tok';
    const { default: emailService } = await import('../../src/lib/emailService.js');
    const r = await emailService.sendSMS('+355691234567', 'partial-config test');
    expect(r.success).toBe(true);
    expect(r.messageId).toMatch(/^sms_mock_/);
  });

  it('returns success:false on Twilio API error (invalid creds)', async () => {
    // Configure with bogus creds — twilio package will throw on first call
    process.env.TWILIO_ACCOUNT_SID = 'AC0000000000000000000000000000000';
    process.env.TWILIO_AUTH_TOKEN = 'invalid-token';
    process.env.TWILIO_PHONE = '+15555550100';
    const { default: emailService } = await import('../../src/lib/emailService.js');
    const r = await emailService.sendSMS('+355691234567', 'will fail');
    // Either client throws synchronously (bad sid format) or messages.create rejects
    expect(r.success).toBe(false);
    expect(r.error).toBeDefined();
  });
});

describe('emailService.sendEmail — mock path when not configured', () => {
  const SAVED_ENV = {};

  beforeEach(() => {
    for (const key of ['SMTP_USER', 'SMTP_PASS', 'SMTP_HOST', 'SMTP_PORT']) {
      SAVED_ENV[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(SAVED_ENV)) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  });

  it('returns mock success without throwing when SMTP not configured', async () => {
    const { default: emailService } = await import('../../src/lib/emailService.js');
    // Force isConfigured=false to hit the early-return branch deterministically
    // (the singleton may have been configured by a prior import; we override here).
    emailService.isConfigured = false;
    const r = await emailService.sendEmail('user@example.com', 'subj', '<p>html</p>', 'text');
    expect(r.success).toBe(true);
    expect(r.messageId).toMatch(/^mock_/);
    expect(r.preview).toMatch(/not configured/i);
  });
});

describe('emailService.verifyConnection — fail path when not configured', () => {
  it('returns success:false with descriptive error when not configured', async () => {
    const { default: emailService } = await import('../../src/lib/emailService.js');
    emailService.isConfigured = false;
    const r = await emailService.verifyConnection();
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/not configured/i);
  });
});

describe('emailService.sendTestEmail — flows through sendEmail', () => {
  it('returns the same mock-success shape as sendEmail', async () => {
    const { default: emailService } = await import('../../src/lib/emailService.js');
    emailService.isConfigured = false;
    const r = await emailService.sendTestEmail('test@advance.al');
    expect(r.success).toBe(true);
    expect(r.messageId).toMatch(/^mock_/);
  });

  it('uses default recipient when none provided', async () => {
    const { default: emailService } = await import('../../src/lib/emailService.js');
    emailService.isConfigured = false;
    const r = await emailService.sendTestEmail();
    // The default 'test@advance.al' is internal — we just verify no throw
    expect(r.success).toBe(true);
  });
});
