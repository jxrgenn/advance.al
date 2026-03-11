# PRODUCTION-READY IMPLEMENTATION PLAN

**Date:** March 11, 2026
**Last Verified:** March 11, 2026 (cross-verified every finding against source code)
**Platform:** advance.al — Premier Job Marketplace for Albania
**Scope:** Complete production audit → implementation plan for national launch
**Audited By:** Claude (full codebase audit across 60+ backend files, 40+ frontend files, verified by 5 independent verification agents)

---

## EXECUTIVE SUMMARY

After an exhaustive audit of every model, route, service, component, page, and configuration file — plus a complete end-to-end logic audit of every user flow, every button, and every feature — followed by a comprehensive cross-verification sweep against actual source code — I identified **145 verified issues** across the entire codebase. These range from critical security vulnerabilities to broken user flows, dead buttons, non-functional features, and logic bugs where features appear to work but produce wrong results.

**Verification results:** Every finding was cross-checked against actual source code with exact code quotes. 1 false positive was removed (7A.4), 3 findings were corrected for accuracy, and 12 additional findings were discovered during verification.

**The system is architecturally sound** — good separation of concerns, proper REST API design, comprehensive database schemas, and a modern React frontend. However, there are **critical security holes, dead/test code in production paths, and several broken user flows** that make it unfit for a national launch in its current state.

This plan is organized into **7 phases (11 sub-phases)**, ordered by criticality. Each phase can be implemented independently, and each item includes the exact files to modify. A **Conflict Analysis** section at the end identifies 4 implementation conflicts with mitigation strategies.

---

## PHASE 1: CRITICAL SECURITY FIXES (Must do before ANY public access)

> These issues could lead to data breaches, unauthorized access, or financial loss if exploited.

### 1.1 Rotate ALL Secrets (JWT, DB credentials)

**Problem:** JWT secrets were committed to git history in the initial commit. Anyone with repo access can forge admin tokens.
**Files:** Environment variables (not in code)
**Action:**
- Generate new `JWT_SECRET` (64+ char random hex)
- Generate new `JWT_REFRESH_SECRET` (64+ char random hex)
- Rotate `MONGODB_URI` password
- Rotate `OPENAI_API_KEY`
- Rotate `RESEND_API_KEY`
- Deploy new secrets to Railway/Render
- Force-logout all existing sessions (invalidate all current JWTs)

### 1.2 Lock Down Public Endpoints (7 unauthenticated admin endpoints)

**Problem:** Seven endpoints in `notifications.js` are fully public and allow unauthenticated users to trigger mass emails, access user PII, and abuse the notification system.
**File:** `backend/src/routes/notifications.js`
**Action:** Add `authenticate, requireAdmin` middleware to:
- `POST /test-job-match` (line ~219)
- `POST /send-daily-digest` (line ~260)
- `POST /send-weekly-digest` (line ~282)
- `POST /test-welcome-email` (line ~304)
- `GET /quickuser-stats` (line ~345)
- `POST /manual-notify` (line ~447)
- `GET /eligible-users/:jobId` (line ~501)

### 1.3 Lock Down QuickUser Endpoints

**Problem:** Multiple QuickUser endpoints expose PII without auth, and rate limiting is completely disabled.
**File:** `backend/src/routes/quickusers.js`
**Action:**
- Re-enable rate limiter (uncomment lines 11-18)
- Add `authenticate, requireAdmin` to `GET /:id`, `GET /analytics/overview`, `POST /find-matches`
- Add ownership or token-based auth to `PUT /:id/preferences`
- Fix route ordering: move `/analytics/overview` BEFORE `/:id`

### 1.4 Fix JWT Algorithm Pinning

**Problem:** `jwt.verify()` called without specifying algorithms, allowing potential `alg: none` attacks.
**File:** `backend/src/middleware/auth.js`
**Action:** Add `{ algorithms: ['HS256'] }` to all `jwt.verify()` calls (lines ~6, 13, 20).

### 1.5 Implement Refresh Token Revocation

**Problem:** Refresh tokens can never be invalidated. Stolen tokens work until expiry (7 days). Logout is client-side only.
**Files:** `backend/src/middleware/auth.js`, `backend/src/routes/auth.js`, `backend/src/models/User.js`
**Action:**
- Store refresh tokens in User model (field already exists but unused)
- On `/refresh`, validate token exists in DB, then rotate (delete old, issue new)
- On `/logout`, delete all refresh tokens for user
- On password change, invalidate all refresh tokens
- Add `jti` claim to JWTs for individual token identification

### 1.6 Re-enable Status & Expiry Filters on Public Job Listings

**Problem:** Expired, draft, paused, closed, and pending_payment jobs are visible to the public. Users see jobs they shouldn't.
**Files:** `backend/src/models/Job.js` (lines ~432-433), `backend/src/routes/jobs.js` (lines ~247-248)
**Action:** Uncomment the status and expiry filters:
```js
status: 'active',
expiresAt: { $gt: new Date() }
```

### 1.7 Prevent Client-Side Status Manipulation & Validate Tier

**Problem:** Clients can set `status: 'active'` in job create/update requests, bypassing payment. The `tier` field must be validated (not stripped — employers legitimately select tier).
**File:** `backend/src/routes/jobs.js`
**Action:**
- In POST (create): Strip `status`, `pricing` from `req.body`. Validate `tier` is one of `['basic', 'premium', 'featured']`. Set `status` server-side only.
- In PUT (update): Strip `status`, `pricing`, `applicationCount`, `viewCount` from `req.body`. Validate `tier` if present.
- **Note:** Do NOT strip `tier` — it's a legitimate field for premium tier selection. Only validate it against the enum.

### 1.8 Escape Regex in All Search Endpoints

**Problem:** Raw user input passed as MongoDB `$regex` enables ReDoS attacks that can hang the database.
**Files:** `backend/src/routes/admin.js` (lines ~474-480, ~541-545), `backend/src/routes/reports.js` (line ~306), `backend/src/routes/business-control.js` (line ~853)
**Action:** Create a utility function and apply everywhere:
```js
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
// Then: { $regex: escapeRegex(search), $options: 'i' }
```

### 1.9 HTML-Escape All User Data in Email Templates

**Problem:** User-supplied data (names, job titles, descriptions, messages) is interpolated directly into HTML email templates. XSS in email clients.
**Files:** `backend/src/lib/resendEmailService.js`, `backend/src/lib/notificationService.js`
**Action:** Create an `escapeHtml()` utility and apply to ALL template interpolations:
```js
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
```
Apply to every `${user.firstName}`, `${job.title}`, `${message}`, `${reason}`, `${description}`, etc. in both files.

### 1.10 Remove Demo Credentials from Production UI

**Problem:** Real test account credentials (email + `password123`) are displayed on the login page.
**File:** `frontend/src/pages/Login.tsx` (lines ~170-179)
**Action:** Remove the entire demo credentials section. Also remove `password123` from the password placeholder.

### 1.11 Remove Environment Variable Logging from Frontend

**Problem:** `api.ts` logs ALL environment variables and first 20 chars of auth tokens to the browser console.
**File:** `frontend/src/lib/api.ts` (lines ~2-7, ~21, ~254, ~1800-1900)
**Action:** Remove all `console.log` statements that output env vars, tokens, or sensitive data.

### 1.12 Add Maximum Length Limits & Rate Limiting for OpenAI CV Generation

**Problem:** There IS a 50-char minimum check (`cv.js` line 18), but NO maximum length limit. Users can send megabytes of text, costing significant money per request. Also no rate limiting on the CV endpoint.
**Files:** `backend/src/routes/cv.js`, `backend/src/services/openaiService.js`
**Action:**
- Add max length validation (10,000 chars) on the CV input (min 50 already exists)
- Add rate limiting (5 requests per hour per user) to the CV generation endpoint
- Add basic input sanitization (strip control characters, limit to printable text)

### 1.13 Fix Admin Self-Deletion & Hard Delete Issues

**Problem:** Admins can hard-delete themselves, other admins, or any user. Hard deletes leave orphaned applications/jobs.
**File:** `backend/src/routes/admin.js` (lines ~584-636)
**Action:**
- Prevent admin from deleting themselves
- Prevent deletion of other admins (unless superadmin)
- Change hard delete to soft delete (`user.softDelete()` instead of `findByIdAndDelete`)
- For job hard delete (line ~670): cascade-update related applications to `status: 'closed'`

### 1.14 Fix Status Manipulation via PUT /api/jobs/:id (Privilege Escalation)

**Problem:** The PUT handler at `jobs.js:968-981` destructures `status` from `req.body` and assigns it directly: `status: status || job.status`. An employer can send `status: 'active'` on a `pending_payment` job, bypassing payment entirely.
**File:** `backend/src/routes/jobs.js` (lines ~968-981)
**Action:** Remove `status` from the destructured fields in the PUT handler. Status should only be changed via the dedicated `PATCH /api/jobs/:id/status` endpoint.

### 1.15 Fix send-verification.js — Unauthenticated Email Spam Vector

**Problem:** `POST /api/send-verification` is marked `@access Public` with rate limiting completely disabled (commented out at lines 16-23). Anyone can call this endpoint with any email address, company name, and verification code to spam arbitrary emails.
**File:** `backend/src/routes/send-verification.js`
**Action:**
- Re-enable the rate limiter (uncomment lines 16-23)
- Either add authentication middleware, or at minimum implement strict rate limiting per IP
- Remove diagnostic console.logs at lines 12-13 (leaks API key info)
- Remove unnecessary `domains.list()` call at line 70 (runs on every email send)

### 1.16 Fix PUT /api/jobs/:id Uses Create Validation for Updates

**Problem:** The PUT handler applies `createJobValidation` middleware (`jobs.js:945`), which requires ALL fields. A partial update (e.g., just changing salary) fails validation on all other required fields unless the frontend sends the complete job object.
**File:** `backend/src/routes/jobs.js` (line ~945)
**Action:** Create an `updateJobValidation` middleware that uses `.optional()` for all fields, so partial updates are allowed.

