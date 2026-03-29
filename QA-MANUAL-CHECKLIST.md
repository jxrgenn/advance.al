# advance.al — Manual QA Checklist

> **How to use**: Go through each section in order. Check off items as you complete them.
> Test in Chrome first, then spot-check Safari and mobile.
> Estimated total time: 4–5 hours for a thorough pass.

> **Test URLs**:
> - Frontend: http://localhost:5173 (dev) or https://advance.al (prod)
> - Backend: http://localhost:3001 (dev) or production URL

> **Test accounts needed**:
> - Admin: admin@advance.al
> - Employer: create one during testing
> - Job Seeker: create one during testing

---

## [AUTH-01] Registration — Job Seeker
Priority: CRITICAL
Estimated time: 10 minutes

### Pre-conditions:
- [ ] App is running at the test URL
- [ ] You have a fresh email address to register with

### Steps:
1. [ ] Go to `/jobseekers`
2. [ ] Scroll down to the signup form (or click "Regjistrohu" in footer under "Punëkërkuesit")
3. [ ] VERIFY: Footer "Regjistrohu" scrolls you to the signup form on the jobseekers page
4. [ ] Try submitting the form with all fields empty
5. [ ] VERIFY: Validation messages appear for required fields
6. [ ] Enter an email that's already registered
7. [ ] VERIFY: Clear error message about duplicate email (not a generic error)
8. [ ] Enter a weak password (e.g., "123")
9. [ ] VERIFY: Password strength validation message appears
10. [ ] Fill in valid data: first name, last name, email, password (8+ chars with upper, lower, number, special char), city, select "Punëkërkues"
11. [ ] Click "Regjistrohu"
12. [ ] VERIFY: Verification code screen appears — check the test email inbox for the 6-digit code
13. [ ] Enter a wrong verification code
14. [ ] VERIFY: Clear error message, you can retry
15. [ ] Enter the correct verification code
16. [ ] VERIFY: Registration completes, you are logged in and redirected to your profile/dashboard

### Edge cases:
- [ ] Paste a very long name (500 chars) — should be truncated or rejected
- [ ] Use Albanian characters in name (ë, ç, Ç) — should be accepted
- [ ] Try registering with the same email again — should fail with a clear message
- [ ] Rapidly click the submit button 5 times — should not create duplicate accounts

### Mobile:
- [ ] Repeat on 375px viewport — form is usable, keyboard doesn't overlap inputs

---

## [AUTH-02] Registration — Employer
Priority: CRITICAL
Estimated time: 8 minutes

### Pre-conditions:
- [ ] Fresh email address

### Steps:
1. [ ] Go to `/employer-register`
2. [ ] VERIFY: Registration form loads with employer-specific fields (company name, industry, company size)
3. [ ] Submit empty form
4. [ ] VERIFY: Validation errors for all required fields
5. [ ] Fill in valid employer data including company name, industry, company size
6. [ ] Complete verification flow
7. [ ] VERIFY: Logged in as employer, redirected to employer dashboard

### Edge cases:
- [ ] XSS in company name: `<script>alert(1)</script>` — should be sanitized, not executed
- [ ] Very long company name (1000 chars) — should be handled

---

## [AUTH-03] Login
Priority: CRITICAL
Estimated time: 8 minutes

### Pre-conditions:
- [ ] A registered account exists

### Steps:
1. [ ] Go to the login page (click "Hyr" in nav)
2. [ ] Submit with empty fields
3. [ ] VERIFY: Validation errors appear
4. [ ] Enter correct email, wrong password
5. [ ] VERIFY: Error message says "Kredenciale të gabuara" or similar — NOT "Email not found" (should not reveal if email exists)
6. [ ] Enter correct email and password
7. [ ] Click "Hyr"
8. [ ] VERIFY: Logged in, navigation shows user menu, redirected to appropriate page
9. [ ] Refresh the page
10. [ ] VERIFY: Still logged in (session persists)
11. [ ] Close browser tab, open new tab, go to the app
12. [ ] VERIFY: Still logged in (token persists in localStorage)

### Edge cases:
- [ ] Login with email in wrong case (e.g., ADMIN@advance.al) — should work (case-insensitive)
- [ ] Login while already logged in — should redirect to dashboard or show appropriate message
- [ ] Try accessing `/login` while logged in — reasonable behavior

---

## [AUTH-04] Logout
Priority: CRITICAL
Estimated time: 3 minutes

