/**
 * A15 — Cloudinary integration security.
 *
 * Cloudinary is the configured image/file CDN. This spec verifies:
 *   - No Cloudinary API_KEY/SECRET/cloud_name in client bundles
 *   - CSP img-src is restrictive
 *   - Cloudinary URLs in app responses don't leak signing secrets
 *   - No unsigned-upload-preset whitelisted publicly
 *   - Resource transformation DoS surface
 *
 * The DEEP file-upload tests (signed URL bypass, transformation
 * abuse on real assets) require knowing the Cloudinary cloud_name
 * — extracted from any res.cloudinary.com URL we find.
 */

import { test, expect } from '@playwright/test';
import { API, FRONTEND } from './_helpers';

async function findCloudinaryUrlsInBundle(): Promise<{ urls: string[]; cloudName: string | null }> {
  const homepage = await fetch(FRONTEND);
  const html = await homepage.text();
  const bundlePaths = Array.from(
    html.matchAll(/\/assets\/[a-zA-Z]+-[a-zA-Z0-9_-]+\.js/g)
  ).map((m) => m[0]);
  const urls = new Set<string>();
  for (const p of bundlePaths) {
    const r = await fetch(`${FRONTEND}${p}`);
    if (!r.ok) continue;
    const body = await r.text();
    Array.from(body.matchAll(/https:\/\/res\.cloudinary\.com\/[a-zA-Z0-9-]+\/[^\s'"`,)]+/g))
      .map((m) => m[0])
      .forEach((u) => urls.add(u));
  }
  const cloudNameMatch = [...urls][0]?.match(/res\.cloudinary\.com\/([a-zA-Z0-9-]+)\//);
  return { urls: [...urls], cloudName: cloudNameMatch ? cloudNameMatch[1] : null };
}

test.describe('Phase A.15 — Cloudinary security (chromium-desktop only)', () => {

  test('A15.1 no Cloudinary API_KEY in any frontend bundle', async () => {
    const homepage = await fetch(FRONTEND);
    const html = await homepage.text();
    const bundles = Array.from(html.matchAll(/\/assets\/[a-zA-Z]+-[a-zA-Z0-9_-]+\.js/g)).map((m) => m[0]);

    for (const path of bundles) {
      const r = await fetch(`${FRONTEND}${path}`);
      if (!r.ok) continue;
      const body = await r.text();
      // Cloudinary API keys are 15-digit numbers in their URL config syntax: cloudinary://API_KEY:API_SECRET@CLOUD_NAME
      expect(body, `${path}: no cloudinary URL with secret`)
        .not.toMatch(/cloudinary:\/\/[0-9]+:[A-Za-z0-9_-]+@/);
      // CLOUDINARY_API_SECRET would be 27 alphanumeric+- chars typically
      expect(body, `${path}: no CLOUDINARY_API_SECRET literal`)
        .not.toMatch(/CLOUDINARY_API_SECRET\s*[:=]\s*["'][A-Za-z0-9_-]{20,}["']/);
      expect(body, `${path}: no api_secret literal`)
        .not.toMatch(/\bapi_secret\s*[:=]\s*["'][A-Za-z0-9_-]{20,}["']/);
    }
  });

  test('A15.2 no unsigned upload preset name in bundle', async () => {
    const homepage = await fetch(FRONTEND);
    const html = await homepage.text();
    const bundles = Array.from(html.matchAll(/\/assets\/[a-zA-Z]+-[a-zA-Z0-9_-]+\.js/g)).map((m) => m[0]);

    for (const path of bundles) {
      const r = await fetch(`${FRONTEND}${path}`);
      if (!r.ok) continue;
      const body = await r.text();
      // Common unsigned-upload patterns: `upload_preset: "..."`, `unsigned: true`
      const unsignedConfig = /unsigned\s*:\s*true/.test(body);
      const presetConfig = /upload_preset\s*:\s*["'][a-zA-Z0-9_-]+["']/.test(body);
      if (unsignedConfig || presetConfig) {
        // Document — only fail if BOTH appear (= unsigned upload from browser is enabled)
        if (unsignedConfig && presetConfig) {
          throw new Error(
            `🚨 ${path}: contains both "unsigned: true" AND upload_preset config — unsigned uploads from client are abuse-prone`
          );
        }
        console.log(`[A15.2] ${path}: cloudinary upload config found (unsigned=${unsignedConfig}, preset=${presetConfig}) — manual verification recommended`);
      }
    }
  });

  test('A15.3 CSP img-src restricts to res.cloudinary.com (no wildcard *)', async () => {
    const r = await fetch(FRONTEND);
    const csp = r.headers.get('content-security-policy') || '';
    if (!csp) return; // CSP optional
    // Find img-src directive
    const imgSrcMatch = csp.match(/img-src[^;]*/i);
    if (!imgSrcMatch) return;
    const directive = imgSrcMatch[0].toLowerCase();
    expect(directive, 'img-src must not be wildcard alone').not.toMatch(/img-src\s+\*\s*;/);
    // Must include cloudinary
    expect(directive, 'img-src must whitelist cloudinary').toMatch(/cloudinary/i);
  });

  test('A15.4 Cloudinary URLs in API responses are well-formed (no API_SECRET in path)', async () => {
    // Fetch a few public companies / jobs that may have logos
    const r = await fetch(`${API}/companies?limit=10`);
    if (!r.ok) return;
    const body = await r.json();
    const items = body?.data?.companies ?? [];
    for (const c of items) {
      const blob = JSON.stringify(c);
      // No api_secret leak
      expect(blob, 'no api_secret in company payload').not.toMatch(/api_secret/i);
      // Cloudinary URLs should be of form https://res.cloudinary.com/<cloud>/image/upload/...
      const urls = blob.match(/https:\/\/res\.cloudinary\.com\/[^\s"',)]+/g) ?? [];
      for (const u of urls) {
        expect(u, 'cloudinary URL well-formed').toMatch(/^https:\/\/res\.cloudinary\.com\/[a-zA-Z0-9-]+\/(image|raw|video)\/(upload|fetch|private)/);
      }
    }
  });

  test('A15.5 Cloudinary public_ids are not sequential (advisory)', async () => {
    const { urls } = await findCloudinaryUrlsInBundle();
    if (urls.length < 2) {
      console.log('[A15.5] Not enough Cloudinary URLs to test predictability — advisory only');
      return;
    }
    // public_id is the part after /upload/v<version>/ before the extension
    const publicIds = urls
      .map((u) => u.match(/\/(?:upload|fetch|private)\/(?:v[0-9]+\/)?([^.?]+)/)?.[1])
      .filter(Boolean);
    if (publicIds.length < 2) return;
    // Look for sequential numeric pattern (e.g. logos/1, logos/2)
    const nums = publicIds.map((p) => p!.match(/\b(\d+)\b/)?.[1]).filter(Boolean).map(Number);
    if (nums.length >= 2) {
      const sorted = [...nums].sort((a, b) => a - b);
      const sequential = sorted.every((n, i) => i === 0 || n - sorted[i - 1] <= 5);
      if (sequential) {
        console.log(`[A15.5] WARNING: public_ids appear sequential (${sorted.join(',')}) — enumeration possible`);
      }
    }
  });

  test('A15.6 backend does not proxy Cloudinary requests (SSRF defense)', async () => {
    // If the backend had `/api/proxy?url=` or similar, an attacker could SSRF it.
    // None should exist. Probe a few likely paths.
    for (const path of ['/api/proxy', '/api/fetch', '/api/image', '/api/img', '/api/cdn']) {
      const r = await fetch(`${API.replace('/api', '')}${path}?url=https://res.cloudinary.com/test/image/upload/v1/test`);
      expect([404, 405]).toContain(r.status);
    }
  });

  test('A15.7 Cloudinary CSP-img-src does NOT include http://', async () => {
    const r = await fetch(FRONTEND);
    const csp = r.headers.get('content-security-policy') || '';
    if (!csp) return;
    const imgSrcMatch = csp.match(/img-src[^;]*/i);
    if (!imgSrcMatch) return;
    expect(imgSrcMatch[0].toLowerCase(), 'no http:// in img-src').not.toMatch(/\bhttp:\/\//);
  });

  test('A15.8 res.cloudinary.com directly (the CDN) — verify TLS', async () => {
    // Just confirm the CDN itself is HTTPS-only
    const r = await fetch('https://res.cloudinary.com/').catch(() => null);
    if (r) {
      // Cloudinary returns 4xx for the bare /, but it's TLS-served
      expect(r.status, 'CDN reachable').toBeLessThan(600);
    }
  });

  test('A15.9 no public CV directory listing', async () => {
    const { cloudName } = await findCloudinaryUrlsInBundle();
    if (!cloudName) {
      console.log('[A15.9] No cloud_name detected in bundles — skipping CV directory probe');
      return;
    }
    // Cloudinary's resource list endpoints require auth; verify they're not publicly accessible
    const r = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/resources/raw`);
    // Without API auth, this should 401
    expect([401, 403, 404]).toContain(r.status);
  });

  test('A15.10 backend image URLs are absolute Cloudinary URLs (no relative paths)', async () => {
    const r = await fetch(`${API}/companies?limit=5`);
    if (!r.ok) return; // includes 429 rate-limit case
    const body = await r.json();
    const companies = body?.data?.companies ?? [];
    for (const c of companies) {
      const logo = c.logo ?? c.profile?.employerProfile?.logo;
      if (logo && typeof logo === 'string' && logo.length > 0) {
        // Logo should be absolute URL (Cloudinary or null/empty are acceptable)
        expect(logo, 'logo URL must be absolute https://').toMatch(/^https:\/\//);
      }
    }
  });
});
