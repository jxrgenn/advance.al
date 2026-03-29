# Feature Inventory -- advance.al

> Generated: 2026-03-29
> Source: Backend route files (exhaustive endpoint catalogue)
> Total features: 155

---

## Global / Infrastructure (No Auth Required)

### Health & System
- F-001: Health check endpoint with DB/Redis status (GET /health)
- F-002: Welcome/API info page (GET /)
- F-003: 404 handler for unknown routes (all unmatched paths)
- F-004: Global error handler -- Mongoose validation, duplicate key, JWT errors, sanitized production messages
- F-005: Maintenance mode middleware -- returns 503 for non-admin routes when enabled (middleware on /api)
- F-006: Rate limiting -- global API rate limit (100 req/15 min per IP, skipped in dev)
- F-007: CORS -- origin whitelist with Vercel preview URL support
- F-008: Helmet security headers with CSP
- F-009: Request timeout (30s) to prevent hung connections
- F-010: Graceful shutdown with interval cleanup on SIGTERM/SIGINT
- F-011: Periodic task: auto-lift expired user suspensions (every 15 min)
- F-012: Periodic task: expire active jobs past expiresAt (every hour)
- F-013: Periodic task: data retention policies (daily)
- F-014: Periodic task: purge soft-deleted accounts after 30-day retention (daily)
- F-015: Startup validation -- fail-fast on missing JWT_SECRET, JWT_REFRESH_SECRET, FRONTEND_URL (prod)
- F-016: Sentry error tracking integration (production)

---

## Guest / Public (No Auth)

### Authentication
- F-017: Initiate registration -- validate data, cache it, send 6-digit email verification code (POST /api/auth/initiate-registration)
- F-018: Complete registration -- verify code, create account from cached data, issue JWT + refresh token (POST /api/auth/register)
- F-019: Login with email/password -- returns JWT + refresh token, checks suspension/ban/deleted/pending_verification (POST /api/auth/login)
- F-020: Refresh access token using refresh token with rotation (POST /api/auth/refresh)
- F-021: Forgot password -- send password reset email with token link, per-email rate limit (3/hour) (POST /api/auth/forgot-password)
- F-022: Reset password using token -- invalidates all refresh tokens (POST /api/auth/reset-password)
- F-023: Auth rate limiter -- 15 attempts per 15 min per IP in production

### Verification (Standalone)
- F-024: Request verification code via email or SMS (POST /api/verification/request)
- F-025: Verify the provided 6-digit code with timing-safe comparison (POST /api/verification/verify)
- F-026: Validate verification token before registration (POST /api/verification/validate-token)
- F-027: Resend verification code with 1-minute cooldown (POST /api/verification/resend)
- F-028: Check verification status for an identifier (GET /api/verification/status/:identifier)

### Jobs (Public Browsing)
- F-029: Browse/search all active jobs with filters -- category, city, jobType, salary range, remote, keyword, tags, pagination, sorting (GET /api/jobs)
- F-030: View single job details -- increments view count (GET /api/jobs/:id)
- F-031: Get similar jobs for a job -- embedding-based similarity with fallback to category matching (GET /api/jobs/:id/similar)

### Companies (Public)
- F-032: Browse all companies with search, filters (industry, city, companySize), pagination, sorting (GET /api/companies)
- F-033: View single company profile with active jobs and job statistics (GET /api/companies/:id)
- F-034: Get company's job postings with pagination (GET /api/companies/:id/jobs)

### Locations
- F-035: Get all active locations (cached 1 hour) (GET /api/locations)
- F-036: Get popular locations by job count (cached 10 min) (GET /api/locations/popular)

### Platform Statistics
- F-037: Get public platform stats -- total jobs, active jobs, companies, job seekers, applications, recent jobs (cached 5 min) (GET /api/stats/public)

### Configuration (Public)
- F-038: Get public configuration settings for frontend (cached 5 min) (GET /api/configuration/public)