### Steps:
1. [ ] While logged in, click the user menu → "Dil" (Logout)
2. [ ] VERIFY: Redirected to home page, nav shows login/register buttons
3. [ ] Press browser back button
4. [ ] VERIFY: Cannot access protected pages (should redirect to login)
5. [ ] Try visiting `/profile` directly in the URL bar
6. [ ] VERIFY: Redirected to login

---

## [AUTH-05] Forgot Password
Priority: CRITICAL
Estimated time: 5 minutes

### Steps:
1. [ ] Go to login page
2. [ ] Click "Keni harruar fjalëkalimin?"
3. [ ] VERIFY: Forgot password form appears
4. [ ] Submit with empty email
5. [ ] VERIFY: Validation error
6. [ ] Enter a valid registered email
7. [ ] Click submit
8. [ ] VERIFY: Success message shown (check test email for reset link)
9. [ ] Enter a non-existent email
10. [ ] VERIFY: Same success message (should NOT reveal whether email exists)

---

## [AUTH-06] Password Reset
Priority: HIGH
Estimated time: 5 minutes

### Steps:
1. [ ] Use the reset link from AUTH-05 email
2. [ ] VERIFY: Reset password form loads
3. [ ] Enter a weak password
4. [ ] VERIFY: Validation error about password strength
5. [ ] Enter a strong new password
6. [ ] Submit
7. [ ] VERIFY: Success message, redirected to login
8. [ ] Login with the new password
9. [ ] VERIFY: Login succeeds
10. [ ] Try using the same reset link again
11. [ ] VERIFY: Link is expired/invalid

---

## [AUTH-07] Session & Token Handling
Priority: HIGH
Estimated time: 5 minutes

### Steps:
1. [ ] Login and note the time
2. [ ] Leave the app open for 15+ minutes (or manually modify the token expiry in DevTools)
3. [ ] Perform an action (e.g., click a nav link)
4. [ ] VERIFY: Token refreshes automatically (no forced logout) OR you see a re-login prompt
5. [ ] Open the app in two browser tabs with the same account
6. [ ] Logout in tab 1
7. [ ] Perform an action in tab 2
8. [ ] VERIFY: Tab 2 handles the stale session gracefully (redirect to login or refresh)

---

## [JOBS-01] Browse Jobs
Priority: CRITICAL
Estimated time: 10 minutes

### Pre-conditions:
- [ ] At least 10+ jobs exist in the database

### Steps:
1. [ ] Go to `/jobs`
2. [ ] VERIFY: Jobs list loads with job cards showing title, company, location, salary
3. [ ] VERIFY: Pagination appears if more than 1 page of results
4. [ ] Click page 2
5. [ ] VERIFY: Different jobs appear, URL updates
6. [ ] Click a category filter (e.g., "Teknologji")
7. [ ] VERIFY: Only jobs in that category shown, count updates
8. [ ] Click a location filter (e.g., "Tiranë")
9. [ ] VERIFY: Results filtered by both category AND location
10. [ ] Clear all filters
11. [ ] VERIFY: All jobs shown again

### Edge cases:
- [ ] Apply all filters that result in 0 matches — "Nuk u gjet asnjë punë" message shown
- [ ] Rapidly toggle filters — no visual glitch or loading issues

### Mobile:
- [ ] Filters collapse into a mobile-friendly UI
- [ ] Job cards are readable on small screens

---

## [JOBS-02] Search Jobs
Priority: CRITICAL
Estimated time: 5 minutes

### Steps:
1. [ ] Go to `/jobs`
2. [ ] Type "developer" in the search box
3. [ ] VERIFY: Results filter to matching jobs
4. [ ] Clear the search
5. [ ] VERIFY: All jobs shown again
6. [ ] Search for a string that matches nothing (e.g., "zzzznonexistent")
7. [ ] VERIFY: "No jobs found" message with suggestions or helpful text
8. [ ] Search for special characters: `<script>alert(1)</script>`
9. [ ] VERIFY: No XSS execution, handled gracefully

---

## [JOBS-03] View Job Detail
Priority: CRITICAL
Estimated time: 5 minutes

### Steps:
1. [ ] From `/jobs`, click on any job card
2. [ ] VERIFY: Job detail page loads with: title, company, location, salary, job type, description, requirements
3. [ ] VERIFY: "Apliko" (Apply) button is visible
4. [ ] VERIFY: Similar jobs section loads (if available)
5. [ ] Go back to jobs list
6. [ ] VERIFY: Filters and page are preserved

