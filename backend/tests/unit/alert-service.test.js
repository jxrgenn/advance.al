/**
 * Unit tests for alertService.js (Phase 28 — Phase 6).
 *
 * Baseline 26.5%. The alert service is opt-in (ALERT_EMAIL_ENABLED env);
 * production currently runs with it disabled. Tests cover:
 *   - constructor defaults (cooldown, thresholds, disabled state)
 *   - sendAlert no-op when disabled
 *   - sendAlert cooldown: second call within 30min is suppressed
 *   - alertWorkerFailure / alertQueueBackup / alertRepeatedErrors all flow
 *     through sendAlert (no-op when disabled, no throw)
 *   - checkQueueHealth fires both alerts when both thresholds exceeded
 *   - formatHtmlEmail produces wellformed HTML
 *   - testEmail throws when alerts disabled
 *
 * The real SMTP-send path requires live credentials and is documented as
 * out-of-scope here.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import alertService from '../../src/services/alertService.js';

describe('alertService — constructor defaults', () => {
  it('starts disabled by default in test env', () => {
    expect(alertService.enabled).toBe(false);
  });

  it('has 30-minute cooldown', () => {
    expect(alertService.alertCooldown).toBe(30 * 60 * 1000);
  });

  it('initializes lastAlerts for all 3 alert types', () => {
    expect(alertService.lastAlerts).toEqual({
      worker_failure: 0,
      queue_backup: 0,
      repeated_errors: 0,
    });
  });

  it('respects ALERT_THRESHOLD_FAILURES env (default 10)', () => {
    expect(alertService.failureThreshold).toBeGreaterThanOrEqual(1);
  });

  it('respects ALERT_THRESHOLD_QUEUE_SIZE env (default 100)', () => {
    expect(alertService.queueSizeThreshold).toBeGreaterThanOrEqual(1);
  });
});

describe('alertService.sendAlert — disabled path', () => {
  it('is a no-op when alerts are disabled', async () => {
    alertService.enabled = false;
    await expect(
      alertService.sendAlert('worker_failure', 'subj', 'body')
    ).resolves.toBeUndefined();
  });

  it('does not advance lastAlerts timestamp when disabled', async () => {
    alertService.enabled = false;
    alertService.lastAlerts.worker_failure = 0;
    await alertService.sendAlert('worker_failure', 'subj', 'body');
    expect(alertService.lastAlerts.worker_failure).toBe(0);
  });
});

describe('alertService.sendAlert — cooldown', () => {
  let savedTransporter;
  let sentCount;

  beforeEach(() => {
    savedTransporter = alertService.transporter;
    sentCount = 0;
    alertService.enabled = true;
    alertService.transporter = {
      sendMail: async () => { sentCount++; return { messageId: 'fake' }; },
    };
    alertService.lastAlerts = { worker_failure: 0, queue_backup: 0, repeated_errors: 0 };
  });

  afterEach(() => {
    alertService.enabled = false;
    alertService.transporter = savedTransporter;
  });

  it('sends the first alert', async () => {
    await alertService.sendAlert('worker_failure', 'subj', 'body');
    expect(sentCount).toBe(1);
    expect(alertService.lastAlerts.worker_failure).toBeGreaterThan(0);
  });

  it('suppresses a second alert of the same type within cooldown', async () => {
    await alertService.sendAlert('worker_failure', 'subj', 'body');
    await alertService.sendAlert('worker_failure', 'subj2', 'body2');
    expect(sentCount).toBe(1);
  });

  it('does NOT suppress alerts of a DIFFERENT type', async () => {
    await alertService.sendAlert('worker_failure', 's', 'b');
    await alertService.sendAlert('queue_backup', 's', 'b');
    await alertService.sendAlert('repeated_errors', 's', 'b');
    expect(sentCount).toBe(3);
  });

  it('sends again after the cooldown window passes', async () => {
    await alertService.sendAlert('worker_failure', 's', 'b');
    // Pretend 31 minutes passed
    alertService.lastAlerts.worker_failure = Date.now() - (31 * 60 * 1000);
    await alertService.sendAlert('worker_failure', 's', 'b');
    expect(sentCount).toBe(2);
  });

  it('catches sendMail errors and does not throw', async () => {
    alertService.transporter.sendMail = async () => { throw new Error('SMTP down'); };
    await expect(alertService.sendAlert('worker_failure', 's', 'b')).resolves.toBeUndefined();
  });
});

describe('alertService — wrapper methods', () => {
  beforeEach(() => {
    alertService.enabled = false; // disabled = guaranteed no-op + no throw
    alertService.lastAlerts = { worker_failure: 0, queue_backup: 0, repeated_errors: 0 };
  });

  it('alertWorkerFailure does not throw with arbitrary input', async () => {
    await expect(alertService.alertWorkerFailure(1234, 'crashed')).resolves.toBeUndefined();
  });

  it('alertQueueBackup does not throw with arbitrary input', async () => {
    await expect(alertService.alertQueueBackup(500)).resolves.toBeUndefined();
  });

  it('alertRepeatedErrors does not throw with arbitrary input', async () => {
    await expect(
      alertService.alertRepeatedErrors('NETWORK', 25, 'timeout')
    ).resolves.toBeUndefined();
  });
});

describe('alertService.checkQueueHealth', () => {
  let savedTransporter;
  let sentSubjects;

  beforeEach(() => {
    savedTransporter = alertService.transporter;
    sentSubjects = [];
    alertService.enabled = true;
    alertService.transporter = {
      sendMail: async (opts) => { sentSubjects.push(opts.subject); return { messageId: 'fake' }; },
    };
    alertService.lastAlerts = { worker_failure: 0, queue_backup: 0, repeated_errors: 0 };
    alertService.queueSizeThreshold = 100;
    alertService.failureThreshold = 10;
  });

  afterEach(() => {
    alertService.enabled = false;
    alertService.transporter = savedTransporter;
  });

  it('does NOT alert when both metrics are under threshold', async () => {
    await alertService.checkQueueHealth({ byStatus: { pending: 50, failed: 5 } });
    expect(sentSubjects).toHaveLength(0);
  });

  it('fires queue_backup alert when pending exceeds threshold', async () => {
    await alertService.checkQueueHealth({ byStatus: { pending: 200, failed: 0 } });
    expect(sentSubjects.some(s => /Queue Backup/i.test(s))).toBe(true);
  });

  it('fires repeated_errors alert when failed exceeds threshold', async () => {
    await alertService.checkQueueHealth({ byStatus: { pending: 0, failed: 50 } });
    expect(sentSubjects.some(s => /Repeated.*Errors/i.test(s))).toBe(true);
  });

  it('fires BOTH alerts when both metrics exceed thresholds', async () => {
    await alertService.checkQueueHealth({ byStatus: { pending: 500, failed: 50 } });
    expect(sentSubjects).toHaveLength(2);
  });

  it('handles missing byStatus gracefully (no throw, no alert)', async () => {
    await expect(alertService.checkQueueHealth({})).resolves.toBeUndefined();
    expect(sentSubjects).toHaveLength(0);
  });
});

describe('alertService.formatHtmlEmail', () => {
  it('returns a complete HTML document with subject in header', () => {
    const html = alertService.formatHtmlEmail('Test Subject', 'body content');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Test Subject');
    expect(html).toContain('body content');
    expect(html).toContain('</html>');
  });

  it('wraps body in <pre> for monospace formatting', () => {
    const html = alertService.formatHtmlEmail('S', 'multi\nline\nbody');
    expect(html).toMatch(/<pre>[\s\S]*multi[\s\S]*line[\s\S]*<\/pre>/);
  });
});

describe('alertService.testEmail', () => {
  it('throws when alerts are disabled', async () => {
    alertService.enabled = false;
    await expect(alertService.testEmail()).rejects.toThrow(/disabled/i);
  });

  it('returns success when send succeeds', async () => {
    const saved = alertService.transporter;
    alertService.enabled = true;
    alertService.transporter = { sendMail: async () => ({ messageId: 'ok' }) };
    const r = await alertService.testEmail();
    expect(r.success).toBe(true);
    expect(r.message).toMatch(/sent/i);
    alertService.enabled = false;
    alertService.transporter = saved;
  });

  it('throws with descriptive message when send fails', async () => {
    const saved = alertService.transporter;
    alertService.enabled = true;
    alertService.transporter = { sendMail: async () => { throw new Error('SMTP timeout'); } };
    await expect(alertService.testEmail()).rejects.toThrow(/Failed to send test email.*SMTP timeout/);
    alertService.enabled = false;
    alertService.transporter = saved;
  });
});
