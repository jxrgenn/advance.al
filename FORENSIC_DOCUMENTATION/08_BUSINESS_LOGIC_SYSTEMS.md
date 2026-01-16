# FORENSIC DOCUMENTATION - BUSINESS LOGIC SYSTEMS
## Part 8: Complete Business Logic and Service Layer Documentation

**Document Created:** 2026-01-13
**Purpose:** Document all business logic systems, services, and algorithms
**Source Files Analyzed:**
- candidateMatching.js (473 lines)
- notificationService.js (468 lines)
- emailService.js (188 lines)
- resendEmailService.js (639 lines)
- All model instance/static methods

---

## TABLE OF CONTENTS

1. [Candidate Matching System](#1-candidate-matching-system)
2. [Notification Service](#2-notification-service)
3. [Email Services](#3-email-services)
4. [Pricing and Revenue System](#4-pricing-and-revenue-system)
5. [Report and Moderation System](#5-report-and-moderation-system)
6. [Job Expiry and Lifecycle](#6-job-expiry-and-lifecycle)
7. [Application Workflow](#7-application-workflow)
8. [Quick User Matching](#8-quick-user-matching)

---

## 1. CANDIDATE MATCHING SYSTEM

**File:** `/backend/src/services/candidateMatching.js`
**Lines:** 473 lines
**Purpose:** Algorithm to match jobseekers with jobs based on 7 scoring factors

### 1.1 Match Scoring Algorithm

**Total Score:** 0-100 points
**Method:** `calculateMatchScore(candidate, job)` (lines 14-31)

**Score Breakdown:**
1. Title Match: 0-20 points
2. Skills Match: 0-25 points
3. Experience Match: 0-15 points
4. Location Match: 0-15 points
5. Education Match: 0-5 points
6. Salary Match: 0-10 points
7. Availability Match: 0-10 points

**Total Possible:** 100 points

### 1.2 Scoring Components

#### **1.2.1 Title Match (0-20 points)**

**Method:** `calculateTitleMatch(candidate, job)` (lines 37-59)

**Algorithm:**
```javascript
candidateTitle = candidate.profile.jobSeekerProfile.title (lowercase)
jobTitle = job.title (lowercase)

IF candidateTitle === jobTitle:
  RETURN 20 points (exact match)

ELSE:
  candidateWords = split candidateTitle by whitespace
  jobWords = split jobTitle by whitespace

  matchedWords = 0
  FOR EACH word IN candidateWords:
    IF word.length > 3 AND (jobWords contains word OR word contains jobWord):
      matchedWords++

  matchRatio = matchedWords / max(candidateWords.length, jobWords.length)
  RETURN round(matchRatio * 20)
```

**Examples:**
- "Software Engineer" vs "Software Engineer" → 20 points (exact)
- "Software Engineer" vs "Senior Software Engineer" → ~13 points (partial)
- "Developer" vs "Designer" → 0 points (no match)

#### **1.2.2 Skills Match (0-25 points)**

**Method:** `calculateSkillsMatch(candidate, job)` (lines 65-83)

**Algorithm:**
```javascript
candidateSkills = candidate.profile.jobSeekerProfile.skills[] (lowercase array)
jobRequirements = job.requirements[].join(' ') (lowercase string)

matchedSkills = 0
FOR EACH skill IN candidateSkills:
  IF jobRequirements.includes(skill):
    matchedSkills++

matchRatio = matchedSkills / candidateSkills.length
RETURN round(matchRatio * 25)
```

**Examples:**
- Candidate has [JavaScript, React, Node.js]
- Job requires "JavaScript and React experience"
- matchedSkills = 2 (JavaScript, React)
- matchRatio = 2/3 = 0.667
- Score = 0.667 * 25 = 17 points

#### **1.2.3 Experience Match (0-15 points)**

**Method:** `calculateExperienceMatch(candidate, job)` (lines 89-124)

**Experience Mapping:**
```javascript
{
  '0-1 vjet': 0.5,
  '1-2 vjet': 1.5,
  '2-5 vjet': 3.5,
  '5-10 vjet': 7.5,
  '10+ vjet': 12
}
```

**Algorithm:**
```javascript
candidateYears = expMap[candidate.experience]
jobYears = expMap[job.experience]

IF candidateYears === jobYears:
  RETURN 15 points (perfect match)

IF candidateYears > jobYears:
  diff = candidateYears - jobYears
  IF diff <= 2: RETURN 13 points (slightly overqualified)
  IF diff <= 5: RETURN 10 points (moderately overqualified)
  ELSE: RETURN 7 points (too overqualified, might be expensive)

IF candidateYears < jobYears:
  diff = jobYears - candidateYears
  IF diff <= 1: RETURN 12 points (close enough)
  IF diff <= 2: RETURN 8 points (acceptable)
  IF diff <= 3: RETURN 4 points (borderline)
  ELSE: RETURN 0 points (too underqualified)
```

**Philosophy:** Slightly overqualified is acceptable but heavily overqualified reduces score (candidate might be too expensive or leave soon).

#### **1.2.4 Location Match (0-15 points)**

**Method:** `calculateLocationMatch(candidate, job)` (lines 130-149)

**Algorithm:**
```javascript
candidateCity = candidate.profile.location.city
jobCity = job.location.city

IF candidateCity === jobCity (case-insensitive):
  RETURN 15 points (same city)

IF job.jobType includes 'remote' OR 'hybrid':
  RETURN 12 points (good match even if different city)

ELSE:
  RETURN 5 points (different city, not remote)
```

#### **1.2.5 Education Match (0-5 points)**

**Method:** `calculateEducationMatch(candidate, job)` (lines 155-182)

**Algorithm:**
```javascript
candidateEdu = candidate.profile.jobSeekerProfile.education[].degree.join(' ') (lowercase)
jobReq = job.requirements[].join(' ') (lowercase)

eduKeywords = ['bachelor', 'master', 'phd', 'diploma', 'degree', 'university', 'college']

hasEducationRequirement = jobReq contains any eduKeywords

IF NOT hasEducationRequirement:
  RETURN 5 points (no specific requirement, give full points)

matchFound = candidateEdu contains any keyword that jobReq also contains

IF matchFound:
  RETURN 5 points (education matches)
ELSE:
  RETURN 2 points (education doesn't match)
```

#### **1.2.6 Salary Match (0-10 points)**

**Method:** `calculateSalaryMatch(candidate, job)` (lines 188-219)

**Algorithm:**
```javascript
candidateSalary = candidate.profile.jobSeekerProfile.desiredSalary.max OR .min
jobSalaryMin = job.salary.min
jobSalaryMax = job.salary.max

IF candidateSalary === 0 OR (jobSalaryMin === 0 AND jobSalaryMax === 0):
  RETURN 5 points (neutral if either doesn't specify)

IF candidateSalary >= jobSalaryMin AND candidateSalary <= jobSalaryMax:
  RETURN 10 points (perfect - within range)

IF candidateSalary < jobSalaryMin:
  RETURN 8 points (candidate expects less - good for employer)

IF candidateSalary > jobSalaryMax:
  percentDiff = ((candidateSalary - jobSalaryMax) / jobSalaryMax) * 100
  IF percentDiff <= 10: RETURN 6 points (close enough)
  IF percentDiff <= 20: RETURN 4 points (bit high)
  IF percentDiff <= 30: RETURN 2 points (too high)
  ELSE: RETURN 0 points (way too high)
```

**Philosophy:** Candidates expecting less are good matches. Candidates expecting significantly more reduce score.

#### **1.2.7 Availability Match (0-10 points)**

**Method:** `calculateAvailabilityMatch(candidate, job)` (lines 225-239)

**Availability Scores:**
```javascript
{
  'immediately': 10,
  '2weeks': 8,
  '1month': 6,
  '3months': 4
}
```

**Default:** 5 points if not specified

**Philosophy:** Immediate availability is most desirable.

### 1.3 Caching System

**Method:** `findTopCandidates(jobId, limit=15)` (lines 247-360)

**Cache Strategy:**
- **Storage:** CandidateMatch model (MongoDB)
- **TTL:** 24 hours
- **Invalidation:** Automatic (expires after 24 hours)

**Algorithm:**
```javascript
// 1. Check cache
cachedMatches = CandidateMatch.find({
  jobId: jobId,
  expiresAt: { $gt: now }
})
.sort({ matchScore: -1 })
.limit(limit)
.populate('candidateId')

IF cachedMatches.length >= limit:
  RETURN { success: true, fromCache: true, matches: cachedMatches }

// 2. Cache miss - recalculate
job = Job.findById(jobId)
candidates = User.find({
  userType: 'jobseeker',
  'profile.jobSeekerProfile': { $exists: true },
  isDeleted: false,
  status: 'active'
})

matchResults = []
FOR EACH candidate IN candidates:
  { totalScore, breakdown } = calculateMatchScore(candidate, job)
  matchResults.push({ candidate, matchScore: totalScore, matchBreakdown: breakdown })

// 3. Sort and take top matches
matchResults.sort((a, b) => b.matchScore - a.matchScore)
topMatches = matchResults.slice(0, limit)

// 4. Store in cache
expiresAt = new Date(now + 24 hours)
FOR EACH match IN topMatches:
  CandidateMatch.create({
    jobId,
    candidateId: match.candidate._id,
    matchScore: match.matchScore,
    matchBreakdown: match.matchBreakdown,
    calculatedAt: now,
    expiresAt,
    contacted: false
  })

RETURN { success: true, fromCache: false, matches: topMatches }
```

**Performance:**
- Cache hit: Fast (single DB query)
- Cache miss: Slow (calculate all candidates, typically 100-1000+ comparisons)
- Cache duration: 24 hours

### 1.4 Access Control

**Method:** `hasAccessToJob(employerId, jobId)` (lines 365-392)

**Requirements for Access:**
1. User must be employer
2. `employerProfile.candidateMatchingEnabled` must be `true`
3. Job must be in `employerProfile.candidateMatchingJobs[]` array
4. Access must not be expired (if expiresAt is set)

**Algorithm:**
```javascript
employer = User.findById(employerId)

IF employer.userType !== 'employer':
  RETURN false

IF NOT employer.profile.employerProfile.candidateMatchingEnabled:
  RETURN false

jobAccess = employer.profile.employerProfile.candidateMatchingJobs[]
FOR EACH access IN jobAccess:
  IF access.jobId === jobId AND (NOT access.expiresAt OR access.expiresAt > now):
    RETURN true

RETURN false
```

### 1.5 Grant Access

**Method:** `grantAccessToJob(employerId, jobId)` (lines 398-444)

**Called After:** Successful payment (currently mocked)

**Algorithm:**
```javascript
employer = User.findById(employerId)

// Enable global flag
IF NOT employer.profile.employerProfile.candidateMatchingEnabled:
  employer.profile.employerProfile.candidateMatchingEnabled = true

// Check if already has access
alreadyHasAccess = employer.profile.employerProfile.candidateMatchingJobs.some(
  access => access.jobId === jobId
)

IF alreadyHasAccess:
  RETURN { success: true, message: 'Already has access' }

// Add job to access list
employer.profile.employerProfile.candidateMatchingJobs.push({
  jobId,
  enabledAt: now,
  expiresAt: null  // Lifetime access
})

employer.save()

RETURN { success: true, message: 'Access granted' }
```

**Note:** Currently grants lifetime access (expiresAt: null). Could be modified for subscription model.

### 1.6 Contact Tracking

**Method:** `trackContact(jobId, candidateId, contactMethod)` (lines 450-469)

**Purpose:** Track when employer contacts a candidate (for analytics and future features)

**Algorithm:**
```javascript
CandidateMatch.findOneAndUpdate(
  { jobId, candidateId },
  {
    $set: {
      contacted: true,
      contactedAt: now,
      contactMethod: contactMethod  // 'email' | 'phone' | 'whatsapp'
    }
  }
)

RETURN { success: true }
```

---

## 2. NOTIFICATION SERVICE

**File:** `/backend/src/lib/notificationService.js`
**Lines:** 468 lines
**Purpose:** Manage job notifications to quick users via email/SMS

### 2.1 Job Notification Email Generation

**Method:** `generateJobNotificationEmail(user, job)` (lines 22-123)

**Content Generated:**
1. **Subject:** `Punë e re: {job.title} në {job.location.city}`
2. **HTML Email:** Fully styled responsive HTML template
3. **Plain Text Email:** Text fallback

**Key Features:**
- Unsubscribe URL tracking
- Click tracking (fetch to `/api/quickusers/track-click`)
- UTM parameters for analytics
- Personalized with user interests
- Albanian language

**Template Structure:**
```
┌─────────────────────────┐
│ Header (gradient blue)  │
│ "🎯 Punë e re për ju!" │
└─────────────────────────┘
│ Greeting: ${user.firstName}
├─────────────────────────┐
│ Job Card (bordered):    │
│ - Title                 │
│ - Company               │
│ - Location + Remote     │
│ - Salary (if available) │
│ - Deadline              │
│ - Category              │
└─────────────────────────┘
│ Description (first 300 chars)
│ CTA Button: "👀 Shiko Detajet dhe Apliko"
│ Why you got this: interests match
├─────────────────────────┐
│ Footer:                 │
│ - Preferences link      │
│ - Unsubscribe link      │
│ - Fine print            │
└─────────────────────────┘
```

### 2.2 Job Notification SMS Generation

**Method:** `generateJobNotificationSMS(user, job)` (lines 126-128)

**Format:**
```
🎯 Punë e re: {title} në {company}, {city}. Shiko: https://advance.al/jobs/{id} | Çregjistrohu: {unsubscribeUrl}
```

**Max Length:** SMS-friendly (typically <160 chars, expanded here for clarity)

### 2.3 Send Job Notification to User

**Method:** `sendJobNotificationToUser(user, job)` (lines 131-179)

**Algorithm:**
```javascript
notifications = []

// 1. Send Email (always)
emailContent = generateJobNotificationEmail(user, job)
emailResult = emailService.sendEmail(
  user.email,
  emailContent.subject,
  emailContent.htmlContent,
  emailContent.textContent
)

notifications.push({ type: 'email', success: emailResult.success, messageId: emailResult.messageId })

// 2. Send SMS (conditional)
IF user.preferences.smsNotifications AND user.phone:
  smsContent = generateJobNotificationSMS(user, job)
  smsResult = emailService.sendSMS(user.phone, smsContent)
  notifications.push({ type: 'sms', success: smsResult.success, messageId: smsResult.messageId })

// 3. Record notification sent
user.recordNotificationSent(job._id)  // Updates lastNotifiedAt, notificationsSent count

RETURN { success: true, notifications, userId: user._id }
```

### 2.4 Notify Matching Users (Batch Processing)

**Method:** `notifyMatchingUsers(job)` (lines 182-263)

**Called By:** POST /api/jobs (after job creation, via setImmediate)

**Algorithm:**
```javascript
// 1. Find matching users
matchingUsers = QuickUser.findMatchesForJob(job)  // Static method from QuickUser model

IF matchingUsers.length === 0:
  RETURN { success: true, message: 'No matching users', stats: {...} }

// 2. Process in batches of 10
batchSize = 10
results = []
successCount = 0
errorCount = 0

FOR i = 0 TO matchingUsers.length STEP batchSize:
  batch = matchingUsers.slice(i, i + batchSize)

  batchPromises = batch.map(user => sendJobNotificationToUser(user, job))
  batchResults = Promise.allSettled(batchPromises)

  FOR EACH result IN batchResults:
    IF result.status === 'fulfilled' AND result.value.success:
      successCount++
    ELSE:
      errorCount++

  // Delay 1 second between batches (rate limiting protection)
  IF more batches remaining:
    await sleep(1000ms)

RETURN {
  success: true,
  message: `Notifications sent to ${successCount} users`,
  stats: {
    totalUsers: matchingUsers.length,
    notificationsSent: successCount,
    errors: errorCount
  }
}
```

**Batch Size:** 10 users per batch
**Delay Between Batches:** 1 second
**Purpose:** Avoid overwhelming email/SMS APIs

### 2.5 Welcome Email for Quick Users

**Method:** `sendWelcomeEmail(user)` (lines 266-366)

**Called By:** POST /api/quickusers/register (async)

**Content:**
- Greeting with user's first name
- List of user's interests
- What happens next (4-point list)
- CTA buttons: "Krijo Llogari të Plotë" and "Shiko Punët"
- Unsubscribe and preferences links

**Purpose:** Onboard new quick users immediately after registration

### 2.6 Daily Digest (Unimplemented)

**Method:** `sendDailyDigest()` (lines 369-428)

**Status:** Partially implemented (missing job fetching logic)

**Intended Algorithm:**
```javascript
now = new Date()
twentyHoursAgo = now - 20 hours

// Find users who want daily notifications
dailyUsers = QuickUser.find({
  isActive: true,
  convertedToFullUser: false,
  'preferences.emailFrequency': 'daily',
  $or: [
    { lastNotifiedAt: null },
    { lastNotifiedAt: { $lt: twentyHoursAgo } }
  ]
})

// TODO: Fetch jobs from last 24 hours
recentJobs = [] // MISSING IMPLEMENTATION

IF recentJobs.length === 0:
  RETURN 'No new jobs'

FOR EACH user IN dailyUsers:
  matchingJobs = recentJobs.filter(job => user.matchesJob(job))
  IF matchingJobs.length > 0:
    sendJobNotificationToUser(user, matchingJobs[0])  // TODO: Send digest of all matching jobs
```

**Note:** Implementation incomplete. Should fetch recent jobs and send digest of multiple jobs.

### 2.7 Weekly Digest (Unimplemented)

**Method:** `sendWeeklyDigest()` (lines 431-464)

**Status:** Skeleton only (no implementation)

**Intended:** Similar to daily digest but for weekly users

---

## 3. EMAIL SERVICES

### 3.1 Email Service (Nodemailer)

**File:** `/backend/src/lib/emailService.js`
**Lines:** 188 lines
**Purpose:** SMTP email sending with nodemailer

#### **3.1.1 Configuration**

**Constructor:** Lines 12-36

**Config Priority:**
1. If `SMTP_USER` and `SMTP_PASS` exist → Use configured SMTP
2. Else → Setup Ethereal test account (for development)

**SMTP Settings:**
```javascript
{
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true' || false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
}
```

#### **3.1.2 Send Email with Retry**

**Method:** `sendEmail(to, subject, htmlContent, textContent)` (lines 64-132)

**Algorithm:**
```javascript
IF NOT isConfigured:
  console.log('Simulating send')
  RETURN { success: true, messageId: 'mock_...', preview: 'Not configured' }

mailOptions = {
  from: {
    name: 'advance.al',
    address: process.env.SMTP_FROM || 'noreply@advance.al'
  },
  to, subject, html: htmlContent, text: textContent
}

TRY:
  info = transporter.sendMail(mailOptions)

  // If Ethereal test account
  IF info.messageId.includes('ethereal'):
    previewUrl = nodemailer.getTestMessageUrl(info)
    console.log('Preview:', previewUrl)

  RETURN { success: true, messageId: info.messageId, preview: previewUrl }

CATCH error:
  // RETRY ONCE
  TRY:
    retryInfo = transporter.sendMail(mailOptions)
    RETURN { success: true, messageId: retryInfo.messageId }
  CATCH retryError:
    RETURN { success: false, error: retryError.message }
```

**Retry Logic:** One automatic retry on failure

#### **3.1.3 Send SMS (Placeholder)**

**Method:** `sendSMS(to, message)` (lines 135-151)

**Status:** Mock implementation

**Algorithm:**
```javascript
console.log('📱 SMS to', to, ':', message)

// TODO: Integrate Twilio or similar
// const client = twilio(accountSid, authToken);
// await client.messages.create({ body: message, from: twilioPhone, to })

RETURN { success: true, messageId: 'sms_mock_...' }
```

**Note:** SMS is logged but not actually sent

### 3.2 Resend Email Service

**File:** `/backend/src/lib/resendEmailService.js`
**Lines:** 639 lines
**Purpose:** Transactional emails via Resend API

#### **3.2.1 Configuration**

**Constructor:** Lines 4-17

```javascript
IF process.env.RESEND_API_KEY exists:
  resend = new Resend(apiKey)
  enabled = true
ELSE:
  enabled = false
  console.warn('RESEND_API_KEY not set - email sending disabled')

testEmail = 'advance.al123456@gmail.com'  // Hardcoded test recipient
```

**Key Point:** All emails sent to `advance.al123456@gmail.com` (test mode)

#### **3.2.2 Full Account Welcome Email**

**Method:** `sendFullAccountWelcomeEmail(user)` (lines 20-153)

**Called By:** POST /api/auth/register (jobseekers only, async)

**Content:**
- Welcome message with user's name
- Account details (name, email, city, type)
- What you can do now (4-point list)
- CTA: "📝 Plotëso Profilin Tënd"
- Tip: Completed profiles get 5x more views

**Email Always Sent To:** `advance.al123456@gmail.com` (line 129)

#### **3.2.3 Quick User Welcome Email**

**Method:** `sendQuickUserWelcomeEmail(user)` (lines 156-301)

**Similar to full account welcome** but includes:
- User's interests list
- Custom interests (if any)
- Two CTAs: "Krijo Llogari të Plotë" and "Shiko Punët"
- Unsubscribe link

**Email Always Sent To:** `advance.al123456@gmail.com` (line 277)

#### **3.2.4 Account Action Email**

**Method:** `sendAccountActionEmail(user, action, reason, duration)` (lines 304-492)

**Called By:** Report resolution actions (admin moderation)

**Action Types:**
1. **warning** - Account warning
2. **temporary_suspension** - Temporary suspension
3. **permanent_suspension** - Permanent ban
4. **account_termination** - Account deletion

**Content Structure:**
```javascript
{
  warning: {
    subject: '⚠️ Paralajmërim për llogarinë tuaj',
    title: '⚠️ Keni marrë një paralajmërim',
    description: 'Keni marrë një paralajmërim për sjelljen tuaj...',
    color: '#f59e0b',
    icon: '⚠️'
  },
  temporary_suspension: {
    subject: '🚫 Llogaria juaj është pezulluar',
    description: `Llogaria juaj është pezulluar për ${duration} ditë.`,
    color: '#ef4444',
    icon: '🚫'
  },
  // ... similar for permanent_suspension and account_termination
}
```

**Dynamic Content:**
- Duration (for temporary suspensions)
- Reason (admin-provided)
- Action type-specific messaging
- Appeal instructions

**Email Always Sent To:** `advance.al123456@gmail.com` (line 468)

#### **3.2.5 Bulk Notification Email**

**Method:** `sendBulkNotificationEmail(toEmail, notificationData)` (lines 495-627)

**Called By:** Bulk notification system (admin-created)

**Notification Types:**
```javascript
{
  announcement: { icon: '📢', color: '#2563eb' },
  maintenance: { icon: '🔧', color: '#f59e0b' },
  feature: { icon: '🆕', color: '#10b981' },
  warning: { icon: '⚠️', color: '#ef4444' },
  update: { icon: '🔄', color: '#8b5cf6' }
}
```

**Content:**
- Type-specific icon and color
- Title and message (admin-provided)
- Personalized greeting (userName)
- CTA: "Shko te advance.al"
- Branded footer

**Email Always Sent To:** `advance.al123456@gmail.com` (line 602)

**Note:** The `toEmail` parameter is ignored; all emails go to test address

---

## 4. PRICING AND REVENUE SYSTEM

**Source:** Job model static method, BusinessCampaign model, PricingRule model

### 4.1 Job Posting Pricing

**Method:** `PricingRule.calculateOptimalPrice(basePrice, jobData, employerData)`
**Called By:** POST /api/jobs (line 614 in jobs.js)

**Inputs:**
```javascript
basePrice = 50  // Default base price (€50)

jobData = {
  industry: job.category,
  location: job.location,
  jobType: job.jobType,
  tier: job.tier  // 'basic' | 'premium'
}

employerData = {
  userType: 'employer',
  accountAge: days_since_registration,
  totalSpent: employer.totalSpent || 0
}
```

**Process:**
1. Apply pricing rules based on priority (lowest priority number first)
2. Each rule can apply multiplier to base price
3. Calculate discount based on rules
4. Return final price and applied rules

**Example Pricing Rules:**
- Industry-specific: Tech jobs +20%, hospitality -10%
- Location: Tirana +15%, other cities standard
- Demand-based: High-demand categories +30%
- Company size: Large companies +10%
- Seasonal: Summer tourism jobs -20%
- Time-based: Weekend postings -5%

### 4.2 Campaign Discounts

**Called By:** POST /api/jobs (lines 619-650 in jobs.js)

**Algorithm:**
```javascript
finalPrice = pricingResult.finalPrice
totalDiscount = pricingResult.discount
appliedCampaign = null

// Get active campaigns
activeCampaigns = BusinessCampaign.find({
  isActive: true,
  status: 'active',
  'schedule.startDate': { $lte: now },
  'schedule.endDate': { $gte: now },
  $expr: { $lt: ['$parameters.currentUses', '$parameters.maxUses'] }
})
.sort({ 'parameters.discount': -1 })  // Highest discount first

FOR EACH campaign IN activeCampaigns:
  IF checkCampaignEligibility(campaign, employer, jobData):
    // Apply campaign discount
    IF campaign.parameters.discountType === 'percentage':
      campaignDiscount = finalPrice * (campaign.parameters.discount / 100)
    ELSE:
      campaignDiscount = campaign.parameters.discount

    finalPrice = max(0, finalPrice - campaignDiscount)
    totalDiscount += campaignDiscount
    appliedCampaign = campaign._id

    // Track campaign usage
    campaign.parameters.currentUses += 1
    campaign.trackConversion(campaignDiscount, isNewUser)

    BREAK  // Apply only ONE campaign (highest discount)
```

**Campaign Eligibility:**
```javascript
FUNCTION checkCampaignEligibility(campaign, user, jobData):
  SWITCH campaign.parameters.targetAudience:
    CASE 'new_employers':
      userJobCount = Job.countDocuments({ employerId: user._id })
      RETURN userJobCount === 0  // First job

    CASE 'returning_employers':
      returningJobCount = Job.countDocuments({ employerId: user._id })
      RETURN returningJobCount > 0

    CASE 'enterprise':
      RETURN user.profile.employerProfile.companySize === 'large'

    CASE 'specific_industry':
      RETURN campaign.parameters.industryFilter.includes(jobData.industry)

    CASE 'all':
    DEFAULT:
      RETURN true
```

### 4.3 Employer Whitelist (Free Posting)

**Called By:** POST /api/jobs (lines 692-706 in jobs.js)

**Algorithm:**
```javascript
employer = User.findById(employerId)
isFreeForEmployer = employer.freePostingEnabled

IF isFreeForEmployer:
  job.pricing.finalPrice = 0  // Override to free
  job.pricing.discount = job.pricing.basePrice  // Full discount
  job.status = 'active'  // No payment required, live immediately
  console.log(`🆓 Free posting applied for whitelisted employer: ${employer.email}`)
ELSE IF finalPrice > 0:
  job.status = 'pending_payment'
  job.paymentRequired = finalPrice
ELSE:
  job.status = 'active'  // Free jobs go live immediately
```

**Whitelist Management:**
- Add: `POST /api/business-control/whitelist/:employerId`
- Remove: `DELETE /api/business-control/whitelist/:employerId`
- View: `GET /api/business-control/whitelist`

### 4.4 Revenue Analytics Tracking

**Called By:** POST /api/jobs (lines 711-757 in jobs.js, via setImmediate)

**Algorithm:**
```javascript
// Async tracking (doesn't block job creation response)
setImmediate(async () => {
  today = RevenueAnalytics.getOrCreateDaily()

  // Update daily metrics
  today.updateMetrics({
    totalRevenue: today.metrics.totalRevenue + job.pricing.finalPrice,
    jobsPosted: today.metrics.jobsPosted + 1,
    averageJobPrice: (totalRevenue + finalPrice) / (jobsPosted + 1)
  })

  // Track campaign revenue if applicable
  IF appliedCampaign:
    campaign = BusinessCampaign.findById(appliedCampaign)
    today.addCampaignData({
      campaignId,
      name: campaign.name,
      revenue: finalPrice,
      conversions: 1,
      cost: discount,
      roi: ((finalPrice - discount) / discount) * 100
    })

  // Track pricing rule revenue
  FOR EACH ruleId IN appliedRules:
    rule = PricingRule.findById(ruleId)
    today.addPricingRuleData({
      ruleId,
      name: rule.name,
      revenue: finalPrice,
      jobsAffected: 1,
      averageImpact: ((finalPrice - basePrice) / basePrice) * 100
    })
})
```

**Analytics Endpoints:**
- Dashboard: `GET /api/business/analytics/dashboard`
- Revenue Details: `GET /api/business/analytics/revenue?days=30`
- Manual Update: `POST /api/business/analytics/update`

---

## 5. REPORT AND MODERATION SYSTEM

**Source:** Report model instance methods, routes/reports.js

### 5.1 Report Resolution

**Method:** `Report.resolve(action, reason, adminId, duration)` (Report model instance method)

**Actions:**
1. **no_action** - Close report without action
2. **warning** - Send warning email to user
3. **temporary_suspension** - Suspend for N days
4. **permanent_suspension** - Ban permanently
5. **account_termination** - Delete account

**Algorithm:**
```javascript
FUNCTION report.resolve(action, reason, adminId, duration):
  // 1. Update report status
  report.status = 'resolved'
  report.resolvedAt = now
  report.resolvedBy = adminId
  report.resolution = { action, reason, duration }

  // 2. Get reported user
  reportedUser = User.findById(report.reportedUser)

  // 3. Apply action to user
  SWITCH action:
    CASE 'no_action':
      // No action on user account
      BREAK

    CASE 'warning':
      // Send warning email
      resendEmailService.sendAccountActionEmail(
        reportedUser, 'warning', reason
      )
      BREAK

    CASE 'temporary_suspension':
      // Suspend user
      reportedUser.status = 'suspended'
      reportedUser.suspensionDetails = {
        reason,
        suspendedAt: now,
        expiresAt: new Date(now + duration * 24 * 60 * 60 * 1000),
        suspendedBy: adminId
      }
      reportedUser.save()

      // Send suspension email
      resendEmailService.sendAccountActionEmail(
        reportedUser, 'temporary_suspension', reason, duration
      )
      BREAK

    CASE 'permanent_suspension':
      // Ban user
      reportedUser.status = 'banned'
      reportedUser.suspensionDetails = {
        reason,
        suspendedAt: now,
        expiresAt: null,  // Permanent
        suspendedBy: adminId
      }
      reportedUser.save()

      // Send ban email
      resendEmailService.sendAccountActionEmail(
        reportedUser, 'permanent_suspension', reason
      )
      BREAK

    CASE 'account_termination':
      // Delete user
      reportedUser.status = 'deleted'
      reportedUser.isDeleted = true
      reportedUser.deletedAt = now
      reportedUser.save()

      // Send termination email
      resendEmailService.sendAccountActionEmail(
        reportedUser, 'account_termination', reason
      )
      BREAK

  // 4. Create action record
  reportAction = new ReportAction({
    reportId: report._id,
    actionType: 'resolution',
    performedBy: adminId,
    details: { action, reason, duration },
    timestamp: now
  })
  reportAction.save()

  report.save()

  RETURN report
```

### 5.2 Auto-Lift Suspended Status

**Method:** `User.checkSuspensionStatus()` (User model instance method)
**Called By:** authenticate middleware (every login attempt)

**Algorithm:**
```javascript
IF user.status === 'suspended' AND user.suspensionDetails.expiresAt:
  now = new Date()
  IF now > user.suspensionDetails.expiresAt:
    // Suspension expired - auto-lift
    user.status = 'active'
    user.suspensionDetails = {
      reason: '',
      suspendedAt: null,
      expiresAt: null,
      suspendedBy: null
    }
    user.save()
    console.log(`✅ Auto-lifted suspension for user ${user.email}`)
```

**Key Point:** Suspensions auto-expire on next login attempt

### 5.3 Report Statistics

**Method:** `Report.getStats(timeframe)` (Report model static method)

**Called By:** `GET /api/admin/reports/stats?timeframe=30`

**Returns:**
```javascript
{
  summary: {
    totalReports: number,
    resolvedReports: number,
    pendingReports: number,
    resolutionRate: string (percentage),
    averageResolutionTime: string (hours/days)
  },
  reportStats: {
    byCategory: [{ category, count }],
    byPriority: [{ priority, count }],
    byStatus: [{ status, count }]
  },
  actionStats: {
    warnings: number,
    temporarySuspensions: number,
    permanentSuspensions: number,
    accountTerminations: number,
    noActions: number
  },
  topReportedUsers: [
    { userId, count, user: { name, email } }
  ],
  timeframe: number (days)
}
```

---

## 6. JOB EXPIRY AND LIFECYCLE

**Source:** Job model instance methods

### 6.1 Job Expiry Check

**Method:** `Job.isExpired()` (Job model instance method)

**Algorithm:**
```javascript
IF job.expiresAt is null:
  RETURN false

RETURN new Date() > job.expiresAt
```

**Used In:**
- PUT /api/jobs/:id - Prevent editing expired jobs
- GET /api/jobs - Filter out expired jobs

### 6.2 Job Status States

**Enum:** `['active', 'paused', 'closed', 'pending_payment', 'expired']`

**State Transitions:**
```
pending_payment → active (after payment)
active → paused (employer action)
paused → active (employer action)
active → closed (employer action or deadline reached)
active → expired (automatic based on expiresAt)
```

### 6.3 View Count Tracking

**Method:** `Job.incrementViewCount()` (Job model instance method)

**Called By:** GET /api/jobs/:id (line 479 in jobs.js)

**Algorithm:**
```javascript
IF NOT req.user OR NOT req.user._id.equals(job.employerId):
  // Only increment if viewer is not the employer who posted it
  job.viewCount += 1
  job.save()
```

**Purpose:** Track job popularity for analytics and sorting

### 6.4 Soft Delete

**Method:** `Job.softDelete()` (Job model instance method)

**Called By:** DELETE /api/jobs/:id

**Algorithm:**
```javascript
job.isDeleted = true
job.deletedAt = new Date()
job.save()
```

**Key Point:** Jobs are never hard-deleted from database

---

## 7. APPLICATION WORKFLOW

**Source:** Application model methods, routes/applications.js

### 7.1 Application Submission

**Called By:** POST /api/applications/apply

**Validation:**
1. Job must be active, not deleted, not expired
2. User must not have already applied
3. **One-Click Method:** Profile must be complete (firstName, lastName, title, resume)
4. **Custom Form Method:** All required question answers must be provided

**Process:**
```javascript
// Create application
application = new Application({
  jobId,
  applicantId: user._id,
  applicationMethod: 'one_click' | 'custom_form',
  coverLetter: optional,
  customAnswers: [{ question, answer }] (if custom_form),
  status: 'pending',
  appliedAt: now
})

application.save()

// Populate for response
application.populate('jobId employerId')

RETURN application
```

### 7.2 Application Status Transitions

**Statuses:** `['pending', 'reviewing', 'shortlisted', 'rejected', 'hired']`

**Typical Flow:**
```
pending → reviewing → shortlisted → hired
                   ↘ rejected
```

**Updated By:** PUT /api/applications/:id/status (employer only)

**Triggers:**
- Status change → Create in-app notification for applicant

### 7.3 Application Withdrawal

**Method:** POST /api/applications/:id/withdraw

**Validation:**
- User must be the applicant
- Cannot withdraw if status is 'hired'

**Algorithm:**
```javascript
IF application.status === 'hired':
  RETURN 400 'Nuk mund të tërhiqni një aplikim të pranuar'

application.withdrawn = true
application.withdrawnAt = now
application.save()
```

### 7.4 Application Messaging

**Method:** POST /api/applications/:id/message

**Process:**
```javascript
// Verify user is either employer or applicant
IF NOT (req.user._id === application.applicantId OR req.user._id === application.job.employerId):
  RETURN 403 'Unauthorized'

// Add message
application.messages.push({
  senderId: req.user._id,
  senderType: req.user.userType,
  message: messageText,
  sentAt: now
})

application.save()

// Create notification for other party
otherPartyId = req.user._id === application.applicantId ? application.job.employerId : application.applicantId

Notification.create({
  userId: otherPartyId,
  type: 'message',
  title: 'Mesazh i ri',
  message: `Keni marrë një mesazh të ri në aplikimin për punën: ${application.job.title}`,
  relatedModel: 'Application',
  relatedId: application._id
})
```

---

## 8. QUICK USER MATCHING

**Source:** QuickUser model static method

### 8.1 Find Matches for Job

**Method:** `QuickUser.findMatchesForJob(job)` (QuickUser model static method)

**Called By:** `notificationService.notifyMatchingUsers(job)`

**Algorithm:**
```javascript
// Get all interests (predefined + custom)
allInterests = [...job.interests, ...job.customInterests]

matchingUsers = QuickUser.find({
  isActive: true,
  convertedToFullUser: false,
  'preferences.emailNotifications': true,
  $or: [
    // Match predefined interests
    { interests: { $in: [job.category] } },

    // Match custom interests (text search)
    { customInterests: { $in: job.tags } }
  ]
})

// Additional filters
matchingUsers = matchingUsers.filter(user => {
  // Location filter (optional)
  IF user.city AND job.location.city:
    IF user.city !== job.location.city AND NOT job.location.remote:
      RETURN false

  // Notification frequency check
  IF user.preferences.emailFrequency === 'instant':
    RETURN true

  IF user.preferences.emailFrequency === 'daily':
    // Check if already notified in last 20 hours
    IF user.lastNotifiedAt AND (now - user.lastNotifiedAt) < 20 hours:
      RETURN false

  IF user.preferences.emailFrequency === 'weekly':
    // Check if already notified in last 6 days
    IF user.lastNotifiedAt AND (now - user.lastNotifiedAt) < 6 days:
      RETURN false

  RETURN true
})

RETURN matchingUsers
```

**Matching Logic:**
1. User must be active and not converted to full user
2. Email notifications must be enabled
3. User's interests OR custom interests must match job category OR tags
4. Optional: Location match (if specified)
5. Respect notification frequency preferences

---

## VERIFICATION SECTION

### Files Read and Analyzed

**✅ Service Files:**
- `/backend/src/services/candidateMatching.js` (473 lines) - Complete candidate matching algorithm
- `/backend/src/lib/notificationService.js` (468 lines) - Job notification system
- `/backend/src/lib/emailService.js` (188 lines) - Nodemailer SMTP service
- `/backend/src/lib/resendEmailService.js` (639 lines) - Resend API service

**✅ Model Methods:**
- Job model instance methods (soft delete, view tracking, expiry check)
- User model instance methods (checkSuspensionStatus)
- Report model instance methods (resolve)
- QuickUser model static methods (findMatchesForJob)
- Application model workflows

### Completeness

**✅ Documented:**
- Candidate matching algorithm with 7 scoring factors (0-100 points)
- Complete matching score breakdown
- 24-hour caching system for candidate matches
- Job notification system with batch processing (10 per batch, 1s delay)
- Email generation (job notifications, welcome emails, account actions, bulk notifications)
- Dual email service (Nodemailer + Resend)
- Pricing calculation with business rules
- Campaign discount system
- Employer whitelist for free posting
- Revenue analytics tracking (async, non-blocking)
- Report resolution workflow with 5 action types
- Auto-lift suspension on expiry
- Application lifecycle (submission, status transitions, withdrawal, messaging)
- Quick user matching algorithm

**✅ Key Findings:**

1. **Candidate Matching:** Sophisticated 7-factor algorithm with weighted scoring
2. **Caching:** 24-hour cache for match results (performance optimization)
3. **Batch Processing:** Notifications sent in batches of 10 with 1s delay (rate limiting)
4. **Test Mode:** All Resend emails hardcoded to 'advance.al123456@gmail.com'
5. **SMS Placeholder:** SMS sending is mocked (logs only, not sent)
6. **Async Tracking:** Revenue analytics don't block job creation response
7. **Single Campaign:** Only highest-discount campaign applied per job
8. **Free Posting:** Whitelist system bypasses all pricing
9. **Auto-Expiry:** Suspensions auto-lift on next login if expired
10. **Soft Deletes:** All jobs and users soft-deleted (isDeleted flag)

### Zero-Assumption Documentation

**✅ Only documented proven implementation:**
- Marked incomplete features (daily/weekly digest)
- Noted mocked functionality (SMS, payment)
- Specified hardcoded values (test email, basePrice €50)
- Highlighted TODO comments in code

---

## END OF DOCUMENT

**Document Created:** 2026-01-13
**Total Service Files:** 4
**Total Lines Analyzed:** 1,768 lines
**Documentation Method:** Forensic analysis with zero assumptions