---

## PHASE 2: BROKEN USER FLOWS (Must fix for functional product)

> These issues cause crashes, lost data, or non-functional features.

### 2.1 Fix Frontend Route Protection

**Problem:** 5+ routes are unprotected — anyone can access PostJob, EditJob, Profile, SavedJobs without auth.
**File:** `frontend/src/App.tsx`
**Action:** Wrap routes with `<ProtectedRoute>`:
```tsx
<Route path="/post-job" element={<ProtectedRoute allowedUserTypes={['employer']}><PostJob /></ProtectedRoute>} />
<Route path="/edit-job/:id" element={<ProtectedRoute allowedUserTypes={['employer']}><EditJob /></ProtectedRoute>} />
<Route path="/profile" element={<ProtectedRoute allowedUserTypes={['jobseeker']}><Profile /></ProtectedRoute>} />
<Route path="/saved-jobs" element={<ProtectedRoute allowedUserTypes={['jobseeker']}><SavedJobs /></ProtectedRoute>} />
<Route path="/report-user" element={<ProtectedRoute><ReportUser /></ProtectedRoute>} />
```

### 2.2 Fix ProtectedRoute Wrong-Role Redirect (Not a Loop, But Wrong UX)

**Problem:** When an authenticated user has the wrong role (e.g., employer accessing `/admin`), ProtectedRoute redirects to `/login`, which detects they're already authenticated and bounces them to their default dashboard. This is NOT an infinite loop (it terminates at the dashboard), but the UX is jarring — the user briefly sees the login page flash before being redirected.
**File:** `frontend/src/contexts/AuthContext.tsx` (line ~305)
**Action:** Redirect to the user's default dashboard directly (or `/`) instead of `/login` when user is authenticated but wrong role. This eliminates the unnecessary login page flash.

### 2.3 Fix 401 State Desync

**Problem:** When a 401 response clears localStorage tokens, React auth state remains stale. User appears logged in but all API calls fail.
**Files:** `frontend/src/lib/api.ts` (lines ~298-300), `frontend/src/contexts/AuthContext.tsx`
**Action:**
- Option A: Dispatch a custom event from `api.ts` on 401 that AuthContext listens for
- Option B: Use a shared `authStore` (e.g., zustand) that both api.ts and React components reference
- Ensure `removeAuthToken()` also triggers React state update via the event/store

### 2.4 Implement Automatic Token Refresh

**Problem:** `authApi.refreshToken()` exists but is never called. Tokens expire after 2h with no auto-refresh, breaking the session silently.
**File:** `frontend/src/lib/api.ts`
**Action:** Add token refresh logic to `apiRequest`:
```js
if (response.status === 401 && !isRetry) {
  const refreshResult = await authApi.refreshToken();
  if (refreshResult.success) {
    setAuthToken(refreshResult.data.token);
    return apiRequest(endpoint, { ...options, isRetry: true }); // retry original request
  }
  // Only logout if refresh also fails
  removeAuthToken();
  window.dispatchEvent(new Event('auth:logout'));
}
```

### 2.5 Fix Job Type Filter (Does Nothing)

**Problem:** `selectedType` state exists and shows in UI but is never sent to the API. Filtering by job type does nothing.
**File:** `frontend/src/pages/Index.tsx`
**Action:** Add `selectedType` to `queryParams` in `loadJobs()` function:
```js
if (selectedType) queryParams.append('jobType', selectedType);
```

### 2.6 Fix Core Filters (Don't Trigger Re-fetch)

**Problem:** Toggling core filters (Diaspora, Remote, Part Time, etc.) updates state but doesn't re-fetch jobs because `coreFilters` was removed from the useEffect dependency array.
**File:** `frontend/src/pages/Index.tsx`
**Action:**
- Add `coreFilters` back to the useEffect dependency array
- Include core filter values as query parameters in the API call
- Add debouncing (300ms) to prevent rapid-fire requests

### 2.7 Fix `/register` Route Showing Login Page

**Problem:** `/register` renders the `<Login />` component, which is a login form.
**File:** `frontend/src/App.tsx`
**Action:** Either:
- Create a separate Register page, OR
- Pass a prop to Login: `<Route path="/register" element={<Login defaultTab="register" />} />`
- Update Login.tsx to support toggling between login and registration

### 2.8 Fix Employer Registration Data Loss

**Problem:** Company `description` is collected but not sent to API. `firstName` is set to `companyName`, `lastName` is hardcoded to `'-'`.
**File:** `frontend/src/pages/EmployerRegister.tsx`
**Action:**
- Add `description` to the register() call
- Add proper `firstName` and `lastName` fields (contact person name, not company name)
- Remove hardcoded `lastName: '-'`

### 2.9 Fix Forgot Password Flow

**Problem:** "Forgot password" link goes to `/forgot-password` which has no route — shows 404.
**Files:** `frontend/src/App.tsx`, `frontend/src/pages/Login.tsx`
**Action:** Either:
- Create a ForgotPassword page component and add the route, OR
- Show an inline modal on the login page for password reset

### 2.10 Fix Application Crash on One-Click Apply

**Problem:** If `user.profile.jobSeekerProfile` is undefined, one-click apply crashes with TypeError.
**File:** `backend/src/routes/applications.js` (line ~82)
**Action:** Add null check:
```js
const profile = user.profile?.jobSeekerProfile;
if (!profile) {
  return res.status(400).json({ success: false, message: 'Plotësoni profilin tuaj para se të aplikoni' });
}
```

### 2.11 Fix Report Description Crash

**Problem:** `description.substring()` crashes when description is undefined (field is optional).
**File:** `backend/src/routes/reports.js` (line ~181)
**Action:** Add null check: `(description || '').substring(0, 100)`

### 2.12 Fix Navigation MutationObserver Breaking All Modals/Tutorials

**Problem:** Navigation component has a MutationObserver that continuously removes `overflow: hidden` and `padding-right` from body, fighting with every modal and tutorial overlay.
**File:** `frontend/src/components/Navigation.tsx` (lines ~41-59)
**Action:** Do NOT simply remove the MutationObserver — it was added to fix a Radix UI layout shift bug where dropdown menus cause `body` to get `padding-right` (scroll-lock compensation). Instead:
- **Option A:** Scope the MutationObserver to only run when the navigation dropdown is open, and only counteract the specific Radix scroll-lock (not all `overflow: hidden`)
- **Option B:** Use Radix's `modal={false}` prop on the dropdown to prevent scroll-lock behavior
- **Option C:** Apply a CSS-only fix: `body { padding-right: 0 !important; }` scoped to when nav dropdown is open
**CONFLICT WARNING:** Simply removing the observer WILL re-introduce layout shift (page content jumps) when opening any Radix dropdown/dialog.

### 2.13 Fix Admin Dashboard Dead Code & Fake Data

**Problem:** `sendBulkNotification` references undeclared state variables (will crash). `loadReportsData` creates fake simulated reports from real active users.
**File:** `frontend/src/pages/AdminDashboard.tsx`
**Action:**
- Remove the broken `sendBulkNotification` function (the working `handleSendBulkNotification` exists)
- Remove `loadReportsData` simulated reports — use real reports from the API
- Fix division-by-zero in Progress components (guard against 0 totals)

### 2.14 Fix Mock Payment Endpoint

**Problem:** Candidate matching purchase endpoint always succeeds without real payment. Revenue loss.
**File:** `backend/src/routes/matching.js` (lines ~112-117)
**Action:** Either:
- Disable the endpoint until payment integration is ready, OR
- Add a feature flag: `if (!process.env.ENABLE_MOCK_PAYMENTS) return res.status(503).json({ message: 'Payment system coming soon' })`

### 2.15 Remove Debug Queries from Public Job Listing

**Problem:** Three extra `countDocuments()` and `aggregate()` queries run on EVERY `GET /api/jobs` request.
**File:** `backend/src/routes/jobs.js` (lines ~211-220)
**Action:** Remove the debug queries (lines ~211-220) and the debug console.logs (line ~91 etc.).

---

## PHASE 3: DATA INTEGRITY & VALIDATION (Prevents data corruption)

### 3.1 Fix Password Policy

**Problem:** Minimum 6 characters, no complexity requirements.
**Files:** `backend/src/routes/auth.js` (line ~29), `backend/src/models/User.js` (line ~296), `frontend/src/pages/JobSeekersPage.tsx`, `frontend/src/pages/EmployerRegister.tsx`
**Action:**
- Backend: `body('password').isLength({ min: 8 }).matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)` with Albanian error message
- Model: `minlength: 8`
- Frontend: Update validation messages to match (currently says 6 in some places, 8 in others)

### 3.2 Fix Withdrawn Applications Permanently Blocking Re-application

**Problem:** Unique compound index on `(jobId, jobSeekerId)` means withdrawn applications can never be re-applied.
**File:** `backend/src/models/Application.js` (line ~116)
**Action:** Change the unique index to a partial index:
```js
applicationSchema.index(
  { jobId: 1, jobSeekerId: 1 },
  { unique: true, partialFilterExpression: { withdrawn: { $ne: true } } }
);
```
**MIGRATION REQUIRED:** The existing index must be explicitly dropped first via MongoDB shell or migration script:
```js
db.applications.dropIndex("jobId_1_jobSeekerId_1")
```
MongoDB will NOT accept creating a new index with the same key fields but different options while the old one exists. If you just change the Mongoose schema without dropping the old index, Mongoose will silently use the existing (non-partial) index and the bug persists.

### 3.3 Fix Application Status Transitions (No State Machine)

