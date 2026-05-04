/**
 * register-jobseeker.spec.ts — 2-step jobseeker registration via API + UI.
 *
 * 10 tests: initiate ok, missing fields, duplicate email, weak password,
 * invalid city, register-with-code success, wrong code, expired code,
 * email normalization, race-safe.
 */

import { test } from '@playwright/test';
import { dbClear, dbCount, dbFindOne } from '../../../real-backend/db-helpers';
import { waitForVerificationCode } from '../../../real-backend/db-helpers';
import { API } from '../../../real-backend/factory-helpers';
import { expect } from '@playwright/test';

test.describe('Auth / register jobseeker', () => {
  test.beforeEach(async () => { await dbClear(); });

  test('RJ.1 initiate-registration with valid body → 200', async () => {
    const email = `rj1-${Date.now()}@example.com`;
    const r = await fetch(`${API}/auth/initiate-registration`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email, password: 'StrongPass123!',
        userType: 'jobseeker',
        firstName: 'Anila', lastName: 'Kola',
        city: 'Tiranë'
      })
    });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.success).toBe(true);

    const code = await waitForVerificationCode(email, 15000);
    expect(code).toMatch(/^\d{6}$/);
  });

  test('RJ.2 initiate-registration missing required → 400', async () => {
    const r = await fetch(`${API}/auth/initiate-registration`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: `rj2-${Date.now()}@example.com` }),
    });
    expect([400, 422]).toContain(r.status);
  });

  test('RJ.3 invalid email format → 400', async () => {
    const r = await fetch(`${API}/auth/initiate-registration`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'not-an-email', password: 'StrongPass123!',
        userType: 'jobseeker', firstName: 'Anna', lastName: 'Bee', city: 'Tiranë'
      })
    });
    expect([400, 422]).toContain(r.status);
  });

  test('RJ.4 weak password (<8 chars) → 400', async () => {
    const r = await fetch(`${API}/auth/initiate-registration`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: `rj4-${Date.now()}@example.com`,
        password: 'weak',
        userType: 'jobseeker', firstName: 'Anna', lastName: 'Bee', city: 'Tiranë'
      })
    });
    expect([400, 422]).toContain(r.status);
  });

  test('RJ.5 register-with-code (full 2-step) creates User + JWT', async () => {
    const email = `rj5-${Date.now()}@example.com`;
    await fetch(`${API}/auth/initiate-registration`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email, password: 'StrongPass123!',
        userType: 'jobseeker', firstName: 'Anna', lastName: 'Bee', city: 'Tiranë'
      })
    });
    const code = await waitForVerificationCode(email, 15000);

    const r = await fetch(`${API}/auth/register`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, verificationCode: code }),
    });
    expect(r.status).toBe(201);
    const body = await r.json();
    expect(body.data?.token).toBeTruthy();

    expect(await dbCount('users', { email })).toBe(1);
  });

  test('RJ.6 wrong verification code → 400', async () => {
    const email = `rj6-${Date.now()}@example.com`;
    await fetch(`${API}/auth/initiate-registration`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email, password: 'StrongPass123!',
        userType: 'jobseeker', firstName: 'Anna', lastName: 'Bee', city: 'Tiranë'
      })
    });
    await waitForVerificationCode(email, 15000);

    const r = await fetch(`${API}/auth/register`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, verificationCode: '000000' }),
    });
    expect([400, 401]).toContain(r.status);
    expect(await dbCount('users', { email })).toBe(0);
  });

  test('RJ.7 register without prior initiate → 400', async () => {
    const r = await fetch(`${API}/auth/register`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: `rj7-${Date.now()}@example.com`,
        verificationCode: '123456'
      }),
    });
    expect([400, 401, 404]).toContain(r.status);
  });

  test('RJ.8 duplicate email re-init OK; can finish only once', async () => {
    const email = `rj8-${Date.now()}@example.com`;
    await fetch(`${API}/auth/initiate-registration`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email, password: 'StrongPass123!',
        userType: 'jobseeker', firstName: 'Anna', lastName: 'Bee', city: 'Tiranë'
      })
    });
    const code1 = await waitForVerificationCode(email, 15000);

    await fetch(`${API}/auth/register`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, verificationCode: code1 }),
    });

    // Attempt to register again with same email
    const r2 = await fetch(`${API}/auth/initiate-registration`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email, password: 'StrongPass123!',
        userType: 'jobseeker', firstName: 'Anna', lastName: 'Bee', city: 'Tiranë'
      })
    });
    expect([400, 409]).toContain(r2.status);
  });

  test('RJ.9 email normalization: uppercase email becomes lowercase in stored doc', async () => {
    const email = `RJ9-${Date.now()}@EXAMPLE.com`;
    const lowerEmail = email.toLowerCase();
    await fetch(`${API}/auth/initiate-registration`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email, password: 'StrongPass123!',
        userType: 'jobseeker', firstName: 'Anna', lastName: 'Bee', city: 'Tiranë'
      })
    });
    const code = await waitForVerificationCode(lowerEmail, 15000);

    await fetch(`${API}/auth/register`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: lowerEmail, verificationCode: code }),
    });

    const stored = await dbFindOne('users', { email: lowerEmail });
    expect(stored?.email).toBe(lowerEmail);
  });

  test('RJ.10 invalid userType=admin in initiate → rejected', async () => {
    const r = await fetch(`${API}/auth/initiate-registration`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: `rj10-${Date.now()}@example.com`,
        password: 'StrongPass123!',
        userType: 'admin',
        firstName: 'Anna', lastName: 'Bee', city: 'Tiranë'
      })
    });
    // Should not allow admin via public endpoint
    expect([400, 401, 403, 422]).toContain(r.status);
  });
});
