# FORENSIC DOCUMENTATION - BACKEND API ROUTES
## Part 6: Complete Backend API Documentation

**Document Created:** 2026-01-12
**Purpose:** Complete documentation of all backend API routes
**Total Route Files:** 17
**Total Lines Documented:** ~8,500+ lines

---

## TABLE OF CONTENTS

1. [Authentication Routes](#1-authentication-routes-authjs)
2. [Admin Routes](#2-admin-routes-adminjs)
3. [Job Routes](#3-job-routes-jobsjs)
4. [Application Routes](#4-application-routes-applicationsjs)
5. [User Routes](#5-user-routes-usersjs)
6. [Company Routes](#6-company-routes-companiesjs)
7. [QuickUser Routes](#7-quickuser-routes-quickusersjs)
8. [Notification Routes](#8-notification-routes-notificationsjs)
9. [Bulk Notification Routes](#9-bulk-notification-routes-bulk-notificationsjs)
10. [Report Routes](#10-report-routes-reportsjs)
11. [Verification Routes](#11-verification-routes-verificationjs)
12. [Location Routes](#12-location-routes-locationsjs)
13. [Stats Routes](#13-stats-routes-statsjs)
14. [Configuration Routes](#14-configuration-routes-configurationjs)
15. [Business Control Routes](#15-business-control-routes-business-controljs)
16. [Matching Routes](#16-matching-routes-matchingjs)
17. [Send Verification Routes](#17-send-verification-routes-send-verificationjs)
18. [Verification Section](#verification-section)

---

## 1. Authentication Routes (auth.js)

**File:** `backend/src/routes/auth.js`
**Lines:** 402 lines
**Purpose:** User authentication, registration, token management

### 1.1 Middleware Applied

**All Routes:** None (public routes except /me and /logout)

### 1.2 Validation Rules

**Registration Validation** (lines 20-47):
```javascript
{
  email: isEmail + normalizeEmail,
  password: min 6 characters,
  userType: 'jobseeker' | 'employer',
  firstName: 2-50 characters (trimmed),
  lastName: 2-50 characters (trimmed),
  city: required (trimmed),
  phone: optional, format: /^\+\d{8,}$/
}
```

**Login Validation** (lines 50-58):
```javascript
{
  email: isEmail + normalizeEmail,
  password: required
}
```

### 1.3 Endpoints

#### POST /api/auth/register
- **Access:** Public
- **Validation:** registerValidation
- **Request Body:**
  ```javascript
  {
    email: string (required),
    password: string (required, min 6 chars),
    userType: 'jobseeker' | 'employer',
    firstName: string (required, 2-50 chars),
    lastName: string (required, 2-50 chars),
    city: string (required),
    phone: string (optional, format: +355XXXXXXXX),
    // Employer-specific (required if userType='employer'):
    companyName: string,
    industry: string,
    companySize: '1-10' | '11-50' | '51-200' | '200+'
  }
  ```
- **Process:**
  1. Check if user exists with email
  2. Build userData object with profile structure
  3. Add phone if provided
  4. If employer: validate companyName, industry, companySize (required)
  5. Initialize employerProfile with verificationStatus='pending', verified=false
  6. If jobseeker: initialize jobSeekerProfile
  7. Create user document
  8. Generate JWT token + refresh token
  9. Update lastLoginAt
  10. **Async:** Send welcome email via resendEmailService (jobseekers only)
  11. Return user + tokens
- **Response (201):**
  ```javascript
  {
    success: true,
    message: "Llogaria u krijua me sukses...",
    data: {
      user: { id, email, userType, status, profile },
      token: string,
      refreshToken: string
    }
  }
  ```
- **Error (400):** User already exists, validation errors, missing employer fields
- **Error (500):** Server error

#### POST /api/auth/login
- **Access:** Public
- **Validation:** loginValidation
- **Request Body:**
  ```javascript
  {
    email: string (required),
    password: string (required)
  }
  ```
- **Process:**
  1. Find user by email (select +password)
  2. Check if user exists
  3. Check if account is deleted (isDeleted or status='deleted')
  4. **Auto-lift expired suspensions:** Call user.checkSuspensionStatus()
  5. Check if suspended (show expiry date + reason)
  6. Check if banned (show reason)
  7. Validate password using user.comparePassword()
  8. Check employer pending_verification status
  9. Generate token + refresh token
  10. Update lastLoginAt
  11. Return user + tokens (password removed)
- **Response (200):**
  ```javascript
  {
    success: true,
    message: "Kyçja u krye me sukses",
    data: {
      user: { ...userObject },
      token: string,
      refreshToken: string
    }
  }
  ```
- **Error (401):** Invalid credentials, account deleted, suspended, banned, pending verification
- **Error (500):** Server error

#### POST /api/auth/refresh
- **Access:** Public
- **Request Body:**
  ```javascript
  {
    refreshToken: string (required)
  }
  ```
- **Process:**
  1. Verify refreshToken using JWT_REFRESH_SECRET
  2. Get user from database by decoded ID
  3. Check if user exists and not deleted
  4. Generate new token + refreshToken
  5. Return new tokens
- **Response (200):**
  ```javascript
  {
    success: true,
    data: {
      token: string,
      refreshToken: string
    }
  }
  ```
- **Error (401):** Missing token, expired token, invalid token, user not found
- **Error (500):** Server error

#### GET /api/auth/me
- **Access:** Private (authenticate)
- **Process:**
  1. Fetch user by req.user._id (select -password)
  2. Return user object
- **Response (200):**
  ```javascript
  {
    success: true,
    data: {
      user: { ...userObject }
    }
  }
  ```
- **Error (404):** User not found
- **Error (500):** Server error

#### POST /api/auth/logout
- **Access:** Private (authenticate)
- **Process:** Acknowledge logout (stateless JWT)
- **Response (200):**
  ```javascript
  {
    success: true,
    message: "Daljet u krye me sukses"
  }
  ```

### 1.4 Rate Limiting

**Disabled for development** (lines 10-17)
- Commented out: 10 requests per 15 minutes per IP

### 1.5 Key Features

1. **Email Normalization:** All emails normalized before storage
2. **Password Hashing:** Handled by User model pre-save hook
3. **Auto-Suspension Lift:** Checks and lifts expired suspensions on login
4. **Employer Verification:** Employers start with pending_verification status
5. **Welcome Emails:** Sent asynchronously to jobseekers via Resend
6. **Token Expiry:** Access token expires per JWT_SECRET config, refresh token expires per JWT_REFRESH_SECRET

---

## 2. Admin Routes (admin.js)

**File:** `backend/src/routes/admin.js`
**Lines:** 896 lines
**Purpose:** Admin dashboard, analytics, user/job management

### 2.1 Middleware Applied

**All Routes:** `authenticate` + `requireAdmin` (lines 8-9)

### 2.2 Endpoints

#### GET /api/admin/dashboard-stats
- **Access:** Private (Admin only)
- **Purpose:** Get comprehensive dashboard statistics with 100% REAL DATA
- **Process:**
  1. **Parallel Counts:** totalUsers, totalEmployers, totalJobSeekers, totalJobs, activeJobs, totalApplications, pendingEmployers, verifiedEmployers, quickUsers
  2. **Growth Calculation:** Compare last 30 days vs previous 30 days for users, jobs, applications
  3. **Growth Percentages:** Calculate real percentage growth
  4. **Top Categories:** Aggregate top 5 categories from active jobs
  5. **Top Cities:** Aggregate top 5 cities from active jobs
  6. **Recent Activity:** Last 10 activities (jobs, users, applications) sorted by timestamp
  7. **Revenue Calculation:** premiumJobs * 28€ + featuredJobs * 42€
- **Response (200):**
  ```javascript
  {
    success: true,
    data: {
      totalUsers, totalEmployers, totalJobSeekers, totalJobs,
      activeJobs, totalApplications, pendingEmployers,
      verifiedEmployers, quickUsers, totalRevenue,
      monthlyGrowth: { users: %, jobs: %, applications: % },
      topCategories: [{ name, count }],
      topCities: [{ name, count }],
      recentActivity: [{ type, description, timestamp }]
    }
  }
  ```

#### GET /api/admin/analytics
- **Access:** Private (Admin only)
- **Query Params:** `period` ('week' | 'month' | 'year', default: 'month')
- **Purpose:** Get platform analytics with trends using 100% REAL DATA
- **Process:**
  1. Calculate days based on period (7, 30, or 365)
  2. Generate dateRange array (YYYY-MM-DD strings)
  3. **User Growth:** Count users created each day in dateRange
  4. **Job Growth:** Count jobs posted each day in dateRange
  5. **Application Growth:** Count applications each day in dateRange
  6. **Conversion Rates:** Calculate visitor→registration, registration→application, application→hire
  7. **Top Performing Jobs:** Aggregate jobs with real application counts (via $lookup)
  8. **User Engagement:** Email stats, active users last 7/30 days
- **Response (200):**
  ```javascript
  {
    success: true,
    data: {
      userGrowth: [{ date, count }],
      jobGrowth: [{ date, count }],
      applicationGrowth: [{ date, count }],
      conversionRates: { visitorToRegistration, registrationToApplication, applicationToHire },
      topPerformingJobs: [{ id, title, company, applicationCount, viewCount }],
      userEngagement: { averageSessionDuration, returnVisitorRate, emailOpenRate, emailClickRate }
    }
  }
  ```

#### GET /api/admin/system-health
- **Access:** Private (Admin only)
- **Purpose:** Get system health metrics with REAL monitoring data
- **Process:**
  1. **Database Status:** Test connection with User.findOne(), measure response time
  2. Set status: 'connected' | 'slow' (>1000ms) | 'disconnected'
  3. **Storage Estimation:** Based on document counts (rough estimate: 2KB per doc)
  4. **Email Service Status:** Check env vars (RESEND_API_KEY, SMTP_HOST)
  5. **Error Rates:** Estimate based on system status
  6. **Uptime:** Calculate based on DB + email service status
  7. **System Info:** Node version, environment, timestamp
- **Response (200):**
  ```javascript
  {
    success: true,
    data: {
      serverStatus: 'healthy' | 'warning',
      databaseStatus: 'connected' | 'slow' | 'disconnected',
      emailServiceStatus: 'operational' | 'down' | 'limited',
      databaseResponseTime: number (ms),
      storageUsage: { total: 100GB, used, available },
      dataMetrics: { totalUsers, totalJobs, totalApplications, totalQuickUsers, totalDocuments },
      apiResponseTimes: { current, average, p95, p99 },
      errorRates: { last24h, last7d },
      uptime: { current, last30Days },
      systemInfo: { nodeVersion, environment, timestamp }
    }
  }
  ```

#### GET /api/admin/users
- **Access:** Private (Admin only)
- **Query Params:** `userType`, `status`, `page=1`, `limit=20`, `search`
- **Purpose:** Get all users with pagination and filters
- **Process:**
  1. Build query based on filters
  2. Add search across firstName, lastName, email, companyName
  3. Paginate results
  4. Exclude password and refreshTokens from response
- **Response (200):**
  ```javascript
  {
    success: true,
    data: {
      users: [...],
      pagination: { currentPage, totalPages, totalUsers, hasNextPage, hasPrevPage }
    }
  }
  ```

#### GET /api/admin/jobs
- **Access:** Private (Admin only)
- **Query Params:** `status`, `employerId`, `page=1`, `limit=20`, `search`
- **Purpose:** Get all jobs with admin view
- **Process:**
  1. Build query with filters
  2. Search across title, description, category
  3. Populate employer data
  4. Paginate results
- **Response (200):**
  ```javascript
  {
    success: true,
    data: {
      jobs: [...],
      pagination: { currentPage, totalPages, totalJobs, hasNextPage, hasPrevPage }
    }
  }
  ```

#### PATCH /api/admin/users/:userId/manage
- **Access:** Private (Admin only)
- **Request Body:**
  ```javascript
  {
    action: 'suspend' | 'activate' | 'delete',
    reason: string (for suspend)
  }
  ```
- **Process:**
  - **suspend:** Set status='suspended', suspendedAt=now, suspensionReason=reason
  - **activate:** Set status='active', clear suspendedAt and suspensionReason
  - **delete:** Hard delete user (findByIdAndDelete)
- **Response (200):**
  ```javascript
  {
    success: true,
    data: { user },
    message: "Përdoruesi u ... me sukses"
  }
  ```

#### PATCH /api/admin/jobs/:jobId/manage
- **Access:** Private (Admin only)
- **Request Body:**
  ```javascript
  {
    action: 'approve' | 'reject' | 'feature' | 'remove_feature' | 'delete',
    reason: string (for reject)
  }
  ```
- **Process:**
  - **approve:** status='active', adminApproved=true
  - **reject:** status='closed', rejectionReason=reason
  - **feature:** tier='premium'
  - **remove_feature:** tier='basic'
  - **delete:** Hard delete job
- **Response (200):**
  ```javascript
  {
    success: true,
    data: { job },
    message: "Veprimu u krye me sukses"
  }
  ```

#### GET /api/admin/user-insights
- **Access:** Private (Admin only)
- **Purpose:** Get detailed user insights and behavior analytics
- **Process:**
  1. **Users by Type:** Aggregate count by userType
  2. **Users by Location:** Aggregate top 10 cities
  3. **Recent Registrations:** Last 20 users (last 30 days)
  4. **User Activity:** Profile completeness (hasProfilePicture, hasCompleteName)
  5. **Jobseeker Profile Stats:** Skills, experience, education, workHistory completion
  6. **Employer Profile Stats:** Verified, hasWebsite, hasDescription
- **Response (200):**
  ```javascript
  {
    success: true,
    data: {
      userDistribution: [{ type, count }],
      locationDistribution: [{ city, count }],
      recentRegistrations: [{ name, type, location, registeredAt, timeAgo }],
      profileCompletion: {
        overall: [...],
        jobseekers: { totalJobseekers, withSkills, withExperience, withEducation, withWorkHistory },
        employers: { totalEmployers, verified, withWebsite, withDescription }
      }
    }
  }
  ```

### 2.3 Helper Function

**formatTimeAgo(date)** (lines 879-894):
- Calculates relative time (Tani, X min më parë, X orë më parë, X ditë më parë, X muaj më parë)

---

## 3. Job Routes (jobs.js)

**File:** `backend/src/routes/jobs.js`
**Lines:** 1016 lines
**Purpose:** Job CRUD operations, search, filtering, recommendations

### 3.1 Middleware Applied

- **Public routes:** `optionalAuth` (GET /jobs, GET /jobs/:id)
- **Employer routes:** `authenticate` + `requireEmployer` + `requireVerifiedEmployer` (POST, PUT)
- **Protected routes:** `authenticate` (GET /recommendations)

### 3.2 Validation Rules

**Job Creation/Update Validation** (lines 27-84):
```javascript
{
  title: 5-100 characters (trimmed),
  description: 50-5000 characters (trimmed),
  category: one of 14 predefined categories,
  jobType: 'full-time' | 'part-time' | 'contract' | 'internship',
  location.city: required,
  salary.min: optional, numeric, >= 0,
  salary.max: optional, numeric, >= 0,
  requirements: optional array,
  benefits: optional array,
  tags: optional array,
  // Platform Categories (ALL REQUIRED):
  platformCategories.diaspora: boolean,
  platformCategories.ngaShtepia: boolean,
  platformCategories.partTime: boolean,
  platformCategories.administrata: boolean,
  platformCategories.sezonale: boolean
}
```

### 3.3 Endpoints

#### GET /api/jobs
- **Access:** Public (optionalAuth)
- **Query Params:**
  ```javascript
  {
    search: string,
    city: string (comma-separated for OR logic),
    category: string,
    jobType: string (comma-separated for OR logic),
    minSalary: number,
    maxSalary: number,
    company: ObjectId (employerId),
    page: number (default: 1),
    limit: number (default: 10),
    sortBy: 'postedAt' | 'salary' (default: 'postedAt'),
    sortOrder: 'asc' | 'desc' (default: 'desc'),
    // Platform Category Filters:
    diaspora: 'true',
    ngaShtepia: 'true',
    partTime: 'true',
    administrata: 'true',
    sezonale: 'true'
  }
  ```
- **Process:**
  1. Build filters object from query params
  2. Handle city as array for OR logic ($in)
  3. Handle jobType as array for OR logic ($in)
  4. Validate company ID is valid ObjectId
  5. Add platform category boolean filters
  6. Call Job.searchJobs(search, filters) - uses $text search if search provided
  7. Apply sorting (premium tier first if sortBy='postedAt')
  8. Paginate with skip + limit
  9. Count total with countQuery (temporarily excludes status/expiresAt filters)
- **Response (200):**
  ```javascript
  {
    success: true,
    data: {
      jobs: [...],
      pagination: { currentPage, totalPages, totalJobs, hasNextPage, hasPrevPage },
      filters: { search, city, category, jobType, minSalary, maxSalary }
    }
  }
  ```
- **Error (500):** Server error

**Key Feature:** Platform category filters (diaspora, ngaShtepia, partTime, administrata, sezonale) implemented with boolean query params.

#### GET /api/jobs/recommendations
- **Access:** Private (authenticate - jobseekers only)
- **Query Params:** `limit=10` (default)
- **Purpose:** Get personalized job recommendations based on user profile and saved jobs
- **Process:**
  1. Check if user is jobseeker (403 if not)
  2. Get user's saved jobs and profile preferences
  3. Build recommendation query (active jobs, exclude saved)
  4. Create scoring pipeline with addFields:
     - Base score: 1
     - Category match bonus: +3 points (if category in user skills)
     - Location match bonus: +2 points (if city matches user location)
     - Remote work bonus: +1 point
     - Recent posting bonus: +1 point (posted in last 7 days)
     - Premium tier bonus: +1 point
  5. If user has saved jobs, add additional scoring:
     - Saved category bonus: +5 points (highest priority)
     - Saved location bonus: +3 points
     - Saved job type bonus: +2 points
  6. Execute aggregation with $lookup for employer info
  7. Sort by score (descending) then postedAt (descending)
  8. Limit results
  9. If insufficient recommendations, add fallback popular jobs
- **Response (200):**
  ```javascript
  {
    success: true,
    data: {
      recommendations: [...],
      total: number,
      personalized: boolean
    }
  }
  ```
- **Error (403):** Not a jobseeker
- **Error (500):** Server error

#### GET /api/jobs/:id
- **Access:** Public (optionalAuth)
- **Process:**
  1. Find job by ID (isDeleted: false)
  2. Populate employerId with full profile info
  3. Increment view count (skip if employer is viewing own job)
- **Response (200):**
  ```javascript
  {
    success: true,
    data: { job }
  }
  ```
- **Error (404):** Job not found
- **Error (500):** Server error

#### POST /api/jobs
- **Access:** Private (authenticate + requireEmployer + requireVerifiedEmployer)
- **Validation:** createJobValidation (see section 3.2)
- **Request Body:**
  ```javascript
  {
    title: string (5-100 chars),
    description: string (50-5000 chars),
    requirements: array (optional),
    benefits: array (optional),
    location: { city: string, remote: boolean, remoteType: string },
    jobType: 'full-time' | 'part-time' | 'contract' | 'internship',
    category: string (one of 14 predefined),
    seniority: string (default: 'mid'),
    salary: { min, max, currency, negotiable, showPublic },
    customQuestions: array (optional),
    tags: array (optional, max 10),
    tier: 'basic' | 'premium',
    platformCategories: {
      diaspora: boolean,
      ngaShtepia: boolean,
      partTime: boolean,
      administrata: boolean,
      sezonale: boolean
    }
  }
  ```
- **Process:**
  1. Validate salary range (min <= max)
  2. Verify location exists in Location model
  3. Generate unique slug from title
  4. Calculate pricing using PricingRule.calculateOptimalPrice()
  5. Check for active campaigns and apply highest discount
  6. Check if employer is whitelisted (freePostingEnabled)
  7. Set job status (pending_payment if price > 0 and not whitelisted, else active)
  8. Save job
  9. **Async:** Track revenue analytics (setImmediate)
  10. **Async:** Send notifications to matching quick users (setImmediate)
- **Response (201):**
  ```javascript
  {
    success: true,
    message: 'Puna u postua me sukses',
    data: { job }
  }
  ```
- **Error (400):** Invalid salary range, invalid location
- **Error (500):** Server error

**Key Features:**
- Dynamic pricing calculation with business rules
- Campaign discount application (percentage or fixed)
- Employer whitelist for free posting
- Revenue analytics tracking
- Automatic notification to matching users

#### PUT /api/jobs/:id
- **Access:** Private (authenticate + requireEmployer + requireVerifiedEmployer)
- **Validation:** createJobValidation
- **Process:**
  1. Find job by ID and employerId (ownership check)
  2. Check if job is expired (cannot edit expired jobs)
  3. Validate salary range
  4. Update job fields
  5. Set updatedAt to now
  6. Save
- **Response (200):**
  ```javascript
  {
    success: true,
    message: 'Puna u përditësua me sukses',
    data: { job }
  }
  ```
- **Error (404):** Job not found or no permission
- **Error (400):** Cannot edit expired job, invalid salary
- **Error (500):** Server error

#### DELETE /api/jobs/:id
- **Access:** Private (authenticate + requireEmployer)
- **Process:**
  1. Find job by ID and employerId
  2. Call job.softDelete() (sets isDeleted=true, deletedAt=now)
- **Response (200):**
  ```javascript
  {
    success: true,
    message: 'Puna u fshi me sukses'
  }
  ```
- **Error (404):** Job not found
- **Error (500):** Server error

#### GET /api/jobs/employer/my-jobs
- **Access:** Private (authenticate + requireEmployer)
- **Query Params:** `status`, `page=1`, `limit=10`, `sortBy='postedAt'`, `sortOrder='desc'`
- **Process:**
  1. Build query (employerId + isDeleted: false + optional status filter)
  2. Apply sorting and pagination
  3. Count total
- **Response (200):**
  ```javascript
  {
    success: true,
    data: {
      jobs: [...],
      pagination: { currentPage, totalPages, totalJobs, hasNextPage, hasPrevPage }
    }
  }
  ```
- **Error (500):** Server error

#### PATCH /api/jobs/:id/status
- **Access:** Private (authenticate + requireEmployer)
- **Request Body:**
  ```javascript
  {
    status: 'active' | 'paused' | 'closed'
  }
  ```
- **Process:**
  1. Validate status value
  2. Find job by ID and employerId
  3. Update status and save
- **Response (200):**
  ```javascript
  {
    success: true,
    message: 'Puna u aktivizua/pezullua/mbyll me sukses',
    data: { job }
  }
  ```
- **Error (400):** Invalid status
- **Error (404):** Job not found
- **Error (500):** Server error

### 3.4 Rate Limiting

**Disabled for development** (commented out in code)

### 3.5 Key Features

1. **Complex Search:** OR logic for cities and jobTypes (comma-separated)
2. **Platform Categories:** Five boolean filters for job classification
3. **Personalized Recommendations:** Scoring system with 6+ factors
4. **Dynamic Pricing:** Integration with PricingRule and BusinessCampaign models
5. **Employer Whitelist:** Free posting for selected employers
6. **Async Operations:** Revenue tracking and notifications don't block response
7. **Slug Generation:** Automatic unique slug creation for SEO
8. **View Tracking:** Automatic increment (excludes owner views)
9. **Soft Delete:** Jobs marked as deleted, not removed from DB

---

## 4. Application Routes (applications.js)

**File:** `backend/src/routes/applications.js`
**Lines:** 601 lines
**Purpose:** Job application CRUD, status management, messaging

### 4.1 Middleware Applied

- **Job seeker routes:** `authenticate` + `requireJobSeeker` (apply, my-applications, withdraw)
- **Employer routes:** `authenticate` + `requireEmployer` (get job applications)
- **Shared routes:** `authenticate` (get single application, send message)

### 4.2 Validation Rules

**Application Validation** (lines 25-40):
```javascript
{
  jobId: isMongoId,
  applicationMethod: 'one_click' | 'custom_form',
  customAnswers: optional array,
  coverLetter: optional, max 2000 characters
}
```

### 4.3 Endpoints

#### POST /api/applications/apply
- **Access:** Private (requireJobSeeker)
- **Validation:** applyValidation
- **Request Body:**
  ```javascript
  {
    jobId: ObjectId,
    applicationMethod: 'one_click' | 'custom_form',
    customAnswers: [{ question, answer }],
    coverLetter: string (optional, max 2000 chars)
  }
  ```
- **Process:**
  1. Find job (active, not deleted, not expired)
  2. Check if user already applied
  3. If one_click: validate profile completeness (firstName, lastName, title, resume required)
  4. If custom_form: validate all required question answers provided
  5. Create application
  6. Populate job and employer data
- **Response (201):**
  ```javascript
  {
    success: true,
    message: 'Aplikimi u dërgua me sukses',
    data: { application }
  }
  ```
- **Error (404):** Job not found or inactive
- **Error (400):** Already applied, incomplete profile, missing required answers
- **Error (500):** Server error

#### GET /api/applications/applied-jobs
- **Access:** Private (requireJobSeeker)
- **Purpose:** Get list of job IDs that user has applied to (for marking applied jobs in UI)
- **Response (200):**
  ```javascript
  {
    success: true,
    data: { jobIds: ['id1', 'id2', ...] }
  }
  ```

#### GET /api/applications/my-applications
- **Access:** Private (requireJobSeeker)
- **Query Params:** `status`, `page=1`, `limit=10`, `sortBy='appliedAt'`, `sortOrder='desc'`
- **Process:**
  1. Call Application.getJobSeekerApplications(userId, filters) (static method)
  2. Apply sorting and pagination in memory
- **Response (200):**
  ```javascript
  {
    success: true,
    data: {
      applications: [...],
      pagination: { currentPage, totalPages, totalApplications, hasNextPage, hasPrevPage }
    }
  }
  ```

#### GET /api/applications/job/:jobId
- **Access:** Private (requireEmployer)