**Problem:** Any status can be set regardless of current status. Hired can go back to pending.
**File:** `backend/src/routes/applications.js` (line ~478)
**Action:** Add a transition validation map:
```js
const validTransitions = {
  pending: ['viewed', 'shortlisted', 'rejected'],
  viewed: ['shortlisted', 'rejected'],
  shortlisted: ['hired', 'rejected'],
  rejected: [],
  hired: []
};
```

### 3.4 Fix Application Count Never Decrementing on Withdrawal

**Problem:** `applicationCount` on Job increments on apply but never decrements on withdrawal.
**File:** `backend/src/models/Application.js`
**Action:** In the `withdraw` method, decrement the job's `applicationCount`:
```js
await Job.findByIdAndUpdate(this.jobId, { $inc: { applicationCount: -1 } });
```

### 3.5 Fix View Count Race Condition

**Problem:** `incrementViewCount` uses `save()` instead of atomic `$inc`, losing counts under concurrent access.
**File:** `backend/src/models/Job.js` (lines ~395-398)
**Action:** Replace with:
```js
jobSchema.methods.incrementViewCount = function() {
  return Job.findByIdAndUpdate(this._id, { $inc: { viewCount: 1 } });
};
```

### 3.6 Fix Double Slug Generation

**Problem:** Slug generated manually in route AND in pre-save hook, causing double DB lookups.
**Files:** `backend/src/routes/jobs.js` (lines ~679-696), `backend/src/models/Job.js` (lines ~364-384)
**Action:** Remove manual slug generation from the route. Let the pre-save hook handle it exclusively.

### 3.7 Add Pagination Limits

**Problem:** No upper bound on `limit` query parameter across multiple endpoints. `?limit=1000000` dumps entire DB.
**Files:** All route files that accept `limit` parameter
**Action:** Add a utility:
```js
function sanitizeLimit(limit, max = 100, defaultVal = 20) {
  const parsed = parseInt(limit) || defaultVal;
  return Math.min(Math.max(1, parsed), max);
}
```
Apply in: `admin.js`, `jobs.js`, `applications.js`, `reports.js`, `notifications.js`, `business-control.js`, `matching.js`

### 3.8 Fix Sort Field Injection

**Problem:** `sortBy` query parameter allows arbitrary field names.
**File:** `backend/src/routes/jobs.js` (line ~233)
**Action:** Whitelist allowed sort fields:
```js
const allowedSorts = ['createdAt', 'postedAt', 'salary.min', 'viewCount', 'applicationCount'];
const safeSortBy = allowedSorts.includes(sortBy) ? sortBy : 'postedAt';
```

### 3.9 Fix Email Regex Rejecting Valid Emails

**Problem:** User model email regex rejects TLDs with 4+ chars (.info, .technology) and emails with `+`.
**File:** `backend/src/models/User.js` (line ~290)
**Action:** Replace with a more permissive regex or use `validator.isEmail()`:
```js
match: [/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, 'Ju lutem jepni një email të vlefshëm']
```

### 3.10 Fix Salary Validation Falsy Zero Bug

**Problem:** `if (salary.min && salary.max && salary.min > salary.max)` — if min is 0, check is bypassed.
**Files:** `backend/src/routes/jobs.js` (line ~662, ~984)
**Action:** Use explicit null checks: `if (salary.min != null && salary.max != null && salary.min > salary.max)`

### 3.11 Fix Work Experience / Education ID Collisions

**Problem:** IDs generated with `Date.now().toString()` can collide if two entries created in same millisecond.
**File:** `backend/src/routes/users.js` (lines ~648, ~712)
**Action:** Replace with `crypto.randomUUID()`:
```js
import { randomUUID } from 'crypto';
// ...
_id: randomUUID()
```

### 3.12 Fix formValidation.ts `custom` Validator — Never Receives formData

**Problem:** `profileValidationRules.settings.confirmPassword` (line 272) declares: `custom: (value, formData) => !formData?.newPassword || value === formData.newPassword`. But `validateField()` (line 83) calls `rule.custom(value)` — it only passes `value`, never `formData`. So `formData` is always `undefined`, `!undefined` is `true`, and **password confirmation always passes**. Same broken pattern exists for `postJobRules.step3.salaryMax` (line 420).
**File:** `frontend/src/lib/formValidation.ts` (line 83)
**Action:** Pass full form data as second parameter: `rule.custom(value, formData)` — requires adding `formData` parameter to the `validateField` function signature.

### 3.13 Fix confirmPassword Validation in EmployersPage — Always Passes

**Problem:** At `EmployersPage.tsx:706-707`, the validation call passes `confirmPassword: values.password` (same as password), so the "passwords don't match" check can NEVER fire. Same issue at line 207 for step 0 validation.
**File:** `frontend/src/pages/EmployersPage.tsx` (lines ~207, ~706-707)
**Action:** Use `values.confirmPassword` (the actual confirm field value) instead of `values.password`.

### 3.14 Fix Phone Validation Inconsistency — Required in Validation, Optional in Form

**Problem:** `formValidation.ts:146-149` marks phone as `required: true`, and `employerSignupRules.step1` references it. But `EmployersPage.tsx:760-763` treats phone as optional: `let formattedPhone = ''; if (values.phone) { ... }`.
**File:** `frontend/src/lib/formValidation.ts` (line 146), `frontend/src/pages/EmployersPage.tsx` (line 760)
**Action:** Align validation with intended behavior — either make phone optional in validation or required in form logic.

### 3.15 Add Confirmation for Destructive Actions (Frontend)

**Problem:** Job deletion, marking as hired, and other significant actions have no confirmation dialogs.
**File:** `frontend/src/pages/EmployerDashboard.tsx`
**Action:** Add confirmation dialogs before:
- Job deletion (line ~1192)
- Status change to "hired" (line ~637)
- Account deletion (Profile page)

### 3.16 Fix endDate Error Message Says "Required" But Field Is Not Required

**Problem:** `formValidation.ts:209` — `endDate: { required: false, message: "Data e mbarimit eshte e detyrueshme" }` — message translates to "end date is required" but `required: false`.
**File:** `frontend/src/lib/formValidation.ts` (line 209)
**Action:** Change the message to something appropriate for a non-required field.

---

## PHASE 4: PRODUCTION HARDENING (Operational readiness)

### 4.1 Remove ALL Production Console.log Statements

**Problem:** 100+ console.log statements across frontend and backend leak internal data, slow down execution, and clutter logs.
**Files:** Every file. Comprehensive list:
- `backend/src/routes/jobs.js` — ~15 debug logs including emoji banners
- `backend/src/routes/applications.js` — ~10 debug logs with user PII
- `backend/src/routes/auth.js` — Login attempt logging with email/status
- `backend/src/routes/users.js` — Full request body and user object dumps
- `backend/src/routes/admin.js` — Various debug logs
- `backend/src/routes/reports.js` — Debug logs
- `backend/src/routes/business-control.js` — Debug logs
- `frontend/src/lib/api.ts` — Env var dumps, token logging
- `frontend/src/pages/Index.tsx` — Filter debug logs
- `frontend/src/pages/JobDetail.tsx` — Apply flow debug logs
- `frontend/src/pages/Profile.tsx` — Tutorial debug logs
- `frontend/src/pages/EmployerDashboard.tsx` — 18+ debug logs
- `frontend/src/pages/AdminDashboard.tsx` — Various debug logs
- `frontend/src/pages/PostJob.tsx` — Form data debug logs
- `frontend/src/pages/JobSeekersPage.tsx` — Registration debug logs
**Action:** Remove all console.log/console.debug. Keep only console.error for actual errors. Consider using a proper logger (winston) for backend.

### 4.2 Fix CORS Configuration

**Problem:** Vercel preview regex too permissive (`advance-al[a-z0-9-]*`), and requests without Origin header bypass CORS entirely.
**File:** `backend/server.js` (lines ~61, ~78)
**Action:**
- Restrict Vercel preview regex: match exact project slug
- For no-origin requests: only allow health check endpoint, require origin for all others
- Explicitly list allowed origins from environment variable

### 4.3 Reduce JSON Body Size Limit

**Problem:** 10MB JSON body limit is excessive and enables memory exhaustion attacks.
**File:** `backend/server.js` (line ~119)
**Action:** Reduce to 1MB: `express.json({ limit: '1mb' })`

### 4.4 Fix Error Message Leakage

**Problem:** Internal error messages (MongoDB errors, file paths) leak to clients.
**Files:** `backend/server.js` (line ~209), `backend/src/routes/cv.js`, `backend/src/routes/matching.js`
**Action:** In all catch blocks, sanitize error messages in production:
```js
const clientMessage = process.env.NODE_ENV === 'production'
  ? 'Ndodhi një gabim. Ju lutemi provoni përsëri.'
  : error.message;
```

### 4.5 Fix Upload Directory Creation & Access Control

**Problem:** Upload directory may not exist (crashes on first upload). Uploads served publicly without auth.
**Files:** `backend/src/routes/users.js` (lines ~12-16), `backend/server.js` (line ~123)
**Action:**
- Add `mkdirSync('uploads/resumes', { recursive: true })` at startup
- Replace static file serving with an authenticated download endpoint:
```js
// Remove: app.use('/uploads', express.static('./uploads'))
// Add: GET /api/files/:fileId with authentication
```

### 4.6 Fix Graceful Shutdown

**Problem:** SIGTERM/SIGINT handlers reference `server` before it's defined. Database connection not closed.
**File:** `backend/server.js` (lines ~215-227)
**Action:** Move signal handlers AFTER `const server = app.listen(...)`. Close MongoDB connection:
```js
const shutdown = async () => {
  console.log('Shutting down...');
  server.close(async () => {
    await mongoose.connection.close();
    process.exit(0);
  });
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
```

### 4.7 Fix Database Connection Retry Logic

