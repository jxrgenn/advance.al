# advance.al - ULTRA COMPREHENSIVE QA TEST PLAN

**Date:** March 19, 2026
**Tester:** Manual QA
**Environment:** Local dev (frontend: localhost:5173, backend: localhost:3001)
**Browsers:** Chrome (primary), Firefox, Safari, Mobile Chrome/Safari

---

## TABLE OF CONTENTS

1. [Pre-Test Setup](#1-pre-test-setup)
2. [Public Pages (No Login)](#2-public-pages-no-login)
3. [Authentication Flows](#3-authentication-flows)
4. [Jobseeker Flows](#4-jobseeker-flows)
5. [Employer Flows](#5-employer-flows)
6. [Admin Flows](#6-admin-flows)
7. [Cross-Role Interactions](#7-cross-role-interactions)
8. [Email & Notification Testing](#8-email--notification-testing)
9. [Security Testing](#9-security-testing)
10. [Edge Cases & Error Handling](#10-edge-cases--error-handling)
11. [Performance & UX](#11-performance--ux)
12. [Mobile / Responsive](#12-mobile--responsive)

---

## 1. PRE-TEST SETUP

### 1.1 Test Accounts to Create

| Role | Email | Password | Notes |
|------|-------|----------|-------|
| Jobseeker 1 | `js1@test.com` | `TestPass1!` | Primary jobseeker, complete profile |
| Jobseeker 2 | `js2@test.com` | `TestPass1!` | Minimal profile, no CV |
| Employer 1 | `emp1@test.com` | `TestPass1!` | Verified employer, has jobs posted |
| Employer 2 | `emp2@test.com` | `TestPass1!` | Unverified employer (pending) |
| Admin | `admin@advance.al` | (use existing) | Admin account |

### 1.2 Test Data Needed
- [ ] At least 5 active jobs (different categories, cities, types)
- [ ] At least 2 employers (1 verified, 1 pending)
- [ ] At least 3 jobseekers (varying profile completeness)
- [ ] At least 1 submitted report
- [ ] At least 1 application per status (applied, shortlisted, rejected, hired)

### 1.3 Pre-Flight Checks
- [ ] Backend running on port 3001
- [ ] Frontend running on port 5173
- [ ] MongoDB connected (check server logs)
- [ ] Redis connected (check "Redis cache initialized" in logs)
- [ ] Clear browser cache and localStorage before starting

---

## 2. PUBLIC PAGES (NO LOGIN)

### 2.1 Homepage / Jobs Listing (`/` and `/jobs`)

**Page Load:**
- [ ] Page loads without errors
- [ ] Navigation bar shows "Kycu" (Login) button (not logged in)
- [ ] Jobs list loads with real data from API
- [ ] Loading spinner shows while fetching
- [ ] Job count displayed ("U gjeten X pune")
- [ ] Footer renders at bottom

**Search:**
- [ ] Type "Developer" in search → results filter by title/description
- [ ] Type Albanian characters ("Inxhinier") → works correctly
- [ ] Type very long string (200+ chars) → no crash, truncated or handled
- [ ] Clear search → all jobs show again
- [ ] Empty search → shows all jobs
- [ ] Special characters (`<script>`, `'; DROP TABLE`, `$ne`) → no crash, no XSS

**Core Filters (5 Platform Category Buttons):**
- [ ] Click "Diaspora" → only diaspora-flagged jobs show
- [ ] Click "Nga shtepia" → only remote/home jobs show
- [ ] Click "Part Time" → only part-time flagged jobs show
- [ ] Click "Administrata" → only administration jobs show
- [ ] Click "Sezonale" → only seasonal jobs show
- [ ] Click active filter again → deselects, shows all jobs
- [ ] Select multiple filters → AND logic (intersection)
- [ ] Verify filter buttons have visual selected/unselected state

**Advanced Filters:**
- [ ] Click "Filtrat e Avancuar" or expand filters panel
- [ ] **Category dropdown**: Select "Teknologji" → only tech jobs
- [ ] **City dropdown**: Select "Tirane" → only Tirana jobs
- [ ] **Job Type dropdown**: Select "full-time" → only full-time
- [ ] **Salary Range**: Set min 500, max 1500 → jobs in range show
- [ ] **Currency selector**: Switch EUR/ALL → salary values update
- [ ] **Experience level**: Select "Mid" → filters appropriately
- [ ] **Company filter**: Type company name → filters by company
- [ ] **Remote toggle**: Enable → shows remote-friendly jobs
- [ ] **Posted within**: Select "7 days" → only recent jobs
- [ ] **Sort by**: Test "Me te rejat" (newest), "Me te vjetrat" (oldest)
- [ ] **Reset Filters**: Click reset → all filters clear, all jobs show
- [ ] Combine multiple filters → results narrow correctly
- [ ] Filter with zero results → empty state shown ("Nuk u gjeten pune")

**Pagination:**
- [ ] If >12 jobs, pagination buttons appear at bottom
- [ ] Click page 2 → different jobs load
- [ ] Click "Next" → goes to next page
- [ ] Click "Previous" → goes back
- [ ] Page 1: "Previous" disabled or hidden
- [ ] Last page: "Next" disabled or hidden
- [ ] Current page highlighted differently
- [ ] Page scrolls to top on page change

**Job Cards:**
- [ ] Each card shows: title, company name, location, job type badge
- [ ] Salary shows if employer set `showSalary: true`
- [ ] Salary hidden if `showSalary: false`
- [ ] Verified employer shows checkmark badge next to company name
- [ ] Featured/premium jobs have visual indicator (sparkle icon)
- [ ] Click card → navigates to `/jobs/:id`
- [ ] "Save" button shows (heart/bookmark icon)
- [ ] Click Save without login → redirected to login
- [ ] "Apply" button visible
- [ ] Click Apply without login → redirected to login

**Premium Jobs Carousel:**
- [ ] If premium jobs exist, carousel shows above main list
- [ ] Carousel auto-scrolls or has manual arrows
- [ ] Click premium job → navigates to detail

**Recently Viewed Jobs:**
- [ ] First visit: section empty or hidden
- [ ] After viewing 2-3 jobs, return to homepage → recently viewed shows
- [ ] Click recently viewed job → navigates to detail

**Quick User Banner:**
- [ ] Banner shows for non-logged-in users
- [ ] CTA links work (register, browse jobs)

---

### 2.2 Job Detail Page (`/jobs/:id`)

**Setup:** Click any job from the listing page.

**Page Load:**
- [ ] Job title displays prominently
- [ ] Company name + verification badge (if verified)
- [ ] Location with MapPin icon
- [ ] Job type badge (full-time, part-time, etc.)
- [ ] Category badge
- [ ] Salary range displayed (if shown)
- [ ] Posted date / time ago
- [ ] Application deadline (if set)
- [ ] Back button ("Kthehu") works → goes to previous page

**Description Section:**
- [ ] Full description text renders correctly
- [ ] HTML entities not broken (Albanian characters: e, c, etc.)
- [ ] Long descriptions don't break layout

**Requirements Section:**
- [ ] Requirements list renders as bullet points
- [ ] Empty requirements section → section hidden or "Nuk ka kerkesa"

**Benefits Section:**
- [ ] Benefits list renders
- [ ] Empty benefits → section hidden

**Tags/Skills:**
- [ ] Tags displayed as badges
- [ ] Clicking tags does NOT navigate (display only)

**Application Method:**
- [ ] "One-click" method: shows Apply button
- [ ] "Email" method: shows email address
- [ ] "External link" method: shows link to external site

**Apply Button (Not Logged In):**
- [ ] Click "Apliko" → redirected to `/login`
- [ ] After login, return to job page → apply button still works

**Save Button (Not Logged In):**
- [ ] Click bookmark icon → redirected to `/login`

**Similar Jobs:**
- [ ] Similar jobs section shows at bottom
- [ ] If no similar jobs, section hidden
- [ ] Click similar job → navigates to that job's detail

**Contact Employer:**
- [ ] Email button → modal or mailto link
- [ ] Phone button → displayed if employer shares phone
- [ ] WhatsApp button → opens WhatsApp link (if available)
- [ ] All contact info hidden if employer disabled sharing

**Tutorial:**
- [ ] Lightbulb icon visible
- [ ] Click → tutorial overlay starts
- [ ] Tutorial highlights elements step by step
- [ ] Can dismiss tutorial
- [ ] Background scroll locked during tutorial

**Edge Cases:**
- [ ] Visit `/jobs/invalidid` → 404 or error state
- [ ] Visit `/jobs/000000000000000000000000` → "Puna nuk u gjet" error
- [ ] Expired job → shows expired notice
- [ ] Deleted job → 404 or appropriate error

---

### 2.3 Companies Page (`/companies`)

**Page Load:**
- [ ] Page loads with company cards
- [ ] Header "Kompanite Partnere ne advance.al" displays
- [ ] Company count shown ("U gjeten X kompani")

**Search:**
- [ ] Type company name → filters list
- [ ] Type partial name → matches found
- [ ] Clear search → all companies show

**Filters:**
- [ ] City dropdown → populated from available company cities
- [ ] Select city → filters to that city
- [ ] Industry dropdown → populated from company industries
- [ ] Select industry → filters correctly
- [ ] Size dropdown (1-10, 11-50, 51-200, 200+) → filters
- [ ] Combine filters → correct intersection
- [ ] "Te gjitha" (All) option → clears that filter

**Company Cards:**
- [ ] Each card shows: logo (or Building fallback icon), company name, city
- [ ] Click card → navigates to `/company/:id`
- [ ] Hover → visual feedback (shadow, color change)
- [ ] Grid responsive: 1 col mobile, 2 col tablet, 3 col desktop

**Empty State:**
- [ ] Filters that match no companies → "Nuk u gjeten kompani" message

**Fallback Data:**
- [ ] If API fails → mock data shown (6 Albanian companies)

---

### 2.4 Company Profile (`/company/:id`)

**Page Load:**
- [ ] Company logo (or Building icon fallback) displays
- [ ] Company name + verified badge
- [ ] Industry, location, company size info
- [ ] Description/about text

**Contact Section:**
- [ ] Email displayed (if available)
- [ ] Phone displayed (if available)
- [ ] WhatsApp link (if available)
- [ ] Website link (opens in new tab)

**Jobs Section:**
- [ ] "Pozicionet e Lira" (Open Positions) section shows
- [ ] Up to 5 jobs listed with title, category, location, salary
- [ ] "Shiko te gjitha punet" button if >5 jobs → links to filtered jobs
- [ ] Click job → navigates to job detail
- [ ] "Shiko pozicionet e lira" button scrolls to jobs section

**Edge Cases:**
- [ ] Invalid company ID → 404 or error
- [ ] Company with no jobs → "Nuk ka pozicione te lira" message
- [ ] Company with no logo → Building icon shown

---

### 2.5 About Us Page (`/about`)
- [ ] Page loads with platform info
- [ ] Stats section shows numbers (total jobs, companies, etc.)
- [ ] Contact information displayed
- [ ] All links work

### 2.6 Privacy Policy (`/privacy`)
- [ ] Page loads with full privacy policy text
- [ ] All sections render correctly
- [ ] Navigation works from footer link

### 2.7 Terms of Service (`/terms`)
- [ ] Page loads with full terms text
- [ ] All sections render correctly
- [ ] Navigation works from footer link

### 2.8 404 Not Found (`/random-nonexistent-page`)
- [ ] Visit any invalid URL → 404 page shows
- [ ] Navigation still works from 404 page
- [ ] Has link back to homepage

---

## 3. AUTHENTICATION FLOWS

### 3.1 Jobseeker Registration (Full Account)

**Navigate to:** `/jobseekers`

**Step 0 - Personal Info:**
- [ ] First name field → type "Test" → accepted
- [ ] Last name field → type "User" → accepted
- [ ] Email field → type valid email → accepted
- [ ] Password field → type "TestPass1!" → accepted (shows strength)
- [ ] Phone field → optional, type "+355691234567" → accepted
- [ ] City dropdown → select "Tirane" → accepted
- [ ] Click "Next" → proceeds to step 1

**Step 0 Validation:**
- [ ] Empty first name → error "Emri duhet te kete midis 2-50 karaktere"
- [ ] Single char first name ("A") → error (min 2 chars)
- [ ] 51+ char first name → error (max 50)
- [ ] Empty email → error
- [ ] Invalid email ("notanemail") → error
- [ ] Password < 8 chars → error
- [ ] Password without uppercase → error
- [ ] Password without number → error
- [ ] Empty city → error

**Step 1 - Professional:**
- [ ] Job title → optional, type "Software Developer"
- [ ] Skills → add "JavaScript", "React", "Node.js"
- [ ] Bio → optional, type brief description
- [ ] Click "Next" → proceeds to step 2

**Step 2 - CV:**
- [ ] Upload CV button → opens file picker
- [ ] Select PDF file → uploads successfully
- [ ] Select non-PDF file → rejected with error
- [ ] Select >5MB file → rejected with error
- [ ] AI CV generation section visible
- [ ] Type experience description → "Generate" button
- [ ] Language selector (Albanian/English)
- [ ] Click "Register" → account created

**Post-Registration:**
- [ ] Success toast message appears
- [ ] Auto-logged in
- [ ] Redirected to `/profile` or homepage
- [ ] Navigation shows user menu (not "Kycu" button)

**Duplicate Registration:**
- [ ] Try registering with same email → error "Nje perdorues me kete email tashme ekziston"

---

### 3.2 Employer Registration

**Navigate to:** `/employer-register`

**Step 0 - Personal Info:**
- [ ] First name, last name, email, password fields
- [ ] Same validation as jobseeker step 0
- [ ] Click "Next"

**Step 1 - Company Info:**
- [ ] Company name → required, type "Test Company"
- [ ] Company size dropdown → required, select "11-50"
- [ ] City → required, select "Tirane"
- [ ] Click "Next"

**Step 1 Validation:**
- [ ] Empty company name → error
- [ ] Empty company size → error
- [ ] Empty city → error
- [ ] Invalid company size value → error

**Step 2 - Optional Details:**
- [ ] Website → optional, type "https://test.com"
- [ ] Description → optional, type description
- [ ] Industry → optional, select "Teknologji"
- [ ] Click "Register"

**Post-Registration:**
- [ ] Success message about pending verification
- [ ] Auto-logged in
- [ ] Redirected to employer dashboard
- [ ] Dashboard shows "pending verification" notice

**Already Logged In:**
- [ ] If logged in as employer, visiting `/employer-register` → redirects to dashboard

---

### 3.3 Login

**Navigate to:** `/login`

**Happy Path:**
- [ ] Type valid email + password → click "Kycu"
- [ ] Loading spinner shows during auth
- [ ] Success → redirected based on role:
  - Jobseeker → `/` (homepage)
  - Employer → `/employer-dashboard`
  - Admin → `/admin`
- [ ] Navigation updates to show user menu

**Error Cases:**
- [ ] Wrong password → "Email ose fjalekalim i gabuar"
- [ ] Non-existent email → "Email ose fjalekalim i gabuar" (same message, no enumeration)
- [ ] Empty fields → validation error
- [ ] Suspended account → specific suspension message with date
- [ ] Banned account → specific ban message
- [ ] Deleted account → "Kjo llogari eshte caktivizuar"
- [ ] Unverified employer → "Llogaria juaj si punedhenes eshte ne pritje te verifikimit"

**Login While Logged In:**
- [ ] Visit `/login` while authenticated → redirected to dashboard

**Registration Link:**
- [ ] "Nuk ke llogari?" links → navigate to registration pages
- [ ] "Ke harruar fjalekalimin?" → navigates to `/forgot-password`

---

### 3.4 Forgot Password

**Navigate to:** `/forgot-password`

- [ ] Type registered email → click "Dergo Linkun e Rivendosjes"
- [ ] Always shows success message (no email enumeration)
- [ ] Check email → reset link received at advance.al123456@gmail.com
- [ ] Type non-existent email → SAME success message (security)
- [ ] Empty email → validation error
- [ ] Invalid email format → validation error

---

### 3.5 Reset Password (`/reset-password?token=...`)

**From Email Link:**
- [ ] Click reset link in email → page loads with form
- [ ] Type new password (8+ chars, uppercase, number)
- [ ] Type confirm password (matching)
- [ ] Click "Rivendos Fjalekalimin"
- [ ] Success → redirected to `/login`
- [ ] Login with new password → works

**Validation:**
- [ ] Passwords don't match → error
- [ ] Password too short → error
- [ ] Password without uppercase → error
- [ ] Password without number → error

**Edge Cases:**
- [ ] Visit page without token → error state
- [ ] Use expired token (>1 hour) → "Token-i i rivendosjes eshte i pavlefshem ose ka skaduar"
- [ ] Reuse same token → error (already consumed)

---

### 3.6 Logout

- [ ] Click user menu → "Dilni" (Logout)
- [ ] LocalStorage cleared (token, refreshToken, user)
- [ ] Redirected to homepage
- [ ] Navigation shows "Kycu" button
- [ ] Visiting protected page → redirected to login

---

### 3.7 Token Refresh

- [ ] Login → wait 15+ minutes (or manually expire token in localStorage)
- [ ] Make API call → should auto-refresh token silently
- [ ] No visible logout/redirect
- [ ] If refresh token also expired (>7 days) → logged out with redirect to login

---

### 3.8 Change Password (Authenticated)

**Navigate to:** `/profile` → "Cilesimet" (Settings) tab → scroll to "Ndrysho Fjalekalimin"

- [ ] Type current password, new password, confirm password
- [ ] Click "Ndrysho Fjalekalimin"
- [ ] Success toast → "Fjalekalimi u ndryshua me sukses"
- [ ] Logout and login with new password → works
- [ ] Login with old password → fails

**Validation:**
- [ ] Empty fields → "Plotesoni te gjitha fushat"
- [ ] Wrong current password → "Fjalekalimi aktual nuk eshte i sakte"
- [ ] New password < 8 chars → error
- [ ] New password without uppercase → error
- [ ] New password without number → error
- [ ] New password without special char → error
- [ ] New = current password → "Fjalekalimi i ri duhet te jete i ndryshm"
- [ ] New != confirm → "Fjalekalimet nuk perputhen"

---

## 4. JOBSEEKER FLOWS

**Login as:** Jobseeker account (js1@test.com)

### 4.1 Profile - Personal Tab (`/profile`)

- [ ] Tab "Personal" selected by default (or click it)
- [ ] First name pre-filled → editable
- [ ] Last name pre-filled → editable
- [ ] Email shown (read-only)
- [ ] Phone field → editable, format +355XXXXXXXX
- [ ] City → editable dropdown
- [ ] Region → auto-populated from city
- [ ] Click "Ruaj" (Save) → success toast
- [ ] Refresh page → saved values persist

**Validation:**
- [ ] Clear first name → error on save
- [ ] Clear last name → error on save
- [ ] Invalid phone format → error
- [ ] Save with all valid → success

---

### 4.2 Profile - Professional Tab

- [ ] Click "Profesionale" tab
- [ ] Job title field → type/edit with character counter (max 100)
- [ ] Bio/summary → textarea with character counter (max 500)
- [ ] Skills input → add comma-separated skills
- [ ] Max 10 skills → after 10, can't add more
- [ ] Remove skill → click X on skill tag
- [ ] Desired job type → select from dropdown
- [ ] Availability → dropdown (Menjehere, 2 jave, 1 muaj, 3 muaj)
- [ ] Click "Ruaj" → success toast

**CV Upload:**
- [ ] "Ngarko CV" button visible
- [ ] Click → file picker opens
- [ ] Select PDF → uploads, shows filename
- [ ] Select non-PDF → error "Vetem skedaret PDF jane te lejuar"
- [ ] Select >5MB PDF → error
- [ ] After upload, "Fshi CV" button appears
- [ ] Click "Fshi CV" → CV removed, upload button returns
- [ ] Replace CV → upload new file → replaces old

**AI CV Generation:**
- [ ] CV generator section visible
- [ ] Type experience description (50+ chars)
- [ ] Select language (Shqip/English)
- [ ] Click "Gjenero CV"
- [ ] Loading state while generating
- [ ] Generated CV appears for preview
- [ ] Download button → downloads .docx file

---

### 4.3 Profile - Experience Tab

- [ ] Click "Pervoja" tab
- [ ] If no work history → "Nuk keni pervoje pune" message + "Shto Pervoje" button

**Add Work Experience:**
- [ ] Click "Shto Pervoje Pune"
- [ ] Modal opens with form
- [ ] Position → required, type "Software Developer"
- [ ] Company → required, type "Tech Corp"
- [ ] Location → optional, type "Tirane"
- [ ] Start date → required, pick date
- [ ] End date → required (unless current job)
- [ ] "Puna aktuale" (Current job) toggle → hides end date
- [ ] Description → optional textarea
- [ ] Achievements → optional textarea
- [ ] Click "Ruaj" → entry appears in list
- [ ] Click "Anulo" → modal closes, no changes

**Edit Work Experience:**
- [ ] Click edit icon on existing entry
- [ ] Modal opens pre-filled
- [ ] Change company name → click "Ruaj"
- [ ] Entry updates in list

**Delete Work Experience:**
- [ ] Click delete icon on entry
- [ ] Confirmation prompt appears
- [ ] Confirm → entry removed
- [ ] Cancel → entry stays

**Validation:**
- [ ] Empty position → error
- [ ] Empty company → error
- [ ] End date before start date → error
- [ ] Very long text (>500 chars) → handled

---

### 4.4 Profile - Education Tab

- [ ] Click "Arsimi" tab
- [ ] Same pattern as Experience tab

**Add Education:**
- [ ] Click "Shto Arsim"
- [ ] Modal with: Degree (required), Field of Study (required), Institution (required)
- [ ] Location → optional
- [ ] Start date → required
- [ ] End date → conditional (unless "Duke studiuar aktualisht")
- [ ] GPA → optional numeric
- [ ] Description → optional
- [ ] Save → entry appears

**Edit/Delete:** Same as work experience testing.

---

### 4.5 Profile - Applications Tab

- [ ] Click "Aplikimet" tab
- [ ] If no applications → "Nuk keni aplikime" message
- [ ] If applications exist → timeline view
- [ ] Each application shows:
  - Job title (clickable → goes to job detail)
  - Company name
  - Date applied
  - Status badge with color (applied=blue, shortlisted=green, rejected=red, hired=gold)
- [ ] Status timeline visualization shows progression
- [ ] Withdraw button visible (for pending/viewed applications)
- [ ] Click withdraw → confirmation → application withdrawn

---

### 4.6 Profile - Settings Tab

**Salary Preferences:**
- [ ] "Trego preferencen e pages" toggle
- [ ] When on: min/max salary inputs appear
- [ ] Type salary min: 500, max: 1500
- [ ] Currency selector: EUR, ALL, USD
- [ ] Save → preferences stored

**Privacy Settings:**
- [ ] "Profili publik" toggle (profile visibility)
- [ ] "Shfaq ne rezultate kerkimi" toggle (show in search)
- [ ] Toggle each → save → refresh → persists

**Notifications:**
- [ ] "Njoftime per pune" toggle (job alerts)
- [ ] "Open to remote" toggle
- [ ] Save → persists

**Delete Account:**
- [ ] Scroll to "Fshi Llogarinë" section (red zone)
- [ ] Warning text visible about irreversible action
- [ ] Password input required for confirmation
- [ ] Click "Fshi Llogarinë" → confirmation dialog
- [ ] Wrong password → error
- [ ] Correct password + confirm → account deleted, logged out
- [ ] Try to login → "Kjo llogari eshte caktivizuar"

---

### 4.7 Job Search & Application Flow

**From Homepage:**
1. [ ] Browse jobs → find interesting job
2. [ ] Click job card → job detail page
3. [ ] Read description, requirements, benefits
4. [ ] Click "Apliko" (Apply)

**Quick Apply Modal:**
- [ ] Modal opens showing job title + company
- [ ] Profile completeness % shown
- [ ] If < 60%: warning message about incomplete profile
- [ ] Cover letter toggle → enable
- [ ] Cover letter textarea → type message (optional)
- [ ] Custom questions (if job has them):
  - [ ] Each question displays with label
  - [ ] Required questions marked with *
  - [ ] Answer fields match question type (text/textarea/select)
- [ ] Click "Dergo Aplikimin" (Submit)
- [ ] Success toast → "Aplikimi u dergua me sukses"
- [ ] Modal closes
- [ ] Apply button changes to "Aplikuar" (disabled)

**Application Validation:**
- [ ] Required custom question empty → error shown
- [ ] Submit without cover letter (when toggle off) → OK
- [ ] Double-click submit → only 1 application created (no duplicate)
- [ ] Apply to same job again → "Keni aplikuar tashme per kete pune"

**Email Not Verified Gate:**
- [ ] If email not verified → error "Duhet te verifikoni emailin"
- [ ] Cannot apply until verified

---

### 4.8 Save/Unsave Jobs

**From Job Listing:**
- [ ] Click bookmark icon on job card → job saved
- [ ] Icon fills/changes color
- [ ] Click again → job unsaved
- [ ] Toast confirms action

**From Job Detail:**
- [ ] Click bookmark icon → saves
- [ ] Click again → unsaves

**Saved Jobs Page (`/saved-jobs`):**
- [ ] Navigate via user menu or direct URL
- [ ] All saved jobs listed
- [ ] Each job has unsave button
- [ ] Click unsave → job removed from list
- [ ] Empty state if no saved jobs: "Nuk keni pune te ruajtura" + "Shfleto Punet" link
- [ ] Pagination works if >10 saved jobs
- [ ] Apply button on saved job cards → opens apply modal

---

### 4.9 Email Verification

**From Profile:**
- [ ] If email not verified, banner/notice shown
- [ ] "Verifiko Email" button visible
- [ ] Click → verification code sent to email
- [ ] Check email at advance.al123456@gmail.com → 6-digit code
- [ ] Enter code → "Email-i juaj u verifikua me sukses!"
- [ ] Banner disappears
- [ ] Can now apply to jobs

**Verification Errors:**
- [ ] Wrong code → "Kodi i verifikimit eshte i gabuar"
- [ ] Expired code (>10 min) → "Kodi i verifikimit ka skaduar. Kerkoni nje kod te ri."
- [ ] Already verified → "Email-i juaj eshte tashme i verifikuar"
- [ ] Request new code within 1 min → rate limited

---

## 5. EMPLOYER FLOWS

**Login as:** Verified employer account (emp1@test.com)

### 5.1 Employer Dashboard - Jobs Tab (`/employer-dashboard`)

**Dashboard Stats:**
- [ ] Active jobs count card
- [ ] Total applicants count card
- [ ] Monthly views card
- [ ] Growth percentage shown

**Job List:**
- [ ] All employer's jobs listed
- [ ] Status filter tabs: Te Gjitha / Aktive / Mbyllura / Skaduar
- [ ] Click "Aktive" → only active jobs shown
- [ ] Click "Mbyllura" → only closed jobs
- [ ] Search by job title → filters list
- [ ] Each job card shows: title, location, applicant count, posted date, status badge

**Job Actions:**
- [ ] Click "Shiko" (View) → navigates to `/jobs/:id`
- [ ] Click "Ndrysho" (Edit) → navigates to `/edit-job/:id`
- [ ] Click "Fshi" (Delete) → confirmation dialog
  - [ ] Confirm → job deleted (soft delete)
  - [ ] Cancel → nothing happens
- [ ] Three-dot menu (if present) → additional options

**Post New Job:**
- [ ] Click "Posto Pune te Re" button → navigates to `/post-job`

**Pagination:**
- [ ] If >5 jobs → "Load More" or pagination shows
- [ ] Click → more jobs load

---

### 5.2 Post Job (`/post-job`)

**Step 0 - Basic Info:**
- [ ] Job title → required, character counter (max 100)
- [ ] Description → required, character counter (max 5000)
- [ ] Category dropdown → 14 options (Teknologji, Marketing, etc.)
- [ ] Job type dropdown → full-time, part-time, contract, internship
- [ ] Experience level dropdown → Junior, Mid, Senior, Lead
- [ ] Click "Next"

**Step 0 Validation:**
- [ ] Empty title → error
- [ ] Title < 5 chars → error
- [ ] Title > 100 chars → error
- [ ] Empty description → error
- [ ] Description < 50 chars → error
- [ ] Description > 5000 chars → error
- [ ] No category selected → error
- [ ] No job type selected → error

**Step 1 - Location:**
- [ ] City dropdown → populated from API
- [ ] Select city → region auto-fills
- [ ] Click "Next"

**Step 1 Validation:**
- [ ] Empty city → error

**Step 2 - Salary:**
- [ ] Salary min input → optional, numeric
- [ ] Salary max input → optional, numeric
- [ ] Currency selector → EUR (default), ALL, USD
- [ ] "Trego pagen kandidateve" toggle → show/hide salary on listing
- [ ] Click "Next"

**Step 2 Validation:**
- [ ] Negative salary → error
- [ ] Min > Max → error (if both provided)
- [ ] Non-numeric → error or ignored

**Step 3 - Requirements & Benefits:**
- [ ] Requirements list → add at least 1
  - [ ] Type requirement → click "+" or Enter → added to list
  - [ ] Click "X" → removes requirement
  - [ ] At least 1 required to proceed
- [ ] Benefits list → optional
  - [ ] Same add/remove pattern
- [ ] Tags/Skills list → optional
- [ ] Custom Questions → optional
  - [ ] Click "Shto Pyetje" → question form appears
  - [ ] Type question text
  - [ ] Select type (text, textarea, multiple choice)
  - [ ] Toggle "Required?"
  - [ ] Add multiple questions
  - [ ] Delete question
- [ ] Application method dropdown:
  - [ ] "One-click" (default) → internal apply
  - [ ] "Email" → specify email field appears
  - [ ] "External Link" → URL field appears
- [ ] Platform categories checkboxes:
  - [ ] Diaspora, Nga shtepia, Part Time, Administrata, Sezonale
  - [ ] All default false
- [ ] Click "Posto Punen" (Submit)

**Post-Submit:**
- [ ] Success toast → "Puna u postua me sukses"
- [ ] Redirected to employer dashboard
- [ ] New job appears in job list

**Tutorial:**
- [ ] Lightbulb button → tutorial starts
- [ ] Steps highlight each form section
- [ ] Can dismiss at any time

---

### 5.3 Edit Job (`/edit-job/:id`)

- [ ] Navigate from employer dashboard → click "Ndrysho" on a job
- [ ] Form loads pre-filled with job data
- [ ] All fields editable
- [ ] Change title → save → title updated
- [ ] Change description → save → description updated
- [ ] Change category → save
- [ ] Change location → save
- [ ] Add/remove requirements → save
- [ ] Back button → returns to dashboard without saving
- [ ] Validation same as Post Job

**Edge Cases:**
- [ ] Edit job not owned by this employer → 403 error
- [ ] Edit deleted job → error
- [ ] Edit expired job → can edit and re-activate

---

### 5.4 Employer Dashboard - Applicants Tab

- [ ] Click "Kandidatet" (Applicants) tab
- [ ] All applications across all jobs listed

**Filters:**
- [ ] Status filter: Te Gjitha / Aplikuar / Selektuar / Refuzuar / Punesuar
- [ ] Search by candidate name or email
- [ ] Filter works correctly

**Application Cards:**
- [ ] Each shows: candidate name, job applied for, date, status badge
- [ ] Candidate avatar/initials
- [ ] Email shown
- [ ] Phone shown (if available)

**View Application Detail:**
- [ ] Click application → detail view opens
- [ ] Shows:
  - Candidate full profile
  - Cover letter (if submitted)
  - Custom question answers
  - CV download button
  - Application timeline
  - Status history

**Download CV:**
- [ ] Click "Shkarko CV" → PDF downloads
- [ ] If no CV → button disabled or hidden

**Change Status:**
- [ ] Status dropdown → select new status
- [ ] Valid transitions:
  - applied → viewed, shortlisted, rejected
  - viewed → shortlisted, rejected
  - shortlisted → hired, rejected
  - rejected → (no further changes)
  - hired → (no further changes)
- [ ] Select "Selektuar" (Shortlisted) → confirm → status updates
- [ ] Select "Refuzuar" (Rejected) → confirm → status updates
- [ ] Select "Punesuar" (Hired) → confirm → status updates
- [ ] Invalid transition → error

**Contact Candidate:**
- [ ] Email button → opens contact modal with email
- [ ] Phone button → shows phone number
- [ ] WhatsApp button → opens WhatsApp link
- [ ] Message textarea → type message → send
- [ ] Message sent via API

**Report Candidate:**
- [ ] "Raporto" button → opens report modal
- [ ] Select reason → type notes → submit
- [ ] Success toast
- [ ] Rate limited (1 report per user per 24h)

---

### 5.5 Employer Dashboard - Settings Tab

**Company Profile:**
- [ ] Company name → editable
- [ ] Description → textarea with character counter
- [ ] Website → URL input
- [ ] Industry → dropdown
- [ ] Company size → dropdown
- [ ] City/Region → location fields
- [ ] Click "Ruaj" → success toast

**Contact Preferences:**
- [ ] Phone input → editable
- [ ] WhatsApp number → editable
- [ ] "Enable phone contact" toggle
- [ ] "Enable WhatsApp contact" toggle
- [ ] "Enable email contact" toggle
- [ ] Save → persists

**Logo Upload:**
- [ ] Click upload area → file picker
- [ ] Select JPEG/PNG/WebP → uploads
- [ ] Logo preview shows
- [ ] Replace logo → new file overwrites
- [ ] Non-image file → rejected
- [ ] >2MB → rejected
- [ ] SVG → rejected (security)

---

### 5.6 Candidate Matching (if available)

- [ ] Select job → "Shiko Kandidate te Pershtatshm" (View Matching Candidates)
- [ ] If access purchased → shows ranked candidate list
- [ ] Match score % displayed
- [ ] Skills match indicators
- [ ] Contact buttons for each candidate
- [ ] If no access → "Blej Akses" (Purchase Access) button
- [ ] Purchase flow (mock payment)
- [ ] After purchase → candidates visible

---

### 5.7 Unverified Employer Experience

**Login as:** Unverified employer (emp2@test.com)

- [ ] Dashboard loads but with verification notice
- [ ] Try posting job → 403 "Llogaria juaj si punedhenes duhet te verifikohet"
- [ ] Can still view dashboard settings
- [ ] Can edit company profile
- [ ] Cannot access applicants (no jobs exist)

---

## 6. ADMIN FLOWS

**Login as:** Admin (admin@advance.al)

### 6.1 Admin Dashboard - Overview (`/admin`)

**Statistics Cards:**
- [ ] Total Users count → verify against DB
- [ ] Total Employers count
- [ ] Total Jobseekers count
- [ ] Total Jobs count
- [ ] Active Jobs count
- [ ] Total Applications count
- [ ] Pending Employers count
- [ ] Verified Employers count
- [ ] Quick Users count
- [ ] Total Revenue
- [ ] Monthly growth percentages

**Charts:**
- [ ] Top categories bar chart → renders
- [ ] Top cities bar chart → renders
- [ ] Hover over chart elements → tooltips

**Recent Activity:**
- [ ] Activity log shows recent events
- [ ] Types: job_posted, user_registered, application_submitted
- [ ] Each has timestamp and description

---

### 6.2 Admin Dashboard - Employer Verification (Moderation Tab)

- [ ] List of pending employers loads
- [ ] Each shows: company name, email, phone, registration date

**Approve Employer:**
- [ ] Click "Aprovo" → confirmation
- [ ] Confirm → employer status changes to active
- [ ] Employer removed from pending list
- [ ] Employer can now login and post jobs
- [ ] Email notification sent to employer (check advance.al123456@gmail.com)

**Reject Employer:**
- [ ] Click "Refuzo" → confirmation
- [ ] Confirm → employer status changes to rejected
- [ ] Employer removed from pending list
- [ ] Employer cannot login (shows rejection message)

---

### 6.3 Admin Dashboard - Configuration Tab

- [ ] System settings list loads
- [ ] Each setting shows: name, current value, type

**Edit Setting:**
- [ ] Click setting → input field appears
- [ ] Change value → click "Ruaj"
- [ ] Optional reason textarea
- [ ] Success → value updated
- [ ] Refresh → new value persists

**Reset Setting:**
- [ ] Click "Rivendos" (Reset to default)
- [ ] Requires reason
- [ ] Confirm → value reset to default

**Settings Available:**
- [ ] `maintenance_mode` (boolean) → test toggle
- [ ] `require_job_approval` (boolean)
- [ ] `max_cv_file_size` (number)
- [ ] Other settings...

---

### 6.4 Admin Reports (`/admin/reports`)

**Navigate to:** `/admin/reports` (or from admin nav)

**Report List:**
- [ ] Reports load with pagination
- [ ] Each report shows: reported user, category badge, priority badge, status badge, date

**Filters:**
- [ ] Status: Pending / Under Review / Resolved / Dismissed
- [ ] Priority: Low / Medium / High / Critical
- [ ] Category: 9 options
- [ ] Search by description
- [ ] Combine filters → correct results
- [ ] Pagination → navigate pages

**Statistics Panel:**
- [ ] Total reports count
- [ ] Status breakdown
- [ ] Priority breakdown
- [ ] Resolution rate percentage

**View Report Detail:**
- [ ] Click report → detail view opens
- [ ] Reported user info (name, email, type, status)
- [ ] Report info (category, description, evidence)
- [ ] Reporter info
- [ ] Action history timeline
- [ ] Related reports (pattern detection)
- [ ] Violation count for reported user

**Take Action on Report:**
- [ ] Select action from dropdown:
  - [ ] "No Action" → resolves without penalty
  - [ ] "Warning" → sends warning to user
  - [ ] "Temporary Suspension" → duration selector appears (1-365 days)
  - [ ] "Permanent Suspension" → permanent ban
  - [ ] "Account Termination" → hard disable
- [ ] Type reason
- [ ] "Notify user?" toggle
- [ ] Click submit → action taken
- [ ] Report status changes to "resolved"
- [ ] Action appears in history

**Suspend User via Report:**
- [ ] Take "Temporary Suspension" action with 7 days
- [ ] User account status changes to "suspended"
- [ ] User tries to login → sees suspension message with end date
- [ ] After 7 days → suspension auto-lifts (tested via cron)

**Reopen Report:**
- [ ] Find resolved report
- [ ] Click "Rihap" (Reopen)
- [ ] Type reason
- [ ] Confirm → status changes back to "under_review"

**Dismiss Report:**
- [ ] Click "Largo" (Dismiss) on pending report
- [ ] Status changes to "dismissed"

**Assign Report:**
- [ ] Assign to admin (dropdown)
- [ ] Assigned admin name appears on report

---

### 6.5 Admin - User Management (if available in admin dashboard)

- [ ] View all users list
- [ ] Search by name/email
- [ ] Filter by type (jobseeker/employer)
- [ ] View user detail
- [ ] Suspend/ban user directly
- [ ] Delete user

---

## 7. CROSS-ROLE INTERACTIONS

### 7.1 Full Application Lifecycle

1. **Employer** posts job → appears in listings
2. **Jobseeker** finds job → applies
3. **Employer** sees new application in dashboard
4. **Employer** reviews application → changes to "Viewed"
5. **Employer** likes candidate → changes to "Shortlisted"
6. **Employer** sends message to candidate
7. **Jobseeker** receives notification + email
8. **Employer** hires candidate → changes to "Hired"
9. **Jobseeker** sees "Hired" status in applications tab
10. Verify every step produces correct notifications and emails

### 7.2 Report & Moderation Flow

1. **Jobseeker** reports an employer (fake job posting)
2. **Admin** sees report in admin reports page
3. **Admin** reviews, assigns to self
4. **Admin** takes action (warning)
5. **Employer** receives warning notification/email
6. Verify notification appears in employer's notification bell
7. Verify email sent

### 7.3 Employer Verification Flow

1. New **Employer** registers → pending status
2. **Admin** sees in moderation queue
3. **Admin** approves
4. **Employer** can now login and post jobs
5. **Employer** posts job → job visible to jobseekers
6. **Jobseeker** can apply

### 7.4 Job Expiry Flow

1. **Employer** posts job with 30-day expiry
2. After expiry → job status changes to "expired" (cron job)
3. **Jobseeker** can no longer apply to expired job
4. **Employer** can renew expired job via API

---

## 8. EMAIL & NOTIFICATION TESTING

**All emails go to:** advance.al123456@gmail.com (EMAIL_TEST_MODE=true)

### 8.1 Emails to Verify

| # | Email Type | Trigger | Check |
|---|-----------|---------|-------|
| 1 | Jobseeker Welcome | Register as jobseeker | Welcome message, profile link |
| 2 | Employer Welcome | Register as employer | Welcome, pending verification notice |
| 3 | Password Reset | Click "Forgot Password" | Reset link, expires in 1 hour |
| 4 | Email Verification Code | Click "Verify Email" | 6-digit code, 10-min expiry |
| 5 | New Application | Jobseeker applies to job | Employer notified, candidate name, job title |
| 6 | Application Status: Shortlisted | Employer shortlists candidate | "Ju jeni selektuar" message |
| 7 | Application Status: Rejected | Employer rejects candidate | "Fatkeqesisht" message |
| 8 | Application Status: Hired | Employer marks hired | Congratulations message |
| 9 | Employer Approved | Admin approves employer | "Llogaria u verifikua" message |
| 10 | Account Warning | Admin warns user | Warning details, appeal info |
| 11 | Account Suspension | Admin suspends user | Suspension duration, reason |
| 12 | Application Message | Employer messages candidate | Message text, reply link |
| 13 | Bulk Notification | Admin sends broadcast | Title, message, type |

**For each email verify:**
- [ ] Email arrives
- [ ] Subject line correct
- [ ] Albanian text correct
- [ ] No broken HTML
- [ ] Links work (reset link, profile link, etc.)
- [ ] advance.al branding present
- [ ] No raw HTML tags visible
- [ ] No leaked user data beyond what's needed

### 8.2 In-App Notifications

**Notification Bell (all roles):**
- [ ] Bell icon in navigation bar
- [ ] Unread count badge shows (red dot with number)
- [ ] Click bell → dropdown with notification list
- [ ] Each notification has: icon, title, description, time
- [ ] Unread notifications highlighted differently
- [ ] Click notification → marks as read
- [ ] "Mark all read" button → clears all unread
- [ ] Polling: notifications update every 60 seconds

**Notification Types to Verify:**
- [ ] New application notification (for employer)
- [ ] Application status change (for jobseeker)
- [ ] Message received (for both)
- [ ] Job match notification (for jobseeker with alerts on)
- [ ] Report action notification (for reported user)
- [ ] Welcome notification (for quick users)

---

## 9. SECURITY TESTING

### 9.1 Authentication Security

- [ ] Access `/profile` without login → redirected to `/login`
- [ ] Access `/employer-dashboard` without login → redirected
- [ ] Access `/admin` without login → redirected
- [ ] Access `/admin` as jobseeker → forbidden/redirected
- [ ] Access `/employer-dashboard` as jobseeker → forbidden/redirected
- [ ] Access `/profile` as employer → forbidden/redirected
- [ ] Access `/post-job` as jobseeker → forbidden/redirected
- [ ] Tamper with JWT token in localStorage → API calls fail with 401
- [ ] Delete token from localStorage → logged out state

### 9.2 XSS Prevention

Test these in EVERY text field:
```
<script>alert('XSS')</script>
<img src=x onerror=alert(1)>
<b onmouseover=alert('XSS')>hover me</b>
javascript:alert(1)
<svg onload=alert(1)>
```

**Fields to test:**
- [ ] Registration: first name, last name, city
- [ ] Profile: title, bio, skills, work experience fields
- [ ] Job posting: title, description, requirements, benefits, tags
- [ ] Report: description/notes
- [ ] Employer profile: company name, description
- [ ] Search input on jobs page
- [ ] Search input on companies page

**Expected:** HTML tags stripped/escaped, no script execution, stored safely.

### 9.3 NoSQL Injection

Test these payloads in login/search fields:
```
{"$ne": ""}
{"$gt": ""}
admin@advance.al' || '1'='1
```

**Expected:** Treated as literal strings, not MongoDB operators.

### 9.4 Authorization

- [ ] Jobseeker tries to delete another user's job → 403
- [ ] Employer tries to view other employer's applicants → 403
- [ ] Non-admin tries admin endpoints → 403
- [ ] Employer edits job they don't own → 403
- [ ] Jobseeker changes other user's application status → 403

### 9.5 Rate Limiting

- [ ] Login: try 16+ attempts in 15 minutes → rate limited message
- [ ] Registration: try 16+ attempts → rate limited
- [ ] Report submission: 6+ reports in 15 min → rate limited
- [ ] Forgot password: 16+ requests → rate limited

### 9.6 File Upload Security

- [ ] Upload `.exe` as CV → rejected
- [ ] Upload `.js` as CV → rejected
- [ ] Upload `.svg` as image → rejected
- [ ] Upload file with spoofed MIME type (rename .exe to .pdf) → rejected (magic bytes check)
- [ ] Upload >5MB CV → rejected
- [ ] Upload >2MB image → rejected

---

## 10. EDGE CASES & ERROR HANDLING

### 10.1 Network Errors

- [ ] Disconnect internet → API calls show error toast, not crash
- [ ] Slow connection → loading states display correctly
- [ ] Server down → appropriate error message

### 10.2 Concurrent Actions

- [ ] Double-click "Apply" → only 1 application created
- [ ] Double-click "Save" → only 1 save action
- [ ] Two tabs: apply to same job → second tab gets "already applied"
- [ ] Two tabs: one logs out → other tab detects and redirects

### 10.3 Data Integrity

- [ ] Delete job that has applications → applications reference preserved
- [ ] Delete account → personal data removed, applications anonymized
- [ ] Edit job after someone applied → application references original
- [ ] Rapid status changes on application → correct final state

### 10.4 Invalid URLs

- [ ] `/jobs/not-a-real-id` → error state (not crash)
- [ ] `/jobs/000000000000000000000000` → "Puna nuk u gjet"
- [ ] `/company/not-a-real-id` → error state
- [ ] `/edit-job/nonexistent` → error state
- [ ] `/reset-password` (no token) → error state

### 10.5 Empty States

- [ ] No jobs in system → empty state on homepage
- [ ] No companies → empty state on companies page
- [ ] No applications → empty state on profile applications tab
- [ ] No saved jobs → empty state on saved jobs page
- [ ] No notifications → empty state in notification dropdown
- [ ] No work experience → empty state with "Add" button
- [ ] No education → empty state with "Add" button
- [ ] Search with no results → "Nuk u gjeten rezultate" message

### 10.6 Boundary Values

- [ ] First name: exactly 2 chars → accepted
- [ ] First name: exactly 50 chars → accepted
- [ ] Job title: exactly 5 chars → accepted
- [ ] Job title: exactly 100 chars → accepted
- [ ] Job description: exactly 50 chars → accepted
- [ ] Job description: exactly 5000 chars → accepted
- [ ] Salary: 0 → accepted or rejected (check)
- [ ] Salary: 999999 → accepted
- [ ] Skills: exactly 10 → accepted
- [ ] Skills: 11 → rejected
- [ ] Requirements: exactly 1 → accepted

### 10.7 Unicode & Special Characters

- [ ] Albanian characters: e, c, gj, nj, th, dh, zh, xh, rr, ll → display correctly everywhere
- [ ] Emojis in bio/description → handled (displayed or stripped)
- [ ] Arabic/Chinese characters → no crash
- [ ] Very long words (no spaces) → layout doesn't break

---

## 11. PERFORMANCE & UX

### 11.1 Loading States

- [ ] Homepage: spinner while jobs load
- [ ] Job detail: spinner while loading
- [ ] Profile: spinner on initial load
- [ ] Employer dashboard: spinner for each tab
- [ ] Companies page: spinner while loading
- [ ] Form submissions: button shows loading state (disabled + spinner)

### 11.2 Page Transitions

- [ ] Route changes are smooth (no white flash)
- [ ] Scroll to top on page change
- [ ] Back button works correctly (browser history)
- [ ] Refresh preserves current page (not redirected)

### 11.3 Toast Notifications

- [ ] Success toasts → green/positive color
- [ ] Error toasts → red/negative color
- [ ] Toasts auto-dismiss after ~5 seconds
- [ ] Multiple toasts stack (don't overlap)

### 11.4 Form UX

- [ ] Character counters update in real-time
- [ ] Password visibility toggle (eye icon) works
- [ ] Dropdown filters responsive to selection
- [ ] Search inputs have debounce (no request per keystroke)
- [ ] Tab key navigates form fields
- [ ] Enter key submits forms
- [ ] Form state preserved on back navigation (where applicable)

### 11.5 Code Splitting

- [ ] Only current page's JS loaded initially
- [ ] Other pages load on-demand (check Network tab)
- [ ] Loading fallback (spinner) shows during lazy load

---

## 12. MOBILE / RESPONSIVE TESTING

Test at these widths: **375px** (iPhone SE), **390px** (iPhone 14), **768px** (iPad), **1024px** (laptop), **1440px** (desktop)

### 12.1 Navigation

- [ ] Mobile (<768px): hamburger menu icon
- [ ] Click hamburger → mobile menu slides open
- [ ] All links present in mobile menu
- [ ] User menu accessible on mobile
- [ ] Notification bell visible on mobile
- [ ] Menu closes on link click
- [ ] Menu closes on outside click

### 12.2 Homepage

- [ ] Job cards: 1 column on mobile, 2 on tablet, 3 on desktop
- [ ] Core filter buttons wrap on small screens
- [ ] Advanced filters stack vertically on mobile
- [ ] Search bar full width on mobile
- [ ] Pagination buttons don't overflow

### 12.3 Job Detail

- [ ] Content readable on mobile (no horizontal scroll)
- [ ] Apply button accessible (not hidden)
- [ ] Contact buttons stack on mobile
- [ ] Similar jobs scroll horizontally

### 12.4 Profile Page

- [ ] Tabs responsive (may become scrollable tab bar)
- [ ] Form fields full width on mobile
- [ ] Modals (work experience, education) fit mobile screen
- [ ] Character counters visible
- [ ] Save button always visible

### 12.5 Employer Dashboard

- [ ] Tabs responsive
- [ ] Job cards stack on mobile
- [ ] Applicant cards stack on mobile
- [ ] Action buttons accessible
- [ ] Settings form full width

### 12.6 Post Job Form

- [ ] Stepper visible and readable
- [ ] Form fields full width on mobile
- [ ] Requirements/benefits add/remove works on touch
- [ ] File upload works on mobile
- [ ] Submit button always visible

### 12.7 Companies Page

- [ ] Cards: 1 column mobile, 2 tablet, 3 desktop
- [ ] Filters stack on mobile
- [ ] Search full width

### 12.8 Admin Dashboard

- [ ] Stats cards wrap on mobile
- [ ] Charts responsive
- [ ] Report list readable on mobile
- [ ] Action buttons accessible

---

## QUICK REFERENCE: ALL URLS TO TEST

| URL | Auth | Role | Test |
|-----|------|------|------|
| `/` | None | Public | Homepage with jobs |
| `/jobs` | None | Public | Same as homepage |
| `/jobs/:id` | None | Public | Job detail |
| `/login` | None | Public | Login form |
| `/register` | None | Public | Registration card selector |
| `/about` | None | Public | About us page |
| `/companies` | None | Public | Companies listing |
| `/company/:id` | None | Public | Company profile |
| `/employers` | None | Public | Employer info page |
| `/jobseekers` | None | Public | Jobseeker signup page |
| `/employer-register` | None | Public | Employer signup page |
| `/privacy` | None | Public | Privacy policy |
| `/terms` | None | Public | Terms of service |
| `/forgot-password` | None | Public | Password reset request |
| `/reset-password` | None | Public | Password reset form |
| `/unsubscribe` | None | Public | Email unsubscribe |
| `/preferences` | None | Public | Email preferences |
| `/profile` | Yes | Jobseeker | Profile management |
| `/saved-jobs` | Yes | Jobseeker | Saved jobs list |
| `/employer-dashboard` | Yes | Employer | Employer dashboard |
| `/post-job` | Yes | Employer | Job posting form |
| `/edit-job/:id` | Yes | Employer | Job editing form |
| `/admin` | Yes | Admin | Admin dashboard |
| `/admin/reports` | Yes | Admin | Admin reports |
| `/report-user` | Yes | Any | Report user form |
| `/anything-else` | None | Public | 404 page |

---

## TESTING CHECKLIST SUMMARY

| Area | Items | Status |
|------|-------|--------|
| Public Pages (8 pages) | 50+ checks | [ ] |
| Authentication (8 flows) | 45+ checks | [ ] |
| Jobseeker (9 flows) | 80+ checks | [ ] |
| Employer (7 flows) | 70+ checks | [ ] |
| Admin (5 flows) | 40+ checks | [ ] |
| Cross-Role (4 flows) | 15+ checks | [ ] |
| Email/Notifications (13 types) | 30+ checks | [ ] |
| Security (6 areas) | 35+ checks | [ ] |
| Edge Cases (7 areas) | 40+ checks | [ ] |
| Performance/UX | 20+ checks | [ ] |
| Mobile/Responsive | 30+ checks | [ ] |
| **TOTAL** | **~460 checks** | |

---

**Testing Notes:**
- Mark each item with [x] when tested and passing
- Mark with [!] if bug found (document bug in comments)
- Mark with [~] if partially working
- Mark with [-] if not applicable / feature not available
- Take screenshots of any bugs found
- Note browser/viewport when reporting issues
