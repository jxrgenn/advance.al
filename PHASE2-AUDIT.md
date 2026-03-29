# Phase 2 Audit — advance.al

**Date:** March 29, 2026
**Auditor:** Claude (solo dev loop)
**Scope:** Full backend (19 routes, 20 models, 11 services, 3 libs, 4 config files) + frontend (26 pages, 32+ components)

---

## CRITICAL Issues

### C1: CV Preview — Unsanitized HTML from DOCX (XSS Risk) ✅ FIXED
**File:** `backend/src/routes/cv.js:154`
**Fix applied:** Added regex sanitization (strips script/iframe/object/embed tags, on* handlers, javascript: URIs) + restrictive CSP meta tag on served HTML.

### C2: Matching Routes — Missing Role Authorization ✅ FIXED
**File:** `backend/src/routes/matching.js:15,79,152,184`
**Fix applied:** Added `requireEmployer` middleware to ALL 4 matching routes.

### C3: Admin Backfill Endpoints — Mounted correctly ✅ VERIFIED
**File:** `backend/src/routes/admin.js` — properly mounted at `/api/admin` in server.js. Backfill endpoints accessible.

---

## HIGH Issues

### H1: Verification Status Endpoint — Information Leak ✅ FIXED
**File:** `backend/src/routes/verification.js:535`
**Fix applied:** Added `verificationLimiter` to the status endpoint. Removed `method` field from response to reduce information leakage (attacker can't learn if code was sent via email vs SMS).

### H2: Companies List Shows Unverified Employers ✅ FIXED
**File:** `backend/src/routes/companies.js:29`
**Fix applied:** Made verified filter conditional: enabled in production (`NODE_ENV === 'production'`), disabled in dev for convenience. Response still includes `verified` field for frontend badge display.

### H3: Missing ObjectId Validation on track-contact ✅ FIXED
**File:** `backend/src/routes/matching.js:152`
**Fix applied:** Added `mongoose.Types.ObjectId.isValid()` check for both `jobId` and `candidateId` body params, plus `contactMethod` enum validation.

### H4: Admin Embeddings — No ObjectId Validation ✅ FIXED
**File:** `backend/src/routes/admin/embeddings.js:406`
**Fix applied:** Added `validateObjectId('jobId')` and `validateObjectId('queueId')` middleware.

### H5: Clear-old-queue — Unsafe parseInt on `days` ✅ FIXED
**File:** `backend/src/routes/admin/embeddings.js:344`
**Fix applied:** `const safeDays = Math.min(Math.max(1, parseInt(days) || 7), 365);`

### H6: QuickUser Preference Update — No ObjectId Validation ✅ FIXED
**File:** `backend/src/routes/quickusers.js`
**Fix applied:** Added `validateObjectId('id')` middleware to preferences update route.

### H7: Global Rate Limiting Skipped in Development ⚠️ BY DESIGN
**File:** `backend/server.js:158`
**Status:** Expected behavior for dev convenience. Rate limiting testing must be done with `NODE_ENV=production`.

### H8: Application Messages — Missing XSS Sanitization ✅ FIXED
**File:** `backend/src/routes/applications.js`
**Fix applied:** Added `stripHtml()` sanitization to message content before storage and email.

### H9: Password Not Excluded from Login Response ✅ VERIFIED SAFE
**File:** `backend/src/models/User.js`
**Verification:** `password` field has `select: false` (line 343) AND `toJSON()` method (line 574) explicitly deletes `password`, `emailVerificationToken`, `passwordResetToken`, `refreshTokens`. Double protection.

---

## MEDIUM Issues

### M1: Report Submission — Evidence Array Not Validated ✅ FIXED
**File:** `backend/src/routes/reports.js:63-73`
**Fix applied:** Evidence items now validated as strings with max 500 chars each, array max 5 items.

### M2: Notification Rate Limiter — Not Applied ✅ FIXED
**File:** `backend/src/routes/notifications.js`
**Fix applied:** Applied `notificationLimiter` to `:id/read`, `mark-all-read`, and `DELETE /:id` routes.

### M3: Matching Route — Error Messages Leak in Non-Production ⚠️ ACCEPTED
**File:** `backend/src/routes/matching.js:69`
**Status:** Error messages only show in non-production envs. This is standard Express behavior across the codebase. Production is safe.

### M4: Missing Pagination Bounds on Admin Statistics ✅ FIXED
**File:** `backend/src/routes/reports.js:418-457`
**Fix applied:** `const safeTimeframe = Math.min(Math.max(1, parseInt(timeframe) || 30), 365);` — bounded 1-365 days. All references updated to use `safeTimeframe`.

### M5: QuickUser Creation — No Rate Limiting ✅ FIXED
**File:** `backend/src/routes/quickusers.js`
**Fix applied:** Applied `quickUserLimiter` to `POST /` creation route.

### M6: Console.log in Production for Verification Codes ⚠️ LOW RISK
**File:** `backend/src/routes/auth.js:223-225`
**Status:** Guarded by `NODE_ENV === 'development'` check. If NODE_ENV is unset, defaults to no logging in production mode. Acceptable risk.

### M7: Verification Route — Plaintext Code Comparison ⚠️ ACCEPTED
**File:** `backend/src/routes/verification.js:357`
**Status:** Codes are timing-safe compared, rate-limited, and expire in 10 minutes. Hashing would add complexity for minimal security gain since codes are short-lived and brute-force protected.

### M8: Business Control Routes — Admin Auth ✅ VERIFIED SAFE
**File:** `backend/src/routes/business-control.js`
**Verification:** ALL routes have `authenticate, requireAdmin` middleware. Confirmed by reading entire file.

### M9: Frontend API URL Fallback ⚠️ ACCEPTED
**File:** `frontend/src/lib/api.ts:2`
**Status:** Localhost fallback is correct for dev. Vercel deployment sets VITE_API_URL at build time.

### M10: Job Post — Description/Requirements Bounded ✅ VERIFIED SAFE
**File:** `backend/src/routes/jobs.js`
**Verification:** title: 5-100 chars with stripHtml, description: 50-5000 chars with stripHtml, requirements/benefits/tags are arrays (bounded by 1MB body parser), location.city: max 100 chars.

---

## LOW Issues

### L1: Dead Code — Unused Imports ⚠️ DEFERRED
Minor code hygiene. No functional impact.

### L2: Inconsistent Error Response Format ⚠️ DEFERRED
Minor consistency issue. No security impact.

### L3: Missing Request Timeout on Long Operations ⚠️ ACCEPTED
**File:** `backend/src/routes/admin/embeddings.js:250` (recompute-all)
**Status:** Server has 30s global timeout. Recompute queues jobs individually via JobQueue — doesn't block. Acceptable.

### L4: Locations Cache Key — Not Bounded ⚠️ LOW RISK
**File:** `backend/src/routes/locations.js:48`
**Status:** `sanitizeLimit` already bounds the limit value. Cache key space is limited.

### L5: Stats Route — In-Memory Cache Singleton ⚠️ ACCEPTED
Single Railway instance deployment. Acceptable.

### L6: Missing CSP on CV Preview HTML ✅ FIXED (with C1)
CSP meta tag added as part of the C1 XSS fix.

---

## UNBUILT Features

### U1: SMS Verification — Mock Only
**Status:** Known. Document in REMAINING-HUMAN-WORK.md.

### U2: Payment Integration — Mock Only
**Status:** Known. Paysera integration deferred until launch.

### U3: Daily/Weekly Digest — No Cron Scheduler
**Status:** Endpoints exist for manual trigger by admin. Cron scheduler deferred.

### U4: Scheduled Bulk Notifications — No Processor
**Status:** Deferred. Bulk notifications can be sent manually.

### U5: File Serving — No Authenticated Download for Local Files
**Status:** Local dev files stored by multer but not served. Cloudinary handles production.

---

## Fix Summary

| Severity | Total | Fixed | Verified Safe | Accepted | Remaining |
|----------|-------|-------|---------------|----------|-----------|
| CRITICAL | 3 | 2 | 1 | 0 | 0 |
| HIGH | 9 | 6 | 1 | 1 (by design) | 0 |
| MEDIUM | 10 | 4 | 2 | 4 (low risk) | 0 |
| LOW | 6 | 1 | 0 | 5 | 0 |
| UNBUILT | 5 | 0 | 0 | 0 | 5 (deferred) |
| **Total** | **33** | **13** | **4** | **10** | **5 (unbuilt)** |

**All CRITICAL and HIGH security issues are resolved.**
**All MEDIUM issues either fixed or verified as acceptable risk.**
**5 UNBUILT features documented for REMAINING-HUMAN-WORK.md.**
