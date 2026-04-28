# FULL QA TESTING GUIDE — advance.al

> **Purpose:** Exhaustive, every-feature, every-edge-case QA testing document.
> Covers all 110+ API endpoints, 22 active pages, 18 models, 11 services.
> Estimated total time: 8-12 hours for complete first pass.
>
> **Test Environment:**
> - Frontend: `http://localhost:5173` (dev) / `https://advance.al` (prod)
> - Backend: `http://localhost:3001` (dev) / production URL
> - Browser: Chrome (primary), Safari, Firefox
> - Mobile: 375px (iPhone), 768px (iPad), 1024px (laptop)
>
> **Test Accounts Needed:**
> 1. **Admin**: admin@advance.al (pre-seeded)
> 2. **Employer A**: Create fresh during testing
> 3. **Employer B**: Create fresh (for cross-employer tests)
> 4. **Jobseeker A**: Create fresh during testing
> 5. **Jobseeker B**: Create fresh (for duplicate/cross-user tests)
> 6. **Quick User**: Create via landing page (no account)
>
> **Email Inbox:** Watch `advance.al123456@gmail.com` for all test emails (test mode redirects all)

---

## TABLE OF CONTENTS

1. [AUTH: Registration, Login, Password, Sessions](#1-auth)
2. [JOB SEEKER: Profile, CV, Work History, Education, Alerts](#2-job-seeker-profile)
3. [JOB BROWSING: Search, Filters, Pagination, Save, Detail](#3-job-browsing)
4. [JOB APPLICATION: Apply, Track, Withdraw, Messages](#4-job-application)
5. [EMPLOYER: Dashboard, Job Posting, Editing, Closing](#5-employer)
6. [EMPLOYER: Applicant Management, Contact, Matching](#6-employer-applicants)
7. [QUICK USER: Signup, Preferences, Unsubscribe](#7-quick-user)
8. [NOTIFICATIONS: In-App, Email, Digests, Job Matching](#8-notifications)
9. [CV SYSTEM: AI Generation, Upload, Parse, Download](#9-cv-system)
10. [ADMIN: Dashboard, Stats, User Management](#10-admin-dashboard)
11. [ADMIN: Job Management, Approval, Moderation](#11-admin-jobs)
12. [ADMIN: Reports & Moderation Actions](#12-admin-reports)
13. [ADMIN: Bulk Notifications & Templates](#13-admin-bulk-notifications)
14. [ADMIN: Configuration & System Health](#14-admin-configuration)
15. [ADMIN: Business Controls, Campaigns, Pricing Rules](#15-admin-business)
16. [ADMIN: Embedding System Management](#16-admin-embeddings)
17. [EMBEDDING & AI MATCHING: Testing Guide](#17-embedding-testing)
18. [CANDIDATE MATCHING: Employer Purchase & Access](#18-candidate-matching)
19. [NAVIGATION, FOOTER, ROUTING](#19-navigation)
20. [LEGAL PAGES: Privacy & Terms](#20-legal)
21. [RESPONSIVE & MOBILE](#21-responsive)
22. [PERFORMANCE & LOADING](#22-performance)
23. [ERROR HANDLING & EDGE CASES](#23-error-handling)
24. [SECURITY TESTING](#24-security)
25. [CROSS-BROWSER COMPATIBILITY](#25-cross-browser)
26. [END-TO-END USER JOURNEYS](#26-e2e-journeys)
27. [PRODUCTION AUDIT FIX VERIFICATION](#27-audit-verification)
28. [ACCESSIBILITY](#28-accessibility)

---

## 1. AUTH

### 1.1 Job Seeker Registration
**Page:** `/jobseekers` → scroll to signup form
**Priority:** CRITICAL

**Happy Path:**
- [ ] Go to `/jobseekers`
- [ ] Click "Regjistrohu" or scroll to signup form
- [ ] Fill in: First name, Last name, Email, Password (8+ chars, upper+lower+number), Confirm password, City
- [ ] Click Submit
- [ ] **VERIFY:** Verification modal appears with 6-digit code input
- [ ] Check email inbox for verification code
- [ ] Enter the 6-digit code
- [ ] **VERIFY:** Registration completes, auto-login, redirect to `/profile`
- [ ] **VERIFY:** Navigation shows user menu with name
- [ ] **VERIFY:** Tutorial system appears (onboarding spotlight)

**Validation Tests:**
- [ ] Submit completely empty form → validation errors on all required fields
- [ ] Email without `@` → validation error
- [ ] Password < 8 chars → error
- [ ] Password without uppercase → error
- [ ] Password without number → error
- [ ] Confirm password doesn't match → error
- [ ] Already registered email → clear "already exists" error (not generic)
- [ ] Valid email but unreachable domain (test@nonexistent.fake) → registration proceeds (email validation is format-only)

**Edge Cases:**
- [ ] Albanian characters in name (Ëlvira Çela) → accepted and displayed correctly
- [ ] Very long name (200 chars) → handled (truncated or rejected)
- [ ] Special chars in name (`<script>alert(1)</script>`) → sanitized, no XSS
- [ ] Rapidly click Submit 5 times → only one registration attempt
- [ ] Enter wrong verification code → error, can retry
- [ ] Enter wrong code 3 times → still allows retry (rate limit may kick in)
- [ ] Let verification code expire (wait 10 min) → error, can request new code
- [ ] Click "Resend code" → new code sent, 60-second cooldown on button
- [ ] Refresh page during verification → modal persists or form state preserved
- [ ] Navigate away during verification, come back → state handled

**Mobile (375px):**
- [ ] Form fields full width, no overflow
- [ ] Keyboard doesn't cover submit button
- [ ] Verification code input usable with phone keyboard

---

### 1.2 Employer Registration
**Page:** `/employers` → multi-step form (3 steps)
**Priority:** CRITICAL

**Happy Path:**
- [ ] Go to `/employers` or click "Regjistrohu" in footer under "Punëdhënësit"
- [ ] **Step 1** — Fill in: Company name, First name, Last name, Email, Password, Confirm
- [ ] Click Next
- [ ] **Step 2** — Fill in: City, Industry (select from 16 options), Company size, Description (optional)
- [ ] Click Next
- [ ] **Step 3** — Review pricing plan (€5/job, 1 free job)
- [ ] Click Submit
- [ ] **VERIFY:** Verification modal appears
- [ ] Enter code from email
- [ ] **VERIFY:** Logged in, redirected to `/employer-dashboard`
- [ ] **VERIFY:** Dashboard shows welcome/tutorial

**Step Validation:**
- [ ] Step 1: All empty → validation errors
- [ ] Step 1: Can't proceed to Step 2 without filling required fields
- [ ] Step 2: No city selected → validation error
- [ ] Step 2: Select "Tjetër" (Other) for industry → custom industry text field appears
- [ ] Step 2: Fill custom industry → accepted
- [ ] Step 3: Review shows correct info from Steps 1-2
- [ ] Back button: Step 3 → Step 2 → Step 1, data preserved

**Edge Cases:**
- [ ] Company name with special chars → sanitized
- [ ] Very long company description (5000 chars) → handled
- [ ] Browser back button during multi-step → handled gracefully
- [ ] `?signup=true` param in URL → auto-scrolls to form

**Mobile:**
- [ ] Multi-step form works on mobile
- [ ] Progress bar visible
- [ ] Back/Next buttons accessible

---

### 1.3 Login
**Page:** `/login`
**Priority:** CRITICAL

**Happy Path:**
- [ ] Go to `/login`
- [ ] Enter valid email + password
- [ ] Click "Hyr"
- [ ] **VERIFY:** Logged in, redirected based on role:
  - Admin → `/admin`
  - Employer → `/employer-dashboard`
  - Jobseeker → `/profile`
- [ ] **VERIFY:** Nav shows user menu with name

**Validation:**
- [ ] Empty fields → validation error
- [ ] Wrong password → "Kredenciale të gabuara" (does NOT reveal if email exists)
- [ ] Non-existent email → same generic error message (no email enumeration)
- [ ] Email in wrong case (ADMIN@Advance.AL) → works (case-insensitive)

**Session Persistence:**
- [ ] Refresh page → still logged in
- [ ] Close tab, reopen → still logged in (localStorage token)
- [ ] Open in private/incognito → NOT logged in (no stored token)

**Edge Cases:**
- [ ] Login while already logged in → redirect to dashboard
- [ ] Visit `/login` while authenticated → redirect or appropriate handling
- [ ] Suspended user tries to login → clear suspension message
- [ ] Banned user tries to login → clear ban message
- [ ] Deleted user tries to login → generic "credentials wrong" error

---

### 1.4 Logout
**Priority:** CRITICAL

- [ ] Click user menu → "Dil" (Logout)
- [ ] **VERIFY:** Redirected to home page
- [ ] **VERIFY:** Nav shows Login/Register buttons (not user menu)
- [ ] Press browser Back button → cannot access protected page
- [ ] Visit `/profile` directly → redirected to login
- [ ] Visit `/employer-dashboard` → redirected to login
- [ ] Visit `/admin` → redirected to login
- [ ] **VERIFY:** Refresh tokens invalidated (API calls return 401)

---

### 1.5 Forgot Password
**Page:** `/forgot-password`
**Priority:** CRITICAL

- [ ] Click "Keni harruar fjalëkalimin?" on login page
- [ ] **VERIFY:** Forgot password page loads
- [ ] Submit empty → validation error
- [ ] Enter registered email → success message
- [ ] Enter non-existent email → SAME success message (no email enumeration)
- [ ] Check email inbox → reset link received
- [ ] Click link → goes to `/reset-password?token=...`

---

### 1.6 Password Reset
**Page:** `/reset-password?token=...`
**Priority:** CRITICAL

- [ ] Open reset link from email
- [ ] **VERIFY:** Reset form loads
- [ ] Enter weak password → validation error
- [ ] Enter strong password + confirm
- [ ] Submit → success, redirected to login
- [ ] Login with new password → works
- [ ] Login with old password → fails
- [ ] Try reset link again → expired/invalid
- [ ] Try reset link with modified token → invalid

---

### 1.7 Change Password (While Logged In)
**Priority:** HIGH

- [ ] Go to Profile or Dashboard → Settings
- [ ] Find change password form
- [ ] Enter wrong current password → error
- [ ] Enter correct current + new password
- [ ] **VERIFY:** Password changed successfully
- [ ] Logout and login with new password → works

---

### 1.8 Token Refresh & Session
**Priority:** HIGH

- [ ] Login and use app normally
- [ ] Wait for access token to expire (~15 min) or manually expire in DevTools
- [ ] Perform an action
- [ ] **VERIFY:** Token auto-refreshes (no forced logout)
- [ ] Open app in 2 tabs with same account
- [ ] Logout in Tab 1
- [ ] Perform action in Tab 2
- [ ] **VERIFY:** Tab 2 handles stale session (redirect to login)
- [ ] Login on Device A, login on Device B
- [ ] Both should work (multiple sessions allowed)

---

### 1.9 Email Verification (Post-Registration)
**Priority:** HIGH

- [ ] Register but don't verify
- [ ] Login → profile shows "Email not verified" warning
- [ ] Click "Send verification email"
- [ ] **VERIFY:** Code sent to email
- [ ] Enter correct code
- [ ] **VERIFY:** Email verified, warning disappears
- [ ] **VERIFY:** `emailVerified: true` in profile

---

## 2. JOB SEEKER PROFILE

### 2.1 Personal Information Tab
**Page:** `/profile`
**Priority:** CRITICAL

- [ ] Go to `/profile`
- [ ] **VERIFY:** Page loads with all current data (name, email, city, bio)
- [ ] **VERIFY:** Email field is read-only
- [ ] Edit first name, last name
- [ ] Change city from dropdown
- [ ] Write a bio (check character counter)
- [ ] Click Save
- [ ] **VERIFY:** Success toast
- [ ] Refresh page → changes persisted

**Edge Cases:**
- [ ] Paste 10,000 characters in bio → handled (character counter shows limit)
- [ ] Albanian characters (ë, ç, Ç, Ë) → save and display correctly
- [ ] Empty first name → validation error
- [ ] Special characters in name → sanitized
- [ ] Rapidly click Save 5 times → no issues
- [ ] Navigate away with unsaved changes → confirmation dialog (if implemented)

---

### 2.2 Work Experience
**Priority:** HIGH

- [ ] Click "Add Work Experience" / "Shto Eksperiencë"
- [ ] **VERIFY:** Modal opens with fields: Position, Company, Location, Start date, End date, Currently working, Description, Achievements
- [ ] Fill all fields → Save
- [ ] **VERIFY:** Entry appears in list with correct data
- [ ] Toggle "Currently working" → End date field hides/disables
- [ ] Edit the entry → changes save
- [ ] Delete the entry → confirmation dialog → confirm → removed
- [ ] Add 3+ entries → all display correctly

**Edge Cases:**
- [ ] End date before start date → validation error
- [ ] Duplicate entry (same company+position+dates) → prevented
- [ ] Very long description (5000 chars) → handled
- [ ] Dates in future → acceptable (current job)
- [ ] Rapidly click Save 5 times → no duplicates

---

### 2.3 Education
**Priority:** HIGH

- [ ] Click "Add Education" / "Shto Edukim"
- [ ] **VERIFY:** Modal with: Degree, Field of Study, Institution, Location, Start/End dates, Currently studying, GPA, Description
- [ ] Fill all fields → Save
- [ ] **VERIFY:** Entry in list
- [ ] Toggle "Currently studying" → End date hides
- [ ] Edit → changes save
- [ ] Delete → removed after confirmation
- [ ] Add 3+ entries → all display

**Edge Cases:**
- [ ] Same as Work Experience edge cases
- [ ] GPA out of range → handled

---

### 2.4 CV Upload & Resume Management
**Priority:** HIGH

- [ ] Upload a PDF resume → accepted, preview/download link appears
- [ ] Upload a DOCX resume → accepted
- [ ] Upload a .exe file → rejected with clear error
- [ ] Upload a 50MB file → rejected with size error
- [ ] Upload a new file → replaces old one
- [ ] Delete resume → removed with confirmation
- [ ] **VERIFY:** After upload, if CV parsing is available, profile fields auto-fill from parsed data
- [ ] **VERIFY:** Background parsing indicator shows if parsing is in progress

---

### 2.5 Job Alert Preferences
**Priority:** MEDIUM

- [ ] Find Job Alerts section in profile
- [ ] Toggle email job alerts ON
- [ ] Select interested job categories
- [ ] Save preferences
- [ ] **VERIFY:** Preferences saved (check API response)
- [ ] Toggle OFF
- [ ] **VERIFY:** No more job alert emails

---

### 2.6 Applications Tab (in Profile)
**Priority:** HIGH

- [ ] Go to Profile → Applications tab
- [ ] **VERIFY:** Lists all submitted applications with status
- [ ] **VERIFY:** Application status timeline (pending → viewed → shortlisted/rejected/hired)
- [ ] Click on an application → navigates to job detail
- [ ] **VERIFY:** Correct count badge

---

## 3. JOB BROWSING

### 3.1 Jobs Listing Page
**Page:** `/` or `/jobs`
**Priority:** CRITICAL

- [ ] Navigate to home page
- [ ] **VERIFY:** Page loads with: Navigation, Premium jobs carousel, Search bar, Quick filters, Job cards, Pagination
- [ ] **VERIFY:** No console errors (check DevTools)
- [ ] **VERIFY:** Premium/featured jobs carousel works (auto-scrolls, clickable)

---

### 3.2 Job Search
**Priority:** CRITICAL

- [ ] Type "Marketing" in search → results filter to matching jobs
- [ ] Clear search → all jobs return
- [ ] Type gibberish "zzzzxxx" → "Nuk u gjet asnjë punë" empty state
- [ ] Search with Albanian characters (ë, ç) → works correctly
- [ ] Search for `<script>alert(1)</script>` → no XSS, handled gracefully
- [ ] Search for single character "a" → returns matching jobs
- [ ] Search for very long string (500 chars) → handled

---

### 3.3 Filters
**Priority:** CRITICAL

**Location Filter:**
- [ ] Click location dropdown → Albanian cities populate from DB
- [ ] Select "Tiranë" → only Tiranë jobs shown
- [ ] Select different city → results update
- [ ] Clear location → all locations shown

**Category Filter:**
- [ ] Select "Teknologji" → only tech jobs
- [ ] Select "Marketing" → only marketing jobs
- [ ] Clear → all categories

**Job Type Filter:**
- [ ] Full-time → only full-time
- [ ] Part-time → only part-time
- [ ] Internship → only internships

**Platform Category Quick Filters (CoreFilters):**
- [ ] Click "Diaspora" → only diaspora jobs shown
- [ ] Click "Nga Shtëpia" (Remote) → only remote jobs
- [ ] Click "Part Time" → only part-time
- [ ] Click "Administrata" → only administrata jobs
- [ ] Click "Sezonale" → only seasonal jobs
- [ ] Toggle filter OFF → removed

**Salary Filter:**
- [ ] Set minimum salary → results with salary ≥ min
- [ ] Set maximum salary → results with salary ≤ max
- [ ] Set both min and max → salary range filter

**Experience/Seniority Filter:**
- [ ] Filter by Junior → only junior jobs
- [ ] Filter by Senior → only senior jobs

**Combined Filters:**
- [ ] Location + Category + Job Type → intersection of all three
- [ ] All filters resulting in 0 matches → empty state message shown
- [ ] Clear all → all jobs return

**Sorting:**
- [ ] Sort by newest → most recent first
- [ ] Sort by salary (high to low) → highest salary first
- [ ] Sort by relevance → default sorting

---

### 3.4 Pagination
**Priority:** HIGH

- [ ] With 10+ jobs, verify pagination controls appear
- [ ] Click page 2 → different jobs, URL updates
- [ ] Click page 3 → different jobs
- [ ] Click Previous → goes back
- [ ] Click Next → goes forward
- [ ] First page: Previous disabled
- [ ] Last page: Next disabled
- [ ] **VERIFY:** Page scrolls to top on page change

---

### 3.5 Job Detail Page
**Page:** `/jobs/:id` or `/jobs/:slug`
**Priority:** CRITICAL

- [ ] Click any job card → Job detail page loads
- [ ] **VERIFY:** All fields display: Title, Company, Location, Salary, Job Type, Experience, Category, Description, Requirements, Benefits, Tags, Posted date, Application deadline, View count, Application count
- [ ] **VERIFY:** Employer info section (company name, industry)
- [ ] **VERIFY:** "Apliko" (Apply) button visible
- [ ] **VERIFY:** Similar Jobs section loads (if embeddings computed)
- [ ] Click browser Back → returns to jobs list with filters preserved

**Edge Cases:**
- [ ] Visit nonexistent job ID → 404 or "Job not found" page
- [ ] Visit deleted job → 404
- [ ] Visit expired job → shows "Expired" badge, apply disabled
- [ ] Visit closed job → shows "Closed" badge
- [ ] Job with no salary set → salary section hidden or shows "Negociueshëm"
- [ ] Job with hidden salary (`showPublic: false`) → salary not shown

---

### 3.6 Save/Bookmark Jobs
**Priority:** HIGH

**Logged in as Jobseeker:**
- [ ] On job card, click bookmark icon → icon toggles to saved state
- [ ] **VERIFY:** Saved confirmation (toast or icon change)
- [ ] Click bookmark again → unsaved
- [ ] Save 3+ jobs → all saved
- [ ] Go to `/saved-jobs` → all saved jobs listed
- [ ] Unsave from saved jobs page → removed from list
- [ ] **VERIFY:** Correct total count displayed

**Not logged in:**
- [ ] Click bookmark → redirected to login or prompted
- [ ] After login → bookmark action completes (or user needs to redo)

**Edge Cases:**
- [ ] Save the same job rapidly 10 times → no duplicates
- [ ] Save a job that gets deleted by employer → handled gracefully in saved list

---

### 3.7 Saved Jobs Page
**Page:** `/saved-jobs`
**Priority:** HIGH

- [ ] Navigate to Saved Jobs
- [ ] **VERIFY:** Lists all saved jobs with job cards
- [ ] **VERIFY:** Pagination if 10+ saved jobs
- [ ] Click "Apply" on a saved job → application flow
- [ ] Click job card → navigates to detail
- [ ] Empty state: no saved jobs → helpful message with link to browse jobs

---

### 3.8 Recently Viewed Jobs
**Priority:** MEDIUM

- [ ] View 3-4 different job details
- [ ] Return to jobs listing
- [ ] **VERIFY:** "Recently Viewed" sidebar shows the jobs you visited
- [ ] Click a recently viewed job → navigates to it

---

## 4. JOB APPLICATION

### 4.1 Apply to Job (One-Click)
**Priority:** CRITICAL

**Pre-condition:** Logged in as Jobseeker with profile filled

- [ ] View a job with `applicationMethod: 'internal'`
- [ ] Click "Apliko"
- [ ] **VERIFY:** Application modal opens
- [ ] If one-click: Click confirm
- [ ] **VERIFY:** Success message
- [ ] **VERIFY:** Button changes to "Aplikuar" (Applied)
- [ ] **VERIFY:** Application count on job increments
- [ ] Try applying again → "You already applied" / button disabled

---

### 4.2 Apply to Job (Custom Form)
**Priority:** CRITICAL

- [ ] View a job with custom application questions
- [ ] Click "Apliko"
- [ ] **VERIFY:** Modal shows custom questions
- [ ] Submit without answering required questions → validation errors
- [ ] Fill all required answers + optional cover letter
- [ ] Submit → success
- [ ] **VERIFY:** Custom answers saved (visible to employer)

---

### 4.3 Apply to Job (External Link)
**Priority:** HIGH

- [ ] View a job with `applicationMethod: 'external_link'`
- [ ] Click "Apliko"
- [ ] **VERIFY:** Opens external URL in new tab
- [ ] **VERIFY:** No internal application created

---

### 4.4 Apply to Job (Email)
**Priority:** HIGH

- [ ] View a job with `applicationMethod: 'email'`
- [ ] Click "Apliko"
- [ ] **VERIFY:** Opens email client with pre-filled to: address

---

### 4.5 Application Edge Cases
**Priority:** HIGH

- [ ] Apply while NOT logged in → redirect to login, then back to job
- [ ] Apply as EMPLOYER → not allowed (apply button hidden or shows error)
- [ ] Apply to expired job → not allowed
- [ ] Apply to closed job → not allowed
- [ ] Apply to own job (if same account is both) → not allowed
- [ ] Rapidly click Apply 5 times → only 1 application created
- [ ] Apply, withdraw, then apply again → should work (re-application allowed)

---

### 4.6 My Applications
**Page:** Profile → Applications tab
**Priority:** HIGH

- [ ] View all submitted applications
- [ ] **VERIFY:** Each shows: Job title, Company, Applied date, Status
- [ ] Status badges: Pending (yellow), Viewed (blue), Shortlisted (green), Rejected (red), Hired (gold)
- [ ] Filter by status → works
- [ ] **VERIFY:** Application count in tab badge

---

### 4.7 Withdraw Application
**Priority:** HIGH

- [ ] Find a pending application
- [ ] Click "Tërhiq" (Withdraw)
- [ ] **VERIFY:** Confirmation dialog
- [ ] Confirm → status changes to "Withdrawn"
- [ ] **VERIFY:** Job's applicationCount decremented (not negative)
- [ ] Try to apply to same job again → allowed (since withdrawn)

---

### 4.8 Application Messages
**Priority:** MEDIUM

- [ ] Open an application where employer sent a message
- [ ] **VERIFY:** Message visible with timestamp
- [ ] Reply to the message
- [ ] **VERIFY:** Reply sent, appears in conversation
- [ ] Check unread indicator on messages

---

## 5. EMPLOYER

### 5.1 Employer Dashboard
**Page:** `/employer-dashboard`
**Priority:** CRITICAL

- [ ] Login as employer → dashboard loads
- [ ] **VERIFY:** Stats section: Active jobs count, Total applicants, Monthly views, Growth %
- [ ] **VERIFY:** Tabs: Jobs, Applicants, Settings
- [ ] **VERIFY:** Tutorial system on first visit

---

### 5.2 Post New Job
**Page:** `/post-job`
**Priority:** CRITICAL

**Happy Path (4-step wizard):**

**Step 0 — Basic Info:**
- [ ] Enter job title (required, character counter shown)
- [ ] Enter description (required, rich text)
- [ ] Select category from dropdown (14 Albanian categories)
- [ ] Select job type (full-time, part-time, freelance, temporary, etc.)
- [ ] Select experience level (Junior, Mid, Senior)
- [ ] Select application method (one-click, email, external URL)
- [ ] If external URL: URL input appears
- [ ] Click Next

**Step 1 — Location:**
- [ ] Select city from autocomplete dropdown (Albanian cities from DB)
- [ ] Toggle platform categories:
  - [ ] Diaspora checkbox
  - [ ] Nga Shtëpia (Remote) checkbox
  - [ ] Part Time checkbox
  - [ ] Administrata checkbox
  - [ ] Sezonale checkbox
- [ ] Click Next

**Step 2 — Salary (Optional):**
- [ ] Set min salary → number input
- [ ] Set max salary → number input
- [ ] Select currency (EUR / ALL)
- [ ] Toggle salary period (monthly/yearly)
- [ ] Toggle show/hide salary publicly
- [ ] Click Next

**Step 3 — Requirements & Benefits:**
- [ ] Add requirements (dynamic list, add/remove)
- [ ] Add benefits (dynamic list, add/remove)
- [ ] Add tags
- [ ] Add custom application questions:
  - [ ] Question text
  - [ ] Question type (text, multiple choice)
  - [ ] Required toggle
  - [ ] Add/remove questions
- [ ] Click "Publiko"
- [ ] **VERIFY:** Success message
- [ ] **VERIFY:** Redirected to dashboard
- [ ] **VERIFY:** New job appears in "My Jobs"
- [ ] **VERIFY:** Job visible on public `/jobs` page

**Validation:**
- [ ] Step 0: Empty title → error
- [ ] Step 0: Empty description → error
- [ ] Step 0: No category → error
- [ ] Step 1: No city → error
- [ ] Step 2: Min salary > Max salary → error
- [ ] Can't skip steps
- [ ] Back button preserves data

**Edge Cases:**
- [ ] Very long title (500 chars) → handled (max 100)
- [ ] Very long description (10000 chars) → handled (max 5000)
- [ ] XSS in any field → sanitized
- [ ] Create two jobs with IDENTICAL titles → both get unique slugs (e.g., `marketing-manager` and `marketing-manager-1`)
- [ ] Rapidly click Publish 5 times → only 1 job created
- [ ] Refresh during form → draft auto-saved to localStorage
- [ ] Come back to form → draft restored
- [ ] Clear draft option available

---

### 5.3 Draft Jobs
**Priority:** HIGH

- [ ] Start posting a job, fill some fields
- [ ] Save as Draft
- [ ] **VERIFY:** Job appears in dashboard with "Draft" status
- [ ] Edit the draft → all fields preserved
- [ ] Publish the draft → status changes to active
- [ ] **VERIFY:** Draft auto-save to localStorage works
- [ ] Close browser during posting → come back → draft restored

---

### 5.4 Edit Job
**Page:** `/edit-job/:id`
**Priority:** CRITICAL

- [ ] From dashboard, click Edit on a job
- [ ] **VERIFY:** Form pre-filled with all current data
- [ ] Change title, description, salary
- [ ] Save → changes reflected on public listing
- [ ] **VERIFY:** Slug updates if title changed
- [ ] Try to edit another employer's job → 403 or redirect

---

### 5.5 Close / Delete Job
**Priority:** HIGH

- [ ] From dashboard, close an active job
- [ ] **VERIFY:** Status → "Closed", no longer visible to job seekers
- [ ] Reopen the job → status back to active, visible again
- [ ] Delete a job → confirmation dialog → confirm
- [ ] **VERIFY:** Soft-deleted, gone from dashboard
- [ ] **VERIFY:** Public URL returns 404
- [ ] **VERIFY:** Pending applications for deleted job are handled (auto-rejected or notified)

---

### 5.6 Employer Dashboard Filters
**Priority:** MEDIUM

- [ ] Filter jobs by status (Active, Closed, Draft, Expired)
- [ ] Search jobs by title
- [ ] **VERIFY:** Filtered results correct
- [ ] Filter with 0 results → empty state message
- [ ] Filter applicants by job → only that job's applicants
- [ ] Filter applicants by status → correct filter

---

### 5.7 Employer Profile/Settings
**Priority:** HIGH

- [ ] Go to Settings tab in dashboard
- [ ] Edit company name, description, industry, size, contact info
- [ ] Save → persisted
- [ ] **VERIFY:** Changes reflected on public job listings
- [ ] **VERIFY:** Industry "Tjetër" (Other) shows custom input
- [ ] Change password → works

---

### 5.8 Job Contact Overrides
**Priority:** MEDIUM

- [ ] When posting/editing a job, toggle "Use Custom Contacts"
- [ ] Set custom phone, WhatsApp, email for this specific job
- [ ] **VERIFY:** Job detail page shows custom contacts (not default company contacts)
- [ ] Disable custom contacts → default company contacts shown

---

## 6. EMPLOYER: APPLICANT MANAGEMENT

### 6.1 View Applicants
**Priority:** CRITICAL

- [ ] From dashboard Applicants tab, see all applicants
- [ ] Filter by job → only that job's applicants
- [ ] Filter by status → Pending, Viewed, Shortlisted, Rejected, Hired
- [ ] Click on an applicant → expanded view with:
  - [ ] Name, email, phone
  - [ ] Resume/CV download
  - [ ] Cover letter
  - [ ] Custom question answers
  - [ ] Work history
  - [ ] Education
  - [ ] Application timeline

---

### 6.2 Update Application Status
**Priority:** CRITICAL

- [ ] View an applicant
- [ ] Change status: Pending → Viewed
- [ ] **VERIFY:** Status badge updates
- [ ] Change: Viewed → Shortlisted
- [ ] Change: Shortlisted → Hired
- [ ] Change: Pending → Rejected
- [ ] **VERIFY:** Each status change persists on refresh
- [ ] **VERIFY:** Notification sent to jobseeker on status change

---

### 6.3 Contact Applicant
**Priority:** HIGH

- [ ] Click "Contact" on an applicant
- [ ] **VERIFY:** Contact modal with options: Email, Phone, WhatsApp
- [ ] Select Email → opens compose with pre-filled address
- [ ] Select Phone → shows phone number
- [ ] Select WhatsApp → opens WhatsApp with pre-filled number
- [ ] **VERIFY:** Contact tracked in system (analytics)

---

### 6.4 Send Message to Applicant
**Priority:** HIGH

- [ ] Open application details
- [ ] Type a message in the message box
- [ ] Send
- [ ] **VERIFY:** Message appears in conversation
- [ ] **VERIFY:** Jobseeker receives notification
- [ ] Send interview invite type → special formatting
- [ ] Send offer type → special formatting
- [ ] Send rejection type → special formatting

---

### 6.5 Download Applicant CV
**Priority:** HIGH

- [ ] Click download CV on applicant
- [ ] **VERIFY:** CV downloads (PDF or DOCX)
- [ ] If applicant has no CV → download button hidden or shows "No CV"

---

## 7. QUICK USER

### 7.1 Quick User Signup
**Page:** `/jobseekers?quick=true` or landing page quick form
**Priority:** HIGH

- [ ] Go to `/jobseekers` → find quick profile form
- [ ] Fill in: First name, Last name, Email, Location
- [ ] Select job interests (multi-select from categories)
- [ ] Optionally upload CV
- [ ] Submit
- [ ] **VERIFY:** Success message
- [ ] **VERIFY:** Welcome email sent to the email
- [ ] **VERIFY:** If matching jobs exist, initial matching email sent
- [ ] **VERIFY:** No password needed, no login required

**Edge Cases:**
- [ ] Duplicate email (same as existing quick user) → handled (error or update)
- [ ] Duplicate email (same as registered user) → handled
- [ ] No interests selected → validation or default
- [ ] Upload large CV (10MB) → handled
- [ ] Upload non-PDF/DOCX → rejected

---

### 7.2 Quick User Preferences
**Page:** `/preferences?token=...`
**Priority:** HIGH

- [ ] Open preferences link from email
- [ ] **VERIFY:** Page loads with current preferences
- [ ] Toggle email notifications ON/OFF
- [ ] Change interested categories
- [ ] Save
- [ ] **VERIFY:** Preferences updated
- [ ] **VERIFY:** Invalid/expired token → error page

---

### 7.3 Quick User Unsubscribe
**Page:** `/unsubscribe?token=...`
**Priority:** HIGH

- [ ] Open unsubscribe link from email
- [ ] **VERIFY:** Confirmation page (POST-based, not auto-unsubscribe)
- [ ] Click confirm
- [ ] **VERIFY:** Success message
- [ ] **VERIFY:** No more emails sent to this address
- [ ] **VERIFY:** Invalid token → error

---

### 7.4 Quick User CV Parsing
**Priority:** MEDIUM

- [ ] Sign up as quick user with CV upload
- [ ] **VERIFY:** CV parsed in background
- [ ] **VERIFY:** Parsed data (skills, experience, industries) used for matching
- [ ] After parsing, user should receive more relevant job notifications

---

## 8. NOTIFICATIONS

### 8.1 In-App Notifications
**Priority:** HIGH

- [ ] Login as any user
- [ ] **VERIFY:** Notification bell/icon in nav
- [ ] **VERIFY:** Unread count badge shows correct number
- [ ] Click bell → notification dropdown/panel opens
- [ ] **VERIFY:** Notifications listed with title, message, timestamp
- [ ] Click a notification → marked as read, navigates to relevant page
- [ ] "Mark all as read" → all marked, badge clears
- [ ] Delete a notification → removed from list
- [ ] No notifications → empty state message

---

### 8.2 Application Status Notifications
**Priority:** HIGH

- [ ] Employer changes application status (e.g., Pending → Viewed)
- [ ] **VERIFY:** Jobseeker receives in-app notification
- [ ] **VERIFY:** Notification says "Aplikimi juaj për [Job Title] u shikua"
- [ ] Employer shortlists → notification to jobseeker
- [ ] Employer rejects → notification to jobseeker
- [ ] Employer hires → notification to jobseeker
- [ ] Employer sends message → notification to jobseeker

---

### 8.3 New Application Notifications (for Employer)
**Priority:** HIGH

- [ ] Jobseeker applies to employer's job
- [ ] **VERIFY:** Employer receives in-app notification "Aplikim i ri për [Job Title]"
- [ ] **VERIFY:** Applicant count updates on dashboard

---

### 8.4 Job Match Email Notifications
**Priority:** HIGH

When a new job is posted:
- [ ] **VERIFY:** Matching quick users receive email notification with job details
- [ ] **VERIFY:** Matching registered jobseekers receive email notification
- [ ] **VERIFY:** Email contains: Job title, company, salary, location, apply link, unsubscribe link
- [ ] **VERIFY:** Non-matching users do NOT receive email
- [ ] **VERIFY:** Unsubscribed users do NOT receive email
- [ ] **VERIFY:** Rate limiting respected (batch sending with delays)

---

### 8.5 Welcome Email (Quick User)
**Priority:** MEDIUM

- [ ] Create new quick user
- [ ] **VERIFY:** Welcome email received with:
  - Greeting with name
  - Selected interests listed
  - Top matching jobs (if any)
  - Preferences link
  - Unsubscribe link

---

### 8.6 Account Action Notifications
**Priority:** MEDIUM

- [ ] Admin suspends a user
- [ ] **VERIFY:** Suspended user receives in-app notification + email about suspension
- [ ] Admin bans a user
- [ ] **VERIFY:** Banned user receives notification + email
- [ ] Admin lifts suspension
- [ ] **VERIFY:** User receives restoration notification

---

## 9. CV SYSTEM

### 9.1 AI CV Generation (from Natural Language)
**Page:** `/profile` → AI CV section, or `/jobseekers` → CVCreatorSection
**Priority:** HIGH

- [ ] Navigate to CV generator
- [ ] Enter natural language text (Albanian or English, 50+ chars):
  > "Jam një zhvillues software me 5 vjet përvojë në React dhe Node.js. Kam punuar tek kompania XYZ si Senior Developer..."
- [ ] Click Generate
- [ ] **VERIFY:** Loading state shown
- [ ] **VERIFY:** After 5-15 seconds, CV generated
- [ ] **VERIFY:** Generated CV has:
  - Personal info (extracted from text)
  - Professional summary (expanded to 80-120 words)
  - Work experience (8-12+ bullets per job)
  - Skills (technical, soft, tools)
  - Education (if mentioned)
  - Languages
- [ ] **VERIFY:** NO fabricated data (only what was stated/implied)
- [ ] Download CV → DOCX file downloads
- [ ] Preview CV → HTML preview in browser

**Edge Cases:**
- [ ] Input < 50 chars → validation error
- [ ] Input > 10,000 chars → handled
- [ ] Gibberish input → AI handles gracefully (minimal but valid CV)
- [ ] Rate limit: 5 generations per hour → error after 5th
- [ ] Albanian input → Albanian CV generated
- [ ] English input → English CV generated

---

### 9.2 CV Upload & AI Parsing
**Priority:** HIGH

- [ ] Upload a PDF CV to profile
- [ ] **VERIFY:** File uploaded to Cloudinary (not local disk)
- [ ] **VERIFY:** CV parsing starts automatically
- [ ] **VERIFY:** Parsed data auto-fills profile fields:
  - Title/position
  - Skills
  - Work experience entries
  - Education entries
  - Bio/summary
- [ ] Upload a DOCX CV → same parsing works
- [ ] **VERIFY:** Background parsing indicator visible

**Edge Cases:**
- [ ] Upload a PDF with no text (scanned image) → parsing fails gracefully, error message
- [ ] Upload a very short CV (20 chars) → minimal parsing
- [ ] Upload CV in Albanian → parsed correctly with Albanian fields
- [ ] Upload CV in English → parsed correctly

---

### 9.3 CV Download & Preview
**Priority:** MEDIUM

- [ ] After generating a CV, click Download
- [ ] **VERIFY:** DOCX file downloads with correct filename
- [ ] Open DOCX → professional formatting:
  - Name heading (size 36, bold)
  - Title (accent color)
  - Contact info
  - Sections: Summary, Experience, Education, Skills, Languages, Certifications
  - Proper bullets and formatting
- [ ] Click Preview → HTML version in browser
- [ ] **VERIFY:** Preview matches download content

---

## 10. ADMIN: DASHBOARD

### 10.1 Admin Dashboard Stats
**Page:** `/admin`
**Priority:** HIGH

- [ ] Login as admin → `/admin`
- [ ] **VERIFY:** Dashboard loads with real stats (not zeros):
  - Total users (jobseekers + employers)
  - Total employers
  - Total jobseekers
  - Active jobs count
  - Total applications
  - Total quick users
  - Pending employer verifications
  - Verified employers
- [ ] **VERIFY:** Numbers match actual DB counts
- [ ] **VERIFY:** Growth percentages shown (trending up/down icons)
- [ ] **VERIFY:** Dashboard cached (Redis, 5-min TTL) — fast reload

---

### 10.2 Admin Analytics
**Priority:** MEDIUM

- [ ] View analytics section
- [ ] **VERIFY:** Trends shown:
  - New users per month
  - Jobs posted per month
  - Applications per month
- [ ] **VERIFY:** Top job categories
- [ ] **VERIFY:** Top cities
- [ ] **VERIFY:** Recent activity feed

---

### 10.3 System Health
**Priority:** MEDIUM

- [ ] Check system health section
- [ ] **VERIFY:** Shows status of:
  - MongoDB: healthy/warning/error + response time
  - Email service: delivery rate
  - API: response time, error rate
  - Memory: usage %
  - CPU: usage %
- [ ] **VERIFY:** Overall status badge (healthy/warning/error)
- [ ] **VERIFY:** Alerts section if any issues

---

## 11. ADMIN: JOB MANAGEMENT

### 11.1 View All Jobs
**Priority:** HIGH

- [ ] Admin dashboard → Jobs tab
- [ ] **VERIFY:** ALL jobs listed (active, closed, deleted, draft, pending)
- [ ] Search by title → works
- [ ] Filter by status → works
- [ ] Pagination → works

---

### 11.2 Job Approval
**Priority:** HIGH

- [ ] View jobs pending approval
- [ ] Approve a job → status changes to active, visible to public
- [ ] Reject a job → status changes to rejected, not visible
- [ ] **VERIFY:** Employer notified of approval/rejection

---

### 11.3 Admin Job Actions
**Priority:** HIGH

- [ ] Feature a job (set tier to premium/featured)
- [ ] Delete a job (admin override)
- [ ] **VERIFY:** Deleted job no longer visible
- [ ] **VERIFY:** Pending applications handled

---

## 12. ADMIN: REPORTS & MODERATION

### 12.1 User Reporting Flow
**Priority:** HIGH

**As a regular user:**
- [ ] View a job or profile → click "Report" / "Raporto"
- [ ] **VERIFY:** Report modal opens with:
  - Category dropdown (fake_cv, inappropriate_content, spam, impersonation, harassment, fake_job, etc.)
  - Description text area
  - Submit button
- [ ] Fill category + description → Submit
- [ ] **VERIFY:** Success confirmation
- [ ] **VERIFY:** Report visible in user's report history

**As admin:**
- [ ] Go to `/admin/reports`
- [ ] **VERIFY:** Reports list loads with status badges (pending, under_review, resolved, dismissed)
- [ ] Filter by status, priority, category
- [ ] Click on a report → detail modal:
  - Full report info
  - Reported user profile
  - Reporter info
  - Related reports (pattern detection)
  - Violation history
- [ ] **VERIFY:** Stats show computed average resolution time (NOT hardcoded "2.5 ditë")

---

### 12.2 Moderation Actions
**Priority:** HIGH

- [ ] Open a pending report
- [ ] Take action: "Warning" → user receives warning notification + email
- [ ] Take action: "Temporary Suspension" → user account suspended for X days
  - [ ] **VERIFY:** Suspended user can't login
  - [ ] **VERIFY:** Suspension auto-lifts after duration
- [ ] Take action: "Permanent Suspension" → user permanently suspended
- [ ] Take action: "Account Termination" → user banned
- [ ] Take action: "No Action" → report dismissed
- [ ] Reopen a resolved report → status back to under_review
  - [ ] **VERIFY:** If user was suspended due to this report, suspension evaluated

---

### 12.3 Report Escalation
**Priority:** MEDIUM

- [ ] Submit 3+ reports against the same user
- [ ] **VERIFY:** Auto-escalation to "high" priority
- [ ] Submit 5+ reports against same user
- [ ] **VERIFY:** Auto-escalation to "critical" + escalated flag
- [ ] Admin receives notification about escalated reports

---

### 12.4 Admin Notes on Reports
**Priority:** LOW

- [ ] Open a report
- [ ] Add an internal note
- [ ] **VERIFY:** Note saved with timestamp and admin name
- [ ] Other admins can see the note

---

## 13. ADMIN: BULK NOTIFICATIONS

### 13.1 Create & Send Bulk Notification
**Priority:** MEDIUM

- [ ] Go to admin Notifications/Bulk section
- [ ] Create new notification:
  - Title, Message
  - Type (announcement, maintenance, feature, warning, update)
  - Target audience (all, employers, jobseekers, admins, quick_users)
  - Delivery channels (in-app, email, both)
- [ ] Send
- [ ] **VERIFY:** Notification appears in history with "sent" status
- [ ] **VERIFY:** Delivery stats update (target count, sent count)
- [ ] Login as targeted user type
- [ ] **VERIFY:** Notification received in-app
- [ ] **VERIFY:** Email received (if email channel selected)

---

### 13.2 Bulk Notification Templates
**Priority:** LOW

- [ ] Save a notification as template
- [ ] **VERIFY:** Template appears in templates list
- [ ] Create notification from template → pre-filled
- [ ] Delete draft notification → removed

---

### 13.3 Bulk Notification Edge Cases
**Priority:** MEDIUM

- [ ] Send to "all" audience → every user type receives
- [ ] Send to "quick_users" → only quick users, not registered
- [ ] Check error log if any delivery fails
- [ ] Rate limit: 10/hour → error after limit

---

## 14. ADMIN: CONFIGURATION

### 14.1 System Configuration
**Priority:** MEDIUM

- [ ] Go to admin Configuration tab
- [ ] **VERIFY:** Settings organized by category (platform, users, content, email, system, features, payment)
- [ ] View settings in each category
- [ ] Change a setting value (e.g., platform name)
- [ ] **VERIFY:** Saved with audit trail
- [ ] Reset setting to default
- [ ] **VERIFY:** Default value restored with audit

---

### 14.2 Pricing Configuration
**Priority:** HIGH

- [ ] View pricing settings
- [ ] Change base job posting price
- [ ] **VERIFY:** New price reflected for employers
- [ ] Audit trail shows who changed what, when

---

### 14.3 Maintenance Mode
**Priority:** HIGH

- [ ] Toggle maintenance mode ON
- [ ] **VERIFY:** Regular users see maintenance page
- [ ] **VERIFY:** Admin can still access dashboard
- [ ] Toggle OFF → site accessible again

---

### 14.4 Public Configuration
**Priority:** MEDIUM

- [ ] Check `/api/configuration/public` returns only public settings
- [ ] **VERIFY:** No sensitive settings leaked
- [ ] **VERIFY:** Cached (5 min TTL)

---

## 15. ADMIN: BUSINESS CONTROLS

### 15.1 Marketing Campaigns
**Priority:** MEDIUM

- [ ] Create a campaign:
  - Name, description
  - Type (flash_sale, referral, new_user_bonus, seasonal, etc.)
  - Discount percentage (0-90%)
  - Duration
  - Target audience
  - Max uses
- [ ] Activate campaign
- [ ] **VERIFY:** Campaign shows as active
- [ ] Post a job as employer → campaign discount applied to price
- [ ] Pause campaign → no longer applies
- [ ] **VERIFY:** Campaign results track: revenue, conversions

---

### 15.2 Dynamic Pricing Rules
**Priority:** MEDIUM

- [ ] Create a pricing rule:
  - Name, category (industry, location, demand, company_size, seasonal, time)
  - Base price, multiplier, conditions
  - Priority (higher = first)
- [ ] Activate rule
- [ ] Post a job matching the rule conditions
- [ ] **VERIFY:** Price adjusted according to rule
- [ ] Deactivate rule → default pricing

---

### 15.3 Employer Whitelist (Free Posting)
**Priority:** MEDIUM

- [ ] Search for an employer
- [ ] Add to whitelist (free posting)
- [ ] **VERIFY:** Employer can post jobs without payment
- [ ] Remove from whitelist
- [ ] **VERIFY:** Employer needs to pay again

---

### 15.4 Emergency Controls
**Priority:** HIGH

- [ ] **VERIFY:** Emergency controls available:
  - Pause all job posting
  - Pause all applications
  - Pause all emails
  - Custom emergency action
- [ ] Trigger an emergency action with reason
- [ ] **VERIFY:** Action takes effect immediately
- [ ] **VERIFY:** Audit log created for the emergency action
- [ ] Reverse the emergency action
- [ ] **VERIFY:** Normal operation restored

---

### 15.5 Business Analytics
**Priority:** LOW

- [ ] View revenue analytics dashboard
- [ ] **VERIFY:** Daily/weekly/monthly revenue charts
- [ ] **VERIFY:** Top industries by revenue
- [ ] **VERIFY:** Top locations by demand
- [ ] **VERIFY:** Campaign performance
- [ ] **VERIFY:** Pricing rule impact

---

## 16. ADMIN: EMBEDDING SYSTEM

### 16.1 Embedding Status Dashboard
**Priority:** HIGH

- [ ] Go to admin → Embeddings section
- [ ] **VERIFY:** Status overview:
  - Total jobs with embeddings
  - Jobs pending embeddings
  - Failed embeddings count
  - Last embedding generated time
- [ ] **VERIFY:** Queue health:
  - Pending tasks count
  - Processing tasks count
  - Failed tasks count
  - Completed tasks count

---

### 16.2 Worker Status
**Priority:** MEDIUM

- [ ] View worker status
- [ ] **VERIFY:** Shows:
  - Worker PID
  - Status (running/paused/stopped)
  - Last heartbeat
  - Processed count
  - Failed count
  - Memory usage
  - Current task (if processing)

---

### 16.3 Embedding Admin Actions
**Priority:** MEDIUM

- [ ] "Recompute All" → queues all jobs for re-embedding (max 500 batch)
- [ ] "Retry Failed" → re-queues failed embedding tasks
- [ ] "Clear Old Queue" → deletes completed/failed old items
- [ ] Queue a specific job for embedding → job ID input + submit
- [ ] Delete a specific queue item
- [ ] Toggle debug mode → more verbose logging

---

## 17. EMBEDDING & AI MATCHING: TESTING GUIDE

> **This section explains how to verify the embedding/AI matching system works correctly.**

### 17.1 Understanding the Embedding Pipeline

The system uses OpenAI `text-embedding-3-small` (1536-dimension vectors) to create semantic representations of:
1. **Jobs** — from title, description, requirements, category, tags, location
2. **Jobseekers** — from skills, title, bio, work history, education
3. **Quick Users** — from interests, parsed CV data, location

These vectors are compared via **cosine similarity** (0.0–1.0) to find semantic matches.

### 17.2 How to Test Job Embeddings

**Step 1: Verify embedding generation**
```bash
# Check how many jobs have embeddings
curl -s http://localhost:3001/api/admin/embeddings/status \
  -H "Authorization: Bearer <admin-token>" | jq
```
- [ ] **VERIFY:** Response shows total jobs, jobs with embeddings, jobs without
- [ ] **VERIFY:** `completedEmbeddings` count > 0

**Step 2: Trigger embedding for a new job**
- [ ] Post a new job as employer
- [ ] Wait 30-60 seconds (worker processes queue)
- [ ] Check embedding status:
```bash
# Check specific job embedding
curl -s "http://localhost:3001/api/admin/embeddings/status" \
  -H "Authorization: Bearer <admin-token>" | jq '.queueStats'
```
- [ ] **VERIFY:** Job's embedding status transitions: pending → processing → completed

**Step 3: Manually queue a job**
```bash
curl -X POST "http://localhost:3001/api/admin/embeddings/queue-job/<jobId>" \
  -H "Authorization: Bearer <admin-token>"
```
- [ ] **VERIFY:** Returns success, queue item created

---

### 17.3 How to Test Similar Jobs

**Step 1: View job with embeddings**
- [ ] Open a job detail page for a job that has completed embedding
- [ ] **VERIFY:** "Similar Jobs" section shows related jobs
- [ ] **VERIFY:** Similar jobs are actually relevant (same category, similar skills)

**Step 2: Compare similar jobs quality**
- [ ] Open a "Teknologji" (Tech) job → similar jobs should be tech jobs
- [ ] Open a "Marketing" job → similar jobs should be marketing jobs
- [ ] Open a job in Tiranë → similar jobs preferably in Tiranë or similar cities
- [ ] **VERIFY:** Similarity makes semantic sense, not just keyword matching

**Step 3: Fallback when no embeddings**
- [ ] Find a job without an embedding (newly posted, worker not yet processed)
- [ ] **VERIFY:** Similar jobs section shows fallback results (same category/location) instead of empty

---

### 17.4 How to Test User-Job Matching

**Step 1: Test quick user matching**
- [ ] Create a quick user with interests: "Teknologji, Marketing"
- [ ] Post a new tech job
- [ ] **VERIFY:** Quick user receives notification email about the new job
- [ ] Create a quick user with interests: "Bujqësi" (Agriculture)
- [ ] Post a tech job
- [ ] **VERIFY:** Agriculture user does NOT receive notification (no match)

**Step 2: Test semantic matching (with embeddings)**
```bash
# As admin, check eligible users for a job
curl -s "http://localhost:3001/api/notifications/eligible-users/<jobId>" \
  -H "Authorization: Bearer <admin-token>" | jq
```
- [ ] **VERIFY:** Returns both keyword-matched AND semantically-matched users
- [ ] **VERIFY:** Semantic matches include users whose CV/profile is related even without exact keyword match

**Step 3: Test job matching for new user**
- [ ] Register a new jobseeker with skills like "React, Node.js, JavaScript"
- [ ] **VERIFY:** Welcome email contains top matching jobs (tech jobs)
- [ ] Register a jobseeker with skills like "Accounting, Finance"
- [ ] **VERIFY:** Welcome email contains finance/accounting jobs

---

### 17.5 How to Test Candidate Matching (Employer Side)

- [ ] Login as employer
- [ ] Go to a job posting → "Find Matching Candidates"
- [ ] **VERIFY:** Candidates shown with match score (0-100%)
- [ ] **VERIFY:** Match breakdown visible:
  - Title match (0-20)
  - Skills match (0-25)
  - Experience match (0-15)
  - Location match (0-15)
  - Education match (0-5)
  - Salary match (0-10)
  - Availability match (0-10)
- [ ] **VERIFY:** If both heuristic AND embedding scores available, hybrid scoring used
- [ ] **VERIFY:** Results cached (24h) — second request is faster

---

### 17.6 How to Test Embedding Quality

**Manual cosine similarity check:**
```bash
# Step 1: Get a job's embedding (needs DB access)
# In MongoDB shell:
db.jobs.findOne({slug: "your-job-slug"}, {embedding: 1, title: 1})

# Step 2: Get another job's embedding
db.jobs.findOne({slug: "another-job-slug"}, {embedding: 1, title: 1})

# Step 3: Calculate cosine similarity manually or via script
# High similarity (>0.7) = very similar jobs
# Medium similarity (0.55-0.7) = somewhat related
# Low similarity (<0.55) = different topics
```

**Practical quality tests:**
- [ ] Two tech jobs with similar descriptions → similarity > 0.7
- [ ] Tech job vs Marketing job → similarity < 0.55
- [ ] Same category, different cities → similarity > 0.55 (location is weighted less)
- [ ] Albanian job description vs English → depends on embeddings model (multilingual)

---

### 17.7 How to Test Embedding Worker

```bash
# Check if worker is running
curl -s "http://localhost:3001/api/admin/embeddings/workers" \
  -H "Authorization: Bearer <admin-token>" | jq
```
- [ ] **VERIFY:** At least one worker with status "running"
- [ ] **VERIFY:** Last heartbeat within 3 minutes
- [ ] **VERIFY:** Memory usage reasonable (<85% heap)

**Test worker recovery:**
- [ ] Kill the worker process (if possible in dev)
- [ ] **VERIFY:** Stuck tasks auto-recovered after 10 minutes (or manual via admin)
- [ ] **VERIFY:** Failed tasks retried with exponential backoff (60s, 5m, 15m)

---

### 17.8 How to Test User Embedding Generation

**For jobseekers:**
- [ ] Complete a jobseeker profile with: title, skills, bio, work history
- [ ] **VERIFY:** User embedding generated (check via admin embeddings dashboard)
- [ ] Update profile significantly (change skills, add work history)
- [ ] **VERIFY:** Embedding regenerated

**For quick users with CV:**
- [ ] Create quick user and upload CV
- [ ] Wait for CV parsing to complete
- [ ] **VERIFY:** Quick user embedding generated after CV parsed
- [ ] **VERIFY:** Embedding used for job matching

**Admin backfill:**
```bash
# Regenerate embeddings for users with missing/failed embeddings
curl -X POST "http://localhost:3001/api/admin/backfill-user-embeddings" \
  -H "Authorization: Bearer <admin-token>"

curl -X POST "http://localhost:3001/api/admin/backfill-job-embeddings" \
  -H "Authorization: Bearer <admin-token>"
```
- [ ] **VERIFY:** Backfill queues tasks for users/jobs without embeddings

---

## 18. CANDIDATE MATCHING

### 18.1 Purchase Matching Access
**Priority:** MEDIUM

- [ ] Login as employer
- [ ] Go to a job → "Find Matching Candidates"
- [ ] **VERIFY:** If no access purchased, purchase prompt shown
- [ ] Purchase access (mock payment in dev)
- [ ] **VERIFY:** Access granted, candidates visible
- [ ] **VERIFY:** Access is lifetime per job (doesn't expire)
- [ ] Check access on same job later → still accessible

---

### 18.2 Matching Results Quality
**Priority:** MEDIUM

- [ ] View matches for a "React Developer" job
- [ ] **VERIFY:** Top candidates have React/JavaScript skills
- [ ] **VERIFY:** Candidates sorted by match score (highest first)
- [ ] **VERIFY:** Match breakdown shows meaningful scores
- [ ] Contact a candidate → contact tracked
- [ ] **VERIFY:** Contact tracking recorded for analytics

---

### 18.3 Matching Edge Cases
**Priority:** LOW

- [ ] Job with no matching candidates → helpful empty message
- [ ] Job with only 1-2 matches → shows what's available
- [ ] New job posted → matching may take time until embeddings generated
- [ ] **VERIFY:** Cache invalidated when new candidates register

---

## 19. NAVIGATION, FOOTER, ROUTING

### 19.1 Top Navigation
**Priority:** HIGH

**Logged out:**
- [ ] Logo → home page
- [ ] "Punë" → `/jobs`
- [ ] "Punëkërkuesit" → `/jobseekers`
- [ ] "Punëdhënësit" → `/employers`
- [ ] "Rreth Nesh" → `/about`
- [ ] "Hyr" → `/login`
- [ ] "Regjistrohu" → `/register`
- [ ] **VERIFY:** "Kompanite" is NOT shown (temporarily disabled)

**Logged in as Jobseeker:**
- [ ] User menu shows name
- [ ] "Profili Im" → `/profile`
- [ ] "Punët e Ruajtura" → `/saved-jobs`
- [ ] Notification bell visible
- [ ] "Dil" → logout

**Logged in as Employer:**
- [ ] "Dashboard" → `/employer-dashboard`
- [ ] "Posto Punë" → `/post-job`
- [ ] Notification bell visible
- [ ] "Dil" → logout

**Logged in as Admin:**
- [ ] "Admin" → `/admin`
- [ ] "Raportet" → `/admin/reports`
- [ ] "Dil" → logout

---

### 19.2 Footer
**Priority:** HIGH

- [ ] "Punët e fundit" → `/jobs`
- [ ] "Shfleto Punëkërkuesit" → `/jobseekers`
- [ ] "Krijo CV me AI" → `/jobseekers` (scrolls to AI section)
- [ ] "Posto një punë" → `/employers`
- [ ] "Regjistrohu" (under Punëdhënësit) → `/employer-register`
- [ ] "Regjistrohu" (under Punëkërkuesit) → `/jobseekers` and scrolls to signup form
- [ ] "Rreth Nesh" → `/about`
- [ ] "Kontakti" → `/about` and scrolls to contact section
- [ ] "Politika e Privatësisë" → `/privacy`
- [ ] "Kushtet e Përdorimit" → `/terms`
- [ ] "info@advance.al" → opens email client
- [ ] "JXSOFT" link → opens jxsoft.al in new tab
- [ ] **VERIFY:** "Kompanite" links NOT in footer

---

### 19.3 404 Page
**Priority:** MEDIUM

- [ ] Visit `/nonexistent-page` → friendly 404 with navigation
- [ ] Visit `/companies` → 404 (disabled route)
- [ ] Visit `/company/123` → 404 (disabled route)
- [ ] **VERIFY:** 404 page has link back to home

---

## 20. LEGAL PAGES

### 20.1 Privacy Policy (`/privacy`)
**Priority:** HIGH

- [ ] Page loads with all 14 sections:
  1. Hyrje (references Ligji Nr. 9887)
  2. Kontrolluesi i të Dhënave
  3. Të Dhënat që Mbledhim
  4. Baza Ligjore
  5. Si i Përdorim
  6. Përpunimi me AI
  7. Ndarja me Palë të Treta
  8. Transferimi Ndërkombëtar
  9. Cookies
  10. Periudhat e Ruajtjes
  11. Të Drejtat Tuaja
  12. Mbrojtja e Miturve
  13. Siguria
  14. Na Kontaktoni
- [ ] No "NIPT" anywhere on page
- [ ] Link to Terms page works
- [ ] Albanian characters render correctly
- [ ] Scrollable, readable on mobile

---

### 20.2 Terms & Conditions (`/terms`)
**Priority:** HIGH

- [ ] Page loads with all 16 sections (see QA-MANUAL-CHECKLIST)
- [ ] No "NIPT" anywhere
- [ ] Link to Privacy page works
- [ ] Albanian text correct
- [ ] Mobile readable

---

## 21. RESPONSIVE & MOBILE

### 21.1 Mobile Tests (375px viewport)
**Priority:** HIGH

- [ ] Home page — job cards stack, search usable, filters accessible
- [ ] Job detail — all content readable, Apply button accessible
- [ ] Login form — fields full width, no overflow
- [ ] Registration — all steps work, verification modal fits
- [ ] Profile page — tabs work, forms usable
- [ ] Employer dashboard — table scrolls or reformats
- [ ] Admin dashboard — tabs accessible, content doesn't overflow
- [ ] Hamburger menu appears, all links accessible
- [ ] Footer stacks correctly
- [ ] Modals don't overflow screen
- [ ] All forms — keyboards don't cover submit buttons

### 21.2 Tablet Tests (768px)
**Priority:** MEDIUM

- [ ] Two-column layouts adapt correctly
- [ ] Job cards in 2-column grid
- [ ] Dashboard tables readable
- [ ] Navigation adapts

### 21.3 Small Laptop (1024px)
**Priority:** MEDIUM

- [ ] Full navigation visible
- [ ] Job cards in 2-3 column grid
- [ ] Dashboard fully functional
- [ ] No horizontal scrolling

---

## 22. PERFORMANCE & LOADING

### 22.1 Page Load Times
**Priority:** MEDIUM

- [ ] Home page loads < 3 seconds on broadband
- [ ] Job detail loads < 2 seconds
- [ ] Dashboard loads < 3 seconds (cached after first load)
- [ ] No visible layout shift (CLS) during loading
- [ ] Smooth scrolling through job listings
- [ ] Images load progressively

### 22.2 Compression
**Priority:** MEDIUM

```bash
# Verify HTTP compression working
curl -I -H "Accept-Encoding: gzip" http://localhost:3001/api/jobs?page=1&limit=10
```
- [ ] **VERIFY:** `Content-Encoding: gzip` in response headers
- [ ] **VERIFY:** Large responses (>1KB) are compressed

### 22.3 Caching
**Priority:** MEDIUM

- [ ] Job search results cached (60s TTL) — second identical search is instant
- [ ] Admin dashboard cached (5 min) — fast reload
- [ ] Locations cached (1 hour) — dropdown loads instantly
- [ ] Public stats cached (5 min)
- [ ] Public configuration cached (5 min)

### 22.4 Bundle Sizes (Frontend)
**Priority:** LOW

```bash
cd frontend && npm run build
ls -la dist/assets/*.js
```
- [ ] **VERIFY:** Main bundle < 250KB (was 536KB, now ~198KB after chunk splitting)
- [ ] **VERIFY:** Vendor chunk exists (react, react-dom)
- [ ] **VERIFY:** Mantine chunk exists
- [ ] **VERIFY:** UI chunk exists (recharts, motion)
- [ ] **VERIFY:** No single chunk > 300KB

---

## 23. ERROR HANDLING & EDGE CASES

### 23.1 Network Errors
**Priority:** MEDIUM

- [ ] DevTools → Network → Offline → try loading page → error message shown
- [ ] Go back online → try submitting form → recovers
- [ ] Slow 3G → loading spinners visible, no duplicate submissions

### 23.2 Stale Sessions
**Priority:** MEDIUM

- [ ] Open 2 tabs → logout in tab 1 → action in tab 2 → handled (redirect to login)
- [ ] Manually corrupt localStorage token → next API call handled gracefully

### 23.3 Concurrent Actions
**Priority:** MEDIUM

- [ ] Two users apply to same job simultaneously → both succeed, no duplicates
- [ ] Two admins edit same configuration → last write wins, no crash
- [ ] Employer edits job while someone is applying → both succeed

### 23.4 Data Limits
**Priority:** LOW

- [ ] Create 100+ jobs → search/pagination still works
- [ ] Create 50+ applications → lists still performant
- [ ] 1000+ notifications → pagination works

### 23.5 Special Characters
**Priority:** MEDIUM

- [ ] Albanian characters everywhere: ë, Ë, ç, Ç → save and display correctly
- [ ] Emojis in text fields → handled
- [ ] HTML tags in input → sanitized (no XSS)
- [ ] SQL/NoSQL injection: `"; db.dropDatabase();` → no effect
- [ ] Very long strings (10000 chars) → truncated or rejected

---

## 24. SECURITY TESTING

### 24.1 Authentication Bypass
**Priority:** CRITICAL

- [ ] Access `/api/admin/dashboard-stats` without token → 401
- [ ] Access with expired token → 401
- [ ] Access with jobseeker token → 403 (wrong role)
- [ ] Access `/api/applications/employer/all` as jobseeker → 403
- [ ] Access `/api/admin/*` as employer → 403
- [ ] Modify JWT token payload → signature invalid → 401

### 24.2 Authorization (BOLA/IDOR)
**Priority:** CRITICAL

- [ ] Employer A tries to edit Employer B's job → 403 or 404
- [ ] Jobseeker A tries to view Jobseeker B's applications → no data
- [ ] Employer tries to view another employer's applicants → 403
- [ ] Admin endpoints only accessible by admin role

### 24.3 Input Sanitization
**Priority:** HIGH

- [ ] XSS payload in any text field → not executed, sanitized
- [ ] `<img src=x onerror=alert(1)>` in job description → sanitized
- [ ] NoSQL injection: `{"$gt": ""}` in query params → no effect
- [ ] Path traversal: `../../../etc/passwd` in file upload → rejected

### 24.4 Rate Limiting
**Priority:** HIGH

- [ ] Login: 15 attempts in 15 min → rate limited after 15
- [ ] Registration: rapid submissions → rate limited
- [ ] Verification code: 5-10 attempts → rate limited
- [ ] Reports: 5 per 15 min → rate limited
- [ ] CV generation: 5 per hour → rate limited
- [ ] **VERIFY:** Rate limit returns 429 with clear message

### 24.5 File Upload Security
**Priority:** HIGH

- [ ] Upload .exe → rejected
- [ ] Upload .php → rejected
- [ ] Upload oversized file → rejected
- [ ] Upload file with double extension (resume.pdf.exe) → rejected
- [ ] **VERIFY:** Files go to Cloudinary (not local disk in production)
- [ ] **VERIFY:** No local file fallback (503 error if Cloudinary fails)

### 24.6 Headers & CORS
**Priority:** MEDIUM

```bash
curl -I http://localhost:3001/api/jobs
```
- [ ] **VERIFY:** Security headers present:
  - X-Content-Type-Options: nosniff
  - X-Frame-Options
  - Strict-Transport-Security (production)
  - Content-Security-Policy
- [ ] **VERIFY:** CORS only allows expected origins

---

## 25. CROSS-BROWSER COMPATIBILITY

### 25.1 Browser Matrix
**Priority:** MEDIUM

| Feature | Chrome | Safari | Firefox | Edge | Mobile Chrome | Mobile Safari |
|---------|--------|--------|---------|------|---------------|---------------|
| Home page | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| Login/Register | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| Job search | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| Job detail | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| Apply to job | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| Profile edit | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| CV generation | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| Employer dashboard | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| Post job | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| Admin dashboard | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |

---

## 26. END-TO-END USER JOURNEYS

> These test complete real-world user flows from start to finish.

### 26.1 Journey: New Job Seeker — Full Cycle
**Time:** 20-30 minutes

1. [ ] Visit `advance.al` for the first time
2. [ ] Browse jobs without an account
3. [ ] Click Apply on a job → prompted to register
4. [ ] Go to `/jobseekers` → register new account
5. [ ] Verify email with code
6. [ ] Complete profile: name, city, bio, skills
7. [ ] Upload PDF resume → auto-parsed
8. [ ] Add 2 work experiences
9. [ ] Add 1 education
10. [ ] Generate AI CV from natural language
11. [ ] Download generated CV
12. [ ] Browse jobs with filters
13. [ ] Save 3 jobs
14. [ ] Apply to 2 jobs (one-click + custom form)
15. [ ] Check My Applications → both shown as Pending
16. [ ] Check notifications → any new notifications
17. [ ] Edit profile → change bio
18. [ ] Withdraw one application
19. [ ] Check Saved Jobs → 3 jobs listed
20. [ ] Change password
21. [ ] Logout and login with new password
22. [ ] **VERIFY:** Everything persisted correctly

---

### 26.2 Journey: New Employer — Full Cycle
**Time:** 20-30 minutes

1. [ ] Visit `/employers`
2. [ ] Register: Company name, contact info, industry, size
3. [ ] Verify email
4. [ ] Land on employer dashboard
5. [ ] Complete company profile (description, logo)
6. [ ] Post first job (all 4 steps, with custom questions)
7. [ ] Post second job (as draft, then publish)
8. [ ] Edit first job (change salary)
9. [ ] Wait for job seekers to apply (or apply as test jobseeker)
10. [ ] View applicants for first job
11. [ ] Review an application → change status to "Viewed"
12. [ ] Shortlist a candidate
13. [ ] Send message to candidate
14. [ ] Download candidate's CV
15. [ ] Try candidate matching (if payment done)
16. [ ] Contact a matched candidate
17. [ ] Close second job
18. [ ] Check dashboard stats → accurate counts
19. [ ] **VERIFY:** All actions reflected correctly

---

### 26.3 Journey: Quick User → Full Registration
**Time:** 10-15 minutes

1. [ ] Visit landing page
2. [ ] Sign up as quick user (name, email, interests, CV upload)
3. [ ] **VERIFY:** Welcome email received with matching jobs
4. [ ] Receive job notification email for a matching new job
5. [ ] Click job link in email → job detail page
6. [ ] Decide to create full account
7. [ ] Register with same email at `/jobseekers`
8. [ ] **VERIFY:** Quick user converted to full user
9. [ ] **VERIFY:** No more quick user notifications (uses full user preferences)
10. [ ] Edit preferences in full profile
11. [ ] Apply to jobs normally

---

### 26.4 Journey: Admin — Full Moderation Cycle
**Time:** 15-20 minutes

1. [ ] Login as admin
2. [ ] Check dashboard stats
3. [ ] View system health
4. [ ] Go to Users → search for a specific user
5. [ ] Manage user (suspend for 7 days with reason)
6. [ ] **VERIFY:** User receives suspension notification
7. [ ] Go to Reports → view pending reports
8. [ ] Review a report → take action (warning)
9. [ ] **VERIFY:** Reported user receives warning email
10. [ ] Go to Jobs → approve a pending job
11. [ ] Send bulk notification to all jobseekers
12. [ ] **VERIFY:** Notification delivered
13. [ ] Check embeddings status
14. [ ] Trigger "Retry Failed" if any failed embeddings
15. [ ] Update a configuration setting
16. [ ] Check configuration audit trail
17. [ ] View business analytics

---

### 26.5 Journey: Report → Escalation → Resolution
**Time:** 10 minutes

1. [ ] Login as User A → Report User B for "Spam Behavior"
2. [ ] Login as User C → Report User B for "Inappropriate Content"
3. [ ] Login as User D → Report User B for "Fake CV"
4. [ ] Login as Admin → check reports
5. [ ] **VERIFY:** Reports auto-escalated to "high" priority (3+ reports)
6. [ ] Review all 3 reports → link them as related
7. [ ] Take action: Temporary suspension (30 days)
8. [ ] **VERIFY:** User B suspended, notification sent
9. [ ] All 3 reports marked as resolved
10. [ ] After 30 days (or manually) → suspension auto-lifts

---

### 26.6 Journey: Job Posted → Notifications → Applications → Hire
**Time:** 15 minutes

1. [ ] Employer posts a new job (e.g., "React Developer in Tiranë")
2. [ ] **VERIFY:** Job embedding generated (within 1 minute)
3. [ ] **VERIFY:** Quick users interested in "Teknologji" near "Tiranë" notified
4. [ ] **VERIFY:** Registered jobseekers with matching profiles notified
5. [ ] Jobseeker A sees notification → views job → applies
6. [ ] Jobseeker B sees email → clicks link → views job → applies
7. [ ] Employer views applications → 2 new
8. [ ] Employer reviews Jobseeker A → marks "Viewed"
9. [ ] Employer shortlists Jobseeker A
10. [ ] Employer rejects Jobseeker B
11. [ ] **VERIFY:** Both jobseekers receive status notifications
12. [ ] Employer hires Jobseeker A
13. [ ] **VERIFY:** Jobseeker A receives "Hired" notification
14. [ ] **VERIFY:** Job's applicationCount is correct
15. [ ] Employer closes the job

---

## 27. PRODUCTION AUDIT FIX VERIFICATION

> Verify all fixes from the production audit are working.

### 27.1 Critical Fixes

- [ ] **A1 — Email Test Mode Block:** Set `EMAIL_TEST_MODE=true` + `NODE_ENV=production` → server crashes on start with clear error
- [ ] **A2 — No Local File Fallback:** Break Cloudinary config → upload returns 503, NOT local file save
- [ ] **A3 — HTTP Compression:** `curl -I -H "Accept-Encoding: gzip" /api/jobs` → shows gzip encoding

### 27.2 Frontend Fixes

- [ ] **B1 — Platform Name:** Employer register page says "advance.al" not "PunaShqip"
- [ ] **B2 — Albanian Diacritics (Unsubscribe):** `/unsubscribe` page has correct ë, ç characters
- [ ] **B3 — Albanian Diacritics (Preferences):** `/preferences` page has correct characters
- [ ] **B4 — JobDetail Null Pointer:** Job with no employer email → clicking email contact doesn't crash
- [ ] **B5 — Profile Dedup:** Adding work experience with null company → no runtime error
- [ ] **B8 — Dead Code Removed:** View source of Index page → no 123-line commented sidebar block
- [ ] **B9 — StairsScene Deleted:** `frontend/src/components/StairsScene.tsx` no longer exists

### 27.3 Performance Fixes

- [ ] **C1 — Job Search Cached:** Same search twice → second is faster (Redis cache)
- [ ] **C2 — Admin Dashboard Cached:** Reload dashboard → faster on second load
- [ ] **C3 — MongoDB Pool:** Check connection pool size (should be 100)
- [ ] **C7 — Bundle Splitting:** Build output shows vendor/mantine/ui chunks
- [ ] **C8 — Verification .unref():** Server shuts down cleanly (no hanging interval)
- [ ] **C9 — Debug Flags Disabled:** In production mode, debug logging doesn't output
- [ ] **C10 — Saved Jobs Count:** Save 3 jobs, delete 1 job, check count → shows 2 (not 3)
- [ ] **C11 — Application Count Floor:** Withdraw application from job with 0 count → count stays 0 (not -1)
- [ ] **C12 — Slug Retry Limit:** 50+ jobs with same title → gets timestamp suffix, no infinite loop
- [ ] **C13 — Notification Semantic Fail:** If embeddings fail → notifications still send (keyword fallback)
- [ ] **C14 — OpenAI Retry:** If OpenAI times out → retries 2x with backoff
- [ ] **C15 — Batch Limit:** Admin recompute-all → limited to 500 jobs per batch

### 27.4 Cleanup Fixes

- [ ] **D2 — .env.example Updated:** New vars documented (DEBUG_*, ENABLE_MOCK_PAYMENTS, LOG_LEVEL)
- [ ] **D3 — SMTP Timeouts:** Email service has connection/socket timeouts
- [ ] **D4 — Location Index:** Performance on location queries
- [ ] **D5 — Emergency Audit Logging:** Emergency actions logged to ConfigurationAudit

---

## 28. ACCESSIBILITY

### 28.1 Keyboard Navigation
**Priority:** LOW

- [ ] Tab through home page → focus visible on each element
- [ ] Tab order logical (top → bottom, left → right)
- [ ] All form inputs reachable via Tab
- [ ] Submit buttons reachable via Tab + Enter
- [ ] Escape closes modals
- [ ] Arrow keys work in dropdowns

### 28.2 Screen Reader Basics
**Priority:** LOW

- [ ] Form inputs have labels (not just placeholders)
- [ ] Images have alt text
- [ ] Buttons have descriptive text
- [ ] Error messages announced

### 28.3 Color Contrast
**Priority:** LOW

- [ ] Text readable on all backgrounds
- [ ] Status badges distinguishable
- [ ] Error messages clearly visible
- [ ] Links distinguishable from text

---

## APPENDIX A: API ENDPOINT TESTING (curl commands)

### Health & Basic
```bash
# Health check
curl http://localhost:3001/health

# Public stats
curl http://localhost:3001/api/stats/public

# Locations
curl http://localhost:3001/api/locations

# Public configuration
curl http://localhost:3001/api/configuration/public
```

### Auth Flow
```bash
# Register (step 1)
curl -X POST http://localhost:3001/api/auth/initiate-registration \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"TestPass1A","userType":"jobseeker","firstName":"Test","lastName":"User"}'

# Login
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"TestPass1A"}'

# Get current user (with token)
curl http://localhost:3001/api/auth/me \
  -H "Authorization: Bearer <token>"

# Refresh token
curl -X POST http://localhost:3001/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"<refresh-token>"}'
```

### Jobs
```bash
# Search jobs
curl "http://localhost:3001/api/jobs?page=1&limit=10&search=developer&city=Tiranë"

# Get single job
curl http://localhost:3001/api/jobs/<jobId>

# Post job (employer token)
curl -X POST http://localhost:3001/api/jobs \
  -H "Authorization: Bearer <employer-token>" \
  -H "Content-Type: application/json" \
  -d '{"title":"Test Job","description":"Test description...","category":"Teknologji","jobType":"full-time","location":{"city":"Tiranë"},"experience":"mid","applicationMethod":"internal","platformCategories":{"diaspora":false,"ngaShtepia":false,"partTime":false,"administrata":false,"sezonale":false}}'
```

### Applications
```bash
# Apply to job
curl -X POST http://localhost:3001/api/applications/apply \
  -H "Authorization: Bearer <jobseeker-token>" \
  -H "Content-Type: application/json" \
  -d '{"jobId":"<jobId>"}'

# My applications
curl http://localhost:3001/api/applications/my-applications \
  -H "Authorization: Bearer <jobseeker-token>"
```

### Admin
```bash
# Dashboard stats
curl http://localhost:3001/api/admin/dashboard-stats \
  -H "Authorization: Bearer <admin-token>"

# Embedding status
curl http://localhost:3001/api/admin/embeddings/status \
  -H "Authorization: Bearer <admin-token>"

# Queue health
curl http://localhost:3001/api/admin/embeddings/queue \
  -H "Authorization: Bearer <admin-token>"

# Workers status
curl http://localhost:3001/api/admin/embeddings/workers \
  -H "Authorization: Bearer <admin-token>"
```

### Notifications
```bash
# Get notifications
curl http://localhost:3001/api/notifications \
  -H "Authorization: Bearer <token>"

# Unread count
curl http://localhost:3001/api/notifications/unread-count \
  -H "Authorization: Bearer <token>"
```

---

## APPENDIX B: DATABASE VERIFICATION QUERIES

Run these in MongoDB shell or Compass to verify data integrity:

```javascript
// Check total counts
db.users.countDocuments({isDeleted: {$ne: true}})
db.jobs.countDocuments({isDeleted: {$ne: true}})
db.applications.countDocuments({withdrawn: {$ne: true}})
db.quickusers.countDocuments({isActive: true})
db.notifications.countDocuments()

// Check embedding coverage
db.jobs.countDocuments({"embedding.status": "completed"})
db.jobs.countDocuments({"embedding.status": "failed"})
db.jobs.countDocuments({"embedding.status": "pending"})
db.users.countDocuments({"profile.jobseeker.embedding.status": "completed", userType: "jobseeker"})
db.quickusers.countDocuments({"embedding.status": "completed"})

// Check for negative applicationCounts (should be 0)
db.jobs.find({applicationCount: {$lt: 0}}).count()

// Check for orphaned applications (job deleted but application active)
db.applications.aggregate([
  {$match: {withdrawn: {$ne: true}}},
  {$lookup: {from: "jobs", localField: "jobId", foreignField: "_id", as: "job"}},
  {$match: {"job.0.isDeleted": true}},
  {$count: "orphaned"}
])

// Check slug uniqueness
db.jobs.aggregate([
  {$group: {_id: "$slug", count: {$sum: 1}}},
  {$match: {count: {$gt: 1}}}
])

// Check for users with expired suspensions (should be auto-lifted)
db.users.find({
  status: "suspended",
  "suspensionDetails.expiresAt": {$lt: new Date()},
  "suspensionDetails.permanent": {$ne: true}
}).count()
```

---

## APPENDIX C: EMBEDDING TESTING SCRIPT

Save and run this script to test the full embedding pipeline:

```bash
#!/bin/bash
# Embedding Pipeline Test Script
# Usage: ./test-embeddings.sh <admin-token> <backend-url>

TOKEN=$1
URL=${2:-http://localhost:3001}

echo "=== EMBEDDING SYSTEM TEST ==="

echo -e "\n1. Checking embedding status..."
curl -s "$URL/api/admin/embeddings/status" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

echo -e "\n2. Checking queue health..."
curl -s "$URL/api/admin/embeddings/queue" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

echo -e "\n3. Checking workers..."
curl -s "$URL/api/admin/embeddings/workers" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

echo -e "\n4. Triggering retry of failed embeddings..."
curl -s -X POST "$URL/api/admin/embeddings/retry-failed" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

echo -e "\n5. Checking eligible users for a job..."
# Get first active job ID
JOB_ID=$(curl -s "$URL/api/jobs?page=1&limit=1" | python3 -c "import sys,json; print(json.load(sys.stdin)['data'][0]['_id'])" 2>/dev/null)
if [ -n "$JOB_ID" ]; then
  echo "Testing with job: $JOB_ID"
  curl -s "$URL/api/notifications/eligible-users/$JOB_ID" \
    -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
else
  echo "No jobs found to test"
fi

echo -e "\n=== TEST COMPLETE ==="
```

---

## SUMMARY STATISTICS

| Category | Test Count |
|----------|-----------|
| Authentication (1.1–1.9) | ~65 |
| Job Seeker Profile (2.1–2.6) | ~45 |
| Job Browsing (3.1–3.8) | ~55 |
| Job Application (4.1–4.8) | ~40 |
| Employer (5.1–5.8) | ~60 |
| Employer Applicants (6.1–6.5) | ~30 |
| Quick User (7.1–7.4) | ~25 |
| Notifications (8.1–8.6) | ~30 |
| CV System (9.1–9.3) | ~30 |
| Admin Dashboard (10.1–10.3) | ~20 |
| Admin Jobs (11.1–11.3) | ~15 |
| Admin Reports (12.1–12.4) | ~25 |
| Admin Bulk Notifications (13.1–13.3) | ~15 |
| Admin Configuration (14.1–14.4) | ~15 |
| Admin Business (15.1–15.5) | ~25 |
| Admin Embeddings (16.1–16.3) | ~15 |
| **Embedding Testing (17.1–17.8)** | **~35** |
| Candidate Matching (18.1–18.3) | ~15 |
| Navigation (19.1–19.3) | ~25 |
| Legal Pages (20.1–20.2) | ~10 |
| Responsive (21.1–21.3) | ~20 |
| Performance (22.1–22.4) | ~15 |
| Error Handling (23.1–23.5) | ~20 |
| Security (24.1–24.6) | ~30 |
| Cross-Browser (25.1) | ~60 |
| E2E Journeys (26.1–26.6) | ~80 |
| Audit Fix Verification (27.1–27.4) | ~30 |
| Accessibility (28.1–28.3) | ~15 |
| **TOTAL** | **~880+** |

---

> **Last Updated:** 2026-04-07
> **Version:** 1.0 — Complete pre-production QA
> **Author:** Claude (Production Audit)
