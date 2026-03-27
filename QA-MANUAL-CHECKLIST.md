# advance.al — Manual QA Checklist

> **How to use**: Go through each section in order. Check off items as you complete them.
> Test in Chrome first, then spot-check Safari and mobile.
> Estimated total time: 4–5 hours for a thorough pass.

---

## QA-01 — Job Seeker Registration
**Priority**: CRITICAL
**Estimated time**: 15 minutes

### Pre-conditions:
- [ ] App is running locally or on staging
- [ ] You are logged out
- [ ] You have access to an email inbox for receiving verification codes

### Steps:
1. [ ] Go to `/jobseekers` (or click "Kërko Punë" / "Regjistrohu" from the homepage)
2. [ ] VERIFY: Registration form is visible with fields: First Name, Last Name, Email, Password, Phone, City
3. [ ] Leave all fields empty and click "Regjistrohu"
4. [ ] VERIFY: Validation errors appear for required fields (red borders / error messages)
5. [ ] Enter a very short password (e.g., "abc")
6. [ ] VERIFY: Error message about password length/complexity
7. [ ] Enter a valid password but mismatched confirmation (if there is one)
8. [ ] VERIFY: Error message about password mismatch
9. [ ] Fill in all fields correctly:
   - First Name: "Test"
   - Last Name: "Seeker"
   - Email: your test email
   - Password: "TestPass123!" (8+ chars, uppercase, lowercase, digit)
   - City: select "Tiranë"
10. [ ] Click "Regjistrohu"
11. [ ] VERIFY: Verification code modal appears
12. [ ] VERIFY: You received a verification email (check inbox)
13. [ ] Enter the wrong code (e.g., "000000")
14. [ ] VERIFY: Error message about wrong code, remaining attempts shown
15. [ ] Enter the correct 6-digit code
16. [ ] VERIFY: Registration succeeds, you are redirected to the home page or profile, logged in
17. [ ] VERIFY: Navigation bar shows your name and appropriate menu items

### Edge cases:
- [ ] Try registering with the same email again → should get "already exists" error
- [ ] Try with a disposable/invalid email format → validation error
- [ ] Try with phone number in wrong format → validation error
- [ ] Let the verification code expire (wait 10 min) and try → should say expired

### Mobile (375px):
- [ ] Form fields stack vertically and are usable
- [ ] Verification code modal fits the screen

---

## QA-02 — Employer Registration
**Priority**: CRITICAL
**Estimated time**: 15 minutes

### Pre-conditions:
- [ ] Logged out

### Steps:
1. [ ] Go to `/employers` (or click "Posto Punë" from nav)
2. [ ] Click the registration / sign-up option
3. [ ] VERIFY: Multi-step form appears with Step 1 (Personal info)
4. [ ] Fill in Step 1: First Name, Last Name, Email, Password, Phone (optional), City
5. [ ] Proceed to Step 2 (Company info)
6. [ ] VERIFY: Fields appear for: Company Name, Company Size, Industry, Description, Website
7. [ ] Try proceeding without filling required fields
8. [ ] VERIFY: Validation errors for Company Name, Industry, Company Size
9. [ ] Fill in all company fields:
   - Company Name: "TestCorp QA"
   - Company Size: "1-10"
   - Industry: "Teknologji"
   - Description: at least a short sentence
10. [ ] Complete the form and submit
11. [ ] VERIFY: Verification code modal appears
12. [ ] Enter the correct code from email
13. [ ] VERIFY: Success message mentioning admin verification pending
14. [ ] VERIFY: You are logged in but see a message about pending verification
15. [ ] VERIFY: You CANNOT post a job until admin verifies you (if applicable)