### Edge cases:
- [ ] Visit a job URL with a nonexistent ID (e.g., `/jobs/507f1f77bcf86cd799439011`)
- [ ] VERIFY: 404 page or "Job not found" message

---

## [JOBS-04] Apply to Job
Priority: CRITICAL
Estimated time: 8 minutes

### Pre-conditions:
- [ ] Logged in as a job seeker

### Steps:
1. [ ] View a job detail page
2. [ ] Click "Apliko"
3. [ ] VERIFY: Application modal/form opens
4. [ ] Fill in any required fields (cover letter if needed)
5. [ ] Click submit
6. [ ] VERIFY: Success confirmation shown
7. [ ] Go to the same job
8. [ ] Try to apply again
9. [ ] VERIFY: "You already applied" message — button disabled or shows "Applied"
10. [ ] Go to "Aplikimet e Mia" (My Applications)
11. [ ] VERIFY: The job you just applied to appears in the list with "Pending" status

### Edge cases:
- [ ] Rapidly click the submit button 5 times — should NOT create duplicate applications (AUDIT FIX H1)
- [ ] Try applying when not logged in — should redirect to login

### Mobile:
- [ ] Application modal doesn't overflow the screen

---

## [JOBS-05] Save/Bookmark Jobs
Priority: HIGH
Estimated time: 5 minutes

### Pre-conditions:
- [ ] Logged in as a job seeker

### Steps:
1. [ ] On a job card, click the save/bookmark icon
2. [ ] VERIFY: Icon toggles to "saved" state
3. [ ] Go to "Punët e Ruajtura" (Saved Jobs)
4. [ ] VERIFY: The saved job appears in the list
5. [ ] Click unsave
6. [ ] VERIFY: Job removed from saved list

---

## [JOBS-06] Withdraw Application
Priority: HIGH
Estimated time: 3 minutes

### Pre-conditions:
- [ ] Have an active application

### Steps:
1. [ ] Go to "Aplikimet e Mia"
2. [ ] Find a pending application
3. [ ] Click "Tërhiq" (Withdraw)
4. [ ] VERIFY: Confirmation dialog appears
5. [ ] Confirm withdrawal
6. [ ] VERIFY: Application status changes to "Withdrawn"

---

## [PROFILE-01] Edit Profile
Priority: CRITICAL
Estimated time: 10 minutes

### Pre-conditions:
- [ ] Logged in as a job seeker

### Steps:
1. [ ] Go to `/profile`
2. [ ] VERIFY: Profile page loads with all current data
3. [ ] Edit first name, last name, city, bio
4. [ ] Click save
5. [ ] VERIFY: Success toast/message
6. [ ] Refresh the page
7. [ ] VERIFY: Changes persisted

### Edge cases:
- [ ] Paste 10,000 characters into bio — should be handled (truncated or accepted)
- [ ] Albanian characters (ë, ç, Ç, Ë) — should save correctly
- [ ] Empty required fields — validation error
- [ ] Rapidly click save 5 times — no duplicate saves (AUDIT FIX H1)

---

## [PROFILE-02] Upload Resume/CV
Priority: HIGH
Estimated time: 5 minutes

### Steps:
1. [ ] Go to `/profile`
2. [ ] Upload a PDF resume
3. [ ] VERIFY: File accepted, preview/download link appears
4. [ ] Upload a DOCX resume
5. [ ] VERIFY: File accepted (DOCX support was added)
6. [ ] Try uploading an .exe file
7. [ ] VERIFY: Rejected with clear error message
8. [ ] Try uploading a 50MB file
9. [ ] VERIFY: Rejected with file size error
10. [ ] Upload a new PDF to replace the old one
11. [ ] VERIFY: New file replaces old, old file no longer accessible

---

## [PROFILE-03] Work Experience & Education
Priority: HIGH
Estimated time: 8 minutes

### Steps:
1. [ ] Go to `/profile`
2. [ ] Click "Add Work Experience"
3. [ ] Fill in: company, position, start date, end date, description
4. [ ] Save
5. [ ] VERIFY: Entry appears in the work experience list
6. [ ] Edit the entry
7. [ ] VERIFY: Changes save and display
8. [ ] Delete the entry
9. [ ] VERIFY: Entry removed
10. [ ] Repeat for Education (institution, degree, field, dates)

