/**
 * Phase 28 — coverage push for routes/bulk-notifications.js processNotifications:
 *   - L386-393 email-enabled happy path: sendBulkNotificationEmail called per user
 *   - L399-404 inner catch: bulkNotification.logError + emailsFailed increment
 *
 * The route fires processNotifications as fire-and-forget. We poll the
 * bulkNotification.status until it transitions to 'sent' or 'failed'.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createAdmin, createJobseeker } from '../factories/user.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import resendEmailService from '../../src/lib/resendEmailService.js';
import BulkNotification from '../../src/models/BulkNotification.js';

let originalResend;
let originalEnabled;
let captured;

async function pollUntilDone(id, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const bn = await BulkNotification.findById(id);
    if (bn && (bn.status === 'sent' || bn.status === 'failed')) return bn;
    await new Promise(r => setTimeout(r, 100));
  }
  return await BulkNotification.findById(id);
}

describe('bulk-notifications.js — processNotifications email branches', () => {
  beforeAll(async () => {
    await connectTestDB();
    await seedLocations();
    originalResend = resendEmailService.resend;
    originalEnabled = resendEmailService.enabled;
  });

  beforeEach(() => {
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

  it('happy path: deliveryChannels.email=true triggers sendBulkNotificationEmail per user (L386-393)', async () => {
    const { user: admin } = await createAdmin();
    await createJobseeker({ email: 'js1-bn@example.com' });
    await createJobseeker({ email: 'js2-bn@example.com' });

    const r = await request(app)
      .post('/api/bulk-notifications')
      .set(createAuthHeaders(admin))
      .send({
        title: 'Test announcement',
        message: 'Test message body',
        type: 'announcement',
        targetAudience: 'jobseekers',
        deliveryChannels: { inApp: true, email: true },
      });
    expect(r.status).toBe(201);

    const bn = await pollUntilDone(r.body.data.bulkNotification._id);
    expect(bn.status).toBe('sent');
    // 2 jobseekers should have triggered 2 emails (admin not in jobseeker audience)
    expect(captured.length).toBeGreaterThanOrEqual(2);
    expect(bn.deliveryStats.emailsSent).toBeGreaterThanOrEqual(2);
  }, 15000);

  it('error path: when send returns a NON-transient 4xx (bad payload), emailsFailed increments (L399-404)', async () => {
    const { user: admin } = await createAdmin();
    await createJobseeker({ email: 'js-fail@example.com' });

    // Round P: thrown errors and 5xx/429 responses are now caught by
    // _dispatchSend and queued to EmailOutbox for retry — they count as
    // successful "queued" sends, not failures. To assert the
    // permanent-failure code path, stub a non-transient 4xx response
    // (invalid recipient, bad payload). That's the only path that should
    // surface immediate failure to callers, since outbox retry can't fix
    // permanent rejects.
    resendEmailService.resend = {
      emails: {
        send: async () => ({ data: null, error: { message: 'invalid recipient', statusCode: 400 } }),
      },
    };

    const r = await request(app)
      .post('/api/bulk-notifications')
      .set(createAuthHeaders(admin))
      .send({
        title: 'Test',
        message: 'Test message',
        type: 'announcement',
        targetAudience: 'jobseekers',
        deliveryChannels: { inApp: true, email: true },
      });
    expect(r.status).toBe(201);

    const bn = await pollUntilDone(r.body.data.bulkNotification._id);
    // markAsSent runs after batch loop completes (errors caught inside)
    expect(['sent', 'failed']).toContain(bn.status);
    expect(bn.deliveryStats.emailsFailed).toBeGreaterThanOrEqual(1);
    expect(bn.errorLog.length).toBeGreaterThanOrEqual(1);
  }, 15000);

  it('round-P: transient 429 send is queued to outbox (not counted as failure)', async () => {
    const { user: admin } = await createAdmin();
    await createJobseeker({ email: 'js-queue@example.com' });

    // Stub send to return Resend-shaped transient 429 (rate limit)
    resendEmailService.resend = {
      emails: {
        send: async () => ({ data: null, error: { message: 'rate limit', statusCode: 429 } }),
      },
    };

    const r = await request(app)
      .post('/api/bulk-notifications')
      .set(createAuthHeaders(admin))
      .send({
        title: 'Test queued',
        message: 'Test',
        type: 'announcement',
        targetAudience: 'jobseekers',
        deliveryChannels: { inApp: true, email: true },
      });
    expect(r.status).toBe(201);

    const bn = await pollUntilDone(r.body.data.bulkNotification._id);
    expect(['sent', 'failed']).toContain(bn.status);
    // Transient failures are auto-queued — they should NOT show as immediate failures.
    expect(bn.deliveryStats.emailsFailed || 0).toBe(0);
    // And an outbox row should exist for the retry.
    const { default: EmailOutbox } = await import('../../src/models/EmailOutbox.js');
    const queued = await EmailOutbox.countDocuments({ tags: 'bulk_notification', status: 'pending' });
    expect(queued).toBeGreaterThanOrEqual(1);
  }, 15000);
});
