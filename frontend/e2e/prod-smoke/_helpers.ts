/**
 * Production-safe helpers for prod-smoke specs.
 *
 * Hard-codes the LIVE URLs (no env-driven indirection) so it's unambiguous
 * what's being tested. NO side-channel access. NO factory helpers — those
 * all hit the local launcher's :3199 endpoints which don't exist in prod.
 *
 * Every helper here is read-only: no DB writes, no emails sent.
 */

import { Page, expect } from '@playwright/test';
import crypto from 'crypto';

export const FRONTEND = 'https://advance.al';
export const API = 'https://api.advance.al/api';
export const BACKEND = 'https://api.advance.al';

// CSP allowed origins (frame-ancestors, connect-src, etc.)
export const CORS_ALLOWED = ['https://advance.al', 'https://www.advance.al'];

// Public job _id known to exist on prod (Coca-Cola Albania, May 5 2026 snapshot).
// Used for /jobs/:id detail tests. If this job is later soft-deleted,
// fetchAnyPublicJobId() below grabs a live one from the listing.
export const KNOWN_JOB_ID_FALLBACK = '69c9550045399d9c604eb745';

/**
 * Fetch the first job id from /api/jobs. Used by /jobs/:id and /companies/:id
 * tests so they survive content changes on prod.
 */
export async function fetchAnyPublicJobId(): Promise<string> {
  const r = await fetch(`${API}/jobs?limit=1`);
  if (!r.ok) return KNOWN_JOB_ID_FALLBACK;
  const body = await r.json().catch(() => null);
  const id = body?.data?.jobs?.[0]?._id;
  return id || KNOWN_JOB_ID_FALLBACK;
}

/**
 * Fetch any company id (employer User _id) from /api/companies.
 */
export async function fetchAnyCompanyId(): Promise<string | null> {
  const r = await fetch(`${API}/companies?limit=1`);
  if (!r.ok) return null;
  const body = await r.json().catch(() => null);
  return body?.data?.companies?.[0]?._id ?? null;
}

/**
 * Probe headers via fetch (HEAD). Returns the Headers object or throws.
 */
export async function fetchHeaders(url: string, method: 'HEAD' | 'GET' | 'OPTIONS' = 'HEAD'): Promise<Response> {
  return fetch(url, { method, redirect: 'manual' });
}

/**
 * Build a JWT with `alg: none` for negative-auth tests.
 */
export function jwtAlgNone(payload: Record<string, unknown>): string {
  const enc = (b: Buffer) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const h = enc(Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })));
  const p = enc(Buffer.from(JSON.stringify(payload)));
  return `${h}.${p}.`;
}

/**
 * Build a JWT signed with the WRONG secret. Production should reject.
 */
export function jwtWrongSecret(payload: Record<string, unknown>): string {
  const enc = (b: Buffer) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const h = enc(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const p = enc(Buffer.from(JSON.stringify(payload)));
  const sig = crypto.createHmac('sha256', 'definitely-not-the-real-secret').update(`${h}.${p}`).digest();
  return `${h}.${p}.${enc(sig)}`;
}

/**
 * Wait for page load + return console errors collected during navigation.
 * Filters out known-noise: extension errors, 3rd-party tracker errors.
 */
export async function gotoCollectErrors(page: Page, path: string): Promise<string[]> {
  const errs: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errs.push(msg.text());
  });
  page.on('pageerror', (err) => errs.push(err.message));
  await page.goto(`${FRONTEND}${path}`);
  await page.waitForLoadState('domcontentloaded');
  // Brief settle so React mounts + initial fetches complete
  await page.waitForTimeout(1500);
  return errs.filter((e) => {
    // Filter expected noise: ad-blocker false-positives, third-party widget errors
    if (/extension|chrome-extension|moz-extension/.test(e)) return false;
    if (/Sentry SDK|sentry/i.test(e) && /not initialized|disabled/i.test(e)) return false;
    return true;
  });
}

/**
 * Assert response is a "deliberate" outcome — never 5xx.
 */
export function expectNot5xx(status: number, ctx: string) {
  expect(status, `${ctx}: must not 5xx`).toBeLessThan(500);
}

/**
 * Public frontend routes from App.tsx, in test-order.
 * `/jobs/:id` is filled in dynamically per test via fetchAnyPublicJobId().
 */
export const PUBLIC_ROUTES = [
  { path: '/', name: 'homepage', albanianText: /Punët|Posto|Hyrje/i },
  { path: '/jobs', name: 'jobs listing', albanianText: /Filtra|Tirana|Tiranë/i },
  { path: '/login', name: 'login', albanianText: /Kyçu|Hyrje|Email/i },
  { path: '/register', name: 'register', albanianText: /Regjistrohu|Punëkërkues|Punëdhënes/i },
  { path: '/about', name: 'about', albanianText: /Rreth|misioni|Advance/i },
  { path: '/employers', name: 'employers landing', albanianText: /Punëdhënës|Posto/i },
  { path: '/jobseekers', name: 'jobseekers landing', albanianText: /Punëkërkues|Regjistrohu/i },
  { path: '/employer-register', name: 'employer register', albanianText: /Punëdhënës|Kompani/i },
  { path: '/privacy', name: 'privacy', albanianText: /Privatësisë|GDPR|të dhëna/i },
  { path: '/terms', name: 'terms', albanianText: /Termat|Shërbimit|përdorimit/i },
  { path: '/forgot-password', name: 'forgot-password', albanianText: /Fjalëkalimi|Email/i },
  { path: '/reset-password?token=invalid', name: 'reset (invalid token)', albanianText: /token|invalid|fjalëkalim/i },
  // /unsubscribe with token renders a confirm panel — copy is "Punët" nav + the confirm body. Use loose match.
  { path: '/unsubscribe?token=abc123testtoken', name: 'unsubscribe (with token)', albanianText: /Punët|abonim|Çregjistrohu|Mail/i },
  // /preferences without auth bounces to login or shows error — just verify it loads.
  { path: '/preferences', name: 'preferences', albanianText: /Punët|Cilësimet|Preferencat|Email|Hyrje|Kyçu/i },
  { path: '/this-route-does-not-exist-12345', name: '404', albanianText: /404|gjet|gjendet|home/i },
];
