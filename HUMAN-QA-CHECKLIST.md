# Human QA Checklist -- advance.al

> **Purpose:** Manual QA testing for everything automated backend tests cannot verify: frontend UI, visual design, responsive layout, user flows, browser compatibility.
>
> **How to use:** Work through each section. Check the box when verified. Add notes in parentheses for any issues found. Test on Desktop (1440px+), Tablet (768px), and Mobile (375px) unless otherwise noted.
>
> **Test accounts needed:** Guest (logged out), Jobseeker, Employer, Admin
>
> **Browsers to test:** Chrome (primary), Firefox, Safari, Edge
>
> **Base URL:** `https://advance.al` (or local `http://localhost:5173`)

---

## Priority: CRITICAL

These items block core revenue and user acquisition. Test first.

---

### 1. Landing Page (/ and /jobs)

**Hero Section & 3D Animation**
- [ ] Page loads without blank screen or JavaScript errors (check browser console)
- [ ] 3D staircase animation (Three.js/R3F Canvas) renders and animates smoothly on desktop
- [ ] 3D animation does not block page interaction (scrolling, clicking)
- [ ] If 3D fails to load (e.g., WebGL disabled), page still renders gracefully with no crash
- [ ] Hero text is readable over the 3D background on all screen sizes
- [ ] Mobile: 3D scene either renders at acceptable FPS (>30) or is gracefully hidden

**Job Search**
- [ ] Search input field is visible and clearly labeled
- [ ] Type a keyword (e.g., "Marketing") and press Search -- results update
- [ ] Location dropdown populates with Albanian cities from the database
- [ ] Select a location from dropdown -- results filter correctly
- [ ] Clear search -- all jobs return
- [ ] Empty search (no keyword, no location) shows all jobs
- [ ] Search with a keyword that returns zero results shows empty state message
- [ ] Search input handles Albanian characters (e.g., "Menaxhim", "Inxhinieri") correctly

**Job Listings**
- [ ] Jobs display in a list with: title, company, location, salary (if shown), job type badge, posted date
- [ ] Each job card is clickable and navigates to /jobs/:id
- [ ] Premium jobs carousel (PremiumJobsCarousel) appears at top if premium jobs exist
- [ ] Premium carousel auto-scrolls every 8 seconds, left/right navigation arrows work
- [ ] Premium carousel becomes sticky when scrolling past its original position
- [ ] Job cards show correct badges: job type (Full-time, Part-time), salary range, location icon
- [ ] Salary displays correctly in EUR/ALL/USD format, or shows "Page per t'u negociuar" if negotiable
- [ ] "Posted X dite me pare" relative time is accurate

**Core Filters (Left Sidebar)**
- [ ] Quick filter buttons visible: Diaspora, Nga shtepia, Part Time, Administrata, Sezonale
- [ ] Click each filter -- job list updates to show only matching jobs
- [ ] Click active filter again -- deactivates it, shows all jobs
- [ ] Multiple filters can be active simultaneously
- [ ] Advanced filters section expands: category, experience level, salary range, location
- [ ] Category filter dropdown works
- [ ] Experience level filter works
- [ ] Salary range slider works and updates results
- [ ] Location filter works
- [ ] Clear all filters button resets everything

**Pagination**
- [ ] Page numbers appear below job listings when total jobs exceed page size
- [ ] Click page 2 -- new jobs load, page scrolls to top
- [ ] Previous/Next ("Meparshmi"/"Tjetri") buttons work correctly
- [ ] Current page is visually highlighted
- [ ] First and last page boundaries are respected (Previous disabled on page 1, Next disabled on last page)

**Banners for Guests**
- [ ] QuickUserBanner (signup CTA) appears for non-authenticated users
- [ ] Banner links correctly to /jobseekers?quick=true
- [ ] OnboardingGuide banner appears for new authenticated users with low profile completion
- [ ] Banners are dismissible with X button

**Recently Viewed Jobs**
- [ ] After visiting a job detail page and returning, "Recently Viewed" section appears
- [ ] Recently viewed jobs link back to the correct job detail page
- [ ] Clears correctly (test in incognito or after clearing localStorage)

**Save Job (Bookmark)**
- [ ] Guest: clicking bookmark icon redirects to /login with appropriate message
- [ ] Jobseeker: clicking bookmark icon saves the job (icon fills/changes color)
- [ ] Jobseeker: clicking again unsaves the job (icon reverts)
- [ ] Saved state persists after page refresh
- [ ] Employer: bookmark icon is hidden or shows error toast

**Responsive Layout**
- [ ] Desktop (1440px): Two-column layout (filters left, jobs right) with adequate spacing
- [ ] Tablet (768px): Filters collapse or move above job list
- [ ] Mobile (375px): Single column, search bar stacks, filters accessible via toggle/drawer
- [ ] No horizontal scrollbar on any breakpoint
- [ ] Job cards are readable and tappable on mobile (minimum touch target 44x44px)

---

### 2. Authentication -- Login (/login)

**Login Form**
- [ ] Page loads with email and password fields, "Kycu" button
- [ ] Email field has mail icon, password field has lock icon
- [ ] Password eye toggle (show/hide) works -- Eye/EyeOff icon switches
- [ ] Tab key navigates between fields and button correctly
- [ ] Enter key submits the form from any field
- [ ] Valid credentials: login succeeds, toast "Miresevini!" appears, redirects to appropriate dashboard
  - [ ] Jobseeker -> /profile
  - [ ] Employer -> /employer-dashboard
  - [ ] Admin -> /admin
- [ ] Invalid credentials: error alert appears below nav with AlertCircle icon and descriptive Albanian message
- [ ] Empty email: shows validation error "Ju lutemi plotesoni te gjitha fushat"
- [ ] Empty password: shows validation error
- [ ] Button shows "Duke u kycur..." spinner while loading
- [ ] Double-click prevention: button disables during submission
- [ ] Already logged in: visiting /login redirects to appropriate dashboard
- [ ] "Ke harruar fjalekalimin?" link navigates to /forgot-password
- [ ] "Punekerkues" and "Punedhenes" registration links navigate to /jobseekers?signup=true and /employers?signup=true

**Register Page (/register)**
- [ ] Shows role selection: "Punekerkues" and "Punedhenes" cards with User and Briefcase icons
- [ ] Clicking Punekerkues card navigates to /jobseekers?signup=true
- [ ] Clicking Punedhenes card navigates to /employers?signup=true
- [ ] "Ke tashme llogari? Kycu ketu" link navigates to /login

**Responsive**
- [ ] Form card is centered on all breakpoints
- [ ] Form is usable on mobile keyboard (fields not hidden behind keyboard on iOS/Android)

---

### 3. Jobseeker Registration (/jobseekers)

**Landing Section**
- [ ] Page loads with JobSearchHero, CVCreatorSection, and feature descriptions
- [ ] Feature showcase with AI features cards (Perputhje Inteligjente, Analizimi i CV-se, etc.)
- [ ] Scenario cards (Profil i Shpejte, Profil i Plote, Punedhenes) switch correctly on click
- [ ] Each scenario shows 3 steps with expand/collapse detail text
- [ ] All text is in Albanian, no untranslated strings

**Registration Form**
- [ ] Scrolls to signup form when visiting /jobseekers?signup=true
- [ ] Form fields: first name, last name, email, password, phone (optional), city, interests
- [ ] Required fields marked and validated: first name, last name, email, password
- [ ] Email field validates format (shows error for "abc" but accepts "abc@email.com")
- [ ] Password has show/hide toggle (Eye/EyeOff icons)
- [ ] Password minimum length validation (8 characters)
- [ ] Albanian phone number normalization works (e.g., "069 123 4567" formats correctly)
- [ ] Form validation shows inline errors in Albanian
- [ ] Character counters appear on text fields where applicable (InputWithCounter)
- [ ] Submit triggers email verification flow

