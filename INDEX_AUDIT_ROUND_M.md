# Mongoose index audit — Round M

Date: 2026-05-16
Scope: every model in `backend/src/models/`. Routes searched: `backend/src/routes/**` + `services/**` + `lib/**` + `workers/**`.

## Models in scope

- Application.js
- BulkNotification.js
- BusinessCampaign.js
- CandidateMatch.js
- ConfigurationAudit.js
- Event.js
- File.js
- Job.js
- JobQueue.js
- Location.js (skim — lookup table)
- Notification.js
- PaymentEvent.js
- PricingRule.js
- QuickUser.js
- Report.js
- ReportAction.js
- RevenueAnalytics.js
- SystemConfiguration.js (skim — lookup table)
- SystemHealth.js (skim — internal monitoring)
- User.js
- WorkerStatus.js (skim — small operational table)

## Summary (counts)

- SAFE to add: **7**
- NEEDS DISCUSSION: **3**
- Already well-indexed: **14 models**

---

## 🟢 SAFE to add — obvious wins

### User.email + isDeleted (or partial on isDeleted=false)
**Where queried:** `routes/auth.js:885` — `User.findOne({ email, isDeleted: { $ne: true } })`; also `routes/auth.js:601,342,463` plus password-reset/email-verification lookups by `email`.
**Frequency:** hot — every login, register, password-reset, magic-link.
**Current state:** `email` has the implicit unique index (great). The `isDeleted: {$ne:true}` clause forces a fetch of the matched doc to filter — usually fine because email is unique, but the existing standalone `isDeleted` index is rarely the chosen path.
**Proposed index:** none required — the unique email index already does the work. **No-op finding, listed for completeness so we don't add a redundant compound.** Skip.

### User: `emailVerificationToken` and `passwordResetToken`
**Where queried:** `routes/auth.js:946` — `User.findOne({ emailVerificationToken: ..., emailVerificationExpires: { $gt: now } })`; analogous `passwordResetToken` lookup at `routes/users.js:440`.
**Frequency:** medium — every signup verify click + password reset.
**Proposed index:** `userSchema.index({ emailVerificationToken: 1 }, { sparse: true })` and `userSchema.index({ passwordResetToken: 1 }, { sparse: true })`.
**Why safe:** Sparse (most users null) → tiny index; query is `findOne` by exact token → forces a COLLSCAN today across all users. Clear hot path on every verify/reset click.

### Job: `paymentStatus` + `paymentInitiatedAt` (payment-reminder + timeout workers)
**Where queried:** `workers/paymentReminderWorker` + `workers/paymentTimeoutWorker` (and `routes/payments.js` countDocuments) scan jobs `paymentStatus: 'pending', paymentInitiatedAt: { $lt: ... }` periodically.
**Frequency:** medium (cron every few minutes) — full collection scan today; will scale poorly as Job count grows.
**Proposed index:** `jobSchema.index({ paymentStatus: 1, paymentInitiatedAt: 1 })`.
**Why safe:** Highly selective (almost all jobs are `paid`, only the small `pending_payment` slice is touched); cron-only writer, query shape stable.

### Application: `jobSeekerId` + `withdrawn`
**Where queried:** `routes/applications.js:127,272,318` — `Application.find/findOne({ jobSeekerId: req.user._id, withdrawn: false, ... })`. This is the "have I applied?" and "my applications" hot path.
**Frequency:** hot — every job-detail page view by a logged-in jobseeker (to compute the "Aplikuar" badge) and the My Applications dashboard.
**Current state:** there is `{ jobSeekerId: 1, appliedAt: -1 }` and `{ jobId: 1, jobSeekerId: 1 }` (partial unique). Neither is ideal for `(jobSeekerId, withdrawn:false)` filters.
**Proposed index:** `applicationSchema.index({ jobSeekerId: 1, withdrawn: 1, appliedAt: -1 })`.
**Why safe:** strict superset of an existing index pattern; covers existing `{jobSeekerId, appliedAt}` queries plus the withdrawn filter; same field types, no semantic change.