### Quick Users (Email-only Signups)
- F-039: Create quick user for job notifications -- supports optional CV upload via multipart, sends welcome email, generates embedding, notifies about matching jobs (POST /api/quickusers)
- F-040: Unsubscribe quick user using token (POST /api/quickusers/unsubscribe)
- F-041: Track email click for analytics (POST /api/quickusers/track-click)
- F-042: Update quick user notification preferences (token-protected) (PUT /api/quickusers/:id/preferences)

---

## Authenticated User (Any Role)

### Authentication (Authenticated)
- F-043: Get current user info (GET /api/auth/me)
- F-044: Change password -- requires current password, validates complexity (PUT /api/auth/change-password)
- F-045: Send email verification code to current user (POST /api/auth/send-verification)
- F-046: Verify email with 6-digit code (POST /api/auth/verify-email)
- F-047: Logout -- revoke refresh token(s) (POST /api/auth/logout)

### Profile (Any Authenticated User)
- F-048: Get current user's profile (GET /api/users/profile)
- F-049: Update current user's profile -- supports jobseeker and employer fields with validation (PUT /api/users/profile)
- F-050: Delete user account (soft delete) -- requires password confirmation, cascades to close employer's jobs (DELETE /api/users/account)
- F-051: Get user statistics for profile dashboard (GET /api/users/stats)
- F-052: Serve uploaded resume file (authenticated, supports ?token= for new-tab viewing) (GET /api/users/resume/:filename)

### GDPR Compliance (Any Authenticated User)
- F-053: Record cookie consent (POST /api/users/cookie-consent)
- F-054: Export all personal data (GDPR right to data portability) -- includes profile, applications, saved jobs, posted jobs (GET /api/users/export)

### Notifications (Any Authenticated User)
- F-055: Get user's notifications with pagination and unread filter (GET /api/notifications)
- F-056: Get count of unread notifications (GET /api/notifications/unread-count)
- F-057: Mark single notification as read (PATCH /api/notifications/:id/read)
- F-058: Mark all notifications as read (PATCH /api/notifications/mark-all-read)
- F-059: Delete a notification (DELETE /api/notifications/:id)

### Reports (Any Authenticated User)
- F-060: Submit a report against a user or job -- categories: fake_cv, inappropriate_content, suspicious_profile, spam, impersonation, harassment, fake_job, unprofessional, other (POST /api/reports)
- F-061: Get user's own submitted reports with pagination (GET /api/reports)

### Application Messaging (Application Participants)
- F-062: Send message about application -- requires email verification, types: text, interview_invite, offer, rejection (POST /api/applications/:id/message)
- F-063: Get single application details -- marks as viewed for employer, marks messages as read (GET /api/applications/:id)

---

## Jobseeker

### Job Recommendations
- F-064: Get personalized job recommendations using embedding-based matching (GET /api/jobs/recommendations)

### Applications
- F-065: Apply for a job -- one-click or custom form, requires email verification, prevents duplicate applications (POST /api/applications/apply)
- F-066: Get list of job IDs user has applied to (GET /api/applications/applied-jobs)
- F-067: Get job seeker's applications with filters, pagination, sorting (GET /api/applications/my-applications)
- F-068: Withdraw application -- prevents withdrawal of hired/rejected applications (DELETE /api/applications/:id)

### Resume / CV Management
- F-069: Upload resume/CV file -- Cloudinary in production, local disk in dev, 5MB limit, PDF/DOCX only (POST /api/users/upload-resume)
- F-070: Delete resume/CV from profile -- cleans up Cloudinary or local file (DELETE /api/users/resume)
- F-071: Upload and parse resume with AI -- extracts skills, education, work history for profile preview (POST /api/users/parse-resume)

### AI CV Generation
- F-072: Generate CV from natural language -- uses GPT-4o to extract structured data, generates DOCX, updates profile, regenerates embedding (POST /api/cv/generate)
- F-073: Download generated CV file (GET /api/cv/download/:fileId)
- F-074: Preview generated CV -- converts DOCX to HTML for in-browser viewing with XSS sanitization (GET /api/cv/preview/:fileId)
- F-075: Get current user's AI-generated CV data (GET /api/cv/my-cv)

