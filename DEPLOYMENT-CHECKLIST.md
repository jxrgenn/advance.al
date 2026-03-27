# advance.al — Production Deployment Checklist

> **Use on deployment day.** Go through each section in order.
> Every item must be checked before proceeding to the next section.

---

## 1. Pre-Deploy: Critical Audit Fixes

Verify these issues from the audit are resolved before deploying:

- [x] **C1**: `send-verification.js` deleted (legacy unauthenticated email spray route)
- [x] **C3**: Password validation aligned across all auth flows (8+ chars, uppercase, lowercase, digit)
- [x] **C4**: `pendingRegistrationsMap` in `auth.js` has 10K size limit, periodic cleanup, capacity rejection
- [x] **C5**: `notifyAdmins()` in `notificationService.js:499` fixed — was querying `role: 'admin'` (wrong field), now correctly queries `userType: 'admin'` (admin report notifications were silently dropped)
- [x] **C6**: `BulkNotification.getTargetUsers()` uses `.lean()` for memory-efficient user loading
- [x] **H8**: `resendEmailService.js` has production safety check — crashes if `EMAIL_TEST_MODE=true` in production
- [x] **H9**: `.gitignore` hardened — added `test-mongodb*` and `test-*.js` patterns to prevent credential file commits
- [ ] **POST-LAUNCH**: Rotate MongoDB Atlas credentials (were previously exposed in `test-mongodb.js`, now deleted)
- [ ] **POST-LAUNCH**: Remove hardcoded test email `advance.al123456@gmail.com` from `resendEmailService.js:18` (controlled by `EMAIL_TEST_MODE` env var)

---

## 2. Pre-Deploy: Environment Variables

Set ALL of the following in the **Railway** dashboard (backend) and **Vercel** dashboard (frontend).

### Backend (Railway) — Required:

| Variable | Format | Notes |
|----------|--------|-------|
| `NODE_ENV` | `production` | **Must be set** |
| `MONGODB_URI` | `mongodb+srv://user:pass@cluster.mongodb.net/advance-al?retryWrites=true&w=majority` | Atlas connection string with SRV |
| `JWT_SECRET` | 64-byte hex string | `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `JWT_REFRESH_SECRET` | 64-byte hex string (different from JWT_SECRET) | Same generation method |
| `JWT_EXPIRES_IN` | `2h` | Access token lifetime |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | Refresh token lifetime |
| `FRONTEND_URL` | `https://advance.al` | Used for CORS, email links, password reset URLs |
| `CLOUDINARY_CLOUD_NAME` | Your Cloudinary cloud name | |
| `CLOUDINARY_API_KEY` | Cloudinary API key | |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret | |
| `RESEND_API_KEY` | `re_xxxxxxxxxxxxxxxx` | Production Resend key |
| `EMAIL_FROM` | `advance.al <noreply@advance.al>` | Must match verified Resend domain |
| `OPENAI_API_KEY` | `sk-proj-xxxxxxxx` | For embeddings + CV generation |
| `ADMIN_SEED_EMAIL` | `admin@advance.al` | Initial admin account email (format: email@domain.com) |
| `ADMIN_SEED_PASSWORD` | Strong password | Initial admin account password (strong password) |

### Backend (Railway) — Recommended:

| Variable | Format | Notes |
|----------|--------|-------|
| `UPSTASH_REDIS_REST_URL` | `https://your-instance.upstash.io` | Caching, rate limits, pending registrations |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash REST token | |
| `SENTRY_DSN` | `https://xxx@yyy.ingest.sentry.io/zzz` | Error tracking |
| `BCRYPT_SALT_ROUNDS` | `12` | Password hashing cost |
| `RATE_LIMIT_WINDOW_MS` | `900000` | 15 minutes |
| `RATE_LIMIT_MAX_REQUESTS` | `100` | Per window per IP |
| `PORT` | `3001` | Railway may override this |

### Backend (Railway) — Optional:

| Variable | Format | Notes |
|----------|--------|-------|
| `OPENAI_MODEL` | `gpt-4o-2024-08-06` | CV generation model |
| `OPENAI_EMBEDDING_MODEL` | `text-embedding-3-small` | Embedding model |
| `EMBEDDING_WORKER_ENABLED` | `true` | Enable background embedding worker |
| `ALERT_EMAIL_ENABLED` | `false` | Email alerts for system issues |
| `EMAIL_TEST_MODE` | `false` | **MUST be false in production** |
| `LOG_LEVEL` | `info` | Winston log level |

