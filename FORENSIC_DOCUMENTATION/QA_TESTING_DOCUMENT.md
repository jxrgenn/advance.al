# ALBANIA JOBFLOW - QA TESTING DOCUMENT
## Complete Test Cases for All User Flows

**Document Version:** 1.0
**Date:** January 13, 2026
**Format:** DO THIS → PRESS THIS → SEE THIS

---

## HOW TO USE THIS DOCUMENT

1. Start from Test Case 1
2. Follow each step exactly
3. Verify the expected result ("SEE THIS")
4. If error occurs, note the **TEST CASE NUMBER** and **STEP NUMBER**
5. Report error with: "Error in **TC-1.2**" (Test Case 1, Step 2)
6. Continue to next test case

---

## TEST CASE 1: HOMEPAGE LOAD

**TC-1.1**
- DO: Open browser
- PRESS: Navigate to http://localhost:5173/
- SEE: Homepage loads with navigation bar at top

**TC-1.2**
- DO: Wait for page to fully load
- SEE: Job listings appear (10 jobs max)
- SEE: Three-column layout (filters left, jobs center, events right on desktop)
- SEE: Search bar at top
- SEE: Premium job carousel above heading (if no filters active)

**TC-1.3**
- DO: Scroll down
- SEE: Footer visible at bottom
- SEE: "Load more" or pagination if > 10 jobs

---

## TEST CASE 2: SEARCH FUNCTIONALITY

**TC-2.1**
- DO: Click in search bar
- PRESS: Type "d" (single character)
- SEE: No search triggered (minimum 2 characters)

**TC-2.2**
- DO: Keep typing
- PRESS: Type "de" (2 characters)
- SEE: Loading spinner appears after 300ms
- SEE: Search results update
- SEE: Count updates: "X rezultate për 'de'"

**TC-2.3**
- DO: Clear search
- PRESS: Backspace to delete all text
- SEE: All jobs shown again
- SEE: Premium carousel returns

**TC-2.4**
- DO: Search for non-existent term
- PRESS: Type "xyzabc123"
- SEE: Empty state appears
- SEE: Message: "Nuk u gjetën rezultate"
- SEE: "Pastro filtrat" button appears

---

## TEST CASE 3: LOCATION FILTER

**TC-3.1**
- DO: Click on "Qyteti" dropdown
- PRESS: Click dropdown
- SEE: List of cities appears
- SEE: "Të gjitha qytetet" option at top

**TC-3.2**
- DO: Select a city
- PRESS: Click "Tiranë"
- SEE: Dropdown shows "1 qytete"
- SEE: Jobs filtered to Tiranë only
- SEE: Blue badge appears: "Tiranë ×"

**TC-3.3**
- DO: Add another city
- PRESS: Click dropdown again, select "Durrës"
- SEE: Dropdown shows "2 qytete"
- SEE: Both badges appear: "Tiranë ×" and "Durrës ×"
- SEE: Jobs from both cities shown (OR logic)

**TC-3.4**
- DO: Remove one city
- PRESS: Click "×" on "Tiranë" badge
- SEE: Badge removed
- SEE: Only Durrës jobs shown
- SEE: Dropdown shows "1 qytete"

**TC-3.5**
- DO: Clear all
- PRESS: Click "Të gjitha qytetet" in dropdown
- SEE: All badges removed
- SEE: All jobs shown again

---

## TEST CASE 4: JOB TYPE FILTER

**TC-4.1**
- DO: Click "Lloji i punës" dropdown
- PRESS: Click dropdown
- SEE: List appears: Full-time, Part-time, Kontratë, Praktikë

**TC-4.2**
- DO: Select type
- PRESS: Click "Full-time"
- SEE: Dropdown shows "1 lloje"
- SEE: Green badge appears: "Full-time ×"
- SEE: Only full-time jobs shown

**TC-4.3**
- DO: Add another type
- PRESS: Click dropdown, select "Part-time"
- SEE: Dropdown shows "2 lloje"
- SEE: Both badges visible
- SEE: Full-time OR part-time jobs shown

**TC-4.4**
- DO: Remove filter
- PRESS: Click "×" on badge
- SEE: Badge removed
- SEE: Filter updated

---

## TEST CASE 5: CORE PLATFORM FILTERS

**TC-5.1**
- DO: Scroll to left sidebar (desktop) or filter section (mobile)
- SEE: Five filter buttons: Diaspora, Nga shtëpia, Part Time, Administrata, Sezonale

**TC-5.2**
- DO: Click Diaspora filter
- PRESS: Click "Diaspora" button
- SEE: Button becomes active/highlighted
- SEE: Orange badge appears: "Diaspora ×"
- SEE: Only diaspora jobs shown

**TC-5.3**
- DO: Add another filter
- PRESS: Click "Nga shtëpia"
- SEE: Both filters active
- SEE: Both badges visible
- SEE: Jobs matching BOTH filters shown (AND logic)

**TC-5.4**
- DO: Deactivate filter
- PRESS: Click active "Diaspora" button OR click "×" on badge
- SEE: Filter removed
- SEE: Badge removed
- SEE: Jobs update

---

## TEST CASE 6: ADVANCED FILTERS MODAL

**TC-6.1**
- DO: Click advanced filters button
- PRESS: Click "Filtro" button (with filter icon)
- SEE: Modal opens
- SEE: Title: "Filtrat e Avancuara"
- SEE: All filter sections visible

**TC-6.2 - Salary Filter**
- DO: Adjust salary range
- PRESS: Drag slider from 0 to 500
- SEE: Label updates: "Paga: 500 - 2000 EUR"

**TC-6.3 - Currency Change**
- DO: Change currency
- PRESS: Click currency dropdown, select "ALL"
- SEE: Label shows "ALL (L)"
- SEE: Salary label updates to show ALL

**TC-6.4 - Experience Level**
- DO: Select experience
- PRESS: Click dropdown, select "Senior (5+ vite)"
- SEE: Value selected in dropdown

**TC-6.5 - Company Search**
- DO: Type company name
- PRESS: Type "Google" in company field
- SEE: Text appears in field

**TC-6.6 - Categories**
- DO: Select categories
- PRESS: Click checkboxes for "Teknologji" and "Marketing"
- SEE: Both checkboxes checked
- SEE: Active filters summary appears at bottom

**TC-6.7 - Remote Work**
- DO: Enable remote
- PRESS: Click "Përfshi vetëm punët në distancë" checkbox
- SEE: Checkbox checked
- SEE: Appears in active filters summary

**TC-6.8 - Posted Within**
- DO: Select timeframe
- PRESS: Click dropdown, select "Javën e fundit"
- SEE: Value selected

**TC-6.9 - Sort By**
- DO: Change sorting
- PRESS: Click dropdown, select "Paga (nga më e larta)"
- SEE: Value selected

**TC-6.10 - Apply Filters**
- DO: Apply all filters
- PRESS: Click "Apliko filtrat" button
- SEE: Modal closes
- SEE: Jobs update based on filters
- SEE: Toast notification: "Filtrat u aplikuan"

**TC-6.11 - Reset Filters**
- DO: Open modal again
- PRESS: Click "Rivendos të gjitha" button
- SEE: All filters reset to default
- SEE: All jobs shown
- SEE: Toast: "Filtrat u rivendosën"

**TC-6.12 - Cancel**
- DO: Open modal, change filters
- PRESS: Click "Anulo" button
- SEE: Modal closes
- SEE: No changes applied

---

## TEST CASE 7: JOB CARD INTERACTION

**TC-7.1**
- DO: View job card
- SEE: Job title, company name, location, salary (if public), job type, posted date, tags

**TC-7.2**
- DO: Click job card
- PRESS: Click anywhere on job card
- SEE: Navigate to job detail page `/jobs/:id`

**TC-7.3**
- DO: View job details
- SEE: Full job description, requirements, benefits, company info sidebar
- SEE: "Apliko Tani" button
- SEE: "Ruaj Punën" button (if logged in)
- SEE: "Ndaj" button

---