### Notification: `userId` + `read` + `createdAt`
**Where queried:** `routes/notifications.js:53–63` and `Notification.getUserNotifications` — filters by `userId` plus optional `read: false`, then sorts by `createdAt: -1`.
**Frequency:** hot — every authenticated page load polls unread-count + recent notifications.
**Current state:** has `{ userId: 1, createdAt: -1 }` and `{ userId: 1, read: 1 }` separately; neither covers both filter + sort together.
**Proposed index:** `notificationSchema.index({ userId: 1, read: 1, createdAt: -1 })`.
**Why safe:** Existing `{userId, read}` becomes redundant once added (we can drop it later); shape exactly matches the unread-only-with-recency query.

### Job: `paymentReminderLevel` (worker scan)
**Where queried:** `workers/paymentReminderWorker` selects jobs by `status: 'pending_payment', paymentReminderLevel: { $lt: 3 }, paymentInitiatedAt: { $lt: cutoff }`.
**Frequency:** medium (cron) — same workload as above, but the level<3 filter alone is selective once most stuck jobs reach level 3.
**Proposed index:** **covered by** the `{ paymentStatus: 1, paymentInitiatedAt: 1 }` index above; the existing `paymentReminderLevel` is best as the leading filter only if Mongo doesn't already trim to the small `pending_payment` slice. Defer to single-field on `paymentReminderLevel` only if profiling shows it.
**Why safe:** N/A — covered. Listed so reviewers don't re-add.

### CandidateMatch — already covered, but note one gap
**Where queried:** `services/candidateMatching.js:256` — `CandidateMatch.find({ jobId, expiresAt: { $gt: now } }).sort({ matchScore: -1 })`.
**Current state:** has `{ jobId: 1, matchScore: -1 }` — perfect for the sort. The `expiresAt: {$gt: now}` is a residual filter on a small page; with TTL pruning the collection stays small. **No new index needed.**

### Report: `reportedJob` (already has single-field index via `index: true`)
**Status:** Already indexed on the field declaration (`reportedJob: { ..., index: true }`). No action.

### PaymentEvent: hot-path covered
Already has `{ jobId, event, createdAt }` and `{ createdAt }`. No new index.

---

## 🟡 NEEDS DISCUSSION — could be useful, has trade-offs

### Job.status + isDeleted (partial index for the "active" subset)
**Observed query shapes (very hot):**
- `Job.searchJobs` builds `{ isDeleted:false, status:'active', expiresAt:{$gt:now} }` plus dynamic filters and sorts by `postedAt:-1`. Already covered by the existing compound `{ isDeleted:1, status:1, expiresAt:-1, tier:-1, postedAt:-1 }` — good.
- However `routes/admin.js` does `Job.countDocuments({ status:'active' })`, `Job.find({ employerId, status })`, and several `aggregate` group-bys on `status`. Those use `{ employerId, status }` (exists) and `{ tier, status }` (exists) and `{ isDeleted: 1 }`.
**Possible add:** A partial index `{ status: 1, postedAt: -1 }` with `partialFilterExpression: { isDeleted: false }` could be cheaper than the existing 5-field compound for some admin queries. But it overlaps existing indexes and risks Mongo planner choosing the wrong one.
**Recommendation:** Don't add now. Profile real slow queries first.

### User employer dashboard filters
**Observed:** `routes/admin.js` filters users by `{ userType, status, isDeleted: { $ne: true } }` + regex search on `email/profile.firstName/profile.lastName/profile.employerProfile.companyName`. The regex `$or` will never use indexes anyway (no anchored `^`). Adding `{ userType: 1, status: 1, createdAt: -1 }` would help the non-search path (admin user list).
**Possible add:** `userSchema.index({ userType: 1, status: 1, createdAt: -1 })`.
**Trade-off:** Three single-field indexes (`userType`, `status`, `isDeleted`) already exist. The compound is more useful for the paginated admin list but adds another index to maintain on every user write. Discuss volume.
**Recommendation:** Add if admin user-list is slow today; defer if it's not on the hot path. (User table is small relative to Jobs.)

