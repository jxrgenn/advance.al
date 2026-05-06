# Production findings + minimal manual QA

**Date:** May 5 2026 (v2 — fixes landed May 6)
**Production URLs:** https://advance.al (Vercel) ⇒ https://advance-al.onrender.com (Render)

This file replaces the longer `MANUAL_QA_PRE_DEPLOY.md` with a tighter list:
what's been verified against the live production, what's been fixed in code
(awaiting your deploy), and what you (the human) still need to do.

---

## ✅ Fixes that landed in code (commit `<TBD>`) — awaiting your `git push` + deploy

### 1. Rate limit fix (was the HIGH severity finding)
**Status: fixed in code, verified locally with `NODE_ENV=production`.**

Three changes:

a. **`backend/server.js:88`** — `app.set('trust proxy', true)` instead of `1`. Render uses multiple proxy hops; `trust proxy: 1` was making `req.ip` resolve to a varying internal proxy IP so per-IP rate limit never accumulated. With `true`, Express uses the leftmost (real-client) X-Forwarded-For entry. Render's edge overwrites X-Forwarded-For so it can't be spoofed.

b. **`backend/src/routes/auth.js`** — added two new per-email limiters as defense in depth:
   - `loginByEmailLimiter`: 10 wrong attempts / 15 min per email (regardless of source IP)
   - `forgotPasswordByEmailLimiter`: 3 reset emails / hour per target email
   
   These wire into `/login` and `/forgot-password` respectively, alongside the existing IP-level `authLimiter` (15/15min).

c. **`backend/src/routes/auth.js:131-140`** — added `validate: { trustProxy: false, xForwardedForHeader: false }` to silence `express-rate-limit` v8's check (we've made our own informed choice).

**Local verification (with `NODE_ENV=production` + `SKIP_RATE_LIMIT=false`):**
```
attempts 1-10 → 401 (wrong password)
attempt   11+ → 429 (per-email limiter fires)

forgot-password attempts 1-3 → 200
forgot-password attempts   4+ → 429
forgot-password different email → 200 (counter is per-email, independent)
```

Backend Jest auth suites: 36/36 still pass — no regressions.

**Verify after deploy:**
```sh
for i in {1..12}; do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST \
    -H 'content-type: application/json' \
    -d '{"email":"x@x.com","password":"wrong"}' \
    https://advance-al.onrender.com/api/auth/login
done
```
Expect 401 ten times, then 429.

### 2. Render cold-start fix (was the MEDIUM finding)
**Status: fixed via GitHub Actions cron.**

Added `.github/workflows/keep-warm.yml` — pings `/health` every 10 minutes via free GitHub Actions cron. Render's hobby tier sleeps after 15 min idle; pinging at 10-min keeps the dyno warm. **Costs $0.** You can delete this workflow if you ever upgrade to Render Starter (always-on).

Activates automatically once the workflow file is on `main`. Double-check after merge: GitHub repo → Actions tab → "Keep Render backend warm" — should show scheduled runs starting within ~10 min.

### 3. OpenAI early-fail guard
**Status: fixed.**

`backend/src/routes/cv.js:32` and `backend/src/routes/users.js:804` (parse-resume) now return `503 Service Unavailable` with a clear Albanian message if `OPENAI_API_KEY` is missing on Render, instead of generic 500s.

---

## ⚠️ Open items requiring YOUR decision (DNS — I can't do these)