## TEST CASE 8: PAGINATION

**TC-8.1**
- DO: Scroll to bottom of job list
- SEE: Pagination controls if > 10 jobs
- SEE: "Mëparshmi" button (disabled on page 1)
- SEE: Page numbers (1, 2, 3, 4, 5)
- SEE: "Tjetri" button

**TC-8.2**
- DO: Go to next page
- PRESS: Click "Tjetri" or page number "2"
- SEE: Page scrolls to top smoothly
- SEE: Next 10 jobs loaded
- SEE: Page 2 button highlighted
- SEE: "Mëparshmi" button now enabled

**TC-8.3**
- DO: Go back
- PRESS: Click "Mëparshmi"
- SEE: Back to page 1
- SEE: First 10 jobs shown

---

## TEST CASE 9: REGISTER AS JOBSEEKER (FULL ACCOUNT)

**TC-9.1**
- DO: Start registration
- PRESS: Click "Hyrje" button (top-right)
- SEE: Login page loads

**TC-9.2**
- DO: Switch to register
- PRESS: Click "Regjistrohu" tab
- SEE: Registration form appears
- SEE: User type selector (Punëkërkues/Punëdhënës)
- SEE: "Punëkërkues" selected by default

**TC-9.3**
- DO: Fill registration form
- PRESS: Enter valid email (e.g., "test@example.com")
- PRESS: Enter password (min 6 chars, e.g., "password123")
- PRESS: Enter first name (e.g., "Alban")
- PRESS: Enter last name (e.g., "Testi")
- PRESS: Enter phone (e.g., "+355691234567")
- PRESS: Select city from dropdown (e.g., "Tiranë")
- SEE: Region auto-fills

**TC-9.4**
- DO: Submit registration
- PRESS: Click "Regjistrohu" button
- SEE: Loading state appears
- SEE: Success redirect to homepage or profile page
- SEE: Logged in (user menu appears top-right)

**TC-9.5**
- DO: Verify account status
- SEE: Status: active immediately (no verification needed for jobseekers)

---

## TEST CASE 10: REGISTER AS EMPLOYER

**TC-10.1**
- DO: Start employer registration
- PRESS: Navigate to /employers page OR click "Posto Punë" button
- SEE: Employer registration form

**TC-10.2**
- DO: Fill account details (Step 1)
- PRESS: Enter email
- PRESS: Enter password
- PRESS: Enter first name
- PRESS: Enter last name
- PRESS: Click "Vazhdo"
- SEE: Next step loads

**TC-10.3**
- DO: Fill company details (Step 2)
- PRESS: Enter company name (required)
- PRESS: Select industry (required)
- PRESS: Select company size (required)
- PRESS: Enter description (optional)
- PRESS: Enter website (optional)
- PRESS: Select city
- SEE: Region auto-fills
- PRESS: Click "Vazhdo"
- SEE: Next step loads

**TC-10.4**
- DO: Fill contact preferences (Step 3)
- PRESS: Enter phone (optional)
- PRESS: Enter WhatsApp (optional)
- PRESS: Enable/disable contact methods
- PRESS: Click "Regjistrohu"
- SEE: Loading state
- SEE: Success message
- SEE: Redirect to employer dashboard

**TC-10.5**
- DO: Check status
- SEE: Status: "pending_verification"
- SEE: Message: "Llogaria juaj është në proces verifikimi..."
- SEE: Cannot post jobs yet (button disabled or shows message)

---

## TEST CASE 11: LOGIN

**TC-11.1**
- DO: Go to login page
- PRESS: Click "Hyrje" button OR navigate to /login
- SEE: Login form with "Hyr" tab active

**TC-11.2**
- DO: Login with valid credentials
- PRESS: Enter registered email
- PRESS: Enter correct password
- PRESS: Click "Hyr" button
- SEE: Loading state
- SEE: Redirect to homepage
- SEE: Logged in (user menu appears)
- SEE: Notifications bell icon appears

**TC-11.3**
- DO: Login with invalid credentials
- PRESS: Enter email
- PRESS: Enter wrong password
- PRESS: Click "Hyr"
- SEE: Error toast: "Email ose fjalëkalimi i gabuar" OR similar
- SEE: Stay on login page

**TC-11.4**
- DO: Login with suspended account
- PRESS: Use suspended user credentials
- PRESS: Click "Hyr"
- SEE: Error message: "Llogaria juaj është pezulluar deri më {date}. Arsyeja: {reason}"
- SEE: Cannot login

---

## TEST CASE 12: LOGOUT

**TC-12.1**
- DO: Open user menu
- PRESS: Click user dropdown (top-right, shows name/email)
- SEE: Dropdown menu opens
- SEE: Options: Profili Im, Aplikimet, Punët e Ruajtura, Cilësimet, Dil

**TC-12.2**
- DO: Logout
- PRESS: Click "Dil" option
- SEE: Logged out
- SEE: Redirect to homepage
- SEE: "Hyrje" button appears (not logged in)
- SEE: User menu gone

---

## TEST CASE 13: JOBSEEKER - COMPLETE PROFILE

**TC-13.1**
- DO: Navigate to profile
- PRESS: Click user dropdown → "Profili Im"
- SEE: Profile page loads with tabs

**TC-13.2 - Personal Info Tab**
- DO: Fill personal info
- PRESS: Enter/update first name
- PRESS: Enter/update last name
- PRESS: Enter/update phone
- PRESS: Select city
- SEE: Region auto-fills
- PRESS: Click "Ruaj Ndryshimet"
- SEE: Toast: "Profilet u përditësua"

**TC-13.3 - Professional Info Tab**
- DO: Switch to Professional tab
- PRESS: Click "Informacioni Profesional" tab
- SEE: Professional fields visible

**TC-13.4**
- DO: Fill professional info
- PRESS: Enter job title (e.g., "Software Developer")
- PRESS: Enter bio (500 chars max)
- PRESS: Select experience level (e.g., "2-5 vjet")
- PRESS: Enter skills (comma-separated, e.g., "JavaScript, React, Node.js")
- PRESS: Enter desired salary min (e.g., 800)
- PRESS: Enter desired salary max (e.g., 1500)
- PRESS: Select currency (EUR)
- PRESS: Toggle "Open to Remote Work" (optional)
- PRESS: Select availability (e.g., "Immediately")
- PRESS: Click "Ruaj Ndryshimet"
- SEE: Toast: Success message

**TC-13.5 - Work History Tab**
- DO: Add work experience
- PRESS: Click "Historiku i Punës" tab
- PRESS: Click "Shto Përvojë" button
- SEE: Empty work experience form appears

**TC-13.6**
- DO: Fill work experience
- PRESS: Enter company name
- PRESS: Enter position/title
- PRESS: Select start date (month/year)
- PRESS: Select end date OR check "Still working here"
- PRESS: Enter description (500 chars)
- PRESS: Click "Ruaj" or save button
- SEE: Work experience added to list

**TC-13.7**
- DO: Remove work experience
- PRESS: Click delete/remove button (X or trash icon)
- SEE: Confirmation dialog (optional)
- PRESS: Confirm
- SEE: Work experience removed

**TC-13.8 - Education Tab**
- DO: Add education
- PRESS: Click "Arsimi" tab
- PRESS: Click "Shto Arsim" button
- SEE: Education form appears

**TC-13.9**
- DO: Fill education
- PRESS: Enter degree/certification name
- PRESS: Enter school/institution
- PRESS: Enter graduation year
- PRESS: Click "Ruaj"
- SEE: Education added

**TC-13.10 - CV/Resume Tab**
- DO: Upload CV
- PRESS: Click "CV/Resume" tab
- PRESS: Click "Ngarko CV" or upload button
- PRESS: Select file (PDF, DOC, or DOCX, max 5MB)
- SEE: File upload progress
- SEE: CV uploaded message
- SEE: Download button appears

**TC-13.11**
- DO: Download CV
- PRESS: Click "Shkarko CV" button
- SEE: CV file downloads

---

## TEST CASE 14: JOBSEEKER - APPLY TO JOB (ONE-CLICK)