### Edge cases:
- [ ] End date before start date — should be validated
- [ ] Duplicate entries — should be prevented (AUDIT FIX)
- [ ] Rapidly click save — no duplicates (AUDIT FIX H1)

---

## [PROFILE-04] AI CV Generation
Priority: HIGH
Estimated time: 5 minutes

### Steps:
1. [ ] Go to `/profile` → AI CV Generator section
2. [ ] Enter natural language input (min 50 chars): "I am a software developer with 5 years of experience in React and Node.js..."
3. [ ] Click Generate
4. [ ] VERIFY: Loading state shown, CV generates after a few seconds
5. [ ] VERIFY: Generated CV content is displayed
6. [ ] Download the CV
7. [ ] VERIFY: PDF downloads successfully

### Edge cases:
- [ ] Input < 50 characters — should show validation error
- [ ] Input > 10,000 characters — should be handled

---

## [EMPLOYER-01] Create Job Posting
Priority: CRITICAL
Estimated time: 10 minutes

### Pre-conditions:
- [ ] Logged in as employer

### Steps:
1. [ ] Go to employer dashboard → "Posto Punë"
2. [ ] VERIFY: Job posting form loads with all fields
3. [ ] Submit empty form
4. [ ] VERIFY: Validation errors for required fields (title, description, category, location, type)
5. [ ] Fill in all required fields
6. [ ] Set salary range (min and max)
7. [ ] Add requirements
8. [ ] Choose application method (one-click or custom form)
9. [ ] Click "Publiko"
10. [ ] VERIFY: Success message, redirected to employer dashboard
11. [ ] VERIFY: New job appears in "Punët e Mia" (My Jobs) list

### Edge cases:
- [ ] Salary min > max — should be validated
- [ ] Very long title (500 chars) — should be handled
- [ ] XSS in description — should be sanitized
- [ ] Rapidly click publish 5 times — no duplicate jobs (AUDIT FIX H1)
- [ ] Two jobs with identical titles — should get unique slugs (AUDIT FIX H4)

---

## [EMPLOYER-02] Edit Job Posting
Priority: CRITICAL
Estimated time: 5 minutes

### Steps:
1. [ ] From employer dashboard, click edit on a job
2. [ ] VERIFY: Form pre-filled with current data
3. [ ] Change the title and description
4. [ ] Click save
5. [ ] VERIFY: Changes reflected on the public job listing
6. [ ] Refresh and verify persistence

---

## [EMPLOYER-03] Close & Delete Job
Priority: HIGH
Estimated time: 5 minutes

### Steps:
1. [ ] From employer dashboard, find an active job
2. [ ] Click "Mbyll" (Close) or equivalent
3. [ ] VERIFY: Job status changes, no longer visible to seekers
4. [ ] Click "Fshi" (Delete) on a job
5. [ ] VERIFY: Confirmation dialog appears
6. [ ] Confirm delete
7. [ ] VERIFY: Job removed from dashboard, returns 404 publicly
8. [ ] VERIFY: Any pending applications for that job are rejected (AUDIT FIX H5)

---

## [EMPLOYER-04] View Applicants
Priority: CRITICAL
Estimated time: 8 minutes

### Pre-conditions:
- [ ] A job with at least one application

### Steps:
1. [ ] From employer dashboard, click on a job to view applicants
2. [ ] VERIFY: Applicant list loads with names, status
3. [ ] Click on an applicant
4. [ ] VERIFY: Applicant profile, resume viewable/downloadable
5. [ ] Change applicant status (e.g., "Viewed" → "Shortlisted")
6. [ ] VERIFY: Status updates, persists on refresh
7. [ ] Send a message to applicant
8. [ ] VERIFY: Message sent confirmation

---

## [EMPLOYER-05] Employer Dashboard Stats
Priority: HIGH
Estimated time: 3 minutes

### Steps:
1. [ ] Go to employer dashboard
2. [ ] VERIFY: Stats show correct counts:
   - Total jobs matches actual job count
   - Total applicants matches actual applicant count
   - Views count is reasonable

---

## [ADMIN-01] Admin Dashboard
Priority: HIGH
Estimated time: 10 minutes

### Pre-conditions:
- [ ] Logged in as admin