**Problem:** `process.exit(1)` on initial connection failure with no retry. Container environments need retries.
**File:** `backend/src/config/database.js`
**Action:** Add retry with exponential backoff:
```js
async function connectDB(retries = 5, delay = 3000) {
  for (let i = 0; i < retries; i++) {
    try {
      await mongoose.connect(uri);
      console.log('MongoDB connected');
      return;
    } catch (err) {
      if (i === retries - 1) { process.exit(1); }
      console.log(`Retry ${i + 1}/${retries} in ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
      delay *= 2;
    }
  }
}
```

### 4.8 Standardize Email Sender Addresses

**Problem:** Four different `from` addresses used, including Resend sandbox domains that will be spam-filtered.
**File:** `backend/src/lib/resendEmailService.js`
**Action:** Use a single verified domain sender everywhere:
```js
const FROM_EMAIL = process.env.EMAIL_FROM || 'noreply@advance.al';
```
Replace all `from:` fields with `FROM_EMAIL`.

### 4.9 Add Rate Limiting to Refresh Token Endpoint

**Problem:** `/auth/refresh` has no rate limiting. Can be spammed to generate unlimited access tokens.
**File:** `backend/src/routes/auth.js`
**Action:** Add `authLimiter` middleware to the refresh endpoint.

### 4.10 Require Password Confirmation for Account Deletion

**Problem:** Account deletion requires only a valid JWT. Stolen tokens can delete accounts.
**File:** `backend/src/routes/users.js` (lines ~359-384)
**Action:** Require password in request body and verify before deletion:
```js
const { password } = req.body;
if (!password || !(await user.comparePassword(password))) {
  return res.status(401).json({ success: false, message: 'Fjalëkalimi i pasaktë' });
}
```

### 4.11 Add Error Boundary to React App

**Problem:** Any component render error crashes the entire app with a white screen.
**File:** `frontend/src/App.tsx`
**Action:** Add a top-level `<ErrorBoundary>` component wrapping all routes that shows a friendly error page with a "reload" button.

### 4.12 Implement Code Splitting / Lazy Loading

**Problem:** All 17 page components eagerly imported. Entire app downloaded on first load.
**File:** `frontend/src/App.tsx`
**Action:** Lazy-load all page components:
```tsx
const AdminDashboard = React.lazy(() => import('./pages/AdminDashboard'));
const BusinessDashboard = React.lazy(() => import('./pages/BusinessDashboard'));
// etc.
```
Wrap routes in `<Suspense fallback={<LoadingSpinner />}>`.

### 4.13 Fix N+1 API Call for Saved Job Checks

**Problem:** Every `JobCard` makes an individual API call to check saved status. 10 jobs = 10 requests.
**Files:** `frontend/src/components/JobCard.tsx`, `frontend/src/lib/api.ts`, `backend/src/routes/users.js`
**Action:**
- Create a bulk endpoint: `POST /api/users/saved-jobs/check` that accepts `{ jobIds: [...] }` and returns `{ savedJobIds: [...] }`
- In Index.tsx, fetch all saved status at once after loading jobs, pass as props to JobCard
- Remove per-card API calls from JobCard

### 4.14 Fix stats.js — 6 Uncached DB Queries on Every Landing Page Load

**Problem:** `stats.js:14-36` runs 6 parallel database queries (including a `find()` with `populate()`) on every landing page load with no caching. Also, `console.log('Platform statistics:', ...)` runs on every request (line 56).
**File:** `backend/src/routes/stats.js`
**Action:**
- Add in-memory cache with 5-minute TTL for stats results
- Remove or guard the `console.log` behind `NODE_ENV !== 'production'`

### 4.15 Fix send-verification.js Diagnostic Leaks

**Problem:** `send-verification.js:12-13` logs `RESEND_API_KEY exists` and `starts with re_:` on module load. Also, `domains.list()` call at line 70 runs as a "connectivity test" on every email send — unnecessary overhead. Copyright year hardcoded to 2024 (line 128).
**File:** `backend/src/routes/send-verification.js`
**Action:**
- Remove diagnostic console.logs (lines 12-13)
- Remove the `domains.list()` call (line 70)
- Update copyright year to dynamic: `new Date().getFullYear()`

### 4.16 Fix `index.html` Metadata

**Problem:** Title says "albania-jobflow", OpenGraph tags point to Lovable.
**File:** `index.html`
**Action:** Update:
```html
<title>advance.al — Tregu Kryesor i Punësimit në Shqipëri</title>
<meta name="description" content="Gjeni punën tuaj të ëndërruar ose punonjësin ideal në advance.al">
<meta property="og:title" content="advance.al">
<meta property="og:description" content="Tregu Kryesor i Punësimit në Shqipëri">
<!-- Remove Lovable references -->
```

---

## PHASE 5: UX & FUNCTIONALITY POLISH (Professional product quality)

### 5.1 Fix Pagination (Only Shows Pages 1-5)

**Problem:** Pagination renders only pages 1-5 regardless of current page or total pages.
**Files:** `frontend/src/pages/Index.tsx`, `frontend/src/pages/SavedJobs.tsx`
**Action:** Implement proper pagination with ellipsis:
```tsx
// Show: [1] ... [current-1] [current] [current+1] ... [last]
```

### 5.2 Fix Notification Polling

**Problem:** Unread notification count only loaded once on mount, never refreshed.
**File:** `frontend/src/components/Navigation.tsx`
**Action:** Add polling interval:
```tsx
useEffect(() => {
  const interval = setInterval(loadUnreadCount, 30000); // every 30s
  return () => clearInterval(interval);
}, []);
```

### 5.3 Remove Duplicate Toast Systems

**Problem:** Three notification systems active simultaneously (Toaster, Sonner, Mantine Notifications).
**File:** `frontend/src/App.tsx`
**Action:** Standardize on one system (recommend Sonner for its API) and remove the others. Update all toast calls across the app.

### 5.4 Fix Daily & Weekly Digest (Dead Code)

**Problem:** Daily digest hardcodes empty jobs array, weekly digest never sends anything.
**File:** `backend/src/lib/notificationService.js`
**Action:** Either implement properly or remove the dead endpoints entirely to avoid confusion.

### 5.5 Fix Emergency Actions (freeze_posting is a No-Op)

**Problem:** `freeze_posting` emergency action just logs to console, does nothing.
**File:** `backend/src/routes/business-control.js` (lines ~639-641)
**Action:** Implement properly: set a SystemConfiguration flag, check it in job creation route.

### 5.6 Add Work Experience & Education Delete/Edit

**Problem:** Users can add work experience and education but cannot edit or delete them.
**File:** `frontend/src/pages/Profile.tsx`
**Action:** Add edit and delete buttons for each entry, with confirmation dialog for delete.

### 5.7 Fix Phone Number Formatting for Non-Albanian Numbers

**Problem:** Phone formatting always prepends `+355`, breaking diaspora/international numbers.
**File:** `frontend/src/pages/JobSeekersPage.tsx` (lines ~308-309)
**Action:** Check for country code prefix. If starts with `+`, use as-is. If starts with `0`, prepend `+355`. Otherwise, ask user to include country code.

### 5.8 Fix Contact Methods for Unauthenticated Users

**Problem:** Contact buttons visible to unauthenticated users, generating broken templates.
**File:** `frontend/src/pages/JobDetail.tsx`
**Action:** Either:
- Hide contact section for unauthenticated users with a "Kyçu për të kontaktuar" CTA, OR
- Adjust template to not reference user profile when not logged in

### 5.9 Fix "Shiko te gjitha njoftimet" Link (Goes Nowhere)

**Problem:** "View all notifications" link in dropdown does nothing.
**File:** `frontend/src/components/Navigation.tsx`
**Action:** Either:
- Create a `/notifications` page, OR
- Remove the link until the page exists

### 5.10 Fix Report Route Conflict

**Problem:** `GET /admin/stats` is shadowed by `GET /admin/:id` route handler.
**File:** `backend/src/routes/reports.js`
**Action:** Move `/admin/stats` route BEFORE `/admin/:id`.

### 5.11 Add Missing Footer to Index and SavedJobs Pages

**Problem:** Some pages are missing the Footer component.
**Files:** `frontend/src/pages/Index.tsx`, `frontend/src/pages/SavedJobs.tsx`
**Action:** Add `<Footer />` at the end of the page JSX.

### 5.12 Fix Login Success Toast (Never Shows)

**Problem:** `setTimeout` checks stale closure for `isAuthenticated`, which is always `false`.
**File:** `frontend/src/pages/Login.tsx` (lines ~69-82)
**Action:** Have `login()` return a success boolean instead of relying on stale state:
```tsx
const success = await login(email, password);
if (success) toast({ title: "Mirësevini!" });
```

### 5.13 Add Admin Dashboard Navbar Padding

**Problem:** Content hidden behind fixed navbar.
**File:** `frontend/src/pages/AdminDashboard.tsx`
**Action:** Add `pt-20` to the container div.

### 5.14 Remove Useless Embedding Vector Index

**Problem:** Standard ascending index on 1536-dim array provides no benefit for similarity search. Just wastes space.
**File:** `backend/src/models/Job.js` (line ~338)
**Action:** Remove the index: `// jobSchema.index({ 'embedding.vector': 1 }, { sparse: true });`

### 5.15 Extract Tutorial System to Shared Hook

**Problem:** ~300 lines of tutorial/spotlight/scroll-lock code duplicated across 5+ pages.
**Action:** Create `frontend/src/hooks/useTutorial.ts` with the common logic. Refactor all pages to use it.

---

## PHASE 6: SCALABILITY & FUTURE-PROOFING (Pre-scale preparation)

### 6.1 Move File Storage from MongoDB to Object Storage

**Problem:** CV files and profile photos stored as MongoDB Buffer. Won't scale, expensive on Atlas.
**Action:**
- Set up S3/Cloudinary/Supabase Storage
- Store file URL in MongoDB instead of buffer
- Serve files via CDN with signed URLs (for private files) or public URLs (for logos)

### 6.2 Add User Embedding Pagination

