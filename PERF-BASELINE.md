# Performance Baseline — advance.al API

**Date:** 2026-03-30
**Server:** http://localhost:3001
**Database:** MongoDB Atlas
**Method:** 7 iterations per endpoint, median reported (1 warmup)

## Summary
- ✅ FAST (<50ms): 38
- ✅ OK (50-150ms): 6
- ⚠️ SLOW (150-500ms): 14
- 🔴 VERY SLOW (>500ms): 0
- Total: 58 endpoints

## Results

| Endpoint | Median (ms) | p95 (ms) | Max (ms) | Status |
|----------|------------|----------|----------|--------|
| GET  /health | 46.6 | 51.8 | 51.8 | ✅ FAST |
| GET  /api/stats/public | 88.4 | 91.6 | 91.6 | ✅ OK |
| GET  /api/configuration/public | 49.0 | 52.5 | 52.5 | ✅ FAST |
| GET  /api/locations | 87.8 | 91.0 | 91.0 | ✅ OK |
| GET  /api/locations/popular | 88.3 | 89.1 | 89.1 | ✅ OK |
| GET  /api/jobs (default listing) | 171.7 | 175.6 | 175.6 | ⚠️ SLOW |
| GET  /api/jobs?limit=20 | 161.2 | 180.1 | 180.1 | ⚠️ SLOW |
| GET  /api/jobs?limit=50 | 176.7 | 182.1 | 182.1 | ⚠️ SLOW |
| GET  /api/jobs?search=programues | 158.4 | 169.8 | 169.8 | ⚠️ SLOW |
| GET  /api/jobs?search=developer | 166.0 | 197.7 | 197.7 | ⚠️ SLOW |
| GET  /api/jobs?category=Teknologji | 160.9 | 169.9 | 169.9 | ⚠️ SLOW |
| GET  /api/jobs?city=Tiranë | 164.8 | 180.7 | 180.7 | ⚠️ SLOW |
| GET  /api/jobs?jobType=full-time | 163.1 | 183.0 | 183.0 | ⚠️ SLOW |
| GET  /api/jobs?sortBy=postedAt&sortOrder=desc | 158.2 | 179.8 | 179.8 | ⚠️ SLOW |
| GET  /api/jobs/:id (single job) | 168.1 | 180.5 | 180.5 | ⚠️ SLOW |
| GET  /api/companies | 126.9 | 135.1 | 135.1 | ✅ OK |
| GET  /api/companies?search=tech | 123.2 | 160.9 | 160.9 | ✅ OK |
| GET  /api/companies/:id | 163.2 | 171.4 | 171.4 | ⚠️ SLOW |
| GET  /api/companies/:id/jobs | 163.4 | 177.2 | 177.2 | ⚠️ SLOW |
| POST /api/auth/login (valid) | 410.2 | 420.6 | 420.6 | ⚠️ SLOW |
| POST /api/auth/login (wrong pw) | 282.8 | 288.7 | 288.7 | ⚠️ SLOW |
| GET  /api/auth/me | 39.3 | 40.1 | 40.1 | ✅ FAST |
| GET  /api/users (profile) | 39.5 | 44.0 | 44.0 | ✅ FAST |
| GET  /api/applications/applied-jobs | 38.2 | 39.8 | 39.8 | ✅ FAST |
| GET  /api/applications/my-applications | 40.1 | 47.9 | 47.9 | ✅ FAST |
| GET  /api/notifications | 38.9 | 54.5 | 54.5 | ✅ FAST |
| GET  /api/notifications/unread-count | 40.0 | 48.1 | 48.1 | ✅ FAST |
| GET  /api/users (employer profile) | 38.7 | 46.7 | 46.7 | ✅ FAST |
| GET  /api/jobs/employer/my-jobs | 39.7 | 44.1 | 44.1 | ✅ FAST |
| GET  /api/applications/employer/all | 39.2 | 44.1 | 44.1 | ✅ FAST |
| GET  /api/admin/dashboard-stats | 1.1 | 1.7 | 1.7 | ✅ FAST |
| GET  /api/admin/analytics | 0.4 | 0.6 | 0.6 | ✅ FAST |
| GET  /api/admin/system-health | 0.5 | 0.6 | 0.6 | ✅ FAST |
| GET  /api/admin/users | 0.4 | 0.5 | 0.5 | ✅ FAST |
| GET  /api/admin/users?search=andi | 0.4 | 0.6 | 0.6 | ✅ FAST |
| GET  /api/admin/jobs | 0.4 | 0.5 | 0.5 | ✅ FAST |
| GET  /api/admin/jobs/pending | 0.4 | 0.5 | 0.5 | ✅ FAST |
| GET  /api/admin/user-insights | 0.4 | 0.4 | 0.4 | ✅ FAST |
| GET  /api/admin/embeddings/status | 0.4 | 0.5 | 0.5 | ✅ FAST |
| GET  /api/admin/embeddings/queue | 0.5 | 1.5 | 1.5 | ✅ FAST |
| GET  /api/admin/embeddings/workers | 0.4 | 0.5 | 0.5 | ✅ FAST |
| GET  /api/reports (user reports) | 39.3 | 44.2 | 44.2 | ✅ FAST |
| GET  /api/reports/admin | 39.0 | 41.8 | 41.8 | ✅ FAST |
| GET  /api/reports/admin/stats | 39.7 | 43.6 | 43.6 | ✅ FAST |
| GET  /api/configuration | 1.4 | 1.8 | 1.8 | ✅ FAST |
| GET  /api/configuration/pricing | 0.5 | 1.3 | 1.3 | ✅ FAST |
| GET  /api/configuration/system-health | 0.6 | 1.5 | 1.5 | ✅ FAST |
| GET  /api/configuration/audit | 0.4 | 0.5 | 0.5 | ✅ FAST |
| GET  /api/business/analytics/dashboard | 39.7 | 51.4 | 51.4 | ✅ FAST |
| GET  /api/business/analytics/revenue | 39.5 | 53.9 | 53.9 | ✅ FAST |
| GET  /api/business/campaigns | 39.3 | 48.9 | 48.9 | ✅ FAST |
| GET  /api/business/pricing-rules | 39.7 | 46.2 | 46.2 | ✅ FAST |
| GET  /api/business/whitelist | 39.1 | 39.6 | 39.6 | ✅ FAST |
| GET  /api/business/employers/search?q=tech | 39.8 | 47.3 | 47.3 | ✅ FAST |
| GET  /api/bulk-notifications | 43.6 | 59.5 | 59.5 | ✅ FAST |
| GET  /api/bulk-notifications/templates/list | 39.6 | 40.3 | 40.3 | ✅ FAST |
| GET  /api/quickusers/analytics/overview | 39.5 | 49.1 | 49.1 | ✅ FAST |
| GET  /api/verification/status/test@test.com | 87.9 | 89.6 | 89.6 | ✅ OK |
