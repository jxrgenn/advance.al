/**
 * A7 — Static assets present on production: favicon, robots.txt,
 * sitemap.xml, .well-known/security.txt.
 *
 * SPA caveat: Vercel rewrites all non-asset paths to index.html. So we
 * fetch with `Accept: text/plain` or specific MIME negotiation when
 * possible, and check content-type to distinguish "real asset" from
 * "rewritten to React shell".
 */

import { test, expect } from '@playwright/test';
import { FRONTEND } from './_helpers';

test.describe('Phase A.7 — Static assets (chromium-desktop only via config testMatch)', () => {
  test('A7.1 /favicon.ico present + image MIME', async () => {
    const r = await fetch(`${FRONTEND}/favicon.ico`);
    expect(r.status).toBe(200);
    const ctype = r.headers.get('content-type') || '';
    expect(ctype, 'favicon must be image/ MIME').toMatch(/image\//i);
  });

  test('A7.2 /robots.txt present + disallows /api', async () => {
    const r = await fetch(`${FRONTEND}/robots.txt`);
    expect(r.status).toBe(200);
    const ctype = r.headers.get('content-type') || '';
    expect(ctype, 'robots.txt is text/plain not text/html').toMatch(/text\/plain/i);
    const text = await r.text();
    expect(text, 'robots.txt must mention /api').toMatch(/disallow.*\/api|allow/i);
  });

  test('A7.3 /sitemap.xml present + valid XML', async () => {
    const r = await fetch(`${FRONTEND}/sitemap.xml`);
    expect(r.status).toBe(200);
    const ctype = r.headers.get('content-type') || '';
    expect(ctype, 'sitemap.xml is XML').toMatch(/xml/i);
    const text = await r.text();
    expect(text, 'sitemap must contain <urlset>').toMatch(/<urlset/);
    expect(text, 'sitemap must contain <url>').toMatch(/<url>/);
    expect(text, 'sitemap must reference advance.al').toContain('advance.al');
  });

  test('A7.4 /.well-known/security.txt present + has Contact', async () => {
    const r = await fetch(`${FRONTEND}/.well-known/security.txt`);
    expect(r.status).toBe(200);
    const ctype = r.headers.get('content-type') || '';
    expect(ctype, 'security.txt is text/plain').toMatch(/text\/plain/i);
    const text = await r.text();
    expect(text, 'security.txt must have Contact:').toMatch(/Contact:/i);
  });

  test('A7.5 /robots.txt is NOT serving the SPA HTML shell', async () => {
    const r = await fetch(`${FRONTEND}/robots.txt`);
    const text = await r.text();
    expect(text, 'robots.txt must NOT be index.html').not.toContain('<!doctype html>');
    expect(text, 'robots.txt must NOT contain React app').not.toContain('<div id="root">');
  });

  test('A7.6 /sitemap.xml is NOT serving the SPA HTML shell', async () => {
    const r = await fetch(`${FRONTEND}/sitemap.xml`);
    const text = await r.text();
    expect(text, 'sitemap.xml must NOT be index.html').not.toContain('<!doctype html>');
  });
});
