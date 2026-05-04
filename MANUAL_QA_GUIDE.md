# advance.al — Manual QA Master Guide (post-Phase 22)

> **Purpose:** Step-by-step manual QA covering everything that automation can't fully verify. Designed for one human + one browser + one notepad. Estimated total time: **6–9 hours** for a complete first pass.
>
> **What's already verified by automation (don't re-test these from scratch):** 1056 tests in `tests/results/HONEST_TEST_RESULTS.md` cover all 157 backend endpoints, every cron job, every cascade, every key UI flow against a real backend with real MongoDB. Phase 22 finding fixes (F-21, F-22, F-23) are validated by tightened tests.
>
> **What manual QA is for:** UX feel, real device rendering, real email client rendering, real Cloudinary/Twilio/Resend/OpenAI behavior, accessibility, visual layout, animation smoothness, language polish, real payment flow (when integrated), edge cases automation didn't anticipate.

---

## How to use this guide

Each test row has:
- **ID** — quick reference (e.g., `S1`, `J3.2`, `E5.1`)
- **Action** — exactly what to do
- **Expect** — exactly what should happen
- **PASS / FAIL / NOTES** — three columns to fill in

**Severity if fail:**
- 🔴 **P0** — blocks deploy (data loss, security, broken core flow)
- 🟠 **P1** — must fix before launch (broken feature, bad UX, missing translation)
- 🟡 **P2** — fix in v1.1 (cosmetic, edge case, minor friction)
- 🟢 **P3** — nice-to-have polish

When reporting issues to me, include: test ID, browser+device, screenshot/video, console errors (DevTools → Console), network errors (DevTools → Network → red requests), reproduction steps.

---

## ⚡ The "Computer Use" complement

I cannot operate your machine at OS level (no real mouse/keyboard tools in this CLI), **but I can build a Playwright exploratory walker** that:
- Auto-walks every URL in 3 sessions (jobseeker, employer, admin)
- Captures a full-page screenshot at each step (~80 screenshots total)
- Records video of each session
- Outputs an HTML album you scroll through in 30 minutes — replaces ~6 hours of click-through

What it CAN'T do (manual still required):
- Real iPhone / Android / iPad rendering
- Real Outlook / Gmail / Apple Mail email rendering
- Real Cloudinary upload behavior
- Real OpenAI CV generation quality review
- UX feel, animation smoothness, "does this look weird?"
- Real payment with real card

**Want me to build the Playwright walker?** Reply "build the walker" and I'll generate it after you've reviewed this doc. It complements but does NOT replace the human checks below.

---

# Section 0 — Pre-flight setup

**Estimated time: 15–20 min**

| ID | Action | Expect | PASS / FAIL / NOTES |
|---|---|---|---|
| S0.1 | Verify backend is running locally or staging URL is reachable | `GET /api/health` returns 200 | |
| S0.2 | Verify frontend is running (`npm run dev` in `/frontend` → `http://localhost:5173`) | Vite dev server logs "ready in X ms"; site loads | |
| S0.3 | Open browser DevTools (F12). Pin the Console + Network tabs | Both tabs visible alongside the page | |
| S0.4 | Open `chrome://settings/cookies` and clear all `localhost:5173` cookies/storage. Hard refresh (Cmd+Shift+R) | Storage tab empty for the site | |
| S0.5 | Have access to test inbox `advance.al123456@gmail.com` (or whichever inbox `EMAIL_TEST_MODE` diverts to) — open it in another tab | Inbox accessible, "Unread" filter active | |
| S0.6 | Have a passable test resume PDF + DOCX file ready (1–2 pages, real-looking content) | Two files on desktop ready to upload | |
| S0.7 | Have a test logo PNG (~200×200, < 500KB) ready | File on desktop | |
| S0.8 | Have a test profile photo JPG (~400×400) ready | File on desktop | |
| S0.9 | Open a notepad/Notion doc to log issues as you go | Open and titled "advance.al QA pass YYYY-MM-DD" | |
| S0.10 | (Optional) Start screen recording (QuickTime / Loom / OBS) for the entire session | Recording started | |

**Test accounts to create (one of each):**
- `qa-jobseeker-1@advance.al` (fully completed profile, with applications)
- `qa-jobseeker-2@advance.al` (fresh, empty profile)
- `qa-employer-verified@advance.al` (verified, has 2 jobs posted)
- `qa-employer-pending@advance.al` (pending admin approval)
- `qa-admin@advance.al` (admin role — DB-elevated since real registration only allows jobseeker/employer)
- `qa-quickuser@advance.al` (signed up for job alerts only)

---

# Section 1 — Smoke tests (critical-only sanity)

**Estimated time: 15 min. If ANY of these fail, halt the QA pass and report immediately.**

| ID | Action | Expect | PASS / FAIL / NOTES |
|---|---|---|---|
| S1.1 | Visit `/` (home) | Page renders, no console errors, no network errors (no red requests) | |
| S1.2 | Visit `/jobs` | Job listings render (or empty state if no jobs); no crashes | |
| S1.3 | Visit `/login` | Login form renders; email + password inputs visible | |
| S1.4 | Submit login with `qa-jobseeker-1@advance.al` + correct password | Redirects to `/profile`; localStorage has `authToken` | |
| S1.5 | Click logout (Navigation → user menu) | Returns to home; localStorage `authToken` is gone | |
| S1.6 | Visit `/admin` while logged out | Redirects to `/login` | |
| S1.7 | Visit `/this-does-not-exist` | NotFound page renders, not a blank page | |
| S1.8 | Open Console — any red errors anywhere in S1.1–S1.7? | No errors in console | |
| S1.9 | Open Network tab — any 500 responses? | Zero 5xx responses | |
| S1.10 | Hover Navigation links | Hover states work, no layout shift on hover | |

---

# Section 2 — Public / Logged-out experience

**Estimated time: 45 min**

## 2.A — Home page (`/` → `Index.tsx`)

| ID | Action | Expect | PASS / FAIL / NOTES |
|---|---|---|---|
| P2.1 | Hard-refresh `/` | Hero section above the fold; all images load (no broken-image icons) | |
| P2.2 | Scroll to bottom — every section renders (no `<undefined>`, no `[object Object]`, no Lorem Ipsum) | All sections render with real Albanian copy | |
| P2.3 | Click each navigation link (Punëkërkues, Punëdhënës, Rreth Nesh, etc.) | Each navigates to the correct page | |
| P2.4 | Click "Postoni një punë" CTA | Redirects to `/employer-dashboard` (if authed) or `/employers?signup=true` (if not) | |
| P2.5 | Click "Kërko punë" / "Shiko punët" | Goes to `/jobs` | |
| P2.6 | Find the search bar on home (if present) — type "developer" + submit | Navigates to `/jobs?q=developer` with results | |
| P2.7 | RotatingContact / RobotAssistant component appears bottom-right | Visible and clickable; clicking opens contact panel | |
| P2.8 | Cookie consent banner appears on first visit | Visible at bottom; "Pranoj" + "Refuzoj" buttons present | |
| P2.9 | Click "Pranoj" on cookie banner | Banner disappears; reload — banner does NOT reappear | |
| P2.10 | Open DevTools → Application → Local Storage → check for cookie consent flag | `cookieConsent` or similar key set with timestamp | |
| P2.11 | Open `/` in incognito → click "Refuzoj" on cookie banner | No analytics scripts loaded after rejection (check Network tab for GA/Sentry calls) | |
| P2.12 | Resize browser from 1920px down to 320px slowly | Layout adapts; no horizontal scroll bar appears at any breakpoint | |

## 2.B — Jobs page (`/jobs` → `Jobs.tsx`)

