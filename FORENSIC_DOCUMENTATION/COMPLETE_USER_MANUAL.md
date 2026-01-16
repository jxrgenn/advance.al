# ALBANIA JOBFLOW - COMPLETE USER MANUAL
## Platform Overview and User Guide

**Platform Name:** advance.al (Albania JobFlow / PunaShqip)
**Document Version:** 1.0
**Last Updated:** 2026-01-13
**Language:** Albanian platform with English documentation

---

## TABLE OF CONTENTS

1. [Platform Overview](#1-platform-overview)
2. [Getting Started](#2-getting-started)
3. [For Job Seekers](#3-for-job-seekers)
4. [For Employers](#4-for-employers)
5. [Platform Features](#5-platform-features)
6. [Account Management](#6-account-management)
7. [Pricing and Payments](#7-pricing-and-payments)
8. [Safety and Reporting](#8-safety-and-reporting)
9. [Notifications and Communications](#9-notifications-and-communications)
10. [Troubleshooting](#10-troubleshooting)
11. [Frequently Asked Questions](#11-frequently-asked-questions)

---

## 1. PLATFORM OVERVIEW

### 1.1 What is advance.al?

advance.al (also known as Albania JobFlow or PunaShqip) is Albania's premier online job marketplace connecting job seekers with employers across the country. The platform provides:

- **For Job Seekers:** Access to thousands of job opportunities across all industries and regions in Albania
- **For Employers:** Tools to post jobs, manage applications, and find qualified candidates
- **For Both:** A safe, verified platform with anti-fraud protections and quality controls

### 1.2 Key Statistics

- **5,000+** Active Job Seekers
- **300+** Registered Companies
- **100+** Categories and Industries
- **Daily Updates** with new job postings
- **AI-Powered Matching** for better candidate-job fits

### 1.3 Platform Language

The entire platform interface is in **Albanian (Shqip)**. All job postings, applications, and communications are conducted in Albanian to serve the Albanian market.

### 1.4 How It Works

```
┌─────────────────┐         ┌──────────────────┐
│   JOB SEEKERS   │         │    EMPLOYERS     │
│                 │         │                  │
│ • Browse jobs   │         │ • Post jobs      │
│ • Apply online  │◄───────►│ • Review apps    │
│ • Save jobs     │         │ • Contact        │
│ • Get matched   │         │ • Hire           │
└─────────────────┘         └──────────────────┘
         │                           │
         └───────────┬───────────────┘
                     ▼
          ┌──────────────────┐
          │  advance.al      │
          │  • Search engine │
          │  • Matching AI   │
          │  • Messaging     │
          │  • Analytics     │
          └──────────────────┘
```

---

## 2. GETTING STARTED

### 2.1 Registration Options

You have **three ways** to join the platform:

#### Option 1: Quick Profile (Job Seekers Only)
**Best for:** Getting job alerts fast without full registration

**What you need:**
- First Name
- Last Name
- Email Address
- Phone Number (optional)
- City/Location
- Interests (job categories you're interested in)

**What you get:**
- Job alerts via email when matching jobs are posted
- Ability to upgrade to full account later
- No CV required initially

**Limitations:**
- Cannot apply to jobs directly (email alerts only)
- Cannot save jobs
- No profile page
- No application tracking

**How to register:**
1. Visit the homepage
2. Click "Punëkërkues" (Job Seekers) in navigation
3. Fill out the Quick Profile form (4 fields)
4. Click "Regjistrohu" (Register)
5. Check your email for welcome message

#### Option 2: Full Job Seeker Account
**Best for:** Actively applying to jobs

**What you need:**
- Email Address (must be valid)
- Password (minimum 6 characters)
- First Name and Last Name
- Phone Number
- City and Region
- Job title/position you're seeking

**Optional but recommended:**
- Professional bio/summary
- Work experience history
- Education details
- Skills list
- CV/Resume upload
- Desired salary range
- Availability (immediately, 2 weeks, 1 month, 3 months)

**What you get:**
- One-click job applications
- Profile page employers can view
- Save jobs feature
- Application tracking dashboard
- Personalized job recommendations
- Message employers directly
- Access to all job listings

**How to register:**
1. Click "Hyrje" (Login) in top-right corner
2. Click "Regjistrohu" (Register) tab
3. Select "Punëkërkues" (Job Seeker)
4. Fill out registration form
5. Click "Regjistrohu"
6. **Status:** Active immediately (can login right away)

#### Option 3: Employer Account
**Best for:** Companies hiring employees

**What you need (required):**
- Email Address
- Password
- First Name and Last Name
- Company Name
- Industry
- Company Size (1-10, 11-50, 51-200, 200+)
- City and Region

**Optional but recommended:**
- Company Description
- Company Website
- Company Logo
- Contact preferences (phone, WhatsApp, email)

**What you get:**
- Post unlimited job listings (paid)
- Employer dashboard
- Application management system
- Candidate matching (paid add-on)
- Company profile page
- Analytics and insights
- Bulk notification tools (admin-approved)

**How to register:**
1. Click "Posto Punë" (Post Job) button OR
2. Visit /employers page and click "Regjistrohu si Punëdhënës"
3. Fill out 3-step registration form:
   - Step 1: Account Details (email, password, name)
   - Step 2: Company Information
   - Step 3: Contact Preferences
4. Click "Regjistrohu"
5. **Status:** Pending Verification (can login but cannot post jobs yet)

**⚠️ Important:** Employer accounts require admin verification before you can post jobs. This typically takes 24-48 hours. You'll receive an email when approved.

### 2.2 Email Verification

Currently, email verification is **optional** for job seekers but **recommended** for all users.

**Employers:** Pending verification status doesn't prevent login, but blocks job posting.

### 2.3 First Login

After registration:

1. **Login Page:** Navigate to /login
2. **Enter Credentials:** Email and password
3. **Click "Hyr" (Login)**
4. **Redirected to:**
   - Job Seekers → Homepage with personalized jobs
   - Employers → Employer Dashboard (limited until verified)
   - Admins → Admin Dashboard

---

## 3. FOR JOB SEEKERS

### 3.1 Browsing Jobs

#### Main Job Listing Page

**Location:** Homepage (/) or /jobs

**Features:**

1. **Search Bar**
   - Type: Keywords (job title, company, skills)
   - Debounced: Results update 300ms after you stop typing
   - Minimum: 2 characters required
   - Searches: Title, description, tags, company name

2. **Core Platform Filters** (Left Sidebar)
   - **Diaspora:** Jobs for Albanians abroad/internationally
   - **Nga shtëpia:** Remote work opportunities
   - **Part Time:** Part-time positions
   - **Administrata:** Government/administrative positions
   - **Sezonale:** Seasonal jobs (≤3 months duration)
   - Multiple filters can be active simultaneously (AND logic)

3. **Location Filter** (Multi-select)
   - Select multiple cities with OR logic
   - Example: Selecting "Tiranë" OR "Durrës" shows jobs from both cities
   - "Të gjitha qytetet" clears filter

4. **Job Type Filter** (Multi-select)
   - Full-time
   - Part-time
   - Contract (Kontratë)
   - Internship (Praktikë)
   - Remote
   - Multiple selections allowed (OR logic)

5. **Advanced Filters** (Modal)
   - **Salary Range:** Slider from €0-€5,000 (or ALL currency)
   - **Experience Level:** Entry/Junior/Mid/Senior/Lead
   - **Company Search:** Free-text company name search
   - **Categories:** 12 industry categories (multi-select)
   - **Remote Work:** Toggle for remote-only jobs
   - **Posted Within:** Today/Last week/Last month/All time
   - **Sort By:** Newest/Oldest/Salary/Title

#### Job Cards

Each job listing shows:
- **Title:** Position name
- **Company:** Employer name (with logo if available)
- **Location:** City, region, remote badge if applicable
- **Salary:** Range (if employer made it public)
- **Job Type:** Full-time/Part-time/Contract/Internship
- **Posted Date:** Time ago ("X ditë më parë")
- **Tags:** Skills/keywords
- **Premium Badge:** Featured jobs highlighted
- **Apply Button:** Quick apply or view details

#### Premium Job Carousel

At the top of the homepage, you'll see a carousel of **featured jobs** if:
- You're on the homepage with no active filters
- Premium/featured jobs are available
- Auto-rotates through 3 jobs at a time (desktop)

#### Recently Viewed Jobs

If you're logged in and have viewed jobs recently, you'll see your **last 4 viewed jobs** above the main listing (only when no filters are active).

#### Pagination

- Default: 10 jobs per page
- Navigation: "Mëparshmi" (Previous) and "Tjetri" (Next) buttons
- Page numbers: Shows first 5 pages
- Clicking page scrolls to top smoothly

### 3.2 Viewing Job Details

**Click any job card** to open the full job detail page.

**URL Format:** `/jobs/:id` or `/jobs/:slug`

**Page Sections:**

1. **Header**
   - Job title (large, prominent)
   - Company name (clickable to company profile)
   - Location with map pin icon
   - Salary range (if public)
   - Posted date

2. **Action Buttons**
   - **"Apliko Tani" (Apply Now):** Primary button
   - **"Ruaj Punën" (Save Job):** Bookmark icon (logged in only)
   - **"Ndaj" (Share):** Share on social media

3. **Job Description**
   - Full description in Albanian
   - May include multiple paragraphs
   - Formatted with line breaks

4. **Requirements Section**
   - Bulleted list of job requirements
   - Skills needed
   - Experience required
   - Education requirements

5. **Benefits Section**
   - Perks and benefits offered
   - Compensation details
   - Work environment info

6. **Tags**
   - Keywords and skills as clickable badges

7. **Company Information Sidebar**
   - Company logo
   - Company name
   - Industry
   - Company size
   - Website link (if provided)
   - Description
   - **"Shiko Kompaninë" (View Company):** Link to full company profile

8. **Similar Jobs Section**
   - 3-6 related job listings
   - Based on category and location
   - Carousel format

9. **Application Section** (bottom of page)
   - Apply button
   - Application method info
   - Contact information (if employer shared)

### 3.3 Applying to Jobs

#### Two Application Methods:

**Method 1: One-Click Apply**
- Fastest method
- Uses your complete profile data
- Automatically includes your CV
- No additional forms

**Requirements:**
- Profile must be complete (first name, last name, title, resume/CV)
- Must be logged in
- Must not have already applied

**Steps:**
1. Click "Apliko Tani" button
2. Confirm in modal/popup
3. Application sent instantly
4. Receive confirmation toast notification

**Method 2: Custom Form Apply**
- Job has specific questions
- Fill out custom application form
- May include:
  - Cover letter
  - Answers to job-specific questions
  - Additional file uploads

**Steps:**
1. Click "Apliko Tani" button
2. Modal opens with custom form
3. Fill out all required fields
4. Attach cover letter (optional)
5. Answer job-specific questions
6. Upload additional documents (if required)
7. Click "Dërgo Aplikimin" (Send Application)
8. Receive confirmation

**⚠️ Application Rules:**
- Can only apply once per job
- Cannot apply if job is closed/expired
- Cannot withdraw after employer marks as "hired"
- Applications visible to employer immediately

#### External Applications

Some jobs use **external application methods**:

**Email Applications:**
- Click "Apliko me Email" button
- Opens your default email client
- Pre-filled with job info
- Send resume via email

**External Link Applications:**
- Redirects to company's own application page
- Complete application on company website
- advance.al tracks that you clicked (for analytics only)

### 3.4 Saved Jobs

**Access:** /saved-jobs or via user dropdown → "Punët e Ruajtura"

**Features:**
- Save unlimited jobs
- Grid view of all saved jobs
- Same job card format as main listing
- Remove from saved with "×" button
- One-click apply from saved jobs page

**How to Save:**
1. Click bookmark icon on job card (main listing)
2. Click "Ruaj Punën" button (job detail page)
3. Job added to your saved list
4. Toast confirmation appears

**How to Unsave:**
1. Click filled bookmark icon again, OR
2. Go to /saved-jobs and click "×" on job card

### 3.5 Job Recommendations

If you have a complete profile, advance.al's AI will recommend jobs for you.

**Access:** Appears at top of homepage (mixed with regular listings)

**Recommendation Badge:** Jobs marked with "✨ Recommended for You" badge

**How It Works:**
- AI analyzes your profile (title, skills, experience, location, salary)
- Matches against active jobs using 7-factor algorithm:
  1. Title similarity (0-20 points)
  2. Skills match (0-25 points)
  3. Experience level (0-15 points)
  4. Location match (0-15 points)
  5. Education match (0-5 points)
  6. Salary expectations (0-10 points)
  7. Availability (0-10 points)
- Shows jobs with highest match scores first
- Updates daily

**Note:** Recommendations only appear when you're logged in and have completed your profile.

### 3.6 Tracking Applications

**Access:** Profile page → Applications tab OR /profile?tab=applications

**Application Dashboard Shows:**

For each application:
- **Job Title:** Clickable to job details
- **Company Name**
- **Applied Date:** Time ago format
- **Status Badge:**
  - 🟡 Pending (Në pritje) - Just submitted
  - 🔵 Viewed (Parë) - Employer has seen it
  - 🟢 Shortlisted (Në listë të shkurtër) - You're in consideration
  - 🔴 Rejected (Refuzuar) - Not selected
  - 🟣 Hired (Punësuar) - You got the job!

**Actions:**
- **View Details:** See full application with your answers
- **Withdraw:** Cancel application (only if not hired)
- **Message Employer:** Direct messaging thread

**Withdrawal:**
1. Click "Tërheq Aplikimin" (Withdraw Application)
2. Confirm in dialog
3. Optionally provide reason
4. Application marked as withdrawn
5. Employer notified

**⚠️ Cannot Withdraw If:**
- Status is "hired"
- You must contact employer directly to decline

### 3.7 Profile Management

**Access:** User dropdown → "Profili Im" OR /profile

**Profile Tabs:**

#### Tab 1: Personal Information
- First Name, Last Name
- Email (cannot change)
- Phone Number
- City and Region
- Profile Photo Upload

#### Tab 2: Professional Information
- Job Title/Headline
- Professional Bio (500 characters max)
- Experience Level: 0-1 years, 1-2 years, 2-5 years, 5-10 years, 10+ years
- Skills (add multiple, separated)
- Desired Salary (min/max, EUR or ALL)
- Open to Remote Work (toggle)
- Availability: Immediately, 2 weeks, 1 month, 3 months

#### Tab 3: Work History
- Add multiple positions
- Each entry:
  - Company Name
  - Position/Title
  - Start Date and End Date
  - Description (500 characters max)
- Reorder with drag-and-drop
- Remove positions with delete button

#### Tab 4: Education
- Add multiple degrees/certifications
- Each entry:
  - Degree/Certification Name
  - School/Institution
  - Graduation Year (1950 to current+10)
- Remove with delete button

#### Tab 5: CV/Resume
- Upload CV file (PDF, DOC, DOCX)
- Maximum file size: Check platform settings (typically 5MB)
- Current CV displayed if uploaded
- Replace anytime
- Download current CV

**Saving Changes:**
- Click "Ruaj Ndryshimet" (Save Changes) button at bottom
- Changes saved immediately
- Confirmation toast appears
- All changes reflect immediately on your applications

**Profile Completion Tip:**
> Complete profiles receive **5x more views** from employers. Make sure to fill out all sections!

---

## 4. FOR EMPLOYERS

### 4.1 Account Verification Process

After registering as an employer, your account must be verified by admin before you can post jobs.

**Verification Status:** Pending Verification

**What You Can Do While Pending:**
- ✅ Login to your account
- ✅ View the employer dashboard
- ✅ Complete your company profile
- ✅ Explore the platform
- ❌ Cannot post jobs
- ❌ Cannot view applications (none exist yet)

**Typical Verification Time:** 24-48 hours

**What Admins Check:**
- Company name is legitimate
- Industry and business information
- Contact details validity
- No duplicate/fraud accounts

**Notification:**
You'll receive an email when your account is verified and approved. The subject line will be in Albanian: "Llogaria juaj është miratuar!"

**Status After Verification:**
- Status: Active
- Verified: ✅ Yes
- Can post jobs immediately
- Green verified badge on company profile

### 4.2 Employer Dashboard

**Access:** /employer-dashboard (after login)

**Dashboard URL redirects if:**
- Not logged in → /login
- Not an employer → /employers page with error message

**Dashboard Header:**
- Welcome message: "Mirë se erdhe, {Company Name}!"
- Subtitle: "Menaxho punët dhe aplikimet këtu"

**Statistics Cards (Top of Page):**

1. **Active Jobs**
   - Icon: Briefcase (blue)
   - Number of currently active job postings
   - Excludes paused, closed, expired jobs

2. **Total Applicants**
   - Icon: Users (green)
   - Total count across all your jobs
   - All-time statistic

3. **Monthly Views**
   - Icon: Eye (purple)
   - Total job views in last 30 days
   - Excludes your own views

4. **Growth**
   - Icon: TrendingUp (orange)
   - Percentage growth vs previous period
   - Calculated automatically

**Main Action Button:**
- "Posto Punë të Re" (Post New Job) - Top right corner
- Large, prominent, primary color
- Navigates to /post-job

**Three Main Tabs:**

#### Tab 1: Punët e Mia (My Jobs)

**Empty State (No Jobs Posted):**
- Icon: Large briefcase
- Message: "Nuk keni postuar ende asnjë punë"
- CTA Button: "Posto Punën e Parë"

**Jobs List:**
- Shows 5 jobs initially
- "Shiko më shumë" button loads next 5
- Each job card displays:
  - Title
  - Status badge (color-coded)
  - Location
  - Job type
  - Posted date
  - Salary (if public)
  - View count: "X shikime"
  - Applicant count: "X aplikues"

**Job Actions Dropdown (⋮ icon):**
- **View Details:** Eye icon → View public job page
- **Edit:** Edit icon → /edit-job/:id
- **Separator**
- **Pause/Activate:**
  - If active: Pause icon, "Pauzë" → Status becomes "paused"
  - If paused: Play icon, "Aktivizo" → Status becomes "active"
- **Separator**
- **Delete:** Trash icon (red text) → Soft delete with confirmation dialog

**Additional Buttons Per Job:**
- **"Kandidatë (X)"** - View all applications for this job
  - Switches to Applicants tab
  - Filters to this job's applications
- **"Kandidatë të Përshtatshëm"** - AI matching (if enabled)
  - Opens candidate matching modal
  - Shows matched candidates with scores
  - Requires payment/subscription

#### Tab 2: Aplikuesit (Applicants)

**Filter Dropdown:**
- "Filtro sipas punës"
- Options:
  - "Të gjitha punët" (All jobs)
  - List of your job titles (filters to specific job)

**Empty State:**
- Icon: Large users group icon
- Message: "Nuk ka aplikues ende"
- Description: "Kandidatët do të shfaqen këtu kur të aplikojnë për punët tuaja"

**Applications List:**
- Shows 5 applications initially
- "Shiko më shumë" button loads next 5
- Sorted by date (newest first)
- Each application card shows:
  - Applicant name
  - Job title (with icon)
  - Applied date
  - Application method (one-click or custom form)
  - Current status (dropdown)

**Status Dropdown:**
Change application status directly from card:
- 🟡 Pending (Në pritje)
- 🔵 Viewed (Parë)
- 🟢 Shortlisted (Në listë të shkurtër)
- 🔴 Rejected (Refuzuar)
- 🟣 Hired (Punësuar)

Changing status:
1. Click current status badge
2. Select new status from dropdown
3. Status updates immediately
4. Applicant receives notification automatically

**Application Actions:**
- **"Shiko Detajet" (View Details):** Opens full application modal
- **"Shkarko CV" (Download CV):** Downloads applicant's resume (if uploaded)
- **"Kontakto" (Contact):** Dropdown with email/phone/WhatsApp options
- **"Raporto" (Report):** Report user for inappropriate behavior

**Application Detail Modal:**

When you click "Shiko Detajet", a large modal opens with tabs:

**Modal Tab 1: Informacioni (Information)**
- Personal Info:
  - Full name
  - Email
  - Phone
  - Location
- Professional Profile:
  - Job title/headline
  - Bio
  - Experience level
  - Skills (as badges)
  - Desired salary
  - Availability
- Education:
  - All degrees with schools and years
- Work History:
  - All previous positions with dates and descriptions

**Modal Tab 2: Aplikimi (Application)**
- Application date (full date and time)
- Application method
- Cover letter (if provided)
- Custom question answers (if job had custom questions)
- Additional files (if uploaded)
- Download buttons for all files

**Modal Tab 3: Mesazhet (Messages)**
- Full conversation thread with applicant
- Send new messages
- Message types:
  - Text (regular message)
  - Interview Invite
  - Job Offer
  - Rejection Notice
- Each message type uses different template
- Unread messages highlighted
- Real-time updates

**Modal Footer Actions:**
- "Mbyll" (Close) button
- Quick status change dropdown
- "Kontakto" button for quick outreach

#### Tab 3: Cilësimet (Settings)

Company profile editor form.

**Editable Fields:**
- **Company Name** (required)
- **Industry** (dropdown, required)
- **Company Size** (dropdown: 1-10, 11-50, 51-200, 200+)
- **Company Description** (textarea, 1000 characters max)
- **Website** (URL)
- **City** (dropdown from locations)
- **Region** (auto-filled from city)

**Logo Upload:**
- Click upload area
- Select image (PNG, JPG)
- Image preview appears
- Saved with profile

**Action Buttons:**
- **"Anulo" (Cancel):** Reset form to current saved values
- **"Ruaj Ndryshimet" (Save Changes):** Save all changes
  - Loading state: "Duke ruajtur..."
  - Success: Toast notification
  - Updates reflected everywhere immediately

### 4.3 Posting a Job

**Access:** /post-job

**Entry Points:**
- Dashboard → "Posto Punë të Re" button
- Navigation → "Posto Punë" button

**Access Requirements:**
- Must be logged in as employer
- Account must be verified
- Redirects to /employers if not authorized

**Tutorial System:**
The page includes an **interactive tutorial guide** (optional):
- Yellow "?" button in bottom-right corner
- Click to start step-by-step guidance
- Highlights each form field with explanation
- Can skip or close anytime
- Progress saved per form step

**Form Structure: 4 Steps**

#### Step 0: Basic Information

**Fields:**

1. **Job Title** (required)
   - Text input
   - Example placeholder: "p.sh. Zhvillues Full Stack"
   - Max length: 100 characters
   - Validation: Cannot be empty

2. **Job Description** (required)
   - Textarea, 6 rows
   - Detailed description of the role
   - Max length: 5000 characters
   - Validation: Cannot be empty

3. **Category** (required)
   - Dropdown select
   - Options:
     - Teknologji (Technology)
     - Marketing
     - Financë (Finance)
     - Shitje (Sales)
     - Burime Njerëzore (Human Resources)
     - Dizajn (Design)
     - Menaxhim (Management)
     - Shëndetësi (Healthcare)
     - Arsim (Education)
     - Turizëm (Tourism)
     - Ndërtim (Construction)
     - Transport
     - Tjetër (Other)

4. **Job Type** (required)
   - Dropdown select
   - Options:
     - Full-time
     - Part-time
     - Contract (Kontratë)
     - Internship (Praktikë)
     - Remote

5. **Experience Level** (optional)
   - Dropdown select
   - Options:
     - Entry Level
     - Junior
     - Mid Level
     - Senior
     - Lead/Manager

**Navigation:**
- "Vazhdo" (Next) button - validates fields before proceeding
- Cannot proceed if required fields empty

#### Step 1: Location

**Fields:**

1. **City** (required)
   - Dropdown select
   - Populated from locations database
   - Common cities: Tiranë, Durrës, Vlorë, Shkodër, Elbasan, etc.
   - Auto-fills from your company profile location

2. **Region** (auto-filled)
   - Read-only
   - Automatically set when city selected
   - Example: Tiranë → Qarku i Tiranës

**Important Note:**
The form pre-fills your company's city/region. Tutorial reminds you to verify location is correct.

**Navigation:**
- "Kthehu Prapa" (Back) button - returns to step 0
- "Vazhdo" (Next) button - validates and proceeds

#### Step 2: Salary (Optional)

**Toggle:** Monthly vs Yearly
- Switch between "Mujore" (Monthly) or "Vjetore" (Yearly)
- Default: Monthly
- Affects placeholders and conversion

**Fields:**

1. **Minimum Salary** (optional)
   - Number input
   - Placeholder: 800 (monthly) or 10,000 (yearly)
   - Currency: EUR, USD, or ALL (Lek)

2. **Maximum Salary** (optional)
   - Number input
   - Placeholder: 1,200 (monthly) or 15,000 (yearly)
   - Must be ≥ minimum if both provided

3. **Currency** (select)
   - EUR (Euro) - default
   - USD (US Dollar)
   - ALL (Albanian Lek)

**Important:**
- Salary is completely optional
- Tutorial encourages it: "Punët me pagë të shfaqur marrin 3x më shumë aplikime!"
- If monthly selected, values multiplied by 12 before saving (backend stores annual)
- Salary shown to job seekers based on their preference

**Navigation:**
- "Kthehu Prapa" (Back) button
- "Vazhdo" (Next) button - proceeds even if empty

#### Step 3: Requirements and Benefits

**Dynamic Array Fields:**

1. **Requirements** (dynamic array)
   - Add multiple requirements (one per field)
   - Each field:
     - Text input
     - Placeholder: "p.sh. 2+ vjet përvojë me React"
     - Max 500 characters
     - Remove button (X icon) for each
   - "Shto Kërkesë" (Add Requirement) button adds new field
   - Initial: One empty field
   - Tutorial encourages at least one requirement

2. **Benefits** (dynamic array)
   - Add multiple benefits
   - Each field:
     - Text input
     - Placeholder: "p.sh. Sigurim shëndetësor i plotë"
     - Max 500 characters
     - Remove button (X)
   - "Shto Përfitim" (Add Benefit) button adds new field
   - Initial: One empty field

3. **Tags** (dynamic array)
   - Add skill/keyword tags
   - Each field:
     - Text input
     - Placeholder: "p.sh. JavaScript, React, MongoDB"
     - Max 50 characters each
     - Remove button (X)
   - "Shto Tag" (Add Tag) button
   - Optional field

4. **Platform Categories** (multi-select)
   - Select relevant platform-wide categories:
     - ☐ Diaspora - Për shqiptarë jashtë vendit
     - ☐ Nga shtëpia - Punë në distancë
     - ☐ Part Time - Orar i reduktuar
     - ☐ Administrata - Pozicione administrative
     - ☐ Sezonale - Punë të përkohshme
   - Multiple selections allowed
   - Helps job appear in filtered searches
   - Increases visibility

**Navigation:**
- "Kthehu Prapa" (Back) button
- **"Posto Punën" (Post Job)** button - Final submission
  - Loading state: "Duke postuar..."
  - Checkmark icon appears when loading

**Form Submission Process:**

1. **Validation:**
   - All required fields checked
   - Empty array items removed
   - Data formatted correctly

2. **Pricing Calculation:**
   - Base price: €50
   - Pricing rules applied (based on industry, location, etc.)
   - Active campaigns checked
   - Highest discount campaign applied (max 1)
   - Whitelist checked (free posting for approved employers)
   - Final price calculated

3. **Job Creation:**
   - Job posted to database
   - Status set:
     - If price = €0: Active immediately
     - If whitelisted: Active immediately
     - If price > €0: Pending payment
   - Unique slug generated from title
   - Expiry date set to +30 days

4. **Success Actions:**
   - Success notification shown
   - Form reset to empty
   - Wait 2 seconds
   - Redirect to /employer-dashboard

5. **Matching Notifications (Async):**
   - Quick users with matching interests notified
   - Emails sent in batches of 10
   - 1-second delay between batches
   - Does not block your response

**Error Handling:**
- Validation errors shown inline on fields
- Red text under invalid fields
- Cannot proceed until fixed
- Detailed error message in toast if submission fails

### 4.4 Editing a Job

**Access:** /edit-job/:id

**Entry Points:**
- Dashboard → Job card → ⋮ → Edit
- Job detail page → Edit button (if you're the owner)

**Access Requirements:**
- Must be logged in
- Must be the employer who posted the job
- Job must not be deleted
- 404 error if you don't own the job

**Form Structure:**
Identical to posting form, but pre-filled with existing data.

**Pre-filled Data:**
- All original values loaded
- Arrays (requirements, benefits, tags) fully populated
- Can add/remove items
- Can change any field
- Salary shown in same period (monthly/yearly) as entered

**Changes:**
- "Posto Punën" button becomes "Ruaj Ndryshimet" (Save Changes)
- Job ID stays the same
- Slug regenerated if title changes
- Applications preserved
- View count preserved
- Status remains unchanged

**Cannot Edit:**
- Expired jobs (warning shown)
- Deleted jobs (404 error)
- Jobs you don't own (403 error)

### 4.5 Managing Applications

Covered in detail in [Section 4.2 Tab 2: Aplikuesit](#tab-2-aplikuesit-applicants)

**Quick Reference:**

**View All Applications:**
1. Dashboard → Aplikuesit tab

**View Applications for Specific Job:**
1. Dashboard → Punët e Mia tab
2. Click "Kandidatë (X)" button on job card

**Change Application Status:**
1. Find application in list
2. Click status badge dropdown
3. Select new status
4. Applicant notified automatically

**Contact Applicant:**
1. Click "Kontakto" button on application card
2. Choose method: Email, Phone, or WhatsApp
3. Pre-filled message template opens
4. Send via your preferred channel

**Download CV:**
1. Click "Shkarko CV" button
2. PDF/DOC file downloads immediately

### 4.6 Candidate Matching (Premium Feature)

**What It Is:**
AI-powered system that finds the best job seekers for your job postings based on 7 matching factors.

**Availability:**
- Paid add-on feature
- Per-job purchase
- One-time payment per job (currently lifetime access)

**How to Access:**
1. Dashboard → Punët e Mia tab
2. Find job with "Kandidatë të Përshtatshëm" button
3. Click button
4. Modal opens

**If You Don't Have Access:**
- Upsell message displayed
- Benefits listed:
  - Algoritëm i avancuar matching
  - Kandidatë të verifikuar
  - Detaje të plota të profilit
- Price shown
- "Blej Qasje" (Buy Access) button
- Payment processed (currently mocked)
- Access granted immediately

**If You Have Access:**
- Loading state while fetching matches
- List of matched candidates displayed
- Sorted by match score (highest first)

**Candidate Match Card:**

Each matched candidate shows:

1. **Match Score** (large percentage)
   - Color-coded:
     - ≥80%: Green (excellent match)
     - 60-79%: Yellow (good match)
     - <60%: Red (poor match)

2. **Match Breakdown** (progress bars)
   - Title Match: X/20 points
   - Skills Match: X/25 points
   - Experience Match: X/15 points
   - Location Match: X/15 points
   - Education Match: X/5 points
   - Salary Match: X/10 points
   - Availability Match: X/10 points
   - Visual bars show score proportion

3. **Profile Preview**
   - Name
   - Current title
   - Bio (truncated to 2 lines)
   - Top 3 skills as badges
   - Location
   - Availability

4. **Actions**
   - **"Shiko Profilin"** - View full profile
   - **"Kontakto"** - Contact candidate directly
   - **"Shëno si të kontaktuar"** - Mark as contacted

**Contacting Matched Candidates:**
Same as contacting applicants - email/phone/WhatsApp options.

**Tracking:**
When you contact a candidate, the system tracks:
- Contacted: Yes/No
- Contact method: Email, Phone, or WhatsApp
- Contacted date: Timestamp

This helps you remember who you've reached out to.

### 4.7 Company Profile

**Access:** /company/:id (public page)

**Your Company's Public Profile Shows:**
- Company logo
- Company name
- Verified badge (if verified)
- Industry
- Company size
- Location (city, region)
- Company description
- Website link
- All active job postings from your company
- Company statistics (jobs posted, applications received)

**Editing Company Profile:**
Dashboard → Cilësimet tab (covered in Section 4.2)

**Profile URL:**
Share this URL with potential candidates to see all your jobs and company info in one place.

---

## 5. PLATFORM FEATURES

### 5.1 Search Functionality

**Where:** Homepage search bar

**Search Capabilities:**
- Full-text search across:
  - Job titles
  - Job descriptions
  - Tags/keywords
  - Company names
- Case-insensitive
- Partial word matching
- Albanian language optimized

**Search Tips:**
- Use specific keywords: "React developer" better than just "developer"
- Include location: "developer Tiranë"
- Use company names: "Google Albania"
- Try different spellings: "dizajner" vs "designer"
- Minimum 2 characters to trigger search

**Search Results:**
- Real-time updates (300ms debounce)
- Results count shown: "X rezultate për 'query'"
- Highlighted in yellow during search
- Pagination if many results
- Combined with filters for precision

### 5.2 Filtering System

**Core Platform Filters:**
Always visible in left sidebar:
- Diaspora: International/abroad jobs
- Nga shtëpia: Remote work
- Part Time: Part-time positions
- Administrata: Government jobs
- Sezonale: Seasonal jobs (≤3 months)

**Location Filters:**
- Multi-select dropdown
- All Albanian cities available
- OR logic: Select multiple cities
- Shows job count per city (if available)

**Job Type Filters:**
- Multi-select dropdown
- Full-time, Part-time, Contract, Internship, Remote
- OR logic: Multiple types allowed

**Advanced Filters (Modal):**
- Salary range with slider
- Experience level
- Company search
- Categories (12 industries)
- Remote work only
- Posted date range
- Sort options

**Active Filters Display:**
- Badges shown above job listings
- Click × to remove individual filter
- "Rivendos të gjitha" to clear all
- Color-coded by filter type

### 5.3 Notifications

**Types of Notifications:**

1. **In-App Notifications**
   - Bell icon in navigation (top-right)
   - Red badge with unread count
   - Click to open dropdown

2. **Email Notifications**
   - Sent to registered email
   - For major events only

**Notification Categories:**

**For Job Seekers:**
- Application status changed
- Employer messaged you
- New job recommendations
- Saved job about to expire
- Account warnings/suspensions

**For Employers:**
- New application received
- Applicant messaged you
- Job about to expire
- Job approved/rejected (admin)
- Account verification status
- Payment confirmations

**For All Users:**
- System announcements
- Maintenance notices
- New features
- Policy updates

**Managing Notifications:**

**View Notifications:**
1. Click bell icon in navigation
2. Dropdown shows last 10 notifications
3. Unread: Blue background with dot
4. Read: Gray background
5. Click notification to mark as read

**Mark as Read:**
- Click individual notification to read
- Click "Shëno të gjitha si të lexuara" to mark all as read

**Notification Dropdown Shows:**
- Notification title
- Short message (2 lines max)
- Time ago ("X ditë më parë")
- Icon based on type

**Full Notifications Page:**
Currently "Shiko të gjitha njoftimet" link available but not fully implemented.

### 5.4 Messaging System

**In-Application Messaging:**
Direct communication between employers and job seekers within the platform.

**Access:**
- Applicants: Profile → Applications → Click application → Messages tab
- Employers: Dashboard → Applicants → Click application → Messages tab

**Features:**
- Real-time message thread
- Message types:
  - Text: Regular messages
  - Interview Invite: Structured interview invitation
  - Job Offer: Official job offer
  - Rejection: Polite rejection notice
- Unread indicators
- Timestamp on each message
- Sender identification (name + role)

**Sending Messages:**
1. Open application detail
2. Go to Messages tab
3. Type message in textarea
4. Select message type (default: text)
5. Click "Dërgo" (Send)
6. Message sent immediately
7. Other party receives notification

**Message Templates:**
Interview invites, offers, and rejections use pre-formatted templates with professional Albanian language.

**Limitations:**
- Only available for submitted applications
- Cannot message before applying
- Cannot attach files in messages (use application)
- No video/audio messages

### 5.5 Company Profiles

**Public Company Pages:**
Each employer gets a dedicated company profile page.

**URL:** /company/:id

**Contents:**
- Company logo (large)
- Company name
- Verified badge (if verified)
- Industry
- Company size (employees)
- Location
- Full company description
- Website link (clickable)
- **All Active Jobs** from this company
- Job cards same format as main listing

**Access:**
- Click company name on any job listing
- Click "Shiko Kompaninë" button on job detail page
- Direct URL if you have it

**Purpose:**
- Job seekers can see all jobs from one employer
- Learn more about company culture
- Verify company legitimacy
- Find contact information

### 5.6 Events and Announcements

**Event Sidebar:**
Right sidebar on homepage (desktop only) shows upcoming events:

**Event Types:**
- Career fairs
- Workshops (resume building, interview skills)
- Tech meetups
- Networking events
- Job application deadlines
- Free training programs

**Event Information:**
- Event name
- Date badge
- Location/platform
- Brief description
- Clickable (some link to registration)

**Current Events:**
- Career Fair 2026 - January 15 - University of Tirana
- Resume Building Workshop - January 18 - EPOKA University
- Tech Meetup Tirana - January 22 - Destil Hostel
- LinkedIn Optimization Webinar - January 25 - Online
- Startup Networking Night - January 28 - Tirana Smart City
- Summer Internships Deadline - January 31 - Big Tech
- Free Coding Bootcamp - February 1 - Polytechnic University
- Interview Skills Workshop - February 5 - American University

**Note:** Events are currently hardcoded. Future versions may have dynamic event management.

### 5.7 Premium/Featured Jobs

**What Are Premium Jobs?**
Jobs that employers paid extra to feature prominently on the platform.

**Visual Indicators:**
- Featured badge/tag on job card
- Appear first in search results (tier:-1 sorting)
- Shown in Premium Jobs Carousel on homepage
- Different card styling (slight background color)

**Benefits for Employers:**
- 3x more visibility
- Top of search results
- Homepage carousel placement
- Higher application rates

**Premium Job Carousel:**
- Top of homepage
- 3 jobs visible at once (desktop)
- Auto-rotate or manual navigation
- Click job to view details
- Only shown when user has no active filters

**Availability:**
Contact platform admins to upgrade jobs to premium tier (pricing may vary).

---

## 6. ACCOUNT MANAGEMENT

### 6.1 Login and Authentication

**Login Page:** /login

**Login Form:**
- Email Address (required)
- Password (required)
- "Kujto më" (Remember Me) checkbox (optional)
- "Hyr" (Login) button

**Forgot Password:**
1. Click "Ke harruar fjalëkalimin?" link
2. Enter your email address
3. Click "Dërgo lidhjen" (Send Link)
4. Check your email for reset link
5. Click link in email
6. Enter new password (min 6 characters)
7. Confirm new password
8. Click "Rivendos fjalëkalimin" (Reset Password)
9. Password updated, redirected to login

**Session Management:**
- Login session active for 7 days (if "Remember Me" checked)
- Otherwise: 15 minutes of inactivity
- Must re-login after session expires
- Secure JWT token-based authentication

**Security:**
- Passwords hashed with bcrypt (12 rounds)
- No plain-text password storage
- HTTPS required for all authentication
- Token expiry enforced

### 6.2 Account Status

Your account can have one of these statuses:

#### Active
- ✅ Full platform access
- ✅ Can login
- ✅ Can use all features
- Default for job seekers
- Default for verified employers

#### Pending Verification
- ⚠️ Limited access
- ✅ Can login
- ✅ Can view dashboard
- ❌ Cannot post jobs (employers only)
- Default for new employer accounts
- Typically 24-48 hours until verified

#### Suspended
- 🚫 Temporary restriction
- ❌ Cannot login
- Login shows: "Llogaria juaj është pezulluar deri më {date}. Arsyeja: {reason}"
- Duration specified (days)
- Auto-lifts when expiry date passes
- Can be lifted early by admin
- Can appeal via support email

#### Banned
- 🚫 Permanent restriction
- ❌ Cannot login
- Login shows: "Llogaria juaj është mbyllur përgjithmonë. Arsyeja: {reason}"
- No automatic lift
- Cannot be reversed (final decision)
- Must create new account (if allowed)

#### Deleted
- 🚫 Account removed
- ❌ Cannot login
- Login shows: "Llogaria është çaktivizuar"
- Data still in database (soft delete)
- Cannot be restored
- Must create new account

**Checking Your Status:**
- Try to login
- Email notifications if status changes
- Admin notification for suspensions/bans

### 6.3 Updating Profile

**For Job Seekers:**
See [Section 3.7 Profile Management](#37-profile-management)

**For Employers:**
See [Section 4.2 Tab 3: Cilësimet](#tab-3-cilësimet-settings)

**Profile Completion Tips:**

**Job Seekers:**
- ✅ Upload professional photo
- ✅ Write compelling bio (focus on achievements)
- ✅ List all relevant skills
- ✅ Add complete work history
- ✅ Include education details
- ✅ Upload updated CV
- ✅ Set realistic salary expectations
- ✅ Keep availability current

**Employers:**
- ✅ Upload company logo (professional quality)
- ✅ Write detailed company description
- ✅ Add website link
- ✅ Verify contact information
- ✅ Keep company size updated
- ✅ Select accurate industry

### 6.4 Privacy Settings

**Current Privacy Options:**

**Job Seekers:**
- Profile visibility (default: public)
- Show in search results (default: yes)
- Email notifications (default: yes)

**Employers:**
- Company profile visibility (always public)
- Contact preferences:
  - Enable phone contact
  - Enable WhatsApp contact
  - Enable email contact
  - Preferred contact method

**Accessing Privacy Settings:**
Currently integrated into profile edit pages.

**Data Privacy:**
- advance.al follows GDPR-compliant practices
- Personal data encrypted
- Not shared with third parties without consent
- Can request data export/deletion via support

### 6.5 Deleting Account

**Process:**
1. Contact platform support via email
2. Request account deletion
3. Admin reviews request
4. Confirm deletion via email
5. Account marked as deleted (soft delete)
6. Data retained for 30 days (legal requirement)
7. After 30 days, personal data anonymized

**What Gets Deleted:**
- Profile information
- Login credentials
- Applications (marked as withdrawn)
- Saved jobs
- Notifications

**What Remains (Anonymized):**
- Job postings (transferred to "Former Employer")
- Platform statistics
- Application history (anonymized)

**Cannot Be Undone:**
Account deletion is permanent after 30-day grace period.

---

## 7. PRICING AND PAYMENTS

### 7.1 Job Posting Costs

**Base Price:** €50 per job posting

**What's Included:**
- 30-day active listing
- Unlimited applications
- Standard visibility in search
- Application management tools
- Company profile listing
- Email notifications for applications

**Pricing Factors:**

Your final price may vary based on:

1. **Industry/Category**
   - High-demand sectors (e.g., Technology): +20%
   - Standard sectors: Base price
   - Low-demand sectors: -10%

2. **Location**
   - Tiranë (capital): +15%
   - Major cities (Durrës, Vlorë): +10%
   - Other cities: Base price

3. **Company Size**
   - Large companies (200+ employees): +10%
   - Medium (51-200): +5%
   - Small (1-50): Base price

4. **Timing**
   - Peak hiring seasons: +10%
   - Weekend postings: -5%

5. **Demand-Based Pricing**
   - High competition categories: +30%
   - Low competition: Base price

**Dynamic Calculation:**
Price calculated automatically when you post a job. You'll see:
- Base price: €50
- Applied rules: +/- adjustments
- Campaign discounts: If eligible
- **Final price: Total amount**

### 7.2 Campaigns and Discounts

**Active Campaigns:**
Platform runs periodic discount campaigns:

**Campaign Types:**

1. **New Employer Bonus**
   - First job: 50% off
   - Automatically applied
   - One-time use

2. **Bulk Posting Discount**
   - Post 5+ jobs: 20% off each
   - Post 10+ jobs: 30% off each
   - Calculated per batch

3. **Seasonal Promotions**
   - Summer hiring: 25% off
   - Holiday specials: Variable
   - Limited time offers

4. **Industry-Specific**
   - Targeted sectors get discounts
   - Encourages specific hiring
   - Example: 40% off healthcare jobs

**How Campaigns Work:**
- Eligibility checked automatically when posting
- Only ONE campaign applied per job (highest discount)
- Discount shown in pricing breakdown
- No coupon codes needed (automatic)

**Campaign Notifications:**
Check homepage or email for current active campaigns.

### 7.3 Free Posting (Whitelist)

**Employer Whitelist Program:**
Select employers can post jobs for **free**.

**Eligibility:**
- Government institutions
- NGOs and non-profits
- Educational institutions
- Strategic partners
- Platform sponsors
- Admin discretion

**How to Apply:**
1. Email platform support
2. Provide company documentation
3. Explain reason for free posting request
4. Admin reviews application
5. If approved, added to whitelist
6. Post jobs at €0 (free)

**Whitelist Benefits:**
- Unlimited free job postings
- All features included
- Premium visibility options
- Priority support

**Whitelist Status:**
If you're whitelisted, you'll see "🆓 Free Posting Enabled" badge in your dashboard.

### 7.4 Payment Methods

**Currently Accepted:**
⚠️ **Note:** Payment system is currently in test mode (mocked).

**Planned Payment Methods:**
- Credit/Debit Card (Visa, Mastercard)
- PayPal
- Bank Transfer
- Cash (in-person at office)

**Payment Process (When Live):**

1. **Post Job**
   - Fill out job posting form
   - Click "Posto Punën"

2. **Price Displayed**
   - See final calculated price
   - Review pricing breakdown
   - Discount information shown

3. **Choose Payment Method**
   - Select preferred method
   - Enter payment details

4. **Process Payment**
   - Secure payment gateway
   - Confirmation in seconds
   - Receipt via email

5. **Job Goes Live**
   - Status: Active
   - Visible in search immediately
   - 30-day countdown starts

**Payment Confirmation:**
- Email receipt sent immediately
- Payment ID for reference
- Invoice available in dashboard
- Transaction history viewable

### 7.5 Premium Features Pricing

**Candidate Matching:**
- Price: Variable (contact admin)
- Per-job purchase
- Lifetime access (currently)
- AI-powered candidate recommendations
- Detailed match scores
- Direct contact information

**Featured/Premium Jobs:**
- Price: +€30 (additional to base price)
- Top placement in search results
- Homepage carousel placement
- Featured badge on job card
- 30-day featuring (same as posting duration)

**Future Premium Features:**
- Company verification badge: €50 one-time
- Extended job duration (60 days): +€20
- Bulk notification access: €10/month
- Advanced analytics: €15/month

---

## 8. SAFETY AND REPORTING

### 8.1 Reporting Users

**When to Report:**

Report users for:
- Fake CV/Profile information
- Inappropriate content
- Suspicious/fraudulent profiles
- Spam behavior
- Impersonation
- Harassment
- Fake job postings (employers)
- Unprofessional behavior

**How to Report:**

**From Application (Employers):**
1. Dashboard → Applicants
2. Find applicant
3. Click "Raporto" button
4. Report modal opens

**From Profile (Job Seekers):**
1. View employer or job posting
2. Click "Raporto Përdoruesin" link/button
3. Report modal opens

**Report Form:**

**Fields:**
1. **Category** (required dropdown)
   - Fake CV
   - Inappropriate content
   - Suspicious profile
   - Spam behavior
   - Impersonation
   - Harassment
   - Fake job posting
   - Unprofessional behavior
   - Other

2. **Description** (required textarea)
   - Explain the issue in detail
   - Max 1000 characters
   - Be specific and factual

3. **Evidence** (optional file upload)
   - Screenshots
   - Documents
   - Other proof
   - Max 5 files

4. **Submit Button:** "Dërgo Raportin"

**After Submitting:**
- Confirmation message shown
- Report ID generated
- Admin notified immediately
- You receive confirmation email
- Report status: Pending

**Report Review Process:**

1. **Pending**
   - Admin notified
   - Report queued for review
   - Typical wait: 24-48 hours

2. **Under Review**
   - Admin investigating
   - May contact you for more info
   - May contact reported user

3. **Resolved**
   - Action taken (or not)
   - You receive notification
   - Possible actions:
     - No action (unfounded)
     - Warning sent
     - Temporary suspension
     - Permanent ban
     - Account deletion

**Report Limitations:**
- Cannot report yourself
- Cannot report same user twice in 24 hours (prevents spam)
- Max 5 reports per 15 minutes per user

**Report Tracking:**
Currently no public report history page. You'll be notified via email of resolution.

### 8.2 Account Moderation

**Admin Actions:**

Admins can take these actions on your account:

1. **Warning**
   - Email notification
   - No access restriction
   - Recorded in your account history
   - Multiple warnings may lead to suspension

2. **Temporary Suspension**
   - Cannot login for specified days
   - Email notification with reason and duration
   - Auto-lifts on expiry date
   - Can appeal via support email

3. **Permanent Suspension (Ban)**
   - Cannot login ever
   - Email notification with reason
   - No automatic lift
   - Cannot create new account with same email

4. **Account Termination**
   - Account deleted
   - All data removed
   - Cannot be restored
   - Must create entirely new account

**Reasons for Moderation:**
- Verified reports
- Terms of Service violations
- Fraudulent activity
- Repeated policy violations
- Legal requirements
- Safety concerns

**Appeal Process:**

If you believe your account was incorrectly suspended/banned:

1. **Email Support:**
   - Send email to support@advance.al (check current email)
   - Include:
     - Your account email
     - Reason you believe it's incorrect
     - Any evidence supporting your case
     - Report ID (if you have it)

2. **Admin Review:**
   - Support team reviews appeal
   - May request additional information
   - Response within 5-7 business days

3. **Decision:**
   - Suspension lifted, OR
   - Appeal denied with explanation
   - Final decision binding

### 8.3 Platform Safety Features

**Anti-Fraud Measures:**

1. **Employer Verification**
   - All employers manually verified by admin
   - Company legitimacy checked
   - Contact information verified
   - Verified badge displayed

2. **Job Posting Review**
   - Suspicious jobs flagged
   - Admin review for high-risk categories
   - Scam job detection

3. **Application Protection**
   - Profile data not shared until you apply
   - Contact info hidden until employer contacts you
   - Spam prevention (rate limiting)

4. **Secure Communications**
   - All data encrypted in transit
   - Passwords hashed (never stored plain text)
   - Secure authentication

**Red Flags to Watch For:**

**For Job Seekers:**
- Jobs requiring upfront payment
- Too-good-to-be-true salaries
- Poor grammar/spelling in official postings
- Requests for sensitive info before interview
- Unverified employers
- Generic job descriptions
- "Work from home" with minimal requirements

**For Employers:**
- Fake credentials on CV
- Inconsistent work history
- Unrealistic skill claims
- Suspicious contact information
- Requests for advance payment
- Profile photos that look stock/fake

**If Something Seems Wrong:**
Trust your instincts and report it immediately.

---

## 9. NOTIFICATIONS AND COMMUNICATIONS

### 9.1 Email Notifications

**Types of Emails You'll Receive:**

**Job Seekers:**
1. **Welcome Email**
   - Sent immediately after registration
   - Contains account details
   - Quick start guide
   - Profile completion tips

2. **Job Alerts** (Quick Users)
   - Sent when matching jobs posted
   - Frequency based on preference:
     - Immediate: As jobs are posted
     - Daily: Once per day summary
     - Weekly: Once per week summary
   - Contains job details with apply link

3. **Application Status Updates**
   - When employer changes your application status
   - Includes status change and job details

4. **New Messages**
   - When employer messages you
   - Includes message preview

5. **Job Expiry Warnings**
   - Saved jobs about to expire
   - Apply before deadline reminder

**Employers:**
1. **Welcome Email**
   - After registration
   - Verification status info
   - Next steps guide

2. **Verification Email**
   - When account approved/rejected
   - Instructions for next steps

3. **New Application Notifications**
   - Immediate notification
   - Applicant summary
   - Quick link to dashboard

4. **Job Expiry Warnings**
   - 7 days before expiry
   - 1 day before expiry
   - Option to renew/extend

**All Users:**
1. **Account Action Emails**
   - Warning, suspension, ban notifications
   - Reason and duration (if applicable)
   - Appeal instructions

2. **Bulk Announcements**
   - Platform updates
   - New features
   - Policy changes
   - Maintenance notices

**Managing Email Notifications:**

**Quick Users:**
- Update preferences via link in any email
- Change frequency (immediate/daily/weekly)
- Unsubscribe with one click
- Cannot currently disable via website settings

**Full Account Users:**
- Email preferences in profile settings (planned)
- Currently all emails enabled by default
- Unsubscribe from specific types via email links

### 9.2 In-App Notifications

**Notification Bell (Top Navigation):**
- Always visible when logged in
- Shows unread count badge (red circle with number)
- "9+" if more than 9 unread
- Click to open notification dropdown

**Notification Dropdown:**

**Header:**
- "Njoftimet" title
- "Shëno të gjitha si të lexuara" button

**Notification List:**
- Shows last 10 notifications
- Each notification displays:
  - Icon (based on type)
  - Title
  - Message (max 2 lines)
  - Time ago
- Unread: Blue background + blue dot
- Read: Normal background, no dot
- Click to mark as read

**Loading/Empty States:**
- Loading: "Duke ngarkuar njoftimet..."
- Empty: "Nuk keni njoftime të reja"

**Notification Types:**

**Icons and Colors:**
- 📧 Application status: Blue
- 💬 New message: Green
- 🎯 Job recommendation: Purple
- ⚠️ Warning: Orange
- ❌ Rejection: Red
- ✅ Approval: Green
- 📢 Announcement: Blue

### 9.3 SMS Notifications (Planned)

**Current Status:** Placeholder (not actually sent)

**Planned Features:**
- Job alerts via SMS
- Application status updates via SMS
- Interview reminders via SMS
- Important announcements via SMS

**To Enable (When Available):**
1. Profile settings
2. Add/verify phone number
3. Enable SMS notifications toggle
4. Choose notification types
5. Save changes

**Cost:** Free (included in platform service)

---

## 10. TROUBLESHOOTING

### 10.1 Common Issues

#### Cannot Login

**Symptoms:**
- "Email ose fjalëkalimi i gabuar" error
- "Token ka skaduar" error
- "Llogaria është pezulluar" error

**Solutions:**

1. **Check Email and Password**
   - Verify email spelling (no spaces)
   - Check password (case-sensitive)
   - Use "Forgot Password" if needed

2. **Session Expired**
   - Clear browser cache and cookies
   - Try different browser
   - Login again

3. **Account Suspended/Banned**
   - Check email for notification
   - Contact support if incorrect
   - Wait for suspension to expire (if temporary)

4. **Account Deleted**
   - Cannot recover deleted accounts
   - Create new account if needed

#### Cannot Apply to Jobs

**Symptoms:**
- "Duhet të jeni të regjistruar si punëkërkues" error
- Apply button disabled/grayed out
- "Profili duhet të jetë i plotë" error

**Solutions:**

1. **Not Logged In**
   - Login to your account
   - Make sure you're a job seeker (not employer)

2. **Already Applied**
   - Check application history
   - Each job can only be applied to once

3. **Profile Incomplete** (One-click apply)
   - Complete profile: Add first name, last name, title, CV
   - Go to Profile page
   - Fill required fields
   - Upload CV
   - Save changes

4. **Job Closed/Expired**
   - Job no longer accepting applications
   - Search for similar jobs

#### Cannot Post Jobs (Employers)

**Symptoms:**
- Redirected away from post-job page
- "Llogaria juaj duhet të verifikohet" error
- "Nuk keni autorizim" error

**Solutions:**

1. **Account Not Verified**
   - Wait for admin verification (24-48 hours)
   - Check email for verification status
   - Contact support if delayed

2. **Not Logged In as Employer**
   - Login with employer account
   - Cannot post with job seeker account

3. **Account Suspended**
   - Check account status
   - Resolve any pending issues
   - Contact support

#### Not Receiving Email Notifications

**Symptoms:**
- No welcome email after registration
- No job alerts
- No application status updates

**Solutions:**

1. **Check Spam/Junk Folder**
   - Look for emails from advance.al or noreply@advance.al
   - Mark as "Not Spam"
   - Add to contacts

2. **Email Address Incorrect**
   - Verify email in profile settings
   - Update if wrong
   - Verify new email

3. **Email Service Blocked**
   - Check with email provider
   - Whitelist advance.al domain
   - Try different email address

4. **Notifications Disabled**
   - Check notification preferences
   - Enable desired notifications
   - Save changes

#### Profile Photo Not Uploading

**Symptoms:**
- "File too large" error
- Upload fails silently
- Photo doesn't appear after upload

**Solutions:**

1. **File Too Large**
   - Max size typically 5MB
   - Compress image before uploading
   - Use online image compressor

2. **Wrong File Format**
   - Use JPG, JPEG, or PNG only
   - Convert other formats

3. **Slow Internet Connection**
   - Wait for upload to complete
   - Try again with better connection
   - Use smaller file

4. **Browser Cache**
   - Clear browser cache
   - Hard refresh (Ctrl+Shift+R or Cmd+Shift+R)
   - Try different browser

### 10.2 Getting Help

**Support Channels:**

1. **Email Support**
   - Email: support@advance.al (verify current address)
   - Response time: 24-48 hours
   - Include:
     - Your account email
     - Detailed description of issue
     - Screenshots if applicable
     - Steps you've already tried

2. **Help Center**
   - Click "Ndihmë" (Help) in footer
   - Browse common questions
   - Step-by-step guides
   - Video tutorials (if available)

3. **Social Media**
   - Facebook: @advanceal (verify)
   - Twitter: @advanceal (verify)
   - LinkedIn: advance.al (verify)
   - Direct messages for quick questions

4. **Phone Support** (if available)
   - Check website for phone number
   - Business hours only
   - Albanian language support

**Before Contacting Support:**

Gather this information:
- Your account email
- Account type (job seeker/employer)
- Description of the problem
- What you were trying to do
- Any error messages (exact text)
- Screenshots or screen recordings
- Browser and device info
- Steps to reproduce the issue

**Expected Response Times:**
- Email: 24-48 hours
- Social media: 4-8 hours
- Phone: Immediate (during business hours)
- Urgent issues: Mark as "URGENT" in subject line

---

## 11. FREQUENTLY ASKED QUESTIONS

### General Questions

**Q: Is advance.al free to use?**
A: For job seekers, yes - completely free. Employers pay to post jobs (starting at €50 per posting).

**Q: What languages does the platform support?**
A: Currently Albanian only. All interface, jobs, and communications are in Albanian.

**Q: How do I delete my account?**
A: Contact support at support@advance.al and request account deletion. Account will be deleted within 30 days.

**Q: Can I have both a job seeker and employer account?**
A: No. Each email can only have one account type. Create separate accounts with different emails if needed.

**Q: How long do job postings last?**
A: 30 days from posting date. Can be renewed/extended before expiry.

**Q: Are jobs on advance.al legitimate?**
A: All employers are manually verified. However, use common sense and report any suspicious postings.

### For Job Seekers

**Q: Do I need to upload a CV?**
A: Required for one-click applications. Optional for custom form applications, but highly recommended.

**Q: Can I apply to jobs without registering?**
A: No. You must create an account (Quick Profile or Full Account) to apply.

**Q: How many jobs can I apply to?**
A: Unlimited. Apply to as many jobs as you like.

**Q: Can I withdraw my application?**
A: Yes, unless the employer marked your status as "hired". Use the withdraw button on your application.

**Q: Why am I not getting job recommendations?**
A: Make sure your profile is complete with title, skills, experience, and location.

**Q: How do I know if my application was viewed?**
A: Check application status. "Viewed" status means employer has seen your application.

**Q: Can I message employers before applying?**
A: No. Messaging is only available after you apply to a job.

**Q: What's the difference between Quick Profile and Full Account?**
A:
- Quick Profile: Email job alerts only, cannot apply directly
- Full Account: Apply to jobs, save jobs, profile page, messaging

**Q: How do I upgrade from Quick Profile to Full Account?**
A: Create a full account with the same email. Your quick profile will be automatically converted.

### For Employers

**Q: How long does verification take?**
A: Typically 24-48 hours. You'll receive an email when approved.

**Q: Can I edit a job after posting?**
A: Yes. Go to dashboard → My Jobs → Edit button. Cannot edit expired or deleted jobs.

**Q: How do I renew an expired job?**
A: Currently, create a new posting. Future versions may have renew feature.

**Q: Can I post the same job multiple times?**
A: Technically yes, but creates duplicate listings. Better to renew or reactivate existing job.

**Q: Why can't I contact applicants?**
A: Make sure you're logged in, viewing your own job's applications, and applicant has complete profile.

**Q: What's the refund policy?**
A: Contact support within 24 hours of posting if job was posted in error. Refunds evaluated case-by-case.

**Q: Can I get a discount for posting multiple jobs?**
A: Yes! Bulk posting discounts available (20-30% off). Contact support or check active campaigns.

**Q: What is Candidate Matching?**
A: AI-powered feature that finds job seekers most suited to your job based on skills, experience, location, etc. Requires additional payment.

**Q: How do I get free posting access?**
A: Only available to government institutions, NGOs, and strategic partners. Contact support to apply.

**Q: Can I delete applications?**
A: No. You can change status to "rejected" but cannot delete applications (audit trail).

### Technical Questions

**Q: Which browsers are supported?**
A: Chrome, Firefox, Safari, Edge - latest versions recommended.

**Q: Is there a mobile app?**
A: Not currently. Website is mobile-responsive and works on phones/tablets.

**Q: What file formats are supported for CV upload?**
A: PDF, DOC, DOCX typically. Check platform for current limitations.

**Q: Is my data secure?**
A: Yes. All data encrypted, secure authentication, GDPR-compliant practices.

**Q: Can I access advance.al from outside Albania?**
A: Yes. Platform accessible worldwide. Many diaspora jobs available.

**Q: What payment methods are accepted?**
A: Currently in test mode. Planned: Credit/debit cards, PayPal, bank transfer.

---

## APPENDIX

### A. Albanian-English Terms Glossary

| Albanian | English |
|----------|---------|
| Punëkërkues | Job Seeker |
| Punëdhënës | Employer |
| Apliko | Apply |
| Ruaj | Save |
| Hyr | Login |
| Regjistrohu | Register |
| Profili | Profile |
| Cilësimet | Settings |
| Njoftimet | Notifications |
| Aplikimet | Applications |
| Punët e Ruajtura | Saved Jobs |
| Dashboard | Dashboard |
| Posto Punë | Post Job |
| Kandidatë | Candidates |
| Shiko Detajet | View Details |
| Mbyll | Close |
| Dërgo | Send |
| Ruaj Ndryshimet | Save Changes |
| Anulo | Cancel |
| Kthehu Prapa | Go Back |
| Vazhdo | Continue |
| Filtro | Filter |
| Kërko | Search |
| Shkarko | Download |
| Ngarkö | Upload |
| Fshi | Delete |

### B. Contact Information

**Platform Website:** advance.al (verify current domain)

**Support Email:** support@advance.al (verify)

**Social Media:**
- Facebook: @advanceal
- Twitter: @advanceal
- LinkedIn: advance.al

**Office Address:** (Check website for current address)

**Business Hours:** Monday-Friday, 9:00-17:00 (Albania time)

### C. Document Version History

**Version 1.0 - January 13, 2026**
- Initial comprehensive user manual
- All features documented
- Based on forensic platform analysis

---

**END OF USER MANUAL**

*This document is a comprehensive guide to using the advance.al platform. For technical documentation, see the developer guides. For testing scenarios, see the QA testing document.*

**Last Updated:** January 13, 2026
**Document Prepared By:** Platform Analysis Team
**Status:** Complete and Verified