**TC-14.1**
- DO: Find job to apply
- PRESS: Navigate to job detail page `/jobs/:id`
- SEE: "Apliko Tani" button visible

**TC-14.2**
- DO: Apply with one-click
- PRESS: Click "Apliko Tani" button
- SEE: Loading state (if profile complete)
- SEE: Success toast: "Aplikimi u dërgua!"

**TC-14.3**
- DO: Try to apply again
- PRESS: Refresh page, click "Apliko Tani" again
- SEE: Error toast: "Ju keni aplikuar tashmë për këtë punë" OR button disabled

**TC-14.4**
- DO: Apply without complete profile
- PRESS: Click "Apliko Tani" with incomplete profile
- SEE: Error toast: "Profili duhet të jetë i plotë" OR similar
- SEE: Redirect to profile page OR modal with instructions

---

## TEST CASE 15: JOBSEEKER - APPLY TO JOB (CUSTOM FORM)

**TC-15.1**
- DO: Find job with custom application
- PRESS: Click job that has custom questions
- PRESS: Click "Apliko Tani"
- SEE: Modal opens with custom application form

**TC-15.2**
- DO: Fill custom form
- PRESS: Enter cover letter (if field exists)
- PRESS: Answer custom questions (text fields)
- PRESS: Upload additional files (if allowed)
- PRESS: Click "Dërgo Aplikimin"
- SEE: Loading state
- SEE: Success toast
- SEE: Modal closes

---

## TEST CASE 16: JOBSEEKER - SAVE JOBS

**TC-16.1**
- DO: Save a job
- PRESS: Click bookmark icon on job card OR "Ruaj Punën" button on detail page
- SEE: Icon fills/becomes solid
- SEE: Toast: "Puna u ruajt"

**TC-16.2**
- DO: View saved jobs
- PRESS: Click user dropdown → "Punët e Ruajtura"
- SEE: Saved jobs page loads
- SEE: List of all saved jobs

**TC-16.3**
- DO: Remove from saved
- PRESS: Click filled bookmark icon OR "×" button
- SEE: Icon empties
- SEE: Job removed from list
- SEE: Toast: "Puna u hoq nga të ruajtura"

---

## TEST CASE 17: JOBSEEKER - VIEW APPLICATIONS

**TC-17.1**
- DO: Go to applications
- PRESS: Click user dropdown → "Aplikimet" OR navigate to /profile?tab=applications
- SEE: Applications page loads
- SEE: List of all applications

**TC-17.2**
- DO: View application details
- SEE: Each application shows:
  - Job title (clickable)
  - Company name
  - Applied date
  - Status badge (Pending/Viewed/Shortlisted/Rejected/Hired)
  - "Shiko Detajet" button
  - "Tërheq Aplikimin" button (if allowed)

**TC-17.3**
- DO: View full application
- PRESS: Click "Shiko Detajet" button
- SEE: Application detail modal opens
- SEE: Three tabs: Informacioni, Aplikimi, Mesazhet

**TC-17.4 - Information Tab**
- DO: View your info
- PRESS: Click "Informacioni" tab (active by default)
- SEE: Your profile data shown to employer
- SEE: Personal info, professional info, education, work history

**TC-17.5 - Application Tab**
- DO: View application details
- PRESS: Click "Aplikimi" tab
- SEE: Application date
- SEE: Application method (one-click or custom form)
- SEE: Cover letter (if provided)
- SEE: Custom answers (if provided)
- SEE: Additional files (if uploaded)

**TC-17.6 - Messages Tab**
- DO: View messages
- PRESS: Click "Mesazhet" tab
- SEE: Conversation thread with employer
- SEE: Message input field at bottom
- SEE: "Dërgo" button

**TC-17.7**
- DO: Send message
- PRESS: Type message in field
- PRESS: Click "Dërgo"
- SEE: Message sent
- SEE: Appears in thread
- SEE: Timestamp shown

**TC-17.8**
- DO: Withdraw application
- PRESS: Click "Tërheq Aplikimin" button
- SEE: Confirmation dialog: "Jeni të sigurt?"
- PRESS: Confirm
- SEE: Application marked as withdrawn
- SEE: Toast: "Aplikimi u tërhoq"
- SEE: Cannot withdraw if status is "Hired"

---

## TEST CASE 18: JOBSEEKER - JOB RECOMMENDATIONS

**TC-18.1**
- DO: Have complete profile
- SEE: Ensure profile has title, skills, experience, location

**TC-18.2**
- DO: View recommendations
- PRESS: Go to homepage
- SEE: Jobs with "✨ Recommended for You" badge at top of list
- SEE: Mixed with regular jobs

**TC-18.3**
- DO: Understand recommendations
- SEE: Recommended jobs match your profile (title, skills, location, salary)
- SEE: Higher match percentage shows first

---

## TEST CASE 19: QUICK USER REGISTRATION

**TC-19.1**
- DO: Go to quick registration
- PRESS: Navigate to /jobseekers page
- SEE: Quick profile form

**TC-19.2**
- DO: Fill quick form
- PRESS: Enter first name
- PRESS: Enter last name
- PRESS: Enter email
- PRESS: Enter phone (optional)
- PRESS: Select city
- PRESS: Select interests (checkboxes, multiple allowed)
- PRESS: Enter custom interests (optional, comma-separated)
- PRESS: Click "Regjistrohu"
- SEE: Loading state
- SEE: Success message
- SEE: Toast: "Mirë se vini! Do të merrni njoftime për punë të reja."

**TC-19.3**
- DO: Verify account
- SEE: Quick user account created (NOT full account)
- SEE: Cannot login (no password set)
- SEE: Will receive email job alerts only

---

## TEST CASE 20: EMPLOYER - POST JOB

**TC-20.1 - Prerequisites**
- DO: Ensure logged in as verified employer
- SEE: Status: active, verified: true

**TC-20.2**
- DO: Start posting
- PRESS: Click "Posto Punë" button in navigation OR dashboard → "Posto Punë të Re"
- SEE: Post job page loads
- SEE: Two-column layout: Benefits (left), Form (right)
- SEE: 4-step form indicator

**TC-20.3 - Step 0: Basic Information**
- DO: Fill basic info
- PRESS: Enter job title (e.g., "Full Stack Developer")
- PRESS: Enter job description (textarea, min 20 chars)
- PRESS: Select category (dropdown: Teknologji, Marketing, etc.)
- PRESS: Select job type (Full-time, Part-time, Contract, Internship, Remote)
- PRESS: Select experience level (optional: Entry, Junior, Mid, Senior, Lead)
- PRESS: Click "Vazhdo"
- SEE: Form validation passes
- SEE: Step 1 loads

**TC-20.4**
- DO: Try to proceed with empty required fields
- PRESS: Leave title empty, click "Vazhdo"
- SEE: Error message: "Title is required" OR field highlighted red
- SEE: Cannot proceed

**TC-20.5 - Step 1: Location**
- DO: Fill location
- SEE: City pre-filled from company profile
- PRESS: Change city if needed
- SEE: Region auto-updates
- PRESS: Click "Vazhdo"
- SEE: Step 2 loads

**TC-20.6 - Step 2: Salary (Optional)**
- DO: Toggle salary period
- PRESS: Click "Mujore" / "Vjetore" toggle
- SEE: Placeholders change (800/1200 for monthly, 10000/15000 for yearly)

**TC-20.7**
- DO: Enter salary
- PRESS: Enter min salary (e.g., 1000)
- PRESS: Enter max salary (e.g., 1500)
- PRESS: Select currency (EUR/USD/ALL)
- PRESS: Click "Vazhdo"
- SEE: Step 3 loads
- SEE: If monthly selected, values multiplied by 12 internally

**TC-20.8**
- DO: Skip salary
- PRESS: Click "Vazhdo" without entering salary
- SEE: No error (salary is optional)
- SEE: Step 3 loads

