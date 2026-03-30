# PERF-STATE — advance.al Performance Optimization

## Current Phase: Phase 4 — Round 2 optimizations
## Last Updated: 2026-03-30

---

## System Overview
- **Backend:** Node.js/Express 5.1, MongoDB Atlas, Upstash Redis
- **Data scale:** 62 users, 110 jobs, 57 applications, 13 locations
- **149 API endpoints** mapped
- **Comprehensive indexes** already exist on all models

---

## Round 1 Optimizations Applied

### 1. Jobs listing — parallelize find + count
- **File:** `backend/src/routes/jobs.js` (lines 320-325)
- **Change:** Replaced sequential `await query.lean().exec()` then `await Job.countDocuments(countQuery)` with `Promise.all([query.lean().exec(), Job.countDocuments(countFilter)])`. Also eliminated duplicated filter logic by using `query.getFilter()`.
- **Before:** 172ms median
- **After:** 130ms median (24% faster)

### 2. Jobs single — add .lean() + fire-and-forget view increment
- **File:** `backend/src/routes/jobs.js` (lines 668-683)
- **Change:** Added `.lean()` to findOne, replaced `await job.incrementViewCount()` with fire-and-forget `Job.updateOne({ _id: job._id }, { $inc: { viewCount: 1 } }).catch(() => {})`
- **Before:** 168ms median
- **After:** 118ms median (30% faster)

### 3. Companies list — parallelize aggregate + count
- **File:** `backend/src/routes/companies.js` (line 123-126)
- **Change:** `Promise.all([User.aggregate(pipeline), User.countDocuments(matchQuery)])`
- **Before:** 127ms median
- **After:** 90ms median (29% faster)

### 4. Companies single — parallelize 3 queries + .lean() + .select()
- **File:** `backend/src/routes/companies.js` (lines 180-227)
- **Change:** Parallelized User.findOne + Job.find + Job.aggregate with Promise.all, added .lean() and .select() to all queries
- **Before:** 163ms median
- **After:** 125ms median (23% faster)

### 5. Companies jobs — parallelize all 3 queries + .lean() + .select()
- **File:** `backend/src/routes/companies.js` (lines 290-334)
- **Change:** Parallelized company verify + Job.find + count with Promise.all, added .lean() and .select()
- **Before:** 163ms median
- **After:** 80ms median (51% faster)

### 6. Location model — add .lean() to statics
- **File:** `backend/src/models/Location.js` (lines 65-74)
- **Change:** Added `.lean()` to getActiveLocations() and getPopularLocations()

### 7. Stats public — add .lean() to recentJobs
- **File:** `backend/src/routes/stats.js` (line 49-58)
- **Change:** Added `.lean()` to Job.find query

### 8. Admin dashboard — parallelize aggregates + .lean() on finds
- **File:** `backend/src/routes/admin.js` (lines 76-110)
- **Change:** Merged sequential topCategories + topCities aggregates with recentActivity finds into single Promise.all, added .lean() to all find queries

---

## Round 2 Targets (still slow)

| Endpoint | Median | Root Cause |
|----------|--------|------------|
| POST /auth/login | 407ms | bcrypt (intentional, ~10 rounds) |
| GET /admin/analytics | 288ms | Heavy aggregation pipeline |
| GET /admin/dashboard-stats | 263ms | 20+ DB queries |
| GET /reports/admin | 258ms | Multiple queries |
| GET /applications/employer/all | 254ms | Multiple queries |
| GET /applications/my-applications | 247ms | Multiple queries |
| GET /notifications | 246ms | Populate + no .lean() |
| GET /reports/admin/stats | 246ms | Aggregation |
| GET /reports (user) | 207ms | Multiple queries |
| GET /bulk-notifications | 206ms | Multiple queries |

---

## Files Modified
- `backend/src/routes/jobs.js`
- `backend/src/routes/companies.js`
- `backend/src/routes/stats.js`
- `backend/src/routes/admin.js`
- `backend/src/models/Location.js`
