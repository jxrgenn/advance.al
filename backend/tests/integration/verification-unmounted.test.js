/**
 * O-69 — /api/verification is no longer mounted by server.js.
 *
 * No page used it (signup verifies through /api/auth/initiate-registration +
 * /api/auth/register), yet publicly it sent codes to any email/phone (mail
 * bombing from our domain, SMS cost) and told whether an identifier belonged
 * to an account. The REAL app must answer every former path with the generic
 * 404 and send nothing. The router file itself is still tested in isolation
 * through tests/helpers/verificationApp.js.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import resendEmailService from '../../src/lib/resendEmailService.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createJobseeker } from '../factories/user.factory.js';

describe('O-69 — /api/verification is unmounted from the real app', () => {
  let emailSpy;

  beforeAll(async () => {
    await connectTestDB();
    await seedLocations();
  });

  beforeEach(async () => {
    // An existing account: the old /request + /status leaked its existence.
    await createJobseeker({ email: 'victim@example.com', phone: '+355691112233' });
    emailSpy = jest.spyOn(resendEmailService, 'sendTransactionalEmail');
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await clearTestDB();
    await seedLocations();
  });

  afterAll(async () => {
    await closeTestDB();
  });

  it.each([
    ['post', '/api/verification/request', { identifier: 'victim@example.com', method: 'email' }],
    ['post', '/api/verification/request', { identifier: '+355691112233', method: 'sms' }],
    ['post', '/api/verification/verify', { identifier: 'victim@example.com', code: '123456', method: 'email' }],
    ['post', '/api/verification/validate-token', { verificationToken: 'a'.repeat(64) }],
    ['post', '/api/verification/resend', { identifier: 'victim@example.com', method: 'email' }],
    ['get', '/api/verification/status/victim@example.com', null],
  ])('%s %s → 404 "Rruga nuk u gjet", no email sent', async (method, path, body) => {
    const pending = request(app)[method](path);
    const r = body ? await pending.send(body) : await pending;
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ success: false, message: 'Rruga nuk u gjet', path });
    // The router's SMS sender is module-local (not observable); the 404 above
    // already proves no handler ran.
    expect(emailSpy).not.toHaveBeenCalled();
  });

  it('the signup verification flow that replaced it is still mounted (initiate-registration validates)', async () => {
    const r = await request(app).post('/api/auth/initiate-registration').send({});
    expect(r.status).toBe(400);
    expect(r.body.message).toBe('Gabime në validim');
  });
});