### Profile Photo
- F-076: Upload profile photo -- Cloudinary in production, 2MB limit, JPEG/PNG/WebP, magic-byte validation (POST /api/users/upload-profile-photo)

### Work Experience
- F-077: Add work experience entry with validation (POST /api/users/work-experience)
- F-078: Update work experience entry (PUT /api/users/work-experience/:experienceId)
- F-079: Delete work experience entry (DELETE /api/users/work-experience/:experienceId)

### Education
- F-080: Add education entry with validation (POST /api/users/education)
- F-081: Update education entry (PUT /api/users/education/:educationId)
- F-082: Delete education entry (DELETE /api/users/education/:educationId)

### Saved Jobs
- F-083: Check saved status for multiple jobs in bulk (POST /api/users/saved-jobs/check-bulk)
- F-084: Save a job (POST /api/users/saved-jobs/:jobId)
- F-085: Unsave a job (DELETE /api/users/saved-jobs/:jobId)
- F-086: Get user's saved jobs with pagination (GET /api/users/saved-jobs)
- F-087: Check if a specific job is saved (GET /api/users/saved-jobs/check/:jobId)

---

## Employer

### Job Management
- F-088: Create a new job posting -- requires verified employer, checks posting freeze, validates 14 categories, salary, location, custom questions, auto-generates embedding (POST /api/jobs)
- F-089: Update job posting -- owner-only, validates all fields, re-generates embedding on content change (PUT /api/jobs/:id)
- F-090: Delete job posting (soft delete) -- owner-only (DELETE /api/jobs/:id)
- F-091: Update job status -- close or reactivate, owner-only (PATCH /api/jobs/:id/status)
- F-092: Renew/repost an expired or closed job with fresh dates (POST /api/jobs/:id/renew)
- F-093: Get employer's own job postings with filters and pagination (GET /api/jobs/employer/my-jobs)

### Application Management
- F-094: Get applications for a specific job -- owner-only, with pagination and filtering (GET /api/applications/job/:jobId)
- F-095: Get all applications across all employer's jobs with pagination and filtering (GET /api/applications/employer/all)
- F-096: Update application status -- validated transitions: pending->viewed/shortlisted/rejected, viewed->shortlisted/rejected, shortlisted->hired/rejected (PATCH /api/applications/:id/status)

### Company Logo
- F-097: Upload company logo -- Cloudinary in production, 2MB limit, JPEG/PNG/WebP, magic-byte validation, cleans up old file (POST /api/users/upload-logo)

### Public Profile Viewing
- F-098: View job seeker's public profile -- for employers viewing through applications (GET /api/users/public-profile/:id)

### Candidate Matching (Paid Feature)
- F-099: Get top matching candidates for a job -- embedding-based matching, requires payment access (GET /api/matching/jobs/:jobId/candidates)
- F-100: Purchase candidate matching access for a job -- mock payment (Paysera planned) (POST /api/matching/jobs/:jobId/purchase)
- F-101: Track when employer contacts a candidate -- email/phone/whatsapp (POST /api/matching/track-contact)
- F-102: Check if employer has access to candidate matching for a job (GET /api/matching/jobs/:jobId/access)

---

## Admin

### Dashboard & Analytics
- F-103: Get comprehensive dashboard statistics -- users, jobs, applications, employers, growth, categories, cities, recent activity, revenue (GET /api/admin/dashboard-stats)
- F-104: Get platform analytics with trends -- user/job/application growth charts, conversion rates, top jobs, engagement metrics (GET /api/admin/analytics)
- F-105: Get system health metrics -- DB response time, storage usage, email service status, error rates, uptime (GET /api/admin/system-health)
- F-106: Get detailed user insights -- distribution by type/location, registration trends, profile completion stats (GET /api/admin/user-insights)

### User Management
- F-107: Get all users with pagination, type filter, status filter, search (GET /api/admin/users)
- F-108: Manage user -- suspend (with duration), ban, activate, set/remove administrata status, soft delete (PATCH /api/admin/users/:userId/manage)
- F-109: Get employers pending verification with pagination (GET /api/users/admin/pending-employers)
- F-110: Verify or reject employer -- sends verification status email (PATCH /api/users/admin/verify-employer/:id)

