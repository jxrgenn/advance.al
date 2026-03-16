# FINAL AUDIT IMPLEMENTATION PLAN — advance.al
**Created:** 2026-03-16
**Total Issues:** ~140 verified (27 CRITICAL, 29 HIGH, 51 MEDIUM, 30+ LOW)
**False Positives Removed:** 4 (#26 route exists, #39 campaigns integrated, #46 no orphaned file, #56 admin delete equivalent)

---

## Strategic Decisions

### 1. Email Verification (#1) — Soft Gate for MVP
**Decision:** Implement as soft requirement, not hard block.
- On register: send verification email automatically
- Show persistent banner "Verifiko email-in tënd" until verified
- Block: applying to jobs, posting jobs, messaging
- Allow: browsing, profile editing, saving jobs
- **Rationale:** Hard blocking would break the current registration flow and confuse users. Soft gate educates users while preventing abuse.

### 2. Config Settings (#17) — Wire Up 3 Key Settings Only
**Decision:** Wire up `maintenance_mode`, `require_job_approval`, `max_cv_file_size`. Mark the rest as "Coming Soon" in the admin UI.
- **Rationale:** Wiring up all 14 settings would be a massive cross-cutting change with high risk. The 3 most impactful ones give admins real control.

### 3. Job Approval (#18) — Config-Driven, OFF by Default
**Decision:** Add `pending_approval` status to Job model. When `require_job_approval` config is ON, new jobs get `pending_approval` instead of `active`. Default is OFF for MVP.
- **Rationale:** Most job platforms start without approval to encourage employer adoption. Can enable later.

### 4. Token Hashing (#46) — Do It Now While No Real Users Exist
**Decision:** Hash refresh tokens now. All existing sessions invalidated.
- **Rationale:** We're in testing, no real users. Doing this later in production would be much more disruptive.

### 5. Forgot Password (#33) — Launch Blocker, Must Implement
**Decision:** Full implementation: backend endpoints + email template + frontend pages.
- **Rationale:** Users WILL forget passwords. The "contact support" message is not acceptable.

### 6. Digests (#41), Real-Time Notifications (#107), SMS (#87) — Defer
**Decision:** Mark as post-launch enhancements. Only "immediate" notifications work for now.
- **Rationale:** These are nice-to-have, not launch blockers. Polish after launch.

### 7. Revenue Dashboard (#40) — Label as "Estimated"
**Decision:** Don't remove, just add clear "Estimated" labels. Real data comes after Paysera integration.
- **Rationale:** Admins still want to see approximate numbers. Just be honest about it.

### 8. CompanyProfile Mock Data (#54) — Remove Entirely
**Decision:** Replace mock fallback with proper error state.
- **Rationale:** Showing fake companies to real users destroys trust.

---

## Phase Dependencies Map

```
Phase 1 (Security) — Independent, do first
  └── #46 (hash tokens) invalidates all sessions → do before any real users
  └── #25 (refresh race) depends on #2 (AUTH_LOGOUT fix)

Phase 2 (Filters/Display) — Independent of Phase 1
  └── #11 (salary params) → then #13 (count query) → then #55 (currency)

Phase 3 (Broken Flows) — Independent
  └── #39 (Resend consolidation) moved here to unblock Phase 4 emails
  └── #16 (profile photo) decision affects #37 (photo UI in Phase 4)

Phase 4 (Missing Features) — Depends on Phase 3 (#39 for emails)
  └── #33 (forgot password) needs Resend (#39 done in Phase 3)
  └── #30-31 (status emails) need Resend (#39 done in Phase 3)

Phase 5 (Backend Integrity) — Independent
Phase 6 (Admin/Business) — Independent
Phase 7 (UI Polish) — Depends on Phases 1-4 for core flows
Phase 8 (Production) — Last, after everything else
```

---

## PHASE 1: Security & Auth (CRITICAL)
**Scope:** ~15 fixes | **Risk:** Medium (token changes invalidate sessions)

### Fixes (in order):

| # | Issue | File(s) | Fix | Risk |
|---|-------|---------|-----|------|
| 2 | Force logout wrong action type | `AuthContext.tsx:251` | Change `'LOGOUT'` → `'AUTH_LOGOUT'` | LOW |
| 3 | Login leaks refresh tokens | `auth.js:286` | Change `toObject()` → `toJSON()` | LOW |
| 4 | Verification codes Math.random() | `verification.js:37` | Use `crypto.randomInt(100000, 999999)` | LOW |
| 5 | SVG upload XSS | `users.js:46` | Remove `image/svg+xml` from allowed list | LOW |
| 6 | No magic bytes validation | `users.js:36-51` | Add magic byte check after multer | LOW |
| 7 | ReDoS company search | `companies.js:33-36` | Import and use `escapeRegex()` | LOW |
| 8 | Duplicate application race | `Application.js:117` | Add partial unique index `{ jobId:1, jobSeekerId:1 }` where `withdrawn: false` | MED |
| 46 | Unhashed refresh tokens | `User.js:473-484` | Hash with `crypto.createHash('sha256')` before store | MED |
| 25 | Token refresh race condition | `api.ts:242-321` | Add promise queue — first 401 triggers refresh, others await | MED |
| 47 | Error messages leaked (matching) | `matching.js:65-201` | Wrap `error.message` in NODE_ENV check | LOW |
| 56 | optionalAuth doesn't block banned | `auth.js:157` | Add `&& status !== 'banned'` check | LOW |

### Backend test plan:
- Login → verify response has NO `refreshTokens`, `emailVerificationToken`, `passwordResetToken`
- Try SVG upload → should be rejected
- Try uploading .html renamed to .jpg → rejected by magic bytes
- Company search with `(a+)+$` → should not hang
- Rapid double-apply for same job → only one application created
- Token refresh with concurrent requests → no premature logout
- Banned user on optional-auth endpoint → user not attached

---

## PHASE 2: Broken Filters & Data Display
**Scope:** ~12 fixes | **Risk:** Low

### Fixes (in order):

| # | Issue | File(s) | Fix | Risk |
|---|-------|---------|-----|------|
| 9 | Greek letters in `ngaShtepια` | `Jobs.tsx:38,148,348,383,521` | Replace all `ι`(U+03B9)/`α`(U+03B1) with Latin `i`/`a` | LOW |
| 11 | Salary param names wrong | `Jobs.tsx:123-124` | `salaryMin/salaryMax` → `minSalary/maxSalary` | LOW |
| 12 | "Full-time" case mismatch | `Jobs.tsx:464` | `"Full-time"` → `"full-time"` | LOW |
| 13 | Count query missing salary | `jobs.js:307-325` | Add salary conditions to countQuery | LOW |
| 55 | Currency filter ignored | `Job.js:494-514` | Add `salary.currency` to filter query | LOW |
| 14 | companySize 3-way mismatch | `User.js:192`, `users.js:167`, `EmployerDashboard.tsx` | Align all to `['1-10','11-50','51-200','201-500','501+']` | LOW |
| 15 | Job tier 'featured' not in model | `Job.js:138` | Add `'featured'` to enum | LOW |
| 28 | PostJob 7/14 categories + wrong format | `PostJob.tsx:1038-1046` | Add all 14 categories with correct Albanian enum values | LOW |
| 49 | Title sort falls back to date | `jobs.js:293` | Add `'title'` to `allowedSorts` | LOW |
| 10 | Message sender ObjectId vs string | `ApplicationStatusTimeline.tsx:268` | Compare `message.from.toString() === currentUser.id` | LOW |
| 26 | Seed script Greek α | `seed-database.js:356` | Fix `ngaShtepiaα` → `ngaShtepia` | LOW |

### Backend test plan:
- Jobs page: "Nga Shtepia" filter returns remote jobs
- Salary filter returns correct results and correct pagination count
- "Full-time" quick filter matches jobs
- Post job with all 14 categories → each saves correctly
- CompanySize "501+" saves without error
- Create a "featured" tier job → saves correctly
- Sort by title → actually sorts alphabetically

### Frontend test script for user:
- Go to /jobs → click "Nga Shtepia" toggle → verify remote jobs appear
- Go to /jobs → set salary range → verify result count matches pagination
- Go to /jobs → click "Full-time" → verify only full-time jobs shown
- Go to /post-job → verify all 14 categories visible in dropdown
- Go to employer dashboard → settings → change company size to "501+" → save → no error

---

## PHASE 3: Broken User Flows + Email Consolidation
**Scope:** ~14 fixes | **Risk:** Medium

### Fixes (in order):

| # | Issue | File(s) | Fix | Risk |
|---|-------|---------|-----|------|
| 39 | Verification uses Nodemailer not Resend | `verification.js:6,157` | Replace emailService with resendEmailService | MED |
| 23 | Employer rejection doesn't change status | `users.js:857` | Add `employer.status = 'rejected'` on rejection | LOW |
| 42 | Admin suspend writes wrong fields | `admin.js:601-604` | Use `user.suspend(reason, adminId, duration)` model method | LOW |
| 24 | BulkNotification queries nonexistent field | `BulkNotification.js:170-173` | Change `suspendedUntil` → `status: { $nin: ['suspended','banned','deleted'] }` | LOW |
| 22 | quick_users bulk notification broken | `BulkNotification.js:25` | Add `'quick_users'` to enum + add case to `getTargetUsers()` | LOW |
| 16 | Profile photo saves wrong field | `users.js:734` | Change model field to String URL (like logo field) | MED |
| 53 | Misleading employer registration toast | `EmployerRegister.tsx:109` | Change to "Llogaria juaj po verifikohet nga administratori" | LOW |
| 43 | No limit sanitization on 15+ endpoints | Multiple routes | Add `sanitizeLimit()` to all endpoints using raw `parseInt(limit)` | LOW |
| 44 | In-memory pagination on applications | `applications.js:222-237,371-380` | Convert to DB-level `.skip().limit()` | MED |
| 48 | No old file cleanup on re-upload | `users.js:504-587` | Delete old Cloudinary file before uploading new one | LOW |
| 27 | Seed script disconnectDB import | `seed-database.js:4` | Fix import path or add export | LOW |

### Backend test plan:
- Send verification email → arrives via Resend (not Nodemailer SMTP)
- Admin rejects employer → status changes to 'rejected', not stuck in pending
- Admin suspends user → suspensionDetails properly populated, auto-expiry works
- Bulk notification to quick_users → targets QuickUser collection
- Upload new CV when one exists → old Cloudinary file deleted
- All endpoints: `?limit=999999` → capped at reasonable max (50 or 100)
- Applications endpoint with many records → no memory spike

---

## PHASE 4: Missing Critical Features (Launch Blockers)
**Scope:** ~10 features | **Risk:** Medium-High (new code)

### Fixes (in order):

| # | Issue | Files | Fix | Risk |
|---|-------|-------|-----|------|
| 33 | Forgot password flow | NEW: auth.js endpoints, resendEmailService template, ForgotPassword.tsx, ResetPassword.tsx | Full flow: request → email → reset page → new password | MED |
| 21 | /privacy and /terms 404 | NEW: Privacy.tsx, Terms.tsx, App.tsx routes | Static content pages in Albanian | LOW |
| 19 | No unsubscribe page | NEW: Unsubscribe.tsx, App.tsx route | Page that calls `GET /api/quickusers/unsubscribe?token=X` and shows result | LOW |
| 20 | No preferences page | NEW: Preferences.tsx, App.tsx route | Page to edit QuickUser email preferences via token auth | LOW |
| 1 | Email verification not required | auth.js, AuthContext.tsx, ProtectedRoute, NEW: VerifyEmail.tsx | Soft gate: send code on register, show banner, block apply/post until verified | HIGH |
| 30 | No email on status change | `applications.js` PATCH /:id/status | Add `resendEmailService.sendApplicationMessageEmail()` call | LOW |
| 31 | No email to employer on new app | `applications.js` POST /apply | Add email notification to employer in setImmediate | LOW |
| 32 | No welcome email for employers | `auth.js:162-176` | Add employer welcome email template + send on register | LOW |
| 45 | No retry in Resend email | `resendEmailService.js` | Add 1-retry with 2s delay wrapper around all send methods | LOW |

### Backend test plan:
- Forgot password: request reset → email arrives → click link → set new password → login works
- Visit /privacy → content renders
- Click unsubscribe link from email → user unsubscribed successfully
- Register without verifying → can browse but can't apply
- Verify email → banner disappears, can now apply
- Employer changes application status → jobseeker gets email
- New application → employer gets email
- Employer registers → welcome email received

### Frontend test script for user:
- Go to /login → click "Ke harruar fjalëkalimin?" → enter email → check email → click link → set new password → login
- Go to /privacy → privacy policy content shown
- Go to /terms → terms of service content shown
- Register new account → check email for verification → enter code → banner disappears
- Apply for job without verifying → should see "Verifiko email" message

---

## PHASE 5: Backend Integrity & Performance
**Scope:** ~12 fixes | **Risk:** Low-Medium

### Fixes:

| # | Issue | Fix |
|---|-------|-----|
| 50 | No rate limit in bulk email | Add 500ms delay between batches (match notificationService pattern) |
| 51 | Job notification emails <style> blocks | Convert to inline styles (match resendEmailService pattern) |
| 80 | Missing DB indexes | Add indexes on `salary.min`, `salary.max`, `seniority`, `location.remote` |
| 81 | Location jobCount never updated | Add post-save hook on Job to increment/decrement location jobCount |
| 85 | Jobs.tsx pagination only 5 pages | Copy sliding window algorithm from Index.tsx |
| 65 | Education schema mismatch | Align route fields with model schema (use model's field names) |
| 66 | Work experience schema mismatch | Same — align route with model |
| 64 | Profile update shallow merge | Use deep merge or explicit field assignment |
| 82 | Filters not persisted in URL | Add query params to URL on filter change, read on page load |
| 84 | Pending employers no pagination | Add skip/limit to the query |
| 83 | handleResetFilters triggers 2 API calls | Fix to single reset + single API call |
| 99 | requireVerifiedEmployer crash risk | Add optional chaining: `req.user?.profile?.employerProfile?.verified` |

---

## PHASE 6: Admin & Business Logic
**Scope:** ~10 fixes | **Risk:** Medium

### Fixes:

| # | Issue | Fix |
|---|-------|-----|
| 17 | Config settings no effect | Wire up: `maintenance_mode` (503 middleware), `require_job_approval` (job creation gate), `max_cv_file_size` (upload limit). Mark rest as "Së shpejti" |
| 18 | Job approval not enforced | Add `pending_approval` to Job status enum. When config ON, new jobs get this status. Add admin approve/reject UI wiring |
| 40 | Revenue data fake | Add "Vlerësim" (Estimated) label to all revenue figures in admin dashboard |
| 52 | Reports only target users | Add optional `reportedJob` field to Report model. Frontend: add "Report job" button on JobDetail |
| 54 | Mock company data | Remove mockCompanies from CompanyProfile.tsx. Show error state on API failure |
| 35 | No job expiry cron | Add `setInterval` in server.js: every hour, mark active jobs with past `expiresAt` as `expired` |
| 34 | No job renewal/repost | Add "Riposton" button for expired jobs. Backend: POST endpoint that clones job with new dates |

---

## PHASE 7: UI Polish & Missing UI Elements
**Scope:** ~20 fixes | **Risk:** Low

### Fixes:

| # | Issue | Fix |
|---|-------|-----|
| 29 | No withdraw application UI | Add "Tërhiq Aplikimin" button to application cards |
| 36 | No logo upload UI | Add logo upload to EmployerDashboard settings tab |
| 37 | No profile photo UI | Add photo upload to Profile.tsx |
| 38 | Employer contact info not editable | Add phone/whatsapp/contact fields to dashboard settings |
| 67 | CompanyProfile description x2 | Remove duplicate description section |
| 68 | CompanyProfile button does nothing | Wire "Shiko pozicionet" to scroll/filter to company's jobs |
| 69 | CompanyProfile contacts do nothing | Wire Mail/Phone/WhatsApp buttons to actual actions |
| 62 | desiredSalary/openToRemote no UI | Add fields to Profile.tsx |
| 63 | Privacy settings no UI | Add privacy toggle to Profile.tsx |
| 61 | No account deletion UI | Add "Fshi Llogarinë" section to Profile.tsx |
| 92 | EditJob no client validation | Add validation matching PostJob rules |
| 93 | EmployerRegister no auth redirect | Add useEffect redirect for authenticated users |
| 97 | No notification on verification | Send email when admin approves/rejects employer |
| 91 | Tutorial scroll lock stuck | Add useEffect cleanup that resets overflow on unmount |
| 100 | Frontend "Draft" tab but no draft status | Remove draft tab from filter, OR add draft support |
| 106 | console.log/error cleanup | Remove all remaining console statements from frontend |

---

## PHASE 8: Production-Only (After all fixes)
**Scope:** Variable | **Risk:** Low

| Item | When |
|------|------|
| SMS/Twilio setup | When budget allows |
| Paysera payment integration | Before monetizing |
| Switch email from test to real recipients | At launch |
| Secret rotation (JWT, API keys) | Before launch |
| Database indexes verification | Before launch |
| Load testing | Before launch |
| CDN for static assets | When traffic grows |
| Real-time notifications (WebSocket) | Post-launch enhancement |
| Daily/weekly digest emails | Post-launch enhancement |

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Token hashing (#46) invalidates all sessions | Do it in Phase 1 while testing — no real users affected |
| Email verification (#1) changes registration UX | Soft gate — users can still browse, just can't apply until verified |
| Application unique index (#8) may break re-apply after withdraw | Use partial unique index: `unique: true` only where `withdrawn: false` |
| In-memory pagination fix (#44) may change sort order | Test with real data to verify result consistency |
| Config wiring (#17) could have unintended side effects | Start with maintenance_mode only, add others gradually |
| Bulk email rate limit (#50) could slow down notifications | 500ms between batches of 10 is proven in notificationService |
| Profile photo field change (#16) affects existing data | Check if any existing data uses the old field name |

---

## What's NOT in This Plan (Intentionally)

- **Real-time notifications (WebSocket/SSE)** — Enhancement, not a bug
- **Daily/weekly digest emails** — Nice-to-have, "immediate" works fine
- **SMS sending** — Not set up yet, mock is fine for now
- **Payment integration (Paysera)** — Separate project
- **Tutorial refactoring** — Working fine as-is
- **Job recommendations system** — Removed per user request
- **German CV language** — Remove the enum value, only support sq/en for now
- **Evidence file upload for reports** — Nice-to-have
- **Bulk admin actions** — Post-launch
