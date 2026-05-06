/**
 * A26 — Public-data-leak audit.
 *
 * Verifies that public API responses don't accidentally include
 * internal Mongo fields, password hashes, secret tokens, etc.
 */

import { test, expect } from '@playwright/test';
import { API } from './_helpers';

const SECRET_FIELDS = [
  'password',
  'passwordhash',
  'verificationcode',
  'resetpasswordtoken',
  'resetpasswordexpires',
  'refreshtoken',
  'refreshtokens',
  'emailverificationtoken',
  '__v',  // mongoose internal version
  'internalnotes',
  'adminnotes',
  'apikey',
  'secret',
];

async function checkResponseForSecrets(url: string): Promise<{ status: number; leaks: string[] }> {
  const r = await fetch(url);
  if (!r.ok) return { status: r.status, leaks: [] };
  const blob = await r.text();
  const lower = blob.toLowerCase();
  const leaks = SECRET_FIELDS.filter((field) => lower.includes(`"${field}"`));
  return { status: r.status, leaks };
}

test.describe('Phase A.26 — Public data leak (chromium-desktop only)', () => {

  test('A26.1 GET /jobs has no secret fields in response', async () => {
    const { status, leaks } = await checkResponseForSecrets(`${API}/jobs?limit=10`);
    expect([200, 429]).toContain(status);
    expect(leaks, `secret fields leaked: ${leaks.join(', ')}`).toEqual([]);
  });

  test('A26.2 GET /jobs/:id has no secret fields', async () => {
    const list = await fetch(`${API}/jobs?limit=1`).then((r) => r.json());
    const id = list?.data?.jobs?.[0]?._id;
    if (!id) return;
    const { leaks } = await checkResponseForSecrets(`${API}/jobs/${id}`);
    expect(leaks, `secret fields leaked: ${leaks.join(', ')}`).toEqual([]);
  });

  test('A26.3 GET /companies has no secret fields', async () => {
    const { leaks } = await checkResponseForSecrets(`${API}/companies?limit=10`);
    expect(leaks, `secret fields leaked: ${leaks.join(', ')}`).toEqual([]);
  });

  test('A26.4 GET /companies/:id has no secret fields', async () => {
    const list = await fetch(`${API}/companies?limit=1`).then((r) => r.json()).catch(() => null);
    const id = list?.data?.companies?.[0]?._id;
    if (!id) return;
    const { leaks } = await checkResponseForSecrets(`${API}/companies/${id}`);
    expect(leaks, `secret fields leaked: ${leaks.join(', ')}`).toEqual([]);
  });

  test('A26.5 GET /companies/:id/jobs has no secret fields', async () => {
    const list = await fetch(`${API}/companies?limit=1`).then((r) => r.json()).catch(() => null);
    const id = list?.data?.companies?.[0]?._id;
    if (!id) return;
    const { leaks } = await checkResponseForSecrets(`${API}/companies/${id}/jobs`);
    expect(leaks, `secret fields leaked: ${leaks.join(', ')}`).toEqual([]);
  });

  test('A26.6 GET /jobs/:id/similar has no secret fields', async () => {
    const list = await fetch(`${API}/jobs?limit=1`).then((r) => r.json());
    const id = list?.data?.jobs?.[0]?._id;
    if (!id) return;
    const { leaks } = await checkResponseForSecrets(`${API}/jobs/${id}/similar`);
    expect(leaks, `secret fields leaked: ${leaks.join(', ')}`).toEqual([]);
  });

  test('A26.7 GET /locations has no secret fields', async () => {
    const { leaks } = await checkResponseForSecrets(`${API}/locations`);
    expect(leaks, `secret fields leaked: ${leaks.join(', ')}`).toEqual([]);
  });

  test('A26.8 GET /locations/popular has no secret fields', async () => {
    const { leaks } = await checkResponseForSecrets(`${API}/locations/popular`);
    expect(leaks, `secret fields leaked: ${leaks.join(', ')}`).toEqual([]);
  });

  test('A26.9 GET /stats/public has no secret fields', async () => {
    const { leaks } = await checkResponseForSecrets(`${API}/stats/public`);
    expect(leaks, `secret fields leaked: ${leaks.join(', ')}`).toEqual([]);
  });

  test('A26.10 GET /configuration/public has no secret fields', async () => {
    const { leaks } = await checkResponseForSecrets(`${API}/configuration/public`);
    expect(leaks, `secret fields leaked: ${leaks.join(', ')}`).toEqual([]);
  });

  // ---------- Employer object minimization ----------

  test('A26.emp.1 /jobs response employer field is minimized', async () => {
    const r = await fetch(`${API}/jobs?limit=10`);
    if (!r.ok) return;
    const body = await r.json();
    for (const job of body?.data?.jobs ?? []) {
      const emp = job?.employer ?? job?.employerId;
      if (typeof emp === 'object' && emp) {
        const blob = JSON.stringify(emp).toLowerCase();
        expect(blob, 'no password').not.toMatch(/"password"/);
        expect(blob, 'no internal __v').not.toMatch(/"__v"/);
        // Email may legitimately appear as part of "contactEmail" — that's a publish decision
      }
    }
  });
});