### Job employer dashboard sorting
**Observed:** `routes/jobs.js:764` — `Job.find({ employerId, isDeleted:false, status? }).sort({ postedAt|createdAt|expiresAt|viewCount|applicationCount: ±1 })`.
**Current state:** `{ employerId: 1, status: 1 }` exists. Sort fields (`viewCount`, `applicationCount`, `expiresAt`) are not in the index → in-memory sort for small employer-scoped result sets (usually <100 docs, so fine).
**Recommendation:** Only worth a compound if profiling shows in-memory sort exceeding 32MB on a single employer. Defer.

---

## ✅ Already well-indexed

- **Application** — `{jobId, appliedAt}`, `{jobSeekerId, appliedAt}`, `{employerId, status}`, unique `{jobId, jobSeekerId}` partial. Adding the `withdrawn` compound (above) is the only gap.
- **Job** — five compound indexes covering the listing/embedding/employer paths. Slug unique. expiresAt covered by the primary 5-field compound.
- **CandidateMatch** — `{jobId, matchScore}`, unique `{jobId, candidateId}`, TTL on `expiresAt`, single-field indexes on `contacted`/`matchScore`/`calculatedAt`.
- **JobQueue** — covers worker polling `{status, priority, createdAt}`, dedup partial unique, TTL on completed/failed.
- **Notification** — `{userId, createdAt}`, `{userId, read}`, TTL on `createdAt`. The proposed 3-field compound supersedes `{userId,read}`.
- **Event** — `{userId, createdAt}`, `{quickUserId, createdAt}`, `{jobId, type, createdAt}`, TTL.
- **PaymentEvent** — `{jobId, event, createdAt}` and `{createdAt}`. Good.
- **Report** — `{status, priority, createdAt}`, `{assignedAdmin, status}`, `{category, createdAt}`, `{reportingUser, createdAt}`, `{reportedUser, status}` plus single-field declarations. Comprehensive.
- **ReportAction** — six compounds covering report/admin/target/action workflows.
- **BulkNotification** — `{createdBy, createdAt}` + status/sentAt/template/audience indexes. Volume is low (admin-only writes), sufficient.
- **BusinessCampaign** — `{status, type}`, `{startDate, endDate}`, `{isActive}`. Low write volume.
- **ConfigurationAudit** — five compounds. Write-only audit table, scanned only by admin.
- **PricingRule** — `{isActive, priority}`, `{category, isActive}`, `{validFrom, validTo}`. Small table.
- **QuickUser** — eight indexes including `{location, interests, isActive}`, `{isActive, lastNotifiedAt}`. The notification-matching path is well covered.
- **RevenueAnalytics** — daily granularity, tiny table; unique dateString + `date:-1` is sufficient.
- **File** — `{uploadedBy, fileCategory}` — only access pattern.
- **Location** — `{isActive, jobCount}` + unique city. Small lookup table.
- **SystemConfiguration** / **SystemHealth** / **WorkerStatus** — lookup/operational tables, indexed appropriately for their tiny volumes; TTLs in place where relevant.
- **User** — `userType`, `status`, `isDeleted`, `{isDeleted, deletedAt}`, `'profile.location.city'`. Only gap is the two token-lookup indexes above.

---

## Proposed deltas — copy/paste-ready

```js
// User.js — add at bottom, alongside existing index() calls
userSchema.index({ emailVerificationToken: 1 }, { sparse: true });
userSchema.index({ passwordResetToken: 1 }, { sparse: true });

// Job.js — add to the payment-tracking index block
jobSchema.index({ paymentStatus: 1, paymentInitiatedAt: 1 });

// Application.js — add to the index block
applicationSchema.index({ jobSeekerId: 1, withdrawn: 1, appliedAt: -1 });

// Notification.js — add and drop the now-redundant single-purpose one
notificationSchema.index({ userId: 1, read: 1, createdAt: -1 });
// (optional follow-up: drop notificationSchema.index({ userId: 1, read: 1 }) — redundant prefix)
```

Five indexes total, all single-field or compound on stable read shapes. No text/wildcard/geo additions.
