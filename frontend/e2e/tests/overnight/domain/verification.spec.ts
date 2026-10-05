/**
 * verification.spec.ts — the legacy /api/verification router is UNMOUNTED (O-69).
 *
 * POST /api/verification/{request,verify,validate-token,resend} and
 * GET /api/verification/status/:identifier were public, unused by the
 * frontend, and let anyone send codes to any email/phone (mail-bombing from
 * our domain, SMS cost) and probe which identifiers have accounts. Signup
 * verifies through /api/auth/initiate-registration + /api/auth/register (see
 * auth/register-*.spec.ts). Every former path must now answer the generic 404
 * and send nothing.
 */

import { test } from '@playwright/test';
import { dbClear, dbFind } from '../../../real-backend/db-helpers';
import { API } from '../../../real-backend/factory-helpers';
import { expect } from '@playwright/test';

const LEGACY_CALLS: Array<{ id: string; method: 'POST' | 'GET'; path: string; body?: Record<string, unknown> }> = [
  { id: 'V.1', method: 'POST', path: '/verification/request', body: { identifier: 'verify-legacy@example.com', method: 'email', userType: 'jobseeker' } },
  { id: 'V.2', method: 'POST', path: '/verification/request', body: { identifier: '+355691112233', method: 'sms' } },
  { id: 'V.3', method: 'POST', path: '/verification/verify', body: { identifier: 'verify-legacy@example.com', code: '000000', method: 'email' } },
  { id: 'V.4', method: 'POST', path: '/verification/resend', body: { identifier: 'verify-legacy@example.com', method: 'email' } },
  { id: 'V.5', method: 'POST', path: '/verification/validate-token', body: { verificationToken: 'invalid-token-string' } },
  { id: 'V.6', method: 'GET', path: '/verification/status/verify-legacy%40example.com' },
];

test.describe('Domain / verification (legacy router unmounted)', () => {
  test.beforeEach(async () => { await dbClear(); });

  for (const call of LEGACY_CALLS) {
    test(`${call.id} ${call.method} ${call.path} → 404 "Rruga nuk u gjet"`, async () => {
      const r = await fetch(`${API}${call.path}`, {
        method: call.method,
        headers: { 'content-type': 'application/json' },
        ...(call.body ? { body: JSON.stringify(call.body) } : {}),
      });
      expect(r.status).toBe(404);
      const body = await r.json();
      expect(body.success).toBe(false);
      expect(body.message).toBe('Rruga nuk u gjet');
    });
  }

  test('V.7 no account or verification record is created by the legacy calls', async () => {
    for (const call of LEGACY_CALLS) {
      await fetch(`${API}${call.path}`, {
        method: call.method,
        headers: { 'content-type': 'application/json' },
        ...(call.body ? { body: JSON.stringify(call.body) } : {}),
      });
    }
    expect(await dbFind('users', { email: 'verify-legacy@example.com' })).toEqual([]);
  });
});
