/**
 * Phase 28 — coverage push for resendEmailService.js disabled-service early-return branches.
 *
 * When RESEND_API_KEY is unset, `this.enabled` is false and every send method
 * MUST short-circuit with `{ success: false, message: 'Email service disabled' }`
 * — no exception, no API call. Without this guard, a deployment with a missing
 * API key would crash on every email attempt.
 *
 * Targets the four early-return branches not covered by other tests:
 *   - L551-553 sendBulkNotificationEmail
 *   - L713-715 sendApplicationMessageEmail
 *   - L1045-1047 sendApplicationStatusEmail
 *   - L1138-1140 sendNewApplicationEmail
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import resendEmailService from '../../src/lib/resendEmailService.js';

describe('resendEmailService.js — disabled-service early returns', () => {
  let originalEnabled;

  beforeEach(() => {
    originalEnabled = resendEmailService.enabled;
    resendEmailService.enabled = false;
  });

  afterEach(() => {
    resendEmailService.enabled = originalEnabled;
  });

  it('sendBulkNotificationEmail returns disabled (L551-553)', async () => {
    const r = await resendEmailService.sendBulkNotificationEmail('to@example.com', {
      title: 'Subject',
      message: 'Body',
      type: 'general',
      userName: 'User',
    });
    expect(r.success).toBe(false);
    expect(r.message).toMatch(/disabled/i);
  });

  it('sendApplicationMessageEmail returns disabled (L713-715)', async () => {
    const recipient = { email: 'r@example.com', profile: { firstName: 'R' } };
    const sender = { profile: { firstName: 'S', lastName: 'L' } };
    const job = { title: 'Job', companyName: 'Co' };
    const r = await resendEmailService.sendApplicationMessageEmail(
      recipient, sender, job, 'hello', 'text'
    );
    expect(r.success).toBe(false);
    expect(r.message).toMatch(/disabled/i);
  });

  it('sendApplicationStatusEmail returns disabled (L1045-1047)', async () => {
    const applicant = { email: 'a@example.com', profile: { firstName: 'A' } };
    const job = { title: 'J', companyName: 'C' };
    const r = await resendEmailService.sendApplicationStatusEmail(applicant, job, 'viewed', null);
    expect(r.success).toBe(false);
    expect(r.message).toMatch(/disabled/i);
  });

  it('sendNewApplicationEmail returns disabled (L1138-1140)', async () => {
    const employer = { email: 'e@example.com', profile: { firstName: 'E' } };
    const applicant = { profile: { firstName: 'A', lastName: 'P' } };
    const job = { title: 'J', companyName: 'C', _id: '507f1f77bcf86cd799439011' };
    const r = await resendEmailService.sendNewApplicationEmail(employer, applicant, job);
    expect(r.success).toBe(false);
    expect(r.message).toMatch(/disabled/i);
  });
});
