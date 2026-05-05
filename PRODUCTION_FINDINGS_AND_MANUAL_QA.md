# Production findings + minimal manual QA

**Date:** May 5 2026
**Production URLs:** https://advance.al (Vercel) ⇒ https://advance-al.onrender.com (Render)

This file replaces the longer `MANUAL_QA_PRE_DEPLOY.md` with a tighter list:
what's been verified against the live production, what's broken, and what
you (the human) still need to do before launch.

---

## 🚨 Production issues found (must fix before launch)

### 1. Rate limit is NOT firing in production
**Severity: HIGH — credential stuffing + email-bombing risk**

I sent 18 consecutive wrong-password attempts to `https://advance-al.onrender.com/api/auth/login`. **All 18 returned 401, none returned 429.** Same with 8 consecutive `/api/auth/forgot-password` requests — all 200.

The code (`backend/src/routes/auth.js:129-141`) has correct `authLimiter` config (15 req / 15 min) and the skip logic (`NODE_ENV !== 'production' && SKIP_RATE_LIMIT === 'true'`) is defensively false in prod. `app.set('trust proxy', 1)` is also set (`server.js:88`).

**Most likely cause:** Render has multiple proxy hops, so `trust proxy: 1` makes `req.ip` resolve to a varying internal proxy IP — each request sees a different "client". `express-rate-limit` keys per-IP, so no single IP ever crosses the threshold.

**Fix to try (in priority order):**
1. Verify on Render dashboard that `SKIP_RATE_LIMIT` is **not set** (or explicitly `false`).
2. Bump trust-proxy to `2` or `'loopback, linklocal, uniquelocal'` and re-deploy. Test again with `for i in {1..18}; do curl -s -o /dev/null -w "%{http_code}\n" -X POST -H 'content-type: application/json' -d '{"email":"x@x.com","password":"wrong"}' https://advance-al.onrender.com/api/auth/login; done` — should see 429 by attempt 16.
3. If that doesn't work, switch the limiter's `keyGenerator` to use `req.headers['x-forwarded-for']?.split(',')[0]?.trim() ?? req.ip` to bypass the proxy unwrapping.
4. As a backstop, add a per-email limiter to `/login` and `/forgot-password` (already in place for `/initiate-registration`) — defense in depth.

**Verification once fixed:** 16th rapid attempt should return 429.

### 2. Render cold start is 45-68 seconds
**Severity: MEDIUM — UX problem, not security**

p99 latency on `/api/jobs` (a public read) is **68 seconds** when the dyno has been idle. p50 is fine (~1s); the long tail is entirely cold-start.

**Fix options:**
- Upgrade Render to "Starter" or paid tier (always-on) → ~$7/month
- Set up a 14-min ping (UptimeRobot, cron-job.org, or even Vercel Cron) hitting `/health` to keep the dyno warm. Free.

---

## ⚠️ Production findings (low severity, document and decide)

