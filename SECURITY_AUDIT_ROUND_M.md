# Security audit — Round M

Date: 2026-05-16
Scope: 20 backend route files under `backend/src/routes/`, ~13k LOC. Middleware `backend/src/middleware/auth.js` reviewed for context. `payments.js` reviewed lightly per instructions (was QA-L4'd).

Overall posture is **strong**: every mutating route ran through `authenticate` and a role gate, every `:id` param uses `validateObjectId`, every regex search uses `escapeRegex`, every body field of interest passes through `express-validator` with `stripHtml`, mass-assignment is consistently mitigated with field allowlists, and rate-limiters are wired on every abusable endpoint. Findings below are all secondary (info-leak, defence-in-depth, robustness) — no obvious IDOR, missing auth, or NoSQL-injection holes.

## 🔴 CRITICAL — fix before next deploy

None.

## 🟡 HIGH — fix this session

### Account enumeration via `/api/verification/request`
**File:** `backend/src/routes/verification.js:266-273`
**Issue:** Endpoint returns "Një përdorues me këtë email tashmë ekziston dhe është verifikuar" when the email belongs to a verified user, but proceeds to send a code otherwise. An attacker iterates the email list and learns who is registered.
**Impact:** Email enumeration → targeted phishing / credential stuffing against `/api/auth/login`. Rate-limited (5/15min/IP) but trivially distributed.
**Fix:** Always return the same success response shape regardless of whether the email exists. Needs design discussion (it's used by signup flow that currently relies on this for UX).

### Account enumeration via `/api/verification/status/:identifier`
**File:** `backend/src/routes/verification.js:556-583`
**Issue:** Comment claims "Always return the same shape to prevent information leakage" but the response field `hasActiveVerification: true|false` directly reveals whether someone is mid-registration for that email.
**Impact:** Same as above — email enumeration, lower yield since only catches in-flight registrations.
**Fix:** Return `hasActiveVerification: false` unconditionally for any unauthenticated caller, or require an auth token tied to that identifier.

### `users.js` accepts auth token via query string
**File:** `backend/src/routes/users.js:1925-1930`
**Issue:** `/api/users/resume/:filename` accepts the bearer token via `?token=` query when no Authorization header is present. Query strings end up in CDN/proxy access logs, browser history, and Referer headers leaking to any third-party logo loaded by the rendered DOCX HTML.
**Impact:** Active access tokens disclosed to log aggregators and any external resource referenced in a DOCX. Not exploitable directly but increases blast radius of a log leak.
**Fix:** Issue a short-lived single-use download token instead of accepting the session JWT in a URL — needs design discussion.

### `healthz/embeddings` is fully public and leaks growth metrics
**File:** `backend/src/routes/healthz.js:34-68`
**Issue:** Public endpoint returns exact counts of active jobs, jobseeker users, and quick-users, plus retry-worker stats. Returns `err.message` (line 66) directly in the 500 path.
**Impact:** Competitive / business intelligence leak; a scraper can plot daily growth. Error-path leak is small but a precedent.
**Fix:** Require an internal shared-secret header (`X-Healthz-Token`) or restrict by source IP; drop the raw `err.message`.

### Multiple admin error paths echo `error.message`
**Files:** `backend/src/routes/bulk-notifications.js:164,222,252,304,343` ; `backend/src/routes/business-control.js:114,171,212,244,276,337,392,433,467,513,558,614,735` ; `backend/src/routes/configuration.js:100,140,299,359,402,442,476,500,553` ; `backend/src/routes/reports.js:251,305,412,514,576,673,829-832`
**Issue:** Pattern `error: process.env.NODE_ENV === 'development' ? error.message : undefined`. Conditional is correct; risk is misconfigured `NODE_ENV` on a fresh deploy.
**Impact:** If `NODE_ENV` is unset on Render, raw Mongoose validation messages / stack hints reach the admin client. Admin-only, so limited blast radius.
**Fix:** Replace with helper that hard-checks `=== 'production'` instead, or drop the `error` field entirely.

### `verification.js` token comparison is not constant-time
**File:** `backend/src/routes/verification.js:455` (validate-token) and `backend/src/routes/quickusers.js:579` (`quickUser.unsubscribeToken !== token`)
**Issue:** String-equality comparison on 32-byte hex tokens.
**Impact:** Theoretical timing oracle. Token entropy (256 bits) makes practical exploitation effectively impossible, but it's a one-line fix.
**Fix:** Use `crypto.timingSafeEqual` with length pre-check (already done in `auth.js` for the registration code path — same pattern).

## 🟢 LOW / NICE-TO-HAVE

### `admin.js` GET /users + /jobs spread user-supplied `status` / `userType` into query without allowlist
**File:** `backend/src/routes/admin.js:456-462,525-532`
**Issue:** `query.userType = userType` and `query.status = status` directly from `req.query`. Admin-only so trust is high; only risk is a cast error on a bad enum value → 500 instead of 400.
**Fix:** Allowlist enum.

### `applications.js` filter spread of `status` from query
**File:** `backend/src/routes/applications.js:306,381,450`
**Issue:** `if (status) filters.status = status` — query-supplied `status` flows into `find`. Caller-scoped (`jobSeekerId`/`employerId`), so no IDOR — but cast-error 500 on garbage values.
**Fix:** Allowlist enum.

### `companies.js` GET `/:id/jobs` accepts unsanitized `status` query
**File:** `backend/src/routes/companies.js:297-301`
**Issue:** `jobQuery.status = status` for any non-`'all'` value. Same caveat as above; bounded by employerId filter.
**Fix:** Allowlist enum.

### `jobs.js` PUT `/:id` spreads `location`, `salary`, `customQuestions`, `platformCategories` from body
**File:** `backend/src/routes/jobs.js:1304-1360`
**Issue:** Validation chain marks only a few sub-keys (`location.city`, `salary.min/max`) as `.optional()`. Other sub-keys (`location.region`, `salary.currency`, etc.) flow through `Object.assign(job, updates)`. Mongoose schema validation runs on save so untyped junk is rejected — but `customQuestions` is a schema array which can be replaced wholesale.
**Impact:** Owning employer can set unintended sub-fields on their own job (e.g. `location.region` regardless of `location.city`). Same employer, same job — no privilege escalation.
**Fix:** Tighten the validation chain or restrict updates to explicit allowlist.

### `notifications.js` admin routes accept body `jobId` / `quickUserId` without ObjectId validation
**File:** `backend/src/routes/notifications.js:204-240,289-325,432-481`
**Issue:** `Job.findById(jobId)` etc.; bad ObjectId → CastError → 500.
**Impact:** Robustness only (admin-only).
**Fix:** `mongoose.isValidObjectId` pre-check, or use `validateObjectId` on body.

### `quickusers.js` GET `/:id` admin route missing `validateObjectId`
**File:** `backend/src/routes/quickusers.js:513`
**Issue:** Bad ObjectId → CastError → 500.
**Fix:** Add `validateObjectId('id')` middleware.

### `quickusers.js` POST `/find-matches` takes job object verbatim from request body
**File:** `backend/src/routes/quickusers.js:472-508`
**Issue:** `req.body.job` passed straight to `QuickUser.findMatchesForJob(job)`. Admin-only, but no shape check; whatever the model does with it determines exposure.
**Fix:** Validate / look up by jobId instead.

### `auth.js` change-password does not require email re-verification
**File:** `backend/src/routes/auth.js:806-859`
**Issue:** No rate-limit on `/change-password` beyond global app limiter. An attacker with a stolen short-lived JWT could brute-force `currentPassword` (bcrypt slow, but no per-user cap).
**Impact:** Low — requires already-stolen token; bcrypt cost slows it.
**Fix:** Add a per-user limiter on this endpoint, e.g. 5 attempts/hour.

### `auth.js` /check-email response distinguishes registered emails
**File:** `backend/src/routes/auth.js:316-329`
**Issue:** Endpoint is explicitly designed to leak `{available: false}` for registered emails. Documented as a UX feature; rate-limited (15/15min/IP). Worth noting only because combined with `/verification/request`'s leak it makes enumeration cheap.
**Fix:** Discuss whether the UX gain warrants the leak. No code change recommended without product input.

### `applications.js` apply jobId accepts string up to 200 chars (slug)
**File:** `backend/src/routes/applications.js:64-68`
**Issue:** Documented dual-lookup design (ObjectId or slug). Slug is then used in `Job.findOne({ slug: jobId, ... })` which is a string equality match, so no injection — but the 200-char cap is generous if the slug field index is unique-sparse.
**Fix:** Tighten to 120 chars or whatever the slug schema actually caps at.

### `users.js` /resume/:filename — legacy local-file path served from disk
**File:** `backend/src/routes/users.js:1976-2020`
**Issue:** Only serves files under `process.cwd()/uploads/resumes/`. Path-traversal blocked by L1935 (`..` / `/` / `\\`). Filename regex L1944 anchors a 24-hex prefix. Looks safe; flagged only because in production all uploads go to Cloudinary, so this path is dead code that could grow stale.
**Fix:** Delete the local-disk read path in production (return 404).

## ✅ Looks good

- `backend/src/middleware/auth.js` — JWT pinned to HS256, suspension/ban handling, password stripped on `findById`.
- `backend/src/routes/auth.js` — per-email rate-limit on register/login/forgot-password, decoy bcrypt for timing-safe login, timing-safe code compare on register, refresh-token rotation, account-state checks only after correct password.
- `backend/src/routes/admin.js` — global `router.use(authenticate); router.use(requireAdmin)`, ObjectId validated on every mutation, `escapeRegex` on every search.
- `backend/src/routes/applications.js` — owner check on every read/update, status transitions allowlisted, sanitized messages, per-user rate limit on `/apply` + `/message`, soft email-verification gate.
- `backend/src/routes/jobs.js` — `requireVerifiedEmployer` on create/update, ownership query on every mutation, regex-only search via `escapeRegex`, sort whitelist, slug/ObjectId dual lookup with `isObjectIdString`, server-side enforcement of `administrata` flag, status mutation isolated to dedicated endpoint.
- `backend/src/routes/users.js` — magic-byte validation on every upload (PDF/DOCX/DOC + JPEG/PNG/WebP), strict employerProfile allowlist on profile update (with separate verified/unverified lists), password required for account delete, resume-serve permission check (owner / admin / employer with application).
- `backend/src/routes/bulk-notifications.js` — admin-only, rate-limited per-admin, all body fields validated and stripHtml'd, ObjectId checked on `/:id` routes.
- `backend/src/routes/business-control.js` — admin-only, allowlisted PUT fields on campaigns/pricing rules, validation chain on creates.
- `backend/src/routes/companies.js` — public reads only, regex escaped, sort whitelist, ObjectId validated on `/:id`.
- `backend/src/routes/configuration.js` — admin-only except `/public` which only emits whitelisted public keys, audit log on every change, cache invalidation on update.
- `backend/src/routes/cv.js` — per-user rate limit (5/hr), ownership check on download/preview, mammoth HTML sanitized (script/iframe/on* attrs stripped) + CSP applied.
- `backend/src/routes/healthz.js` — trivial coverage logic (see HIGH for the data-leak concern).
- `backend/src/routes/locations.js` — public read-only, cached, no input surface.
- `backend/src/routes/matching.js` — employer-only, job ownership verified, ObjectId validated, error.message hidden in production.
- `backend/src/routes/notifications.js` — owner check on every notification mutation, admin-only routes properly gated.
- `backend/src/routes/payments.js` — covered by QA-L4; spot check confirmed user-ID-keyed rate limit and ownership-verified job lookup on initiate.
- `backend/src/routes/quickusers.js` — magic-byte validation on optional CV, JOB_CATEGORIES allowlist on interests, public POST has rate limit, preferences-update gated by unsubscribe token (per-user secret).
- `backend/src/routes/reports.js` — submitter rate-limited per-user, dup-check 24h, ObjectId validated everywhere, admin actions allowlisted, status/category enum-validated.
- `backend/src/routes/stats.js` — public read-only, cached.
- `backend/src/routes/verification.js` — code generated via `crypto.randomInt`, stored hashed in Redis with TTL, timing-safe compare on submit, attempt cap, per-identifier resend cooldown (see HIGH for the enumeration concerns).