**Email Verification Modal (Mantine Modal with PinInput)**
- [ ] Modal opens after successful registration
- [ ] Shows 6-digit PinInput that auto-focuses
- [ ] Can type each digit individually
- [ ] Can paste full 6-digit code
- [ ] Correct code: account created, modal closes, redirected appropriately
- [ ] Wrong code: error message displayed in Albanian
- [ ] "Ridërgo kodin" (Resend) button with cooldown timer
- [ ] Timer counts down (e.g., 60s, 59s, ..., 0s) -- button shows seconds remaining
- [ ] Resend button re-enables after cooldown reaches 0
- [ ] Resend sends new code and resets timer

**Quick User Profile**
- [ ] Quick form appears when visiting /jobseekers?quick=true and page scrolls to it
- [ ] Minimal fields: name, email, interests (job categories)
- [ ] Submit creates quick user profile without full registration
- [ ] Toast confirms creation

**CV Generation with AI**
- [ ] CVCreatorSection visible with id="ai-cv-section" (for deep linking)
- [ ] Textarea for freeform input about yourself (any language)
- [ ] "Generate" button triggers AI CV generation
- [ ] Loading/generating state with spinner
- [ ] Generated CV preview appears with professional formatting
- [ ] Download button produces downloadable file
- [ ] Generation works with Albanian text input
- [ ] Empty input shows validation error

**Responsive**
- [ ] Form fields stack vertically on mobile
- [ ] PinInput digits are large enough to tap on mobile (44px min)
- [ ] Feature showcase and scenario cards adapt to narrow screens
- [ ] RotatingContact component works on mobile

---

### 4. Employer Registration (/employers)

**Landing Section**
- [ ] Hero section with employer-focused messaging
- [ ] CompaniesComponent renders with company showcase
- [ ] Benefits and features listed for employers
- [ ] RotatingContact component visible and functional

**Registration Form**
- [ ] Scrolls to form when visiting /employers?signup=true (data-signup-form attribute scroll target)
- [ ] Multi-step registration form with visual step indicator
- [ ] Step 1: Company name, contact person first/last name, email, password, phone
- [ ] Step 2: Company details -- industry dropdown, company size, location (city/region), description
- [ ] Step navigation: "Vazhdo" (Next) and "Kthehu" (Back) buttons
- [ ] Validation runs per-step: cannot advance from step 1 without required fields
- [ ] Character counters on description field (TextAreaWithCounter)
- [ ] Albanian phone normalization on phone fields
- [ ] Submit triggers email verification (same PinInput modal flow as jobseeker)
- [ ] After verification, employer is in "pending" state awaiting admin approval
- [ ] Toast/message explains they need to wait for admin verification

**Responsive**
- [ ] Step indicator adapts to mobile
- [ ] Form fields stack on mobile

---

### 5. Job Detail Page (/jobs/:id)

**Job Information Display**
- [ ] Page loads with full job details: title, company name, location, salary, job type
- [ ] Description renders with proper formatting (paragraphs, line breaks, HTML if applicable)
- [ ] Requirements list displays as bullet points
- [ ] Benefits list displays correctly
- [ ] Tags/skills display as colored badges
- [ ] "Postuar X dite me pare" relative time is accurate
- [ ] Expiry date shown: "Skadon me [date]" in Albanian format
- [ ] Company name clickable or displayed prominently
- [ ] Contact methods section displays if employer enabled them:
  - [ ] Email button (opens mailto or contact modal)
  - [ ] Phone button (shows number)
  - [ ] WhatsApp button (opens WhatsApp link)
- [ ] "Kthehu" (back arrow) button navigates to previous page
- [ ] Application count displayed ("X aplikues" badge)
- [ ] Custom questions listed if present

**Apply Flow -- 1-Click Apply**
- [ ] Guest: "Apliko" button redirects to /login with toast "Duhet te kyceni"
- [ ] Jobseeker with CV and NO custom questions: clicking "Apliko me 1 klik" applies instantly
  - [ ] Button changes to "Keni Aplikuar" with CheckCircle icon (disabled state)
  - [ ] Toast confirms "Aplikimi u dergua!"
  - [ ] Clicking again does nothing (button disabled)
- [ ] Jobseeker without CV: prompted to upload CV first (redirected or shown message)
- [ ] Employer: apply button shows role-specific error "Vetem kerkuesit e punes mund te aplikojne"

**Apply Flow -- Modal Apply (Jobs with Custom Questions)**
- [ ] If job has customQuestions: clicking "Apliko" opens ApplyModal dialog
- [ ] Modal header shows job title and company name
- [ ] Custom questions render with correct input types, required marker (*)
- [ ] Cover letter textarea available (optional)
- [ ] CV upload option within modal if user has no CV
  - [ ] File picker accepts PDF/DOCX
  - [ ] Background CV save and parse triggers (backgroundCVSaveAndParse)
- [ ] Profile completeness indicator shown
- [ ] Submit with all required fields: success toast, modal closes, button becomes "Keni Aplikuar"
- [ ] Submit with missing required question: validation error highlights that field
- [ ] Loading/sending spinner on submit button while processing
- [ ] Close modal with X button: no application sent, can try again
- [ ] Double-submit prevention: button disables after first click

**Save/Bookmark**
- [ ] Bookmark icon visible on job detail page
- [ ] Click to save: icon fills solid, toast "Puna u ruajt!"
- [ ] Click again to unsave: icon goes outline, toast "Puna u hoq nga te ruajturat"
- [ ] Guest: redirects to login with message
- [ ] Loading state on bookmark button during API call (savingJob spinner)

**Contact Employer Modal**
- [ ] If employer has contact methods enabled: buttons visible
- [ ] Clicking contact button opens contact modal
- [ ] Modal shows contact type (email/phone/whatsapp)
- [ ] Message textarea for email contact
- [ ] Phone: displays number for direct calling
- [ ] WhatsApp: opens wa.me link with message

**Similar Jobs**
- [ ] SimilarJobs component appears below main job details
- [ ] Shows relevant jobs from same category/location
- [ ] Each similar job card is clickable, navigates to correct /jobs/:id
- [ ] If no similar jobs found, section is hidden gracefully

**Tutorial System**
- [ ] Lightbulb/help icon visible on the page
- [ ] Clicking starts step-by-step tutorial with spotlight overlay
- [ ] Tutorial highlights elements sequentially with title and content in Albanian
- [ ] Next/Previous/Skip/Close buttons work
- [ ] Spotlight follows scroll position and element position
- [ ] Scroll lock during tutorial works (isScrollLockedRef)
- [ ] Tutorial dismisses properly, page interaction restored

**Responsive**
- [ ] Job details stack vertically on mobile
- [ ] Apply button is prominent and easily tappable on mobile
- [ ] Long job descriptions scroll within container
- [ ] Salary and badges wrap correctly on narrow screens
- [ ] Contact buttons fit on mobile

---

### 6. Jobseeker Profile (/profile)

**Access Control**
- [ ] Only accessible by logged-in jobseekers (ProtectedRoute with allowedUserTypes=['jobseeker'])
- [ ] Employer visiting /profile is redirected
- [ ] Guest visiting /profile is redirected to /login

**Tab Navigation**
- [ ] Four tabs visible: "Informacion Personal", "Pervoje Pune", "Aplikimet", "Cilesimet"
- [ ] Clicking each tab switches content without page reload
- [ ] Active tab is visually highlighted with underline/color
- [ ] Tabs scroll horizontally on mobile if they don't fit
- [ ] data-tutorial="tabs" attribute present for tutorial system

**Personal Information Tab**
- [ ] Profile photo: click to upload, accepts image files (jpg, png)
- [ ] Photo preview updates immediately after upload
- [ ] Uploading spinner shown during upload (uploadingPhoto state)
- [ ] First name and last name fields pre-filled from profile
- [ ] Email shown (read-only or non-editable)
- [ ] Phone field with proper input
- [ ] Professional title field (data-tutorial="professional-title")
- [ ] Bio/About textarea with character counter (TextAreaWithCounter)
- [ ] Experience level dropdown (data-tutorial="experience-level"): Entry, Junior, Mid, Senior, Expert
- [ ] Skills input comma-separated (data-tutorial="skills")
- [ ] Location fields: city and region
- [ ] All fields pre-fill with existing user profile data on load
- [ ] "Ruaj Ndryshimet" (Save Changes) button:
  - [ ] Disabled when no changes (hasChanges = false)
  - [ ] Enables as soon as any field changes
  - [ ] Shows loading spinner while saving (savingProfile)
  - [ ] Success toast on save
  - [ ] Profile data persists after page refresh
  - [ ] Form validation runs (profileValidationRules)

