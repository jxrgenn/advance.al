/**
 * A12 — Source-code & secret exposure on the live deployment.
 *
 * Beyond A10's basic dotfile probe, this scans:
 *   - Every `.env` variant + dev artifact path on BOTH Vercel and Render
 *   - Every common build/IDE/SCM file
 *   - All deployed JS bundles for hardcoded secret patterns (deeper than A11.K.1)
 *   - robots.txt and sitemap.xml for accidental disclosures
 *   - Backup/swap-file probes (.bak, .swp, ~, .orig)
 *
 * READ-ONLY. No DB writes. No emails sent.
 */

import { test, expect } from '@playwright/test';
import { API, BACKEND, FRONTEND } from './_helpers';

// Paths that should NEVER be served (or, if Vercel SPA-fallbacks to HTML,
// must NOT be the actual file content)
const FORBIDDEN_PATHS = [
  // Git directory
  '/.git/config',
  '/.git/HEAD',
  '/.git/logs/HEAD',
  '/.git/index',
  '/.git/refs/heads/main',
  '/.git/COMMIT_EDITMSG',
  // Env files
  '/.env',
  '/.env.local',
  '/.env.development',
  '/.env.production',
  '/.env.test',
  '/.env.example',
  '/backend/.env',
  '/frontend/.env',
  // Source / config files
  '/server.js',
  '/package.json',
  '/package-lock.json',
  '/yarn.lock',
  '/pnpm-lock.yaml',
  '/tsconfig.json',
  '/vite.config.ts',
  '/vite.config.js',
  '/webpack.config.js',
  '/next.config.js',
  '/composer.json',
  '/composer.lock',
  // IDE/OS metadata
  '/.vscode/settings.json',
  '/.idea/workspace.xml',
  '/.DS_Store',
  '/Thumbs.db',
  // CI / deploy
  '/.github/workflows/keep-warm.yml',
  '/.gitlab-ci.yml',
  '/.travis.yml',
  '/Dockerfile',
  '/docker-compose.yml',
  '/render.yaml',
  // Backups / temp
  '/backup.sql',
  '/dump.sql',
  '/db.sqlite',
  '/server.js.bak',
  '/index.html.bak',
  '/.htaccess',
  // Common WP / PHP probes (catches Apache misroute)
  '/wp-config.php',
  '/wp-admin/',
  '/admin.php',
  '/phpinfo.php',
  '/info.php',
  '/.htpasswd',
  // Node-specific
  '/node_modules/',
  '/.npm/_logs/',
  '/yarn-error.log',
  '/npm-debug.log',
  // Common dev tools
  '/.well-known/security.txt',  // SHOULD exist (200) — separate test
  '/.well-known/acme-challenge/',
];

// Secret patterns to scan in JS bundles
const SECRET_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: 'AWS Access Key', pattern: /AKIA[0-9A-Z]{16}/ },
  { name: 'AWS Secret Key', pattern: /[A-Za-z0-9/+=]{40}/ },  // very loose, only flag in context
  { name: 'GCP Service Account', pattern: /"type"\s*:\s*"service_account"/ },
  { name: 'Stripe Live Key', pattern: /sk_live_[0-9a-zA-Z]{24,}/ },
  { name: 'Stripe Restricted Key', pattern: /rk_live_[0-9a-zA-Z]{24,}/ },
  { name: 'GitHub PAT', pattern: /ghp_[0-9a-zA-Z]{36}/ },
  { name: 'GitHub OAuth', pattern: /gho_[0-9a-zA-Z]{36}/ },
  { name: 'GitHub Refresh', pattern: /ghr_[0-9a-zA-Z]{76}/ },
  { name: 'Slack Bot Token', pattern: /xoxb-[0-9]+-[0-9]+-[a-zA-Z0-9]+/ },
  { name: 'Slack User Token', pattern: /xoxp-[0-9]+-[0-9]+-[0-9]+-[a-fA-F0-9]+/ },
  { name: 'Slack Webhook', pattern: /https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[a-zA-Z0-9]+/ },
  { name: 'Private Key (any)', pattern: /-----BEGIN (RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/ },
  { name: 'JWT_SECRET hardcoded', pattern: /JWT_SECRET\s*[:=]\s*["'][^"']{8,}["']/i },
  { name: 'MongoDB SRV connection', pattern: /mongodb\+srv:\/\/[^@]+@/ },
  { name: 'MongoDB connection (legacy)', pattern: /mongodb:\/\/[^@]+@[^/]+/ },
  { name: 'Resend API Key', pattern: /\bre_[A-Za-z0-9_]{24,}/ },
  { name: 'OpenAI API Key', pattern: /sk-(proj-)?[a-zA-Z0-9_-]{30,}/ },
  { name: 'Google API Key', pattern: /AIza[0-9A-Za-z_-]{35}/ },
  { name: 'Twilio Account SID', pattern: /AC[a-f0-9]{32}/ },
  { name: 'Twilio Auth Token (32 hex)', pattern: /\b[a-f0-9]{32}\b/ },  // very loose
  { name: 'Cloudinary URL with secret', pattern: /cloudinary:\/\/[0-9]+:[A-Za-z0-9_-]+@/ },
  { name: 'Sentry DSN with secret', pattern: /https:\/\/[a-f0-9]{32}:[a-f0-9]{32}@/ },
  { name: 'Heroku API Key', pattern: /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/ },
  // mongodb hostname pattern (the user's specific cluster — should NEVER appear in client code)
  { name: 'MongoDB cluster hostname', pattern: /cluster0\.gazdf55\.mongodb\.net/ },
];