### Steps:
1. [ ] Go to admin dashboard
2. [ ] VERIFY: Dashboard stats load (users count, jobs count, applications count)
3. [ ] VERIFY: Numbers are reasonable (not 0, not wildly wrong)
4. [ ] Check system health section
5. [ ] VERIFY: Shows MongoDB, Redis status

---

## [ADMIN-02] User Management
Priority: HIGH
Estimated time: 8 minutes

### Steps:
1. [ ] In admin dashboard, go to Users tab
2. [ ] VERIFY: User list loads with pagination
3. [ ] Search for a specific user
4. [ ] VERIFY: Search results appear
5. [ ] Filter by user type (jobseeker/employer)
6. [ ] VERIFY: Filtered results
7. [ ] Click manage on a user — try suspend
8. [ ] VERIFY: User status changes
9. [ ] Reactivate the user
10. [ ] VERIFY: Status restored

### Edge cases:
- [ ] Try to suspend the admin account — should be prevented or warned

---

## [ADMIN-03] Job Management
Priority: HIGH
Estimated time: 5 minutes

### Steps:
1. [ ] In admin dashboard, go to Jobs tab
2. [ ] VERIFY: All jobs listed (including closed/deleted)
3. [ ] Approve a pending job
4. [ ] VERIFY: Job status changes to approved
5. [ ] Reject a job
6. [ ] VERIFY: Job removed from public listing

---

## [ADMIN-04] Reports
Priority: HIGH
Estimated time: 5 minutes

### Steps:
1. [ ] Go to admin Reports section
2. [ ] VERIFY: Reports list loads
3. [ ] VERIFY: Report stats show computed average resolution time (NOT hardcoded "2.5 ditë") — AUDIT FIX M5
4. [ ] Click on a report for details
5. [ ] Take action (warn, suspend, etc.)
6. [ ] VERIFY: Action recorded

---

## [ADMIN-05] Bulk Notifications
Priority: MEDIUM
Estimated time: 5 minutes

### Steps:
1. [ ] Go to admin Notifications section
2. [ ] Create a bulk notification
3. [ ] Select target audience (e.g., "all jobseekers")
4. [ ] Enter title and message
5. [ ] Send
6. [ ] VERIFY: Notification appears in history
7. [ ] Login as a job seeker
8. [ ] VERIFY: Notification received

---

## [ADMIN-06] Configuration & Pricing
Priority: MEDIUM
Estimated time: 5 minutes

### Steps:
1. [ ] Go to admin Configuration tab
2. [ ] VERIFY: Settings load by category
3. [ ] Change a setting value
4. [ ] VERIFY: Saved successfully
5. [ ] Reset a setting to default
6. [ ] VERIFY: Default value restored
7. [ ] Check pricing configuration
8. [ ] VERIFY: Pricing values editable and saveable

---

## [NAV-01] Navigation & Footer
Priority: HIGH
Estimated time: 10 minutes

### Steps:
1. [ ] Click the logo
2. [ ] VERIFY: Goes to home page
3. [ ] Click every nav link: Punë, Punëkërkuesit, Punëdhënësit, Rreth Nesh
4. [ ] VERIFY: Each link works and loads the correct page
5. [ ] VERIFY: "Kompanite" is NOT shown in navigation (TEMPORARILY DISABLED)
6. [ ] Scroll to footer
7. [ ] VERIFY: "Kompanite" links are NOT shown in footer (TEMPORARILY DISABLED)
8. [ ] Click "Punët e fundit" → goes to `/jobs`
9. [ ] Click "Shfleto Punëkërkuesit" → goes to `/jobseekers`
10. [ ] Click "Krijo CV me AI" → goes to `/jobseekers` with scroll to AI section
11. [ ] Click "Posto një punë" → goes to `/employers`
12. [ ] Click "Regjistrohu" (under Punëdhënësit) → goes to `/employer-register`
13. [ ] Click "Regjistrohu" (under Punëkërkuesit) → goes to `/jobseekers` and scrolls to signup form
14. [ ] Click "Rreth Nesh" → goes to `/about`
15. [ ] Click "Kontakti" → goes to `/about` and scrolls to the contact section
16. [ ] Click "Politika e Privatësisë" → goes to `/privacy`
17. [ ] Click "Kushtet e Përdorimit" → goes to `/terms`
18. [ ] Click "info@advance.al" → opens email client
19. [ ] Click "JXSOFT" link → opens jxsoft.al in new tab