**CV Upload Section (data-tutorial="cv-upload")**
- [ ] Upload area accepts PDF and DOCX files (max 5MB)
- [ ] Rejects files over 5MB with error toast
- [ ] Rejects non-PDF/DOCX files
- [ ] Upload progress/spinner visible (uploadingCV state)
- [ ] After upload: file name displayed, current CV info shown
- [ ] "Fshi CV" (Delete CV) button visible when CV exists
  - [ ] Click opens styled AlertDialog confirmation (showDeleteCVDialog)
  - [ ] Dialog has "Anulo" (Cancel) and "Fshi" (Delete) buttons
  - [ ] Cancel closes dialog without deleting
  - [ ] Delete removes CV, updates UI, shows toast
  - [ ] deletingCV spinner during delete
- [ ] "Analizo CV me AI" button (CV parsing):
  - [ ] Opens file picker to select CV for parsing (parseFileInputRef)
  - [ ] Loading state during parsing (parsingCV)
  - [ ] Preview modal (showCVPreviewModal) shows parsed data fields:
    - [ ] Title, Bio, Experience level, Skills
    - [ ] Work experience entries with position, company, dates
    - [ ] Education entries with degree, institution, dates
  - [ ] Checkboxes to select which profile fields to apply (selectedProfileFields)
  - [ ] Checkboxes for individual work/education entries
  - [ ] "Apliko te Dhënat" applies selected data to profile
  - [ ] Applied fields immediately visible in profile form
  - [ ] applyingParsedData spinner during apply

**Work Experience Tab (data-tutorial="work-history")**
- [ ] Existing work entries listed with: position (bold), company, location, date range, description
- [ ] "Shto Pervoje Pune" (Add) button opens workExperienceModal dialog
- [ ] Modal fields: position, company, location, start date, end date, description, achievements
- [ ] "Punoj aktualisht ketu" (isCurrentJob) toggle hides end date field when on
- [ ] Save: validates required fields, creates entry, closes modal, refreshes list
- [ ] Edit button on existing entry: opens pre-filled modal (editingWorkId set)
- [ ] Delete button: confirmation dialog, removes entry
- [ ] savingWorkExperience spinner during save

**Education Section (below work experience on same tab)**
- [ ] Existing education entries listed
- [ ] "Shto Arsim" (Add Education) button opens educationModal
- [ ] Modal fields: degree, field of study, institution, location, start date, end date, GPA, description
- [ ] "Studioj aktualisht" (isCurrentStudy) toggle hides end date
- [ ] CRUD same as work experience (add, edit, delete)

**Applications Tab (data-tutorial="applications-tab")**
- [ ] Lists all jobs the user has applied to
- [ ] Each application shows: job title, company name, application date, status badge
- [ ] Status badges color-coded:
  - [ ] "Ne Pritje" (Pending) -- yellow/amber
  - [ ] "Pranuar" (Accepted) -- green
  - [ ] "Refuzuar" (Rejected) -- red
  - [ ] "Shqyrtuar" (Reviewed) -- blue
- [ ] ApplicationStatusTimeline component shows visual status progression
- [ ] Clicking job title navigates to /jobs/:id
- [ ] Loading state while fetching (loadingApplications)
- [ ] Empty state: "Nuk keni aplikime" with button to browse jobs

**Settings Tab**
- [ ] Salary preferences section:
  - [ ] Show salary preference toggle (showSalaryPreference)
  - [ ] Min/max salary inputs (desiredSalaryMin/Max)
  - [ ] Currency selector: ALL, EUR, USD (desiredSalaryCurrency)
- [ ] "Open to remote" toggle (openToRemote)
- [ ] "Profile visible" toggle (profileVisible)
- [ ] "Show in search results" toggle (showInSearch)
- [ ] Job alerts email toggle (jobAlertsEnabled):
  - [ ] Toggle shows loading spinner (savingJobAlerts)
  - [ ] Saves immediately on toggle
- [ ] Change password section:
  - [ ] Current password field (currentPassword)
  - [ ] New password field (newPassword)
  - [ ] Confirm new password field (confirmNewPassword)
  - [ ] Mismatched new passwords: error toast
  - [ ] Wrong current password: error toast
  - [ ] Successful change: success toast, fields clear
  - [ ] changingPassword spinner
- [ ] Delete account section:
  - [ ] "Fshi Llogarine" button visible with warning styling
  - [ ] Opens AlertDialog confirmation (showDeleteConfirm)
  - [ ] Requires password confirmation (deletePassword field)
  - [ ] Cancel closes dialog
  - [ ] Confirm with correct password: account deleted, logged out, redirected to /
  - [ ] deletingAccount spinner

**Tutorial System**
- [ ] Lightbulb/Play icon triggers profile tutorial (showTutorial)
- [ ] Tutorial walks through sections: tabs, personal info, professional title, experience level, skills, CV upload
- [ ] Tab switching during tutorial works (tutorial steps have requiresTab metadata)
- [ ] Tutorial spotlight animation smooth (isSpotlightAnimating)
- [ ] Tutorial can be dismissed at any step with X/Skip
- [ ] Scroll lock during tutorial prevents background scrolling
- [ ] Double-click prevention on tutorial navigation (lastClickTime debounce)

**Background CV Parsing (from ApplyModal)**
- [ ] If CV was uploaded from ApplyModal, profile page shows parsing indicator (bgCVParsing)
- [ ] Polls localStorage for 'cv-parsing-in-progress' flag
- [ ] When parsing completes: flag removed, profile refreshes with new data
- [ ] No duplicate work experience/education entries created

**Responsive**
- [ ] Profile sections stack on mobile
- [ ] Modals (work experience, education, CV preview) are full-width on mobile
- [ ] Tab bar scrolls horizontally on small screens
- [ ] Save button accessible without excessive scrolling
- [ ] Profile photo upload button tappable on mobile

---

### 7. Employer Dashboard (/employer-dashboard)

**Access Control**
- [ ] Only accessible by logged-in employers (ProtectedRoute with allowedUserTypes=['employer'])
- [ ] Jobseeker/Guest/Admin redirected

**Tab from URL**
- [ ] Visiting /employer-dashboard?tab=applications switches to Applicants tab
- [ ] Visiting /employer-dashboard?tab=settings switches to Settings tab
- [ ] Default tab is "jobs"

**Jobs Tab ("Punet e Mia")**
- [ ] Stats cards at top: Active Jobs, Total Applicants, Monthly Views, Growth percentage
- [ ] Lists all jobs posted by the employer
- [ ] Each job card (data-tutorial="job-card") shows: title, location, applicant count, status badge, posted date
- [ ] Job status filter dropdown (jobStatusFilter): All, Active, Expired
- [ ] "Posto Pune te Re" button navigates to /post-job
- [ ] Job card action buttons (data-tutorial="job-actions"):
  - [ ] Eye icon: navigates to job detail /jobs/:id
  - [ ] Edit icon: navigates to /edit-job/:id
  - [ ] Trash icon: opens confirmation dialog, deletes job on confirm
  - [ ] "Kandidate" button (data-tutorial="view-applications"): switches to applicants tab filtered to that job
- [ ] Pagination: "Shfaq me shume" shows 5 more jobs (JOBS_PER_PAGE = 5)
- [ ] Empty state when no jobs posted

**Applicants Tab ("Aplikuesit")**
- [ ] Lists all applications across all employer's jobs (data-tutorial="applicants-card")
- [ ] Filter by job dropdown (applicationJobFilter): All jobs or specific job
- [ ] Filter by status (applicationStatusFilter): All, Pending, Reviewed, Accepted, Rejected
- [ ] Each applicant card (data-tutorial="applicant-card") shows: name, applied job, date, status
- [ ] Status dropdown (data-tutorial="applicant-status"):
  - [ ] Select "Pranuar" (Accepted) -- updates immediately, updatingApplications spinner
  - [ ] Select "Refuzuar" (Rejected) -- updates, notification sent to jobseeker
  - [ ] Select "Shqyrtuar" (Reviewed) -- updates
