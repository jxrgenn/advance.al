/**
 * Shared factory helpers for the real-E2E test suite.
 *
 * Every test that needs a logged-in user (jobseeker / employer / admin)
 * imports from here. All factories use the real backend at :3001 and the
 * side-channel at :3199 to read verification codes / direct-update DB.
 */

import { dbUpdate, waitForVerificationCode } from './db-helpers';

export const API = 'http://localhost:3001/api';
export const SIDE = 'http://localhost:3199';

export interface FactoryResult {
  email: string;
  password: string;
  token: string;
  userId?: string;
}

async function completeRegistration(email: string, body: any): Promise<string> {
  await fetch(`${API}/auth/initiate-registration`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  const code = await waitForVerificationCode(email);
  const reg = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, verificationCode: code })
  });
  const regBody = await reg.json();
  if (!regBody.data?.token) {
    throw new Error(`Register failed for ${email}: ${JSON.stringify(regBody)}`);
  }
  return regBody.data.token;
}

export async function makeJobseeker(opts: { email?: string; password?: string } = {}): Promise<FactoryResult> {
  const email = opts.email || `js-${Date.now()}-${Math.random().toString(36).slice(2,7)}@example.com`;
  const password = opts.password || 'StrongPass123!';
  const token = await completeRegistration(email, {
    email, password,
    userType: 'jobseeker',
    firstName: 'Js', lastName: 'Seeker',
    city: 'Tiranë'
  });
  return { email, password, token };
}

export async function makeEmployer(opts: {
  email?: string;
  password?: string;
  preApprove?: boolean;
  companyName?: string;
} = {}): Promise<FactoryResult> {
  const email = opts.email || `emp-${Date.now()}-${Math.random().toString(36).slice(2,7)}@example.com`;
  const password = opts.password || 'StrongPass123!';
  const token = await completeRegistration(email, {
    email, password,
    userType: 'employer',
    firstName: 'Emp', lastName: 'Loyer',
    city: 'Tiranë',
    companyName: opts.companyName || `TestCo-${Date.now()}`,
    industry: 'Teknologji',
    companySize: '11-50'
  });

  if (opts.preApprove !== false) {
    // Default: pre-approve so the employer can post jobs immediately.
    // Login checks `user.status === 'pending_verification'` and rejects, so we
    // must flip status to 'active' alongside the employerProfile flags.
    await dbUpdate('users', { email }, {
      $set: {
        verified: true,
        emailVerified: true,
        status: 'active',
        'profile.employerProfile.verified': true,
        'profile.employerProfile.verificationStatus': 'approved',
        'profile.employerProfile.verificationDate': new Date()
      }
    });
  }
  return { email, password, token };
}

/**
 * Create an admin user. Real registration doesn't accept userType=admin (that
 * route is jobseeker/employer only), so we register as jobseeker then
 * elevate via direct DB update + re-login to get an admin-token.
 */
export async function makeAdmin(opts: { email?: string; password?: string } = {}): Promise<FactoryResult> {
  const email = opts.email || `admin-${Date.now()}-${Math.random().toString(36).slice(2,7)}@advance.al`;
  const password = opts.password || 'StrongPass123!';
  await completeRegistration(email, {
    email, password,
    userType: 'jobseeker',
    firstName: 'Adm', lastName: 'In',
    city: 'Tiranë'
  });
  // Elevate to admin in DB
  await dbUpdate('users', { email }, {
    $set: { userType: 'admin', emailVerified: true, status: 'active' }
  });
  // Re-login to get a token with userType=admin claim
  const loginRes = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const body = await loginRes.json();
  if (!body.data?.token) throw new Error(`Admin login failed: ${JSON.stringify(body)}`);
  return { email, password, token: body.data.token };
}

/** Run a side-channel cron trigger. Returns the parsed JSON response. */
export async function runCron(name: 'job-expiry' | 'suspension-lift' | 'account-cleanup' | 'data-retention'): Promise<any> {
  const res = await fetch(`${SIDE}/__test/cron/run-${name}`, { method: 'POST' });
  if (!res.ok) throw new Error(`Cron ${name} failed: ${res.status}`);
  return res.json();
}

/** Search captured backend stdout for an arbitrary regex pattern. */
export async function stdoutGrep(pattern: string, timeoutMs = 5000): Promise<string | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await fetch(`${SIDE}/__test/stdout-grep?pattern=${encodeURIComponent(pattern)}`);
    const body = await res.json();
    if (body.found) return body.match;
    await new Promise(r => setTimeout(r, 200));
  }
  return null;
}

/** Trigger a forgot-password and capture the reset token from the launcher's
 *  side-channel (which captures the [DEV] Password reset token line). */
export async function requestPasswordReset(email: string, timeoutMs = 5000): Promise<string | null> {
  await fetch(`${API}/auth/forgot-password`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email })
  });
  // Side-channel keys the captured token under "reset:<email>".
  const start = Date.now();
  const key = `reset:${email.toLowerCase()}`;
  while (Date.now() - start < timeoutMs) {
    const res = await fetch(`${SIDE}/__test/code/${encodeURIComponent(key)}`);
    const body = await res.json();
    if (body.found) return body.code as string;
    await new Promise((r) => setTimeout(r, 200));
  }
  return null;
}

/** Direct insert helper. */
export async function dbInsert(collection: string, doc: any): Promise<any> {
  const res = await fetch(`${SIDE}/__test/db/insert`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ collection, doc })
  });
  const body = await res.json();
  if (!body.ok) throw new Error('db/insert: ' + body.error);
  return body;
}

/** Convenience: get auth headers for a token. */
export function authHeaders(token: string) {
  return {
    'content-type': 'application/json',
    Authorization: `Bearer ${token}`
  };
}
