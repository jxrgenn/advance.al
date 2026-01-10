# Logic Bugs Report - Albania JobFlow (Advance.al)

**Date:** January 10, 2026
**Analysis Type:** Ultra-Deep Logic Bug Analysis
**Analyst:** Claude (Deep Code Review)
**Severity Levels:** CRITICAL | HIGH | MEDIUM | LOW

---

## 🔥 Executive Summary

**Total Bugs Found:** 22 logic bugs
**CRITICAL:** 5 bugs (System-breaking)
**HIGH:** 8 bugs (Data corruption/Business logic failures)
**MEDIUM:** 7 bugs (Inconsistencies/Edge cases)
**LOW:** 2 bugs (Minor issues)

**Risk Assessment:** HIGH - Multiple critical bugs that allow invalid system states, data corruption, and broken user flows.

---

## 📋 Table of Contents

1. [CRITICAL Bugs](#critical-bugs)
2. [HIGH Priority Bugs](#high-priority-bugs)
3. [MEDIUM Priority Bugs](#medium-priority-bugs)
4. [LOW Priority Bugs](#low-priority-bugs)
5. [Bug Summary by Category](#bug-summary-by-category)
6. [Recommended Fix Priority](#recommended-fix-priority)

---

## CRITICAL Bugs

### BUG #1: Job Status/Expiration Filters Disabled - EXPIRED JOBS SHOWING TO USERS
**Severity:** CRITICAL
**Location:** `backend/src/models/Job.js:383-386`, `backend/src/routes/jobs.js:190-204`
**Impact:** Users can view, apply to, and get notified about EXPIRED jobs!

**Problem:**
```javascript
// Job.js searchJobs method - Lines 383-386
const query = {
    isDeleted: false,
    // status: 'active',  // Temporarily disabled to show all non-deleted jobs
    // expiresAt: { $gt: new Date() }  // Temporarily disabled to show expired jobs too
};
```

The filters for `status: 'active'` and `expiresAt` are **commented out**, meaning:
- Expired jobs (expiresAt < now) still show in search results
- Paused/closed jobs show in listings
- Users waste time applying to jobs that are no longer active
- MongoDB testing found 25 expired jobs still marked as 'active' (reported in `TESTING_AND_MCP_COMPLETE_GUIDE.md:99`)

**User Impact:**
1. Jobseeker applies to expired job → wastes time
2. Employer gets application for closed position → confusion
3. System sends notifications for expired jobs
4. Invalid analytics (job counts include dead listings)

**Reproduction Steps:**
1. Go to /jobs page
2. View job listings
3. See jobs with expiresAt date in the past
4. Apply to expired job → application succeeds (shouldn't be possible)

**Recommended Fix:**
```javascript
// Job.js - UNCOMMENT the filters
const query = {
    isDeleted: false,
    status: 'active',
    expiresAt: { $gt: new Date() }
};

// Add cron job to auto-expire jobs
import cron from 'node-cron';
cron.schedule('0 * * * *', async () => {  // Run every hour
    const result = await Job.updateMany(
        { status: 'active', expiresAt: { $lt: new Date() } },
        { $set: { status: 'expired' } }
    );
    console.log(`Auto-expired ${result.modifiedCount} jobs`);
});
```

---

### BUG #2: No Duplicate Application Prevention at Database Level
**Severity:** CRITICAL
**Location:** `backend/src/models/Application.js:116`, `backend/src/routes/applications.js:65-76`
**Impact:** Race condition allows multiple applications to same job!

**Problem:**
The unique compound index exists on `(jobId, jobSeekerId)`:
```javascript
// Application.js:116
applicationSchema.index({ jobId: 1, jobSeekerId: 1 }, { unique: true });
```

BUT the application check in the route happens BEFORE the database insert:
```javascript
// applications.js:65-76
const existingApplication = await Application.findOne({
    jobId: jobId,
    jobSeekerId: req.user._id,
    withdrawn: false
});

if (existingApplication) {
    return res.status(400).json({ ... });
}

// Time gap here - race condition!
const application = new Application({ ... });
await application.save();
```

**Race Condition:**
If two requests arrive simultaneously:
1. Request A checks → no existing application → proceeds
2. Request B checks → no existing application → proceeds
3. Request A saves application
4. Request B saves application → **DUPLICATE!**

The unique index will catch this, but the error handling (lines 140-145) shows a duplicate key error message instead of gracefully handling it.

**User Impact:**
- User clicks "Apply" button twice quickly
- Two applications get created (database throws error)
- User sees confusing "duplicate key" error instead of friendly message
- Application count becomes inaccurate

**Recommended Fix:**
```javascript
// Use findOneAndUpdate with upsert to make it atomic
try {
    const application = await Application.findOneAndUpdate(
        {
            jobId: jobId,
            jobSeekerId: req.user._id
        },
        {
            $setOnInsert: {
                jobId,
                jobSeekerId: req.user._id,
                employerId: job.employerId._id,
                applicationMethod,
                customAnswers,
                coverLetter,
                appliedAt: new Date(),
                status: 'pending',
                withdrawn: false
            }
        },
        {
            upsert: true,
            new: true,
            setDefaultsOnInsert: true
        }
    );

    // Check if it was just created or already existed
    const isNew = application.createdAt.getTime() === application.updatedAt.getTime();
    if (!isNew) {
        return res.status(400).json({
            success: false,
            message: 'Ju keni aplikuar tashmë për këtë punë'
        });
    }
} catch (error) {
    // Handle actual errors
}
```

---

### BUG #3: Employer Can Apply to Their Own Job
**Severity:** CRITICAL
**Location:** `backend/src/routes/applications.js:45`
**Impact:** Employers can game the system, fake application counts, break analytics

**Problem:**
The apply endpoint has `requireJobSeeker` middleware BUT there's no check to prevent the employer who posted the job from applying to it:

```javascript
// applications.js:45
router.post('/apply', authenticate, requireJobSeeker, ...);
```

The check at line 50 only verifies the job exists and is active:
```javascript
const job = await Job.findOne({
    _id: jobId,
    status: 'active',
    isDeleted: false,
    expiresAt: { $gt: new Date() }
}).populate('employerId');
```

**BUT** nowhere does it check:
```javascript
if (job.employerId._id.equals(req.user._id)) {
    // Prevent self-application
}
```

**Attack Scenario:**
1. Employer creates a jobseeker account with different email
2. Applies to their own job
3. Inflates application count artificially
4. Makes their job posting look more attractive
5. Creates fake activity

**User Impact:**
- False application metrics
- Unfair advantage to dishonest employers
- Wasted resources on fake applications
- Data integrity compromised

**Recommended Fix:**
```javascript
// applications.js - After line 56 (after job is loaded)
// Check if job seeker is the employer who posted this job
if (job.employerId._id.equals(req.user._id)) {
    return res.status(403).json({
        success: false,
        message: 'Nuk mund të aplikoni për punën tuaj'
    });
}
```

---

### BUG #4: User Deletion Doesn't Cascade - Orphaned Records Everywhere
**Severity:** CRITICAL
**Location:** `backend/src/models/User.js:346-350`, `backend/src/routes/users.js:339-364`
**Impact:** Deleted users leave orphaned applications, jobs, notifications everywhere

**Problem:**
The soft delete method only marks the user as deleted:
```javascript
// User.js:346-350
userSchema.methods.softDelete = function() {
    this.isDeleted = true;
    this.status = 'deleted';
    return this.save();
};
```

**NO CASCADING CLEANUP:**
- User's applications remain in database pointing to deleted user
- If employer is deleted: their jobs remain active!
- Notifications for deleted user remain
- Reports about deleted user remain
- Saved jobs references remain

**Data Integrity Issues:**
1. Active job with deleted employer → orphaned job still shows to users
2. Applications pointing to deleted jobseeker → employer can't view profile
3. Notifications sent to deleted users → wasted resources
4. Analytics count deleted users in metrics

**Recommended Fix:**
```javascript
// User.js - Replace softDelete method
userSchema.methods.softDelete = async function() {
    this.isDeleted = true;
    this.status = 'deleted';
    await this.save();

    // Cascade deletions based on user type
    if (this.userType === 'employer') {
        // Soft delete all jobs
        const Job = mongoose.model('Job');
        await Job.updateMany(
            { employerId: this._id, isDeleted: false },
            { $set: { isDeleted: true, status: 'closed' } }
        );

        // Mark all employer's applications as withdrawn
        const Application = mongoose.model('Application');
        await Application.updateMany(
            { employerId: this._id, withdrawn: false },
            { $set: { withdrawn: true, withdrawnAt: new Date() } }
        );
    } else if (this.userType === 'jobseeker') {
        // Withdraw all pending applications
        const Application = mongoose.model('Application');
        await Application.updateMany(
            { jobSeekerId: this._id, withdrawn: false, status: 'pending' },
            { $set: { withdrawn: true, withdrawnAt: new Date(), withdrawalReason: 'Account deleted' } }
        );
    }

    // Clean up notifications
    const Notification = mongoose.model('Notification');
    await Notification.deleteMany({ userId: this._id });

    return this;
};
```

---

### BUG #5: Application Status Transitions Not Validated - Invalid State Changes
**Severity:** CRITICAL
**Location:** `backend/src/routes/applications.js:453-498`
**Impact:** Applications can jump to impossible states, breaking workflows

**Problem:**
The status update endpoint allows ANY status transition:
```javascript
// applications.js:457
if (!['viewed', 'shortlisted', 'rejected', 'hired'].includes(status)) {
    return res.status(400).json({ ... });
}
```

**Invalid Transitions Allowed:**
- `pending` → `hired` (skip 'viewed' and 'shortlisted')
- `rejected` → `hired` (resurrect rejected applications)
- `hired` → `rejected` (fire someone after hiring?)
- `shortlisted` → `pending` (go backwards?)

**Real-World Scenario:**
1. Employer accidentally clicks "Reject" instead of "Hire"
2. Tries to change status back
3. System allows `rejected` → `hired`
4. Jobseeker gets conflicting notifications ("rejected" then "hired")
5. Confusing user experience

**Recommended Fix:**
```javascript
// applications.js - Add state machine validation
const validTransitions = {
    'pending': ['viewed', 'shortlisted', 'rejected'],
    'viewed': ['shortlisted', 'rejected'],
    'shortlisted': ['hired', 'rejected'],
    'rejected': [], // Terminal state
    'hired': [] // Terminal state
};

const currentStatus = application.status;
if (!validTransitions[currentStatus]?.includes(status)) {
    return res.status(400).json({
        success: false,
        message: `Nuk mund të ndryshoni statusin nga "${currentStatus}" në "${status}". Statusi aktual është përfundimtar.`
    });
}
```

---

## HIGH Priority Bugs

### BUG #6: Job Tier Can Be Changed Without Payment
**Severity:** HIGH
**Location:** `backend/src/routes/jobs.js:776-854`
**Impact:** Free upgrade from basic to premium tier!

**Problem:**
The job update endpoint (PUT /api/jobs/:id) doesn't validate tier changes:
```javascript
// jobs.js:823-836
Object.assign(job, {
    title,
    description,
    requirements,
    benefits,
    location,
    jobType,
    category,
    seniority,
    salary,
    customQuestions,
    tags: tags ? tags.slice(0, 10) : job.tags,
    status: status || job.status,
    updatedAt: new Date()
});
```

Notice: `tier` is NOT in the update object, BUT if the request body contains `tier`, Object.assign will include it!

**Attack:**
1. Employer posts job with `tier: 'basic'`
2. Later calls PUT /api/jobs/:id with `tier: 'premium'` in body
3. Job tier changes without payment
4. Gets premium visibility for free

**Recommended Fix:**
```javascript
// jobs.js - Explicitly exclude tier from updates
const { tier: ignoredTier, ...updateFields } = req.body;

// If tier change is requested, require payment
if (req.body.tier && req.body.tier !== job.tier) {
    return res.status(400).json({
        success: false,
        message: 'Ndryshimi i nivelit të punës kërkon pagesë. Ju lutemi kontaktoni mbështetjen.'
    });
}
```

---

### BUG #7: Pagination Math Error - Negative Skip Values Possible
**Severity:** HIGH
**Location:** Multiple files (e.g., `backend/src/routes/jobs.js:182`, `applications.js:210`, `notifications.js:48`)
**Impact:** Invalid page numbers crash queries or return wrong data

**Problem:**
```javascript
// jobs.js:182
const skip = (parseInt(page) - 1) * parseInt(limit);
```

If user sends `page=0` or `page=-5`:
- `skip = (0 - 1) * 10 = -10`
- MongoDB skip with negative value returns unexpected results
- Could expose data that shouldn't be visible

**Attack Vector:**
```
GET /api/jobs?page=-1&limit=100
```

**Recommended Fix:**
```javascript
// Add validation
const page = Math.max(1, parseInt(req.query.page) || 1);
const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
const skip = (page - 1) * limit;
```

---

### BUG #8: Email Verification Not Enforced for Critical Actions
**Severity:** HIGH
**Location:** `backend/src/models/User.js:268-271`
**Impact:** Unverified emails can apply to jobs, post jobs, receive sensitive data

**Problem:**
The User schema has `emailVerified` field but it's never checked:
```javascript
// User.js:268-271
emailVerified: {
    type: Boolean,
    default: false
},
```

**Consequences:**
- Jobseekers with fake emails apply to jobs
- Employers with unverified emails post job listings
- No way to contact users if email is fake
- System sends emails to invalid addresses (wastes resources)

**Recommended Fix:**
```javascript
// Add middleware to check email verification
export const requireVerifiedEmail = (req, res, next) => {
    if (!req.user.emailVerified) {
        return res.status(403).json({
            success: false,
            message: 'Ju duhet të verifikoni emailin tuaj për të vazhduar',
            action: 'verify_email_required'
        });
    }
    next();
};

// Apply to critical routes
router.post('/apply', authenticate, requireJobSeeker, requireVerifiedEmail, ...);
router.post('/jobs', authenticate, requireEmployer, requireVerifiedEmail, ...);
```

---

### BUG #9: Job View Count Can Be Inflated by Refreshing Page
**Severity:** HIGH
**Location:** `backend/src/routes/jobs.js:462-465`
**Impact:** Fake engagement metrics, gaming the system

**Problem:**
```javascript
// jobs.js:462-465
// Increment view count (but not for the employer who posted it)
if (!req.user || !req.user._id.equals(job.employerId._id)) {
    await job.incrementViewCount();
}
```

**Issues:**
1. No session tracking - same user can refresh and inflate count
2. No bot detection - automated scripts can inflate views
3. No cooldown period - rapid successive views all counted
4. Anonymous users can inflate counts infinitely

**Attack:**
```javascript
// Script to inflate views
for (let i = 0; i < 1000; i++) {
    await fetch('/api/jobs/someJobId');
}
```

**Recommended Fix:**
```javascript
// Add view tracking with session/IP cooldown
const ViewTracking = new Schema({
    jobId: ObjectId,
    viewerId: ObjectId, // null for anonymous
    ipAddress: String,
    userAgent: String,
    viewedAt: Date
});

// In the route
const recentView = await ViewTracking.findOne({
    jobId: job._id,
    $or: [
        { viewerId: req.user?._id },
        { ipAddress: req.ip }
    ],
    viewedAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) } // 1 hour cooldown
});

if (!recentView) {
    await job.incrementViewCount();
    await ViewTracking.create({ jobId: job._id, viewerId: req.user?._id, ipAddress: req.ip, viewedAt: new Date() });
}
```

---

### BUG #10: Notification Created But Not Saved - Application Notifications Lost
**Severity:** HIGH
**Location:** `backend/src/models/Application.js:146-172`
**Impact:** Users don't get notified about application status changes

**Problem:**
The `updateStatus` method creates a notification but the error is silently caught:
```javascript
// Application.js:160-168
if (oldStatus !== newStatus && ['viewed', 'shortlisted', 'rejected', 'hired'].includes(newStatus)) {
    try {
        const Notification = mongoose.model('Notification');
        await Notification.createApplicationStatusNotification(this, oldStatus, newStatus);
        console.log(`✅ Notification created for status change: ${oldStatus} → ${newStatus}`);
    } catch (error) {
        console.error('❌ Error creating status change notification:', error);
        // Don't fail the status update if notification fails  <-- PROBLEM!
    }
}
```

**Issue:**
If notification creation fails (e.g., invalid data, database error), the error is swallowed and the user never knows their application status changed!

**Critical Miss:**
- Application status: `pending` → `hired`
- Notification creation fails silently
- User never finds out they got the job!
- Employer wonders why candidate didn't respond

**Recommended Fix:**
```javascript
// Option 1: At least log it prominently and alert admins
catch (error) {
    console.error('❌ CRITICAL: Failed to notify user about status change:', error);
    // Send alert to monitoring system
    await alertAdmin('Notification failure', { applicationId: this._id, error: error.message });
}

// Option 2: Use a job queue for reliability
import { notificationQueue } from '../lib/queue';
await notificationQueue.add('application-status-changed', {
    applicationId: this._id,
    oldStatus,
    newStatus
});
```

---

### BUG #11: Suspended User Can Still Access System During Active Session
**Severity:** HIGH
**Location:** `backend/src/middleware/auth.js:24-110`
**Impact:** Suspended users continue to use the platform

**Problem:**
The authentication middleware only verifies the JWT token:
```javascript
// auth.js - authenticate middleware
export const authenticate = async (req, res, next) => {
    // ... get token ...
    const decoded = verifyToken(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    req.user = user;
    next();
};
```

**Missing Check:**
After user is loaded, there's no check for:
- `user.status === 'suspended'`
- `user.status === 'banned'`
- `user.isDeleted === true`

**Scenario:**
1. User logs in → gets JWT token
2. Admin suspends user account
3. User continues browsing with active token (valid for hours/days)
4. Can still apply to jobs, post jobs, etc.

**Recommended Fix:**
```javascript
// auth.js - Add status check in authenticate middleware
export const authenticate = async (req, res, next) => {
    // ... existing token verification ...

    const user = await User.findById(decoded.id);

    if (!user || user.isDeleted || user.status === 'deleted') {
        return res.status(401).json({
            success: false,
            message: 'Llogaria juaj është çaktivizuar',
            action: 'account_deleted'
        });
    }

    if (user.status === 'suspended' || user.status === 'banned') {
        return res.status(403).json({
            success: false,
            message: 'Llogaria juaj është pezulluar ose mbyllur',
            action: 'account_suspended'
        });
    }

    req.user = user;
    next();
};
```

---

### BUG #12: Quick Apply Missing Profile Validation - Users Can Apply With Incomplete Profiles
**Severity:** HIGH
**Location:** `backend/src/routes/applications.js:78-89`, `frontend/src/components/QuickApplyModal.tsx:76-95`
**Impact:** Incomplete applications, poor candidate experience, wasted employer time

**Problem:**
Backend checks for required fields:
```javascript
// applications.js:78-89
if (applicationMethod === 'one_click') {
    const user = req.user;
    const profile = user.profile.jobSeekerProfile;

    if (!user.profile.firstName || !user.profile.lastName || !profile.title || !profile.resume) {
        return res.status(400).json({ ... });
    }
}
```

**Missing Critical Fields:**
- Email (what if user changes it and it's invalid?)
- Phone number (how will employer contact candidate?)
- Location (remote/on-site match)
- Experience level
- Skills (for matching)

Frontend shows warning but allows application:
```javascript
// QuickApplyModal.tsx:76-95
const getProfileCompleteness = () => {
    // Calculates 0-100% but doesn't block application!
};

const isProfileIncomplete = profileCompleteness < 60;
// Shows warning but user can still click "Send application"
```

**User Impact:**
- Jobseeker applies with 30% complete profile
- Employer sees incomplete application → rejects immediately
- Jobseeker reputation damaged
- Time wasted for both parties

**Recommended Fix:**
```javascript
// Backend - Enforce minimum completeness
if (applicationMethod === 'one_click') {
    const requiredFields = [
        user.profile.firstName,
        user.profile.lastName,
        user.profile.phone,
        user.profile.location?.city,
        profile.title,
        profile.resume,
        profile.skills && profile.skills.length > 0
    ];

    const missingFields = requiredFields.filter(field => !field);

    if (missingFields.length > 0) {
        return res.status(400).json({
            success: false,
            message: 'Profili juaj nuk është i kompletuar. Ju lutemi plotësoni të gjitha fushat e kërkuara.',
            requiredFields: ['firstName', 'lastName', 'phone', 'location', 'title', 'resume', 'skills']
        });
    }
}

// Frontend - Block application if < 60% complete
if (isProfileIncomplete) {
    return (
        <Button disabled>
            Plotësoni profilin (${profileCompleteness}%)
        </Button>
    );
}
```

---

### BUG #13: Report Submission Allows Duplicate Reports Within 24 Hours BUT Check is Flawed
**Severity:** HIGH
**Location:** `backend/src/routes/reports.js:141-154`
**Impact:** Users can spam reports by changing categories

**Problem:**
```javascript
// reports.js:141-154
const existingReport = await Report.findOne({
    reportedUser: reportedUserId,
    reportingUser: reportingUserId,
    createdAt: { $gte: twentyFourHoursAgo }
});
```

**Flaw:**
The check only looks for ANY report between the same users, but doesn't check the category!

**Attack:**
1. User reports person for "fake_cv"
2. Same day, reports same person for "spam_behavior"
3. Same day, reports same person for "harassment"
4. All three reports go through!

This allows report abuse/harassment even with the 24-hour check.

**Recommended Fix:**
```javascript
// Option 1: Limit total reports per user per day (any category)
const reportsToday = await Report.countDocuments({
    reportedUser: reportedUserId,
    reportingUser: reportingUserId,
    createdAt: { $gte: new Date().setHours(0,0,0,0) }
});

if (reportsToday >= 3) {
    return res.status(429).json({
        success: false,
        message: 'Keni arritur limitin ditor të raportimeve për këtë përdorues'
    });
}

// Option 2: Check for same category duplicate
const existingReport = await Report.findOne({
    reportedUser: reportedUserId,
    reportingUser: reportingUserId,
    category: category, // Add category check
    createdAt: { $gte: twentyFourHoursAgo }
});
```

---

## MEDIUM Priority Bugs

### BUG #14: Search Query Injection - Empty Search Returns All Jobs
**Severity:** MEDIUM
**Location:** `backend/src/routes/jobs.js:168`, `backend/src/models/Job.js:389-391`
**Impact:** Performance degradation, unintended data exposure

**Problem:**
```javascript
// Job.js:389-391
// Text search
if (searchQuery) {
    query.$text = { $search: searchQuery };
}
```

If `searchQuery` is empty string `""`, the condition `if (searchQuery)` passes and adds `$text` search with empty string, which might behave unexpectedly.

**Recommended Fix:**
```javascript
if (searchQuery && searchQuery.trim().length > 0) {
    query.$text = { $search: searchQuery };
}
```

---

### BUG #15: Application Count Increment Not Atomic - Race Condition
**Severity:** MEDIUM
**Location:** `backend/src/models/Application.js:270-281`
**Impact:** Inaccurate application counts on job listings

**Problem:**
```javascript
// Application.js:270-281
applicationSchema.pre('save', async function(next) {
    if (this.isNew) {
        try {
            const Job = mongoose.model('Job');
            await Job.findByIdAndUpdate(this.jobId, { $inc: { applicationCount: 1 } });
        } catch (error) {
            console.error('Error incrementing job application count:', error);
        }
    }
    next();
});
```

**Issue:**
If the increment fails (error caught and logged), the application is still saved but the count doesn't increment. Over time, counts drift from reality.

**Recommended Fix:**
```javascript
// Make count increment part of the transaction
applicationSchema.pre('save', async function(next) {
    if (this.isNew) {
        const Job = mongoose.model('Job');
        const result = await Job.findByIdAndUpdate(
            this.jobId,
            { $inc: { applicationCount: 1 } },
            { new: true }
        );

        if (!result) {
            return next(new Error('Failed to update job application count'));
        }
    }
    next();
});
```

---

### BUG #16: Withdrawn Applications Still Count Toward Application Count
**Severity:** MEDIUM
**Location:** `backend/src/routes/applications.js:585-586`
**Impact:** Misleading application statistics

**Problem:**
When a user withdraws an application:
```javascript
// applications.js:585
await application.withdraw(reason);
```

The `applicationCount` on the job is NOT decremented!

**Scenario:**
- Job has 50 applications
- 20 users withdraw their applications
- Job still shows "50 applications" instead of "30 applications"
- Misleading to employers

**Recommended Fix:**
```javascript
// Application.js - Add to withdraw method
applicationSchema.methods.withdraw = async function(reason = '') {
    this.withdrawn = true;
    this.withdrawnAt = new Date();
    if (reason) {
        this.withdrawalReason = reason;
    }

    // Decrement job application count
    const Job = mongoose.model('Job');
    await Job.findByIdAndUpdate(this.jobId, { $inc: { applicationCount: -1 } });

    return this.save();
};
```

---

### BUG #17: Employer Profile Update - Verified Employers Can Change Company Name
**Severity:** MEDIUM
**Location:** `backend/src/routes/users.js:236-256`
**Impact:** Verified companies can rebrand to impersonate others

**Problem:**
```javascript
// users.js:236-246
if (user.userType === 'employer' && employerProfile) {
    if (user.profile.employerProfile.verified) {
        // Only allow certain fields to be updated for verified employers
        const allowedFields = ['description', 'website'];
        Object.keys(employerProfile).forEach(key => {
            if (allowedFields.includes(key)) {
                user.profile.employerProfile[key] = employerProfile[key];
            }
        });
    }
}
```

**Good:** Prevents changing core fields for verified employers.

**Problem:** Unverified employers can change `companyName`, `industry`, `companySize` at will, BUT once verified, these fields are locked. However, what if a legitimate company needs to update their name after a rebrand?

Also, what prevents an unverified employer from changing their name to match a verified company?

**Scenario:**
1. Employer "ABC Tech" gets verified
2. New employer registers as "ABC Tech" (duplicate name)
3. Confusion for jobseekers

**Recommended Fix:**
```javascript
// Add unique company name validation
if (employerProfile.companyName && !user.profile.employerProfile.verified) {
    const duplicateName = await User.findOne({
        'profile.employerProfile.companyName': employerProfile.companyName,
        'profile.employerProfile.verified': true,
        _id: { $ne: user._id }
    });

    if (duplicateName) {
        return res.status(400).json({
            success: false,
            message: 'Emri i kompanisë është tashmë i regjistruar dhe i verifikuar nga një kompani tjetër'
        });
    }
}
```

---

### BUG #18: Notification Delivery Channel Ignored - Always In-App Only
**Severity:** MEDIUM
**Location:** `backend/src/models/Notification.js:55-59, 69-76`
**Impact:** Users miss important notifications via email

**Problem:**
Notification model has `deliveryChannel` field:
```javascript
// Notification.js:55-59
deliveryChannel: {
    type: String,
    enum: ['in-app', 'email', 'both'],
    default: 'in-app'
},
```

And email tracking fields:
```javascript
// Notification.js:69-76
emailSent: {
    type: Boolean,
    default: false
},
emailSentAt: {
    type: Date
}
```

**BUT:** Nowhere in the codebase is `deliveryChannel === 'email'` or `'both'` actually handled!

Notifications are created but emails are never sent based on this field.

**Impact:**
- Critical notifications (hired, rejected) only show in-app
- Users who don't log in regularly miss important updates
- `emailSent` field always stays `false`

**Recommended Fix:**
```javascript
// After creating notification
notificationSchema.post('save', async function(doc) {
    if (doc.deliveryChannel === 'email' || doc.deliveryChannel === 'both') {
        // Send email asynchronously
        setImmediate(async () => {
            try {
                const user = await mongoose.model('User').findById(doc.userId);
                await resendEmailService.sendNotificationEmail(user, doc);

                doc.emailSent = true;
                doc.emailSentAt = new Date();
                await doc.save();
            } catch (error) {
                console.error('Failed to send notification email:', error);
            }
        });
    }
});
```

---

### BUG #19: Job Recommendations Include User's Own Saved Jobs
**Severity:** MEDIUM
**Location:** `backend/src/routes/jobs.js:244-272`
**Impact:** Pointless recommendations, poor user experience

**Problem:**
```javascript
// jobs.js:271
_id: { $nin: savedJobs.map(job => job._id) } // Exclude already saved jobs
```

The recommendations exclude saved jobs, which is GOOD. But the fallback recommendations (lines 414-425) do NOT exclude saved jobs:

```javascript
// jobs.js:414-423
const fallbackJobs = await Job.find({
    isDeleted: false,
    status: 'active',
    expiresAt: { $gt: new Date() },
    _id: { $nin: excludeIds }  // Only excludes personalized recommendations
})
```

**Scenario:**
- User has 10 saved jobs
- Personalized recommendations return 3 jobs
- Fallback fetches 7 more jobs to reach limit of 10
- 2 of those 7 fallback jobs are from user's saved jobs
- User sees jobs they already saved as "recommendations"

**Recommended Fix:**
```javascript
// Include saved jobs in exclusion list
const excludeIds = recommendations.map(job => job._id);
const savedJobIds = (user.savedJobs || []).map(id => id.toString());

const fallbackJobs = await Job.find({
    isDeleted: false,
    status: 'active',
    expiresAt: { $gt: new Date() },
    _id: { $nin: [...excludeIds, ...savedJobIds] }
})
```

---

### BUG #20: Phone Number Validation Inconsistent Between Routes
**Severity:** MEDIUM
**Location:** `backend/src/routes/users.js:73-74, 113-114`, `backend/src/routes/verification.js:192`
**Impact:** Users can't register/update with valid international numbers

**Problem:**
Three different phone validations:
```javascript
// users.js:73-74
.matches(/^\+355\d{8,9}$/)

// users.js:113-114
.matches(/^\+355\d{8,9}$/)

// verification.js:192 (in error message)
message: 'Numri i telefonit duhet të jetë në formatin +355XXXXXXXX'
```

**Issues:**
1. Hardcoded to Albanian numbers only (+355)
2. Inconsistent length validation (8-9 digits vs. 8 digits)
3. Can't support international job seekers or employers
4. Regex in User model is different:

```javascript
// User.js:242
match: [/^\+\d{8,}$/, 'Numri i telefonit duhet të ketë të paktën 8 shifra']
```

This allows ANY country code, but the routes block it!

**Recommended Fix:**
```javascript
// Standardize phone validation
const PHONE_REGEX = /^\+\d{10,15}$/; // International format, 10-15 digits after +

// Use everywhere
body('phone')
    .optional()
    .matches(PHONE_REGEX)
    .withMessage('Numri i telefonit duhet të jetë në format ndërkombëtar (+XXX...)')
```

---

## LOW Priority Bugs

### BUG #21: Sort Order Validation Missing - Invalid Sort Values Accepted
**Severity:** LOW
**Location:** Multiple routes (e.g., `backend/src/routes/jobs.js:102`, `applications.js:189`)
**Impact:** Unexpected sort behavior, potential errors

**Problem:**
```javascript
// jobs.js:102
sortOrder = 'desc'
```

Default is 'desc', but if user sends `sortOrder=invalid`, it's not validated and might cause issues.

**Recommended Fix:**
```javascript
const sortOrder = ['asc', 'desc'].includes(req.query.sortOrder) ? req.query.sortOrder : 'desc';
```

---

### BUG #22: TODO Comments in Production Code
**Severity:** LOW
**Location:** `backend/src/routes/reports.js:675`
**Impact:** Placeholder data in production

**Problem:**
```javascript
// reports.js:675
averageResolutionTime: '2.5 ditë' // TODO: Calculate actual average
```

This returns hardcoded fake data to admins. While not critical, it misleads admins about actual performance metrics.

**Recommended Fix:**
```javascript
// Calculate real average
const resolvedReports = await Report.find({
    status: 'resolved',
    'resolution.resolvedAt': { $exists: true }
});

const totalTime = resolvedReports.reduce((sum, report) => {
    const time = report.resolution.resolvedAt - report.createdAt;
    return sum + time;
}, 0);

const avgMs = totalTime / resolvedReports.length;
const avgDays = Math.round(avgMs / (1000 * 60 * 60 * 24) * 10) / 10;

averageResolutionTime: `${avgDays} ditë`;
```

---

## Bug Summary by Category

### Data Integrity (7 bugs)
- BUG #1: Expired jobs showing (CRITICAL)
- BUG #2: Duplicate applications (CRITICAL)
- BUG #4: Orphaned records (CRITICAL)
- BUG #15: Application count race condition (MEDIUM)
- BUG #16: Withdrawn apps count (MEDIUM)
- BUG #18: Notification delivery (MEDIUM)
- BUG #20: Phone validation (MEDIUM)

### Business Logic (8 bugs)
- BUG #3: Employer self-apply (CRITICAL)
- BUG #5: Invalid status transitions (CRITICAL)
- BUG #6: Tier changes without payment (HIGH)
- BUG #8: Email verification not enforced (HIGH)
- BUG #12: Incomplete profile applications (HIGH)
- BUG #17: Company name changes (MEDIUM)
- BUG #19: Recommendations include saved jobs (MEDIUM)
- BUG #22: TODO in production (LOW)

### Security & Access Control (3 bugs)
- BUG #11: Suspended user access (HIGH)
- BUG #13: Report spam (HIGH)
- BUG #9: View count inflation (HIGH)

### User Experience (4 bugs)
- BUG #7: Pagination math (HIGH)
- BUG #10: Lost notifications (HIGH)
- BUG #14: Empty search query (MEDIUM)
- BUG #21: Sort validation (LOW)

---

## Recommended Fix Priority

### Week 1 (Critical - Fix Immediately)
1. **BUG #1:** Re-enable job expiration filters
2. **BUG #4:** Implement cascading deletes
3. **BUG #3:** Prevent employer self-apply
4. **BUG #5:** Add application status validation
5. **BUG #2:** Fix duplicate application race condition

### Week 2 (High Priority)
6. **BUG #11:** Check user status in auth middleware
7. **BUG #6:** Prevent free tier upgrades
8. **BUG #12:** Enforce profile completeness
9. **BUG #10:** Fix notification reliability
10. **BUG #8:** Enforce email verification

### Week 3 (Medium Priority)
11. **BUG #7:** Fix pagination validation
12. **BUG #13:** Improve report spam prevention
13. **BUG #9:** Add view count cooldown
14. **BUG #16:** Decrement count on withdrawal
15. **BUG #18:** Implement email delivery

### Week 4 (Low Priority + Cleanup)
16. **BUG #14-22:** Remaining medium/low bugs

---

## Testing Recommendations

### For Each Bug Fix:
1. **Unit Test:** Test the specific function/method
2. **Integration Test:** Test the full API endpoint
3. **E2E Test:** Test from UI perspective
4. **Regression Test:** Ensure fix doesn't break other features

### High-Risk Areas to Test Thoroughly:
- Application submission flow (multiple bugs)
- Job expiration logic (affects whole system)
- User deletion/suspension (cascading effects)
- Payment/pricing logic (financial impact)

---

## Monitoring Recommendations

### Add Alerts For:
1. Expired jobs showing in search (BUG #1)
2. Duplicate application attempts (BUG #2)
3. Failed notification deliveries (BUG #10)
4. Orphaned record detection (BUG #4)
5. Suspended users with active sessions (BUG #11)

### Metrics to Track:
- Application count accuracy (compare actual count vs. stored count)
- View count inflation rate (detect bot activity)
- Notification delivery success rate
- User suspension effectiveness (are suspended users blocked immediately?)

---

**Report Complete**
**Next Step:** Prioritize CRITICAL bugs and begin fixes immediately.

For questions or implementation assistance, refer to specific bug numbers in this report.
