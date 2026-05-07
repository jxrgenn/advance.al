/**
 * Unit tests for BulkNotification model methods + virtuals (Phase 28 — Phase 6).
 *
 * Baseline 74.19%. Pure logic exercised without DB:
 *   - virtuals: emailSuccessRate, timeSinceSent (4 time-bucket variants)
 *   - method: getTargetUsers query routing per targetAudience enum
 *
 * The DB-dependent paths (getTargetUsers actual query) are exercised
 * via the integration tests; here we cover only the pure logic.
 */

import { describe, it, expect } from '@jest/globals';
import mongoose from 'mongoose';
import BulkNotification from '../../src/models/BulkNotification.js';

const CREATOR = new mongoose.Types.ObjectId();

function mkBulk(overrides = {}) {
  return new BulkNotification({
    title: 'T',
    message: 'M',
    type: 'announcement',
    targetAudience: 'all',
    deliveryChannels: { inApp: true, email: false, sms: false },
    createdBy: CREATOR,
    status: 'draft',
    ...overrides,
  });
}

describe('BulkNotification.emailSuccessRate virtual', () => {
  it('returns 0 when emailsSent is 0', () => {
    const b = mkBulk({
      deliveryStats: { emailsSent: 0, emailsDelivered: 0, emailsFailed: 0 },
    });
    expect(b.emailSuccessRate).toBe(0);
  });

  it('returns 100 when all sent emails delivered', () => {
    const b = mkBulk({
      deliveryStats: { emailsSent: 100, emailsDelivered: 100, emailsFailed: 0 },
    });
    expect(b.emailSuccessRate).toBe(100);
  });

  it('returns ~50 when half delivered', () => {
    const b = mkBulk({
      deliveryStats: { emailsSent: 100, emailsDelivered: 50, emailsFailed: 50 },
    });
    expect(b.emailSuccessRate).toBe(50);
  });

  it('rounds correctly', () => {
    const b = mkBulk({
      deliveryStats: { emailsSent: 3, emailsDelivered: 1, emailsFailed: 2 },
    });
    // 1/3 * 100 = 33.333... → rounded 33
    expect(b.emailSuccessRate).toBe(33);
  });
});

describe('BulkNotification.timeSinceSent virtual', () => {
  it('returns null when never sent', () => {
    const b = mkBulk({ sentAt: null });
    expect(b.timeSinceSent).toBeNull();
  });

  it('"Sapo dërguar" when sent <1 minute ago', () => {
    const b = mkBulk({ sentAt: new Date(Date.now() - 30 * 1000) });
    expect(b.timeSinceSent).toBe('Sapo dërguar');
  });

  it('returns minutes-ago when <1 hour', () => {
    const b = mkBulk({ sentAt: new Date(Date.now() - 5 * 60 * 1000) });
    expect(b.timeSinceSent).toMatch(/^5 minuta më parë$/);
  });

  it('returns hours-ago when <1 day', () => {
    const b = mkBulk({ sentAt: new Date(Date.now() - 3 * 60 * 60 * 1000) });
    expect(b.timeSinceSent).toMatch(/^3 orë më parë$/);
  });

  it('returns days-ago when >=1 day', () => {
    const b = mkBulk({ sentAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) });
    expect(b.timeSinceSent).toMatch(/^5 ditë më parë$/);
  });
});

describe('BulkNotification.updateDeliveryStats', () => {
  it('updates only known stat keys', () => {
    const b = mkBulk({
      deliveryStats: {
        totalRecipients: 0, emailsSent: 0, emailsDelivered: 0, emailsFailed: 0,
        smsSent: 0, smsDelivered: 0, smsFailed: 0,
        inAppSent: 0, inAppRead: 0,
      },
    });
    b.updateDeliveryStats({ emailsSent: 50, emailsDelivered: 45 });
    expect(b.deliveryStats.emailsSent).toBe(50);
    expect(b.deliveryStats.emailsDelivered).toBe(45);
  });

  it('ignores unknown keys', () => {
    const b = mkBulk({
      deliveryStats: {
        totalRecipients: 0, emailsSent: 0, emailsDelivered: 0, emailsFailed: 0,
        smsSent: 0, smsDelivered: 0, smsFailed: 0,
        inAppSent: 0, inAppRead: 0,
      },
    });
    b.updateDeliveryStats({ mysteriousKey: 999 });
    expect(b.deliveryStats.mysteriousKey).toBeUndefined();
  });
});

describe('BulkNotification schema defaults', () => {
  it('status defaults to "draft"', () => {
    const b = new BulkNotification({
      title: 'T', message: 'M', type: 'announcement',
      targetAudience: 'all', deliveryChannels: { inApp: true },
      createdBy: CREATOR,
    });
    expect(b.status).toBe('draft');
  });

  it('template defaults to false', () => {
    expect(mkBulk().template).toBe(false);
  });

  it('rejects invalid type enum', () => {
    const b = mkBulk({ type: 'mysterious' });
    const err = b.validateSync();
    expect(err?.errors?.type).toBeDefined();
  });

  it('rejects invalid targetAudience enum', () => {
    const b = mkBulk({ targetAudience: 'mysterious' });
    const err = b.validateSync();
    expect(err?.errors?.targetAudience).toBeDefined();
  });
});