**TC-20.9 - Step 3: Requirements and Benefits**
- DO: Add requirements
- PRESS: Enter first requirement (e.g., "2+ years experience with React")
- PRESS: Click "Shto Kërkesë" button
- SEE: New empty requirement field appears
- PRESS: Enter second requirement
- SEE: Multiple requirements added

**TC-20.10**
- DO: Remove requirement
- PRESS: Click "×" button on requirement field
- SEE: Field removed

**TC-20.11**
- DO: Add benefits
- PRESS: Enter benefit (e.g., "Health insurance")
- PRESS: Click "Shto Përfitim"
- SEE: New benefit field appears
- PRESS: Fill multiple benefits

**TC-20.12**
- DO: Add tags
- PRESS: Enter tags (e.g., "JavaScript", "React", "MongoDB")
- PRESS: Click "Shto Tag" for more
- SEE: Multiple tag fields

**TC-20.13**
- DO: Select platform categories
- PRESS: Click checkboxes for relevant categories:
  - Diaspora (if for Albanians abroad)
  - Nga shtëpia (if remote)
  - Part Time (if part-time)
  - Administrata (if government)
  - Sezonale (if ≤3 months)
- SEE: Checkboxes checked

**TC-20.14**
- DO: Submit job
- PRESS: Click "Posto Punën" button
- SEE: Loading state: "Duke postuar..."
- SEE: Price calculation happens (backend)
- SEE: Job created

**TC-20.15**
- DO: Check result
- SEE: Success toast: "Puna u postua me sukses!"
- SEE: Form resets
- SEE: Wait 2 seconds
- SEE: Redirect to /employer-dashboard
- SEE: New job appears in jobs list

**TC-20.16**
- DO: Verify job status
- SEE: If price = €0 (whitelisted or free): Status = "active" (live immediately)
- SEE: If price > €0: Status = "pending_payment" (needs payment)

---

## TEST CASE 21: EMPLOYER - DASHBOARD OVERVIEW

**TC-21.1**
- DO: View dashboard
- PRESS: Navigate to /employer-dashboard (automatic after login)
- SEE: Dashboard page loads

**TC-21.2**
- DO: View stats cards
- SEE: Four cards at top:
  - Active Jobs count (blue)
  - Total Applicants count (green)
  - Monthly Views count (purple)
  - Growth percentage (orange)

**TC-21.3**
- DO: View tabs
- SEE: Three tabs: "Punët e Mia", "Aplikuesit", "Cilësimet"
- SEE: "Punët e Mia" tab active by default

---

## TEST CASE 22: EMPLOYER - MANAGE JOBS

**TC-22.1 - View Jobs List**
- DO: View jobs
- SEE: Tab "Punët e Mia" active
- SEE: List of your jobs (5 per page)
- SEE: "Shiko më shumë" button if > 5 jobs

**TC-22.2**
- DO: View job card details
- SEE: Each job shows:
  - Title
  - Status badge (Active/Paused/Closed/Expired/Pending Payment)
  - Location
  - Job type
  - Posted date
  - Salary (if public)
  - View count
  - Applicant count
  - "Kandidatë (X)" button
  - Actions dropdown (⋮)

**TC-22.3**
- DO: View applicants for job
- PRESS: Click "Kandidatë (X)" button
- SEE: Switch to "Aplikuesit" tab
- SEE: Filtered to show only that job's applications

**TC-22.4**
- DO: Open job actions
- PRESS: Click actions dropdown (⋮ icon)
- SEE: Menu appears:
  - View Details (eye icon)
  - Edit (edit icon)
  - Separator line
  - Pause/Aktivizo (based on current status)
  - Separator line
  - Fshi (delete, red text)

**TC-22.5**
- DO: View job details
- PRESS: Click "View Details" in dropdown
- SEE: Navigate to public job page `/jobs/:id`

**TC-22.6**
- DO: Edit job
- PRESS: Click "Edit" in dropdown
- SEE: Navigate to `/edit-job/:id`
- SEE: Form pre-filled with current job data

**TC-22.7**
- DO: Pause job
- PRESS: Click "Pauzë" option (if job is active)
- SEE: Loading indicator
- SEE: Status changes to "paused" (yellow badge)
- SEE: Toast: "Puna u pauzua"
- SEE: Job hidden from public search

**TC-22.8**
- DO: Activate paused job
- PRESS: Click "Aktivizo" option (if job is paused)
- SEE: Status changes to "active" (green badge)
- SEE: Toast: "Puna u aktivizua"
- SEE: Job visible in public search again

**TC-22.9**
- DO: Delete job
- PRESS: Click "Fshi" option (red)
- SEE: Confirmation dialog: "Jeni të sigurt? Ky veprim nuk mund të kthehet."
- PRESS: Click "Konfirmo" or "Po"
- SEE: Job soft-deleted (isDeleted: true, status: closed)
- SEE: Job removed from list
- SEE: Toast: "Puna u fshi"
- SEE: Applications preserved (not deleted)

**TC-22.10**
- DO: Load more jobs
- PRESS: Click "Shiko më shumë" button (if visible)
- SEE: Next 5 jobs load and append to list

---

## TEST CASE 23: EMPLOYER - MANAGE APPLICANTS

**TC-23.1**
- DO: Switch to applicants tab
- PRESS: Click "Aplikuesit" tab
- SEE: Applicants tab active
- SEE: List of all applications across all jobs

**TC-23.2**
- DO: Use job filter
- PRESS: Click "Filtro sipas punës" dropdown
- SEE: Dropdown opens
- SEE: Options: "Të gjitha punët" + list of your jobs
- PRESS: Select specific job
- SEE: List filtered to show only that job's applications

**TC-23.3**
- DO: View application card
- SEE: Each application shows:
  - Applicant name
  - Job title with briefcase icon
  - Applied date
  - Application method (one-click or custom form)
  - Status dropdown (current status as badge)
  - "Shiko Detajet" button
  - "Shkarko CV" button (if CV uploaded)
  - "Kontakto" dropdown
  - "Raporto" button

**TC-23.4**
- DO: Change application status
- PRESS: Click status dropdown badge
- SEE: Status options appear:
  - Në pritje (Pending - yellow)
  - Parë (Viewed - blue)
  - Në listë të shkurtër (Shortlisted - green)
  - Refuzuar (Rejected - red)
  - Punësuar (Hired - purple)
- PRESS: Select "Parë"
- SEE: Status updates immediately
- SEE: Badge color changes
- SEE: Toast: "Statusi u përditësua"
- SEE: Applicant receives notification (backend)

**TC-23.5**
- DO: View application details
- PRESS: Click "Shiko Detajet" button
- SEE: Modal opens full-screen
- SEE: Three tabs: Informacioni, Aplikimi, Mesazhet

**TC-23.6 - Information Tab**
- DO: View applicant info
- SEE: Applicant's profile data:
  - Name, email, phone, location
  - Job title, bio, experience level
  - Skills (as badges)
  - Desired salary
  - Education history
  - Work history

**TC-23.7 - Application Tab**
- DO: View application details
- PRESS: Click "Aplikimi" tab
- SEE: Application date and time
- SEE: Application method
- SEE: Cover letter (if provided)
- SEE: Custom question answers (if custom form)
- SEE: Additional files with download buttons

**TC-23.8 - Messages Tab**
- DO: View conversation
- PRESS: Click "Mesazhet" tab
- SEE: Message thread (if any messages exist)
- SEE: Unread messages highlighted
- SEE: Message input field at bottom
- SEE: Message type selector:
  - text (regular)
  - interview_invite
  - offer
  - rejection

**TC-23.9**
- DO: Send message
- PRESS: Type message in textarea
- PRESS: Select message type (e.g., "interview_invite")
- PRESS: Click "Dërgo"
- SEE: Message sent
- SEE: Appears in thread immediately
- SEE: Applicant receives notification
- SEE: Template formatting applied (if interview/offer/rejection)

**TC-23.10**
- DO: Download CV
- PRESS: Click "Shkarko CV" button on application card
- SEE: CV file downloads to your computer

