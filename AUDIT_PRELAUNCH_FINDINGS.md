# Pre-deployment audit — findings

**Date:** 2026-05-18
**Scope:** Entire stack (~13k LOC backend, 174 features, OpenAI / Cloudinary / Resend / Paysera / Upstash Redis / Sentry / MongoDB Atlas, frontend React/TS/Vite, test suite).
**Method:** Three parallel `Explore` reconnaissance agents (backend security surface, third-party integrations, test honesty + frontend security), each instructed to ignore existing audit conclusions and re-verify. Their findings were then **manually verified** against the actual code by reading the specific files/lines — about a third of the agent claims were over-stated and have been demoted; the rest are real and listed below.

The user's working assumption — "tests all pass therefore something is wrong with them" — turned out to be **correct**: 441 permissive `expect([...]).toContain(...)` matchers exist (≈275 with `// JUSTIFIED:` comments, the rest grandfathered into a CI gate that only blocks NEW violations). Coverage thresholds are configured but not enforced because the CI script pipes Jest output through `tail` and swallows the non-zero exit code.

---

## TL;DR — what needs doing before deploy

| # | Severity | Item | Status |
|---|----------|------|--------|
| 1 | **HIGH** | Paysera callback doesn't validate `amount` against the server-stored `paymentRequired`. Defence-in-depth — currently safe because forging the callback requires the sign_password, but trivial 5-line fix. | **Will fix this session** |
| 2 | **HIGH** | `auth.js:540` logs user email on QuickUser→FullUser conversion (PII leak to log aggregators). | **Will fix this session** |
| 3 | **HIGH** | `verification.js:455` (`/validate-token`) uses string equality on a 32-byte hex token (theoretical timing oracle, defence-in-depth). | **Will fix this session** |
| 4 | **HIGH** | `/auth/change-password` has only the global limiter — no per-user cap. With a stolen short-lived JWT, an attacker can brute-force `currentPassword` (bcrypt-slow but uncapped). | **Will fix this session** |
| 5 | **HIGH** | No daily cost cap on OpenAI usage. CV generation is capped at 5/hr/user but no daily ceiling; embedding regeneration is uncapped (a user can churn their profile to force constant regen). | **Will fix this session** |
| 6 | **HIGH (architectural)** | JWT + refresh token stored in `localStorage`. Two `dangerouslySetInnerHTML` sinks exist (`chart.tsx` developer-controlled, `BlogArticle.tsx` static-but-unsanitized). One XSS = full account takeover. | **Needs your decision** |
| 7 | **HIGH (architectural)** | Cloudinary uploads default to public access mode + filenames embed userId (guessable). Resumes uploaded to advance.al are publicly viewable by URL. Also: Cloudinary assets are NEVER deleted on account purge (`accountCleanup.js:117` literally returns early for any URL containing `cloudinary.com`). | **Needs your decision** |
| 8 | **HIGH (architectural)** | `/api/users/resume/:filename` accepts the JWT in a query string (`?token=`). Tokens end up in CDN/proxy logs and browser history. | **Needs your decision (short-lived download token)** |
| 9 | **MEDIUM** | Multi-instance Render deploy → `express-rate-limit` uses in-memory state, so each instance counts independently. A user gets `N×limit` per period in a multi-instance fleet. Same for the verification-code in-memory fallback (cross-instance miss possible). | Document for now |
| 10 | **MEDIUM** | OpenAI snapshot replay (`tests/helpers/openai-snapshot.js`) hashes params (SHA256 first 16 chars) but doesn't validate that a cached response actually corresponds to the current request — a prompt change with a hash collision returns a stale answer silently. | Will fix in test-honesty batch |
| 11 | **MEDIUM** | No test for refresh-token replay/reuse after rotation. | Will fix in test-honesty batch |
| 12 | **MEDIUM** | `BlogArticle.tsx:104` renders `article.bodyHtml` via `dangerouslySetInnerHTML` with zero sanitization. Articles are static + committed, so currently safe, but adding DOMPurify is defence-in-depth (cheap). | Will fix |
| 13 | **MEDIUM** | Several pages access `localStorage.getItem('authToken')` directly instead of going through `lib/api.ts`. Risky pattern if URLs become dynamic — token could be sent cross-origin. | Will fix |
| 14 | **MEDIUM** | `/api/seo` bot prerender — reachable by anyone sending a Google/Bing UA. Need to confirm it doesn't accept a `path` parameter that could trigger SSRF or path-traversal on the server. | Needs investigation |
| 15 | **LOW** | Admin error handlers use `process.env.NODE_ENV === 'development'` instead of `!== 'production'`. If `NODE_ENV` is unset (typo on Render), raw `error.message` leaks. Admin-only so low blast radius. | Will fix in cleanup batch |
| 16 | **LOW** | `/api/verification/request` + `/status` enumerate registered emails. **Deliberate UX choice per `NEXT_SESSION.md`** — deferred to a product discussion. | Tracked, no action this session |
| 17 | **LOW** | `applications.js:131-182` duplicate-application check-then-insert TOCTOU window. Mitigated by unique partial index that guarantees no double-write; UX may show a confusing error during the race. | No action |
| 18 | **LOW** | Twilio (SMS) code path exists but no Twilio account provisioned and zero tests. Acceptable per `EXTERNAL_SERVICE_GAPS.md` — SMS is not a live feature. | Tracked, no action |
| 19 | **LOW** | `customQuestions` mass-assignment on PUT /jobs/:id — schema-validated but no field allowlist on sub-keys. Owner-only, no privilege escalation. | Tracked |
| 20 | **LOW** | Several admin test routes in `notifications.js` accept body ObjectIds without `validateObjectId` — CastError → 500 instead of 400. Admin-only. | Will fix in cleanup batch |