| ID | Action | Expect | PASS / FAIL / NOTES |
|---|---|---|---|
| P2.13 | Visit `/jobs` | List loads in < 2s; loading skeleton appears briefly then real data | |
| P2.14 | Scroll all the way down → next page button visible (if > 10 jobs) | Pagination control visible and not cut off | |
| P2.15 | Click next page → URL has `?page=2` and list scrolls to top | URL + scroll behavior correct | |
| P2.16 | Click into a job → URL changes to `/jobs/:id` | Detail page loads | |
| P2.17 | Browser back button → return to `/jobs` with previous scroll position preserved (or page state) | State preserved, not jumped to top | |
| P2.18 | Use the search box: type "developer" then wait 600ms | URL updates to `?q=developer`, list reloads, debounce visible (no flicker on each keystroke) | |
| P2.19 | Type rapidly without pause | Only one search request fires after debounce (check Network tab) | |
| P2.20 | Open advanced filters modal | Modal opens with all 14 categories, salary slider, currency, etc. | |
| P2.21 | Apply 3+ filters → close modal | Active filter badges visible at top; URL has all params | |
| P2.22 | Click a filter badge "X" to remove it | Badge removed, URL updates, list reloads | |
| P2.23 | Click "Pastro filtrat" / clear all | All filters cleared, URL has no params, full list returns | |
| P2.24 | Set salary range slider to 5000+ | Slider value visible; results filtered correctly | |
| P2.25 | Toggle "Diaspora" preset → only diaspora jobs visible | URL has `diaspora=true` | |
| P2.26 | Sort by "Pagës më të lartë" | Order changes to highest-salary-first | |
| P2.27 | Right sidebar (events list) — 9 events visible | Events render with dates and titles | |
| P2.28 | Empty state: filter to a city with no jobs (or unique combo) | Empty state shows clear "No jobs found" copy in Albanian | |

## 2.C — Job detail (`/jobs/:id` → `JobDetail.tsx`)

| ID | Action | Expect | PASS / FAIL / NOTES |
|---|---|---|---|
| P2.29 | Click into a job from `/jobs` | Detail loads with: title, company, location, salary, description, requirements, apply button | |
| P2.30 | Tutorial overlay appears on first visit (if you cleared localStorage) | Overlay visible, "Skip" / "Got it" buttons work | |
| P2.31 | Apply button visible & disabled if logged out (or labeled "Login to apply") | Correct state | |
| P2.32 | Click Save (heart icon) — should redirect to login if logged out | Redirects to `/login` | |
| P2.33 | Click "Raporto" / Report button → goes to `/report-user` or opens modal | Correct destination | |
| P2.34 | Share / copy link button → URL copied to clipboard | Toast confirms copy | |
| P2.35 | Verify viewCount actually increments after refresh: load detail page → reload → "Views" number went up by 1 | Counter visible and increments | |
| P2.36 | "Similar jobs" section at bottom | Renders 0+ similar jobs OR empty state | |
| P2.37 | Visit `/jobs/000000000000000000000000` (bogus ID) | Shows "Job not found" gracefully, not a crash | |

## 2.D — Auth pages

| ID | Action | Expect | PASS / FAIL / NOTES |
|---|---|---|---|
| P2.38 | `/login` — submit empty form | Browser HTML5 validation prevents submit OR inline error appears | |
| P2.39 | `/login` — submit wrong password | Error message in Albanian appears; does not reveal whether email exists | |
| P2.40 | `/login` — submit valid creds | Redirects per role (jobseeker→/profile, employer→/employer-dashboard, admin→/admin) | |
| P2.41 | Click "Ke harruar fjalëkalimin?" → `/forgot-password` | Navigates correctly | |
| P2.42 | `/forgot-password` — submit unknown email | Generic success message ("if email exists, check inbox") — no enumeration | |
| P2.43 | `/forgot-password` — submit known email | Same generic success message; check inbox: reset email arrives | |
| P2.44 | Click reset link in email → `/reset-password?token=...` | Page renders with new-password form | |
| P2.45 | `/reset-password` with bad token | "Token invalid or expired" message in Albanian | |
| P2.46 | `/reset-password` set new password → submit | Success → can login with new password; old password rejected | |
| P2.47 | After successful reset, try a SECOND reset using the SAME link | "Token already used" — second attempt blocked | |
| P2.48 | After password reset (or change-password) — F-21 fix verification | All previously-issued sessions are invalidated. Open another browser/incognito, login → change password → original session's `/api/users/profile` call should fail or refresh-token rotation should fail | |

## 2.E — Static pages

| ID | Action | Expect | PASS / FAIL / NOTES |
|---|---|---|---|
| P2.49 | `/about` — content renders, no broken images, Albanian throughout | Loads correctly | |
| P2.50 | `/privacy` — all 14 GDPR sections render with real text (no placeholders) | All sections present | |
| P2.51 | `/terms` — full Terms of Service in Albanian | Loads correctly | |
| P2.52 | `/jobseekers` — landing CTA buttons work | Each CTA navigates correctly | |
| P2.53 | `/employers` — landing CTA buttons work | Each CTA navigates correctly | |
| P2.54 | `/unsubscribe` — page loads (try with `?token=invalid` and `?token=...real...`) | Both states render correctly: invalid → error msg; valid → unsubscribed confirmation | |
| P2.55 | `/companies` — should be DISABLED per recent product decision | Either redirects or shows "coming soon"; should NOT show hardcoded fake companies (TechShqip, etc.) in production | |

## 2.F — Quick User signup (job alerts without full account)

| ID | Action | Expect | PASS / FAIL / NOTES |
|---|---|---|---|
| P2.56 | Find quickuser signup form (likely on home or `/jobseekers`) | Form visible | |
| P2.57 | Submit with valid data | Success toast; check inbox for welcome email | |
| P2.58 | Welcome email lands within 30s | Email received in test inbox | |
| P2.59 | Click unsubscribe link in email | Lands on `/unsubscribe?token=...`; click confirm; success message | |
| P2.60 | Submit duplicate signup (same email) | Error: "already subscribed" | |

---

# Section 3 — Jobseeker role (full lifecycle)

**Estimated time: 90 min**

## 3.A — Registration (2-step)

| ID | Action | Expect | PASS / FAIL / NOTES |
|---|---|---|---|
| J3.1 | `/jobseekers?signup=true` — fill Step 1 (name, email, password, city) | Step 1 submits; modal opens for verification code | |
| J3.2 | Check test inbox for verification email | Email arrives within 30s with 6-digit code | |
| J3.3 | Email body: subject correct? Albanian? logo visible? unsubscribe link? | All correct, mobile-friendly (open on phone) | |
| J3.4 | Enter code in modal → submit | JWT in localStorage, redirected to dashboard | |
| J3.5 | Enter WRONG code | Error in modal; counter visible (e.g. "2/5 attempts") | |
| J3.6 | Enter wrong code 5 times → 6th attempt with new code | After 5 wrongs, registration cancelled; need to restart from Step 1 | |
| J3.7 | Refresh browser mid-Step-2 (modal open) | Pending registration restored OR clear "session expired" message | |
| J3.8 | Try to register with already-registered email | Step 1 returns clear error: "email already registered" (or generic "verification sent" if anti-enumeration is on) | |
| J3.9 | Try password with no uppercase, no numbers | Inline validation error explaining requirement | |
| J3.10 | Try password 7 chars long | Inline error: "minimum 8" | |

## 3.B — Profile (`/profile`)