- [ ] Applicant details modal (applicationModalOpen):
  - [ ] Opens on clicking applicant name/row
  - [ ] Loading state (loadingApplicationDetails)
  - [ ] Shows: name, email, phone, bio, skills, work experience, education
  - [ ] "Shkarko CV" (Download CV) button downloads resume file
    - [ ] downloadingCV spinner during download
  - [ ] Contact buttons (data-tutorial="applicant-actions"):
    - [ ] Email: opens mailto or contact modal
    - [ ] Phone: shows number
    - [ ] WhatsApp: opens wa.me link
  - [ ] "Raporto" button opens ReportUserModal for that applicant
  - [ ] Work history section expandable (expandedWorkHistory toggle)
  - [ ] Education section expandable (expandedEducation toggle)
- [ ] Pagination: "Shfaq me shume" shows 5 more (APPLICATIONS_PER_PAGE = 5)

**Candidate Matching**
- [ ] AI matching button on job cards opens matchingModalOpen
- [ ] Shows matched candidates with match percentage (CandidateMatch)
- [ ] Contact buttons for matched candidates
- [ ] hasMatchingAccess check for premium feature
- [ ] purchasingAccess flow (if applicable)

**Contact Modal**
- [ ] contactModalOpen with contactType (email/phone/whatsapp)
- [ ] Email: message textarea, send button
- [ ] Phone: number display
- [ ] WhatsApp: pre-filled message, opens WhatsApp

**Settings Tab ("Cilesimet")**
- [ ] Company profile form pre-populated (profileData state):
  - [ ] companyName, description, website, industry, companySize, city, region, phone, whatsapp
- [ ] Logo upload:
  - [ ] Click triggers file picker (logoInputRef)
  - [ ] uploadingLogo spinner
  - [ ] Preview updates after upload
- [ ] Contact method toggles: enablePhoneContact, enableWhatsAppContact, enableEmailContact
- [ ] Character counter on description (TextAreaWithCounter)
- [ ] Save button with validation (employerDashboardSettingsRules)
- [ ] savingProfile spinner during save
- [ ] Success toast on save

**Tutorial System**
- [ ] Each tab has its own tutorial steps (jobsTutorialSteps, applicantsTutorialSteps, settingsTutorialSteps)
- [ ] Lightbulb/Play icon triggers tutorial
- [ ] Tutorial adapts to current tab's content

**Report Modal**
- [ ] ReportUserModal opens from applicant detail view
- [ ] Pre-fills reported user info (reportUserId, reportUserName)

**Responsive**
- [ ] Dashboard stats cards stack (2x2 grid or single column on mobile)
- [ ] Job cards and applicant cards readable on mobile
- [ ] Tab bar text truncated on mobile ("text-xs sm:text-sm" classes)
- [ ] Modals full-screen/scrollable on mobile
- [ ] Dropdown menus don't overflow viewport

---

### 8. Post Job (/post-job)

**Access Control**
- [ ] Only accessible by logged-in employers
- [ ] Non-employers redirected

**Multi-Step Form with Stepper**
- [ ] Stepper shows 4 steps: "Informacioni Baze", "Lokacioni", "Paga (Opsionale)", "Kerkesat dhe Perfitimet"
- [ ] Active step highlighted, completed steps show checkmarks
- [ ] Current step index (0-based) tracked correctly

**Step 0 -- Basic Information:**
- [ ] Title field (data-tutorial="title") -- required, with character counter
- [ ] Description textarea -- required, with character counter
- [ ] Category dropdown -- required, Albanian job categories
- [ ] Job type dropdown -- required: Full-time, Part-time, Contract, Internship
- [ ] Experience level selector
- [ ] Platform categories toggles: Diaspora, Nga Shtepia, Part Time, Administrata, Sezonale (Switch components)
- [ ] Application method selector (one_click vs other)
- [ ] Validation: cannot advance without title, description, category, jobType

**Step 1 -- Location:**
- [ ] City dropdown -- required, populated from locationsApi
- [ ] Region auto-fills based on city selection
- [ ] Validation: cannot advance without city

**Step 2 -- Salary (Optional):**
- [ ] Min salary and max salary number inputs
- [ ] Currency selector: EUR, ALL, USD (salaryCurrency)
- [ ] Show salary toggle (showSalary)
- [ ] Salary period toggle: monthly/yearly (salaryPeriod)
- [ ] No required validation (step is optional)

**Step 3 -- Requirements & Benefits:**
- [ ] Dynamic requirements list: add with + button, remove with X, at least one required
- [ ] Dynamic benefits list: add/remove
- [ ] Tags/skills input: add/remove
- [ ] Custom questions section:
  - [ ] Add question with text input
  - [ ] Required toggle per question
  - [ ] Type selector per question
  - [ ] Remove question with X
- [ ] Expiration date picker (expiresAt)
- [ ] Validation: at least one non-empty requirement

**Navigation:**
- [ ] "Vazhdo" (Next) button advances to next step after validation
- [ ] "Kthehu" (Back) button goes to previous step
- [ ] Final step shows "Posto Punen" submit button
- [ ] Loading spinner during submission (loading state)
- [ ] Success: Mantine notification, redirect to /employer-dashboard
- [ ] Error: notification with error message

**Interaction Acknowledgment:**
- [ ] Location, salary, requirements sections have acknowledge tracking
- [ ] Prevents accidental skip of optional sections

**Tutorial System**
- [ ] Tutorial steps mapped to form steps (tutorialStepsByFormStep)
- [ ] Each form step has relevant tutorial highlights

**Responsive**
- [ ] Stepper labels truncated or hidden on mobile
- [ ] Form fields full-width on mobile
- [ ] Dynamic list items (requirements, benefits, questions) usable on mobile
- [ ] Add/remove buttons tappable

---

### 9. Edit Job (/edit-job/:id)

**Access Control**
- [ ] Only accessible by the employer who owns the job
- [ ] Other employers or users redirected

**Pre-loading**
- [ ] Loading state shown while fetching job data (loadingJob)
- [ ] All form fields pre-populated with existing job data
- [ ] Requirements, benefits, tags, custom questions lists populated
- [ ] Salary period and currency set correctly

**Editing**
- [ ] Same stepper UI as Post Job
- [ ] All fields editable
- [ ] Stepper navigation works
- [ ] Submit updates the existing job (not creates new)
- [ ] Success: notification, redirect to employer dashboard
- [ ] Error: notification with message

---

### 10. Saved Jobs (/saved-jobs)

**Access Control**
- [ ] Only accessible by logged-in jobseekers
- [ ] Non-jobseekers redirected to /login

**Page Content**
- [ ] Header: "Punet e Ruajtura" with Bookmark icon and total count
- [ ] "Kthehu" (Back) button with ArrowLeft navigates to previous page
- [ ] Loading state: spinner + "Duke ngarkuar punet e ruajtura..."

**Job List**
- [ ] Saved jobs displayed using JobCard component
- [ ] Each card has unsave action -- removes job from list immediately with toast
- [ ] "Apliko" button on each card: 1-click apply works
- [ ] Already applied jobs show "Keni Aplikuar" disabled state (from appliedJobIds)
- [ ] Pagination: Meparshmi/Tjetri buttons + page numbers when > 10 jobs
- [ ] Page change scrolls to top smoothly

**Empty State**
- [ ] When no saved jobs: Bookmark icon, "Nuk keni pune te ruajtura" message
- [ ] "Shfleto Punet" button navigates to /jobs

**Responsive**
- [ ] Job cards stack on mobile
- [ ] Pagination buttons tappable on mobile

---

## Priority: HIGH

These items affect significant user experience but don't completely block core flows.

---

### 11. Navigation Bar