### Job Management (Admin)
- F-111: Get all jobs with admin view -- filters by status, employer, search, pagination (GET /api/admin/jobs)
- F-112: Manage job -- approve, reject, feature (premium tier), remove feature (basic tier), soft delete (PATCH /api/admin/jobs/:jobId/manage)
- F-113: Approve or reject a pending job -- triggers embedding generation and matching notifications on approval (PATCH /api/admin/jobs/:id/approve)
- F-114: Get all jobs pending approval with pagination (GET /api/admin/jobs/pending)

### Embedding Management
- F-115: Get embedding system status -- coverage, job status counts, queue health, worker status, recent failures, debug status (GET /api/admin/embeddings/status)
- F-116: Get queue health and details with pagination (GET /api/admin/embeddings/queue)
- F-117: Get worker status and health -- alive/dead, success rates, memory usage, current tasks (GET /api/admin/embeddings/workers)
- F-118: Recompute all job embeddings -- queues all non-deleted jobs (POST /api/admin/embeddings/recompute-all)
- F-119: Retry all failed embedding jobs -- resets status and requeues (POST /api/admin/embeddings/retry-failed)
- F-120: Clear old completed/failed queue items by age (POST /api/admin/embeddings/clear-old-queue)
- F-121: Toggle debug logging for embedding system -- EMBEDDING, WORKER, or QUEUE categories (POST /api/admin/embeddings/toggle-debug)
- F-122: Manually queue a specific job for embedding generation (POST /api/admin/embeddings/queue-job/:jobId)
- F-123: Delete a specific queue item (DELETE /api/admin/embeddings/queue-item/:queueId)
- F-124: Backfill user embeddings -- regenerate for all jobseekers missing/failed (POST /api/admin/backfill-user-embeddings)
- F-125: Backfill job embeddings -- queue all active jobs missing embeddings (POST /api/admin/backfill-job-embeddings)

### Report Management
- F-126: Get all reports with filtering (status, priority, category, assigned admin, search), pagination, statistics breakdown (GET /api/reports/admin)
- F-127: Get reporting statistics -- totals, resolution rate, avg resolution time, top reported users (GET /api/reports/admin/stats)
- F-128: Get specific report details with action history and related reports for pattern detection (GET /api/reports/admin/:id)
- F-129: Update report status/priority/assignment, add admin notes (PUT /api/reports/admin/:id)
- F-130: Take action on reported user -- no_action, warning, temporary_suspension, permanent_suspension, account_termination (POST /api/reports/admin/:id/action)
- F-131: Reopen a resolved report for re-evaluation (POST /api/reports/admin/:id/reopen)

### Notification Management (Admin)
- F-132: Test job matching and notification system for a specific job (POST /api/notifications/test-job-match)
- F-133: Manually trigger daily digest (POST /api/notifications/send-daily-digest)
- F-134: Manually trigger weekly digest (POST /api/notifications/send-weekly-digest)
- F-135: Test welcome email sending for a quick user (POST /api/notifications/test-welcome-email)
- F-136: Get notification statistics for quick users -- frequency, location, interest distributions (GET /api/notifications/quickuser-stats)
- F-137: Manually send notification to specific quick user for a job (POST /api/notifications/manual-notify)
- F-138: Get list of users eligible to receive notification for a specific job (GET /api/notifications/eligible-users/:jobId)

### Bulk Notifications
- F-139: Create and send bulk notification -- targets: all, employers, jobseekers, admins, quick_users; channels: in-app, email; supports scheduling and templates (POST /api/bulk-notifications)
- F-140: Get bulk notification history with pagination and filters (GET /api/bulk-notifications)
- F-141: Get specific bulk notification details (GET /api/bulk-notifications/:id)
- F-142: Get saved notification templates (GET /api/bulk-notifications/templates/list)
- F-143: Create notification from template (POST /api/bulk-notifications/templates/:id/create)
- F-144: Delete bulk notification (only drafts/templates) (DELETE /api/bulk-notifications/:id)