| ID | Action | Expect | PASS / FAIL / NOTES |
|---|---|---|---|
| J3.11 | Visit `/profile` after login | Profile loads with all sections collapsed/visible | |
| J3.12 | Click "Edito" on Personal Info → change firstName, lastName → save | Toast success; reload → changes persist | |
| J3.13 | Phone field: enter `+355681234567` | Accepted | |
| J3.14 | Phone field: enter `0681234567` | Validation error | |
| J3.15 | Phone field: enter `+38612345` | Validation error (wrong country code) | |
| J3.16 | Bio: paste 600+ characters | Counter visible; submit blocked or trimmed at 500 | |
| J3.17 | Skills: add 5 skills | Each appears as a chip; can remove | |
| J3.18 | Add work experience: position, company, start/end dates, description | Saves; entry visible in list | |
| J3.19 | Edit work experience entry | Changes persist after reload | |
| J3.20 | Delete work experience entry | Removed from list and DB | |
| J3.21 | Add work experience with "Currently working here" toggle | endDate not required; saves correctly | |
| J3.22 | Add work experience: end date BEFORE start date | Validation error (or warning) | |
| J3.23 | Add 3 education entries: BSc, MSc, PhD | All persist with correct order | |
| J3.24 | Profile photo upload — JPG ≤ 2MB | Upload progress shown, photo preview appears, persists on reload | |
| J3.25 | Profile photo upload — JPG > 5MB | Rejected with size error | |
| J3.26 | Profile photo upload — `.exe` renamed to `.jpg` | Backend rejects (magic-bytes check) | |
| J3.27 | Profile photo upload — SVG file | Rejected (SVG banned per security) | |
| J3.28 | Profile completeness % updates as you fill | Progress bar advances | |

## 3.C — CV / Resume

| ID | Action | Expect | PASS / FAIL / NOTES |
|---|---|---|---|
| J3.29 | Upload PDF resume (1MB) | Upload succeeds, filename + "Download" / "View" buttons appear | |
| J3.30 | Upload DOCX resume | Same, accepted | |
| J3.31 | Upload `.txt` file | Rejected ("only PDF/DOCX") | |
| J3.32 | Upload 11MB PDF | Rejected (size limit 5MB) | |
| J3.33 | Click "View resume" | Opens in new tab with auth-token query param; PDF renders | |
| J3.34 | Logout, then visit the resume URL directly | Should be 401/403 (auth required) | |
| J3.35 | Click "Parse with AI" / "Auto-fill from CV" (if exposed) | Loading spinner; profile fields populate from CV content | |
| J3.36 | Compare AI-parsed fields to CV content | Reasonable accuracy (skills, education, experience extracted) | |
| J3.37 | Click "Generate AI CV" / "Krijoni CV me AI" | Loading 5–15s; DOCX/PDF download starts; opens in Word/Preview correctly | |
| J3.38 | Generated CV content quality: name correct? skills listed? sections labeled in Albanian? formatting clean? | Manual eyeball check | |
| J3.39 | Generate CV in different language (sq → en if available) | Output language matches selection | |

## 3.D — Browse + Save + Apply

| ID | Action | Expect | PASS / FAIL / NOTES |
|---|---|---|---|
| J3.40 | Visit `/jobs`, click heart on a job (Save) | Heart fills in; toast "Job saved" | |
| J3.41 | Visit `/saved-jobs` | The saved job appears in the list | |
| J3.42 | Click heart again on the same job | Heart un-fills; removed from saved list | |
| J3.43 | Save 11 jobs → `/saved-jobs` paginates correctly (10 per page) | Pagination works | |
| J3.44 | Click into a job → click "Apply" / "Apliko" | Apply form/modal opens | |
| J3.45 | Apply with one-click | Application submitted; redirected to confirmation; toast | |
| J3.46 | Try to apply to the SAME job again | "Already applied" error | |
| J3.47 | Apply to a job with custom-form questions | All questions render; required marked; submit succeeds | |
| J3.48 | Apply to job that's been closed by employer | "Job no longer accepting" error | |
| J3.49 | Apply with cover letter > 5000 chars | Counter shows; submit blocked or trimmed | |
| J3.50 | Visit "Aplikimet e mia" / My Applications | All your applications visible with status | |
| J3.51 | Click into one of your applications → see full detail (job, status timeline, employer messages) | All fields visible | |
| J3.52 | Withdraw an application | Status changes; counter on job decreases | |
| J3.53 | Try to apply again to a withdrawn-job | Allowed (creates new application) | |

## 3.E — Messaging with employers

| ID | Action | Expect | PASS / FAIL / NOTES |
|---|---|---|---|
| J3.54 | Receive a message from an employer (in another browser, send a message as employer) | In-app notification appears (bell icon counter) within 10s | |
| J3.55 | Email arrives in test inbox with the message | Email arrived | |
| J3.56 | Reply from jobseeker side | Reply persists; employer gets notified | |
| J3.57 | Send a message with HTML/`<script>` content | Stripped/escaped on render | |
| J3.58 | Send 5001-char message | Rejected | |
| J3.59 | Send empty message | Submit disabled or error | |
| J3.60 | Receive each message type: text, interview_invite, offer, rejection | Each renders distinctly with proper UI affordance | |

## 3.F — Notifications

| ID | Action | Expect | PASS / FAIL / NOTES |
|---|---|---|---|
| J3.61 | Bell icon shows unread count (red badge) | Badge visible with correct number | |
| J3.62 | Click bell → dropdown shows recent notifications | Dropdown opens, max 10 items, scrollable | |
| J3.63 | Click a notification | Navigates to relevant page (job, application, etc.) | |
| J3.64 | Click "Mark all as read" | Badge clears, all read | |
| J3.65 | Visit `/preferences` — toggle email notification settings | Preferences saved; verify by triggering action that no longer emails you | |

## 3.G — GDPR / Account management

| ID | Action | Expect | PASS / FAIL / NOTES |
|---|---|---|---|
| J3.66 | "Eksporto të Dhënat" button (likely in Profile or Privacy page) | Downloads JSON file with full profile + applications + activity | |
| J3.67 | Open the JSON — no `password`, no `refreshTokens`, no `passwordResetToken` fields anywhere | Verified safe | |
| J3.68 | Click "Fshi llogarinë" / Delete account | Confirmation modal asks for password | |
| J3.69 | Enter wrong password → fails | Error message | |
| J3.70 | Enter correct password → confirm delete | Logged out, redirected to home, success toast | |
| J3.71 | Try to login with deleted account | 401/403 — soft-deleted, login blocked | |
| J3.72 | Wait... 30 days later (skip in QA): user should be hard-deleted by cron. Verify in dev by checking DB | (Documentation-only; cron runs daily) | |

---

# Section 4 — Employer role (full lifecycle)

**Estimated time: 90 min**

## 4.A — Registration (3-step)

| ID | Action | Expect | PASS / FAIL / NOTES |
|---|---|---|---|
| E4.1 | `/employers?signup=true` — fill Step 1 (personal info) | Advances to Step 2 | |
| E4.2 | Step 2: company name, industry, size — fill | Advances to Step 3 | |
| E4.3 | Step 3: contact info (phone, website) | Submits | |
| E4.4 | Step 1→2→3 — back buttons preserve state | All 3 steps' data restored when going back | |
| E4.5 | Verification code email arrives | Email in inbox | |
| E4.6 | Submit code → User created with status `pending_verification` | Logged in but with banner "awaiting admin approval" | |
| E4.7 | Email body for employer welcome: mentions "pending approval" | Correct copy | |
| E4.8 | Try to post a job while pending — should be blocked | "Account not yet verified" message | |
| E4.9 | Logo upload during/after registration | Logo persists, visible in profile | |
| E4.10 | Logo upload — file ≤ 200KB | Smooth upload | |
| E4.11 | Logo upload — 3MB JPG | Rejected (size limit 2MB) | |