### Backend — Must NOT be set in production:

| Variable | Reason |
|----------|--------|
| `DEBUG_EMBEDDINGS` | Leaks sensitive data in logs |
| `DEBUG_WORKER` | Leaks sensitive data in logs |
| `DEBUG_QUEUE` | Leaks sensitive data in logs |
| `ENABLE_MOCK_PAYMENTS` | Should be false for real payments |

> **Important:** `DEBUG_EMBEDDINGS`, `DEBUG_WORKER`, and `DEBUG_QUEUE` should ALL be explicitly set to `false` or completely removed in production — not just "not set". Some code paths may default to truthy if the variable exists but is empty.

### Frontend (Vercel):

| Variable | Format | Notes |
|----------|--------|-------|
| `VITE_API_URL` | `https://advance-al-backend.up.railway.app/api` | Backend API URL |
| `VITE_SENTRY_DSN` | Sentry DSN for frontend | Optional |

- [ ] All required variables set in Railway
- [ ] All required variables set in Vercel
- [ ] `EMAIL_TEST_MODE` is `false` (or not set)
- [ ] No debug flags enabled
- [ ] JWT secrets are unique, random, and different from each other
- [ ] Frontend `VITE_API_URL` points to the production backend URL

---

## 3. Pre-Deploy: Third-Party Services

### MongoDB Atlas:
- [ ] Production cluster is at least M10 (or M0 free for initial launch)
- [ ] Database user created with appropriate permissions
- [ ] Network access: Allow Railway IPs (or `0.0.0.0/0` with strong DB password)
- [ ] Connection string uses `+srv` format
- [ ] Backups enabled (Atlas has automatic daily snapshots on M10+)
- [ ] Indexes verified: `jobs.embedding` (2dsphere), `applications.{jobId,jobSeekerId}` (unique partial), `users.email` (unique)
- [ ] Connection pool sizing: 50 max, 10 min (configured in database.js)

### Upstash Redis:
- [ ] Production instance created
- [ ] TLS enabled (Upstash REST uses HTTPS by default)
- [ ] Correct URL and token in env vars
- [ ] Eviction policy set (allkeys-lru recommended)
- [ ] Test: cache a value and retrieve it → works over TLS
- [ ] Plan: free tier supports up to 10,000 commands/day — sufficient for launch

### Cloudinary:
- [ ] Production account (not sandbox)
- [ ] Upload preset configured (if using unsigned uploads)
- [ ] Folder structure: `advance-al/resumes/`, `advance-al/logos/`, `advance-al/photos/`

### Resend (Email):
- [ ] Production API key (not test/sandbox)
- [ ] Domain `advance.al` verified in Resend dashboard
- [ ] SPF record added to DNS: `v=spf1 include:_spf.resend.com ~all`
- [ ] DKIM record added (Resend provides this)
- [ ] DMARC record: `v=DMARC1; p=none; rua=mailto:dmarc@advance.al`
- [ ] FROM address matches verified domain: `noreply@advance.al`

### OpenAI:
- [ ] Production API key with billing active
- [ ] Billing limit set (e.g., $50/month to start)
- [ ] Understand rate limits: text-embedding-3-small allows 3,000 RPM

### Sentry:
- [ ] Production project created for both frontend and backend
- [ ] DSNs set in environment variables
- [ ] Alert rules configured (email on first occurrence of new issues)

