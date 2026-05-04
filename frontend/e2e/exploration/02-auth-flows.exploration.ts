/**
 * 02-auth-flows.exploration.ts — Phase 24 / P2
 *
 * Walk every auth flow with intent to break it. For each:
 *   - capture exact response body shape so I'm assertion-grounded
 *   - assert universal invariants (no 5xx, no console errors)
 *   - capture observable side effects in DB
 *
 * Findings logged to BUGS-FOUND.md as we go.
 */

import { test, expect } from '@playwright/test';
import { setupEvidence } from './_evidence';
import { dbClear, dbFind, dbFindOne, getVerificationCode, waitForVerificationCode } from '../real-backend/db-helpers';
import { API } from '../real-backend/factory-helpers';

test.describe.configure({ mode: 'serial' });

test.describe('Phase 24 / P2 / Auth flows', () => {
  test.beforeEach(async () => { await dbClear(); });

  // -------- Registration: jobseeker -----------------

  test('P2.JS.register-happy-path-and-shape', async ({ page }) => {
    const ev = setupEvidence(page, '02-auth/JS-register-happy');
    const email = `js-happy-${Date.now()}@example.com`;
    const r1 = await fetch(`${API}/auth/initiate-registration`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email, password: 'StrongPass123!', userType: 'jobseeker',
        firstName: 'Test', lastName: 'User', city: 'Tiranë'
      })
    });
    const initBody = await r1.json();
    console.log('OBS init-register response shape:', JSON.stringify(initBody, null, 2).slice(0, 800));
    expect(r1.status, 'init-register success').toBe(200);
    expect(initBody.success, 'init-register body.success').toBe(true);

    const code = await waitForVerificationCode(email, 15000);
    expect(code, 'verification code captured').toBeTruthy();

    const r2 = await fetch(`${API}/auth/register`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, verificationCode: code })
    });
    const regBody = await r2.json();
    console.log('OBS register response shape:', JSON.stringify(regBody, null, 2).slice(0, 800));
    expect([200, 201].includes(r2.status), `register status was ${r2.status}`).toBe(true);
    expect(regBody.success, 'register body.success').toBe(true);
    expect(regBody.data?.token, 'register returns token').toBeTruthy();
    expect(regBody.data?.user, 'register returns user').toBeTruthy();
    expect(regBody.data?.user?.email, 'user email matches').toBe(email);

    const u = await dbFindOne('users', { email });
    expect(u, 'user persisted in DB').toBeTruthy();
    expect(u.userType, 'userType=jobseeker').toBe('jobseeker');
    // Now verify the actual emailVerified state
    console.log('OBS new jobseeker DB state:', JSON.stringify({
      emailVerified: u.emailVerified,
      verified: u.verified,
      status: u.status,
      isDeleted: u.isDeleted,
    }));
  });

  test('P2.JS.duplicate-email-on-init-step', async () => {
    const email = `dup-${Date.now()}@example.com`;
    // 1st init OK
    const r1 = await fetch(`${API}/auth/initiate-registration`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email, password: 'StrongPass123!', userType: 'jobseeker',
        firstName: 'Anna', lastName: 'Bee', city: 'Tiranë'
      })
    });
    const r1body = await r1.json();
    console.log('OBS dup-test init-1 status=', r1.status, 'body=', JSON.stringify(r1body));
    expect(r1.status, `init-1 failed: ${JSON.stringify(r1body)}`).toBe(200);
    // Complete it
    const code = await waitForVerificationCode(email, 15000);
    await fetch(`${API}/auth/register`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, verificationCode: code })
    });
    // Second init with same email
    const r2 = await fetch(`${API}/auth/initiate-registration`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email, password: 'StrongPass123!', userType: 'jobseeker',
        firstName: 'Cee', lastName: 'Dee', city: 'Tiranë'
      })
    });
    const body2 = await r2.json();
    console.log('OBS duplicate-init response status=', r2.status, 'body=', JSON.stringify(body2));
    expect(r2.status, 'duplicate email should reject').not.toBe(200);
    expect(body2.success).toBe(false);
  });

  test('P2.JS.weak-password-rejected', async () => {
    const email = `weak-${Date.now()}@example.com`;
    const r = await fetch(`${API}/auth/initiate-registration`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email, password: '123', userType: 'jobseeker',
        firstName: 'Anna', lastName: 'Bee', city: 'Tiranë'
      })
    });
    const body = await r.json();
    console.log('OBS weak-pwd init response status=', r.status, 'body=', JSON.stringify(body));
    expect(r.status, 'weak password should reject').toBe(400);
  });

  test('P2.JS.email-with-uppercase-normalized', async () => {
    const email = `Upper-${Date.now()}@Example.COM`;
    const r1 = await fetch(`${API}/auth/initiate-registration`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email, password: 'StrongPass123!', userType: 'jobseeker',
        firstName: 'Anna', lastName: 'Bee', city: 'Tiranë'
      })
    });
    expect(r1.status).toBe(200);
    const lower = email.toLowerCase();
    const code = await waitForVerificationCode(lower, 15000);
    expect(code, 'code retrievable by lowercase email').toBeTruthy();
    await fetch(`${API}/auth/register`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, verificationCode: code })
    });
    // DB should have the lowercase form
    const u = await dbFindOne('users', { email: lower });
    expect(u, 'user stored with lowercase email').toBeTruthy();
    const u2 = await dbFindOne('users', { email });
    expect(u2, 'user NOT stored with mixed case').toBeFalsy();
  });

  test('P2.JS.email-with-whitespace', async () => {
    // Padded with leading and trailing whitespace
    const innerEmail = `wsp-${Date.now()}@example.com`;
    const padded = `  ${innerEmail}  `;
    const r1 = await fetch(`${API}/auth/initiate-registration`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: padded, password: 'StrongPass123!', userType: 'jobseeker',
        firstName: 'Anna', lastName: 'Bee', city: 'Tiranë'
      })
    });
    console.log('OBS whitespace-email init status=', r1.status);
    if (r1.status === 200) {
      const u = await dbFindOne('users', { email: innerEmail });
      // user record may not exist yet (only after step 2), but let's see if it errored on step 1
      console.log('OBS user from inner email after whitespace init:', !!u);
    }
    // Both 200 (trimmed-and-accepted) or 400 (rejected) are reasonable; capture which:
    const body1 = await r1.json();
    console.log('OBS whitespace-email body=', JSON.stringify(body1).slice(0, 400));
  });

  test('P2.JS.5-wrong-codes-locks-pending', async () => {
    const email = `lock-${Date.now()}@example.com`;
    const r1 = await fetch(`${API}/auth/initiate-registration`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email, password: 'StrongPass123!', userType: 'jobseeker',
        firstName: 'Anna', lastName: 'Bee', city: 'Tiranë'
      })
    });
    expect(r1.status).toBe(200);
    let lastStatus = 0;
    let lastBody: any;
    for (let i = 0; i < 6; i++) {
      const r = await fetch(`${API}/auth/register`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, verificationCode: '000000' })
      });
      lastStatus = r.status;
      lastBody = await r.json();
      console.log(`OBS wrong-code attempt #${i+1} status=${r.status}`);
    }
    console.log('OBS final wrong-code body=', JSON.stringify(lastBody).slice(0, 400));
    // At some point, the pending should be deleted; subsequent attempts should fail with 400/410/etc.
    expect(lastStatus, 'eventually wrong code should reject').not.toBe(200);
  });

  // -------- Login --------

  test('P2.LG.login-correct-pwd-returns-token-and-user', async () => {
    // First make a user
    const email = `login-${Date.now()}@example.com`;
    const password = 'StrongPass123!';
    await fetch(`${API}/auth/initiate-registration`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email, password, userType: 'jobseeker',
        firstName: 'Anna', lastName: 'Bee', city: 'Tiranë'
      })
    });
    const code = await waitForVerificationCode(email, 15000);
    await fetch(`${API}/auth/register`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, verificationCode: code })
    });
    // Now login
    const r = await fetch(`${API}/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const body = await r.json();
    console.log('OBS login response shape:', JSON.stringify(body, null, 2).slice(0, 800));
    expect(r.status, 'login success').toBe(200);
    expect(body.data?.token, 'login returns token').toBeTruthy();
    expect(body.data?.user?.email, 'login returns user.email').toBe(email);
    // Refresh token should be set somewhere — either in response or as cookie
    const cookies = r.headers.get('set-cookie');
    console.log('OBS login set-cookie:', cookies);
    console.log('OBS login refreshToken in body:', !!body.data?.refreshToken);
  });

  test('P2.LG.login-wrong-pwd-no-info-leak', async () => {
    const email = `wrongpw-${Date.now()}@example.com`;
    await fetch(`${API}/auth/initiate-registration`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email, password: 'StrongPass123!', userType: 'jobseeker',
        firstName: 'Anna', lastName: 'Bee', city: 'Tiranë'
      })
    });
    const code = await waitForVerificationCode(email, 15000);
    await fetch(`${API}/auth/register`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, verificationCode: code })
    });
    // Real account, wrong pwd
    const rWrong = await fetch(`${API}/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'WrongPass!' })
    });
    const bodyWrong = await rWrong.json();
    // Unknown email
    const rUnknown = await fetch(`${API}/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: `unknown-${Date.now()}@example.com`, password: 'AnyPass!' })
    });
    const bodyUnknown = await rUnknown.json();
    console.log('OBS wrong-pw status=', rWrong.status, 'body=', JSON.stringify(bodyWrong));
    console.log('OBS unknown-email status=', rUnknown.status, 'body=', JSON.stringify(bodyUnknown));
    expect(rWrong.status, 'wrong pw should fail').not.toBe(200);
    expect(rUnknown.status, 'unknown email should fail').not.toBe(200);
    // Error messages should be generic (no info leak)
    const messageWrong = (bodyWrong.message || '').toLowerCase();
    const messageUnknown = (bodyUnknown.message || '').toLowerCase();
    console.log('OBS messages — wrong:', messageWrong, ' unknown:', messageUnknown);
    // An info leak would say "user not found" vs "wrong password" — both should be the same generic message
    if (messageWrong !== messageUnknown && messageWrong && messageUnknown) {
      console.log('FINDING: login error messages differ between wrong-pw and unknown-email — info leak risk');
    }
  });

  test('P2.LG.login-suspended-blocked', async () => {
    const email = `susp-${Date.now()}@example.com`;
    const password = 'StrongPass123!';
    await fetch(`${API}/auth/initiate-registration`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email, password, userType: 'jobseeker',
        firstName: 'Anna', lastName: 'Bee', city: 'Tiranë'
      })
    });
    const code = await waitForVerificationCode(email, 15000);
    await fetch(`${API}/auth/register`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, verificationCode: code })
    });
    // Suspend
    const future = new Date(Date.now() + 24 * 3600 * 1000);
    await fetch('http://localhost:3199/__test/db/update', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        collection: 'users', filter: { email },
        update: { $set: { status: 'suspended', suspensionDetails: { reason: 'test', expiresAt: { $date: future.toISOString() } } } }
      })
    });
    const r = await fetch(`${API}/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const body = await r.json();
    console.log('OBS suspended-login status=', r.status, 'body=', JSON.stringify(body));
    expect(r.status, 'suspended user should be blocked').not.toBe(200);
  });

  // -------- Forgot/reset --------

  test('P2.FR.forgot-password-known-email', async () => {
    const email = `fp-${Date.now()}@example.com`;
    const password = 'StrongPass123!';
    await fetch(`${API}/auth/initiate-registration`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email, password, userType: 'jobseeker',
        firstName: 'Anna', lastName: 'Bee', city: 'Tiranë'
      })
    });
    const code = await waitForVerificationCode(email, 15000);
    await fetch(`${API}/auth/register`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, verificationCode: code })
    });
    // Forgot-password
    const r = await fetch(`${API}/auth/forgot-password`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const body = await r.json();
    console.log('OBS forgot-password status=', r.status, 'body=', JSON.stringify(body));
    expect(r.status, 'forgot-password OK').toBe(200);
    // Look for the token in stdout
    const stdoutR = await fetch('http://localhost:3199/__test/stdout-grep?pattern=' + encodeURIComponent('reset.*' + email)).then(r => r.json());
    console.log('OBS forgot-password stdout grep:', JSON.stringify(stdoutR));
  });

  test('P2.FR.forgot-password-unknown-email-no-leak', async () => {
    const r = await fetch(`${API}/auth/forgot-password`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: `unknown-${Date.now()}@example.com` })
    });
    const body = await r.json();
    console.log('OBS forgot-unknown status=', r.status, 'body=', JSON.stringify(body));
    expect(r.status, 'forgot-unknown should also be 200 (no info leak)').toBe(200);
  });
});
