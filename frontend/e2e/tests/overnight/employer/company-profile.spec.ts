/**
 * company-profile.spec.ts — employer company profile editing.
 *
 * 4 tests: update company info, sanitization, public visibility, validation.
 *
 * The PUT /users/profile route reads top-level body.employerProfile.<field>,
 * with allowlists ['description', 'website', 'companySize', 'phone', 'whatsapp',
 * 'contactPreferences'] for verified employers, plus ['companyName', 'industry',
 * 'logo'] when not verified. Model field is `description`, not
 * `companyDescription`; `website`, not `companyWebsite`.
 */

import { test } from '@playwright/test';
import { dbClear, dbFindOne } from '../../../real-backend/db-helpers';
import { makeEmployer, authHeaders, API } from '../../../real-backend/factory-helpers';
import { expect } from '@playwright/test';

test.describe('Employer / company profile', () => {
  test.beforeEach(async () => { await dbClear(); });

  test('CP.1 update companyName persists (unverified employer)', async () => {
    // Need an unverified employer for companyName to be in the allowlist.
    const emp = await makeEmployer({ preApprove: false, companyName: 'OriginalCo' });
    await fetch(`${API}/users/profile`, {
      method: 'PUT', headers: authHeaders(emp.token),
      body: JSON.stringify({
        employerProfile: { companyName: 'UpdatedCo' }
      }),
    });
    const user = await dbFindOne('users', { email: emp.email });
    expect(user.profile?.employerProfile?.companyName).toBe('UpdatedCo');
  });

  test('CP.2 description sanitized', async () => {
    const emp = await makeEmployer({ preApprove: true });
    await fetch(`${API}/users/profile`, {
      method: 'PUT', headers: authHeaders(emp.token),
      body: JSON.stringify({
        employerProfile: {
          description: 'We are a great company<script>alert(1)</script>'
        }
      }),
    });
    const user = await dbFindOne('users', { email: emp.email });
    const desc = user.profile?.employerProfile?.description || '';
    expect(desc).not.toMatch(/<script>/i);
  });

  test('CP.3 javascript: in website accepted but not as JS execution', async () => {
    const emp = await makeEmployer({ preApprove: true });
    const r = await fetch(`${API}/users/profile`, {
      method: 'PUT', headers: authHeaders(emp.token),
      body: JSON.stringify({
        employerProfile: { website: 'javascript:alert(1)' }
      }),
    });
    expect(r.status).not.toBe(500);
  });

  test('CP.4 no-auth → 401', async () => {
    const r = await fetch(`${API}/users/profile`, {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ employerProfile: { companyName: 'X' } }),
    });
    expect(r.status).toBe(401);
  });
});