### Quick User Management (Admin)
- F-145: Get quick user analytics overview (GET /api/quickusers/analytics/overview)
- F-146: Find quick users matching a job (POST /api/quickusers/find-matches)
- F-147: Get quick user by ID with stats (GET /api/quickusers/:id)

### Configuration Management
- F-148: Get all configuration settings organized by category (GET /api/configuration)
- F-149: Get pricing configuration -- standard, promoted, candidate viewing prices (GET /api/configuration/pricing)
- F-150: Update pricing configuration (PUT /api/configuration/pricing)
- F-151: Update specific configuration setting with audit trail (PUT /api/configuration/:id)
- F-152: Reset configuration setting to default value (POST /api/configuration/:id/reset)
- F-153: Get audit history for specific configuration (GET /api/configuration/audit/:id)
- F-154: Get recent configuration audit history with category/action filters (GET /api/configuration/audit)
- F-155: Get current system health status with history (GET /api/configuration/system-health)
- F-156: Initialize default configuration settings (POST /api/configuration/initialize-defaults)
- F-157: Toggle maintenance mode (POST /api/configuration/maintenance-mode)

### Business Control Panel
- F-158: Create marketing campaign -- flash_sale, referral, new_user_bonus, seasonal, industry_specific, bulk_discount (POST /api/business-control/campaigns)
- F-159: Get all campaigns with filtering, pagination, performance summary (GET /api/business-control/campaigns)
- F-160: Update campaign (PUT /api/business-control/campaigns/:id)
- F-161: Activate campaign (POST /api/business-control/campaigns/:id/activate)
- F-162: Pause campaign (POST /api/business-control/campaigns/:id/pause)
- F-163: Create pricing rule -- industry, location, demand_based, company_size, seasonal, time_based (POST /api/business-control/pricing-rules)
- F-164: Get all pricing rules with pagination and analytics (GET /api/business-control/pricing-rules)
- F-165: Update pricing rule (PUT /api/business-control/pricing-rules/:id)
- F-166: Toggle pricing rule active status (POST /api/business-control/pricing-rules/:id/toggle)
- F-167: Get main business dashboard -- revenue summary, active campaigns, trends, business intelligence (GET /api/business-control/analytics/dashboard)
- F-168: Get detailed revenue analytics with pricing and campaign performance (GET /api/business-control/analytics/revenue)
- F-169: Manual update of analytics data (POST /api/business-control/analytics/update)
- F-170: Emergency platform controls -- freeze/unfreeze posting, pause/reactivate all campaigns, reset pricing, pause platform (POST /api/business-control/platform/emergency)
- F-171: Get whitelisted employers (free posting) (GET /api/business-control/whitelist)
- F-172: Add employer to whitelist (free posting) (POST /api/business-control/whitelist/:employerId)
- F-173: Remove employer from whitelist (DELETE /api/business-control/whitelist/:employerId)
- F-174: Search employers for whitelist management (GET /api/business-control/employers/search)

---

## Summary by Role

| Role | Feature Count |
|------|---------------|
| Global/Infrastructure | 16 |
| Guest/Public | 22 |
| Any Authenticated User | 15 |
| Jobseeker | 24 |
| Employer | 15 |
| Admin | 72 |
| **Total** | **174** |

## Key Technical Features (Cross-Cutting)

- JWT authentication with refresh token rotation
- Role-based access control (jobseeker, employer, admin)
- Input validation via express-validator on all mutation endpoints
- XSS prevention via HTML stripping (stripHtml) on all user inputs
- Rate limiting per endpoint category (auth, notifications, reports, business controls, CV generation)
- MongoDB ObjectId validation middleware on all :id parameters
- Cloudinary file storage in production with local disk fallback in development
- Redis caching with in-memory fallback for sessions, configs, locations, stats
- OpenAI embedding-based job/candidate matching (text-embedding-3-small, 1536 dims)
- GPT-4o powered CV generation from natural language
- Email notifications via Resend API for all key events
- Soft delete pattern with 30-day retention before permanent purge
- GDPR compliance: data export, cookie consent tracking, account deletion
- Maintenance mode with admin bypass
- Sentry error reporting in production