**Problem:** Semantic matching loads ALL users with 1536-dim vectors into memory. OOM at scale.
**Files:** `backend/src/services/userEmbeddingService.js`, `backend/src/services/candidateMatching.js`
**Action:** Use cursor-based iteration or paginated batches (1000 at a time).

### 6.3 Add Redis Caching Layer

**Action:** Cache:
- Location list (rarely changes)
- System configuration (rarely changes)
- Active pricing rules (rarely changes)
- Job counts by category/location (cache 5 min)
- User notification counts (cache 30s)

### 6.4 Implement Proper Logging

**Action:**
- Backend: Winston with JSON structured logging, log levels (error, warn, info, debug)
- Frontend: Remove all console.log, use Sentry for error tracking
- Add request ID to all logs for tracing

### 6.5 Add Health Check Improvements

**File:** `backend/server.js`
**Action:** Include in health check:
- MongoDB connection status
- OpenAI API reachability
- Resend API reachability
- Memory usage
- Uptime

### 6.6 Add Data Retention Policies

**Action:**
- Auto-delete notifications older than 90 days
- Archive applications older than 1 year
- Clean up expired job postings (soft-delete after 60 days past expiry)
- Purge orphaned files monthly

### 6.7 Add Monitoring & Alerting

**Action:**
- Sentry for error tracking (backend + frontend)
- Uptime monitoring for health endpoint
- Alert on error rate spikes
- Alert on high response times

---

## IMPLEMENTATION PRIORITY ORDER

| Phase | Items | Effort Est. | Impact |
|-------|-------|-------------|--------|
| **Phase 1** | 13 security fixes | 2-3 days | Prevents breaches & exploits |
| **Phase 2** | 15 broken flow fixes | 2-3 days | Makes product functional |
| **Phase 3** | 12 data integrity fixes | 1-2 days | Prevents data corruption |
| **Phase 4** | 14 production hardening | 2-3 days | Production reliability |
| **Phase 5** | 15 UX/functionality fixes | 2-3 days | Professional quality |
| **Phase 6** | 7 scalability items | 3-5 days | Future growth readiness |

**Total estimated effort: 12-19 working days**

---

## FILES AFFECTED (SUMMARY)

### Backend (Must Modify — 25 files)
- `backend/server.js` — CORS, body limit, shutdown, uploads, suspension scheduler
- `backend/src/middleware/auth.js` — JWT algorithm, token functions
- `backend/src/routes/auth.js` — Password policy, refresh rate limit, token rotation
- `backend/src/routes/jobs.js` — Remove debug queries, fix filters, status stripping, tier validation, add `expiresAt`/`applicationMethod` to PUT destructure, create `updateJobValidation` middleware, pagination
- `backend/src/routes/applications.js` — Null checks, status transitions
- `backend/src/routes/admin.js` — Regex escaping, self-delete prevention, soft delete
- `backend/src/routes/users.js` — Upload dir, password confirmation, IDs
- `backend/src/routes/notifications.js` — Add auth to all test/admin endpoints, rate limiting
- `backend/src/routes/quickusers.js` — Rate limiting, auth, route ordering
- `backend/src/routes/reports.js` — Null checks, regex escaping, route ordering
- `backend/src/routes/business-control.js` — Regex escaping, emergency actions, validation
- `backend/src/routes/matching.js` — Mock payment, error messages, auth
- `backend/src/routes/cv.js` — Max length limit, rate limiting, error messages
- `backend/src/routes/stats.js` — Add caching, remove debug console.log
- `backend/src/routes/send-verification.js` — Re-enable rate limiter, remove diagnostics, fix copyright year
- `backend/src/routes/verification.js` — Re-enable rate limiter, move codes to MongoDB
- `backend/src/lib/resendEmailService.js` — HTML escaping, sender addresses
- `backend/src/lib/notificationService.js` — HTML escaping, digest implementation
- `backend/src/services/openaiService.js` — Input limits
- `backend/src/services/userEmbeddingService.js` — Pagination
- `backend/src/services/candidateMatching.js` — Pagination, fix skills scoring
- `backend/src/services/jobEmbeddingService.js` — Operator precedence, timeout cleanup
- `backend/src/models/User.js` — Email regex, password length
- `backend/src/models/Job.js` — Remove useless index, atomic increment, slug
- `backend/src/models/Application.js` — Partial unique index (MIGRATION REQUIRED), count decrement
- `backend/src/config/database.js` — Retry logic, SIGTERM handler

### Frontend (Must Modify — 19 files)
- `frontend/src/App.tsx` — Route protection, lazy loading, error boundary, register route
- `frontend/src/contexts/AuthContext.tsx` — Redirect fix (not loop, just wrong UX), state sync, login return value
- `frontend/src/lib/api.ts` — Remove console logs, token refresh, 401 handling
- `frontend/src/lib/formValidation.ts` — Fix `custom` validator to pass formData, fix endDate message, fix phone required inconsistency
- `frontend/src/pages/Login.tsx` — Remove demo creds, fix stale closure, forgot password
- `frontend/src/pages/Index.tsx` — Job type filter, core filters, pagination
- `frontend/src/pages/JobDetail.tsx` — Error handling, expired job check, contact auth
- `frontend/src/pages/EditJob.tsx` — Add `externalApplicationUrl`/`applicationEmail` fields, fix checkbox type safety
- `frontend/src/pages/Profile.tsx` — Delete/edit entries, auth guard
- `frontend/src/pages/EmployerDashboard.tsx` — Confirmation dialogs, messaging UI, console logs
- `frontend/src/pages/EmployersPage.tsx` — Fix confirmPassword validation (fake), phone inconsistency
- `frontend/src/pages/EmployerRegister.tsx` — Data loss fix, proper names
- `frontend/src/pages/PostJob.tsx` — Auth via context, expiry inclusion
- `frontend/src/pages/AdminDashboard.tsx` — Dead code, fake data, navbar padding, division by zero
- `frontend/src/pages/SavedJobs.tsx` — Pagination, footer
- `frontend/src/pages/JobSeekersPage.tsx` — Validation consistency, phone formatting
- `frontend/src/components/Navigation.tsx` — Fix MutationObserver (scoped, not removed), notification polling
- `frontend/src/components/JobCard.tsx` — Bulk saved check
- `index.html` — Metadata & branding

### New Files to Create
- `backend/src/utils/sanitize.js` — `escapeRegex()`, `escapeHtml()`, `sanitizeLimit()`
- `backend/src/models/VerificationCode.js` — TTL-indexed model for verification codes
- `frontend/src/hooks/useTutorial.ts` — Shared tutorial system
- `frontend/src/pages/ForgotPassword.tsx` — Password reset flow
- `frontend/src/components/ErrorBoundary.tsx` — Global error boundary
- `frontend/src/components/ConfirmDialog.tsx` — Reusable confirmation dialog

### One-Time Migration Scripts
- Drop Application unique index: `db.applications.dropIndex("jobId_1_jobSeekerId_1")` before deploying finding 3.2

---

## CONCLUSION

This platform has a **strong architectural foundation** and comprehensive feature set. The core domain logic (jobs, applications, matching, notifications) is well-designed. The issues found are primarily:

1. **Security gaps** from rapid development (test endpoints left public, debug code in production, privilege escalation via PUT body)
2. **Incomplete features** (digest emails, emergency actions, forgot password, internal messaging)
3. **Missing production hardening** (error sanitization, rate limiting, input validation, stats caching)
4. **Frontend state management gaps** (token refresh, state sync, route protection)
5. **Validation system bugs** (formValidation.ts custom validator broken, confirmPassword always passes)

None of these are architectural problems — they're all fixable without restructuring. After implementing Phases 1-4, the platform will be secure and reliable enough for a national launch. Phases 5-7 bring it to professional quality and prepare for scale.

**This plan has been cross-verified** against actual source code by 5 independent verification agents. 1 false positive was removed, 3 findings corrected, 17 new bugs added, and 4 implementation conflicts documented with mitigations.

---

## PHASE 7: LOGIC & USER FLOW FIXES (Every button, every flow)

> Complete end-to-end audit of every user journey. Every item below is a verified logic issue where the feature doesn't do what it claims to do.

---

### 7A: JOB SEEKER FLOW LOGIC BUGS

#### 7A.1 Full Registration Uses Wrong Validation Rules
**Problem:** `handleFullSubmit` at `JobSeekersPage.tsx:294` validates against `jobSeekerSignupRules.quickForm` instead of `fullForm`. The quick rules don't require password, city, or education. The full registration form has weaker validation than intended.
**File:** `frontend/src/pages/JobSeekersPage.tsx`
**Action:** Change line 294 from `jobSeekerSignupRules.quickForm` to `jobSeekerSignupRules.fullForm`, and ensure the form actually collects all fields that `fullForm` requires.

#### 7A.2 Full Registration Doesn't Update Auth State
**Problem:** `handleFullSubmit` calls `authApi.register()` directly (line 311) instead of `register()` from `useAuth()`. The API call saves token to localStorage but AuthContext state (`isAuthenticated`, `user`) is never updated. After registration, the user navigates to `/jobs` but appears logged out (nav shows login button) until page refresh.
**File:** `frontend/src/pages/JobSeekersPage.tsx`
**Action:** Replace `authApi.register(...)` with `register(...)` from `useAuth()` hook. This ensures both localStorage AND React state are updated.

#### 7A.3 1-Click Apply Has No Auth Guard
**Problem:** The "Aplikim 1-klik" button in `JobDetail.tsx` calls `handleSimpleApply` which does NOT check authentication or user type (unlike the "Apliko Shpejt" button which does). An unauthenticated user clicking this gets a raw API error.
**File:** `frontend/src/pages/JobDetail.tsx` (lines ~148-184, ~785-803)
**Action:** Add the same auth check from `handleQuickApply` to `handleSimpleApply`:
```tsx
if (!isAuthenticated) { navigate('/login'); return; }
if (user?.userType !== 'jobseeker') { toast({ title: 'Error', description: 'Vetëm punëkërkuesit mund të aplikojnë' }); return; }
```