**Desktop Navigation**
- [ ] Fixed at top (fixed top-0, z-[9998]), visible on scroll
- [ ] Logo (punLogo.jpeg) on the left, h-12 w-12, clickable -> navigates to /
- [ ] Center links (hidden md:flex, absolute centered): "Punet", "Rreth Nesh", "Punedhenes", "Punekerkues"
- [ ] Active page link highlighted in primary color
- [ ] "Kompanite" link is NOT visible (commented out / temporarily disabled)
- [ ] All links navigate to correct routes

**Guest State (Not Logged In)**
- [ ] "Hyrje" (Login) outline button with User icon -> /login
- [ ] "Posto Pune" filled button with Building icon -> /employers (not /post-job, since guest)

**Jobseeker State**
- [ ] Avatar circle with initials or profile photo
- [ ] Clicking avatar opens DropdownMenu (modal={false}):
  - [ ] Shows full name (firstName lastName) and email in header
  - [ ] "Profili Im" with User icon -> /profile
  - [ ] "Punet e Ruajtura" with Bookmark icon -> /saved-jobs
  - [ ] "Cilesimet" with Settings icon -> /profile
  - [ ] Separator line
  - [ ] "Dil" (Logout) in red with LogOut icon
- [ ] Bell icon with notification badge
- [ ] No "Dashboard" or "Posto Pune" buttons

**Employer State**
- [ ] Avatar dropdown shows "Dashboard" with User icon -> /employer-dashboard
- [ ] NO "Profili Im" or "Punet e Ruajtura" links
- [ ] "Dashboard" button (separate, outside dropdown) with Building icon -> /employer-dashboard
- [ ] Bell icon present

**Admin State**
- [ ] Avatar dropdown shows "Paneli Admin" with Shield icon -> /admin
- [ ] NO "Profili Im" link (user?.userType !== "admin" check hides it)
- [ ] Bell icon present

**"Posto Pune" Button Logic (Guest/Non-Employer)**
- [ ] Guest clicks "Posto Pune": navigates to /employers
- [ ] Logged-in jobseeker clicks: shows error toast "Vetem punedhënesit mund te postojne pune", navigates to /employers
- [ ] Logged-in employer clicks: navigates to /post-job

**Notifications Bell**
- [ ] Bell icon shows red Badge with unreadCount (number, or "9+" for >9)
- [ ] No badge when unreadCount is 0
- [ ] Clicking bell opens DropdownMenuContent (w-80 max-h-96 overflow-y-auto)
- [ ] Triggers loadNotifications on open (10 most recent)
- [ ] "Duke ngarkuar njoftimet..." loading text
- [ ] "Nuk keni njoftime te reja" empty state
- [ ] Each notification item shows:
  - [ ] Title (font-medium)
  - [ ] Message (text-xs, line-clamp-2 by default)
  - [ ] Time ago (text-xs)
  - [ ] Blue dot for unread, blue background (bg-blue-50)
- [ ] Click notification to expand/collapse message (expandedNotificationId toggle)
- [ ] "Shiko ->" link on notifications with related content:
  - [ ] Employer + application notification -> /employer-dashboard?tab=applications
  - [ ] Jobseeker + application notification -> /profile
  - [ ] Job notification -> /jobs/:id
- [ ] Clicking marks as read (blue dot disappears, count decrements)
- [ ] "Sheno te gjitha si te lexuara" button (top and bottom of list):
  - [ ] Marks all as read, count goes to 0
  - [ ] Toast: "Njoftimet u shenuan si te lexuara"
- [ ] Polling: unreadCount refreshes every 60 seconds (pauses when tab hidden)
- [ ] Dropdown scrollable when many notifications

**Mobile Navigation**
- [ ] Hamburger menu (Menu icon) visible at md:hidden breakpoint
- [ ] Clicking toggles mobile menu open (X icon to close)
- [ ] Mobile menu shows: Punet, Rreth Nesh, Punedhenes, Punekerkues
- [ ] Each link navigates and closes menu (onClick setMobileMenuOpen(false))
- [ ] "Kompanite" not shown (commented out)
- [ ] Active link highlighted
- [ ] Menu appears below navbar with border-t
- [ ] Menu doesn't interfere with notification/avatar dropdowns

**Logout**
- [ ] "Dil" in dropdown calls handleLogout
- [ ] Redirects to / after logout
- [ ] Auth token cleared from localStorage
- [ ] Navigation immediately shows guest state (Login/Posto Pune buttons)
- [ ] Attempting to visit /profile after logout redirects to /login

---

### 12. Admin Dashboard (/admin)

**Access Control**
- [ ] Only accessible by admin users (ProtectedRoute with allowedUserTypes=['admin'])
- [ ] Non-admin: toast "Nuk keni autorizim...", redirected to /
- [ ] Also checks isAuthenticated() and getUserType() === 'admin' on mount

**Overview Tab ("Permbledhje")**
- [ ] Stats cards: totalUsers, totalEmployers, totalJobSeekers, totalJobs, activeJobs, totalApplications
- [ ] pendingEmployers count, verifiedEmployers count, quickUsers count
- [ ] totalRevenue display
- [ ] Monthly growth percentages: users, jobs, applications
- [ ] topCategories: list with names and counts
- [ ] topCities: list with names and counts
- [ ] recentActivity feed: job_posted, user_registered, application_submitted events
- [ ] Report stats card: totalReports, pendingReports, resolvedReports, resolutionRate
- [ ] Loading state (statsLoading spinner)

**Quick Action Modals:**
- [ ] "All Jobs" button -> allJobsModal with paginated job list (jobsPagination)
- [ ] "Reported Jobs" -> reportedJobsModal with flagged/reported jobs
- [ ] "Expiring Jobs" -> expiringJobsModal with soon-to-expire jobs
- [ ] "New Users" -> newUsersModal with recently registered users
- [ ] "All Users" -> allUsersModal with search, type filter, pagination
  - [ ] Filter by: all, jobseeker, employer, admin (allUsersFilter)
  - [ ] Search by name/email (allUsersSearch)
  - [ ] Click user for details (selectedUserForDetails)
  - [ ] Pagination controls
- [ ] Each modal: loading state, data display, pagination, close button

**Employers Tab ("Punedhenes")**
- [ ] pendingEmployers list loaded on mount
- [ ] Each entry: company name, contact person, email, date
- [ ] "Aprovo" (Approve) button:
  - [ ] Opens reason dialog (openReasonDialog) with optional admin note
  - [ ] Confirm approves employer
  - [ ] Employer removed from pending list
  - [ ] processingId spinner on the specific card
- [ ] "Refuzo" (Reject) button:
  - [ ] Opens reason dialog
  - [ ] Rejects employer with reason
- [ ] Reason dialog (reasonDialog):
  - [ ] Title, textarea for reason, "Konfirmo" and "Anulo" buttons
  - [ ] reasonInput state

**Analytics Tab ("Analitika")**
- [ ] Sub-tabs: "Raportime te reja", "Perdorues te pezulluar", "Veprime te meparshme"
- [ ] Reports data (reportsData) with filters
- [ ] Suspended users list (suspendedUsers)
- [ ] Actions history log (actionsHistory)
- [ ] Action buttons: warn, suspend, ban, dismiss

**Content Tab ("Permbajtja")**
- [ ] Bulk notification form (bulkNotificationModal):
  - [ ] Title input (notificationForm.title)
  - [ ] Message textarea (notificationForm.message)
  - [ ] Type selector: announcement
  - [ ] Target audience: all, jobseekers, employers (notificationForm.targetAudience)
  - [ ] Send button with loading (bulkNotificationLoading)
  - [ ] After send: stats shown (totalRecipients, sent, failed)
- [ ] Notification history list (notificationHistory)
  - [ ] Paginated (historyPagination)
  - [ ] historyLoading state
  - [ ] Loads on tab activation

**Business Tab ("Cmimet")**
- [ ] BusinessDashboard component embedded
- [ ] Displays: standardPosting, promotedPosting, candidateViewing prices
- [ ] paymentEnabled toggle
- [ ] Edit mode: toggle to edit prices
- [ ] Save: updates pricing via API
- [ ] Loading/saving states