### Edge cases:
- [ ] Visit `/companies` directly in URL → should show 404 (route disabled)
- [ ] Visit `/company/123` directly → should show 404

---

## [NAV-02] 404 Page
Priority: MEDIUM
Estimated time: 2 minutes

### Steps:
1. [ ] Visit `/nonexistent-page`
2. [ ] VERIFY: Friendly 404 page shown (not blank page or error)
3. [ ] VERIFY: Navigation still works from 404 page

---

## [LEGAL-01] Privacy Policy
Priority: HIGH
Estimated time: 5 minutes

### Steps:
1. [ ] Go to `/privacy`
2. [ ] VERIFY: Page loads with all 14 sections:
   1. Hyrje (references Ligji Nr. 9887)
   2. Kontrolluesi i të Dhënave (JXSOFT)
   3. Të Dhënat që Mbledhim
   4. Baza Ligjore për Përpunimin
   5. Si i Përdorim të Dhënat
   6. Përpunimi me Inteligjencë Artificiale
   7. Ndarja e të Dhënave me Palë të Treta
   8. Transferimi Ndërkombëtar
   9. Cookies
   10. Periudhat e Ruajtjes
   11. Të Drejtat Tuaja
   12. Mbrojtja e të Miturve
   13. Siguria e të Dhënave
   14. Na Kontaktoni
3. [ ] VERIFY: No "NIPT" references anywhere on the page
4. [ ] VERIFY: Link to Terms page works
5. [ ] VERIFY: All Albanian text renders correctly (ë, ç, etc.)

---

## [LEGAL-02] Terms & Conditions
Priority: HIGH
Estimated time: 5 minutes

### Steps:
1. [ ] Go to `/terms`
2. [ ] VERIFY: Page loads with all 16 sections:
   1. Hyrje
   2. Përshkrimi i Shërbimit
   3. Rregullat e Llogarisë
   4. Shërbimet me Pagesë
   5. Përgjegjësitë e Përdoruesit
   6. Rregullat e Publikimit
   7. Rregullat e Aplikimit
   8. Përdorimi i AI
   9. Pronësia Intelektuale
   10. Kufizimi i Përgjegjësisë
   11. Dëmshpërblimi
   12. Disponueshmëria
   13. Forca Madhore
   14. Pezullimi dhe Mbyllja
   15. Dispozita të Përgjithshme
   16. Na Kontaktoni
3. [ ] VERIFY: No "NIPT" references
4. [ ] VERIFY: Link to Privacy page works
5. [ ] VERIFY: All Albanian text renders correctly

---

## [NOTIF-01] Notifications
Priority: HIGH
Estimated time: 5 minutes

### Pre-conditions:
- [ ] Logged in, have some notifications

### Steps:
1. [ ] Check notification bell/icon in nav
2. [ ] VERIFY: Badge shows unread count
3. [ ] Click to open notifications
4. [ ] VERIFY: Notifications list loads
5. [ ] Click a notification
6. [ ] VERIFY: Marked as read, badge count decreases
7. [ ] Click "Mark all as read"
8. [ ] VERIFY: All notifications marked as read, badge gone
9. [ ] Delete a notification
10. [ ] VERIFY: Removed from list

---

## [RESPONSIVE-01] Mobile Responsiveness
Priority: HIGH
Estimated time: 15 minutes

### Steps (test at 375px width using Chrome DevTools):
1. [ ] Home page — hero section readable, CTAs accessible
2. [ ] Jobs page — cards stack vertically, filters accessible
3. [ ] Job detail — all content readable, apply button reachable
4. [ ] Profile page — form fields full width, no horizontal scroll
5. [ ] Employer dashboard — table scrolls horizontally or reformats
6. [ ] Admin dashboard — tabs work, content doesn't overflow
7. [ ] Navigation — hamburger menu appears, all links accessible
8. [ ] Footer — stacks correctly, all links tappable
9. [ ] Modals (apply, report) — don't overflow screen
10. [ ] Forms — inputs are full width, keyboards don't cover submit buttons
11. [ ] Privacy & Terms — text readable without horizontal scroll

### Also test at:
- [ ] 390px (iPhone 14)
- [ ] 768px (iPad)
- [ ] 1024px (small laptop)

---

## [EMPTY-01] Empty States
Priority: MEDIUM
Estimated time: 5 minutes