**441 permissive test matchers** is its own line-item (and arguably the most damning finding overall — see section "Test honesty" below).

---

## Findings I demoted from the agent reports

These were flagged as CRITICAL/HIGH by the recon but **don't hold up under verification**:

- **"Secrets leaked into the repo via .env"** — false. `.gitignore` (lines 17-25) explicitly excludes `backend/.env` and `frontend/.env`. `git ls-files` confirms only `*.env.example` is tracked. The credentials are on disk but were never committed. (Separate concern: `LAUNCH_DAY.md` says `ADMIN_PASSWORD` + `RESEND_API_KEY` leaked into prior chat transcripts. **Those still need rotation in Render**, but that's a UI-only task you have to do.)
- **"BlogArticle.tsx XSS"** — over-stated. Article HTML comes from `frontend/api/_lib/articles/*.js`, which is git-tracked static code. There is no user-editable path. Still worth adding DOMPurify as defence-in-depth (MEDIUM), but not the CRITICAL the agent labeled it.
- **"chart.tsx XSS"** — over-stated. The `dangerouslySetInnerHTML` there writes computed CSS from a developer-supplied palette. No user input flows in.
- **"customQuestions mass-assignment"** — owner can only mass-assign onto their own job. No IDOR. Schema validates types.
- **"Sentry frontend DSN"** — DSNs are public by design. Not a leak.

The Paysera amount-tamper claim from agent 2 was initially in this demoted list, then re-promoted after I read `payments.js:240-401` directly: lines 258 parses `amountCents` from the callback, logs it (line 308, 324, 347), but **never compares it to `job.paymentRequired`** before flipping the job to active on line 333. Confirmed real.

---

## Detailed findings by area

### Backend — auth/authz
- ✅ `authenticate` middleware (`backend/src/middleware/auth.js`) pins JWT to HS256, strips password on `findById`, applies suspension/ban checks. Good.
- ✅ Every mutating route gates with `requireAdmin` / `requireEmployer` / `requireJobseeker` (consistent helpers in `auth.js`). No IDORs found.
- ✅ Every `:id` param is `validateObjectId`'d on mutations. Spot-checked admin/applications/jobs/quickusers.
- ✅ Regex search uniformly uses `escapeRegex`. No NoSQL injection vectors found in the spread queries (operators never sourced from user input).
- ⚠️ `auth.js:540` logs email on QuickUser conversion. **HIGH** — fix.
- ⚠️ `/auth/change-password` has no per-user limiter (item #4). **HIGH** — fix.
- ⚠️ Several admin error handlers use `=== 'development'` ternary on NODE_ENV (item #15). **LOW** — fix in cleanup.

### Backend — file uploads
- ✅ Magic-byte validation on every upload path (PDF/DOCX/DOC for resumes, JPEG/PNG/WebP for images). Confirmed in `users.js:115-139` and `quickusers.js:50`.
- ✅ Size limits enforced (5MB resume, 2MB image).
- ✅ Path-traversal protection on the local-disk resume serve path (`users.js:1935-1944`).
- ⚠️ Cloudinary uploads default to public mode (item #7). Resume URLs are publicly enumerable if anyone leaks one.
- ⚠️ Account-cleanup explicitly skips Cloudinary URLs (`accountCleanup.js:117`: `if (filePath.includes('cloudinary.com') || filePath.includes('http')) return;`) — files persist forever after account deletion. **GDPR concern**.

### Backend — workers & crons (`server.js:402-506`)
8 scheduled tasks: suspension lift (15min), job expiry (1hr), data retention (1/day), job-alert digest (15min configurable), embedding retry (10min), payment reminder (1hr), payment timeout (1/day), account purge (1/day). All idempotent. No race-condition concerns with a single instance. **Multi-instance risk:** none of them are leader-elected — if Render runs two instances, both will fire each cron. Low practical risk because each one has a "did we already do this" check, but worth knowing.

### Third-party — OpenAI
- `services/openaiService.js` (CV generation, gpt-4o-mini) and `services/jobEmbeddingService.js` (`text-embedding-3-small`).
- ✅ Per-user CV rate limit 5/hr (`cv.js:18-29`).
- ✅ Retry with exponential backoff on 429/500.
- ✅ Output parsed with structured-output (Zod schema enforced).
- ⚠️ **No daily $ cap.** A malicious user can do 5/hr × 24 = 120 CV generations/day = ~$0.12/day each (at gpt-4o-mini pricing). With 100 attacking users: $12/day. Not catastrophic but trivial to bound. **HIGH** — fix.
- ⚠️ **Embedding regen has no per-user cap.** Updating a profile triggers a regen. A user updating their bio 1000×/day → 1000 embeddings × $0.00002 = $0.02. Aggregated across a botnet this gets uglier.
- ⚠️ Prompt injection: user CV text flows straight into the prompt. OpenAI's structured-output mode largely defends this, but defence-in-depth would benefit. **LOW**.

### Third-party — Cloudinary
- See items #7 above. Two real issues: public access mode by default, plus zero cleanup on account purge.

### Third-party — Resend
- ✅ HTML templates use `escapeHtml()` on every user-supplied field. No XSS-via-email.
- ✅ Password reset has `forgotPasswordByEmailLimiter` (3/hr/email) per `auth.js:29`.
- ✅ Test-mode redirect is hard-crashed in production (`resendEmailService.js:37-46`).
- ⚠️ No global per-day send cap. With Resend at ~$0.0001/email, abuse cost is bounded by the per-email limiter anyway.

### Third-party — Paysera
- ✅ Signature verification uses `crypto.timingSafeEqual`.
- ✅ Idempotency via `job.paymentId === requestid` check.
- ✅ `PAYSERA_ALLOW_FAKE_SUCCESS` gated on env, only activates when keys missing.
- ✅ Soft-deleted jobs aren't resurrected by an inbound callback (returns "OK" but skips activation).
- ⚠️ **Callback amount is logged but never compared to `job.paymentRequired`** (item #1). **HIGH** — fixing this turn.
- ⚠️ Refund flow not implemented (deferred per `NEXT_SESSION.md`).

### Third-party — Upstash Redis
- ✅ Gracefully degrades to in-memory when env vars unset.
- ⚠️ In-memory map is per-process. On multi-instance Render: verification code stored on instance A is invisible to instance B → user retry on B fails. Documented.
- ⚠️ `express-rate-limit` uses default in-memory store. On multi-instance: per-IP/per-user limits effectively multiplied by instance count.

### Frontend — auth token storage
- JWT + refresh token both in `localStorage` (`lib/api.ts:231-241`).
- Cleared on logout. Good.
- ⚠️ XSS-readable. The two `dangerouslySetInnerHTML` sites are currently safe (static / developer-controlled), but the architecture is fragile. **Migration to httpOnly cookies is the right long-term answer** — but it's a meaningful change (backend cookie-setting, frontend interceptors, CORS `credentials: true` already present). Flagging for your decision.

### Frontend — XSS sinks
- Two `dangerouslySetInnerHTML` sites in the entire codebase:
  - `frontend/src/components/ui/chart.tsx:70` — developer-supplied color palette → `<style>` tag. Safe today.
  - `frontend/src/pages/BlogArticle.tsx:104` — static article HTML. Safe today.
- Zero `innerHTML`, `eval`, `new Function`, or `setTimeout(string,...)` uses.

### Frontend — CSP (`vercel.json:59-61`)
- ✅ `default-src 'self'`, `script-src 'self'` (no `unsafe-inline`/`unsafe-eval`), `frame-ancestors 'none'`, `form-action 'self'`, `object-src 'none'`.
- ⚠️ `style-src 'unsafe-inline'` — CSS exfiltration attacks possible but limited; would need to migrate Tailwind/Mantine inline styles to a hashed pattern to tighten.

### Test honesty
- **441 permissive matchers**, of which 275 carry `// JUSTIFIED:` per the Phase-28 sprint convention.
- The remaining **166** were grandfathered through the CI gate (`scripts/check-test-genuineness.sh`) — the gate only fails on **new** violations, so historical theatre is locked in.
- **`coverageThreshold`** in `backend/jest.config.js` is set to 80% across the board, but per `TESTING_BASELINE.md` the *actual* coverage is statements 57%, branches 43%, lines 59%, functions 63%. The gate doesn't fail CI because Jest output is piped through `tail` which swallows the non-zero exit.
- **OpenAI snapshot replay** (`tests/helpers/openai-snapshot.js:95`) returns cached responses without validating that the cached request matches the current request. Hash collision = silent stale answer.
- **Missing test**: refresh-token reuse-after-rotation. The auth-negatives suite covers alg:none, wrong-secret, expired — but not the replay-after-rotation case.
- **9 strong security tests** are present and assert specifically: JWT alg:none, wrong-secret, expired, tenant-isolation (3-way), Paysera signature, path-traversal, file-upload mime disguise, admin-route-by-jobseeker.

---

## Plan — what's getting fixed and when

### This session (going to do now)
- Paysera callback amount validation (item #1)
- PII in log → drop email field (item #2)
- `/validate-token` timing-safe compare (item #3)
- `/change-password` per-user limiter (item #4)
- OpenAI daily cost cap on both CV gen + embedding regen (item #5)
- Cleanup: `=== 'production'` hardening (item #15) + ObjectId validation on admin test routes (item #20)
- Each fix: backend test against running server, then commit.

### Pending your decision
- **#6 JWT storage**: localStorage → httpOnly cookies. ~half-day of work (backend issues `Set-Cookie`, frontend stops attaching `Authorization` header, CORS already permits credentials). Wanted to flag because it touches auth on both sides.
- **#7 Cloudinary access mode**: switch resume uploads to `type: 'authenticated'` + signed URLs OR keep public + use unguessable suffix. The first is correct, the second is a 1-hour fix. Also need to wire Cloudinary destruction into `accountCleanup.js`.
- **#8 Resume `?token=` query auth**: replace with short-lived single-use download tokens (server signs a JWT with `{filename, exp:5min}` on demand, route accepts only that). ~1 hour.
- **#14 `/api/seo` SSRF audit**: need to read the function (likely at `frontend/api/seo.js` or `frontend/src/api/seo.ts`) and verify path-param sanitization.

### Next session (after your sign-off on the bigger items)
- Test honesty: tighten the 166 unjustified matchers in security-named suites; fix CI coverage gate (don't pipe Jest through `tail`); add OpenAI snapshot param-validation; add refresh-token replay test.
- Frontend hardening: DOMPurify in BlogArticle; centralize token access in components; investigate `/api/seo`.
- Data lifecycle: soft-delete query sweep; Cloudinary cleanup in `accountCleanup.js`; per-user embedding regen rate limit; Redis-backed rate-limit migration (multi-instance correctness).

### Out of scope (you have to do)
- Rotate `ADMIN_PASSWORD` + `RESEND_API_KEY` on Render (web UI).
- Re-verify GSC sitemap.
- Set `HEALTHZ_TOKEN` on Render if you want the embedding-coverage endpoint pollable.
- Decide on Twilio: provision + test, or remove the SMS code path entirely.