**Configuration Modal (configModal)**
- [ ] Sub-tabs: Platform, Users, Content, Email, System (activeConfigTab)
- [ ] Each ConfigurationSetting shows: displayName, description, current value, default value
- [ ] Edit setting: change value, provide reason, save
- [ ] Reset to default button (with reason required)
- [ ] System health display (systemHealth)
- [ ] configurationLoading state

**Responsive**
- [ ] Stats cards adapt to mobile grid
- [ ] Modals scrollable on mobile
- [ ] Tabs scroll horizontally if needed
- [ ] Tables/lists fit or scroll on small screens

---

### 13. Admin Reports (/admin/reports)

- [ ] Dedicated page with Navigation
- [ ] Filter controls: status, priority, category, assigned admin, search text (filters state)
- [ ] Reports list with status/priority color-coded badges
- [ ] Click report -> load details (reportDetails with actions, relatedReports, violationHistory)
- [ ] Detail panel: reporter info, reported user, reason, evidence, timestamps
- [ ] Action modal (actionModalOpen):
  - [ ] Action selector (warn, suspend, ban, dismiss)
  - [ ] Reason textarea
  - [ ] Duration field (for suspensions)
  - [ ] Notify user checkbox
  - [ ] Submit (submittingAction spinner)
- [ ] Statistics summary: statusBreakdown, priorityBreakdown, categoryBreakdown
- [ ] Pagination (pagination state with hasNext/hasPrev)
- [ ] Reopen resolved report (reopenModalOpen with reopenReason)
- [ ] Back button with ArrowLeft -> navigate(-1) or /admin

---

### 14. About Us Page (/about)

- [ ] Navigation and Footer present
- [ ] AdvanceLanding component renders (about_us_actual_landing.tsx)
- [ ] Feature showcase: 6 AI feature cards with icons (Brain, Upload, FileText, Bell, MousePointerClick, Shield)
- [ ] Scenario tabs: Quick, Full, Employer -- click to switch
- [ ] Each scenario shows 3 expandable steps
- [ ] Stats counters animate on scroll into view (Framer Motion useInView)
- [ ] RotatingContact component at bottom with rotating contact methods
- [ ] Contact section has id="contact-section" for footer deep linking
- [ ] All text in Albanian
- [ ] Images load without broken placeholders

**Responsive**
- [ ] Feature cards stack on mobile (1 column)
- [ ] Scenario cards adapt
- [ ] Contact section usable on mobile
- [ ] Animations smooth on mobile

---

### 15. Employers Page (/employers) -- Non-Registration Content

- [ ] Hero section with employer benefits messaging
- [ ] CompaniesComponent with company showcase/logos
- [ ] RotatingContact component for employer inquiries
- [ ] Pricing information if displayed
- [ ] "Posto Pune" CTA navigates appropriately based on auth state

---

### 16. Jobseekers Page (/jobseekers) -- Non-Registration Content

- [ ] JobSearchHero component with search CTA
- [ ] CVCreatorSection with id="ai-cv-section":
  - [ ] Textarea for self-description
  - [ ] Generate button triggers AI
  - [ ] Loading state during generation
  - [ ] Preview with formatted CV result
  - [ ] Download generated CV
- [ ] Feature descriptions and benefits sections
- [ ] RotatingContact component

---

### 17. Cookie Consent Banner

- [ ] Banner appears at bottom (fixed bottom-0, z-[9999]) after 500ms delay on first visit
- [ ] Only appears when localStorage "cookie-consent-accepted" is NOT set
- [ ] Shows Albanian message: "Kjo faqe perdor cookies per funksionimin baze te platformes."
- [ ] "Politika e Privatesise" link navigates to /privacy
- [ ] Cookie icon visible on desktop (hidden sm:block)
- [ ] "Pranoj" (Accept) button:
  - [ ] Sets localStorage "cookie-consent-accepted" = "true"
  - [ ] Banner disappears with slide-down transition
  - [ ] If user is logged in: also calls usersApi.recordCookieConsent() server-side
- [ ] Banner does NOT appear on subsequent visits
- [ ] Test in incognito: banner appears fresh
- [ ] Mobile: text and button fit without overflow (flex-col sm:flex-row layout)
- [ ] z-index above page content (9999) but below nothing (highest)

---

### 18. Robot Assistant (Floating Bot)

**Visibility Rules**
- [ ] Appears for non-authenticated users only (!isAuthenticated)
- [ ] Hidden when authenticated (any role)
- [ ] Hidden on specific paths: /jobseekers, /login, /register, /profile, /employer-dashboard, /admin
- [ ] Position: fixed bottom-6 right-6 z-[9998]

**Bot Interaction**
- [ ] Bot icon (circular button) visible in bottom-right
- [ ] Click toggles popup menu (isOpen)
- [ ] Menu has:
  - [ ] "Regjistrohu" (Register) option -> navigates to registration
  - [ ] "Krijo CV" option -> navigates to /jobseekers, scrolls to #ai-cv-section
  - [ ] #ai-cv-section scroll uses retry logic (15 attempts, 200ms intervals)
- [ ] Menu closes on route change
- [ ] Menu has entrance/exit animation (Framer Motion)

**Scroll-to-Top**
- [ ] Scroll-to-top button (ChevronUp) appears when scrolled > 400px
- [ ] Click scrolls to top smoothly
- [ ] Visible even when bot is hidden (showScrollTop independent check)
- [ ] Both bot and scroll-top hidden when neither applicable

---

## Priority: MEDIUM

These items improve user experience and polish.

---

### 19. Forgot Password (/forgot-password)

- [ ] Navigation present
- [ ] Card centered: title "Rivendos Fjalekalimin", description text
- [ ] Email input with Mail icon
- [ ] Submit with valid email: success toast (generic -- "Nese kjo adrese emaili ekziston...")
- [ ] Submit with empty email: error toast "Ju lutemi vendosni adresen tuaj te emailit."
- [ ] "Duke derguar..." loading state on button (isLoading)
- [ ] Email field clears after successful submission
- [ ] API error: error toast
- [ ] "Kthehu te Kycja" link navigates to /login

### 20. Reset Password (/reset-password?token=...)

**With valid token:**
- [ ] Shows form: "Fjalekalimi i Ri" and "Konfirmo Fjalekalimin" fields with Lock icons
- [ ] Both fields type="password" with minLength={8} and autoComplete="new-password"
- [ ] Passwords must match: mismatch shows error toast
- [ ] Password < 8 characters: error toast
- [ ] Successful reset: toast "Fjalekalimi u rivendos", redirect to /login
- [ ] "Duke rivendosur..." loading state (isLoading)

**Without token or expired token:**
- [ ] Shows "Link i Pavlefshem" card with message
- [ ] "Kerko nje link te ri" button navigates to /forgot-password
- [ ] "Kthehu te Kycja" link to /login

### 21. Privacy Policy (/privacy)

- [ ] Navigation and Footer present
- [ ] Gradient header with Shield icon: "Politika e Privatesise"
- [ ] Full policy content in Albanian
- [ ] Sections with icons: Shield, Database, Cookie, UserCheck, Mail, Eye, etc.
- [ ] Proper heading hierarchy (h1, h2, h3)
- [ ] Scrollable on all devices
- [ ] Links within content work

### 22. Terms of Service (/terms)

- [ ] Navigation and Footer present
- [ ] Gradient header with FileText icon: "Kushtet e Perdorimit"
- [ ] Full terms content in Albanian
- [ ] Sections with icons: BookOpen, UserCog, ShieldAlert, Briefcase, etc.
- [ ] Proper heading hierarchy
- [ ] Scrollable on all devices

### 23. Unsubscribe (/unsubscribe?token=...)

- [ ] Navigation present
- [ ] With valid token: shows "Cregjistrimi nga Email-et" confirmation card
- [ ] "Confirm" button to proceed (POST request, not GET -- prevents email scanner auto-trigger)
- [ ] Loading state during processing
- [ ] Success: CheckCircle, confirmation message
- [ ] Error: XCircle, error message
- [ ] Without token: error message "Lidhja e cregjistrimit nuk eshte e vlefshme. Mungon token-i."
- [ ] Card centered, max-w-md