## 4.B — Pending → approved cycle (admin in another tab)

| ID | Action | Expect | PASS / FAIL / NOTES |
|---|---|---|---|
| E4.12 | (As admin in another browser) Approve the pending employer | Approval succeeds, employer notified | |
| E4.13 | (Back as employer) Refresh — banner gone, can post jobs | Status now `active`, banner removed | |
| E4.14 | Approval email arrives in employer inbox | Email confirms approval | |

## 4.C — Post Job (4-step wizard)

| ID | Action | Expect | PASS / FAIL / NOTES |
|---|---|---|---|
| E4.15 | `/post-job` Step 1: title, category, jobType | Step 1 fields all required-validated | |
| E4.16 | Type a custom industry (not in dropdown) — feature added in commit 7e88a64 | Custom industry persists in DB | |
| E4.17 | Step 2: description (rich text or markdown), requirements | Min length validated | |
| E4.18 | Step 3: salary, location, platform categories (5 toggles) | All 5 toggles work; salary min/max validated | |
| E4.19 | Step 4: application method (internal/email/external link), custom questions | Custom-form questions can be added (max 50) | |
| E4.20 | At any step, click "Save Draft" | Toast "Draft saved"; localStorage `postjob-draft` populated | |
| E4.21 | Close tab, reopen `/post-job` | Form auto-restored from localStorage | |
| E4.22 | Logout, log back in as same employer, visit `/post-job` | Draft restored from server (or localStorage if same browser) | |
| E4.23 | Click "Publish" / "Postoni" | Job published, redirected to job detail or dashboard | |
| E4.24 | Go to `/jobs` (logged out, another browser) — new job visible publicly | Visible in public listing | |
| E4.25 | Try to post 5 jobs in a row | All 5 succeed | |
| E4.26 | Salary min > max → validation error | Error visible | |
| E4.27 | Title 201+ chars → validation error | Error visible | |
| E4.28 | Description 80+ chars (validation might require min) | Validates | |
| E4.29 | Location: type "Atlantis" (not in DB) | Rejected with city-list helper | |
| E4.30 | Cancel mid-flow → click "Cancel" | Confirms before discarding draft | |

## 4.D — Edit / Manage Jobs

| ID | Action | Expect | PASS / FAIL / NOTES |
|---|---|---|---|
| E4.31 | Visit `/employer-dashboard` | List of your jobs visible with stats (views, applications) | |
| E4.32 | Click a job → "Edit" / "Edito" | `/edit-job/:id` opens with all fields pre-filled | |
| E4.33 | Change title → save | Job title updated; check `/jobs/:id` reflects | |
| E4.34 | Change city — Location.jobCount cascade should update | Old city -1, new city +1 (DB-level, harder to verify in UI) | |
| E4.35 | Close a job (PATCH status to closed) | Status updates; no longer in public listings | |
| E4.36 | Renew an expired job | Status flips to active, expiresAt extended | |
| E4.37 | Delete a job (soft delete) | Removed from public; existing applications still visible to applicants as read-only | |
| E4.38 | Try to edit/delete another employer's job (URL hack) → `/edit-job/<peer's id>` | 403/404 | |

## 4.E — View applicants

| ID | Action | Expect | PASS / FAIL / NOTES |
|---|---|---|---|
| E4.39 | Click a job in dashboard → "Aplikuesit" / View applicants | List of applicants with status, applied date, profile preview | |
| E4.40 | Filter applicants by status (pending/viewed/shortlisted/rejected/hired) | Filter narrows list | |
| E4.41 | Click an applicant → see profile (with PII per privacySettings) | Profile renders without sensitive data leaks | |
| E4.42 | Mark applicant as "Viewed" | Status changes; applicant gets notified (in another tab/browser as that applicant) | |
| E4.43 | Send applicant a message (text type) | Message saves; applicant gets in-app + email notification | |
| E4.44 | Send "Interview invite" type | Different UI rendering, different email subject | |
| E4.45 | Send "Offer" type | Same | |
| E4.46 | Send "Rejection" type | Same; tone of email is appropriate | |
| E4.47 | Status state machine forward: viewed → shortlisted → hired | Each transition allowed and triggers notification + email | |
| E4.48 | Status state machine backward: rejected → hired | BLOCKED with clear error (state machine forward-only) | |
| E4.49 | Status: shortlisted → rejected | Allowed | |
| E4.50 | Receive a withdrawal notification (have applicant withdraw in another tab) | Counter on dashboard updates within 10s | |

## 4.F — Custom-form review

| ID | Action | Expect | PASS / FAIL / NOTES |
|---|---|---|---|
| E4.51 | Post a job with 3 custom questions (text, multiple-choice, yes/no) | All save | |
| E4.52 | (As applicant in another tab) Apply with custom answers | Answers visible to employer | |
| E4.53 | Employer view of answers — formatted clearly per question type | Clear UI per question | |

## 4.G — Company profile

| ID | Action | Expect | PASS / FAIL / NOTES |
|---|---|---|---|
| E4.54 | Edit description — verified employer | Description saves but companyName ignored (anti-fraud F-22 covered field-level) | |
| E4.55 | Try to change companyName as verified employer | Stored value unchanged; UI may say "Locked" | |
| E4.56 | Website field: enter `mycompany.com` (no protocol) | Backend auto-prefixes `https://`; saves correctly | |
| E4.57 | Website field: `javascript:alert(1)` | Rejected | |

---

# Section 5 — Admin role

**Estimated time: 60 min**

## 5.A — Dashboard

