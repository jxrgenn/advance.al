/**
 * Phase 28 — coverage push for resendEmailService.js disabled-state paths.
 *
 * When RESEND_API_KEY is not set, the constructor sets `enabled=false` and
 * every send method returns `{ success: false, message: 'Email service disabled' }`.
 * This file imports the module with the env var unset to exercise that
 * disabled-state branch on every public method.
 *
 * Why a unit test (not integration): we don't want to make real Resend calls.
 * The disabled-state path is the legitimate cheap-coverage target — it
 * exercises the early-return guard on every method.
 */

import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';

describe('resendEmailService — disabled-state early-return paths', () => {
  let svc;
  let originalKey;

  beforeAll(async () => {
    originalKey = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    // Re-import after clearing the key so the constructor sets enabled=false
    jest.resetModules();
    svc = (await import('../../src/lib/resendEmailService.js')).default;
  });

  afterAll(() => {
    if (originalKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalKey;
  });

  it('sendFullAccountWelcomeEmail returns disabled', async () => {
    const r = await svc.sendFullAccountWelcomeEmail({ firstName: 'A', lastName: 'B', email: 'x@y.z', userType: 'jobseeker' });
    expect(r.success).toBe(false);
    expect(r.message).toMatch(/disabled/i);
  });

  it('sendQuickUserWelcomeEmail returns disabled', async () => {
    const r = await svc.sendQuickUserWelcomeEmail({ firstName: 'A', email: 'x@y.z', location: 'Tiranë', interests: [] });
    expect(r.success).toBe(false);
  });

  it('sendAccountActionEmail returns disabled', async () => {
    const r = await svc.sendAccountActionEmail({ email: 'x@y.z', firstName: 'A' }, 'suspend', 'reason', 7);
    expect(r.success).toBe(false);
  });

  it('sendBulkNotificationEmail returns disabled', async () => {
    const r = await svc.sendBulkNotificationEmail('x@y.z', { title: 't', message: 'm', type: 'announcement' });
    expect(r.success).toBe(false);
  });

  it('sendTransactionalEmail returns disabled', async () => {
    const r = await svc.sendTransactionalEmail('x@y.z', 'subj', '<p>html</p>', 'text');
    expect(r.success).toBe(false);
  });

  it('sendApplicationMessageEmail returns disabled', async () => {
    const r = await svc.sendApplicationMessageEmail(
      { firstName: 'R', email: 'r@y.z' },
      { firstName: 'S', lastName: 'L' },
      { title: 'Job', companyName: 'Co' },
      'Hi',
      'text'
    );
    expect(r.success).toBe(false);
  });

  it('sendPasswordResetEmail returns disabled', async () => {
    const r = await svc.sendPasswordResetEmail({ email: 'x@y.z', firstName: 'A' }, 'https://example.com/reset');
    expect(r.success).toBe(false);
  });

  it('sendEmployerWelcomeEmail returns disabled', async () => {
    const r = await svc.sendEmployerWelcomeEmail({ email: 'x@y.z', firstName: 'A', profile: { employerProfile: { companyName: 'Co' } } });
    expect(r.success).toBe(false);
  });

  it('sendApplicationStatusEmail returns disabled', async () => {
    const r = await svc.sendApplicationStatusEmail(
      { firstName: 'A', email: 'a@y.z' },
      { title: 'Job', companyName: 'Co' },
      'shortlisted',
      'note'
    );
    expect(r.success).toBe(false);
  });

  it('sendNewApplicationEmail returns disabled', async () => {
    const r = await svc.sendNewApplicationEmail(
      { email: 'e@y.z', firstName: 'E' },
      { firstName: 'A', lastName: 'B' },
      { title: 'Job' }
    );
    expect(r.success).toBe(false);
  });

  it('getRecipientEmail returns original when EMAIL_TEST_MODE=false', () => {
    const original = process.env.EMAIL_TEST_MODE;
    process.env.EMAIL_TEST_MODE = 'false';
    expect(svc.getRecipientEmail('keep@example.com')).toBe('keep@example.com');
    if (original === undefined) delete process.env.EMAIL_TEST_MODE;
    else process.env.EMAIL_TEST_MODE = original;
  });

  it('getRecipientEmail redirects to testEmail when EMAIL_TEST_MODE=true', () => {
    const original = process.env.EMAIL_TEST_MODE;
    process.env.EMAIL_TEST_MODE = 'true';
    expect(svc.getRecipientEmail('redirect@example.com')).toBe('advance.al123456@gmail.com');
    if (original === undefined) delete process.env.EMAIL_TEST_MODE;
    else process.env.EMAIL_TEST_MODE = original;
  });
});