### 24. Preferences (/preferences?token=...)

- [ ] Navigation present
- [ ] With valid token: loads quick user preferences (fetches via GET)
- [ ] Email notifications toggle (emailNotifications)
- [ ] Interest categories: checkboxes for all 14 Albanian job categories
- [ ] Save button with loading state (saving)
- [ ] Success/error toasts
- [ ] Without token: error message "Lidhja nuk eshte e vlefshme. Mungon token-i."
- [ ] Status states: loading -> ready -> (error)

### 25. 404 Not Found Page

- [ ] Visiting /this-does-not-exist shows NotFound page
- [ ] Navigation and Footer present
- [ ] Large "404" text (text-6xl, gray-300)
- [ ] "Faqja nuk u gjet" heading
- [ ] "Faqja qe po kerkoni nuk ekziston ose eshte zhvendosur." description
- [ ] "Kthehu ne faqen kryesore" link navigates to /
- [ ] Page centered vertically

### 26. Footer

- [ ] Present on: landing, about, job detail, saved jobs, companies, employers, jobseekers, privacy, terms, not-found
- [ ] Four columns on desktop:
  - [ ] "advance.al" -- description + Mail icon (mailto:info@advance.al)
  - [ ] "Per Punekerkuesit" -- links
  - [ ] "Per Punedhënesit" -- links
  - [ ] "Mbeshtëtje" -- links

**Link Verification:**
- [ ] "Shfleto Punet" -> /jobs (via handleNavigation)
- [ ] "Regjistrohu" -> /jobseekers?signup=true
- [ ] "Gjenero CV me AI" -> /jobseekers + scroll to #ai-cv-section (handleAnchorNavigation)
- [ ] "Regjistrohu si Punedhenes" -> /employers
- [ ] "Rreth Nesh" -> /about
- [ ] "Kontakti" -> /about + scroll to #contact-section
- [ ] "Politika e Privatesise" -> /privacy
- [ ] "Termat e Sherbimit" -> /terms
- [ ] "Kompanite" links NOT visible (commented out)

**Bottom Bar:**
- [ ] Copyright: "(c) 2026 advance.al. Te gjitha te drejtat e rezervuara."
- [ ] "Made by jxsoft.al" link opens https://jxsoft.al in new tab (target="_blank" rel="noopener noreferrer")

**Responsive:**
- [ ] Desktop: 4-column grid
- [ ] Mobile: columns stack vertically (grid-cols-1 md:grid-cols-4)
- [ ] Bottom bar: stacks on mobile (flex-col sm:flex-row)

### 27. Onboarding Guide System

**New User Banner (profile < 30% complete)**
- [ ] Appears on landing page for logged-in jobseekers with low profile completion
- [ ] Shows "Mire se erdhe, [firstName]!" greeting
- [ ] Progress bar showing profilePct percentage
- [ ] Checklist with checkmarks: account created, CV uploaded, profile completed
- [ ] "Gjenero CV" button -> /profile
- [ ] "Ploteso Profilin" button -> /profile
- [ ] Dismiss X button hides banner (dismiss function)
- [ ] Framer Motion entrance/exit animation

**Returning User Banner (profile 30-90%)**
- [ ] Shows specific nextStep recommendation
- [ ] Progress percentage visible
- [ ] Dismissible

**Not shown when:**
- [ ] variant is null (profile > 90%, or not applicable)
- [ ] User is employer or admin
- [ ] User is not authenticated

### 28. Report User Flow

**From Employer Dashboard Applicant View**
- [ ] "Raporto" button in applicant details opens ReportUserModal
- [ ] Modal pre-fills: userId, userName of the applicant
- [ ] Report form: category dropdown, description textarea
- [ ] Submit creates report with success toast

**From Dedicated Page (/report-user?userId=...&userName=...)**
- [ ] Requires authentication (ProtectedRoute)
- [ ] Loads with back button (ArrowLeft -> navigate(-1))
- [ ] Auto-opens ReportUserModal (modalOpen starts true)
- [ ] Without userId param: redirects to /
- [ ] Closing modal navigates back (handleModalClose -> navigate(-1))

### 29. Error Handling & Edge Cases

**Error Boundary**
- [ ] ErrorBoundary wraps entire app
- [ ] If any component crashes, shows fallback UI (not white screen)
- [ ] Fallback offers retry/refresh option

**Network Errors**
- [ ] Disconnect internet: error toasts appear on API calls (not unhandled promise rejections)
- [ ] Reconnect: functionality resumes
- [ ] Slow network: loading spinners visible

**Page Loader**
- [ ] Lazy-loaded pages show PageLoader spinner (centered, animate-spin)
- [ ] After load: page renders completely, spinner disappears
- [ ] No flash of empty content

**Toast Notifications**
- [ ] Success toasts: shadcn Toaster, appropriate styling
- [ ] Error toasts: variant="destructive" red styling
- [ ] Toasts appear top-right (Toaster position)
- [ ] Mantine notifications also work (top-right, z-10000)
- [ ] Auto-dismiss after timeout
- [ ] Multiple toasts stack without overlapping

**Scroll Behavior**
- [ ] ScrollToTop component: route changes scroll to top
- [ ] ScrollToTopButton: appears after scrolling, click smooth-scrolls to top
- [ ] No scroll jump when modals open/close
- [ ] Body overflow reset on page unmount (useEffect cleanup in multiple pages)

### 30. Employer Register Standalone (/employer-register)

- [ ] EmployerRegister page loads (separate from /employers)
- [ ] Same registration flow
- [ ] Redirects appropriately after completion

---

## Priority: LOW

These items are polish, edge-case, and cross-cutting concerns.

---

### 31. Responsive Breakpoints -- Full Sweep

Run through EVERY page at each width. For each, verify:
- No horizontal scrollbar
- No text overflow hiding critical info
- Buttons are tappable (min 44x44px touch targets)
- Modals/dialogs don't extend beyond viewport
- Images scale correctly (no stretching/pixelation)

**375px (iPhone SE / small mobile)**
- [ ] Landing page (/ with search, filters, job list)
- [ ] Job detail page (/jobs/:id with apply, save, similar)
- [ ] Login page (/login)
- [ ] Register page (/register)
- [ ] Jobseeker registration (/jobseekers with form, CV generator)
- [ ] Employer registration (/employers with multi-step form)
- [ ] Profile - Personal tab
- [ ] Profile - Work Experience tab (modals)
- [ ] Profile - Applications tab
- [ ] Profile - Settings tab
- [ ] Employer Dashboard - Jobs tab
- [ ] Employer Dashboard - Applicants tab (detail modal)
- [ ] Employer Dashboard - Settings tab
- [ ] Post Job (all 4 steps)
- [ ] Edit Job
- [ ] Admin Dashboard (all tabs)
- [ ] Admin Reports
- [ ] About Us
- [ ] Saved Jobs
- [ ] Privacy, Terms pages
- [ ] Forgot Password, Reset Password
- [ ] 404 page
- [ ] Footer on all pages

**768px (iPad / tablet)**
- [ ] All pages from 375px list above
- [ ] Two-column layouts appear where applicable
- [ ] Navigation shows desktop links (not hamburger)

**1024px (small laptop)**
- [ ] Landing page sidebar filters visible
- [ ] Dashboard layouts have proper spacing
- [ ] Modals centered with appropriate max-width

**1440px+ (desktop)**
- [ ] All pages have max-width containers (no full-bleed stretching)
- [ ] Content centered with proper margins
- [ ] 3D animation renders well at high resolution

---

### 32. Browser Compatibility

Test core flows (landing, search, login, apply, profile, employer dashboard) in:
- [ ] **Chrome** (latest) -- primary browser
- [ ] **Firefox** (latest) -- form styling, date pickers, animations
- [ ] **Safari** (latest macOS) -- WebGL/Three.js, date inputs, smooth scroll, position:fixed
- [ ] **Edge** (latest) -- general compatibility
- [ ] **Safari iOS** (iPhone) -- touch interactions, fixed positioning, viewport height (100vh bug), keyboard behavior
- [ ] **Chrome Android** -- touch, keyboard, viewport