### Steps:
1. [ ] New employer account → dashboard → "My Jobs" → VERIFY: Helpful "No jobs yet, create one" message
2. [ ] New seeker account → "My Applications" → VERIFY: "No applications yet" message
3. [ ] Notifications → VERIFY: "No notifications" (not blank)
4. [ ] Saved jobs → VERIFY: "No saved jobs" message
5. [ ] Search with no results → VERIFY: "No jobs found" with helpful text
6. [ ] Employer views applicants for job with 0 applications → VERIFY: "No applicants yet" message

---

## [ERROR-01] Error Handling
Priority: MEDIUM
Estimated time: 10 minutes

### Steps:
1. [ ] Open DevTools → Network → set to "Offline"
2. [ ] Try to load a page
3. [ ] VERIFY: Error message shown (not blank page or unhandled exception)
4. [ ] Go back online, try to submit a form
5. [ ] VERIFY: Recovers gracefully
6. [ ] Set Network to "Slow 3G"
7. [ ] Navigate through the app
8. [ ] VERIFY: Loading spinners/states visible, no duplicate submissions
9. [ ] Open app in two tabs with same account
10. [ ] Logout in tab 1
11. [ ] Try an action in tab 2
12. [ ] VERIFY: Handles stale session (redirect to login or refresh)

---

## [PERF-01] Performance Visual Check
Priority: MEDIUM
Estimated time: 5 minutes

### Steps:
1. [ ] Load home page on broadband
2. [ ] VERIFY: Renders within 2-3 seconds
3. [ ] Navigate between pages
4. [ ] VERIFY: No visible layout shift (CLS) during loading
5. [ ] Scroll through job listings
6. [ ] VERIFY: Smooth scrolling (no jank)
7. [ ] Load a page with images
8. [ ] VERIFY: Images load progressively, not all-at-once pop-in

---

## [A11Y-01] Accessibility Quick Check
Priority: LOW
Estimated time: 10 minutes

### Steps:
1. [ ] Tab through the home page
2. [ ] VERIFY: Focus indicators visible on each interactive element
3. [ ] VERIFY: Tab order is logical (top to bottom, left to right)
4. [ ] Tab through a form
5. [ ] VERIFY: All inputs reachable, submit button reachable by Tab + Enter
6. [ ] Check form labels
7. [ ] VERIFY: Inputs have proper labels (not just placeholders)
8. [ ] Check color contrast
9. [ ] VERIFY: Text is readable on all colored backgrounds
10. [ ] Check alt text on images
11. [ ] VERIFY: Important images have alt text

---

## [BROWSER-01] Cross-Browser
Priority: MEDIUM
Estimated time: 15 minutes

### Steps:
1. [ ] **Chrome (latest)**: Full test of core flows (login, browse, apply)
2. [ ] **Safari (latest)**: Login, browse jobs, view job detail, apply
3. [ ] **Firefox (latest)**: Login, browse jobs, view job detail
4. [ ] **Mobile Safari (iOS)**: Login, browse, apply
5. [ ] **Mobile Chrome (Android)**: Login, browse, apply

---

## [AUDIT-01] Audit Fix Verification
Priority: CRITICAL
Estimated time: 10 minutes

> These tests verify the specific fixes made during the pre-deployment audit.

### Steps:
1. [ ] **Double-submit prevention (H1)**: On PostJob, EditJob, ApplyModal, and Profile pages, rapidly click submit buttons — should NOT create duplicates
2. [ ] **Slug uniqueness (H4)**: Create two jobs with the exact same title — they should get different URLs
3. [ ] **Soft delete (H5)**: Delete a job that has pending applications — applications should be auto-rejected
4. [ ] **Report stats (M5)**: Go to admin Reports → stats — avg resolution time should be a computed number, not "2.5 ditë"
5. [ ] **Kompanite disabled**: "Kompanite" should not appear anywhere in nav or footer
6. [ ] **Footer scroll (Regjistrohu)**: Footer "Regjistrohu" under Punëkërkuesit scrolls to signup form on /jobseekers
7. [ ] **Footer scroll (Kontakti)**: Footer "Kontakti" scrolls to contact section on /about
8. [ ] **No NIPT**: Privacy and Terms pages do not contain the word "NIPT"
9. [ ] **Privacy 14 sections**: Privacy page has all 14 sections with Albanian law references
10. [ ] **Terms 16 sections**: Terms page has all 16 sections with Albanian civil code references