#### ~~7A.4 REMOVED — FALSE POSITIVE~~
**Verification result:** Both frontend (`SavedJobs.tsx:51` reads `response.data.jobs`) and backend (`users.js:887-898` responds with `{ jobs: savedJobs }`) use the same field name `jobs`. No mismatch exists.

#### 7A.5 `handleUnsaveJob` Defined But Never Wired to UI
**Problem:** `SavedJobs.tsx` lines 80-113 define a `handleUnsaveJob` function, but it is never passed to any component. Unsaving a job from the saved jobs list does not remove it from the displayed list until page refresh.
**File:** `frontend/src/pages/SavedJobs.tsx`
**Action:** Pass `handleUnsaveJob` as `onSaveToggle` callback to `JobCard`, or add an explicit unsave button per card.

#### 7A.6 Notifications Don't Link to Related Content
**Problem:** Notification items in the dropdown show title and message but clicking them only marks as read and expands text. They do NOT navigate to the related job or application, even though `relatedJob` and `relatedApplication` fields exist.
**File:** `frontend/src/components/Navigation.tsx`
**Action:** Add click-to-navigate: if notification has `relatedJob`, link to `/jobs/${relatedJob}`; if `relatedApplication`, link to application detail.

#### 7A.7 "View All Notifications" Link Is Dead
**Problem:** "Shiko te gjitha njoftimet" at the bottom of the notification dropdown has a TODO comment and does nothing when clicked.
**File:** `frontend/src/components/Navigation.tsx` (lines ~347-356)
**Action:** Either create a `/notifications` page, or remove the link.

#### 7A.8 Save Job While Logged Out Shows Toast But No Login Redirect
**Problem:** Clicking bookmark when not logged in shows a transient toast "Duhet te kyceni" but doesn't redirect to login or show a persistent CTA.
**File:** `frontend/src/components/JobCard.tsx` (lines ~56-63)
**Action:** Navigate to `/login` with a return path, or show a login modal.

#### 7A.9 Quick Registration Error Messages Are Generic
**Problem:** Both quick and full registration catch blocks show a generic Albanian error message instead of the specific backend error (e.g., "Email already exists").
**Files:** `frontend/src/pages/JobSeekersPage.tsx` (lines ~330-334, ~400-406)
**Action:** Use `error.message` from the API response for the toast description.

#### 7A.10 Profile: Cannot Edit or Delete Work Experience / Education
**Problem:** Users can add work experience and education entries, but the UI has no edit or delete buttons. Once added, entries are permanent. The API endpoints for update/delete exist in `api.ts` but are never called.
**File:** `frontend/src/pages/Profile.tsx` (lines ~1667-1725)
**Action:** Add edit (opens pre-filled modal) and delete (with confirmation) buttons to each entry.

---

### 7B: EMPLOYER FLOW LOGIC BUGS

#### 7B.1 Employer Registration Loses Description & Website
**Problem:** Both `EmployersPage.tsx` (line ~777) and `EmployerRegister.tsx` (line ~90) collect `description` and `website` from the user but never include them in the `register()` API call. Data is silently discarded.
**Files:** `frontend/src/pages/EmployersPage.tsx`, `frontend/src/pages/EmployerRegister.tsx`
**Action:** Include `description` and `website` in the registration payload. Update the backend `register` route to accept and save these fields in `employerProfile`.

#### 7B.2 Industry Field Commented Out, Hardcoded to 'Tjetër'
**Problem:** In `EmployersPage.tsx`, the industry `<Select>` is commented out (lines ~1031-1037). The registration always sends `industry: 'Tjetër'` regardless of what the employer's actual industry is.
**File:** `frontend/src/pages/EmployersPage.tsx`
**Action:** Uncomment the industry selector or provide an alternative. Ensure the industry values match the backend enum.

#### 7B.3 Industry Values Inconsistent Across Three Forms
**Problem:** Three different value systems for industry: `EmployerRegister.tsx` uses "Teknologji Informacioni", `EmployersPage.tsx` hardcodes "Tjetër", and `EmployerDashboard.tsx` settings uses "teknologji". Data mismatch between registration and settings.
**Files:** All three employer-related pages
**Action:** Create a shared `INDUSTRY_OPTIONS` constant used everywhere.

#### 7B.4 Editing a Job Fails — Missing platformCategories
**Problem:** `EditJob.tsx` does NOT include `platformCategories` in the PUT payload. The backend validation requires `platformCategories.diaspora`, `.ngaShtepia`, `.partTime`, `.administrata`, `.sezonale` as booleans. The update request returns 400: "Diaspora duhet te jete true ose false". **Jobs cannot be edited.**
**File:** `frontend/src/pages/EditJob.tsx`
**Action:** Include `platformCategories` fields in the update payload, pre-populated from the existing job data.

#### 7B.4a Backend PUT Handler Missing `expiresAt` and `applicationMethod` Fields

**Problem:** The PUT handler at `jobs.js:968-981` destructures fields from `req.body` but does NOT include `expiresAt` or `applicationMethod`. The `Object.assign` on line 992 will never update these fields. Editing a job's expiry date or application method silently does nothing.
**File:** `backend/src/routes/jobs.js` (lines ~968-981)
**Action:** Add `expiresAt` and `applicationMethod` to the destructured fields and include them in the Object.assign.

#### 7B.4b EditJob Missing `externalApplicationUrl` and `applicationEmail` Fields

**Problem:** The Job model has `externalApplicationUrl` (Job.js:163) and the form offers "external" and "email" application methods, but EditJob has no input fields for the external URL or application email address.
**File:** `frontend/src/pages/EditJob.tsx`
**Action:** Add conditional input fields:
- Show URL input when `applicationMethod === 'external'`
- Show email input when `applicationMethod === 'email'`

#### 7B.4c EditJob Checkbox Type Safety Issue

**Problem:** `EditJob.tsx:519` — `onCheckedChange={(checked) => handleInputChange('showSalary', checked)}` — the `checked` parameter from Radix `Checkbox.onCheckedChange` can be `boolean | 'indeterminate'`, but the handler expects `string | boolean`.
**File:** `frontend/src/pages/EditJob.tsx` (line ~519)
**Action:** Coerce value: `onCheckedChange={(checked) => handleInputChange('showSalary', checked === true)}`

#### 7B.5 No Pause/Resume Button for Jobs
**Problem:** The backend supports `PATCH /api/jobs/:id/status` with `active`/`paused`/`closed`, and the frontend has `jobsApi.updateJobStatus()`. But the EmployerDashboard has no UI button to pause or resume a job. The only job actions are: view, edit, delete, candidates.
**File:** `frontend/src/pages/EmployerDashboard.tsx`
**Action:** Add a pause/resume toggle to the job action dropdown.