**Specific browser concerns:**
- [ ] Three.js/R3F 3D Canvas renders in Safari (WebGL2 support)
- [ ] Date inputs: Safari may not support input[type="date"] natively (check Mantine date pickers)
- [ ] Smooth scroll behavior: scroll-behavior CSS and window.scrollTo({behavior:'smooth'})
- [ ] Framer Motion animations: smooth in all browsers, no jank
- [ ] PinInput (Mantine): auto-focus and paste work in all browsers
- [ ] Embla Carousel (PremiumJobsCarousel): touch swipe on mobile browsers
- [ ] FileInput: file picker works on all platforms (especially iOS Safari)
- [ ] backdrop-filter (if used): requires -webkit- prefix for Safari

---

### 33. Accessibility (Basic)

- [ ] Tab key navigation works through all interactive elements on each page
- [ ] Focus indicators (outlines) visible on buttons, links, inputs when focused
- [ ] Form labels associated with inputs via htmlFor/id (clicking label focuses input)
- [ ] Alt text on images: logo ("Logo"), profile photos ("Profile")
- [ ] aria-label on icon-only buttons (e.g., bell, hamburger, close buttons)
- [ ] Color contrast: text readable against backgrounds (WCAG AA minimum)
  - [ ] Especially: colored badges, muted-foreground text, primary-foreground on primary bg
- [ ] Error messages: destructive alerts have role="alert" or aria-live for screen readers
- [ ] Modal focus trap: Tab stays within open dialogs/modals
- [ ] Escape key closes: modals, dropdowns, notification panel
- [ ] Skip links or landmark roles for main content navigation

---

### 34. Performance Checks

- [ ] Landing page initial load: < 3 seconds on broadband (check Network tab)
- [ ] 3D animation CPU: < 50% after initial render (check Performance tab)
- [ ] Lazy-loaded pages: no visible loading flash on fast connection
- [ ] Images optimized: no multi-MB images (check Network tab sizes)
- [ ] No memory leaks: navigate between pages 20+ times, check Memory tab
- [ ] Pagination: only fetches current page data (not re-fetching everything)
- [ ] Notification polling: 60s interval, pauses when document.visibilityState !== 'visible'
- [ ] React Query: staleTime 30s prevents excessive refetches
- [ ] React Query: refetchOnWindowFocus disabled
- [ ] No console.log spam in production build (only console.error for real errors)

---

### 35. Security (Frontend)

- [ ] Auth token stored in localStorage as "authToken"
- [ ] Protected routes (ProtectedRoute) redirect to /login when no token
- [ ] Protected routes check allowedUserTypes -- wrong role redirected
- [ ] No API keys, secrets, or credentials in page source or JS bundles
- [ ] XSS test: enter `<script>alert(1)</script>` in search, form fields -- no script execution
- [ ] XSS test: enter `<img src=x onerror=alert(1)>` in text fields -- no execution
- [ ] URL manipulation: /admin as jobseeker -> redirected with error toast
- [ ] URL manipulation: /employer-dashboard as jobseeker -> redirected
- [ ] URL manipulation: /profile as employer -> redirected
- [ ] Expired/tampered token: API calls return 401, user prompted to re-login gracefully
- [ ] VITE_API_URL: no trailing double /api/api in network requests

---

### 36. Data Integrity Cross-Flow Checks

These verify that data flows correctly between different user roles and pages:

- [ ] Employer posts a job -> job appears on landing page for guests/jobseekers
- [ ] Jobseeker applies -> application appears in:
  - [ ] Jobseeker's Profile > Applications tab
  - [ ] Employer's Dashboard > Applicants tab
- [ ] Employer changes application status -> jobseeker sees updated status in Applications tab AND receives notification
- [ ] Jobseeker saves a job -> appears in /saved-jobs
- [ ] Jobseeker unsaves -> disappears from /saved-jobs
- [ ] Jobseeker uploads CV -> employer can download CV from applicant detail
- [ ] Profile update -> changes persist after logout/login cycle
- [ ] Employer deletes a job -> disappears from all listings
  - [ ] Existing applications for deleted job: verify graceful handling
- [ ] Admin approves employer -> employer can now post jobs
- [ ] Admin rejects employer -> employer cannot post jobs
- [ ] Admin sends bulk notification -> all targeted users receive it in bell dropdown

---

### 37. Edge Cases & Stress Tests

**Content Edge Cases**
- [ ] Very long job title (200+ chars): truncates or wraps, doesn't break card layout
- [ ] Very long company name: same behavior
- [ ] Very long description: scrollable, doesn't push other content off-screen
- [ ] Job with no salary info: shows "Page per t'u negociuar" or hides salary section
- [ ] Job with min=max salary: shows single number (e.g., "1000 EUR")
- [ ] Job with only min salary: shows "Nga 1000 EUR"
- [ ] Job with only max salary: shows "Deri ne 1000 EUR"
- [ ] Job with 0 applicants: shows "0 aplikues" not blank
- [ ] User with no profile photo: shows initials fallback in Avatar
- [ ] User with very long name: truncates in nav dropdown without breaking layout
- [ ] Empty database (no jobs): landing page shows empty state, not error

**Interaction Edge Cases**
- [ ] Multiple rapid clicks on apply button: only ONE application created (isSubmitting guard)
- [ ] Multiple rapid clicks on save/bookmark: only one save/unsave (savingJob guard)
- [ ] Multiple rapid clicks on form submit: only one submission (loading guard on all forms)
- [ ] Back button behavior: preserves scroll position and search/filter state where possible
- [ ] Refresh on protected page while logged in: stays on page
- [ ] Multiple browser tabs: no auth conflicts or stale data causing errors
- [ ] Paste into PinInput: all 6 digits populate correctly
- [ ] Upload non-image file as profile photo: rejected with error
- [ ] Upload > 5MB CV: rejected with error
- [ ] Upload malicious filename: handled safely

---

## Post-QA Sign-off

| Area | Tester | Date | Status | Notes |
|------|--------|------|--------|-------|
| CRITICAL -- Landing & Search | | | | |
| CRITICAL -- Auth (Login/Register) | | | | |
| CRITICAL -- Jobseeker Registration | | | | |
| CRITICAL -- Employer Registration | | | | |
| CRITICAL -- Job Detail & Apply | | | | |
| CRITICAL -- Jobseeker Profile | | | | |
| CRITICAL -- Employer Dashboard | | | | |
| CRITICAL -- Post/Edit Job | | | | |
| CRITICAL -- Saved Jobs | | | | |
| HIGH -- Navigation & Notifications | | | | |
| HIGH -- Admin Dashboard | | | | |
| HIGH -- Admin Reports | | | | |
| HIGH -- About Us | | | | |
| HIGH -- Employers/Jobseekers Pages | | | | |
| HIGH -- Cookie Consent & Robot | | | | |
| MEDIUM -- Password Reset Flow | | | | |
| MEDIUM -- Legal Pages | | | | |
| MEDIUM -- Unsubscribe/Preferences | | | | |
| MEDIUM -- 404 & Footer | | | | |
| MEDIUM -- Onboarding & Reports | | | | |
| MEDIUM -- Error Handling | | | | |
| LOW -- Responsive Sweep (375px) | | | | |
| LOW -- Responsive Sweep (768px) | | | | |
| LOW -- Responsive Sweep (1024px+) | | | | |
| LOW -- Browser: Chrome | | | | |
| LOW -- Browser: Firefox | | | | |
| LOW -- Browser: Safari | | | | |
| LOW -- Browser: Edge | | | | |
| LOW -- Browser: iOS Safari | | | | |
| LOW -- Browser: Android Chrome | | | | |
| LOW -- Accessibility | | | | |
| LOW -- Performance | | | | |
| LOW -- Security (Frontend) | | | | |
| LOW -- Data Integrity Cross-Flow | | | | |
| LOW -- Edge Cases | | | | |

**Total Checklist Items: ~450+**

**QA Complete:** [ ] Yes / [ ] No
**Issues Found:** ___
**Blocking Issues:** ___
**Sign-off Date:** ___
**Signed By:** ___