### 3. No MX records on `advance.al` root
Inbound mail to `contact@advance.al` (or any address `@advance.al`) goes nowhere. Only `send.advance.al` (Resend's sending subdomain) has MX records (pointing to AmazonSES feedback).

**Decide:** if you want to receive mail on `@advance.al`, you need to add MX records pointing to a mail provider (Google Workspace, Fastmail, etc.). If outbound-only via Resend is fine, ignore.

### 4. DMARC policy is `p=none`
Permissive — DMARC reports only, no enforcement. Acceptable for launch (you don't want to bounce legitimate mail before you've validated SPF/DKIM are working at scale). After ~2 weeks of clean reports, tighten to `p=quarantine` then `p=reject`.

### 5. No CAA records on `advance.al`
Anyone can request a Let's Encrypt cert for advance.al. Vercel handles certs for you, but adding a CAA record would limit issuance to your providers only:

```
advance.al. CAA 0 issue "letsencrypt.org"
advance.al. CAA 0 issue "digicert.com"
advance.al. CAA 0 iodef "mailto:keithjones240424@gmail.com"
```

Defense in depth, not blocking.

### 6. OpenAI lazy-init
`backend/src/services/openaiService.js:6-8` constructs the OpenAI client unconditionally. If `OPENAI_API_KEY` is missing/wrong on Render, every CV-generate request returns 500 instead of "service unavailable". Currently the route catch returns a generic 500 with no stack leak — acceptable but not ideal.

**Improve later:** add an early `if (!process.env.OPENAI_API_KEY) return res.status(503).json({ message: 'AI service not configured' })` guard at the top of `/api/cv/generate`.

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

### 30-minute manual QA checklist (mandatory before launch)

1. **Real Safari (macOS + iOS)** — 5 min
   - Open https://advance.al on real Safari (macOS) and real iPhone Safari
   - Verify: homepage renders, /jobs lists jobs, click into a job → detail page opens, click Apliko → login prompt
   - Look for: layout breaks, fonts not loading, white screens, JS errors in console (Develop menu)

2. **Real Resend email arrival** — 5 min
   - Register a new jobseeker on the live site
   - Confirm verification email arrives at your real email address (not test inbox)
   - Click the link / enter the code → registration completes
   - Look for: "from" address is reasonable (`*@advance.al` or `*@send.advance.al`), no spam folder placement, no broken images, link works from the email

3. **Forgot password round-trip** — 3 min
   - Click "Forgot password" → enter your email → receive reset email → click link → set new password → log in
   - Verify: new password works, old password doesn't, session is fresh

4. **Real Cloudinary upload** — 3 min
   - Log in as the registered user
   - Upload a profile photo via the profile page
   - Verify: photo appears in the UI, the URL is `https://res.cloudinary.com/...`, refresh page shows the same photo

5. **Real CV generation (OpenAI)** — 3 min
   - On profile, click "Generate CV with AI" → enter some natural language → wait for result (cold-start might take 60s+)
   - Verify: DOCX downloads, opens in Word/Pages, contains expected sections (name, summary, experience)
   - If 500 error, OPENAI_API_KEY is missing or wrong on Render

6. **Real Sentry capture** — 2 min
   - Log into Sentry dashboard for your project
   - Trigger an error on the live site (e.g., visit a known-broken admin route while logged in as wrong role; or use the in-flow "Test Error" button if exposed)
   - Verify: event appears in Sentry within ~1 minute

7. **Posting a job (employer flow)** — 5 min
   - Register as employer → admin approves → log in → post a job (4-step wizard) → publish
   - Verify: job appears on the public /jobs listing within seconds, search works, you can edit it, you can close it

8. **Real Twilio SMS (only if you have creds)** — 2 min
   - If `TWILIO_*` env vars are set on Render: phone-verify a user, verify SMS arrives on a real phone
   - If env vars are unset: skip — code auto-mocks

9. **Rate limit fix verification** (after you address finding #1) — 2 min
   ```sh
   for i in {1..18}; do
     curl -s -o /dev/null -w "%{http_code}\n" -X POST \
       -H 'content-type: application/json' \
       -d '{"email":"x@x.com","password":"wrong"}' \
       https://advance-al.onrender.com/api/auth/login
   done
   ```
   Expect: at least one 429 in the last 3 attempts.

**Total time: ~30 minutes if everything works first try; ~60 if you hit a rate-limit fix iteration.**

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

**Before launch:**
1. **Fix the rate limit.** This is the only HIGH severity finding.
2. **Decide on cold-start.** Either pay for Render Starter or set up a keep-warm ping.
3. Run the **30-minute manual QA** checklist above.

**Acceptable to defer:**
- DMARC tightening (after 2 weeks of clean reports)
- CAA records (defense in depth)
- OpenAI early-fail guard
- Inbound MX (only if you want `@advance.al` mailboxes)
