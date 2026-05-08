# Manual QA Checklist — Pre-Launch

Everything Claude could automate is in CI (`npm test`, `npm run loadtest`,
`npm run soak`, e2e suite, security suite). This document covers what needs
**human eyes, real devices, real third-party accounts, or real Albanian
context** that an automated suite cannot judge.

Run through this top-to-bottom before flipping the production switch. Mark
each item ✅ or ❌ in the checkbox. If anything is ❌, fix before launch.

---

## 0. One-time setup (do once)

- [ ] Production domain registered + DNS pointed at Render/Vercel
- [ ] SSL certificate auto-renewing (Let's Encrypt or platform-managed)
- [ ] Production env vars set in Render dashboard:
  - [ ] `MONGODB_URI` (Atlas, M10+)
  - [ ] `JWT_SECRET` (≥64 random chars, NOT the dev one)
  - [ ] `JWT_REFRESH_SECRET` (different from JWT_SECRET)
  - [ ] `RESEND_API_KEY` (production key, NOT test)
  - [ ] `EMAIL_FROM` set to `noreply@advance.al` (NOT `*.resend.dev`)
  - [ ] `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` (prod)
  - [ ] `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` (free tier OK at launch)
  - [ ] `SENTRY_DSN` for backend
  - [ ] `EMAIL_TEST_MODE=false` (CRITICAL — code refuses to start with this true in prod)
  - [ ] `NODE_ENV=production`
  - [ ] `OPENAI_API_KEY` (production budget cap set)
  - [ ] `PAYSERA_*` (when payment is wired)
- [ ] Backup strategy verified: take a full Atlas backup, restore to a
      throwaway cluster, confirm collections + counts match
- [ ] Sentry receives a test error from each environment (dev / staging / prod)

## 1. Account flows — full register → use → delete (run on real prod-like env)

### Jobseeker
- [ ] Register with a fresh email — receive verification code in real Gmail
      inbox within 60s
- [ ] Verify code, land on profile page, autofill check
- [ ] Upload a real PDF CV (>1MB, <5MB) — confirm renders in profile page
      AND in employer's view of the application
- [ ] Upload a real DOCX CV — same checks; confirm browser preview works
      (uses mammoth.js to render DOCX as HTML)
- [ ] Apply to a live job — application appears in "My Applications"
- [ ] Receive employer's status-change email (shortlisted) in real inbox
- [ ] Reply to the message thread — employer sees it
- [ ] Trigger forgot-password — receive reset link in inbox, open on real
      device, complete flow
- [ ] Delete account from settings — verify all PII gone (export GDPR data
      first, save the JSON, then delete)

### Employer
- [ ] Register as employer with company info
- [ ] Verify email, complete employer profile
- [ ] Upload company logo — appears on job cards
- [ ] Post a real job with all fields filled
- [ ] Receive notification when first jobseeker applies
- [ ] View application, change status to "shortlisted" → "hired"
- [ ] Send message to applicant
- [ ] Mark expired job → renew via API
- [ ] Delete a job — confirm soft-delete (not visible to public, still in admin view)

### Quickuser
- [ ] Sign up via the lightweight quickuser form (email + interests)
- [ ] Receive welcome email
- [ ] Upgrade to full account flow — historical applications carry over

### Admin
- [ ] Log in as admin
- [ ] Access admin dashboard, all tabs render
- [ ] Suspend a user — they receive suspension email; cannot log in
- [ ] Lift suspension — they can log in again
- [ ] Ban a user — same flow with permanent
- [ ] Approve / reject pending jobs (if `require_job_approval=true`)
- [ ] View moderation reports queue
- [ ] Resolve a report

## 2. Real device matrix

Each flow above on at least:
- [ ] iPhone (Safari, latest iOS)
- [ ] Android (Chrome, latest)
- [ ] iPad (Safari)
- [ ] Desktop Chrome (1920×1080)
- [ ] Desktop Safari (latest macOS)
- [ ] Desktop Firefox (latest)
- [ ] Desktop Edge (latest)
- [ ] Small laptop (1366×768) — most common Albanian desktop res

### Specific viewport regression points
- [ ] Job-card grid wraps cleanly at 360px width (oldest target Android)
- [ ] Mobile nav menu opens and closes
- [ ] CV upload picker opens on mobile (some Safari versions block file pickers)
- [ ] Modal scrolling works on iPhone SE (smallest viewport)
- [ ] Date pickers usable on mobile

## 3. Email rendering (real inbox checks — automated suite only checks send)

- [ ] Welcome email in **Gmail web** — Albanian characters render, CTA button works
- [ ] Welcome email in **Apple Mail desktop** — layout, links, images
- [ ] Welcome email in **Android Gmail app** — layout doesn't break
- [ ] Welcome email in **Outlook web** (Microsoft 365) — Outlook strips some CSS
- [ ] Password reset link works after clicking from email (token lifetime check)
- [ ] Application notification email — links lead to correct application
- [ ] Bulk announcement email — unsubscribe link works
- [ ] Status change email — Albanian status names ("E shqyrtuar", "Përzgjedhur") render
- [ ] Email-verification code is large enough to read without zoom
- [ ] Unsubscribe link in jobseeker emails actually unsubscribes (verify in DB)

## 4. Albanian content + i18n

- [ ] Job titles with Ç, Ë, ç, ë render correctly everywhere
- [ ] Search by Albanian-only keyword finds matching jobs
- [ ] Date formatting is Albanian ("15 Janar 2026" not "January 15, 2026")
- [ ] Currency is EUR (with Lek conversion if added) — formatted per Albanian conventions
- [ ] Month names in dropdowns are Albanian
- [ ] Validation error messages are Albanian, grammatically correct
- [ ] Email signatures and CTAs are natural Albanian (have a native speaker review)

## 5. Cloudinary console verification (during/after testing)

- [ ] Log into Cloudinary dashboard
- [ ] Verify uploads went to the production cloud (not the dev one)
- [ ] Verify storage usage well under free-tier limits (25GB)
- [ ] Verify delete operations actually removed orphaned files
- [ ] Quota dashboard shows expected vs actual usage
- [ ] No public folder leaks (all uploads under `advance-al/...` prefix)

## 6. SMS — KNOWN GAP

Twilio is NOT configured. SMS code paths exist but are mocked. Before
enabling SMS in production:
- [ ] Provision Twilio account
- [ ] Add `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE` env vars
- [ ] Test SMS verification with a real Albanian number (+355...)
- [ ] Test SMS rate-limiting per phone number (currently uses email limiter)
- [ ] Verify SMS billing dashboard shows expected volume
- [ ] Set Twilio spend cap

## 7. Performance under realistic conditions

Run these manually with browser DevTools network throttling:

- [ ] 3G Slow throttle: home page TTFB < 3s, full load < 8s
- [ ] 4G throttle: home page TTFB < 1s, full load < 3s
- [ ] CPU 4× slowdown: page interaction (job filter) feels usable, no jank
- [ ] Lighthouse Mobile score: Performance ≥ 80, Accessibility ≥ 90,
      Best Practices ≥ 90, SEO ≥ 90
- [ ] No layout shift on main pages (CLS < 0.1)
- [ ] Hero image LCP < 2.5s on 4G

## 8. Production deploy dry-run

- [ ] Deploy to a staging branch first
- [ ] Run e2e suite against staging URL (`STAGING_URL=... npm test:e2e`)
- [ ] Run prod-smoke playwright suite against staging
- [ ] Manual smoke test: register, apply, message
- [ ] Check Render logs for warnings/errors on first 100 requests
- [ ] Check Sentry — no alerts in first hour
- [ ] Verify health endpoint returns 200 on staging
- [ ] Verify CORS allows production frontend domain (and ONLY that)
- [ ] Verify CSP report-uri receives reports if set up

### 8a. Trust-proxy / req.ip verification (ultrareview bug_005 follow-up)

The `trust proxy` setting in `server.js` is currently
`'loopback, linklocal, uniquelocal'` — Express's allowlist for
private/loopback IPs. This closes the easy spoofing path BUT does NOT
fully protect if Render's edge IP is itself in the private allowlist
(then a spoofed leftmost XFF entry is still surfaced as `req.ip`).

To finish closing this on production, add a temporary debug endpoint
to staging:
```js
app.get('/__debug/xff', (req, res) => res.json({
  xff: req.headers['x-forwarded-for'],
  ips: req.ips,
  ip: req.ip,
}));
```

- [ ] Hit `/__debug/xff` from a real browser → record `req.ip` and `req.ips`
- [ ] Hit it again with `curl -H "X-Forwarded-For: 1.2.3.4" ...` from outside Render
  - If `req.ip === "1.2.3.4"` → **Render appends, spoofing IS possible.** Fix: replace the allowlist with a Render-edge CIDR list, or pin `trust proxy` to the integer hop-count Render adds (likely 1 or 2; verify via `req.ips.length`)
  - If `req.ip === your real client IP` → Render strips client XFF, current setting is safe
- [ ] Either way: remove `/__debug/xff` after this verification

## 9. Payment flow (Paysera, when wired)

- [ ] Create real test transaction with Paysera test credentials
- [ ] Confirm callback URL receives the IPN
- [ ] Failed payment is handled cleanly (no orphan order)
- [ ] Refund flow works
- [ ] Receipts are emailed
- [ ] Currency formatting matches Albanian conventions

## 10. Visual + UX inspection

(These can't be automated — they need a designer or PM eye)
- [ ] Empty states have helpful copy + CTA (no "you have 0 X" without next step)
- [ ] Loading states are present everywhere a network call is made
- [ ] Error messages tell user what to do, not just what went wrong
- [ ] Success messages are clearly visible (not buried)
- [ ] Forms validate inline, not only on submit
- [ ] No broken image icons
- [ ] No "undefined" or "[object Object]" leaking into UI
- [ ] Consistent spacing / typography across pages
- [ ] Brand colors used consistently
- [ ] Logo aligned + sized correctly across pages

## 11. Security spot-checks (post-CI suite)

The CI security suite is comprehensive. Verify these manually too:
- [ ] HTTPS-only — no plain `http://` resources loaded
- [ ] HTTPS redirect at LB / Render config (no http:// at all)
- [ ] HSTS header present (helmet config)
- [ ] CSP header present and strict
- [ ] No source maps deployed to production
- [ ] No `.env` accessible at any URL (try `https://advance.al/.env`)
- [ ] No `/admin` accessible without auth (try as logged-out user)
- [ ] Test `?<script>alert(1)</script>` in every search bar (XSS smoke)
- [ ] Sentry is NOT logging PII (verify by triggering a 500 with email in body)

## 12. Data integrity post-launch

After 24h of real traffic:
- [ ] Spot-check 5 random user accounts in DB — fields look correct
- [ ] Spot-check 5 random applications — references intact
- [ ] No "ghost" jobs (status=active but expiresAt past)
- [ ] No orphan resumes in Cloudinary (no User reference)
- [ ] Daily backup succeeded
- [ ] No abnormal spike in error rate vs baseline

---

## What's already automated (don't redo)

| Area | Where |
|---|---|
| Backend unit tests | `backend/tests/unit/` (50 files, ~810 tests) |
| Backend integration tests | `backend/tests/integration/` (215+ files, ~1924 tests) |
| Race conditions | `backend/tests/integration/concurrency-race-conditions.test.js` |
| Rate-limit attacker patterns | `backend/tests/integration/rate-limit-attacker-patterns.test.js` |
| Deep injection fuzz | `backend/tests/integration/security-deep-fuzz.test.js` |
| Adversarial security | `backend/tests/integration/phase-15/security-adversarial.test.js` |
| Performance baselines | `backend/tests/integration/phase-20/performance-baselines.test.js` |
| Real Cloudinary | `backend/tests/integration/cloudinary-real.test.js` |
| Real OpenAI snapshot replay | `backend/tests/integration/openai-real/` |
| Frontend e2e | `frontend/e2e/tests/` (Playwright, real backend) |
| Frontend security e2e | `frontend/e2e/security/` |
| Frontend prod-smoke | `frontend/e2e/prod-smoke/` |
| Load test | `npm run loadtest` |
| Soak (memory leak) | `npm run soak` |

## How to run the load + soak tests yourself

```
cd backend

# Default 30s burst at 50 clients
npm run loadtest

# Custom: 60s burst at 100 clients
LOAD_DURATION_S=60 LOAD_CONCURRENCY=100 npm run loadtest

# Default 30 min soak at 10 clients
npm run soak

# Quick 5-min soak smoke test
SOAK_DURATION_MIN=5 SOAK_WARMUP_MIN=1 npm run soak
```

Treat `[FAIL]` exit codes as a release blocker.