### Edge cases:
- [ ] Company Size dropdown values match what the backend expects (1-10, 11-50, 51-200, 201-500, 501+)
- [ ] Website field accepts valid URLs (https://...) and rejects garbage
- [ ] Company description with special characters (quotes, <html>, etc.) doesn't break

---

## QA-03 — Login & Logout
**Priority**: CRITICAL
**Estimated time**: 10 minutes

### Pre-conditions:
- [ ] A registered user exists

### Steps:
1. [ ] Go to `/login`
2. [ ] VERIFY: Login form with Email and Password fields
3. [ ] Submit empty form
4. [ ] VERIFY: Validation errors
5. [ ] Enter correct email but wrong password
6. [ ] VERIFY: Generic error "Email ose fjalëkalim i gabuar" (no hint about which is wrong)
7. [ ] Enter a non-existent email
8. [ ] VERIFY: Same generic error message (no email enumeration)
9. [ ] Enter correct credentials
10. [ ] VERIFY: Redirected to appropriate dashboard (home for seeker, employer-dashboard for employer, admin for admin)
11. [ ] VERIFY: Navigation bar shows logged-in state (name, avatar, dropdown)
12. [ ] Refresh the page
13. [ ] VERIFY: Still logged in (session persists)
14. [ ] Click the logout button / option
15. [ ] VERIFY: Redirected to home or login page
16. [ ] VERIFY: Navigation shows logged-out state
17. [ ] Try accessing `/profile` directly (type in URL bar)
18. [ ] VERIFY: Redirected to `/login`
19. [ ] Press the back button
20. [ ] VERIFY: You don't see the protected page content

### Edge cases:
- [ ] Open two tabs. Log out in Tab 1. Go to Tab 2 and try an action → should prompt re-login
- [ ] Disable network (DevTools offline), try to log in → shows connection error, doesn't crash

---

## QA-04 — Password Reset Flow
**Priority**: CRITICAL
**Estimated time**: 10 minutes

### Pre-conditions:
- [ ] A registered user exists with a real email

### Steps:
1. [ ] Go to `/login`, click "Keni harruar fjalëkalimin?"
2. [ ] VERIFY: Password reset form appears with email field
3. [ ] Enter your registered email
4. [ ] VERIFY: Success message (should ALWAYS show success, even for non-existent emails)
5. [ ] Check your email inbox
6. [ ] VERIFY: Reset email received with a link
7. [ ] Click the link
8. [ ] VERIFY: Opens the app at `/reset-password?token=...` with a new password form
9. [ ] Enter a weak password
10. [ ] VERIFY: Validation error about password requirements
11. [ ] Enter a strong new password
12. [ ] VERIFY: Success message
13. [ ] Log in with the NEW password
14. [ ] VERIFY: Login succeeds
15. [ ] Try logging in with the OLD password
16. [ ] VERIFY: Login fails

### Edge cases:
- [ ] Try using the same reset link again → should say "expired or invalid"
- [ ] Enter a non-existent email in forgot password → still shows success (no enumeration)

---

## QA-05 — Job Browsing & Search
**Priority**: CRITICAL
**Estimated time**: 20 minutes

### Pre-conditions:
- [ ] There are jobs in the database

### Steps:
1. [ ] Go to `/` (homepage / jobs page)
2. [ ] VERIFY: Jobs list loads with job cards showing: title, company, location, salary (if public), time posted
3. [ ] VERIFY: Pagination controls appear at the bottom
4. [ ] Click page 2
5. [ ] VERIFY: Different jobs load, URL updates
6. [ ] Type a search term (e.g., "developer") in the search bar
7. [ ] VERIFY: Results filter to matching jobs
8. [ ] Clear the search
9. [ ] VERIFY: All jobs show again
10. [ ] Select a city filter (e.g., "Tiranë")
11. [ ] VERIFY: Only jobs in that city appear
12. [ ] Select a category filter (e.g., "Teknologji")
13. [ ] VERIFY: Only jobs in that category appear
14. [ ] Combine city + category + search
15. [ ] VERIFY: Filters work together correctly
16. [ ] Clear all filters
17. [ ] VERIFY: All jobs shown again
18. [ ] Try the platform category filters: "Nga Shtëpia", "Part Time", "Diaspora"
19. [ ] VERIFY: Each filter shows relevant results
20. [ ] Sort by "Newest" vs "Oldest"
21. [ ] VERIFY: Order changes correctly

### Edge cases:
- [ ] Search for something with no results (e.g., "xyznonexistent")
- [ ] VERIFY: Empty state message like "Nuk u gjetën rezultate"
- [ ] Search with special characters: `<script>`, `{$gt: ""}`, Unicode emoji
- [ ] VERIFY: No crash, no weird rendering
- [ ] Apply salary filter (min 500, max 1000 EUR)
- [ ] VERIFY: Only jobs within that range (or negotiable) appear
- [ ] Test the "Administrata" platform category filter
- [ ] Test "Sezonale" platform category filter
- [ ] Combine text search + city + category + platform category → VERIFY: all filters work together
- [ ] Test salary range filter with only min set (no max) → should show jobs >= min
- [ ] Test salary range filter with only max set (no min) → should show jobs <= max

### Mobile (375px):
- [ ] Filters accessible (expandable panel or modal)
- [ ] Job cards are readable, not cut off
- [ ] Pagination doesn't overflow

---

## QA-06 — Job Detail Page
**Priority**: CRITICAL
**Estimated time**: 10 minutes

### Pre-conditions:
- [ ] Jobs exist in the database
- [ ] You are logged in as a job seeker

### Steps:
1. [ ] From the jobs list, click on a job title
2. [ ] VERIFY: Job detail page loads with:
   - Title
   - Company name and logo
   - Location (city)
   - Salary (if showPublic is true)
   - Job type (full-time/part-time/etc.)
   - Category
   - Full description
   - Requirements list
   - Benefits list
   - Posted date / time ago
   - Application count / view count
3. [ ] VERIFY: "Apliko" (Apply) button is visible
4. [ ] VERIFY: Similar jobs section appears below the job
5. [ ] Click the company name
6. [ ] VERIFY: Goes to company profile page (or company info section)
7. [ ] Go back to the job detail
8. [ ] Click the save/bookmark icon
9. [ ] VERIFY: Job is marked as saved (icon changes state)
10. [ ] VERIFY: Check `/saved-jobs` — the job appears there

### Edge cases:
- [ ] Visit a job detail page while logged out → should still render, but apply button prompts login
- [ ] Visit `/jobs/nonexistent-id` → should show a 404 or "Job not found" page
- [ ] View a job that has been closed/expired → should show appropriate status

---

## QA-07 — Job Application
**Priority**: CRITICAL
**Estimated time**: 15 minutes

### Pre-conditions:
- [ ] Logged in as a job seeker with a verified email
- [ ] A job exists that accepts applications (status: active)
- [ ] Profile has at least basic info filled out

### Steps:
1. [ ] Go to a job detail page
2. [ ] Click "Apliko" button
3. [ ] VERIFY: Application modal/form opens
4. [ ] If one-click apply: click submit
5. [ ] VERIFY: Success confirmation shown
6. [ ] VERIFY: The "Apliko" button changes to "Keni Aplikuar" or similar
7. [ ] Go to `/profile` → Applications tab
8. [ ] VERIFY: The application appears with status "Pending"
9. [ ] Go back to the same job
10. [ ] Try to apply again
11. [ ] VERIFY: Prevented — button shows already applied, or a clear error message
12. [ ] If the job has custom questions:
    - [ ] Try submitting without answering required questions
    - [ ] VERIFY: Validation error
    - [ ] Answer all questions and submit
    - [ ] VERIFY: Success

### Edge cases:
- [ ] Apply with unverified email → should show error about email verification
- [ ] Apply with incomplete profile (no name/location) → should show error or prompt to complete
- [ ] Rapid double-click the apply button → should not create two applications

### Mobile (375px):
- [ ] Application modal/form is usable
- [ ] Cover letter textarea is reachable

---

## QA-08 — Saved Jobs
**Priority**: HIGH
**Estimated time**: 5 minutes

### Pre-conditions:
- [ ] Logged in as a job seeker

### Steps:
1. [ ] Go to a job listing or detail page
2. [ ] Click the save/bookmark icon on a job
3. [ ] VERIFY: Icon changes to "saved" state
4. [ ] Save 2-3 different jobs
5. [ ] Go to `/saved-jobs`
6. [ ] VERIFY: All saved jobs appear in a list
7. [ ] Click the unsave button on one job
8. [ ] VERIFY: Job is removed from the saved list
9. [ ] Refresh the page
10. [ ] VERIFY: Saved state persists correctly

---

## QA-09 — Job Seeker Profile
**Priority**: HIGH
**Estimated time**: 15 minutes

### Pre-conditions:
- [ ] Logged in as a job seeker

### Steps:
1. [ ] Go to `/profile`
2. [ ] VERIFY: Profile page loads with tabs (Personal, Experience, Applications, Settings)
3. [ ] **Personal tab**: Edit first name, last name, phone, location, bio
4. [ ] Click Save
5. [ ] VERIFY: Changes persist after page refresh
6. [ ] **Skills**: Add skills (comma-separated), save, verify they appear
7. [ ] **Work Experience**: Click Add, fill in position, company, dates, description
8. [ ] Save the work experience
9. [ ] VERIFY: Appears in the list
10. [ ] Edit the work experience, change a field
11. [ ] VERIFY: Edit persists
12. [ ] Delete the work experience
13. [ ] VERIFY: It's removed
14. [ ] **Education**: Same flow — add, edit, delete
15. [ ] **Resume Upload**: Upload a PDF file
16. [ ] VERIFY: Upload succeeds, file name displayed
17. [ ] Try uploading a non-PDF file (.exe, .jpg)
18. [ ] VERIFY: Rejected with error message
19. [ ] Try uploading a file > 5MB
20. [ ] VERIFY: Rejected with error message
21. [ ] **Profile Photo**: Upload a photo (JPEG/PNG)
22. [ ] VERIFY: Photo appears on profile
23. [ ] **Settings tab**: Toggle profile visibility, search visibility
24. [ ] Change password: enter current + new password
25. [ ] VERIFY: Password change succeeds

### Edge cases:
- [ ] Enter max-length text in bio (500 chars) → character counter shows limit
- [ ] Enter emoji in name field → should be accepted or gracefully rejected
- [ ] Salary preferences: set min > max → should be caught by validation
- [ ] AI CV Generation: click generate, enter natural language description, VERIFY: CV generated
- [ ] Work Experience: add experience with "current" checkbox → VERIFY: no end date required
- [ ] Education: add education with future graduation date → should be accepted
- [ ] Skills: add 20+ skills → VERIFY: all saved and displayed
- [ ] Availability preferences: set desired job types, salary range, remote preference

---

## QA-10 — Employer Dashboard
**Priority**: CRITICAL
**Estimated time**: 15 minutes

### Pre-conditions:
- [ ] Logged in as a verified employer

### Steps:
1. [ ] Go to `/employer-dashboard`
2. [ ] VERIFY: Dashboard loads with stats cards (Active Jobs, Total Applicants, Views, etc.)
3. [ ] VERIFY: Stats numbers are accurate (cross-reference with actual data)
4. [ ] **Jobs tab**: See list of employer's jobs
5. [ ] Filter by status (Active, Expired, Draft)
6. [ ] VERIFY: Filters work correctly
7. [ ] **Applicants tab**: See applications received
8. [ ] Click on an applicant to view their profile
9. [ ] VERIFY: Applicant's name, skills, resume are visible
10. [ ] Change an applicant's status (e.g., Pending → Viewed → Shortlisted)
11. [ ] VERIFY: Status updates immediately, notification may be sent
12. [ ] **Company Settings**: Edit company description, website
13. [ ] Upload company logo
14. [ ] VERIFY: Logo appears on the dashboard and public company page

### Edge cases:
- [ ] Employer with 0 jobs → empty state message, CTA to create first job
- [ ] Employer with 0 applicants → helpful empty state

---

## QA-11 — Job Posting (Employer)
**Priority**: CRITICAL
**Estimated time**: 15 minutes

### Pre-conditions:
- [ ] Logged in as a verified employer

### Steps:
1. [ ] Go to `/post-job`
2. [ ] VERIFY: Multi-step form appears (Basic Info → Location → Salary → Requirements)
3. [ ] Try submitting Step 1 with empty fields
4. [ ] VERIFY: Validation errors for title, description, category, job type
5. [ ] Fill in valid data:
   - Title: "QA Test Job"
   - Description: 50+ characters of real description
   - Category: "Teknologji"
   - Job Type: "full-time"
6. [ ] Proceed to Step 2 (Location)
7. [ ] Select city: "Tiranë"
8. [ ] Toggle remote options
9. [ ] Proceed to Step 3 (Salary)
10. [ ] Enter salary range: min 500, max 1000, EUR
11. [ ] Toggle "Show salary publicly"
12. [ ] Proceed to Step 4 (Requirements/Benefits)
13. [ ] Add requirements and benefits
14. [ ] Add tags
15. [ ] Set platform categories (check/uncheck diaspora, ngaShtepia, etc.)
16. [ ] Submit the form
17. [ ] VERIFY: Job created successfully (toast notification)
18. [ ] VERIFY: Redirected to employer dashboard or job detail
19. [ ] VERIFY: Job appears in the employer's job list
20. [ ] Go to the public jobs page
21. [ ] VERIFY: The new job appears in the listings

### Edge cases:
- [ ] Title with < 5 chars → validation error
- [ ] Description with < 50 chars → validation error
- [ ] Salary min > max → should be caught
- [ ] Very long title (100 chars) → should be accepted (max)
- [ ] 101+ char title → should be rejected

---

## QA-12 — Edit & Manage Jobs (Employer)
**Priority**: HIGH
**Estimated time**: 10 minutes

### Pre-conditions:
- [ ] Logged in as employer with at least one job

### Steps:
1. [ ] Go to employer dashboard → Jobs tab
2. [ ] Click "Edit" on a job
3. [ ] VERIFY: Edit form pre-populated with current job data
4. [ ] Change the title
5. [ ] Save
6. [ ] VERIFY: Title updated on the employer dashboard AND on the public job listing
7. [ ] From dashboard, close/unpublish a job
8. [ ] VERIFY: Job status changes to "closed"
9. [ ] VERIFY: Job no longer appears in public search results
10. [ ] Re-open the job (if applicable)
11. [ ] VERIFY: Job reappears in search

---

## QA-13 — Admin Dashboard
**Priority**: HIGH
**Estimated time**: 20 minutes

### Pre-conditions:
- [ ] Logged in as admin

### Steps:
1. [ ] Go to `/admin`
2. [ ] VERIFY: Admin dashboard loads with overview stats
3. [ ] **Users section**: View all users
4. [ ] Search for a user by name or email
5. [ ] VERIFY: Search results are relevant
6. [ ] Filter by user type (jobseeker, employer)
7. [ ] **Pending Employers**: View list of employers awaiting verification
8. [ ] Approve an employer
9. [ ] VERIFY: Employer status changes to approved/active
10. [ ] Reject an employer (if test data available)
11. [ ] VERIFY: Employer receives notification of rejection
12. [ ] **Jobs section**: View all jobs
13. [ ] Filter by status
14. [ ] Search by title
15. [ ] Approve a pending job
16. [ ] Remove a job
17. [ ] **Reports section**: View reported users/jobs
18. [ ] Take action on a report (warn, suspend)
19. [ ] **Configuration**: View system settings
20. [ ] Change a non-critical setting
21. [ ] VERIFY: Change saves and takes effect

### Edge cases:
- [ ] Admin cannot delete their own account
- [ ] Admin cannot ban other admins
- [ ] Stats numbers are consistent with user/job counts
- [ ] **Embeddings section**: View embedding system status, queue, worker health
- [ ] Recompute all embeddings → VERIFY: process starts (shows progress)
- [ ] **Configuration section**: View all system configurations
- [ ] Edit a configuration value → VERIFY: saved and applied
- [ ] Toggle maintenance mode → VERIFY: frontend shows maintenance page, API returns maintenance responses
- [ ] Turn off maintenance mode → VERIFY: normal operation resumes

---

## QA-14 — Notifications
**Priority**: HIGH
**Estimated time**: 10 minutes

### Pre-conditions:
- [ ] Logged in as any user who has notifications

### Steps:
1. [ ] Click the notification bell icon in the nav
2. [ ] VERIFY: Dropdown shows recent notifications
3. [ ] VERIFY: Unread count badge matches actual unread count
4. [ ] Click on a notification
5. [ ] VERIFY: It's marked as read (visual change)
6. [ ] VERIFY: Badge count decreases by 1
7. [ ] Click "Mark all as read"
8. [ ] VERIFY: All notifications marked as read, badge shows 0
9. [ ] Delete a notification
10. [ ] VERIFY: It's removed from the list
11. [ ] Trigger a notification (e.g., apply to a job as seeker, check employer's notifications)
12. [ ] VERIFY: New notification appears in real-time or on next poll

### Edge cases:
- [ ] Filter notifications by type (application, system, etc.) if available
- [ ] Test pagination: scroll to load more notifications
- [ ] Verify notification bell count never goes negative
- [ ] Test: employer changes application status → seeker gets notification
- [ ] Test: admin sends bulk notification → all target users receive it

---

## QA-15 — Companies Page
**Priority**: MEDIUM
**Estimated time**: 10 minutes

### Steps:
1. [ ] Go to `/companies`
2. [ ] VERIFY: List of companies loads with logos, names, industries
3. [ ] Search for a company by name
4. [ ] VERIFY: Results filter correctly
5. [ ] Filter by city, industry, company size
6. [ ] Click on a company card
7. [ ] VERIFY: Company profile page loads with: description, location, size, industry
8. [ ] VERIFY: Company's active jobs are listed below
9. [ ] Click on one of the company's jobs
10. [ ] VERIFY: Goes to job detail page

### Edge cases:
- [ ] Company with no active jobs → shows "Nuk ka punë aktive" or similar
- [ ] Company with no logo → default placeholder shown

---

## QA-16 — Email Verification (Existing User)
**Priority**: HIGH
**Estimated time**: 5 minutes

### Pre-conditions:
- [ ] Logged in as a user with unverified email (if possible)

### Steps:
1. [ ] Go to profile or see a prompt about unverified email
2. [ ] Click "Verify Email" or "Send verification code"
3. [ ] VERIFY: Code sent to your email
4. [ ] Enter the code
5. [ ] VERIFY: Email verified successfully, UI updates

---

## QA-17 — Quick User Registration (Newsletter)
**Priority**: MEDIUM
**Estimated time**: 5 minutes

### Steps:
1. [ ] Go to `/jobseekers` and find the "quick signup" option
2. [ ] Fill in: Name, Email, Location, Select at least one interest category
3. [ ] Submit
4. [ ] VERIFY: Success message
5. [ ] Check email for welcome message
6. [ ] Try the unsubscribe link in the email
7. [ ] VERIFY: Unsubscribed successfully

---

## QA-18 — Navigation & Layout
**Priority**: HIGH
**Estimated time**: 10 minutes

### Steps:
1. [ ] **Navbar links** — click every link in the main navigation:
   - Logo → home
   - Kërko Punë → jobs page
   - Posto Punë → employer page / post-job
   - Kompani → companies
   - Hyrje / Regjistrohu → login/register
   - (When logged in) Profile, Dashboard, Notifications, Logout
2. [ ] VERIFY: Each link goes to the correct page
3. [ ] **Footer links** — click every link in the footer:
   - About Us → `/about`
   - Privacy → `/privacy`
   - Terms → `/terms`
   - Contact links
4. [ ] VERIFY: Each link works
5. [ ] Visit `/nonexistent-page-xyz`
6. [ ] VERIFY: 404 page shown with helpful message and link back to home

### Mobile (375px):
- [ ] Hamburger menu appears
- [ ] All nav items accessible from hamburger
- [ ] Menu closes after selecting an item

---

## QA-19 — Responsive Design
**Priority**: HIGH
**Estimated time**: 15 minutes

### Steps:
Test the following pages at these widths: 375px, 768px, 1024px, 1440px

- [ ] **Home / Jobs page**: Cards reflow, filters accessible, search usable
- [ ] **Job Detail**: Content readable, apply button reachable
- [ ] **Profile page**: Tabs work, forms usable
- [ ] **Employer Dashboard**: Tables/lists don't overflow
- [ ] **Post Job form**: Steps navigate correctly, fields don't overlap
- [ ] **Login/Register pages**: Forms centered, not cut off
- [ ] **Admin Dashboard**: Tables scroll horizontally on mobile

### Check:
- [ ] No horizontal scrollbar on any page at 375px
- [ ] Text is readable without pinch-zooming
- [ ] Touch targets are at least 44px (buttons, links)
- [ ] Modals don't overflow the viewport

---

## QA-20 — Empty States
**Priority**: MEDIUM
**Estimated time**: 10 minutes

### Steps (test with a fresh user or appropriate role):
- [ ] **New seeker, no applications**: Go to `/profile` → Applications tab → shows empty state with CTA
- [ ] **New seeker, no saved jobs**: Go to `/saved-jobs` → shows "Nuk keni punë të ruajtura"
- [ ] **New employer, no jobs**: Go to `/employer-dashboard` → Shows CTA to create first job
- [ ] **Search with 0 results**: Search for "xyznonexistent" → shows "Nuk u gjetën rezultate"
- [ ] **No notifications**: Click bell → shows "Nuk keni njoftime"
- [ ] **Employer, no applicants**: View a job with 0 applicants → shows helpful message

---

## QA-21 — Error Handling
**Priority**: MEDIUM
**Estimated time**: 10 minutes

### Steps:
1. [ ] **Network offline**: Open DevTools → Network → Offline
2. [ ] Try to submit a form (e.g., login)
3. [ ] VERIFY: Error message about connectivity, no crash
4. [ ] **Slow network**: DevTools → Network → Slow 3G
5. [ ] Navigate between pages
6. [ ] VERIFY: Loading spinners appear, pages eventually load
7. [ ] Try submitting a form on slow network
8. [ ] VERIFY: Loading state on button, no double-submission
9. [ ] **Paste 10,000 characters** into a text field (e.g., job description)
10. [ ] VERIFY: Character counter shows over-limit, or text is truncated
11. [ ] **Invalid URL params**: Go to `/jobs/this-is-not-a-valid-id`
12. [ ] VERIFY: Error page or "not found" message, not a white screen

---

## QA-22 — Browser Compatibility
**Priority**: MEDIUM
**Estimated time**: 15 minutes

### Test core flows in each browser:
- [ ] **Chrome (latest)**: Full checklist above
- [ ] **Safari (latest)**:
  - [ ] Login
  - [ ] Browse jobs
  - [ ] Apply to a job
  - [ ] View profile
- [ ] **Firefox (latest)**:
  - [ ] Login
  - [ ] Browse jobs
  - [ ] Post a job (employer)
- [ ] **Mobile Safari (iOS)**:
  - [ ] Login → browse → view job
- [ ] **Mobile Chrome (Android)**:
  - [ ] Login → browse → apply

---

## QA-23 — Performance Visual Check
**Priority**: MEDIUM
**Estimated time**: 5 minutes

### Steps:
- [ ] Open DevTools → Network tab, clear cache
- [ ] Load the homepage
- [ ] VERIFY: Page loads within 3 seconds on broadband
- [ ] VERIFY: No large layout shifts visible (content doesn't jump around)
- [ ] Scroll through a jobs list
- [ ] VERIFY: Smooth scrolling, no jank
- [ ] Open DevTools → Lighthouse, run a Performance audit
- [ ] VERIFY: Score > 70 on Performance

---

## QA-24 — Security Quick Check
**Priority**: HIGH
**Estimated time**: 5 minutes

### Steps:
- [ ] Open DevTools → Application → Local Storage
- [ ] VERIFY: `authToken`, `refreshToken`, and `user` are stored (known limitation — see audit)
- [ ] Log out
- [ ] VERIFY: All three are cleared from Local Storage
- [ ] Try accessing an API endpoint directly in the browser (e.g., `/api/users/profile`)
- [ ] VERIFY: Returns 401, not user data
- [ ] Check that no API keys are visible in the frontend source (View Source / Network tab)
- [ ] VERIFY: No `sk-`, `re_`, or database credentials in any JS bundle

---

## QA-25 — AI CV Generation
**Priority**: HIGH
**Estimated time**: 15 minutes

### Pre-conditions:
- [ ] Logged in as a job seeker with profile filled out (name, skills, experience)

### Steps:
1. [ ] Go to `/profile` → CV section
2. [ ] Click "Generate CV with AI"
3. [ ] VERIFY: A form/modal appears with a text area for describing your experience
4. [ ] Enter a natural language description of your experience (at least a paragraph)
5. [ ] Submit and wait for generation
6. [ ] VERIFY: Loading state is visible (spinner, progress indicator, or "Generating..." text)
7. [ ] VERIFY: CV preview appears with professional formatting (sections, headings, proper layout)
8. [ ] Click the "Download" button
9. [ ] VERIFY: A PDF file downloads to your machine
10. [ ] Open the downloaded PDF
11. [ ] VERIFY: Content matches the preview, formatting is clean, no garbled text

### Edge cases:
- [ ] Try generating with very short input (under 20 chars) → should show minimum length warning
- [ ] Try generating with empty input → validation error, submit button disabled or shows error
- [ ] Check rate limit: generate 5+ times within an hour → should get rate limit error message
- [ ] Try generating with XSS payload in input (`<script>alert(1)</script>`) → should be sanitized, no script execution
- [ ] Cancel/navigate away during generation → no crash, can return and try again

### Mobile (375px):
- [ ] CV preview is readable and scrollable
- [ ] Download button is accessible
- [ ] Text area for input is usable

---

## QA-26 — Application Messaging
**Priority**: HIGH
**Estimated time**: 15 minutes

### Pre-conditions:
- [ ] Logged in as an employer who has received at least one application
- [ ] The applicant (job seeker) account is also accessible for login

### Steps:
1. [ ] Login as employer, go to `/employer-dashboard` → Applicants section
2. [ ] Click on an applicant to view details
3. [ ] Find the messaging/notes section
4. [ ] Type a message and click send
5. [ ] VERIFY: Message appears in the conversation thread with timestamp
6. [ ] VERIFY: Your name/role is shown as the sender
7. [ ] Log out and login as the job seeker who applied
8. [ ] Go to `/profile` → Applications → click on the relevant application
9. [ ] VERIFY: Employer's message is visible in the thread
10. [ ] Type a reply and send
11. [ ] VERIFY: Reply appears in the conversation with your name and timestamp
12. [ ] Log out and switch back to employer
13. [ ] Navigate to the same applicant
14. [ ] VERIFY: Job seeker's reply is visible in the thread
15. [ ] VERIFY: Messages are in chronological order

### Edge cases:
- [ ] Send an empty message → should be rejected (button disabled or validation error)
- [ ] Send a very long message (5000+ chars) → should be handled (accepted with truncation or rejected with limit message)
- [ ] Send a message with HTML/XSS content (`<script>alert('xss')</script>`, `<img onerror=...>`) → should be sanitized, renders as plain text
- [ ] Send a message with special characters and emoji → should display correctly
- [ ] Rapid-click the send button → should not create duplicate messages

### Mobile (375px):
- [ ] Message thread is scrollable
- [ ] Input field and send button are accessible
- [ ] Messages are readable without horizontal scroll

---

## QA-27 — Application Status Timeline
**Priority**: HIGH
**Estimated time**: 10 minutes

### Pre-conditions:
- [ ] Logged in as an employer with at least one applicant in "pending" status

### Steps:
1. [ ] Go to employer dashboard → Applicants section
2. [ ] Click on an applicant with "pending" status
3. [ ] Change status to "viewed"
4. [ ] VERIFY: Status badge updates immediately to "Viewed"
5. [ ] VERIFY: Timeline/history shows the transition (pending → viewed) with timestamp
6. [ ] Change status to "shortlisted"
7. [ ] VERIFY: Badge updates, timeline shows new entry
8. [ ] Change status to "interview"
9. [ ] VERIFY: Badge updates, timeline grows
10. [ ] Change status to "offered"
11. [ ] VERIFY: Badge updates, timeline shows full progression
12. [ ] Change status to "hired"
13. [ ] VERIFY: Badge shows "Hired" with a success/green indicator
14. [ ] VERIFY: Timeline shows the complete lifecycle: pending → viewed → shortlisted → interview → offered → hired
15. [ ] Log out and login as the applicant (job seeker)
16. [ ] Go to `/profile` → Applications → click on the application
17. [ ] VERIFY: Current status is visible and matches what the employer set ("Hired")
18. [ ] VERIFY: Timeline or status history is visible to the applicant
19. [ ] VERIFY: Notification(s) received for status changes

### Edge cases:
- [ ] Try skipping a status (e.g., pending → offered directly) → should work (non-linear transitions are allowed)
- [ ] Change status to "rejected" → VERIFY: applicant sees appropriate message (not offensive, professional wording)
- [ ] Change from "rejected" back to "shortlisted" → VERIFY: transition allowed or appropriately restricted
- [ ] Check that each status change generates a notification for the applicant

---

## QA-28 — Employer Business Control
**Priority**: MEDIUM
**Estimated time**: 10 minutes (admin only)

### Pre-conditions:
- [ ] Logged in as admin

### Steps:
1. [ ] Go to admin panel → Business Control section
2. [ ] VERIFY: Business control page loads with pricing rules and campaigns sections
3. [ ] **Pricing Rules**:
   - [ ] View the pricing rules list
   - [ ] VERIFY: Each rule shows name, type, price, status
   - [ ] Click "Create New" / "Krijo"
   - [ ] Fill in the pricing rule details (name, type, price, description)
   - [ ] Save → VERIFY: new rule appears in the list
   - [ ] Click "Edit" on the new rule
   - [ ] Change the price → Save
   - [ ] VERIFY: Updated price is displayed
   - [ ] Toggle the rule active/inactive
   - [ ] VERIFY: Status badge updates (Active/Inactive)
4. [ ] **Campaigns**:
   - [ ] View campaigns section
   - [ ] Create a promotional campaign (name, dates, discount, description)
   - [ ] VERIFY: Campaign appears in the list
   - [ ] Activate the campaign → VERIFY: status shows "Active"
   - [ ] Pause the campaign → VERIFY: status shows "Paused"
5. [ ] **Analytics**:
   - [ ] View analytics dashboard
   - [ ] VERIFY: Data loads without errors, charts render properly
   - [ ] VERIFY: Numbers make sense (no negative values, totals add up)

### Edge cases:
- [ ] Create a pricing rule with negative price → should be rejected
- [ ] Create a campaign with end date before start date → should be rejected
- [ ] Try accessing business control as non-admin → should be forbidden (403)

---

## QA-29 — Reports & Moderation
**Priority**: HIGH
**Estimated time**: 15 minutes

### Pre-conditions:
- [ ] Logged in as a job seeker (for reporting)
- [ ] Admin account accessible (for moderation)
- [ ] At least one job or user profile exists to report

### Steps:
1. [ ] Login as job seeker
2. [ ] Go to a job detail page or user profile
3. [ ] Click "Report" / "Raporto" button
4. [ ] VERIFY: Report modal/form appears with reason options (spam, inappropriate, misleading, etc.)
5. [ ] Select a reason (e.g., "Spam")
6. [ ] Add a description explaining the issue
7. [ ] Submit the report
8. [ ] VERIFY: Success message shown (e.g., "Raporti u dërgua me sukses")
9. [ ] Try reporting the same content again
10. [ ] VERIFY: Shows "already reported" or prevents duplicate submission
11. [ ] Log out and login as admin
12. [ ] Go to admin panel → Reports section
13. [ ] VERIFY: The new report appears in the list with:
    - Reporter name/email
    - Reported content (job/user)
    - Reason selected
    - Description text
    - Date/time submitted
    - Status: "pending"
14. [ ] Click on the report to view full details
15. [ ] Take action: "Warn user"
16. [ ] VERIFY: Action recorded in the report history, report status updates
17. [ ] Take action on another report: "Suspend user"
18. [ ] VERIFY: Target user's status changes to suspended
19. [ ] VERIFY: Suspended user cannot log in or perform actions (test by trying to log in as that user)
20. [ ] Reopen a resolved report
21. [ ] VERIFY: Status changes back to "open" or "under review"

### Edge cases:
- [ ] Submit a report without selecting a reason → validation error
- [ ] Submit a report with empty description → should be accepted (description is optional) or show validation if required
- [ ] Submit a report with XSS in description → should be sanitized
- [ ] Try reporting your own content → should be prevented or allowed (check expected behavior)
- [ ] As a non-logged-in user, try to report → should prompt login

---

## QA-30 — Multi-Tab & Concurrent Behavior
**Priority**: MEDIUM
**Estimated time**: 10 minutes

### Pre-conditions:
- [ ] Two browser tabs open to the application
- [ ] At least one user account available

### Steps:
1. [ ] **Login sync across tabs**:
   - [ ] Tab 1: Go to `/login`, log in as a job seeker
   - [ ] Tab 2: Refresh or navigate to any page
   - [ ] VERIFY: Tab 2 detects the login (shows logged-in state) or shows login prompt (depends on implementation)
2. [ ] **Data consistency**:
   - [ ] Tab 1: Apply to a job
   - [ ] Tab 2: Navigate to `/profile` → Applications
   - [ ] VERIFY: The new application appears in Tab 2
3. [ ] **Logout sync**:
   - [ ] Tab 1: Click Logout
   - [ ] Tab 2: Try to perform any protected action (e.g., save a job, apply)
   - [ ] VERIFY: Tab 2 redirects to login or shows a re-login prompt (no stale actions succeed)
4. [ ] **Concurrent edits (employer)**:
   - [ ] Open two tabs, both logged in as the same employer
   - [ ] Tab 1: Go to edit a job, change the title
   - [ ] Tab 2: Go to edit the same job, change the description (before saving Tab 1)
   - [ ] Save Tab 1
   - [ ] Save Tab 2
   - [ ] VERIFY: No data loss — last write wins is acceptable, but both changes should not silently disappear
   - [ ] Tab 1: Refresh the job page
   - [ ] VERIFY: Shows the most recent saved data
5. [ ] **Token expiry simulation**:
   - [ ] Log in, then manually clear the auth token from Local Storage (DevTools)
   - [ ] Try to perform an action
   - [ ] VERIFY: Gracefully redirects to login, no white screen or crash

---

## Final Summary

After completing all sections:

| Section | Status | Issues Found |
|---------|--------|-------------|
| QA-01 Seeker Registration | ☐ Pass / ☐ Fail | |
| QA-02 Employer Registration | ☐ Pass / ☐ Fail | |
| QA-03 Login & Logout | ☐ Pass / ☐ Fail | |
| QA-04 Password Reset | ☐ Pass / ☐ Fail | |
| QA-05 Job Browsing & Search | ☐ Pass / ☐ Fail | |
| QA-06 Job Detail Page | ☐ Pass / ☐ Fail | |
| QA-07 Job Application | ☐ Pass / ☐ Fail | |
| QA-08 Saved Jobs | ☐ Pass / ☐ Fail | |
| QA-09 Seeker Profile | ☐ Pass / ☐ Fail | |
| QA-10 Employer Dashboard | ☐ Pass / ☐ Fail | |
| QA-11 Job Posting | ☐ Pass / ☐ Fail | |
| QA-12 Edit & Manage Jobs | ☐ Pass / ☐ Fail | |
| QA-13 Admin Dashboard | ☐ Pass / ☐ Fail | |
| QA-14 Notifications | ☐ Pass / ☐ Fail | |
| QA-15 Companies Page | ☐ Pass / ☐ Fail | |
| QA-16 Email Verification | ☐ Pass / ☐ Fail | |
| QA-17 Quick User Registration | ☐ Pass / ☐ Fail | |
| QA-18 Navigation & Layout | ☐ Pass / ☐ Fail | |
| QA-19 Responsive Design | ☐ Pass / ☐ Fail | |
| QA-20 Empty States | ☐ Pass / ☐ Fail | |
| QA-21 Error Handling | ☐ Pass / ☐ Fail | |
| QA-22 Browser Compatibility | ☐ Pass / ☐ Fail | |
| QA-23 Performance | ☐ Pass / ☐ Fail | |
| QA-24 Security | ☐ Pass / ☐ Fail | |
| QA-25 AI CV Generation | ☐ Pass / ☐ Fail | |
| QA-26 Application Messaging | ☐ Pass / ☐ Fail | |
| QA-27 Application Status Timeline | ☐ Pass / ☐ Fail | |
| QA-28 Employer Business Control | ☐ Pass / ☐ Fail | |
| QA-29 Reports & Moderation | ☐ Pass / ☐ Fail | |
| QA-30 Multi-Tab & Concurrent | ☐ Pass / ☐ Fail | |
