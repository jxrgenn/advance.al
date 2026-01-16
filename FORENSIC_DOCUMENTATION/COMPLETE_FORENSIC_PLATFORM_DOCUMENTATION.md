# ALBANIA JOBFLOW - COMPLETE FORENSIC PLATFORM DOCUMENTATION

**Platform Name:** Albania JobFlow (advance.al / PunaShqip)
**Documentation Date:** January 12, 2026
**Documentation Type:** Complete Forensic Analysis
**Version:** Production System State

---

## TABLE OF CONTENTS

1. [Executive Summary](#executive-summary)
2. [System Architecture Overview](#system-architecture-overview)
3. [Database Schema - Complete Documentation](#database-schema-complete-documentation)
4. [Backend API Routes - Complete Enumeration](#backend-api-routes-complete-enumeration)
5. [Frontend Application Structure](#frontend-application-structure)
6. [User Roles and Permissions](#user-roles-and-permissions)
7. [Complete User Flows](#complete-user-flows)
8. [Business Logic Systems](#business-logic-systems)
9. [Authentication & Authorization](#authentication--authorization)
10. [UI Components Catalog](#ui-components-catalog)
11. [Error States and Edge Cases](#error-states-and-edge-cases)
12. [Verification & Hallucination Check](#verification--hallucination-check)

---

## 1. EXECUTIVE SUMMARY

### 1.1 Platform Purpose
Albania JobFlow (branded as advance.al / PunaShqip) is a job board platform serving the Albanian market. It connects:
- **Job Seekers** (Punëkërkues) - individuals searching for employment opportunities
- **Employers** (Punëdhënës) - companies posting job listings
- **Administrators** - platform operators managing content and users

### 1.2 Technology Stack
**Backend:**
- Runtime: Node.js
- Framework: Express.js
- Database: MongoDB with Mongoose ODM
- Authentication: JWT tokens with bcrypt password hashing
- Email: Resend API for transactional emails
- File Storage: MongoDB GridFS references

**Frontend:**
- Framework: React 18+ with TypeScript
- Build Tool: Vite
- Routing: React Router v6
- UI Library: shadcn/ui components (Radix UI primitives)
- Styling: Tailwind CSS
- State Management: React Context API (AuthContext) + TanStack Query
- Additional UI: Mantine (notifications, modals)
- Carousel: Embla Carousel

### 1.3 Core Features
1. Job posting and search with advanced filtering
2. User authentication with role-based access (jobseeker, employer, admin)
3. Job application system with status tracking
4. Candidate matching algorithm for employers
5. Dynamic pricing engine with rules and campaigns
6. Bulk notification system
7. User reporting and moderation tools
8. Revenue analytics and business intelligence
9. System health monitoring
10. Configuration management with audit trails

---

## 2. SYSTEM ARCHITECTURE OVERVIEW

### 2.1 High-Level Architecture

```
┌─────────────────┐
│   Web Browser   │
│   (Frontend)    │
└────────┬────────┘
         │ HTTPS
         ↓
┌─────────────────┐
│  Express.js API │
│   (Backend)     │
└────────┬────────┘
         │
    ┌────┴────┬──────────┬────────────┐
    ↓         ↓          ↓            ↓
┌────────┐ ┌──────┐ ┌─────────┐ ┌──────────┐
│MongoDB │ │Resend│ │GridFS   │ │3rd Party │
│Database│ │ Email│ │Storage  │ │Services  │
└────────┘ └──────┘ └─────────┘ └──────────┘
```

### 2.2 File Structure

**Backend Structure:**
```
backend/
├── src/
│   ├── config/
│   │   └── database.js          # MongoDB connection
│   ├── lib/
│   │   ├── emailService.js      # Email utilities
│   │   ├── resendEmailService.js
│   │   └── notificationService.js
│   ├── middleware/
│   │   └── auth.js              # JWT authentication middleware
│   ├── models/                  # 16 Mongoose models
│   │   ├── User.js
│   │   ├── Job.js
│   │   ├── Application.js
│   │   ├── Notification.js
│   │   ├── PricingRule.js
│   │   ├── BusinessCampaign.js
│   │   ├── BulkNotification.js
│   │   ├── CandidateMatch.js
│   │   ├── ConfigurationAudit.js
│   │   ├── Location.js
│   │   ├── QuickUser.js
│   │   ├── Report.js
│   │   ├── ReportAction.js
│   │   ├── RevenueAnalytics.js
│   │   ├── SystemConfiguration.js
│   │   └── SystemHealth.js
│   ├── routes/                  # 17 route files
│   │   ├── admin.js
│   │   ├── applications.js
│   │   ├── auth.js
│   │   ├── bulk-notifications.js
│   │   ├── business-control.js
│   │   ├── companies.js
│   │   ├── configuration.js
│   │   ├── jobs.js
│   │   ├── locations.js
│   │   ├── matching.js
│   │   ├── notifications.js
│   │   ├── quickusers.js
│   │   ├── reports.js
│   │   ├── send-verification.js
│   │   ├── stats.js
│   │   ├── users.js
│   │   └── verification.js
│   ├── scripts/                 # Database seeding scripts
│   └── services/
│       └── candidateMatching.js
└── server.js                    # Main entry point
```

**Frontend Structure:**
```
frontend/
├── src/
│   ├── components/
│   │   ├── ui/                  # shadcn/ui primitives (50+ components)
│   │   ├── ApplicationStatusTimeline.tsx
│   │   ├── ContactMethods.tsx
│   │   ├── CoreFilters.tsx
│   │   ├── Footer.tsx
│   │   ├── JobCard.tsx
│   │   ├── JobPricingDisplay.tsx
│   │   ├── JobRecommendations.tsx
│   │   ├── Navigation.tsx
│   │   ├── PremiumJobsCarousel.tsx
│   │   ├── QuickApplyModal.tsx
│   │   ├── RecentlyViewedJobs.tsx
│   │   ├── ReportUserModal.tsx
│   │   ├── SearchInput.tsx
│   │   └── SimilarJobs.tsx
│   ├── contexts/
│   │   └── AuthContext.tsx      # Global auth state
│   ├── hooks/
│   │   ├── use-mobile.tsx
│   │   ├── use-toast.ts
│   │   └── useRecentlyViewed.ts
│   ├── lib/
│   │   ├── api.ts               # API client functions
│   │   └── utils.ts
│   ├── pages/                   # 20 page components
│   │   ├── Index.tsx            # Main job listing
│   │   ├── JobDetail.tsx
│   │   ├── Login.tsx
│   │   ├── Profile.tsx
│   │   ├── SavedJobs.tsx
│   │   ├── PostJob.tsx
│   │   ├── EditJob.tsx
│   │   ├── EmployerDashboard.tsx
│   │   ├── EmployerRegister.tsx
│   │   ├── AboutUs.tsx
│   │   ├── EmployersPage.tsx
│   │   ├── JobSeekersPage.tsx
│   │   ├── CompaniesPageSimple.tsx
│   │   ├── CompanyProfile.tsx
│   │   ├── AdminDashboard.tsx
│   │   ├── AdminReports.tsx
│   │   ├── BusinessDashboard.tsx
│   │   ├── ReportUser.tsx
│   │   ├── NotFound.tsx
│   │   └── Jobs.tsx             # Legacy redirect
│   ├── App.tsx                  # Main routing
│   └── main.tsx                 # Entry point
```

---

## 3. DATABASE SCHEMA - COMPLETE DOCUMENTATION

### 3.1 USER MODEL
**File:** `backend/src/models/User.js`
**Collection:** `users`

#### Schema Definition

```javascript
{
  // Authentication
  email: String (required, unique, validated email format)
  password: String (required, hashed with bcrypt, min 6 chars)
  userType: Enum ['jobseeker', 'employer', 'admin'] (required)

  // Account Status
  status: Enum ['active', 'suspended', 'banned', 'pending_verification', 'deleted']
         Default: 'pending_verification' for employers, 'active' for others
  isDeleted: Boolean (default: false)

  // Suspension/Ban Details (nested object)
  suspensionDetails: {
    reason: String (max 500 chars)
    suspendedBy: ObjectId -> User
    suspendedAt: Date
    expiresAt: Date
    permanent: Boolean
    reportId: ObjectId -> Report
  }

  // Profile Information (nested object)
  profile: {
    firstName: String (required, max 50 chars)
    lastName: String (required, max 50 chars)
    phone: String (validated format: +XXXXXXXX, min 8 digits)
    location: {
      city: String (required, max 50 chars)
      region: String (max 50 chars)
    }

    // Conditional: Job Seeker Profile
    jobSeekerProfile: {
      title: String (max 100 chars)
      bio: String (max 500 chars)
      experience: Enum ['0-1 vjet', '1-2 vjet', '2-5 vjet', '5-10 vjet', '10+ vjet']
      skills: [String] (max 50 chars each)
      education: [{
        degree: String (max 100 chars)
        school: String (max 100 chars)
        year: Number (1950 to current+10)
      }]
      workHistory: [{
        company: String (max 100 chars)
        position: String (max 100 chars)
        startDate: Date
        endDate: Date
        description: String (max 500 chars)
      }]
      resume: String (max 500 chars)
      cvFile: ObjectId -> File
      profilePhoto: ObjectId -> File
      desiredSalary: {
        min: Number (>=0)
        max: Number (>=0)
        currency: Enum ['EUR', 'ALL'] (default: 'EUR')
      }
      openToRemote: Boolean (default: false)
      availability: Enum ['immediately', '2weeks', '1month', '3months']
    }

    // Conditional: Employer Profile
    employerProfile: {
      companyName: String (required for employers, max 100 chars)
      companySize: Enum ['1-10', '11-50', '51-200', '200+'] (required)
      industry: String (required, max 50 chars)
      description: String (max 1000 chars)
      website: String (max 200 chars)
      logo: Mixed (ObjectId or String URL)
      verified: Boolean (default: false)
      verificationDate: Date
      verificationStatus: Enum ['pending', 'approved', 'rejected']
      subscriptionTier: Enum ['basic', 'premium'] (default: 'basic')

      // Contact Preferences
      phone: String (validated format)
      whatsapp: String (validated format)
      contactPreferences: {
        enablePhoneContact: Boolean (default: true)
        enableWhatsAppContact: Boolean (default: true)
        enableEmailContact: Boolean (default: false)
        preferredContactMethod: Enum ['phone', 'whatsapp', 'email', 'form']
      }

      // Candidate Matching Feature
      candidateMatchingEnabled: Boolean (default: false, indexed)
      candidateMatchingJobs: [{
        jobId: ObjectId -> Job
        enabledAt: Date
        expiresAt: Date (null = no expiration)
      }]
    }
  }

  // Metadata
  emailVerified: Boolean (default: false)
  emailVerificationToken: String
  passwordResetToken: String
  passwordResetExpires: Date
  lastLoginAt: Date

  // Privacy
  privacySettings: {
    profileVisible: Boolean (default: true)
    showInSearch: Boolean (default: true)
  }

  // Saved Jobs (jobseekers only)
  savedJobs: [ObjectId] -> Job

  // Business Privileges (admin-granted)
  freePostingEnabled: Boolean (default: false)
  freePostingReason: String
  freePostingGrantedBy: ObjectId -> User
  freePostingGrantedAt: Date

  // Timestamps
  createdAt: Date (auto)
  updatedAt: Date (auto)
}
```

#### Indexes
- `userType`: 1
- `profile.location.city`: 1
- `isDeleted`: 1
- `status`: 1
- `profile.employerProfile.candidateMatchingEnabled`: 1 (for matching feature)

#### Virtual Fields
- `profile.fullName`: Returns "{firstName} {lastName}"

#### Instance Methods

1. **comparePassword(candidatePassword)**: Promise<Boolean>
   - Compares provided password with hashed password using bcrypt

2. **softDelete()**: Promise<User>
   - Sets isDeleted=true and status='deleted'

3. **checkSuspensionStatus()**: Promise<User>
   - Auto-lifts expired temporary suspensions

4. **suspend(reason, suspendedBy, duration, reportId)**: Promise<User>
   - Suspends user with optional expiration
   - Duration in days, null = permanent

5. **ban(reason, bannedBy, reportId)**: Promise<User>
   - Permanently bans user

6. **liftSuspension()**: Promise<User>
   - Restores account to active status

7. **saveJob(jobId)**: Promise<User>
   - Adds job to savedJobs array (jobseekers only)

8. **unsaveJob(jobId)**: Promise<User>
   - Removes job from savedJobs

9. **isJobSaved(jobId)**: Boolean
   - Checks if job is in savedJobs

#### Static Methods

1. **findActive(filter)**: Query
   - Returns users not deleted/suspended/banned

2. **checkExpiredSuspensions()**: Promise<Number>
   - Auto-lifts all expired suspensions, returns count

#### Middleware Hooks

**Pre-save:**
- Hashes password if modified (bcrypt rounds: 12)
- Does not rehash if password unchanged

**toJSON override:**
- Removes sensitive fields: password, emailVerificationToken, passwordResetToken, passwordResetExpires

---

### 3.2 JOB MODEL
**File:** `backend/src/models/Job.js`
**Collection:** `jobs`

#### Schema Definition

```javascript
{
  // Ownership
  employerId: ObjectId -> User (required, indexed)

  // Job Details
  title: String (required, max 100 chars, indexed for text search)
  description: String (required, max 5000 chars, indexed for text search)
  requirements: [String] (max 500 chars each)
  benefits: [String] (max 500 chars each)

  // Location
  location: {
    city: String (required, max 50 chars, indexed)
    region: String (max 50 chars)
    remote: Boolean (default: false)
    remoteType: Enum ['full', 'hybrid', 'none'] (default: 'none')
  }

  // Employment Details
  jobType: Enum ['full-time', 'part-time', 'contract', 'internship'] (required, indexed)

  // Core Platform Filters (REQUIRED for all jobs)
  platformCategories: {
    diaspora: Boolean (required, default: false)      // Jobs outside Albania
    ngaShtepia: Boolean (required, default: false)    // Remote work
    partTime: Boolean (required, default: false)      // Part-time positions
    administrata: Boolean (required, default: false)  // Government positions
    sezonale: Boolean (required, default: false)      // Seasonal jobs (3 months)
  }

  // Classification
  category: Enum [
    'Teknologji', 'Marketing', 'Shitje', 'Financë', 'Burime Njerëzore',
    'Inxhinieri', 'Dizajn', 'Menaxhim', 'Shëndetësi', 'Arsim',
    'Turizëm', 'Ndërtim', 'Transport', 'Tjetër'
  ] (required, indexed)
  seniority: Enum ['junior', 'mid', 'senior', 'lead'] (default: 'mid')

  // Compensation
  salary: {
    min: Number (>=0)
    max: Number (>=0)
    currency: Enum ['EUR', 'ALL'] (default: 'EUR')
    negotiable: Boolean (default: true)
    showPublic: Boolean (default: true)
  }

  // Posting Status
  status: Enum ['active', 'paused', 'closed', 'draft', 'expired'] (default: 'active', indexed)
  tier: Enum ['basic', 'premium'] (default: 'basic', indexed)
  postedAt: Date (default: now)
  expiresAt: Date (default: +30 days, indexed)
  isDeleted: Boolean (default: false, indexed)

  // Application Settings
  applicationMethod: Enum ['internal', 'email', 'external_link'] (default: 'internal')
  externalApplicationUrl: String
  customQuestions: [{
    question: String (required, max 500 chars)
    required: Boolean (default: false)
    type: Enum ['text', 'email', 'phone', 'file'] (default: 'text')
  }]

  // Contact Method Overrides (per-job basis)
  contactOverrides: {
    useCustomContacts: Boolean (default: false)
    phone: String (validated format)
    whatsapp: String (validated format)
    email: String (validated format)
    enabledMethods: {
      phone: Boolean (default: true)
      whatsapp: Boolean (default: true)
      email: Boolean (default: false)
    }
  }

  // Pricing (Business Control Integration)
  pricing: {
    basePrice: Number (default: 50)
    finalPrice: Number (default: 50)
    appliedRules: [ObjectId] -> PricingRule
    discount: Number (default: 0)
    priceIncrease: Number (default: 0)
    campaignApplied: ObjectId -> BusinessCampaign
  }

  // Payment Tracking
  paymentRequired: Number (default: 0)
  paymentStatus: Enum ['pending', 'paid', 'failed', 'refunded'] (default: 'pending')
  paymentId: String

  // Stats
  viewCount: Number (default: 0)
  applicationCount: Number (default: 0)

  // SEO & Search
  tags: [String] (max 50 chars each, indexed for text search)
  slug: String (unique, required, auto-generated)

  // Timestamps
  createdAt: Date (auto)
  updatedAt: Date (auto)
}
```

#### Indexes
- Text index on: title, tags, description
- `location.city, status`: 1
- `category, postedAt`: -1
- `employerId, status`: 1
- `postedAt`: -1
- `tier, status`: 1
- `isDeleted`: 1
- `expiresAt`: 1

#### Virtual Fields

1. **formattedSalary**: String
   - Returns formatted salary range in local language
   - "Pagë për t'u negociuar" if no salary
   - "50-100 EUR" format

2. **timeAgo**: String
   - Returns time since posted
   - "X ditë më parë", "X orë më parë", "Sapo postuar"

#### Instance Methods

1. **incrementViewCount()**: Promise<Job>
   - Increments viewCount by 1

2. **incrementApplicationCount()**: Promise<Job>
   - Increments applicationCount by 1

3. **softDelete()**: Promise<Job>
   - Sets isDeleted=true and status='closed'

4. **isExpired()**: Boolean
   - Checks if current date > expiresAt

#### Static Methods

1. **findActive(filter)**: Query
   - Returns non-deleted, active, non-expired jobs

2. **searchJobs(searchQuery, filters)**: Query
   - **Text Search**: Uses MongoDB $text on title/description/tags
   - **Location Filter**: OR logic with $in operator for multiple cities
   - **JobType Filter**: OR logic with $in operator for multiple types
   - **Category Filter**: Exact match
   - **Employer Filter**: For company-specific listings
   - **Platform Filters**: diaspora, ngaShtepia, partTime, administrata, sezonale
   - **Salary Range**: Complex $or logic for min/max matching
   - **Sort**: Premium jobs first (tier:-1), then by date (postedAt:-1)
   - **Population**: Populates employerId with company details

#### Middleware Hooks

**Pre-save (slug generation):**
- Auto-generates unique slug from title
- Lowercases, removes special chars, replaces spaces with hyphens
- Appends counter if duplicate exists

**Pre-save (expiration):**
- Sets expiresAt to +30 days if not provided

---

### 3.3 APPLICATION MODEL
**File:** `backend/src/models/Application.js`
**Collection:** `applications`

#### Schema Definition

```javascript
{
  // References
  jobId: ObjectId -> Job (required, indexed)
  jobSeekerId: ObjectId -> User (required, indexed)
  employerId: ObjectId -> User (required, indexed)

  // Application Data
  appliedAt: Date (default: now, indexed)
  status: Enum ['pending', 'viewed', 'shortlisted', 'rejected', 'hired']
         (default: 'pending', indexed)

  // Application Method
  applicationMethod: Enum ['one_click', 'custom_form'] (required)
  customAnswers: [{
    question: String (required)
    answer: String (required)
  }]

  // Additional Data
  additionalFiles: [ObjectId] -> File
  coverLetter: String (max 2000 chars)

  // Employer Actions
  employerNotes: String (max 1000 chars)
  viewedAt: Date
  respondedAt: Date

  // Communication Messages
  messages: [{
    from: ObjectId -> User (required)
    message: String (required, max 2000 chars)
    sentAt: Date (default: now)
    type: Enum ['text', 'interview_invite', 'offer', 'rejection'] (default: 'text')
    read: Boolean (default: false)
  }]

  // Withdrawal
  withdrawn: Boolean (default: false)
  withdrawnAt: Date
  withdrawalReason: String

  // Timestamps
  createdAt: Date (auto)
  updatedAt: Date (auto)
}
```

#### Indexes
- `jobId, appliedAt`: -1
- `jobSeekerId, appliedAt`: -1
- `employerId, status`: 1
- `appliedAt`: -1
- `status`: 1
- **Unique Compound Index**: `jobId, jobSeekerId` (prevents duplicate applications)

#### Virtual Fields

1. **timeAgo**: String
   - Time since application
   - "X ditë më parë", "X orë më parë", "Sapo aplikuar"

2. **unreadMessageCount**: Number
   - Count of unread messages in thread

#### Instance Methods

1. **markAsViewed()**: Promise<Application>
   - Changes status from 'pending' to 'viewed'
   - Sets viewedAt timestamp

2. **updateStatus(newStatus, notes)**: Promise<Application>
   - Changes application status
   - Creates notification for job seeker
   - Sets respondedAt timestamp
   - Logs status change to console

3. **addMessage(from, message, type)**: Promise<Application>
   - Adds message to conversation thread
   - Sets read=false

4. **markMessagesAsRead(userId)**: Promise<Application>
   - Marks all messages NOT from userId as read

5. **withdraw(reason)**: Promise<Application>
   - Sets withdrawn=true
   - Records withdrawal reason and timestamp

#### Static Methods

1. **hasUserApplied(jobId, jobSeekerId)**: Promise<Application>
   - Checks if user already applied (non-withdrawn)

2. **getEmployerApplications(employerId, filters)**: Query
   - Gets applications for employer
   - Filters: status, jobId
   - Populates job and jobseeker details
   - Sorts by appliedAt descending

3. **getJobSeekerApplications(jobSeekerId, filters)**: Query
   - Gets applications for job seeker
   - Filters: status
   - Populates job and employer details
   - Sorts by appliedAt descending

#### Middleware Hooks

**Pre-save:**
- Increments job's applicationCount when new application created

---

### 3.4 NOTIFICATION MODEL
**File:** `backend/src/models/Notification.js`
**Collection:** `notifications`

#### Schema Definition

```javascript
{
  // Recipient
  userId: ObjectId -> User (required, indexed)

  // Notification Type
  type: Enum [
    'application_status_changed',
    'application_received',
    'message_received',
    'job_expired',
    'interview_scheduled',
    'account_warning',
    'account_suspended',
    'account_banned',
    'account_restored',
    'general'
  ] (required, indexed)

  // Content
  title: String (required, max 200 chars)
  message: String (required, max 500 chars)
  data: Mixed (default: {}) // Additional contextual data

  // Read Status
  read: Boolean (default: false, indexed)
  readAt: Date

  // Bulk Notification Reference
  bulkNotificationId: ObjectId -> BulkNotification
  deliveryChannel: Enum ['in-app', 'email', 'both'] (default: 'in-app')

  // Related Entities
  relatedApplication: ObjectId -> Application
  relatedJob: ObjectId -> Job

  // Email Status
  emailSent: Boolean (default: false)
  emailSentAt: Date

  // Timestamps
  createdAt: Date (auto, indexed)
  updatedAt: Date (auto)
}
```

#### Indexes
- `userId, createdAt`: -1
- `userId, read`: 1
- `type`: 1
- `createdAt`: -1

#### Virtual Fields

**timeAgo**: String
- "X ditë më parë", "X orë më parë", "X minuta më parë", "Tani"

#### Instance Methods

**markAsRead()**: Promise<Notification>
- Sets read=true and readAt timestamp

#### Static Methods

1. **createApplicationStatusNotification(application, oldStatus, newStatus)**: Promise<Notification>
   - Creates notification when application status changes
   - Templates for: viewed, shortlisted, rejected, hired
   - Populates job and employer info
   - Albanian language messages

2. **getUserNotifications(userId, options)**: Query
   - Options: limit (default 20), skip (default 0), unreadOnly (default false)
   - Populates related job and application
   - Sorts by createdAt descending

3. **markAllAsReadForUser(userId)**: Promise<UpdateResult>
   - Bulk updates all unread notifications to read

4. **getUnreadCount(userId)**: Promise<Number>
   - Returns count of unread notifications

5. **createAccountActionNotification(userId, action, reason, duration, reportId)**: Promise<Notification>
   - Actions: warning, temporary_suspension, permanent_suspension, account_termination, account_restored
   - Albanian language templates

---

### 3.5 PRICING RULE MODEL
**File:** `backend/src/models/PricingRule.js`
**Collection:** `pricingrules`

#### Schema Definition

```javascript
{
  // Rule Identity
  name: String (required, max 100 chars)
  description: String (max 500 chars)
  category: Enum ['industry', 'location', 'demand_based', 'company_size', 'seasonal', 'time_based'] (required, indexed)

  // Pricing Rules
  rules: {
    basePrice: Number (required, >=0)
    multiplier: Number (required, 0.1-10.0, default: 1.0)
    fixedAdjustment: Number (default: 0) // Add/subtract fixed amount

    // Conditions (all must pass)
    conditions: [{
      field: Enum ['industry', 'location.city', 'location.region', 'companySize',
                   'userType', 'accountAge', 'totalSpent', 'timeOfDay', 'dayOfWeek'] (required)
      operator: Enum ['equals', 'not_equals', 'contains', 'not_contains',
                      'greater_than', 'less_than', 'greater_equal', 'less_equal',
                      'in_array', 'not_in_array'] (required)
      value: Mixed (required)
    }]

    // Demand-based pricing
    demandMultiplier: {
      enabled: Boolean (default: false)
      threshold: Number (default: 10) // Jobs posted in last 24h
      multiplier: Number (default: 1.5)
    }
  }

  // Status
  isActive: Boolean (default: true, indexed)
  priority: Number (1-100, default: 50, indexed) // Higher = higher priority
  validFrom: Date (default: now, indexed)
  validTo: Date (default: null, indexed) // null = no expiry

  // Revenue Tracking
  revenue: {
    totalGenerated: Number (default: 0)
    jobsAffected: Number (default: 0)
    averagePrice: Number (default: 0)
    lastCalculated: Date (default: now)
  }

  // Usage Tracking
  usage: {
    timesApplied: Number (default: 0)
    lastApplied: Date
    averageImpact: Number (default: 0) // Average price change %
  }

  // Audit
  createdBy: ObjectId -> User (required)
  lastModifiedBy: ObjectId -> User

  // Timestamps
  createdAt: Date (auto)
  updatedAt: Date (auto)
}
```

#### Indexes
- `isActive, priority`: -1
- `category, isActive`: 1
- `validFrom, validTo`: 1
- `rules.conditions.field, rules.conditions.value`: 1

#### Virtual Fields

1. **effectiveness**: Number
   - Revenue per application: totalGenerated / timesApplied

2. **revenuePerDay**: Number
   - Daily revenue rate since creation

#### Instance Methods

1. **isCurrentlyValid()**: Boolean
   - Checks if active and within valid date range

2. **evaluateConditions(jobData, employerData)**: Boolean
   - Evaluates all conditions against provided data
   - All conditions must pass (AND logic)

3. **getFieldValue(fieldPath, jobData, employerData)**: Mixed
   - Extracts nested field values (e.g., "location.city")

4. **evaluateCondition(condition, fieldValue)**: Boolean
   - Evaluates single condition with operator logic

5. **calculatePrice(basePrice, jobData, employerData)**: Number
   - Calculates final price if conditions pass
   - Applies multiplier, fixed adjustment, demand multiplier
   - Rounds to 2 decimal places

6. **checkDemand(jobData)**: Boolean
   - Simplified demand check (currently random)

7. **trackUsage(priceImpact, revenue)**: Promise<PricingRule>
   - Records usage statistics
   - Updates average impact and revenue

#### Static Methods

1. **getApplicableRules(jobData, employerData)**: Promise<PricingRule[]>
   - Returns all rules that pass conditions
   - Sorted by priority descending

2. **calculateOptimalPrice(basePrice, jobData, employerData)**: Promise<Object>
   - Applies highest priority matching rule
   - Returns: finalPrice, originalPrice, appliedRules, discount, priceIncrease, rule

3. **getPricingAnalytics(options)**: Promise<Array>
   - Aggregate revenue by category
   - Options: startDate, endDate, category

---

### 3.6 BUSINESS CAMPAIGN MODEL
**File:** `backend/src/models/BusinessCampaign.js`
**Collection:** `businesscampaigns`

#### Schema Definition

```javascript
{
  // Campaign Identity
  name: String (required, max 100 chars)
  description: String (max 500 chars)
  type: Enum ['flash_sale', 'referral', 'new_user_bonus', 'seasonal',
              'industry_specific', 'bulk_discount'] (required, indexed)
  status: Enum ['draft', 'scheduled', 'active', 'paused', 'completed', 'cancelled']
         (default: 'draft', indexed)

  // Campaign Parameters
  parameters: {
    discount: Number (0-90, default: 0)
    discountType: Enum ['percentage', 'fixed_amount'] (default: 'percentage')
    duration: Number (1-8760 hours, required)
    targetAudience: Enum ['all', 'new_employers', 'returning_employers',
                          'enterprise', 'specific_industry'] (default: 'all')
    industryFilter: [String] // For industry-specific campaigns
    locationFilter: [String] // For location-specific campaigns
    maxUses: Number (>=1, default: 1000)
    currentUses: Number (default: 0)
    minJobPrice: Number (default: 0)
    referralReward: Number (default: 0) // For referral campaigns
  }

  // Schedule
  schedule: {
    startDate: Date (required, indexed)
    endDate: Date (required, indexed)
    timezone: String (default: 'Europe/Tirane')
    autoActivate: Boolean (default: true)
  }

  // Results
  results: {
    revenue: Number (default: 0)
    conversions: Number (default: 0)
    engagements: Number (default: 0)
    newSignups: Number (default: 0)
    jobsPosted: Number (default: 0)
    averageOrderValue: Number (default: 0)
    roi: Number (default: 0)
  }

  // Costs
  costs: {
    totalCost: Number (default: 0)
    discountGiven: Number (default: 0)
    referralPayouts: Number (default: 0)
  }

  // Status
  isActive: Boolean (default: false, indexed)

  // Audit
  createdBy: ObjectId -> User (required, indexed)
  lastModifiedBy: ObjectId -> User

  // Timestamps
  createdAt: Date (auto)
  updatedAt: Date (auto)
}
```

#### Virtual Fields

1. **profitability**: Number
   - revenue - totalCost

2. **conversionRate**: Number
   - (conversions / engagements) * 100, fixed to 2 decimals

3. **durationDays**: Number
   - Days between start and end date

#### Instance Methods

1. **activate()**: Promise<Campaign>
   - Sets status='active', isActive=true

2. **pause(userId)**: Promise<Campaign>
   - Sets status='paused', isActive=false

3. **complete(userId)**: Promise<Campaign>
   - Sets status='completed', isActive=false

4. **trackConversion(revenue, newSignup)**: Promise<Campaign>
   - Increments conversions, revenue, optionally newSignups
   - Increments currentUses
   - Recalculates averageOrderValue and ROI

5. **addEngagement()**: Promise<Campaign>
   - Increments engagements counter

#### Static Methods

1. **getActiveCampaigns(type)**: Query
   - Returns active campaigns, optionally filtered by type
   - Populates createdBy
   - Sorts by revenue descending

2. **getCampaignPerformance(options)**: Promise<Array>
   - Aggregate performance by type
   - Options: startDate, endDate, type
   - Returns: revenue, conversions, engagements, costs, ROI, etc.

3. **canUseCampaign(campaignId, userId)**: Promise<Campaign>
   - Checks if campaign is active, within dates, has remaining uses

---

### 3.7 BULK NOTIFICATION MODEL
**File:** `backend/src/models/BulkNotification.js`
**Collection:** `bulknotifications`

#### Schema Definition

```javascript
{
  // Content
  title: String (required, max 200 chars)
  message: String (required, max 2000 chars)
  type: Enum ['announcement', 'maintenance', 'feature', 'warning', 'update']
       (default: 'announcement', indexed)

  // Targeting
  targetAudience: Enum ['all', 'employers', 'jobseekers', 'admins']
                 (required, default: 'all', indexed)

  // Status
  status: Enum ['draft', 'sending', 'sent', 'failed', 'cancelled']
         (default: 'draft', indexed)
  sentAt: Date (indexed)
  scheduledFor: Date // For scheduled sending

  // Delivery Stats
  deliveryStats: {
    targetCount: Number (default: 0)
    sentCount: Number (default: 0)
    deliveredCount: Number (default: 0)
    emailsSent: Number (default: 0)
    emailsDelivered: Number (default: 0)
    emailsFailed: Number (default: 0)
  }

  // Template
  template: Boolean (default: false, indexed)
  templateName: String (max 100 chars, sparse index)

  // Delivery Channels
  deliveryChannels: {
    inApp: Boolean (default: true)
    email: Boolean (default: true)
  }

  // Error Logging
  errorLog: [{
    timestamp: Date (default: now)
    error: String
    userId: ObjectId
    channel: Enum ['in-app', 'email']
  }]

  // Audit
  createdBy: ObjectId -> User (required, indexed)

  // Timestamps
  createdAt: Date (auto)
  updatedAt: Date (auto)
}
```

#### Virtual Fields

1. **deliverySuccessRate**: Number
   - (deliveredCount / targetCount) * 100

2. **emailSuccessRate**: Number
   - (emailsDelivered / emailsSent) * 100

3. **timeSinceSent**: String
   - "X ditë më parë", etc. or null if not sent

#### Instance Methods

1. **getTargetUsers()**: Promise<User[]>
   - Queries users based on targetAudience
   - Excludes banned users and active suspensions
   - Returns: _id, email, profile.firstName, profile.lastName, userType

2. **updateDeliveryStats(updates)**: Promise<BulkNotification>
   - Updates delivery statistics

3. **logError(error, userId, channel)**: Promise<BulkNotification>
   - Adds error to errorLog array

4. **markAsSent()**: Promise<BulkNotification>
   - Sets status='sent', sentAt=now

5. **markAsFailed(error)**: Promise<BulkNotification>
   - Sets status='failed', logs error

#### Static Methods

1. **getHistory(options)**: Query
   - Options: page, limit, status, targetAudience, type, createdBy
   - Populates createdBy
   - Paginated results

2. **getTemplates()**: Query
   - Returns template=true notifications
   - Selected fields only

3. **createFromTemplate(templateId, createdBy)**: Promise<BulkNotification>
   - Clones template as new draft notification

#### Middleware Hooks

**Pre-save:**
- Validates templateName is required when template=true
- Clears templateName if template=false

---

### 3.8 CANDIDATE MATCH MODEL
**File:** `backend/src/models/CandidateMatch.js`
**Collection:** `candidatematches`

#### Schema Definition

```javascript
{
  // References
  jobId: ObjectId -> Job (required, indexed)
  candidateId: ObjectId -> User (required, indexed)

  // Match Score
  matchScore: Number (required, 0-100, indexed)

  // Score Breakdown
  matchBreakdown: {
    titleMatch: Number (0-20, default: 0)
    skillsMatch: Number (0-25, default: 0)
    experienceMatch: Number (0-15, default: 0)
    locationMatch: Number (0-15, default: 0)
    educationMatch: Number (0-5, default: 0)
    salaryMatch: Number (0-10, default: 0)
    availabilityMatch: Number (0-10, default: 0)
  }
  // Total possible: 100 points

  // Timestamps
  calculatedAt: Date (default: now, indexed)
  expiresAt: Date (required, indexed) // TTL index

  // Contact Tracking
  contacted: Boolean (default: false, indexed)
  contactedAt: Date
  contactMethod: Enum ['email', 'phone', 'whatsapp']

  // Auto timestamps
  createdAt: Date (auto)
  updatedAt: Date (auto)
}
```

#### Indexes
- `jobId, matchScore`: -1 (for sorted retrieval)
- **Unique Compound**: `jobId, candidateId` (prevents duplicates)
- **TTL Index**: `expiresAt: 1` with expireAfterSeconds: 0

#### Virtual Fields
- `job`: Virtual populate to Job model
- `candidate`: Virtual populate to User model

**Note:** This model has automatic document expiration via TTL index.

---

### 3.9 REPORT MODEL
**File:** `backend/src/models/Report.js`
**Collection:** `reports`

#### Schema Definition

```javascript
{
  // Core References
  reportedUser: ObjectId -> User (required, indexed)
  reportingUser: ObjectId -> User (required, indexed)

  // Report Details
  category: Enum [
    'fake_cv', 'inappropriate_content', 'suspicious_profile',
    'spam_behavior', 'impersonation', 'harassment',
    'fake_job_posting', 'unprofessional_behavior', 'other'
  ] (required, indexed)
  description: String (max 1000 chars)
  evidence: [String] // URLs to uploaded files (max 500 chars each)

  // Status Tracking
  status: Enum ['pending', 'under_review', 'resolved', 'dismissed']
         (default: 'pending', indexed)
  priority: Enum ['low', 'medium', 'high', 'critical']
           (default: 'medium', indexed)

  // Assignment
  assignedAdmin: ObjectId -> User (indexed)

  // Resolution
  resolution: {
    action: Enum ['no_action', 'warning', 'temporary_suspension',
                  'permanent_suspension', 'account_termination']
    reason: String (max 500 chars)
    duration: Number (0-365 days, for temporary actions)
    resolvedBy: ObjectId -> User
    resolvedAt: Date
    adminNotes: String (max 1000 chars)
  }

  // Metadata
  metadata: {
    ipAddress: String (max 45 chars for IPv6)
    userAgent: String (max 500 chars)
    source: Enum ['web', 'mobile', 'api'] (default: 'web')
    location: {
      country: String
      city: String
    }
  }

  // Admin Workflow
  internalNotes: [{
    adminId: ObjectId -> User
    note: String (max 500 chars)
    timestamp: Date (default: now)
  }]

  // Related Reports (pattern detection)
  relatedReports: [ObjectId] -> Report

  // Escalation
  escalated: Boolean (default: false)
  escalatedAt: Date
  escalatedBy: ObjectId -> User
  escalationReason: String (max 500 chars)

  // Timestamps
  createdAt: Date (auto, indexed)
  updatedAt: Date (auto)
}
```

#### Indexes
- `reportedUser, status`: 1
- `status, priority, createdAt`: -1, -1, -1
- `assignedAdmin, status`: 1
- `category, createdAt`: -1
- `reportingUser, createdAt`: -1
- `createdAt`: -1
- **Partial Index**: `reportedUser, reportingUser, createdAt` (prevents duplicate reports within 24h)

#### Virtual Fields

1. **ageInHours**: Number
   - Hours since report creation

2. **priorityScore**: Number
   - Numeric score: low=1, medium=2, high=3, critical=4

#### Instance Methods

1. **resolve(action, reason, adminId, duration)**: Promise<Report>
   - Sets status='resolved'
   - Records resolution details
   - **Side Effects:**
     - Suspends/bans reported user based on action
     - Creates notification for reported user
     - Sends email notification asynchronously

2. **reopen(adminId, reason)**: Promise<Report>
   - Reverts report to 'under_review'
   - **Side Effects:**
     - Lifts suspension/ban if previously applied
     - Creates account restoration notification
     - Adds admin note about reopening

3. **escalate(adminId, reason)**: Promise<Report>
   - Sets escalated=true
   - Changes priority to 'critical'

4. **addAdminNote(adminId, note)**: Promise<Report>
   - Adds note to internalNotes array

#### Static Methods

1. **getByStatus(status, options)**: Query
   - Options: sort, limit, skip
   - Populates all user references

2. **getReportsForUser(userId, includeAsReporter)**: Query
   - Gets reports where user is reported
   - Optionally includes reports user filed

3. **getStats(timeframe)**: Promise<Object>
   - Aggregate statistics by status, category, priority
   - Timeframe in days (default: 30)

#### Middleware Hooks

**Pre-save:**
- Auto-escalates if 3+ pending reports against same user (priority=high)
- Auto-escalates if 5+ reports against same user (priority=critical, escalated=true)

**Post-save:**
- Sends notification to admins for new reports

---

### 3.10 REPORT ACTION MODEL
**File:** `backend/src/models/ReportAction.js`
**Collection:** `report_actions`

#### Schema Definition

```javascript
{
  // References
  report: ObjectId -> Report (required, indexed)

  // Action Details
  actionType: Enum [
    'report_created', 'report_assigned', 'report_reviewed', 'report_escalated',
    'report_resolved', 'report_dismissed', 'user_warned', 'user_suspended',
    'user_banned', 'suspension_lifted', 'note_added', 'priority_changed',
    'status_changed'
  ] (required, indexed)

  // Actors
  performedBy: ObjectId -> User (required, indexed)
  targetUser: ObjectId -> User (indexed) // Usually the reported user

  // Action Details
  actionDetails: {
    // State tracking
    previousState: {
      status: String
      priority: String
      assignedAdmin: ObjectId
      userAccountStatus: String
    }
    newState: {
      status: String
      priority: String
      assignedAdmin: ObjectId
      userAccountStatus: String
    }
    // Action-specific data
    actionData: {
      reason: String (max 1000 chars)
      duration: Number (0-365 days)
      automaticExpiry: Date
      notes: String (max 1000 chars)
      escalationLevel: Enum ['low', 'medium', 'high', 'critical']
    }
  }

  // Context
  context: {
    ipAddress: String (max 45 chars)
    userAgent: String (max 500 chars)
    source: Enum ['admin_dashboard', 'api', 'automated_system', 'mobile_app']
           (default: 'admin_dashboard')
    sessionId: String (max 100 chars)
  }

  // Approval Workflow (for serious actions)
  approval: {
    required: Boolean (default: false)
    approvedBy: ObjectId -> User
    approvedAt: Date
    approvalComments: String (max 500 chars)
  }

  // Reversal Tracking
  reversed: Boolean (default: false)
  reversedBy: ObjectId -> User
  reversedAt: Date
  reversalReason: String (max 500 chars)

  // System Flags
  automated: Boolean (default: false)
  systemGenerated: Boolean (default: false)

  // Compliance
  complianceFlags: [{
    flag: Enum ['gdpr_related', 'legal_request', 'policy_violation', 'safety_concern']
    details: String (max 500 chars)
    flaggedAt: Date (default: now)
  }]

  // Related Actions (for chaining)
  relatedActions: [ObjectId] -> ReportAction

  // Timestamps
  createdAt: Date (auto, indexed)
  updatedAt: Date (auto)
}
```

#### Indexes
- `report, createdAt`: -1
- `performedBy, createdAt`: -1
- `targetUser, actionType, createdAt`: -1
- `actionType, createdAt`: -1
- `createdAt`: -1
- `approval.required, approval.approvedBy`: 1

#### Virtual Fields

1. **summary**: String
   - Human-readable action description
   - E.g., "Report submitted", "User suspended"

2. **severity**: Number
   - 1-5 scale based on actionType
   - 1=low (report_created, note_added)
   - 5=critical (user_banned)

#### Instance Methods

1. **createFollowUp(actionType, actionDetails, performedBy)**: Promise<ReportAction>
   - Creates linked follow-up action
   - Updates relatedActions array

2. **reverse(reversedBy, reason)**: Promise<ReportAction>
   - Reverses the action (only certain types allowed)
   - Reversible: user_warned, user_suspended, report_dismissed
   - Creates new suspension_lifted action

#### Static Methods

1. **getReportHistory(reportId, options)**: Query
   - Gets action history for a report
   - Populates user references
   - Options: desc (default true), limit (default 50)

2. **getAdminActions(adminId, options)**: Query
   - Gets actions by specific admin
   - Options: startDate, endDate, limit

3. **getUserViolationHistory(userId)**: Query
   - Gets all warning/suspension/ban actions for user
   - Populates report and admin details

4. **getActionStats(timeframe)**: Promise<Object>
   - Aggregate statistics by actionType, admin, daily activity
   - Timeframe in days (default: 30)

#### Middleware Hooks

**Pre-save:**
- Auto-populates targetUser from report if not provided
- Sets approval.required=true for serious actions (ban, suspension)

**Post-save:**
- Sends notifications to relevant parties
- Updates report status if action is 'report_resolved'

---

### 3.11 SYSTEM CONFIGURATION MODEL
**File:** `backend/src/models/SystemConfiguration.js`
**Collection:** `systemconfigurations`

#### Schema Definition

```javascript
{
  // Configuration Identity
  category: Enum ['platform', 'users', 'content', 'email', 'system', 'features'] (required, indexed)
  key: String (required, unique, max 100 chars)

  // Value
  value: Mixed (required)
  dataType: Enum ['string', 'number', 'boolean', 'json', 'array'] (required)

  // Metadata
  description: String (required, max 500 chars)
  defaultValue: Mixed
  isPublic: Boolean (default: false, indexed) // Can frontend access it?
  requiresRestart: Boolean (default: false) // Does changing it require server restart?

  // Validation Rules
  validation: {
    required: Boolean (default: false)
    min: Number // For numbers
    max: Number // For numbers
    pattern: String // Regex for strings
    allowedValues: [Mixed] // Enum-like validation
  }

  // Audit
  lastModifiedBy: ObjectId -> User (required)
  lastModifiedAt: Date (default: now, indexed)

  // Status
  isActive: Boolean (default: true, indexed)

  // Timestamps
  createdAt: Date (auto)
  updatedAt: Date (auto)
}
```

#### Indexes
- `category, isActive`: 1
- `lastModifiedAt`: -1
- `isPublic`: 1

#### Virtual Fields

1. **path**: String
   - Returns "category.key"

2. **timeSinceModified**: String
   - "X ditë më parë", etc.

#### Instance Methods

1. **validateValue(newValue)**: Object
   - Returns {valid: Boolean, error?: String}
   - Validates type, pattern, min/max, allowed values, required

2. **updateValue(newValue, modifiedBy)**: Promise<SystemConfiguration>
   - Validates then updates value
   - Updates lastModifiedBy and lastModifiedAt

3. **resetToDefault(modifiedBy)**: Promise<SystemConfiguration>
   - Resets to defaultValue

#### Static Methods

1. **getByCategory(category)**: Query
   - Returns all active settings in category
   - Populates lastModifiedBy

2. **getAllSettings()**: Query
   - Returns all active settings organized by category

3. **getPublicSettings()**: Query
   - Returns only isPublic=true settings (for frontend)

4. **getSetting(key)**: Promise<SystemConfiguration>
   - Gets single setting by key

5. **getSettingValue(key, defaultValue)**: Promise<Mixed>
   - Gets just the value, returns defaultValue if not found

6. **createDefaultSettings(adminUserId)**: Promise<SystemConfiguration[]>
   - Seeds database with default configurations
   - **Default Settings Created:**
     - Platform: site_name, site_description, contact_email, maintenance_mode
     - Users: require_email_verification, auto_approve_employers, max_cv_file_size
     - Content: require_job_approval, job_post_limit_free, job_expiry_days
     - Email: sender_name, enable_email_notifications
     - System: api_rate_limit, cache_ttl_minutes

#### Middleware Hooks

**Pre-save:**
- Validates value before saving using validateValue()

---

### 3.12 CONFIGURATION AUDIT MODEL
**File:** `backend/src/models/ConfigurationAudit.js`
**Collection:** `configurationaudits`

#### Schema Definition

```javascript
{
  // References
  configurationId: ObjectId -> SystemConfiguration (required, indexed)
  configurationKey: String (required, indexed)

  // Action
  action: Enum ['created', 'updated', 'deleted', 'reset_to_default'] (required, indexed)

  // Change Tracking
  oldValue: Mixed
  newValue: Mixed (required)

  // Audit Info
  changedBy: ObjectId -> User (required, indexed)
  changedAt: Date (default: now, indexed)
  reason: String (max 500 chars)
  category: Enum ['platform', 'users', 'content', 'email', 'system', 'features'] (required, indexed)

  // Context
  ipAddress: String
  userAgent: String

  // Timestamps
  createdAt: Date (auto)
  updatedAt: Date (auto)
}
```

#### Indexes
- `configurationId, changedAt`: -1
- `configurationKey, changedAt`: -1
- `changedBy, changedAt`: -1
- `changedAt`: -1
- `category, changedAt`: -1
- `action`: 1

#### Virtual Fields

1. **timeSinceChange**: String
   - Time since change

2. **changeDescription**: String
   - Albanian text: "Krijuar", "Përditësuar", "Fshirë", "Rikthyer në vlerën e paracaktuar"

3. **formattedChange**: String
   - Full description with old/new values
   - E.g., "Ndryshuar nga 'false' në 'true'"

#### Static Methods

1. **logChange(configurationId, configurationKey, action, oldValue, newValue, changedBy, category, options)**: Promise<ConfigurationAudit>
   - Creates audit entry
   - Options: reason, ipAddress, userAgent

2. **getConfigurationHistory(configurationId, options)**: Query
   - Gets change history for specific configuration
   - Options: page, limit

3. **getCategoryHistory(category, options)**: Query
   - Gets changes by category
   - Options: page, limit, action filter

4. **getRecentHistory(options)**: Query
   - Gets recent changes across all configurations
   - Options: page, limit, days (default 7)

5. **getAuditStats(days)**: Promise<Array>
   - Aggregate statistics by action type
   - Default: 30 days

6. **cleanupOldEntries(daysToKeep)**: Promise<DeleteResult>
   - Removes audit entries older than specified days
   - Default: 365 days

---

### 3.13 LOCATION MODEL
**File:** `backend/src/models/Location.js`
**Collection:** `locations`

#### Schema Definition

```javascript
{
  // Location Data
  city: String (required, unique, max 50 chars)
  region: String (required, max 50 chars)
  country: String (required, default: 'Albania')

  // Coordinates (for future mapping features)
  coordinates: {
    lat: Number (default: 0)
    lng: Number (default: 0)
  }

  // Statistics
  jobCount: Number (default: 0)
  userCount: Number (default: 0)

  // Administrative
  isActive: Boolean (default: true, indexed)
  displayOrder: Number (default: 0, indexed)

  // Timestamps
  createdAt: Date (auto)
  updatedAt: Date (auto)
}
```

#### Indexes
- `isActive`: 1
- `displayOrder`: 1

#### Static Methods

1. **getActiveLocations()**: Query
   - Returns active locations
   - Sorted by displayOrder, then city

2. **getPopularLocations(limit)**: Query
   - Returns locations sorted by jobCount
   - Default limit: 10

---

### 3.14 QUICK USER MODEL
**File:** `backend/src/models/QuickUser.js`
**Collection:** `quickusers`

**Purpose:** Lightweight user registration for job alerts without full account creation.

#### Schema Definition

```javascript
{
  // Basic Info
  firstName: String (required, max 50 chars)
  lastName: String (required, max 50 chars)
  email: String (required, unique, validated, indexed)
  phone: String (validated format)
  location: String (required, max 50 chars, indexed)

  // Interests
  interests: [Enum] // Same as Job categories (indexed)
  customInterests: [String] (max 50 chars each) // For "Tjetër" category

  // Status
  isActive: Boolean (default: true, indexed)
  unsubscribeToken: String (required, unique, auto-generated, 64-char hex)

  // Notification Tracking
  lastNotifiedAt: Date (indexed)
  notificationCount: Number (default: 0)
  totalEmailsSent: Number (default: 0)
  emailClickCount: Number (default: 0)

  // Source
  source: Enum ['quick_signup', 'landing_page', 'referral'] (default: 'quick_signup')

  // Preferences
  preferences: {
    emailFrequency: Enum ['immediate', 'daily', 'weekly'] (default: 'immediate', indexed)
    smsNotifications: Boolean (default: false)
    jobTypes: [Enum] // full-time, part-time, contract, internship
    salaryRange: {
      min: Number (>=0)
      max: Number (>=0)
      currency: Enum ['EUR', 'ALL'] (default: 'EUR')
    }
    remoteWork: Boolean (default: false)
  }

  // Conversion Tracking
  convertedToFullUser: Boolean (default: false, indexed)
  convertedAt: Date
  fullUserId: ObjectId -> User

  // Analytics
  lastLoginAt: Date
  ipAddress: String
  userAgent: String

  // Timestamps
  createdAt: Date (auto)
  updatedAt: Date (auto)
}
```

#### Indexes
- `interests`: 1
- `location`: 1
- `isActive`: 1
- `lastNotifiedAt`: 1
- `preferences.emailFrequency`: 1
- `convertedToFullUser`: 1
- **Compound**: `location, interests, isActive`: 1
- **Compound**: `isActive, lastNotifiedAt`: 1

#### Virtual Fields

1. **fullName**: String
   - Returns "firstName lastName"

2. **allInterests**: Array
   - Combines interests and customInterests

3. **canReceiveNotification**: Boolean
   - Checks if user is eligible based on frequency preference
   - immediate: 1 hour since last notification
   - daily: 24 hours since last notification
   - weekly: 7 days since last notification

#### Instance Methods

1. **matchesJob(job)**: Boolean
   - Checks if job matches user's criteria
   - Checks: location, interests, jobType, salary range

2. **recordNotificationSent(jobId)**: Promise<QuickUser>
   - Updates lastNotifiedAt, increments counters

3. **recordEmailClick()**: Promise<QuickUser>
   - Increments emailClickCount
   - Updates lastLoginAt

4. **unsubscribe()**: Promise<QuickUser>
   - Sets isActive=false

5. **convertToFullUser(fullUserId)**: Promise<QuickUser>
   - Marks as converted
   - Deactivates quick user notifications
   - Links to full User account

6. **getUnsubscribeUrl(baseUrl)**: String
   - Returns unsubscribe URL with token

#### Static Methods

1. **findEligibleForNotifications(job)**: Query
   - Finds users who can receive notifications based on frequency
   - Active and not converted users only

2. **findMatchesForJob(job)**: Query
   - Complex query matching location, interests, jobType
   - Respects notification frequency
   - Limit: 1000 users

3. **getAnalytics(startDate, endDate)**: Promise<Object>
   - Aggregate statistics: total users, active, converted, notifications sent, clicks
   - Averages: notifications per user, clicks per user

#### Middleware Hooks

**Pre-save:**
- Ensures unsubscribeToken is generated if missing

---

### 3.15 REVENUE ANALYTICS MODEL
**File:** `backend/src/models/RevenueAnalytics.js`
**Collection:** `revenueanalytics`

**Purpose:** Daily aggregated business intelligence and revenue tracking.

#### Schema Definition

```javascript
{
  // Date Identity
  date: Date (required, unique) // One record per day
  dateString: String (required, unique, indexed) // Format: YYYY-MM-DD

  // Core Metrics
  metrics: {
    totalRevenue: Number (default: 0)
    jobsPosted: Number (default: 0)
    newEmployers: Number (default: 0)
    returningEmployers: Number (default: 0)
    averageJobPrice: Number (default: 0)
    conversionRate: Number (default: 0) // Percentage
    revenuePerEmployer: Number (default: 0)

    // Revenue Breakdown
    featuredJobRevenue: Number (default: 0)
    regularJobRevenue: Number (default: 0)
    campaignRevenue: Number (default: 0)
    pricingRuleRevenue: Number (default: 0)
  }

  // Top Industries
  topIndustries: [{
    name: String (required)
    revenue: Number (required)
    jobCount: Number (required)
    averagePrice: Number (required)
    growthRate: Number (default: 0) // vs previous period
  }]

  // Top Locations
  topLocations: [{
    city: String (required)
    region: String (required)
    revenue: Number (required)
    jobCount: Number (required)
    averagePrice: Number (required)
    demandScore: Number (default: 0) // 1-100
  }]

  // Campaign Performance
  campaigns: [{
    campaignId: ObjectId -> BusinessCampaign (required)
    name: String (required)
    revenue: Number (required)
    conversions: Number (required)
    cost: Number (required)
    roi: Number (required)
  }]

  // Pricing Rule Performance
  pricingRules: [{
    ruleId: ObjectId -> PricingRule (required)
    name: String (required)
    revenue: Number (required)
    jobsAffected: Number (required)
    averageImpact: Number (required)
  }]

  // User Engagement
  userEngagement: {
    totalVisitors: Number (default: 0)
    newRegistrations: Number (default: 0)
    activeUsers: Number (default: 0)
    jobViews: Number (default: 0)
    jobApplications: Number (default: 0)
    employerLogins: Number (default: 0)
    averageSessionDuration: Number (default: 0) // In minutes
  }

  // Competitor Analysis
  competitorAnalysis: {
    marketShare: Number (default: 0) // Estimated percentage
    averageCompetitorPrice: Number (default: 0)
    pricingAdvantage: Number (default: 0) // Percentage difference
    featureAdvantage: Number (default: 0) // Score 1-100
  }

  // Generation Timestamps
  generatedAt: Date (default: now, indexed)
  lastUpdated: Date (default: now)

  // Auto Timestamps
  createdAt: Date (auto)
  updatedAt: Date (auto)
}
```

#### Indexes
- `date`: -1
- `metrics.totalRevenue`: -1
- `generatedAt`: -1

#### Virtual Fields

1. **growthRate**: Number
   - Would be calculated against previous day (placeholder returns 0)

2. **profitMargin**: Number
   - ((revenue - campaign costs) / revenue) * 100

#### Instance Methods

1. **updateMetrics(newData)**: Promise<RevenueAnalytics>
   - Updates metrics object
   - Sets lastUpdated

2. **addCampaignData(campaignData)**: Promise<RevenueAnalytics>
   - Updates or adds campaign performance data

3. **addPricingRuleData(ruleData)**: Promise<RevenueAnalytics>
   - Updates or adds pricing rule performance data

#### Static Methods

1. **getOrCreateDaily(date)**: Promise<RevenueAnalytics>
   - Gets or creates analytics record for specific date

2. **getRevenueTrends(options)**: Query
   - Returns time series data
   - Options: days (default 30), endDate
   - Returns lean documents with selected fields

3. **getDashboardSummary(options)**: Promise<Object>
   - Aggregates data for dashboard
   - Options: period ('today', 'week', 'month')
   - Returns summary + top industries

4. **calculateBusinessIntelligence(options)**: Promise<Object>
   - Compares current vs previous period
   - Calculates growth rates
   - Provides insights and trends
   - Options: days (default 30)

---

### 3.16 SYSTEM HEALTH MODEL
**File:** `backend/src/models/SystemHealth.js`
**Collection:** `systemhealths`

**Purpose:** System monitoring and health check tracking.

#### Schema Definition

```javascript
{
  // Timestamp (with TTL - auto-deletes after 30 days)
  timestamp: Date (default: now, expires: 2592000 seconds)

  // Health Metrics
  metrics: {
    // Database Health
    database: {
      status: Enum ['healthy', 'warning', 'error'] (default: 'healthy')
      connectionCount: Number (default: 0)
      responseTime: Number (milliseconds, default: 0)
      lastError: String
      lastChecked: Date (default: now)
    }

    // Email Service Health
    email: {
      status: Enum ['healthy', 'warning', 'error'] (default: 'healthy')
      deliveryRate: Number (percentage, default: 100)
      lastDelivery: Date
      lastError: String
      emailsSentToday: Number (default: 0)
      lastChecked: Date (default: now)
    }

    // API Health
    api: {
      responseTime: Number (milliseconds, default: 0)
      errorRate: Number (percentage, default: 0)
      requestCount: Number (default: 0)
      activeConnections: Number (default: 0)
      lastChecked: Date (default: now)
    }

    // Storage Health
    storage: {
      usedSpace: Number (bytes, default: 0)
      totalSpace: Number (bytes, default: 0)
      uploadCount: Number (default: 0)
      status: Enum ['healthy', 'warning', 'error'] (default: 'healthy')
      lastChecked: Date (default: now)
    }

    // Memory Health
    memory: {
      used: Number (bytes, default: 0)
      total: Number (bytes, default: 0)
      percentage: Number (default: 0)
      status: Enum ['healthy', 'warning', 'error'] (default: 'healthy')
    }

    // CPU Health
    cpu: {
      usage: Number (percentage, default: 0)
      loadAverage: Number (default: 0)
      status: Enum ['healthy', 'warning', 'error'] (default: 'healthy')
    }
  }

  // Overall Status
  overallStatus: Enum ['healthy', 'warning', 'error'] (default: 'healthy', indexed)

  // Alerts
  alerts: [{
    type: Enum ['database', 'email', 'api', 'storage', 'memory', 'cpu', 'system']
    level: Enum ['info', 'warning', 'error', 'critical']
    message: String
    timestamp: Date (default: now)
    resolved: Boolean (default: false)
  }]

  // Auto Timestamps
  createdAt: Date (auto)
  updatedAt: Date (auto)
}
```

#### Indexes
- `timestamp`: -1
- `overallStatus`: 1
- `alerts.level, alerts.resolved`: 1

**Note:** Documents automatically expire 30 days after timestamp via TTL index.

#### Virtual Fields

1. **formattedTimestamp**: String
   - Returns timestamp in Albanian locale format

2. **storageUsagePercentage**: Number
   - (usedSpace / totalSpace) * 100

3. **formattedStorage**: Object
   - Returns {used: String, total: String, percentage: Number}
   - Formats bytes as "X KB/MB/GB"

4. **activeAlertsCount**: Number
   - Count of unresolved alerts

#### Instance Methods

1. **calculateOverallStatus()**: String
   - Aggregates individual metric statuses
   - Returns 'error' if any error, 'warning' if any warning, else 'healthy'

2. **addAlert(type, level, message)**: Promise<SystemHealth>
   - Adds alert to array
   - Keeps only last 50 alerts

3. **resolveAlert(alertId)**: Promise<SystemHealth>
   - Marks specific alert as resolved

#### Static Methods

1. **createHealthCheck()**: Promise<SystemHealth>
   - Performs comprehensive health check
   - **Checks:**
     - Database ping and response time
     - Memory usage (heap used/total)
     - CPU load average
     - Sets thresholds: >1000ms db = warning, >90% memory = error, etc.
   - Calculates overallStatus
   - Saves new health record

2. **getLatestHealth()**: Promise<SystemHealth>
   - Returns most recent health check

3. **getHealthHistory(hours)**: Query
   - Returns health checks from last X hours (default: 24)
   - Limit: 100 records

4. **getHealthStats(days)**: Promise<Array>
   - Aggregates statistics by overallStatus
   - Average database response time, memory usage, CPU usage
   - Default: 7 days

5. **cleanupOldRecords(daysToKeep)**: Promise<DeleteResult>
   - Removes records older than specified days
   - Default: 30 days (redundant with TTL, but available)

---

## 4. BACKEND API ROUTES - COMPLETE ENUMERATION

### 4.1 ROUTING OVERVIEW

**Base API URL:** `http://localhost:3001/api`

**Authentication:** JWT tokens in Authorization header: `Bearer <token>`

**Route Files:**
1. `/api/auth` - Authentication routes
2. `/api/users` - User management
3. `/api/jobs` - Job listings
4. `/api/applications` - Job applications
5. `/api/notifications` - User notifications
6. `/api/companies` - Company profiles
7. `/api/locations` - Location data
8. `/api/admin` - Admin operations
9. `/api/reports` - User reporting
10. `/api/stats` - Statistics/analytics
11. `/api/matching` - Candidate matching
12. `/api/bulk-notifications` - Mass notifications
13. `/api/business-control` - Pricing/campaigns
14. `/api/configuration` - System config
15. `/api/quickusers` - Quick signup
16. `/api/verification` - Email verification
17. `/api/send-verification` - Resend verification

**Note:** Due to the extensive nature of 17 route files with 100+ endpoints, I will document the most critical routes in detail. The complete enumeration would require reading each route file individually.

### 4.2 AUTHENTICATION ROUTES
**File:** `backend/src/routes/auth.js`
**Base Path:** `/api/auth`

#### POST /api/auth/register
- **Purpose:** Register new user account
- **Authentication:** None required
- **Request Body:**
  ```json
  {
    "email": "user@example.com",
    "password": "password123",
    "userType": "jobseeker" | "employer",
    "profile": {
      "firstName": "string",
      "lastName": "string",
      "phone": "+355xxxxxxxx",
      "location": {
        "city": "string",
        "region": "string"
      },
      // Additional fields based on userType
    }
  }
  ```
- **Success Response:** 201 Created
  ```json
  {
    "success": true,
    "data": {
      "user": {...},
      "token": "jwt_token_here"
    }
  }
  ```
- **Validation:**
  - Email format validation
  - Password min 6 characters
  - Required profile fields
- **Side Effects:**
  - Sends verification email
  - Employers default to 'pending_verification' status

#### POST /api/auth/login
- **Purpose:** Authenticate user and get JWT token
- **Authentication:** None required
- **Request Body:**
  ```json
  {
    "email": "user@example.com",
    "password": "password123"
  }
  ```
- **Success Response:** 200 OK
  ```json
  {
    "success": true,
    "data": {
      "user": {...},
      "token": "jwt_token_here"
    }
  }
  ```
- **Error Cases:**
  - 401: Invalid credentials
  - 403: Account suspended/banned
  - 403: Email not verified (employers)
- **Side Effects:**
  - Updates lastLoginAt timestamp
  - Checks and auto-lifts expired suspensions

#### POST /api/auth/forgot-password
- **Purpose:** Request password reset
- **Authentication:** None required
- **Request Body:**
  ```json
  {
    "email": "user@example.com"
  }
  ```
- **Success Response:** 200 OK
- **Side Effects:**
  - Generates passwordResetToken
  - Sends reset email with token
  - Token expires after set time

#### POST /api/auth/reset-password
- **Purpose:** Reset password with token
- **Authentication:** None required
- **Request Body:**
  ```json
  {
    "token": "reset_token_from_email",
    "newPassword": "newpassword123"
  }
  ```
- **Success Response:** 200 OK
- **Validation:**
  - Token must be valid and not expired
  - New password min 6 characters

---

### 4.3 USER ROUTES (Sample - Key Endpoints)
**File:** `backend/src/routes/users.js`
**Base Path:** `/api/users`

#### GET /api/users/profile
- **Purpose:** Get current user's profile
- **Authentication:** Required
- **Response:** Full user object (password excluded)

#### PUT /api/users/profile
- **Purpose:** Update user profile
- **Authentication:** Required
- **Request Body:** Partial user profile updates
- **Validation:** Type-specific field validation

#### POST /api/users/save-job/:jobId
- **Purpose:** Save job to user's saved jobs list
- **Authentication:** Required (jobseeker only)
- **Response:** Updated user object

#### DELETE /api/users/save-job/:jobId
- **Purpose:** Remove job from saved jobs
- **Authentication:** Required (jobseeker only)

---

### 4.4 JOB ROUTES (Sample - Key Endpoints)
**File:** `backend/src/routes/jobs.js`
**Base Path:** `/api/jobs`

This is one of the most complex route files. Based on the recent fixes documented:

#### GET /api/jobs
- **Purpose:** Search and filter jobs
- **Authentication:** Optional (shows more for authenticated users)
- **Query Parameters:**
  - `search`: Text search (title, description, tags)
  - `city`: Comma-separated city names (OR logic with $in)
  - `jobType`: Comma-separated job types (OR logic with $in)
  - `category`: Single category filter
  - `company`: Employer ID for company-specific listings
  - `diaspora`: 'true' for diaspora jobs filter
  - `ngaShtepia`: 'true' for remote work filter
  - `partTime`: 'true' for part-time filter
  - `administrata`: 'true' for government jobs filter
  - `sezonale`: 'true' for seasonal jobs filter
  - `minSalary`: Minimum salary filter
  - `maxSalary`: Maximum salary filter
  - `page`: Page number (default: 1)
  - `limit`: Results per page (default: 10)
  - `sort`: Sort field (default: tier/postedAt)

- **Response:**
  ```json
  {
    "success": true,
    "data": {
      "jobs": [...],
      "totalJobs": 123,
      "currentPage": 1,
      "totalPages": 13
    }
  }
  ```

- **Business Logic:**
  - Premium jobs shown first (tier:-1)
  - Then sorted by postedAt descending
  - Population of employer profile data
  - Multiple cities/jobTypes use MongoDB $in operator (OR logic)
  - Platform category filters use exact boolean matching

#### GET /api/jobs/:id
- **Purpose:** Get single job details
- **Authentication:** Optional
- **Response:** Full job object with employer details
- **Side Effects:**
  - Increments viewCount if not job owner
  - Adds to user's recently viewed (if authenticated)

#### POST /api/jobs
- **Purpose:** Create new job posting
- **Authentication:** Required (employer only)
- **Request Body:** Full job object
- **Validation:**
  - Required fields: title, description, category, jobType, location.city
  - Platform categories must be boolean
  - Salary validation if provided
- **Business Logic:**
  - Calculates pricing based on PricingRules
  - Applies active BusinessCampaigns if eligible
  - Generates unique slug
  - Sets expiresAt to +30 days
  - Checks user's freePostingEnabled privilege
- **Response:** Created job object with pricing breakdown

#### PUT /api/jobs/:id
- **Purpose:** Update existing job
- **Authentication:** Required (owner or admin)
- **Request Body:** Partial job updates
- **Validation:** Same as POST

#### DELETE /api/jobs/:id
- **Purpose:** Soft delete job
- **Authentication:** Required (owner or admin)
- **Side Effects:**
  - Sets isDeleted=true, status='closed'

---

## 5. FRONTEND APPLICATION STRUCTURE

### 5.1 ROUTING STRUCTURE

**Router:** React Router v6 (BrowserRouter)

**All Routes Defined in:** `frontend/src/App.tsx`

```typescript
<Routes>
  <Route path="/" element={<Index />} />
  <Route path="/jobs" element={<Index />} /> {/* Redirect to main */}
  <Route path="/jobs/:id" element={<JobDetail />} />
  <Route path="/login" element={<Login />} />
  <Route path="/register" element={<Login />} />
  <Route path="/about" element={<AboutUs />} />
  <Route path="/employers" element={<EmployersPage />} />
  <Route path="/jobseekers" element={<JobSeekersPage />} />
  <Route path="/companies" element={<CompaniesPageSimple />} />
  <Route path="/company/:id" element={<CompanyProfile />} />
  <Route path="/employer-register" element={<EmployerRegister />} />
  <Route path="/employer-dashboard" element={<EmployerDashboard />} />
  <Route path="/admin" element={<AdminDashboard />} />
  <Route path="/admin/reports" element={<AdminReports />} />
  <Route path="/report-user" element={<ReportUser />} />
  <Route path="/profile" element={<Profile />} />
  <Route path="/saved-jobs" element={<SavedJobs />} />
  <Route path="/post-job" element={<PostJob />} />
  <Route path="/edit-job/:id" element={<EditJob />} />
  <Route path="*" element={<NotFound />} />
</Routes>
```

**Route Access Control:**
- Public: /, /about, /employers, /jobseekers, /companies, /company/:id, /login, /register
- Job Seekers: /profile, /saved-jobs, /jobs/:id (can apply)
- Employers: /employer-dashboard, /post-job, /edit-job/:id
- Admins: /admin, /admin/reports
- Mixed: Some routes accessible to multiple types with different UI

### 5.2 NAVIGATION COMPONENT

**File:** `frontend/src/components/Navigation.tsx`

#### UI Elements

**Desktop Navigation (visible on md:screens and up):**
1. **Logo** (left-aligned)
   - Image: punLogo.jpeg
   - Click: Navigates to "/"
   - Size: 48×48px

2. **Main Navigation Links**
   - "Rreth Nesh" → `/about`
   - "Punëdhenes" → `/employers`
   - "Punëkërkues" → `/jobseekers`
   - "Kompanite" → `/companies`
   - Visual: Active page highlighted in primary color

3. **"Publiko Njoftimin" Button** (primary button)
   - Icon: Building
   - Action: Navigates to `/post-job`
   - Visible: Always

**Right Side (Authenticated Users):**
4. **Notifications Bell** (DropdownMenu)
   - Icon: Bell
   - Badge: Shows unread count (red badge with number or "9+" if >9)
   - Action: Opens dropdown with notifications
   - **Dropdown Contents:**
     - Header: "Njoftimet" + "Shëno të gjitha si të lexuara" button
     - List: Up to 10 recent notifications
       - Each shows: title, message (line-clamp-2), timeAgo
       - Unread: Blue background + blue dot indicator
       - Click: Marks as read
     - Loading state: "Duke ngarkuar njoftimet..."
     - Empty state: "Nuk keni njoftime të reja"
     - Footer: "Shiko të gjitha njoftimet" (currently no-op)

5. **User Avatar Dropdown** (DropdownMenu)
   - Shows: Initials in circular avatar
   - **Dropdown Contents:**
     - Label: User's full name + email
     - **Links (vary by userType):**
       - Job Seekers:
         - "Profili Im" → `/profile`
         - "Punët e Ruajtura" (Bookmark icon) → `/saved-jobs`
         - "Cilësimet" (Settings icon) → `/profile`
       - Employers:
         - "Dashboard" → `/employer-dashboard`
       - Admins:
         - "Paneli Admin" (Shield icon) → `/admin`
     - "Dil" (Logout) - Red text

6. **Employer Dashboard Button** (employers only)
   - Text: "Dashboard"
   - Icon: Building
   - Action: Navigate to `/employer-dashboard`

**Right Side (Unauthenticated Users):**
7. **"Hyrje" Button** (outline variant)
   - Icon: User
   - Action: Navigate to `/login`

8. **"Posto Punë" Button** (primary variant)
   - Icon: Building
   - Action: Navigate to `/employer-register`

**Mobile Navigation:**
9. **Mobile Menu Toggle** (visible on <md screens)
   - Icon: Menu (hamburger) or X (close)
   - Action: Toggles mobile menu visibility

10. **Mobile Menu Dropdown** (shown when toggled)
    - Same links as desktop main navigation
    - Stacked vertically
    - "Publiko Njoftimin" button at bottom
    - Click any link: Closes mobile menu

#### State Management
- `notifications`: Array of Notification objects
- `unreadCount`: Number (badge display)
- `notificationsOpen`: Boolean (dropdown state)
- `loadingNotifications`: Boolean
- `mobileMenuOpen`: Boolean

#### API Calls
1. **loadUnreadCount()**: GET `/api/notifications/unread-count`
   - Runs on mount if authenticated
   - Updates unreadCount state

2. **loadNotifications()**: GET `/api/notifications?limit=10`
   - Runs when notifications dropdown opens
   - Updates notifications array

3. **handleMarkAsRead(id)**: POST `/api/notifications/:id/read`
   - Marks single notification as read
   - Updates local state optimistically

4. **handleMarkAllAsRead()**: POST `/api/notifications/mark-all-read`
   - Marks all user's notifications as read
   - Shows toast with count

5. **logout()**: Calls AuthContext.logout()
   - Clears auth token
   - Navigates to "/"

#### Conditional Rendering
- Notifications bell: Only if `isAuthenticated && user`
- User dropdown: Only if `isAuthenticated && user`
- Employer dashboard button: Only if `user.userType === 'employer'`
- Login/Register buttons: Only if NOT authenticated
- Mobile menu: Only on screens <md

---

This documentation represents the first comprehensive section covering the database schema completely and providing a foundation for the remaining sections. The document will continue with detailed frontend pages, user flows, business logic, and verification sections.

**STATUS:** This is a work-in-progress forensic documentation. Sections 6-12 require continued analysis of remaining route files, page components, and business logic systems.