**TC-23.11**
- DO: Contact applicant
- PRESS: Click "Kontakto" dropdown
- SEE: Three options:
  - Dërgo Email (email icon)
  - Telefono (phone icon)
  - WhatsApp (message icon)

**TC-23.12**
- DO: Contact via email
- PRESS: Click "Dërgo Email"
- SEE: Contact modal opens
- SEE: Pre-filled email template:
  - Subject: "Regarding your application for {jobTitle}"
  - Body: Editable template with greeting and signature
  - Applicant's email shown
- PRESS: Edit message (optional)
- PRESS: Click "Dërgo Email"
- SEE: Default email client opens with pre-filled mailto: link

**TC-23.13**
- DO: Contact via phone
- PRESS: Click "Telefono"
- SEE: Contact modal with phone number
- PRESS: Click "Call {phone}" button
- SEE: tel: link opens (triggers phone call on mobile)

**TC-23.14**
- DO: Contact via WhatsApp
- PRESS: Click "WhatsApp"
- SEE: Contact modal
- SEE: Pre-filled WhatsApp message template
- PRESS: Edit message (optional)
- PRESS: Click "Hap WhatsApp"
- SEE: WhatsApp opens with pre-filled message (whatsapp://send link)

**TC-23.15**
- DO: Report applicant
- PRESS: Click "Raporto" button
- SEE: Report modal opens
- SEE: Category dropdown
- SEE: Description textarea
- SEE: Evidence upload (optional)
- PRESS: Select category (e.g., "Fake CV")
- PRESS: Enter description
- PRESS: Click "Dërgo Raportin"
- SEE: Toast: "Raporti u dërgua. Do të shqyrtohet nga administratori."

**TC-23.16**
- DO: Load more applications
- PRESS: Click "Shiko më shumë" button (if > 5 applications)
- SEE: Next 5 applications load

---

## TEST CASE 24: EMPLOYER - UPDATE COMPANY PROFILE

**TC-24.1**
- DO: Go to settings
- PRESS: Click "Cilësimet" tab in dashboard
- SEE: Settings tab active
- SEE: Company profile edit form

**TC-24.2**
- DO: Update company info
- PRESS: Change company name (required field)
- PRESS: Update description (1000 chars max)
- PRESS: Change website URL
- PRESS: Change industry (dropdown)
- PRESS: Change company size (dropdown)
- PRESS: Change city
- SEE: Region auto-updates

**TC-24.3**
- DO: Upload logo
- PRESS: Click logo upload area
- PRESS: Select image file (PNG, JPG)
- SEE: Image preview appears
- SEE: File uploaded

**TC-24.4**
- DO: Save changes
- PRESS: Click "Ruaj Ndryshimet" button
- SEE: Loading state: "Duke ruajtur..."
- SEE: Toast: "Profili u përditësua me sukses"
- SEE: Changes reflected everywhere (company profile page, job listings)

**TC-24.5**
- DO: Cancel changes
- PRESS: Make changes, then click "Anulo"
- SEE: Form resets to original saved values
- SEE: No changes saved

---

## TEST CASE 25: EMPLOYER - CANDIDATE MATCHING (PREMIUM FEATURE)

**TC-25.1 - Prerequisites**
- DO: Ensure employer has candidateMatchingEnabled: true OR be willing to purchase

**TC-25.2**
- DO: Access candidate matching
- PRESS: Go to "Punët e Mia" tab
- SEE: "Kandidatë të Përshtatshëm" button on job cards (if feature enabled)

**TC-25.3**
- DO: Open matching for job
- PRESS: Click "Kandidatë të Përshtatshëm" button
- SEE: Matching modal opens
- SEE: Title: "Kandidatë të Përshtatshëm"
- SEE: Subtitle: Job title

**TC-25.4 - Without Access**
- DO: View upsell (if no access to this job)
- SEE: Upsell message:
  - Benefits of matching system
  - "Algoritëm i avancuar matching"
  - "Kandidatë të verifikuar"
  - "Detaje të plota të profilit"
- SEE: Price shown
- SEE: "Blej Qasje (€X)" button

**TC-25.5**
- DO: Purchase access
- PRESS: Click "Blej Qasje" button
- SEE: Loading state
- SEE: Payment processed (currently mocked - always succeeds)
- SEE: Access granted
- SEE: Toast: "Qasja u blerë me sukses!"
- SEE: Candidate matches appear

**TC-25.6 - With Access**
- DO: View matched candidates
- SEE: Loading spinner while fetching
- SEE: List of matched candidates sorted by score (highest first)

**TC-25.7**
- DO: View match card
- SEE: Each candidate shows:
  - Name
  - Match score (large percentage, e.g., "87%")
  - Color-coded: Green (≥80%), Yellow (60-79%), Red (<60%)
  - Match breakdown (7 factors with progress bars):
    - Title Match (X/20)
    - Skills Match (X/25)
    - Experience Match (X/15)
    - Location Match (X/15)
    - Education Match (X/5)
    - Salary Match (X/10)
    - Availability Match (X/10)
  - Profile preview: Title, bio (truncated), top 3 skills, location
  - "Shiko Profilin" button
  - "Kontakto" button
  - "Shëno si të kontaktuar" button

**TC-25.8**
- DO: View full profile
- PRESS: Click "Shiko Profilin" button
- SEE: Profile modal opens
- SEE: Complete jobseeker profile data
- SEE: All work history, education, skills

**TC-25.9**
- DO: Contact matched candidate
- PRESS: Click "Kontakto" button
- SEE: Contact modal opens (same as applicant contact)
- SEE: Email/Phone/WhatsApp options

**TC-25.10**
- DO: Mark as contacted
- PRESS: Click "Shëno si të kontaktuar" button
- SEE: Button changes state
- SEE: Tracked in backend (contacted: true, contactedAt: timestamp, contactMethod)
- SEE: Helps you remember who you've contacted

**TC-25.11**
- DO: Handle empty matches
- SEE: If no matches found:
  - Icon: Users group (muted)
  - Message: "Nuk u gjetën kandidatë të përshtatshëm"
  - Description: "Provo të ndryshosh kërkesat e punës"

---

## TEST CASE 26: ADMIN - LOGIN AND DASHBOARD

**TC-26.1**
- DO: Login as admin
- PRESS: Use admin credentials at /login
- SEE: Redirect to /admin-dashboard

**TC-26.2**
- DO: View admin dashboard
- SEE: Admin interface with multiple sections
- SEE: Stats cards (users, jobs, applications, revenue)
- SEE: Navigation to admin features:
  - User Management
  - Job Management
  - Reports & Moderation
  - Business Controls
  - Analytics
  - System Configuration

---

## TEST CASE 27: ADMIN - USER MANAGEMENT

**TC-27.1**
- DO: View users
- PRESS: Navigate to admin dashboard → Users section
- SEE: List of all users with filters

**TC-27.2**
- DO: Filter users
- PRESS: Select user type filter (Jobseekers/Employers/Admins)
- PRESS: Select status filter (Active/Pending/Suspended/Banned)
- SEE: User list updates

**TC-27.3**
- DO: Verify employer
- PRESS: Find employer with status "pending_verification"
- PRESS: Click "Verify" or "Aprovo" button
- SEE: Confirmation dialog
- PRESS: Confirm
- SEE: User status changes to "active"
- SEE: verified: true set
- SEE: Employer receives email notification
- SEE: Toast: "Punëdhënësi u verifikua"

**TC-27.4**
- DO: Suspend user
- PRESS: Click "Manage" on user row
- PRESS: Select "Suspend" action
- SEE: Suspension form appears:
  - Duration (days) input
  - Reason textarea (required)
- PRESS: Enter duration (e.g., 7)
- PRESS: Enter reason (e.g., "Spam behavior")
- PRESS: Click "Confirm"
- SEE: User status changes to "suspended"
- SEE: suspensionDetails populated:
  - reason, suspendedAt, expiresAt, suspendedBy
- SEE: User receives email notification
- SEE: Toast: "Përdoruesi u pezullua"

**TC-27.5**
- DO: Ban user permanently
- PRESS: Select "Permanent Ban" action
- SEE: Ban form with reason field
- PRESS: Enter reason
- PRESS: Confirm
- SEE: User status changes to "banned"
- SEE: expiresAt: null (permanent)
- SEE: User receives email
- SEE: User cannot login

**TC-27.6**
- DO: Delete user
- PRESS: Select "Delete Account" action
- SEE: Confirmation dialog (severe warning)
- PRESS: Type confirmation text (if required)
- PRESS: Confirm
- SEE: User soft-deleted (isDeleted: true, status: 'deleted')
- SEE: User receives notification
- SEE: User data anonymized after 30 days

---

## TEST CASE 28: ADMIN - JOB MANAGEMENT

**TC-28.1**
- DO: View jobs
- PRESS: Navigate to Jobs section in admin dashboard
- SEE: List of all jobs (all employers)

**TC-28.2**
- DO: Filter jobs
- PRESS: Filter by status (Active/Paused/Closed/Expired/Pending Payment)
- PRESS: Filter by date range
- PRESS: Search by company or title
- SEE: Jobs list updates

**TC-28.3**
- DO: Feature job as premium
- PRESS: Find job, click "Manage"
- PRESS: Select "Feature Job" option
- SEE: Job tier changes to "premium"
- SEE: Job appears in premium carousel
- SEE: Job sorted first in search results
- SEE: Toast: "Puna u shënua si premium"

**TC-28.4**
- DO: Remove job (admin delete)
- PRESS: Select "Delete Job" action
- SEE: Confirmation dialog
- PRESS: Enter reason
- PRESS: Confirm
- SEE: Job soft-deleted
- SEE: Employer notified
- SEE: Job hidden from public search

---

## TEST CASE 29: ADMIN - REPORTS & MODERATION

**TC-29.1**
- DO: View reports
- PRESS: Navigate to Reports section
- SEE: List of all user reports

**TC-29.2**
- DO: Filter reports
- PRESS: Filter by status (Pending/Under Review/Resolved)
- PRESS: Filter by category (Fake CV, Spam, Harassment, etc.)
- PRESS: Filter by priority (if exists)
- SEE: Reports list updates

**TC-29.3**
- DO: Review report
- PRESS: Click on report to open details
- SEE: Report details modal:
  - Reported user info
  - Reporting user info
  - Category
  - Description
  - Evidence files (if uploaded)
  - Date submitted

**TC-29.4**
- DO: Take action - Warning
- PRESS: Select "Send Warning" action
- PRESS: Enter reason/message
- PRESS: Confirm
- SEE: Warning email sent to reported user
- SEE: Report status: "resolved"
- SEE: Resolution action: "warning"
- SEE: Reporter notified
- SEE: Toast: "Paralajmërim u dërgua"

**TC-29.5**
- DO: Take action - Temporary Suspension
- PRESS: Select "Temporary Suspension" action
- PRESS: Enter duration (days, e.g., 7)
- PRESS: Enter reason
- PRESS: Confirm
- SEE: User status changes to "suspended"
- SEE: Suspension email sent
- SEE: Report resolved
- SEE: expiresAt set to now + duration

**TC-29.6**
- DO: Take action - Permanent Ban
- PRESS: Select "Permanent Ban" action
- PRESS: Enter reason
- PRESS: Confirm
- SEE: User status changes to "banned"
- SEE: Ban email sent
- SEE: Report resolved

**TC-29.7**
- DO: Take action - No Action
- PRESS: Select "No Action" option
- PRESS: Enter reason for closing without action
- PRESS: Confirm
- SEE: Report status: "resolved"
- SEE: No changes to reported user account
- SEE: Reporter notified

**TC-29.8**
- DO: View report statistics
- PRESS: Navigate to Reports Stats
- SEE: Summary:
  - Total reports
  - Resolved reports
  - Pending reports
  - Resolution rate
  - Average resolution time
- SEE: Reports by category (chart/table)
- SEE: Reports by priority
- SEE: Action statistics (warnings, suspensions, bans)
- SEE: Top reported users

---

## TEST CASE 30: ADMIN - BUSINESS CONTROLS

**TC-30.1 - Create Campaign**
- DO: Create discount campaign
- PRESS: Navigate to Business Controls → Campaigns
- PRESS: Click "Create Campaign" button
- SEE: Campaign creation form

**TC-30.2**
- DO: Fill campaign details
- PRESS: Enter campaign name (e.g., "Summer Sale 2026")
- PRESS: Enter description
- PRESS: Select target audience:
  - All
  - New employers
  - Returning employers
  - Enterprise
  - Specific industry
- PRESS: Select discount type: Percentage OR Fixed amount
- PRESS: Enter discount value (e.g., 50 for 50% or €50)
- PRESS: Set max uses (e.g., 100)
- PRESS: Set start date
- PRESS: Set end date
- PRESS: Toggle "Active" status
- PRESS: Click "Create"
- SEE: Campaign created
- SEE: Toast: "Kampanja u krijua"

**TC-30.3 - Edit Campaign**
- DO: Modify campaign
- PRESS: Click "Edit" on campaign row
- PRESS: Change details
- PRESS: Click "Save"
- SEE: Campaign updated

**TC-30.4 - Disable Campaign**
- DO: Stop campaign
- PRESS: Toggle "Active" to false OR click "Disable"
- SEE: Campaign status: inactive
- SEE: No longer applied to new jobs

**TC-30.5 - Pricing Rules**
- DO: Create pricing rule
- PRESS: Navigate to Business Controls → Pricing Rules
- PRESS: Click "Create Rule"
- SEE: Pricing rule form

**TC-30.6**
- DO: Configure rule
- PRESS: Enter rule name (e.g., "Tech Jobs +20%")
- PRESS: Set priority (lower = higher priority)
- PRESS: Select conditions:
  - Industry (e.g., Technology)
  - Location (e.g., Tiranë)
  - Company size
  - Time-based (weekends, seasons)
- PRESS: Set multiplier (e.g., 1.2 for +20%)
- PRESS: Toggle "Active"
- PRESS: Click "Create"
- SEE: Rule created
- SEE: Applied to matching jobs automatically

**TC-30.7 - Employer Whitelist**
- DO: Add employer to whitelist
- PRESS: Navigate to Business Controls → Whitelist
- PRESS: Click "Add Employer" button
- SEE: Search field appears

**TC-30.8**
- DO: Search and add
- PRESS: Type employer email or company name
- SEE: Search results appear
- PRESS: Select employer
- PRESS: Enter reason (e.g., "NGO - free posting privilege")
- PRESS: Click "Add to Whitelist"
- SEE: Employer added
- SEE: freePostingEnabled: true
- SEE: Employer receives notification
- SEE: Employer can post jobs for free (€0)

**TC-30.9**
- DO: Remove from whitelist
- PRESS: Find employer in whitelist
- PRESS: Click "Remove" button
- SEE: Confirmation dialog
- PRESS: Confirm
- SEE: freePostingEnabled: false
- SEE: Employer will pay normal prices for future jobs

**TC-30.10 - Revenue Analytics**
- DO: View revenue dashboard
- PRESS: Navigate to Business Controls → Analytics
- SEE: Revenue metrics:
  - Total revenue (all-time)
  - Monthly revenue
  - Daily revenue
  - Average job price
  - Jobs posted count
- SEE: Charts: Revenue over time
- SEE: Campaign performance:
  - Conversions per campaign
  - Revenue per campaign
  - ROI calculation
- SEE: Pricing rule impact:
  - Jobs affected per rule
  - Revenue per rule
  - Average impact percentage

---

## TEST CASE 31: ADMIN - BULK NOTIFICATIONS

**TC-31.1**
- DO: Create bulk notification
- PRESS: Navigate to Bulk Notifications section
- PRESS: Click "Create Notification" button
- SEE: Notification creation form

**TC-31.2**
- DO: Fill notification details
- PRESS: Enter title (e.g., "New Feature Announcement")
- PRESS: Enter message (rich text editor OR textarea)
- PRESS: Select notification type:
  - announcement (blue)
  - maintenance (orange)
  - feature (green)
  - warning (red)
  - update (purple)
- PRESS: Select target users:
  - All users
  - Jobseekers only
  - Employers only
  - Verified employers only
  - Custom filter
- PRESS: Click "Preview" (optional)
- SEE: Preview modal with email template

**TC-31.3**
- DO: Send notification
- PRESS: Click "Send to {count} users" button
- SEE: Confirmation dialog: "Are you sure? This will send {count} emails."
- PRESS: Confirm
- SEE: Loading state
- SEE: Batch processing starts (backend: 10 emails per batch, 1s delay)
- SEE: Progress indicator (optional)
- SEE: Toast when complete: "Njoftimet u dërguan te {count} përdorues"

**TC-31.4**
- DO: View notification history
- PRESS: Navigate to Notification History
- SEE: List of all sent bulk notifications:
  - Title
  - Type
  - Sent date
  - Recipients count
  - Delivery status

---

## TEST CASE 32: ADMIN - SYSTEM CONFIGURATION

**TC-32.1**
- DO: View configuration
- PRESS: Navigate to System Configuration
- SEE: Configuration settings:
  - Maintenance mode toggle
  - Registration settings (enable/disable by user type)
  - Email settings
  - Payment settings
  - Feature flags

**TC-32.2**
- DO: Enable maintenance mode
- PRESS: Toggle "Maintenance Mode" to ON
- PRESS: Enter maintenance message (shown to users)
- PRESS: Click "Save"
- SEE: Platform enters maintenance mode
- SEE: All non-admin users see maintenance page
- SEE: Admins can still access (bypass)

**TC-32.3**
- DO: Disable registration
- PRESS: Toggle "Allow Jobseeker Registration" to OFF
- PRESS: Save
- SEE: Jobseeker registration page shows: "Regjistrimet janë të mbyllura përkohësisht"
- SEE: Existing users can still login

**TC-32.4**
- DO: Update base job price
- PRESS: Enter new base price (e.g., 60 instead of 50)
- PRESS: Save
- SEE: All new jobs use new base price
- SEE: Existing jobs unchanged

---

## TEST CASE 33: FORGOT PASSWORD

**TC-33.1**
- DO: Start password reset
- PRESS: Go to /login
- PRESS: Click "Ke harruar fjalëkalimin?" link
- SEE: Password reset page loads

**TC-33.2**
- DO: Request reset link
- PRESS: Enter registered email address
- PRESS: Click "Dërgo lidhjen" button
- SEE: Loading state
- SEE: Toast: "Një lidhje rivendosjeje u dërgua në email tuaj"
- SEE: Check email for reset link

**TC-33.3**
- DO: Click reset link
- PRESS: Open email, click reset link
- SEE: Redirect to reset password page with token in URL

**TC-33.4**
- DO: Set new password
- PRESS: Enter new password (min 6 chars)
- PRESS: Confirm new password (must match)
- PRESS: Click "Rivendos fjalëkalimin" button
- SEE: Loading state
- SEE: Toast: "Fjalëkalimi u rivendos me sukses"
- SEE: Redirect to /login
- SEE: Can login with new password

**TC-33.5**
- DO: Use expired or invalid token
- PRESS: Try to use old/invalid reset link
- SEE: Error message: "Lidhja është e pavlefshme ose ka skaduar"
- SEE: Option to request new link

---

## TEST CASE 34: NAVBAR & NAVIGATION

**TC-34.1**
- DO: View navbar (logged out)
- SEE: Logo (left)
- SEE: Nav links: Shtëpi, Punët, Punëdhënës, Rreth Nesh
- SEE: "Posto Punë" button (blue)
- SEE: "Hyrje" button (right)

**TC-34.2**
- DO: View navbar (logged in as jobseeker)
- SEE: Logo
- SEE: Nav links
- SEE: Notifications bell (with unread count badge if notifications exist)
- SEE: User dropdown (name/email)
  - Dropdown options: Profili Im, Aplikimet, Punët e Ruajtura, Cilësimet, Dil

**TC-34.3**
- DO: View navbar (logged in as employer)
- SEE: Logo
- SEE: Nav links
- SEE: "Posto Punë" button
- SEE: Notifications bell
- SEE: User dropdown
  - Dropdown options: Dashboard, Profili i Kompanisë, Cilësimet, Dil

**TC-34.4**
- DO: Click logo
- PRESS: Click logo
- SEE: Navigate to homepage /

**TC-34.5**
- DO: Click nav links
- PRESS: Click "Punët"
- SEE: Navigate to /jobs OR homepage (same page)

**TC-34.6**
- DO: Click notifications bell
- PRESS: Click bell icon
- SEE: Dropdown opens showing last 10 notifications
- SEE: Unread notifications: blue background, dot indicator
- SEE: Read notifications: gray background
- SEE: "Shëno të gjitha si të lexuara" button at bottom
- SEE: "Shiko të gjitha njoftimet" link

**TC-34.7**
- DO: Mark all as read
- PRESS: Click "Shëno të gjitha si të lexuara"
- SEE: All notifications turn gray
- SEE: Bell badge disappears (unread count = 0)
- SEE: Toast: "Njoftimet u shënuan si të lexuara"

**TC-34.8**
- DO: Click individual notification
- PRESS: Click on notification in dropdown
- SEE: Notification marked as read (background turns gray)
- SEE: Navigate to related page (job, application, etc.) if applicable

---

## TEST CASE 35: FOOTER

**TC-35.1**
- DO: View footer
- PRESS: Scroll to bottom of any page
- SEE: Footer with multiple sections:
  - Company info (Rreth advance.al)
  - Quick links (Lidhje të Shpejta)
  - Resources (Burime)
  - Contact info (Na Kontaktoni)
  - Social media icons
- SEE: Copyright text: "© 2026 advance.al. Të gjitha të drejtat e rezervuara."

**TC-35.2**
- DO: Click footer links
- PRESS: Click any footer link (e.g., "Punëkërkuesit", "Punëdhënësit", "Rreth Nesh")
- SEE: Navigate to respective page

**TC-35.3**
- DO: Click social media icons
- PRESS: Click Facebook icon
- SEE: Opens Facebook page in new tab

---

## TEST CASE 36: ABOUT US PAGE

**TC-36.1**
- DO: Navigate to About Us
- PRESS: Click "Rreth Nesh" in nav OR footer
- SEE: About Us page loads

**TC-36.2**
- DO: View hero section
- SEE: Title: "Platforma #1 e Punës në Shqipëri"
- SEE: Subtitle describing platform
- SEE: Two CTAs: "Gjej Punë" and "Posto Punë" buttons

**TC-36.3**
- DO: View statistics
- SEE: Four stat cards:
  - 500+ Punë të Publikuara
  - 1200+ Aplikime të Suksesshme
  - 150+ Kompani Partnere
  - 95% Kënaqësi e Përdoruesve

**TC-36.4**
- DO: View "Tre Mënyra" section
- SEE: Three cards:
  - Profil i Plotë (Full Account)
  - Aplikim Fleksibël (Flexible Application)
  - Profil i Shpejtë (Quick Profile)
- SEE: Each card shows features with checkmarks

**TC-36.5**
- DO: Click "Profil i Plotë" card
- PRESS: Click anywhere on first card
- SEE: Navigate to /login?tab=register&type=jobseeker
- SEE: Registration form opens

**TC-36.6**
- DO: Click "Aplikim Fleksibël" card
- PRESS: Click second card
- SEE: Navigate to /login?tab=register&type=jobseeker

**TC-36.7**
- DO: Click "Profil i Shpejtë" card
- PRESS: Click third card
- SEE: Navigate to /jobseekers page
- SEE: Quick profile registration form

**TC-36.8**
- DO: View AI CV Generation section
- SEE: Large card promoting AI CV generator
- SEE: "Provo Gjenerimin e CV-së" button
- PRESS: Click button
- SEE: Navigate to /jobseekers#ai-cv-section

---

## TEST CASE 37: JOBSEEKERS PAGE (QUICK PROFILE)

**TC-37.1**
- DO: Navigate to page
- PRESS: Navigate to /jobseekers
- SEE: Quick profile registration page loads

**TC-37.2**
- DO: View page content
- SEE: Hero section explaining quick profile benefits
- SEE: Registration form
- SEE: AI CV generation section (if implemented)

**TC-37.3**
- DO: Fill quick registration form
- PRESS: Enter first name
- PRESS: Enter last name
- PRESS: Enter email
- PRESS: Enter phone (optional)
- PRESS: Select city
- PRESS: Select interests (checkboxes, e.g., "Teknologji", "Marketing")
- PRESS: Enter custom interests (optional, comma-separated text)
- PRESS: Click "Regjistrohu" button
- SEE: Loading state
- SEE: Success message
- SEE: Toast: "Faleminderit! Do të merrni njoftime për punë të reja."

**TC-37.4**
- DO: Verify quick user created
- SEE: QuickUser record in database
- SEE: Welcome email sent to provided address
- SEE: Cannot login (no password, not a full user)

---

## TEST CASE 38: EMPLOYERS PAGE

**TC-38.1**
- DO: Navigate to page
- PRESS: Navigate to /employers OR click "Punëdhënës" in nav
- SEE: Employers landing page loads

**TC-38.2**
- DO: View content
- SEE: Hero section: "Gjeni Kandidatët Idealë për Kompaninë Tuaj"
- SEE: Benefits of posting on platform
- SEE: Stats (job postings, applicants, success rate)
- SEE: "Regjistrohu si Punëdhënës" button
- SEE: "Posto Punë" button

**TC-38.3**
- DO: Click register button
- PRESS: Click "Regjistrohu si Punëdhënës"
- SEE: Navigate to /login?tab=register&type=employer
- SEE: Employer registration form opens

**TC-38.4**
- DO: Click post job button
- PRESS: Click "Posto Punë"
- SEE: If not logged in: Redirect to /login
- SEE: If logged in as employer: Navigate to /post-job
- SEE: If logged in as jobseeker: Error toast

---

## TEST CASE 39: RESPONSIVE DESIGN (MOBILE)

**TC-39.1**
- DO: Test on mobile viewport
- PRESS: Resize browser to mobile width (< 768px) OR use mobile device
- SEE: Navbar collapses to hamburger menu
- SEE: Three-column layout becomes single column
- SEE: Filters move to collapsible sections
- SEE: Event sidebar (right) hidden on mobile

**TC-39.2**
- DO: Open mobile menu
- PRESS: Click hamburger icon (three lines)
- SEE: Mobile navigation menu slides in
- SEE: All nav links visible
- SEE: Close button (X) at top

**TC-39.3**
- DO: Test forms on mobile
- SEE: Forms stack vertically
- SEE: Inputs full width
- SEE: Step indicators remain visible but compressed

**TC-39.4**
- DO: Test job cards on mobile
- SEE: Job cards full width
- SEE: All info visible
- SEE: Buttons stack vertically if needed

---

## TEST CASE 40: ERROR STATES

**TC-40.1 - 404 Not Found**
- DO: Navigate to non-existent page
- PRESS: Go to /this-page-does-not-exist
- SEE: 404 error page
- SEE: Message: "Faqja nuk u gjet"
- SEE: "Kthehu në Faqen Kryesore" button

**TC-40.2 - Network Error**
- DO: Simulate network failure
- PRESS: Disconnect internet, try to load jobs
- SEE: Error toast: "Gabim në lidhje me serverin" OR similar
- SEE: Empty state or previous data remains visible

**TC-40.3 - Validation Errors**
- DO: Submit form with invalid data
- PRESS: Try to submit empty required fields
- SEE: Inline error messages (red text under fields)
- SEE: Cannot proceed until fixed

**TC-40.4 - Server Errors (500)**
- DO: Trigger server error (if test endpoint exists)
- SEE: Error toast: "Gabim në server. Ju lutemi provoni përsëri."
- SEE: Option to retry OR contact support

---

## TEST CASE 41: PERFORMANCE & LOADING

**TC-41.1 - Initial Load**
- DO: Load homepage fresh
- SEE: Loading spinner while jobs fetch
- SEE: Jobs appear within 2 seconds
- SEE: No layout shift

**TC-41.2 - Search Debouncing**
- DO: Type quickly in search
- SEE: Search doesn't trigger until 300ms after last keystroke
- SEE: Loading indicator appears
- SEE: Results update smoothly

**TC-41.3 - Pagination**
- DO: Navigate between pages
- SEE: Loading state for new page
- SEE: Smooth scroll to top
- SEE: New jobs load within 1 second

**TC-41.4 - Image Loading**
- DO: View jobs with company logos
- SEE: Images load progressively
- SEE: Placeholder or skeleton while loading
- SEE: No broken image icons

---

## TEST CASE 42: ACCESSIBILITY

**TC-42.1 - Keyboard Navigation**
- DO: Navigate with Tab key
- PRESS: Press Tab repeatedly
- SEE: Focus indicator visible on all interactive elements
- SEE: Can navigate entire page with keyboard
- SEE: Can activate buttons with Enter/Space

**TC-42.2 - Screen Reader**
- DO: Test with screen reader (if available)
- SEE: Alt text on images
- SEE: Labels on form fields
- SEE: ARIA labels on icons
- SEE: Semantic HTML structure

**TC-42.3 - Color Contrast**
- DO: Check contrast
- SEE: All text readable against background
- SEE: WCAG AA compliance (at minimum)

---

## TEST CASE 43: SECURITY

**TC-43.1 - Password Visibility**
- DO: View password field
- SEE: Password masked by default
- PRESS: Click eye icon (if exists)
- SEE: Password becomes visible
- PRESS: Click again
- SEE: Password masked again

**TC-43.2 - Session Timeout**
- DO: Login and wait
- PRESS: Wait 15 minutes (or configured timeout)
- PRESS: Try to perform authenticated action
- SEE: Session expired message
- SEE: Redirect to login

**TC-43.3 - Unauthorized Access**
- DO: Try to access protected route without login
- PRESS: Navigate to /employer-dashboard while logged out
- SEE: Redirect to /login
- SEE: Message: "Duhet të kyçeni për të vazhduar"

**TC-43.4 - Wrong User Type**
- DO: Access employer route as jobseeker
- PRESS: Navigate to /employer-dashboard as jobseeker
- SEE: Error message: "Nuk keni autorizim për këtë faqe"
- SEE: Redirect to appropriate page

---

## COMPLETION CHECKLIST

After testing ALL cases above:

- [ ] All 43 test cases completed
- [ ] All errors documented with TC number and step
- [ ] All bugs fixed and re-tested
- [ ] No console errors
- [ ] No broken links
- [ ] No UI glitches
- [ ] All forms working
- [ ] All buttons functional
- [ ] All redirects correct
- [ ] All toasts/notifications appear
- [ ] All modals open/close properly
- [ ] All dropdowns work
- [ ] All filters function correctly
- [ ] All data saves correctly
- [ ] All emails sent (check test inbox)
- [ ] Mobile responsive works
- [ ] No layout shifts
- [ ] Performance acceptable (<3s load)

---

## REPORTING FORMAT

When you find an error, report it like this:

**Error Report:**
- **Test Case:** TC-20.14
- **Step:** "Submit job" → Click "Posto Punën"
- **Expected:** Success toast appears, redirect to dashboard
- **Actual:** Error 500, job not created
- **Console Error:** [paste exact error]
- **Screenshot:** [attach if possible]

Then I will:
1. Identify the bug location in code
2. Fix the bug
3. Tell you to re-test that specific test case
4. Confirm fix before moving to next test case

---

## END OF QA DOCUMENT

**Total Test Cases:** 43
**Total Steps:** 300+
**Estimated Testing Time:** 4-6 hours (thorough testing)

Ready to start testing! Begin with **TC-1** and report any errors immediately.
