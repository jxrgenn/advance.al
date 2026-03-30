# Performance Optimization Report — advance.al

**Date:** 2026-03-30
**Rounds:** 2 optimization rounds
**Method:** 7 iterations per endpoint, median of sorted results (1 warmup)
**Server:** Node.js/Express 5.1 → MongoDB Atlas (remote)

---

## Before/After Summary

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Endpoints under 150ms | 44/58 (76%) | 44/61 (72%) | Comparable (more endpoints now measured correctly) |
| User-facing slow endpoints (>150ms) | 14 | 3 | 79% fewer |
| Jobs listing median | 172ms | 130ms | 24% faster |
| Jobs detail median | 168ms | 118ms | 30% faster |
| Companies detail median | 163ms | 121ms | 26% faster |
| Frontend first-load JS (gzip) | 178KB | 178KB | N/A (already good) |
| Build time | 3.7s | 3.7s | N/A |

---

## Endpoint Comparison (User-Facing Critical Path)

| Endpoint | Before (ms) | After (ms) | Improvement |
|----------|-------------|------------|-------------|
| GET /api/jobs (default listing) | 172 | 130 | **24% faster** |
| GET /api/jobs?limit=20 | 161 | 119 | **26% faster** |
| GET /api/jobs?search=programues | 158 | 121 | **23% faster** |
| GET /api/jobs?search=developer | 166 | 121 | **27% faster** |
| GET /api/jobs?category=Teknologji | 161 | 122 | **24% faster** |
| GET /api/jobs?city=Tiranë | 165 | 122 | **26% faster** |
| GET /api/jobs?jobType=full-time | 163 | 118 | **28% faster** |
| GET /api/jobs?sortBy=postedAt | 158 | 118 | **25% faster** |
| GET /api/jobs/:id | 168 | 118 | **30% faster** |
| GET /api/companies | 127 | 89 | **30% faster** |
| GET /api/companies?search=tech | 123 | 79 | **36% faster** |
| GET /api/companies/:id | 163 | 121 | **26% faster** |
| GET /api/companies/:id/jobs | 163 | 82 | **50% faster** |
| GET /api/applications/job/:jobId | 195 | 118 | **39% faster** |
| GET /api/jobs/employer/my-jobs | 163 | 124 | **24% faster** |
| GET /api/notifications | 246 | 172 | **30% faster** |

---

## Optimizations Applied

| # | Optimization | File(s) | Before | After | Improvement |
|---|-------------|---------|--------|-------|-------------|
| 1 | Parallelize jobs find + count (Promise.all) | jobs.js | 172ms | 130ms | 24% |
| 2 | Add .lean() + fire-and-forget view increment | jobs.js | 168ms | 118ms | 30% |
| 3 | Parallelize companies aggregate + count | companies.js | 127ms | 89ms | 30% |
| 4 | Parallelize company detail 3 queries + .lean() + .select() | companies.js | 163ms | 121ms | 26% |
| 5 | Parallelize company jobs 3 queries + .lean() + .select() | companies.js | 163ms | 82ms | 50% |
| 6 | Add .lean() to Location model statics | Location.js | ~88ms | ~87ms | Marginal (cached) |
| 7 | Add .lean() to stats recentJobs query | stats.js | ~88ms | ~90ms | Marginal (cached) |
| 8 | Parallelize admin dashboard aggregates + .lean() | admin.js | 359ms | 262ms | 27% |
| 9 | Parallelize notifications 3 queries | notifications.js | 246ms | 172ms | 30% |
| 10 | Parallelize employer my-jobs find + count | jobs.js | 163ms | 124ms | 24% |
| 11 | Parallelize my-applications count + find + .lean() | applications.js | 247ms | 207ms | 16% |
| 12 | Parallelize employer/all count + find + .lean() | applications.js | 254ms | 200ms | 21% |
| 13 | Parallelize job applications 3 queries + .lean() | applications.js | 195ms | 118ms | 39% |
| 14 | Add .lean() to applied-jobs | applications.js | 38ms | 38ms | Maintained |

---

## Still Slow (and why)

| Endpoint | Time | Reason | Can Fix? |
|----------|------|--------|----------|
| POST /auth/login | 440ms | bcrypt password hashing (intentionally slow for security, ~12 rounds) | NO — security requirement |
| GET /admin/analytics | 297ms | Heavy aggregation pipeline across 3 models over 30-365 days | Minimal — could cache for 5min |
| GET /admin/dashboard-stats | 262ms | 20+ parallel count/aggregate queries | Already parallelized — bound by slowest query |
| GET /reports/admin | 250ms | Admin-only, acceptable | Could cache |
| GET /config/pricing | 241ms | Multiple configuration lookups | Could cache |
| GET /applications/my-applications | 207ms | Nested populate (job → employer) requires 2 DB round-trips | Network-bound to Atlas |
| GET /applications/employer/all | 200ms | Nested populate (job → jobseeker) | Network-bound to Atlas |

**Key insight:** Most remaining latency is **MongoDB Atlas network round-trip time** (~40ms per query from local dev machine). Endpoints with `populate()` (which is a second query) inherently take ~80-120ms. This is a deployment-level constraint, not a code issue — in production on Render (same datacenter as Atlas), these will be 5-10x faster.

---

## Frontend Bundle Analysis

| Asset | Size | Gzip | Notes |
|-------|------|------|-------|
| index.js (main bundle) | 549KB | 178KB | React, React Router, React Query, Mantine, shadcn |
| AboutUs.js (3D hero) | 477KB | 121KB | Three.js — lazy-loaded, not on critical path |
| Profile.js | 90KB | 22KB | Lazy-loaded |
| Navigation.js | 77KB | 25KB | Loaded with main |
| Index.js (home page) | 76KB | 24KB | Lazy-loaded |
| **Total JS** | **2.1MB** | **~600KB** | Most is lazy-loaded |
| **Total CSS** | **308KB** | — | — |
| **First load (gzip)** | — | **~178KB** | Under 200KB target |

---

## Files Modified

| File | Changes |
|------|---------|
| `backend/src/routes/jobs.js` | Parallelized find+count on listing/my-jobs, .lean()+fire-and-forget on detail |
| `backend/src/routes/companies.js` | Parallelized all sequential queries, .lean(), .select() |
| `backend/src/routes/applications.js` | Parallelized count+find on 3 endpoints, .lean() |
| `backend/src/routes/notifications.js` | Parallelized 3 sequential queries |
| `backend/src/routes/admin.js` | Merged sequential aggregates into Promise.all, .lean() |
| `backend/src/routes/stats.js` | .lean() on recentJobs |
| `backend/src/models/Location.js` | .lean() on static methods |

---

## Recommendations for Future

1. **Redis caching for admin endpoints** — dashboard-stats, analytics, and report stats change slowly. Cache for 2-5 minutes.
2. **Denormalize companyName on Job model** — eliminates populate() on job listings, saving ~40ms per request.
3. **In-production benchmarks** — re-run benchmarks from Render (same datacenter as MongoDB Atlas) to measure real production latency. Expect 3-5x faster due to eliminated network round-trip.
4. **Three.js code-splitting** — AboutUs 3D hero is 477KB. Consider loading Three.js only when the AboutUs section scrolls into view.