### 4. No MX records on `advance.al` root
Inbound mail to `contact@advance.al` goes nowhere. Only `send.advance.al` (Resend's sending subdomain) has MX (pointing to AmazonSES feedback) — outbound is fine.

**Decide:** if you want a `@advance.al` mailbox, add MX records via your DNS host (host.al). If outbound-only via Resend is enough, ignore.

### 5. DMARC policy is `p=none` (permissive)
Acceptable for launch. After ~2 weeks of clean Resend reports, tighten via host.al's DNS panel:
```
_dmarc.advance.al. TXT "v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@advance.al;"
```

### 6. No CAA records on `advance.al`
Defense in depth — restrict cert issuance to known providers. Add via host.al:
```
advance.al. CAA 0 issue "letsencrypt.org"
advance.al. CAA 0 issue "digicert.com"
```
Not blocking.

---

## ✅ Production things that ARE working

| Check | Result |
|---|---|
| HTTPS + HSTS preload | ✅ `max-age=63072000; includeSubDomains; preload` |
| CSP | ✅ comprehensive, allows Sentry + Cloudinary + Google Fonts |
| `X-Frame-Options: DENY` | ✅ |
| `X-Content-Type-Options: nosniff` | ✅ |
| `Permissions-Policy` | ✅ camera/geo/mic etc. all `()` |
| `Referrer-Policy: strict-origin-when-cross-origin` | ✅ |
| Frontend routes (12) | ✅ all 200 (SPA — React Router renders) |
| Backend public endpoints (`/health`, `/api/jobs`, `/api/locations`, `/api/stats/public`, `/api/companies`) | ✅ all 200 |
| Auth-protected endpoints (`/api/users/profile`, `/api/admin/*`, `/api/notifications`, etc.) | ✅ all 401 without token |
| NoSQL injection in body | ✅ 400 with validation error |
| Invalid JWT (alg:none, garbage) | ✅ 401 |
| Long input (100k chars) | ✅ no 5xx |
| Method tampering (TRACE / PUT / DELETE on collections) | ✅ 405/404 |
| `?sortBy=__proto__` prototype-pollution | ✅ 403 |
| Backend `redis: connected` | ✅ Upstash Redis live |
| Resend DNS (DKIM, SPF, MX on send.advance.al) | ✅ valid |
| 200 sequential reads, 0 errors | ✅ |
| Sentry init guarded | ✅ no-op when DSN unset |
| Resend init refuses to start in prod with `EMAIL_TEST_MODE=true` | ✅ |
| Cloudinary feature gated on env presence | ✅ |
| Twilio auto-mocks when env unset | ✅ |
| Stack traces stripped in prod responses | ✅ |
| Prod `NODE_ENV=production` (verified via `/health` response shape) | ✅ |

---

## What I CAN'T verify automatically (your job)

These need human eyes / real device / real account on a paid third-party service:

### 25-minute manual QA checklist

1. **`git push` + Render auto-deploys + Vercel auto-deploys** — 5 min wait
   The Render dashboard shows the deploy progress. After it goes green, run the smoke-test below.

2. **Rate-limit smoke (verifies my fix landed)** — 1 min
   ```sh
   for i in {1..12}; do
     curl -s -o /dev/null -w "%{http_code}\n" -X POST \
       -H 'content-type: application/json' \
       -d '{"email":"x@x.com","password":"wrong"}' \
       https://advance-al.onrender.com/api/auth/login
   done
   ```
   Expect: ten `401`, then `429 429`. If you don't see 429 by the 12th, the trust-proxy fix isn't enough — ping me back with the output and I'll switch to a custom keyGenerator.

3. **Real Safari (macOS + iOS)** — 5 min
   - Open https://advance.al on real macOS Safari and real iPhone Safari
   - Verify: homepage renders, /jobs lists jobs, click a job → detail page opens, click Apliko → login prompt appears
   - Watch for: layout breaks, fonts missing, white screens. Open Develop → JavaScript Console for errors.

4. **Real Resend email arrival** — 5 min
   - Register a new jobseeker on the live site
   - Confirm verification email arrives at your real address (`from: noreply@advance.al` or `noreply@send.advance.al`)
   - Enter the code → registration completes → land on dashboard

5. **Forgot password round-trip** — 3 min
   - "Forgot password" → enter email → receive reset email → click link → set new password → log in
   - Verify: new password works, old doesn't

6. **Real Cloudinary upload** — 3 min
   - Log in as the registered user → upload profile photo
   - Verify: URL is `https://res.cloudinary.com/...`, photo persists across refresh

7. **Real CV generation (OpenAI)** — 3 min
   - Profile → "Generate CV with AI" → ~60s wait (cold start absorbed by keep-warm cron after deploy)
   - Verify: DOCX downloads, opens in Word/Pages
   - If you get `503 Skanimi i CV-së me AI nuk është i disponueshëm`: `OPENAI_API_KEY` missing on Render — set it in the dashboard

8. **Real Sentry capture** — 2 min
   - Sentry dashboard open → trigger any error on the live site (visit `/admin` as a jobseeker, or hammer rate limit until 429 → that's also captured)
   - Verify event appears within ~1 min

9. **Employer post-job flow** — 5 min
   - Register as employer → admin approves → log in → post a job (4-step) → publish
   - Verify: job appears on /jobs immediately, search finds it, edit/close work

**Total: ~25 min if everything works first try.**

Skip-able if you don't have creds:
- Twilio SMS — auto-mocks when env unset
- Sentry capture — only if you've enabled it

---

## What I've covered automatically (you can skip these)

- 4,320 cross-browser test runs (864 × 5 browsers: chromium, firefox, webkit, mobile-chrome, mobile-safari) — green
- Backend Jest suite, exploration suite, real-E2E suite, walker, phase-14 — green
- XSS sanitization on every user-input field (44 payload tests) — green and **assertions tightened** (no more silent skips on rejection paths)
- NoSQL injection, JWT tampering, CRLF email injection — green and **tightened**
- Concurrency stress: refresh-token cap, jobCount race, escalation race — green and **tightened** (CS.7 now requires all N messages, not N-2)
- Production smoke: 12 frontend routes, 6 public backend endpoints, 8 auth gates, input fuzzing, method tampering — all green except finding #1 (rate limit)
- DNS audit, security headers, TLS, Resend DKIM/SPF — verified on live domain
- Production load test: 200 reqs at concurrency 10 → 0 failures, p50 967ms

---

## TL;DR

**What I fixed (already in code, awaiting your `git push`):**
1. ✅ Rate limit — `trust proxy: true` + per-email limiters on /login (10/15min) and /forgot-password (3/hr). Verified locally.
2. ✅ Render cold start — GitHub Actions cron pings /health every 10 min. Free.
3. ✅ OpenAI failure mode — 503 with clear message instead of 500.

**What you do (~25 min):**
1. `git push` (Render + Vercel auto-deploy from main)
2. Run the 25-min manual QA checklist above. Step 2 (rate-limit smoke) is the only one that's purely automatable; the rest need your eyes / real devices / real-cred services.

**Acceptable to defer / decide later:**
- DMARC tightening (after 2 weeks of clean reports — I'll remind you)
- CAA records (defense in depth)
- Inbound MX (only if you want `@advance.al` mailboxes)
- Render Starter upgrade (only if cold-start cron stops being enough)