#### 7B.6 No Internal Messaging UI for Employer-Applicant Communication
**Problem:** The backend has `POST /api/applications/:id/message` and `applicationsApi.sendMessage()` exists. But the EmployerDashboard has NO message compose UI for the internal messaging system (Application model's `messages` array). There IS an external contact modal for candidate matching (`EmployerDashboard.tsx:877-921`) that generates pre-filled templates for `mailto:`, `tel:`, and `wa.me` links — but this only works for candidate matching, not regular applications. Regular applicants have no contact mechanism.
**File:** `frontend/src/pages/EmployerDashboard.tsx`
**Action:** Add a "Send Message" button in the application detail modal that opens a message compose form, calling `applicationsApi.sendMessage()`. Optionally also add the external contact buttons (email/WhatsApp/phone) from the candidate matching modal.

#### 7B.7 Custom Answers & Cover Letters Not Shown to Employers
**Problem:** When an applicant submits custom question answers or a cover letter, the employer detail modal does NOT display this data. The `Application` model has `customAnswers` and `coverLetter` fields, but the UI ignores them.
**File:** `frontend/src/pages/EmployerDashboard.tsx`
**Action:** Display `customAnswers` and `coverLetter` in the application detail modal.

#### 7B.8 No Application Status Filter UI
**Problem:** The Applications tab shows all applications in a flat list. There's no dropdown to filter by status (pending, viewed, shortlisted, rejected, hired). The backend supports the `status` filter parameter.
**File:** `frontend/src/pages/EmployerDashboard.tsx`
**Action:** Add a status filter dropdown above the applications list.

#### 7B.9 Contact Buttons Only Available in Candidate Matching, Not Regular Applications
**Problem:** Email/WhatsApp/Phone contact buttons only exist in the candidate matching modal. For regular applicants, the employer must manually copy contact info from the detail view. No direct contact buttons.
**File:** `frontend/src/pages/EmployerDashboard.tsx`
**Action:** Add email/phone/WhatsApp contact buttons in the application detail modal.

#### 7B.10 Salary Silently Discarded If Only One Field Filled
**Problem:** `PostJob.tsx:349` requires BOTH `salaryMin` AND `salaryMax` to be present. If the employer fills only minimum salary, the entire salary object is undefined. No warning shown.
**File:** `frontend/src/pages/PostJob.tsx`
**Action:** Either allow single-value salary (min only or max only), or show a validation message that both are required.

#### 7B.11 `expiresAt` Never Sent to Backend
**Problem:** The job form has an `expiresAt` field but it's never included in the submission payload at `PostJob.tsx:333-358`. The backend uses its own 30-day default.
**File:** `frontend/src/pages/PostJob.tsx`
**Action:** Include `expiresAt` in the job data payload.

#### 7B.12 Company Profile Shows Hardcoded "Kontakt sh.p.k" Text for Every Company
**Problem:** `CompanyProfile.tsx` lines 374-378 and 429-457 show hardcoded paragraphs about "Kontakt sh.p.k" company for EVERY company profile, regardless of which company is being viewed.
**File:** `frontend/src/pages/CompanyProfile.tsx`
**Action:** Remove the hardcoded text. Show the actual company description from the API response.

#### 7B.13 Company Profile Has 6 Dead Buttons
**Problem:** On `CompanyProfile.tsx`: mail button (no handler), phone button (no handler), message button (no handler), "Shiko pozicionet e lira" button (no handler), LinkedIn/Instagram/Facebook icons (no links).
**File:** `frontend/src/pages/CompanyProfile.tsx`
**Action:** Wire up contact buttons with company data, or remove them if data isn't available. Remove social media buttons until there's a field for social links.

#### 7B.14 Two Employer Registration Pages — Confusing
**Problem:** `EmployersPage.tsx` (at `/employers`) and `EmployerRegister.tsx` (at `/employer-register`) are two completely different registration forms with different validation, different fields, and different bugs. Both are live and reachable.
**Action:** Deprecate one. Recommend keeping `EmployersPage.tsx` (more modern, better validation) and removing or redirecting `/employer-register`.

---

### 7C: ADMIN FLOW LOGIC BUGS

#### 7C.1 `adminApi.getReportActions` Does Not Exist — Runtime Error
**Problem:** `AdminDashboard.tsx:925` calls `adminApi.getReportActions({ limit: 10 })` but this method is never defined in `api.ts`. This throws a runtime error on every admin dashboard load. The error is caught so it degrades to showing an empty actions history, but the error fires on every load.
**File:** `frontend/src/pages/AdminDashboard.tsx`, `frontend/src/lib/api.ts`
**Action:** Either implement `getReportActions` in api.ts with a matching backend endpoint, or remove the call.

#### 7C.2 Job Rejection Status Mismatch — Reported Jobs Always Empty
**Problem:** Admin job rejection at `admin.js:660` sets `job.status = 'closed'`. But the "Reported Jobs" modal in `AdminDashboard.tsx:731` loads jobs with `status: 'rejected'`. Since the backend never sets status to `'rejected'`, the reported jobs view is always empty.
**Files:** `backend/src/routes/admin.js`, `frontend/src/pages/AdminDashboard.tsx`
**Action:** Either change the backend to use `status: 'rejected'` or change the frontend filter to `status: 'closed'`.

#### 7C.3 Configuration "Sistemi" Tab Shows Nothing
**Problem:** Config modal `TabsTrigger` at `AdminDashboard.tsx:2508` uses `value="system"` but the corresponding `TabsContent` at line 2592 uses `value="business"`. The system settings tab shows empty content.
**File:** `frontend/src/pages/AdminDashboard.tsx`
**Action:** Change `TabsContent value="business"` to `value="system"` on line 2592.

#### 7C.4 Configuration Panel Is Inaccessible — No UI Button
**Problem:** The `handleConfiguration()` function and `configModal` state exist, but there is no visible button in the current tab layout to open the configuration modal.
**File:** `frontend/src/pages/AdminDashboard.tsx`
**Action:** Add a "Konfigurimi" button to the dashboard UI (e.g., in the header or as a tab).

#### 7C.5 Suspend User Has No Reason Prompt or Duration
**Problem:** Admin user suspension at `AdminDashboard.tsx:2031` hardcodes `'Pezulluar nga admin'` as the reason. No modal prompts for a custom reason or duration. Furthermore, the suspension code sets old fields (`user.status`, `user.suspensionReason`) instead of populating `suspensionDetails` (which the auth middleware reads for expiry).
**Files:** `frontend/src/pages/AdminDashboard.tsx`, `backend/src/routes/admin.js`
**Action:** Add a suspension modal with reason text input and optional duration. Update the backend to populate `suspensionDetails` correctly.

#### 7C.6 "Freeze Posting" Emergency Control Does Nothing
**Problem:** `business-control.js:639-641` only does `console.log('Job posting frozen')`. No flag is set, no system configuration is updated, no job creation is actually blocked.
**File:** `backend/src/routes/business-control.js`
**Action:** Set a `SystemConfiguration` flag like `platform.freeze_posting = true`, and check it in the job creation route.

#### 7C.7 "Pause Platform" Button Returns 400 Error
**Problem:** `BusinessDashboard.tsx:327` sends `executeEmergencyControl('pause_platform')` but this action doesn't exist in the backend switch statement at `business-control.js:638-672`. It hits the default case and returns 400.
**File:** `frontend/src/pages/BusinessDashboard.tsx`
**Action:** Either implement the `pause_platform` case in the backend, or remove the button from the UI.

#### 7C.8 Bulk Notification History — Dead Feature
**Problem:** Backend endpoint and `adminApi.getBulkNotificationHistory()` exist, but there's no UI element in AdminDashboard to view notification history or delivery stats.
**File:** `frontend/src/pages/AdminDashboard.tsx`
**Action:** Add a "History" tab or button in the bulk notification section.

#### 7C.9 Whitelist (Free Posting) UI Is a Stub
**Problem:** The "Miq" (Friends) tab in BusinessDashboard has a search input that only logs to console (line 817) and a permanently disabled "Zgjedh Punedhenes" button (line 826). The backend works.
**File:** `frontend/src/pages/BusinessDashboard.tsx`
**Action:** Wire up the search to `companiesApi.searchCompanies()` or `adminApi.getAllUsers({ userType: 'employer' })`. Enable the select button and call the whitelist endpoint.

#### 7C.10 Monthly Revenue Target Is Hardcoded at 75%
**Problem:** `BusinessDashboard.tsx:764-765` shows a progress bar at 75% with hardcoded text "75% e objektivit muajor". This is not calculated from real data.
**File:** `frontend/src/pages/BusinessDashboard.tsx`
**Action:** Either calculate from real revenue analytics or remove the progress bar.

#### 7C.11 Old Modal Reports System Contains Simulated Fake Reports
**Problem:** `AdminDashboard.tsx` lines 835-876 (`loadReportsData`) creates fake "simulated reports" from real active users, making innocent users appear reported. This code is dead (modal never opens) but should be removed.
**File:** `frontend/src/pages/AdminDashboard.tsx`
**Action:** Delete the entire `loadReportsData` function, the `reportsModal` state, and the associated modal JSX.

#### 7C.12 Admin Rejection Reason Is Hardcoded — No Custom Input
**Problem:** Job rejection always uses "Refuzuar nga administratori" as the reason. Admin cannot provide a custom reason.
**File:** `frontend/src/pages/AdminDashboard.tsx`
**Action:** Add a reason input modal before rejecting a job.

---

### 7D: BUSINESS LOGIC BUGS

#### 7D.1 Pricing Rule Demand Check Uses Math.random()
**Problem:** `PricingRule.js:250` — `checkDemand()` returns `Math.random() > 0.7`. Whether a demand surcharge is applied is literally random. The same job posted twice gets different prices.
**File:** `backend/src/models/PricingRule.js`
**Action:** Replace with actual demand calculation: count jobs posted in the last 24h in the same category, compare against threshold.

#### 7D.2 Revenue Analytics Count Unpaid Jobs
**Problem:** `jobs.js:858` increments revenue for ALL created jobs, including `pending_payment` ones. Revenue figures are inflated with money never collected.
**File:** `backend/src/routes/jobs.js`
**Action:** Only record revenue when `job.status === 'active'` (i.e., payment confirmed or free posting).

#### 7D.3 Notifications Sent for Pending Payment Jobs
**Problem:** `jobs.js:904` triggers `notifyMatchingUsers` for newly created jobs regardless of status. Users get job alerts for jobs that aren't live yet.
**File:** `backend/src/routes/jobs.js`
**Action:** Only send notifications when `job.status === 'active'`.

#### 7D.4 New Job Notifications Miss All Semantic Matches
**Problem:** At job creation, notifications fire (line 904) BEFORE the embedding is queued (line 920). The notification function checks for job embedding and finds none, so full jobseeker semantic matching returns empty. Only keyword fallback works for QuickUsers.
**File:** `backend/src/routes/jobs.js`
**Action:** Queue notifications AFTER embedding generation completes, or re-run matching when embedding is ready.

#### 7D.5 Semantic Matching Ignores User Frequency Preferences
**Problem:** `userEmbeddingService.findSemanticMatchesForJob()` checks `isActive`, `convertedToFullUser`, and `embedding.status`, but does NOT filter by `preferences.emailFrequency` or `lastNotifiedAt`. Daily/weekly users with embeddings get notified on every job posting, bypassing their frequency choice.
**File:** `backend/src/services/userEmbeddingService.js`
**Action:** Add frequency/cooldown filtering to the semantic matching query.

#### 7D.6 Candidate Match Skills Score Rewards Fewer Skills
**Problem:** `candidateMatching.js:81` — `matchRatio = matchedSkills / candidateSkills.length`. A candidate with 1 matching skill out of 1 total scores 100% (25/25 points), even if the job requires 10 skills. The denominator should be the MAX of candidate skills and job requirements.
**File:** `backend/src/services/candidateMatching.js`
**Action:** Change to: `matchRatio = matchedSkills / Math.max(candidateSkills.length, jobRequirements.length)` or similar weighted approach.

#### 7D.7 Report Post-Save Admin Notification Is Broken
**Problem:** `Report.js:411` tries to destructure `{ notifyAdmins }` from `notificationService.js`, but that module exports a default singleton class, not named exports. `notifyAdmins` is always `undefined`. Admins are never notified of new reports.
**File:** `backend/src/models/Report.js`
**Action:** Fix the import to use the default export's method: `const notificationService = (await import('../lib/notificationService.js')).default; await notificationService.notifyAdmins?.(...)`

#### 7D.8 Temporary Suspension Auto-Lift Never Runs
**Problem:** `User.checkExpiredSuspensions()` static method exists (User.js:560-572) but is never called by any scheduler, cron, or interval. Temporary suspensions never auto-lift; users stay suspended permanently until an admin manually unsuspends.
**File:** `backend/server.js` or create a scheduler
**Action:** Add a periodic check: `setInterval(() => User.checkExpiredSuspensions(), 60 * 60 * 1000)` (hourly) in server.js.

#### 7D.9 Four Notification Types Are Dead Code
**Problem:** `application_received`, `message_received`, `job_expired`, and `interview_scheduled` are defined in the Notification model enum but NEVER created by any code. Employers get no in-app notification when someone applies. No one is notified about expiring jobs.
**File:** `backend/src/models/Notification.js`, relevant route files
**Action:**
- `application_received`: Create in `applications.js` POST handler when a new application is submitted
- `message_received`: Create in `applications.js` message handler
- `job_expired`: Add a daily cron that finds newly-expired jobs and notifies employers
- `interview_scheduled`: Create when status changes to shortlisted (or add explicit interview scheduling)

#### 7D.10 Verification Codes Stored In-Memory — Lost on Server Restart
**Problem:** `verification.js:11` — `const verificationCodes = new Map()`. All pending verification codes vanish when the server restarts.
**File:** `backend/src/routes/verification.js`
**Action:** Store verification codes in MongoDB (create a `VerificationCode` model with TTL index) or Redis.

#### 7D.11 SMS Verification Is Mock-Only
**Problem:** `verification.js:122-125` — SMS just logs to console and returns true. Users selecting SMS verification never receive anything.
**File:** `backend/src/routes/verification.js`
**Action:** Either implement real SMS via Twilio, or disable SMS as an option in the UI.

#### 7D.12 Payment Pipeline Is Missing — Jobs Stuck in pending_payment
**Problem:** Jobs with `pricing.finalPrice > 0` go to `pending_payment` status. There is no payment gateway, no checkout flow, and no way to transition these jobs to `active`. They are permanently stuck.
**Action:** Phase 1 decision: Either make all basic job posting free (remove pricing), integrate a payment gateway (Stripe), or add admin manual approval of pending_payment jobs.

---

### 7E: CROSS-CUTTING FEATURE LOGIC BUGS

#### 7E.1 Similar Jobs Location Matching Is Broken
**Problem:** `SimilarJobs.tsx:77` sends `location: currentJob.location?.city` but the API accepts `city`, not `location`. The location parameter is silently ignored, so similar jobs come from all cities.
**File:** `frontend/src/components/SimilarJobs.tsx`
**Action:** Change `location` to `city` in the API params.

#### 7E.2 Job Recommendations Component Not Used on Index Page
**Problem:** `JobRecommendations` component works and backend endpoint works, but the component is never imported or rendered on `Index.tsx`. The feature is invisible to users.
**File:** `frontend/src/pages/Index.tsx`
**Action:** Import and render `<JobRecommendations />` on the Index page for authenticated job seekers.

#### 7E.3 CompaniesPage.tsx Is Dead Code — CompaniesPageSimple.tsx Used Instead
**Problem:** `App.tsx:50` routes `/companies` to `CompaniesPageSimple`, making the full-featured `CompaniesPage.tsx` unreachable. The simple version has no pagination (hardcoded limit of 50) and limited functionality.
**File:** `frontend/src/App.tsx`
**Action:** Either use the full `CompaniesPage.tsx` or merge the best features of both.

#### 7E.4 Company Size Filter Does Nothing
**Problem:** `CompaniesPage.tsx:84` explicitly documents "selectedSize filter is not implemented in the backend yet". Users can select a company size filter but it has no effect.
**Action:** Implement backend filtering by company size, or remove the filter from the UI.

#### 7E.5 About Page Statistics Are Hardcoded
**Problem:** `AboutUs.tsx` lines 105-126 show "500+ Punëkërkues", "1200+ Punë", "150+ Kompani", "95% Kënaqësi" — all hardcoded. The stats API (`/api/stats`) provides real numbers but is not called.
**File:** `frontend/src/pages/AboutUs.tsx`
**Action:** Fetch real stats from the API and display them.

#### 7E.6 Footer Social Media Links Are All Dead (#)
**Problem:** `Footer.tsx` lines 35-43 — LinkedIn, Twitter, Facebook, Instagram all link to `#`.
**File:** `frontend/src/components/Footer.tsx`
**Action:** Either add real social media URLs or remove the links.

#### 7E.7 404 Page Uses `<a>` Instead of React Router `<Link>`
**Problem:** `NotFound.tsx:13` uses a plain `<a href="/">` which causes a full page reload when navigating home.
**File:** `frontend/src/pages/NotFound.tsx`
**Action:** Replace with `<Link to="/">` from React Router.

#### 7E.8 QuickUser Banner Shows for Logged-In Users Too
**Problem:** `QuickUserBanner.tsx` renders for all users including those already logged in, encouraging them to register when they already have an account.
**File:** `frontend/src/components/QuickUserBanner.tsx`
**Action:** Check `isAuthenticated` and return `null` if logged in.

#### 7E.9 Verification Rate Limiting Completely Disabled
**Problem:** Both `verification.js` and `send-verification.js` have rate limiters commented out. Verification endpoints can be brute-forced or spammed.
**Files:** `backend/src/routes/verification.js`, `backend/src/routes/send-verification.js`
**Action:** Re-enable rate limiting.

#### 7E.10 Email Branding Inconsistency
**Problem:** Some emails say "PunaShqip.al" (`verification.js:65`), others say "advance.al" (`send-verification.js:91`), copyright years vary between 2024, 2025, and 2026 across different templates.
**Files:** All email template files
**Action:** Standardize all email templates to use "advance.al" branding and "2026" copyright year.

---

## VERIFIED IMPLEMENTATION SUMMARY

| Phase | Items | Effort Est. | Impact |
|-------|-------|-------------|--------|
| **Phase 1** | 16 security fixes (+3 new) | 3-4 days | Prevents breaches & exploits |
| **Phase 2** | 15 broken flow fixes | 2-3 days | Makes product functional |
| **Phase 3** | 16 data integrity fixes (+4 new) | 2-3 days | Prevents data corruption |
| **Phase 4** | 16 production hardening (+2 new) | 2-3 days | Production reliability |
| **Phase 5** | 15 UX/functionality fixes | 2-3 days | Professional quality |
| **Phase 6** | 7 scalability items | 3-5 days | Future growth readiness |
| **Phase 7A** | 9 job seeker logic fixes (-1 false positive) | 1-2 days | Job seeker flows work correctly |
| **Phase 7B** | 17 employer logic fixes (+3 new) | 2-3 days | Employer flows work correctly |
| **Phase 7C** | 12 admin logic fixes | 1-2 days | Admin panel works correctly |
| **Phase 7D** | 12 business logic fixes | 2-3 days | Backend logic produces correct results |
| **Phase 7E** | 10 cross-cutting fixes | 1 day | Remaining features work correctly |

**Total: 145 verified issues across 11 sub-phases. Estimated effort: 22-32 working days.**

*Changes from original audit: +12 newly discovered findings, -1 false positive (7A.4), 3 findings corrected for accuracy (2.2, 7B.6, 1.12), 4 conflict mitigations added.*

### Recommended Implementation Order:
1. **Phase 1** (security) → must be first, includes new privilege escalation fix (1.14)
2. **Phase 7D.12** (payment decision) → determines if pricing system stays or goes
3. **Phase 2** (broken flows) + **Phase 7B.4** (EditJob) → most impactful broken features
4. **Phase 7A** (job seeker logic) + **Phase 7B** (employer logic) → core user flows
5. **Phase 3** (data integrity) → includes critical formValidation.ts fixes (3.12-3.14)
6. **Phase 7C** (admin logic) → admin needs working tools
7. **Phase 4** (hardening) → production stability, includes stats.js caching (4.14)
8. **Phase 7D** (business logic) → correct behavior for automated systems
9. **Phase 5** (UX polish) + **Phase 7E** (cross-cutting) → final polish
10. **Phase 6** (scalability) → prepare for growth

---

## CONFLICT ANALYSIS

> The following proposed fixes have implementation dependencies or conflicts. Each includes a mitigation strategy.

### Conflict 1: MutationObserver Removal (Finding 2.12)
**Risk:** HIGH
**What conflicts:** Removing the MutationObserver from Navigation.tsx will re-introduce Radix UI layout shift — when any dropdown/dialog opens, `body` gets `padding-right` to compensate for scrollbar disappearing, causing visible content jump.
**Mitigation:** Do NOT simply remove it. Use one of the three scoped approaches documented in finding 2.12 (scope to nav dropdown, use `modal={false}`, or CSS-only fix).

### Conflict 2: Stripping `tier` from Job Creation (Finding 1.7)
**Risk:** MEDIUM
**What conflicts:** Stripping `tier` from `req.body` would break the legitimate premium tier selection feature. Employers need to select their tier during job posting.
**Mitigation:** Only strip `status` (not `tier`). Validate `tier` against the enum `['basic', 'premium', 'featured']` instead. Updated in finding 1.7.

### Conflict 3: Application Unique Index Change (Finding 3.2)
**Risk:** MEDIUM
**What conflicts:** Changing the Application unique index to a partial index requires explicitly dropping the old index first. MongoDB silently ignores the schema change if the old index exists.
**Mitigation:** Run a one-time migration script: `db.applications.dropIndex("jobId_1_jobSeekerId_1")` before deploying the new code. Added migration note to finding 3.2.

### Conflict 4: Password Minimum Increase 6→8 (Finding 3.1)
**Risk:** LOW
**What conflicts:** Existing users with 6-7 character passwords might get locked out.
**No actual lockout:** The `minlength` on Mongoose schema only applies on creation/update. Login validation only checks `notEmpty()`. Existing users can still log in — they just can't set a new password shorter than 8 chars. The frontend already requires 8 (`formValidation.ts:289,336`), so this actually aligns frontend and backend.