### DNS:
- [ ] `advance.al` points to Vercel (A record or CNAME)
- [ ] `www.advance.al` redirects to `advance.al` (Vercel config)
- [ ] SSL certificate active (Vercel auto-provisions Let's Encrypt)
- [ ] Backend URL is accessible (Railway auto-provides `*.up.railway.app`)

---

## 4. Deploy: Backend (Railway)

### Steps:
1. [ ] Push latest code to the repository (or the branch Railway watches)
2. [ ] In Railway dashboard, trigger a deploy (or it auto-deploys on push)
3. [ ] Watch the build logs:
   - [ ] `npm install --omit=dev` completes without errors
   - [ ] No build failures
4. [ ] Watch the deploy logs:
   - [ ] `MongoDB Connected: xxxxxx` appears
   - [ ] `advance.al API running on port XXXX` appears
   - [ ] No crash loops (container restarts)
5. [ ] Test the health check:
   ```
   curl https://advance-al-backend.up.railway.app/health
   ```
   - [ ] Returns `{ "success": true, "message": "OK" }`
   - [ ] `redis` field shows `connected` (or `not_configured` if not using Redis)

### Verify:
- [ ] Health check returns 200
- [ ] No error logs in Railway dashboard
- [ ] Memory usage is reasonable (< 200MB initially)

---

## 5. Deploy: Frontend (Vercel)

### Steps:
1. [ ] Push latest code (or trigger deploy in Vercel dashboard)
2. [ ] In Vercel dashboard, verify build succeeds:
   - [ ] `npm run build` completes
   - [ ] No TypeScript or build errors
   - [ ] Bundle size is reasonable (check Vercel build output)
3. [ ] Verify deployment:
   ```
   curl -I https://advance.al
   ```
   - [ ] Returns 200
   - [ ] Has security headers (X-Content-Type-Options, etc.)
4. [ ] Open `https://advance.al` in a browser
   - [ ] Page loads correctly
   - [ ] No console errors (DevTools)
   - [ ] API calls succeed (Network tab shows 200 responses from backend)

### Verify:
- [ ] Homepage loads with job listings
- [ ] API calls go to the correct backend URL (not localhost)
- [ ] No mixed content warnings (all HTTPS)
- [ ] SPA routing works (navigate to `/login`, refresh the page — should work, not 404)

---

## 5.5 Security Verification

Run these security checks after both frontend and backend are deployed:

- [ ] Test CORS: curl from allowed origin → Access-Control-Allow-Origin header present
  ```bash
  curl -H "Origin: https://advance.al" -I https://advance-al-backend.up.railway.app/api/jobs
  ```
- [ ] Test CORS: curl from disallowed origin → No CORS headers / blocked
  ```bash
  curl -H "Origin: https://evil.com" -I https://advance-al-backend.up.railway.app/api/jobs
  ```
- [ ] Test rate limiting: hit /api/auth/login 20 times → 429 response
- [ ] Test Helmet headers: curl -I → X-Content-Type-Options, Strict-Transport-Security, X-Frame-Options present
  ```bash
  curl -I https://advance-al-backend.up.railway.app/health
  ```
- [ ] Test CSP: Content-Security-Policy header present and not too permissive
- [ ] Verify: no API keys in frontend bundle (search dist/ for `sk-`, `re_`, `mongodb+srv`)
  ```bash
  # After Vercel build, download and inspect the bundle:
  curl -s https://advance.al/assets/*.js | grep -E 'sk-|re_|mongodb\+srv' && echo "LEAK FOUND!" || echo "Clean"
  ```
- [ ] Verify: localStorage tokens cleared on logout
- [ ] Verify: no stack traces in production error responses (hit a bad endpoint, check response)
  ```bash
  curl https://advance-al-backend.up.railway.app/api/nonexistent-endpoint-test
  # Should return a clean JSON error, NOT a stack trace
  ```

---

## 6. Post-Deploy: Smoke Tests (Production)

Run these immediately after both frontend and backend are deployed:

### API Quick Test:
```bash
# Health check
curl https://advance-al-backend.up.railway.app/health

# Public endpoints
curl https://advance-al-backend.up.railway.app/api/stats/public
curl https://advance-al-backend.up.railway.app/api/locations
curl https://advance-al-backend.up.railway.app/api/jobs?limit=5
curl https://advance-al-backend.up.railway.app/api/companies?limit=5
curl https://advance-al-backend.up.railway.app/api/configuration/public

# Auth test (should return 401)
curl https://advance-al-backend.up.railway.app/api/users/profile

# Test auth flow
curl -X POST https://advance-al-backend.up.railway.app/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@advance.al","password":"<admin-password>"}'

# Test CORS (should work from production frontend domain)
curl -H "Origin: https://advance.al" -I https://advance-al-backend.up.railway.app/api/jobs

# Test CORS rejection (should fail from unknown origin)
curl -H "Origin: https://evil.com" -I https://advance-al-backend.up.railway.app/api/jobs
```

- [ ] Health check: 200
- [ ] Stats: 200 with real data
- [ ] Locations: 200 with locations
- [ ] Jobs: 200 with jobs
- [ ] Companies: 200 with companies
- [ ] Config public: 200
- [ ] Profile (no auth): 401
- [ ] Auth login: returns JWT token
- [ ] CORS from allowed origin: Access-Control-Allow-Origin header present
- [ ] CORS from disallowed origin: No CORS headers / request blocked

### Frontend Smoke Test:
- [ ] Open `https://advance.al`
- [ ] Browse jobs — list loads
- [ ] Click a job — detail page works
- [ ] Go to `/login` — form renders
- [ ] Log in with admin account
- [ ] Visit `/admin` — dashboard loads with stats
- [ ] Log out — works correctly
- [ ] Register a new test user (seeker)
- [ ] Check email — verification code received
- [ ] Complete registration — profile accessible

### Frontend End-to-End Workflow Test:
- [ ] Register a real test user with a real email
- [ ] Apply to a job as that user
- [ ] Change application status as employer
- [ ] Verify notification was received
- [ ] Test forgot password flow end-to-end with real email

### Email Test:
- [ ] Trigger a password reset email
- [ ] VERIFY: Email arrives in inbox (not spam)
- [ ] VERIFY: Email looks professional (HTML renders correctly)
- [ ] VERIFY: Links in email point to production URL (not localhost)
- [ ] VERIFY: Unsubscribe links work (for notification emails)

### Sentry Test:
- [ ] Trigger an error (e.g., visit a malformed URL that causes a 500)
- [ ] VERIFY: Error appears in Sentry dashboard within 1 minute

---

## 7. Post-Deploy: First 24 Hours Monitoring

### Every 2 hours for the first 8 hours:
- [ ] Check Railway dashboard:
  - Memory usage stable (not climbing)
  - No crash restarts
  - Response times normal
- [ ] Check Sentry:
  - No new critical errors
  - No spike in error volume
- [ ] Check MongoDB Atlas:
  - Connection count stable (should be ~10-50)
  - No slow queries flagged
  - Storage usage normal
- [ ] Check Upstash Redis (if configured):
  - Connection count normal
  - Memory usage normal
  - No evictions (unless expected)

### After 24 hours:
- [ ] Review all Sentry errors — categorize and prioritize
- [ ] Review Railway logs for any warnings
- [ ] Check email deliverability:
  - Send test email to Gmail, Outlook, Yahoo
  - Verify none land in spam
- [ ] Verify cron jobs ran:
  - Job expiry: check that expired jobs are marked as such
  - Data retention: check Railway logs for retention entries
  - Suspension auto-lift: if applicable
- [ ] Check the embedding worker:
  - `/admin/embeddings/status` shows healthy worker
  - Jobs are getting embeddings generated
- [ ] Send a small test bulk notification (to admins only)
- [ ] VERIFY: Notification delivered via both in-app and email

---

## 8. Rollback Plan

If something goes critically wrong:

### Backend Rollback (Railway):
1. Go to Railway dashboard → Deployments
2. Click on the previous successful deployment
3. Click "Redeploy" to roll back
4. Verify health check passes

### Frontend Rollback (Vercel):
1. Go to Vercel dashboard → Deployments
2. Click on the previous successful deployment
3. Click "..." → "Promote to Production"
4. Verify the site loads correctly

### Database Rollback:
- MongoDB Atlas has point-in-time recovery (M10+ clusters)
- For M0: restore from the last daily snapshot in Atlas dashboard

### Emergency Contacts:
- [ ] Note Railway support channel: https://railway.app/help
- [ ] Note Vercel support: https://vercel.com/help
- [ ] Note MongoDB Atlas support: https://cloud.mongodb.com/v2#/org/.../support

---

## 9. Post-Launch Tasks (Within First Week)

- [ ] Set up uptime monitoring (UptimeRobot, Pingdom, or similar):
  - Monitor: `https://advance-al-backend.up.railway.app/health`
  - Monitor: `https://advance.al`
  - Alert: email + SMS on downtime
- [ ] Set up Sentry alerts:
  - New issue: email immediately
  - High error volume: email + Slack
- [ ] Review and optimize MongoDB indexes based on actual query patterns (Atlas Performance Advisor)
- [ ] Review Cloudinary usage and set up auto-optimization
- [ ] Plan httpOnly cookie migration for tokens (high-priority security improvement)
- [ ] Set up automated database backups (if not on M10+)
- [ ] Configure Railway auto-scaling rules (if available on your plan)
- [ ] Review rate limiting thresholds based on actual traffic patterns
- [ ] Verify admin report notifications are being delivered (fixed notifyAdmins bug)
- [ ] Review MongoDB slow query log (Atlas Performance Advisor)
- [ ] Test embedding generation: post a new job → verify embedding is generated within 5 minutes
- [ ] Verify Redis caching: check /health endpoint shows redis: "connected"
- [ ] Review Cloudinary storage usage and set up folder organization
- [ ] Set up log retention policy in Railway (default is 14 days)

---

## Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Developer | | | |
| Tester | | | |
| Product Owner | | | |