async function fetchAllBundles(): Promise<{ path: string; body: string }[]> {
  const homepage = await fetch(FRONTEND);
  const html = await homepage.text();
  const paths = Array.from(
    html.matchAll(/\/assets\/[a-zA-Z]+-[a-zA-Z0-9_-]+\.(?:js|css)/g)
  ).map((m) => m[0]);
  const unique = Array.from(new Set(paths));
  const out: { path: string; body: string }[] = [];
  for (const p of unique) {
    const r = await fetch(`${FRONTEND}${p}`);
    if (r.ok) {
      out.push({ path: p, body: await r.text() });
    }
  }
  return out;
}

test.describe('Phase A.12 — Source-code & secret exposure (chromium-desktop only)', () => {

  // ---------- Forbidden-path probes ----------

  for (const path of FORBIDDEN_PATHS) {
    test(`A12.path ${path} — no real content served (Vercel)`, async () => {
      const r = await fetch(`${FRONTEND}${path}`);
      // Vercel SPA may return 200 with index.html. That's fine. What's NOT fine
      // is returning the actual file content.
      if (r.status === 200) {
        const ct = r.headers.get('content-type') || '';
        const body = await r.text();
        if (!/text\/html/i.test(ct)) {
          // 200 with non-HTML content is suspicious for these paths
          expect(body, `${path}: 200 with non-HTML — must not contain secrets`)
            .not.toMatch(/MONGODB_URI|JWT_SECRET|RESEND_API_KEY|OPENAI_API_KEY|API_SECRET/i);
        }
        // Even if HTML, body must not contain raw config / git data
        expect(body, `${path}: body must not contain raw secret`)
          .not.toMatch(/mongodb\+srv:\/\/[^x][^@]*@/);
        expect(body, `${path}: body must not contain raw .env content`)
          .not.toMatch(/^[A-Z_]+=[^\s]+\n[A-Z_]+=/m);
      } else {
        // 4xx is fine
        expect([400, 401, 403, 404]).toContain(r.status);
      }
    });

    test(`A12.path ${path} — backend not exposed`, async () => {
      const r = await fetch(`${BACKEND}${path}`);
      // Backend should never serve these paths — express only serves /api/* and /health
      if (r.status === 200) {
        const body = await r.text();
        expect(body, `backend ${path}: must not contain secrets`)
          .not.toMatch(/mongodb\+srv:\/\/|JWT_SECRET|RESEND_API_KEY|OPENAI_API_KEY/i);
      } else {
        expect([400, 401, 403, 404]).toContain(r.status);
      }
    });
  }

  // ---------- Bundle deep secret scan ----------

  test('A12.bundles deep secret scan across all assets', async () => {
    const bundles = await fetchAllBundles();
    expect(bundles.length, 'at least one bundle should be served').toBeGreaterThan(0);

    for (const { path, body } of bundles) {
      for (const { name, pattern } of SECRET_PATTERNS) {
        const matches = body.match(pattern);
        if (matches) {
          // Some patterns are very loose (32-hex, 40-base64) and produce false
          // positives on legit code. We hard-fail only on the high-precision ones.
          const highPrecision = [
            'MongoDB SRV connection',
            'MongoDB cluster hostname',
            'Resend API Key',
            'OpenAI API Key',
            'Stripe Live Key',
            'Stripe Restricted Key',
            'AWS Access Key',
            'GitHub PAT',
            'GitHub OAuth',
            'Slack Bot Token',
            'Slack Webhook',
            'Private Key (any)',
            'JWT_SECRET hardcoded',
            'Cloudinary URL with secret',
            // Removed Heroku API Key (UUID v4 pattern is too loose — matches React keys / runtime UUIDs)
            // Removed GCP Service Account (matches inert string literals in normalized code)
          ];
          if (highPrecision.includes(name)) {
            throw new Error(
              `🚨 ${path} contains ${name}: ${String(matches[0]).slice(0, 80)}...`
            );
          }
          // Loose-pattern matches (Twilio Auth Token, AWS Secret Key) — log only
          console.log(
            `[A12.bundles] ${path}: loose-pattern match for ${name} (${matches[0].slice(0, 40)}...) — manual review recommended`
          );
        }
      }
    }
  });

  // ---------- Source map probes for every bundle ----------

  test('A12.sourcemaps no .map file is a real source map', async () => {
    const bundles = await fetchAllBundles();
    for (const { path } of bundles) {
      if (!path.endsWith('.js')) continue;
      const r = await fetch(`${FRONTEND}${path}.map`);
      if (r.status === 200) {
        const ct = r.headers.get('content-type') || '';
        const body = await r.text();
        // Vercel SPA fallback returns HTML — that's fine
        if (/text\/html/i.test(ct)) continue;
        // If it's JSON, verify it's NOT a real sourcemap
        expect(body, `${path}.map: must not be a real source map`)
          .not.toMatch(/"version"\s*:\s*3.*"sources"\s*:/);
        expect(body, `${path}.map: no sourcesContent`)
          .not.toMatch(/"sourcesContent"\s*:/);
      }
    }
  });

  // ---------- robots.txt content audit ----------

  test('A12.robots.txt does not list backup/staging/internal paths', async () => {
    // Note: /admin and /employer-dashboard ARE listed in robots.txt as Disallow.
    // This is standard practice (tells crawlers not to index), not a leak. The real
    // risks are exposing internal/staging/backup paths a crawler wouldn't find otherwise.
    const r = await fetch(`${FRONTEND}/robots.txt`);
    if (!r.ok) return;
    const body = await r.text();
    expect(body, 'no /backup or /internal or /staging or /dev paths')
      .not.toMatch(/Disallow:\s*\/(backup|internal|staging|dev|tmp)/i);
  });

  // ---------- sitemap audit ----------

  test('A12.sitemap.xml contains no admin paths', async () => {
    const r = await fetch(`${FRONTEND}/sitemap.xml`);
    if (!r.ok) return;
    const body = await r.text();
    expect(body, 'sitemap must not list admin')
      .not.toMatch(/<loc>[^<]*\/admin/i);
    expect(body, 'sitemap must not list employer-dashboard')
      .not.toMatch(/<loc>[^<]*\/employer-dashboard/i);
    expect(body, 'sitemap must not list edit-job')
      .not.toMatch(/<loc>[^<]*\/edit-job/i);
  });

  // ---------- security.txt content audit ----------

  test('A12.security.txt has Contact + Expires fields', async () => {
    const r = await fetch(`${FRONTEND}/.well-known/security.txt`);
    if (!r.ok) return;
    const body = await r.text();
    expect(body, 'security.txt has Contact').toMatch(/^Contact:\s/im);
    expect(body, 'security.txt has Expires').toMatch(/^Expires:\s/im);
  });

  // ---------- Cloud-metadata service probes (SSRF defense indicator) ----------

  test('A12.cloud-meta backend does not proxy to AWS metadata', async () => {
    const r = await fetch(`${BACKEND}/api/jobs?limit=1`, {
      headers: {
        // Spoofed metadata header — should be ignored
        'X-Forwarded-For': '169.254.169.254',
        'X-Real-IP': '169.254.169.254',
      },
    });
    expect(r.status).toBe(200);
    const body = await r.text();
    expect(body, 'must not leak metadata').not.toMatch(/aws-metadata|169\.254/);
  });

  // ---------- Backup-extension probes on key files ----------

  for (const ext of ['.bak', '.swp', '~', '.orig', '.old']) {
    test(`A12.backup ${ext} on /index.html — not served`, async () => {
      const r = await fetch(`${FRONTEND}/index.html${ext}`);
      if (r.status === 200) {
        const ct = r.headers.get('content-type') || '';
        // SPA fallback to HTML is fine
        expect(ct, `if 200, must be HTML SPA fallback`).toMatch(/text\/html/i);
      } else {
        // JUSTIFIED: Combined — validator (400), wrong-role (403), or not-found (404).
        expect([400, 403, 404]).toContain(r.status);
      }
    });
  }
});
