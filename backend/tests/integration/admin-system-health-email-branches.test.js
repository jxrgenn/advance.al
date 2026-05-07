/**
 * Phase 28 — coverage push for admin.js GET /system-health
 * emailServiceStatus branches (L356-362):
 *   - 'down'      → no RESEND_API_KEY AND no SMTP_HOST
 *   - 'limited'   → no RESEND_API_KEY but SMTP_HOST present
 *   - 'operational' → RESEND_API_KEY present (default test path)
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createAdmin } from '../factories/user.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';

describe('admin.js — GET /system-health emailServiceStatus branches', () => {
  let originalResend;
  let originalSmtp;

  beforeAll(async () => {
    await connectTestDB();
    await seedLocations();
    originalResend = process.env.RESEND_API_KEY;
    originalSmtp = process.env.SMTP_HOST;
  });

  afterEach(async () => {
    await clearTestDB();
    await seedLocations();
  });

  afterAll(async () => {
    await closeTestDB();
    if (originalResend === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalResend;
    if (originalSmtp === undefined) delete process.env.SMTP_HOST;
    else process.env.SMTP_HOST = originalSmtp;
  });

  it('emailServiceStatus=down when neither RESEND nor SMTP is configured (L358-359)', async () => {
    delete process.env.RESEND_API_KEY;
    delete process.env.SMTP_HOST;
    const { user: admin } = await createAdmin();

    const r = await request(app)
      .get('/api/admin/system-health')
      .set(createAuthHeaders(admin));
    expect(r.status).toBe(200);
    expect(r.body.data.emailServiceStatus).toBe('down');
  });

  it('emailServiceStatus=limited when SMTP_HOST set but RESEND missing (L360-361)', async () => {
    delete process.env.RESEND_API_KEY;
    process.env.SMTP_HOST = 'smtp.example.com';
    const { user: admin } = await createAdmin();

    const r = await request(app)
      .get('/api/admin/system-health')
      .set(createAuthHeaders(admin));
    expect(r.status).toBe(200);
    expect(r.body.data.emailServiceStatus).toBe('limited');
  });

  it('emailServiceStatus=operational when RESEND_API_KEY is set', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    const { user: admin } = await createAdmin();

    const r = await request(app)
      .get('/api/admin/system-health')
      .set(createAuthHeaders(admin));
    expect(r.status).toBe(200);
    expect(r.body.data.emailServiceStatus).toBe('operational');
  });
});