| ID | Action | Expect | PASS / FAIL / NOTES |
|---|---|---|---|
| A5.1 | Login as admin → `/admin` | Dashboard renders with counts (users, jobs, applications, employers) | |
| A5.2 | Counts match reality (cross-check with DB or another tab's user lists) | Counts accurate | |
| A5.3 | Recent activity feed shows latest jobs, registrations, applications | Last 10 events visible | |
| A5.4 | Top categories chart renders | Top 5 categories with counts | |
| A5.5 | Top cities chart renders | Top 5 cities with counts | |
| A5.6 | Monthly growth percentages render (users, jobs, applications) | Numbers reasonable, not NaN | |

## 5.B — User management

| ID | Action | Expect | PASS / FAIL / NOTES |
|---|---|---|---|
| A5.7 | Visit `/admin` → Users tab | Paginated user list | |
| A5.8 | Filter by userType=employer | Only employers visible | |
| A5.9 | Filter by status=suspended | Only suspended visible (may be empty) | |
| A5.10 | Search by email (partial) | Matching users surface | |
| A5.11 | Click a user → see profile, action buttons (Warn/Suspend/Ban/Delete) | All actions available | |
| A5.12 | Suspend user with reason + 7-day duration | Status updates; user receives suspension email | |
| A5.13 | (As suspended user in another browser) Try to login | 403 with "account suspended" message | |
| A5.14 | Activate (un-suspend) | Status returns to active; user can login | |
| A5.15 | Ban user (permanent) | Status updates; if employer, all their active jobs cascade-close | |
| A5.16 | Delete user (soft) | User.isDeleted=true; if employer, jobs soft-deleted | |
| A5.17 | Try to suspend yourself (admin → self) | Blocked: "Cannot self-action" | |
| A5.18 | Try to delete another admin | Blocked: "Cannot delete admin" | |

## 5.C — Job moderation

| ID | Action | Expect | PASS / FAIL / NOTES |
|---|---|---|---|
| A5.19 | Visit Admin → Jobs tab | Paginated job list with filters | |
| A5.20 | Click "Pending approval" filter | List of jobs awaiting review | |
| A5.21 | Approve a pending job | Status flips to active; F-23 fix: `adminApproved=true` persists in DB | |
| A5.22 | Reject a job with reason | Status flips to rejected; rejectionReason persists in DB (F-23 fix) | |
| A5.23 | Feature a job (premium tier) | tier=premium; appears in homepage carousel | |
| A5.24 | Delete a job (soft) | Job hidden, applications still visible to applicants | |

## 5.D — Reports

| ID | Action | Expect | PASS / FAIL / NOTES |
|---|---|---|---|
| A5.25 | Visit `/admin/reports` | Reports list with filters (status, priority, category) | |
| A5.26 | Filter by priority=high | Filtered correctly | |
| A5.27 | Click a report → see full detail (reporter, target, category, description, evidence) | All fields visible | |
| A5.28 | Take action: warning / temporary suspension / permanent suspension / account termination | Each action persists with ReportAction record + email to target | |
| A5.29 | Update report status (under_review → resolved) | Status updates; audit trail in ReportAction collection | |
| A5.30 | Reopen a closed report | Status flips back, target user re-evaluated | |
| A5.31 | Verify F-8 escalation: log in 3 different jobseeker accounts, each report the same target user | After 3rd report, target's report priority becomes 'high' | |
| A5.32 | After 5th report on same target | priority='critical', escalated=true | |

## 5.E — Bulk notifications

| ID | Action | Expect | PASS / FAIL / NOTES |
|---|---|---|---|
| A5.33 | Send bulk to "all" with type=announcement | All users get in-app notification + email if subscribed | |
| A5.34 | Send bulk to "jobseekers only" | Employers do NOT receive | |
| A5.35 | Send scheduled bulk for tomorrow | Status=draft, NOT immediately sent | |
| A5.36 | Each of 5 types (announcement, maintenance, feature, warning, update) | Each renders differently in email + in-app | |
| A5.37 | Use a template | Template populates form correctly | |
| A5.38 | Sent bulks list shows history with delivery stats | List visible; click into one shows recipients + opens + clicks | |

## 5.F — Configuration & business

| ID | Action | Expect | PASS / FAIL / NOTES |
|---|---|---|---|
| A5.39 | Toggle maintenance mode ON | Non-admin users see maintenance page; admins still access | |
| A5.40 | Toggle maintenance mode OFF | Site returns to normal | |
| A5.41 | ConfigurationAudit collection has rows for every change (oldValue/newValue/changedBy) | Audit trail intact | |
| A5.42 | Create a marketing campaign (flash_sale, valid date range) | Campaign saves; appears in list | |
| A5.43 | Create a campaign with endDate ≤ startDate | Validation error | |
| A5.44 | Create a pricing rule (after F-22 fix) — category=industry, basePrice=28, multiplier=1.5 | Rule saves successfully (F-22 verified) | |
| A5.45 | Toggle pricing rule active | isActive flips; rule appears/disappears from active list | |

## 5.G — Embeddings dashboard

| ID | Action | Expect | PASS / FAIL / NOTES |
|---|---|---|---|
| A5.46 | Visit Admin → Embeddings tab | Coverage %, queue health, worker status all render | |
| A5.47 | Backfill job embeddings | Queue items created; if no real OpenAI key, jobs marked failed (acceptable in test) | |
| A5.48 | View queue list with filters (pending/processing/completed/failed) | Queue paginated correctly | |
| A5.49 | Retry failed entries | Failed items re-queued | |
| A5.50 | Clear old queue entries | Completed entries > 30d removed | |

---

# Section 6 — Email & notifications (real client rendering)

**Estimated time: 30 min. This is the section automation literally cannot do — you need real email apps.**

For each email type below, check on **at least 3 clients**:
- Gmail (web)
- Apple Mail (Mac or iPhone)
- Outlook (web or desktop)

| ID | Email type | Trigger | Manual checks |
|---|---|---|---|
| EM.1 | Welcome (jobseeker) | Register a new jobseeker | Subject in Albanian; logo loads; CTA button works; mobile-readable; no broken images; reply-to address correct |
| EM.2 | Welcome (employer) | Register a new employer | Mentions "pending admin approval"; otherwise same checks |
| EM.3 | Welcome (quickuser) | Subscribe to job alerts | Has unsubscribe link; link works |
| EM.4 | Verification code | Register flow Step 1 | Code visible, large, copyable; expires-in-10-min mentioned |
| EM.5 | Password reset | Forgot password flow | Reset link + token; CTA button + plaintext fallback link; expires-in mention |
| EM.6 | Application status: viewed | Employer marks applicant as viewed | Includes job title; link to "View application" works |
| EM.7 | Application status: shortlisted | Same | Tone is positive |
| EM.8 | Application status: rejected | Same | Tone is professional, not blunt |
| EM.9 | Application status: hired | Same | Tone is celebratory; clear next steps |
| EM.10 | Application message: text | Employer sends free-form message | Email contains message body; reply works |
| EM.11 | Application message: interview_invite | Same | Has date/time placeholder or clear CTA to schedule |
| EM.12 | Application message: offer | Same | Tone formal; mentions terms |
| EM.13 | Application message: rejection | Same | Tone professional |
| EM.14 | New application (to employer) | Jobseeker applies to a job | Includes applicant name + job title + "View applicant" CTA |
| EM.15 | Account action: warning | Admin issues warning | Tone is firm but not threatening; lists specific behavior |
| EM.16 | Account action: temp suspension | Admin suspends with duration | States exact unsuspend date |
| EM.17 | Account action: perm suspension | Admin permanent suspends | Explains appeal process or lack thereof |
| EM.18 | Account action: termination | Admin deletes | Final notice; data deletion timeline |
| EM.19 | Bulk: announcement | Admin sends bulk announcement | Reaches all selected users; one email per recipient (no CC blast) |
| EM.20 | Bulk: maintenance | Admin sends bulk maintenance | Date/time of downtime clearly stated |
| EM.21 | Job match alert | New job posted matching jobseeker's profile | Job title, link, "Edit preferences" CTA at footer |
| EM.22 | Unsubscribe link works (try on each email) | Click unsubscribe in any of the above | Lands on `/unsubscribe?token=...`; confirmation; no further emails after |

**Email-specific gotchas to look for:**
- Dark mode rendering in Gmail/Apple Mail (logo/colors invert?)
- Mobile vs desktop rendering (does it look squished on iPhone?)
- "From" name correct ("advance.al" not "noreply" or random)
- Any broken images (CDN issues)
- Any English text leaking through Albanian copy
- Email gets flagged as spam (check spam folder!)
- Reply-to: replying to the email reaches a real inbox (not bounces)

---

# Section 7 — Cross-device & responsive

**Estimated time: 60 min. Use real devices where possible.**

## 7.A — Desktop

| ID | Action | Expect | PASS / FAIL / NOTES |
|---|---|---|---|
| C7.1 | Chrome 1920×1080 | All pages render correctly | |
| C7.2 | Chrome 1366×768 (laptop) | All pages render correctly | |
| C7.3 | Safari 1440×900 | Same | |
| C7.4 | Firefox 1920×1080 | Same | |
| C7.5 | Edge 1920×1080 | Same (if you have it) | |

## 7.B — Tablet

| ID | Action | Expect | PASS / FAIL / NOTES |
|---|---|---|---|
| C7.6 | iPad 768×1024 portrait | Layout adapts; nav becomes hamburger or stays as is | |
| C7.7 | iPad 1024×768 landscape | Same | |
| C7.8 | iPad mini 744×1133 | Same | |

## 7.C — Mobile

**The most important section. Test on a REAL phone, not just DevTools simulator.**

| ID | Action | Expect | PASS / FAIL / NOTES |
|---|---|---|---|
| C7.9 | iPhone 12/13/14 (Safari) — homepage | No horizontal scroll, hero readable, CTAs tappable (44×44 min) | |
| C7.10 | iPhone — `/jobs` | Job cards stack vertically, images load | |
| C7.11 | iPhone — apply to a job | Form usable, keyboard doesn't cover submit button | |
| C7.12 | iPhone — login | Email keyboard for email field, password obscured | |
| C7.13 | iPhone — `/post-job` 4-step wizard | Each step navigable, no fields cut off | |
| C7.14 | Android (Chrome) — same flows | Same | |
| C7.15 | Pull-to-refresh on `/jobs` | Native refresh works | |
| C7.16 | Test in landscape orientation | Layout still works | |
| C7.17 | Tap a phone number link (`tel:`) | iPhone offers to call | |
| C7.18 | Tap an email link (`mailto:`) | Opens default mail app | |
| C7.19 | Long-press a job link | Native iOS preview / Android long-press menu works | |
| C7.20 | Mobile DevTools throttle to "Slow 3G" + "CPU 4× slowdown" | Page still loads in < 10s; no broken states | |

## 7.D — Cross-browser specific bugs

| ID | Action | Expect | PASS / FAIL / NOTES |
|---|---|---|---|
| C7.21 | Safari: date inputs render correctly | Native date picker works | |
| C7.22 | Safari: file uploads work | Native file picker | |
| C7.23 | Firefox: localStorage persists across sessions | Login state survives | |
| C7.24 | Browser back/forward — no broken state | Page state restored properly | |
| C7.25 | Browser reload (Cmd+R) on `/post-job` mid-flow | Either restores or shows clear "session expired" | |

---

# Section 8 — Edge cases & errors

**Estimated time: 45 min**

| ID | Action | Expect | PASS / FAIL / NOTES |
|---|---|---|---|
| ED.1 | Open `/jobs`, kill internet (airplane mode) → click into a job | Graceful "no internet" message OR cached data + retry button | |
| ED.2 | Restore internet → retry works | Page recovers without full reload required | |
| ED.3 | Mid-application submission, kill internet | Either offline-saved-and-resumed OR clear error with retry | |
| ED.4 | Open 2 tabs, login on Tab 1, do action on Tab 2 (was logged out) | Tab 2 picks up login from localStorage event listener (or requires manual refresh) | |
| ED.5 | Open 2 tabs as employer, edit same job in both, save Tab 1 then save Tab 2 | Tab 2 either wins (last-write) OR shows conflict warning. Document which | |
| ED.6 | Logout in Tab 1, try to do action in Tab 2 | Tab 2 gets 401, redirects to login OR shows error | |
| ED.7 | Token expires (wait or set short expiry) — make a request | Auto-refreshes silently OR clear "session expired" toast | |
| ED.8 | Refresh token expires too — make a request | Force-logout, redirected to `/login` with message | |
| ED.9 | Cookies disabled in browser | Site shows "cookies required" message OR works in degraded mode | |
| ED.10 | JavaScript disabled | Either degraded HTML or "JS required" message | |
| ED.11 | Right-click → Open in new tab on a job link | Works correctly | |
| ED.12 | Cmd+click on a job link | Opens in new tab | |
| ED.13 | Copy a job URL, paste in incognito window (logged out) | Job loads publicly, with login prompt for apply | |
| ED.14 | Copy `/profile` URL, paste in incognito | Redirects to `/login` (not a leaked profile) | |
| ED.15 | URL with query injection: `/jobs?q=<script>alert(1)</script>` | Renders as text, no alert popup | |
| ED.16 | URL with extremely long query: `/jobs?q=` + 10000 chars | Either trimmed or 400 error, no crash | |
| ED.17 | Browser zoom to 200% | Layout still usable | |
| ED.18 | Browser zoom to 50% | Layout still usable | |
| ED.19 | Spam-click "Apply" 10 times rapidly | Only 1 application created (idempotent / debounced) | |
| ED.20 | Spam-click "Save job" 20 times | Heart toggles consistently, only correct final state in DB | |
| ED.21 | Open `/profile`, refresh 50 times in a row | No memory leak; tab doesn't crash | |
| ED.22 | Leave site open in tab for 30 min, come back, do an action | Either refreshes session silently or asks to re-login | |

---

# Section 9 — Performance observations

**Estimated time: 30 min. Use Chrome DevTools → Performance + Network + Lighthouse.**

| ID | Action | Expect | PASS / FAIL / NOTES |
|---|---|---|---|
| PR.1 | Cold-load `/` (cleared cache) — measure FCP and LCP in DevTools | LCP < 2.5s on broadband | |
| PR.2 | Cold-load `/jobs` | LCP < 3s | |
| PR.3 | Cold-load `/jobs/:id` | LCP < 2.5s | |
| PR.4 | Run Lighthouse on `/` (mobile + desktop) | Performance > 70 mobile, > 90 desktop | |
| PR.5 | Run Lighthouse on `/jobs` | Same | |
| PR.6 | Network panel: Total page weight on `/` | < 3MB | |
| PR.7 | Network panel: Number of requests on `/` | < 100 | |
| PR.8 | Memory tab: open `/jobs`, scroll, navigate around for 5 min | Memory does NOT keep growing (heap stable after GC) | |
| PR.9 | Console: any "Slow network" warnings or React render warnings? | Zero | |
| PR.10 | Largest Contentful Paint element on `/` is sensible (hero image, not invisible) | Element is meaningful | |
| PR.11 | Time-to-interactive on `/` | < 3.5s | |
| PR.12 | Bundle size — check Vite output (`npm run build`) | Largest chunk < 500KB gzipped | |
| PR.13 | Apply filters on `/jobs` — request goes out within 50ms after debounce | Network panel shows | |
| PR.14 | Search debounce: type rapidly, only ONE API call per pause | Network shows debounce works | |

---

# Section 10 — Accessibility (a11y)

**Estimated time: 30 min**

| ID | Action | Expect | PASS / FAIL / NOTES |
|---|---|---|---|
| AC.1 | Keyboard-only: Tab through homepage from top | Visible focus indicator on every interactive element; can reach everything | |
| AC.2 | Keyboard-only: Tab through `/login`, fill, submit with Enter | Submit works with Enter; focus returns sensibly after error | |
| AC.3 | Keyboard-only: Open a modal, can dismiss with Esc | Esc closes modal; focus returns to trigger | |
| AC.4 | VoiceOver (Mac: Cmd+F5) on `/` | Reads page hierarchy correctly; no "button" without label | |
| AC.5 | VoiceOver on `/login` | Form fields properly labeled (no "Edit text") | |
| AC.6 | All images have `alt` text (DevTools Elements tab) | No `<img>` without alt (decorative ones can be `alt=""`) | |
| AC.7 | Color contrast: dark text on light background — use Chrome DevTools "Inspect → Accessibility" | All text has WCAG AA contrast (4.5:1 for body, 3:1 for large) | |
| AC.8 | Form errors are announced (not just colored red) | Aria-live region or visible text label | |
| AC.9 | Focus indicator visible on all interactive elements | Default browser focus or custom — visible on each | |
| AC.10 | Headings hierarchy is sensible (H1 → H2 → H3, no skipping) | No H1 → H4 jumps | |
| AC.11 | Page language attribute set: `<html lang="sq">` | View source confirms | |
| AC.12 | Form fields have visible labels (not just placeholders) | Labels persist when focused | |
| AC.13 | Buttons that look like links and vice versa — are they semantically correct? | `<button>` for actions, `<a>` for navigation | |
| AC.14 | Skip-to-content link (often hidden, appears on Tab) | Pressing Tab on `/` reveals "Skip to main content" link | |

---

# Section 11 — Security manual probes

**Estimated time: 30 min. These complement the automated security tests.**

| ID | Action | Expect | PASS / FAIL / NOTES |
|---|---|---|---|
| SC.1 | Logged in as jobseeker, navigate to `/admin` directly | Redirected to `/`, NOT shown admin UI even briefly | |
| SC.2 | Logged in as jobseeker, GET `/api/admin/users` directly (DevTools console fetch) | 403, never any admin data | |
| SC.3 | Logged in as employer A, GET `/api/applications/job/<employer-B's-job-id>` | 403/404 | |
| SC.4 | Logged in as jobseeker A, GET `/api/users/<jobseeker-B's-id>/email` (or any direct PII access) | 403 or only public fields returned | |
| SC.5 | Inspect Network → search for `password` in any response body | Zero hits — password should NEVER appear in any response | |
| SC.6 | Inspect Network → search for `refreshToken` in any response (other than the auth refresh response itself) | Zero hits in normal browsing | |
| SC.7 | localStorage keys: `authToken`, `refreshToken` (or `user` JSON without password) | Only safe data in localStorage | |
| SC.8 | sessionStorage: should be empty or contain only ephemeral data | No sensitive data | |
| SC.9 | Cookies: `httpOnly` flag on auth cookies (DevTools → Application → Cookies) | httpOnly: true (if cookies are used) | |
| SC.10 | Cookies: `Secure` flag in production | Secure: true (won't be visible on localhost http; check staging/prod) | |
| SC.11 | Cookies: `SameSite=Lax` or `Strict` | Set | |
| SC.12 | Network → search for any 3rd-party requests to unexpected domains | Only expected domains (Cloudinary, Resend, Sentry if enabled) | |
| SC.13 | Headers (Network → any request → Response Headers): `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Strict-Transport-Security`, CSP present | All security headers present (Helmet middleware should add them) | |
| SC.14 | View source on `/` | No `<!-- TODO: -->` comments leaking; no API keys; no debug info | |
| SC.15 | Try posting `<script>alert(document.cookie)</script>` as a job description | Stored escaped; on render, NO alert appears | |
| SC.16 | Right-click → View Page Source on a sensitive page | No leaked secrets | |
| SC.17 | Try submitting `{"email": {"$gt": ""}, "password": "anything"}` as login JSON | 400 (malformed) — NoSQL injection blocked | |
| SC.18 | Try CSRF: copy a `POST /api/auth/login` to a different origin via curl with cookies | If CSRF defenses use SameSite cookies + token, attack fails | |
| SC.19 | Inspect a logout response — does it clear all cookies? | Set-Cookie headers reset auth/refresh | |
| SC.20 | After password change (F-21 fix verification): open Tab A logged in, in Tab B change password, then in Tab A make any auth request | Tab A's request fails (refresh token revoked) — F-21 fix verified live | |

---

# Section 12 — Visual / UX feel checks

**Estimated time: 30 min. This is THE section automation cannot do.**

| ID | Action | Expect | PASS / FAIL / NOTES |
|---|---|---|---|
| UX.1 | Animations on page transitions feel smooth, not janky | Smooth at 60fps | |
| UX.2 | Loading states (skeletons, spinners) appear within 100ms — not "white screen for 2s" | Quick feedback | |
| UX.3 | Hover states on buttons/links — distinct visual change | Visible on hover | |
| UX.4 | Click feedback on buttons (slight scale or color change) | Visual press feedback | |
| UX.5 | Form validation errors appear inline, near the relevant field — not in a generic banner | Inline | |
| UX.6 | Success toasts dismiss after ~3s; error toasts stay until user dismisses | Correct behavior | |
| UX.7 | Empty states have a real illustration + CTA, not just "No data" | Designed empty states | |
| UX.8 | Error states have a clear "what to do next" CTA | Recovery action visible | |
| UX.9 | Long content (job description) is readable — not a wall of text without breaks | Paragraphs, headings | |
| UX.10 | Color usage is consistent — primary brand color used for primary CTAs only | Visual hierarchy clear | |
| UX.11 | Icons are consistent style (line vs filled vs duotone) | Consistent | |
| UX.12 | Typography hierarchy clear (H1 > H2 > body) | Distinct sizes | |
| UX.13 | Spacing/padding consistent across pages (8px or 4px grid) | No "off by 1px" feels | |
| UX.14 | Albanian copy is fluent — no Google-translate-ese | Native speaker review needed | |
| UX.15 | All dates formatted consistently (e.g., "30 Mars 2026", not "3/30/2026" mixed with "30/03/2026") | Consistent | |
| UX.16 | Currency formatting: "1,000 €" or "1.000 €" — use one consistent format | Consistent | |
| UX.17 | Phone formatting: `+355 68 123 4567` consistently spaced | Consistent | |
| UX.18 | Profile photos / company logos with sane fallback (initials or generic icon) | No broken-image icons anywhere | |
| UX.19 | Modal backdrops have correct blur/dim — page beneath is dimmed but identifiable | Clear modal context | |
| UX.20 | Close-modal-X buttons are 44×44 minimum (mobile-tappable) | Tappable | |
| UX.21 | The Robot Assistant / RotatingContact: does it actually feel useful, or in the way? | Subjective: does it add value? | |
| UX.22 | First-time-user experience on `/` — is it obvious what to do next? | Hero CTA clear | |
| UX.23 | Profile completeness % gives clear next-step suggestion | "Add work experience" etc. | |
| UX.24 | Job-application success page — clear next step ("View your applications", "Browse more jobs") | Clear next CTA | |
| UX.25 | Any TODO / FIXME comments leaking into UI text | Zero | |

---

# Section 13 — External-services-specific checks (real Cloudinary/Twilio/Resend/OpenAI)

These are precisely the integrations automation couldn't fully verify.

## 13.A — Cloudinary (file uploads)

| ID | Action | Expect | PASS / FAIL / NOTES |
|---|---|---|---|
| EX.1 | Profile photo upload — verify in Cloudinary dashboard the file actually arrives | Visible in cloud | |
| EX.2 | Company logo upload — same | Visible in cloud | |
| EX.3 | Resume PDF upload — same (in correct folder per env) | Correct folder | |
| EX.4 | Cloudinary URLs returned to frontend — copy URL, paste in incognito | Image loads publicly (or signed-URL with auth) | |
| EX.5 | Delete profile photo from UI | Cloudinary asset deleted (or soft-marked) | |
| EX.6 | Upload while Cloudinary is briefly unreachable (block in network panel) | Backend returns clean 5xx, NOT a partial-state DB write | |

## 13.B — Resend (email delivery)

| ID | Action | Expect | PASS / FAIL / NOTES |
|---|---|---|---|
| EX.7 | Send a registration verification — open Resend dashboard | Email shows in Resend logs as "delivered" | |
| EX.8 | Email actually arrives in test inbox within 30s | Real arrival | |
| EX.9 | Reply to a Resend email — replies reach a real inbox | Reply-to address correct | |
| EX.10 | Bulk send to 100 users — Resend dashboard shows 100 sends | Throughput correct | |
| EX.11 | DKIM/SPF — view email source in Gmail, check "show original" | DKIM PASS, SPF PASS | |
| EX.12 | Email gets to inbox, not spam (test in real Gmail) | Not flagged spam | |

## 13.C — Twilio (SMS) — only if enabled

| ID | Action | Expect | PASS / FAIL / NOTES |
|---|---|---|---|
| EX.13 | Trigger SMS verification with method='sms' | SMS arrives on real phone | |
| EX.14 | SMS body in Albanian | Correct language | |
| EX.15 | Twilio dashboard shows the send | Visible | |

## 13.D — OpenAI (CV generation, embeddings)

| ID | Action | Expect | PASS / FAIL / NOTES |
|---|---|---|---|
| EX.16 | "Generate AI CV" with a real fully-completed jobseeker profile | OpenAI call succeeds; DOCX downloads in < 30s | |
| EX.17 | DOCX content is structurally correct — name at top, sections labeled, skills listed | Manual review of file | |
| EX.18 | DOCX language matches user preference | Correct lang | |
| EX.19 | "Parse Resume with AI" — upload a CV, profile fields auto-fill | Reasonable accuracy | |
| EX.20 | Job match notification — post a job that matches a jobseeker's profile, jobseeker gets email + in-app notification | Match logic works (embedding-based) | |
| EX.21 | After a profile change, re-embedding happens within ~5s | Verify in `/admin/embeddings` queue | |

## 13.E — Sentry — only if enabled

| ID | Action | Expect | PASS / FAIL / NOTES |
|---|---|---|---|
| EX.22 | Trigger a deliberate frontend error (e.g., open `/jobs/<bogus-id>`) — check Sentry dashboard | Error captured with stack trace | |
| EX.23 | Trigger a backend 500 — check Sentry | Captured with full context | |
| EX.24 | Error contains user context (id, role) but NO password or token | Verify privacy | |

## 13.F — Payments (Paysera, when integrated)

> Currently `ENABLE_MOCK_PAYMENTS=true` is the test-mode flag. Production payment is NOT yet integrated. Skip until Paysera lands.

| ID | Action | Expect | PASS / FAIL / NOTES |
|---|---|---|---|
| EX.25 | Currently: `POST /matching/jobs/:id/purchase` returns 503 if `ENABLE_MOCK_PAYMENTS` not set | 503 | |
| EX.26 | Once Paysera integrated: real card test flow | (Future) | |

---

# Section 14 — Deploy / production specifics

| ID | Action | Expect | PASS / FAIL / NOTES |
|---|---|---|---|
| DP.1 | Backend `/api/health` returns 200 with version info | Responds with uptime, version | |
| DP.2 | Backend Sentry init only in production env | Sentry not noisy in dev | |
| DP.3 | CORS allows only advance.al + Vercel deployment URL | Curl from random origin → blocked | |
| DP.4 | Helmet security headers present on every response | Verified via DevTools | |
| DP.5 | Rate limit: 16 wrong logins → 429 (auth limit is 15 in 15 min) | Test on staging only, not local since SKIP_RATE_LIMIT=true | |
| DP.6 | `/api/health` must NOT leak DB/env details | Only safe info | |
| DP.7 | robots.txt allows public pages, blocks /admin /api | Verify file content | |
| DP.8 | sitemap.xml lists job pages | If implemented | |
| DP.9 | Open Graph tags on job pages (Facebook/Twitter share) | OG image, title, description set | |
| DP.10 | Favicon visible | Visible in tab |

---

# Reporting template

When you find an issue, log it in this format and send to me. Use the QA-TEST-STATE.md (or new file) to track running list.

```
## ISSUE: [short title]
- **Severity**: P0 / P1 / P2 / P3
- **Section**: e.g., "Section 4.C — Post Job"
- **Test ID**: e.g., E4.21
- **Browser**: Chrome 124 / Safari 17.4 / etc.
- **Device**: MacBook Air M2 / iPhone 14 Pro / etc.
- **Reproduction steps**:
  1. Visit /post-job
  2. Fill step 1
  3. Click Next
  4. ...
- **Expected**: Step 2 form should appear
- **Actual**: Page goes blank, console error "Cannot read property X of undefined"
- **Screenshot/video**: [link or attachment]
- **Console errors** (DevTools → Console):
  ```
  TypeError: Cannot read properties of undefined (reading 'x')
    at PostJob.jsx:42:18
  ```
- **Network errors** (DevTools → Network → red requests):
  - `POST /api/jobs/draft` → 500
- **Notes**: Anything else relevant (only happens with French keyboard layout, only on Tuesdays, etc.)
```

---

# After-the-pass cleanup

| ID | Action | Expect | PASS / FAIL / NOTES |
|---|---|---|---|
| FN.1 | Delete all test accounts created | DB clean | |
| FN.2 | Delete all test jobs | DB clean | |
| FN.3 | Delete all test applications | DB clean | |
| FN.4 | Verify no leftover test data appears in production-bound DB | Clean | |
| FN.5 | Save QA pass notes file in `tests/results/QA-PASS-YYYY-MM-DD.md` | Saved | |
| FN.6 | Tag any P0/P1 findings as deploy blockers | Triaged | |

---

# Section 15 — What was NOT covered (fully transparent)

This guide does NOT cover:
- Production load testing (k6 — needs deployed env, separate exercise)
- Real Paysera payment flow (not yet integrated)
- Stress test (1000 concurrent users) — needs load testing infra
- Penetration testing (SQL injection in production DB, auth brute force on real rate-limited endpoints) — separate security audit
- Database backup/restore procedures (DevOps concern)
- Staging vs production deploy parity (DevOps concern)
- Monitoring alert configuration (DevOps concern)
- App store deployment if a mobile app is planned later

---

# Section 16 — Computer Use complement (the Playwright walker option)

If you say **"build the walker"**, I will create:
- `frontend/e2e/exploratory/walker-jobseeker.spec.ts` — auto-walks every jobseeker URL with screenshots
- `frontend/e2e/exploratory/walker-employer.spec.ts` — same for employer
- `frontend/e2e/exploratory/walker-admin.spec.ts` — same for admin
- `frontend/e2e/exploratory/walker-public.spec.ts` — logged-out browsing

Output: ~80 screenshots + 4 short videos in `playwright-report/exploratory/`. Open the HTML report — scroll through every screen in 30 minutes vs clicking through for 6 hours.

The walker captures functional state. **Manual review of the screenshot album catches:**
- Visual layout bugs
- Broken images
- Truncated text
- Wrong language anywhere
- Missing UI elements
- Awkward spacing
- Wrong color usage

The walker does NOT replace any of the manual checks above for: real device rendering, real email rendering in mailbox apps, animation smoothness (single screenshots), or UX feel.

---

# Time budget summary

| Section | Time |
|---|---|
| 0 — Setup | 15 min |
| 1 — Smoke | 15 min |
| 2 — Public/logged-out | 45 min |
| 3 — Jobseeker | 90 min |
| 4 — Employer | 90 min |
| 5 — Admin | 60 min |
| 6 — Email rendering | 30 min |
| 7 — Cross-device | 60 min |
| 8 — Edge cases | 45 min |
| 9 — Performance | 30 min |
| 10 — Accessibility | 30 min |
| 11 — Security probes | 30 min |
| 12 — Visual/UX feel | 30 min |
| 13 — External services | 45 min |
| 14 — Deploy specifics | 15 min |
| **TOTAL** | **~7.5 hours** |

Spread across 2 days (4 hours each) or 3 sessions (2.5 hours each). The smoke section + email + visual are the highest-yield-per-minute and should run first.

---

**Final note**: this guide is fresh as of 2026-04-29 night. After Phase 22's automation pass + 3 production fixes (F-21, F-22, F-23), this manual QA covers everything those automated tests can't reach. When you find an issue, send me the report-template entry and I'll fix it (production code, not just the test) and re-run the relevant Phase 22 tier to verify the fix didn't regress anything else.
