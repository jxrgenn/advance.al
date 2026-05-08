/**
 * Phase 28 — coverage push for resendEmailService misc lines:
 *   - L401 throw "Unknown action type"
 *   - L1220 named export wrapper sendBulkNotificationEmail
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import resendEmailService, { sendBulkNotificationEmail } from '../../src/lib/resendEmailService.js';

let originalResend;
let originalEnabled;

describe('resendEmailService — misc coverage', () => {
  beforeAll(async () => {
    await connectTestDB();
    await seedLocations();
    originalResend = resendEmailService.resend;
    originalEnabled = resendEmailService.enabled;
  });

  beforeEach(() => {
    resendEmailService.resend = {
      emails: { send: async () => ({ data: { id: 'm-1' }, error: null }) },
    };
    resendEmailService.enabled = true;
  });

  afterAll(async () => {
    resendEmailService.resend = originalResend;
    resendEmailService.enabled = originalEnabled;
    await clearTestDB();
    await closeTestDB();
  });

  it('sendAccountActionEmail throws on unknown action (L401)', async () => {
    await expect(resendEmailService.sendAccountActionEmail(
      { email: 'x@y.com', profile: { firstName: 'A' } },
      'totally_invalid_action',
      'reason'
    )).rejects.toThrow(/Unknown action type/);
  });

  it('named export sendBulkNotificationEmail delegates to singleton (L1220)', async () => {
    const r = await sendBulkNotificationEmail('x@y.com', {
      type: 'announcement', title: 'T', message: 'M', userName: 'U',
    });
    expect(r.success).toBe(true);
  });
});
