# advance.al — Production Deployment Checklist

> **Use on deployment day.** Go through each section in order.
> Every item must be checked before proceeding to the next section.

---

## Phase 1: Pre-Deploy — Environment Variables

Set ALL of the following in the production environment (Railway for backend, Vercel for frontend).
**Never commit actual secrets. This list shows the expected format only.**

### Backend (Railway)

| Variable | Format | Required | Notes |
|----------|--------|----------|-------|
| `NODE_ENV` | `production` | YES | Must be "production" |
| `PORT` | `3001` | NO | Railway auto-assigns port |
| `MONGODB_URI` | `mongodb+srv://user:pass@cluster.mongodb.net/advance-al?retryWrites=true&w=majority` | YES | MongoDB Atlas SRV connection string |
| `JWT_SECRET` | 64+ char random string | YES | `openssl rand -hex 32` |
| `JWT_REFRESH_SECRET` | 64+ char random string (different from JWT_SECRET) | YES | `openssl rand -hex 32` |
| `FRONTEND_URL` | `https://advance.al` | YES | Used in password reset links, CORS, email URLs |
| `OPENAI_API_KEY` | `sk-...` | YES | For CV generation + embeddings |
| `OPENAI_MODEL` | `gpt-4o-mini` | NO | Defaults to gpt-4o-mini |
| `OPENAI_EMBEDDING_MODEL` | `text-embedding-3-small` | NO | Defaults to text-embedding-3-small |
| `RESEND_API_KEY` | `re_...` | YES | Resend email service |
| `EMAIL_FROM` | `advance.al <noreply@advance.al>` | NO | Defaults to this |
| `EMAIL_TEST_MODE` | `false` | YES | **MUST be false in production** |
| `CLOUDINARY_CLOUD_NAME` | `your-cloud-name` | YES | File uploads |
| `CLOUDINARY_API_KEY` | `123456789012345` | YES | File uploads |
| `CLOUDINARY_API_SECRET` | `AbCdEfGhIjKlMnOpQrStUvWxYz` | YES | File uploads |
| `UPSTASH_REDIS_REST_URL` | `https://xyz.upstash.io` | YES | Caching, rate limiting |
| `UPSTASH_REDIS_REST_TOKEN` | `AXyz...` | YES | Upstash auth |
| `SENTRY_DSN` | `https://abc@sentry.io/123` | YES | Error monitoring |
| `SENTRY_ENABLED` | `true` | NO | Auto-enabled in production |
| `RATE_LIMIT_WINDOW_MS` | `900000` | NO | 15 minutes default |
| `RATE_LIMIT_MAX_REQUESTS` | `100` | NO | 100/window default |
| `EMBEDDING_WORKER_ENABLED` | `true` | NO | Defaults to true |
| `ALERT_EMAIL_ENABLED` | `true` | REC | Enable alert emails |
| `ALERT_EMAIL_TO` | `admin@advance.al` | REC | Alert recipient |

### Frontend (Vercel)

| Variable | Format | Required |
|----------|--------|----------|
| `VITE_API_URL` | `https://api.advance.al` (or Railway production URL) | YES |
| `VITE_SENTRY_DSN` | `https://abc@sentry.io/456` | REC |

### Checklist:
- [ ] All required environment variables set in Railway
- [ ] All required environment variables set in Vercel
- [ ] `EMAIL_TEST_MODE` is `false` in production
- [ ] `JWT_SECRET` and `JWT_REFRESH_SECRET` are unique, strong, and different from each other
- [ ] `FRONTEND_URL` is the actual production URL (not localhost)
- [ ] OpenAI billing is active and has sufficient credits
- [ ] Resend domain verified and SPF/DKIM configured

---

## Phase 2: Pre-Deploy — External Services

### MongoDB Atlas
- [ ] Production cluster created (M10+ recommended for production)
- [ ] Network access: Railway IP whitelist configured (or 0.0.0.0/0 with strong auth)
- [ ] Database user created with appropriate permissions (readWrite on advance-al DB)
- [ ] Connection string uses SRV format (`mongodb+srv://`)
- [ ] Backups enabled (daily snapshots)
- [ ] Alerts configured: high connections, slow queries, disk usage

### Upstash Redis
- [ ] Production instance created
- [ ] TLS enabled
- [ ] REST URL and token configured in env
- [ ] Max memory policy set (allkeys-lru recommended)

### Cloudinary
- [ ] Production account (not free tier if heavy usage expected)
- [ ] Upload preset configured for resume PDFs and images
- [ ] Credentials in env

### Resend
- [ ] Production API key (not test key)
- [ ] Domain `advance.al` verified
- [ ] SPF record added to DNS
- [ ] DKIM record added to DNS
- [ ] Test email delivery from Resend dashboard

### OpenAI
- [ ] Production API key with billing active
- [ ] Rate limits understood: 500 RPM for gpt-4o-mini, 3000 RPM for embeddings
- [ ] Usage alerts configured in OpenAI dashboard

### Sentry
- [ ] Production project created
- [ ] DSN configured in both backend and frontend envs
- [ ] Alert rules configured (email on error spike)
- [ ] Source maps uploaded (Vercel does this automatically)

---

## Phase 3: Pre-Deploy — DNS & SSL

- [ ] Domain `advance.al` pointed to Vercel (A record or CNAME)
- [ ] `www.advance.al` redirects to `advance.al` (or vice versa)
- [ ] Backend subdomain (e.g., `api.advance.al`) pointed to Railway (if using custom domain)
- [ ] SSL certificates active for both frontend and backend domains
- [ ] HSTS headers will be set by infrastructure (Vercel/Railway handle this)
- [ ] Test: `curl -I https://advance.al` returns 200 with `strict-transport-security` header
- [ ] Test: `curl -I https://api.advance.al/health` returns 200

---

## Phase 4: Pre-Deploy — Code Verification

- [ ] All audit fixes merged (C2-C6, H1-H7, M4-M5)
- [ ] `npm run build` passes for both frontend and backend
- [ ] No `console.log` in frontend production build (tree-shaken by Vite in production mode)
- [ ] CORS configuration includes production domains
- [ ] Rate limiting is ENABLED in production (not skipped like in dev)
- [ ] API test suite passes: `node tests/api-tests.js`
- [ ] No hardcoded localhost URLs in frontend code (search for `localhost:3001`)
- [ ] `.env` files are NOT committed to git
- [ ] `git status` is clean — all changes committed

---

## Phase 5: Deploy Backend (Railway)

### Steps:
1. [ ] Push code to the main branch (or trigger deployment branch)
2. [ ] Railway auto-deploys from GitHub (if connected)
   - OR: `railway up` from CLI
3. [ ] Watch Railway deploy logs for errors
4. [ ] VERIFY: No crash loops in logs
5. [ ] VERIFY: "Server running on port XXXX" message appears
6. [ ] VERIFY: "Connected to MongoDB" message appears
7. [ ] VERIFY: No "Missing required environment variable" warnings

### Health Check:
```bash
curl https://api.advance.al/health
# Expected: {"success":true,"message":"Server is running","redis":"connected",...}
```
- [ ] Health check returns 200
- [ ] Redis status is "connected"
- [ ] No database connection errors in logs

---

## Phase 6: Deploy Frontend (Vercel)

### Steps:
1. [ ] Push code to main branch (Vercel auto-deploys)
   - OR: `vercel --prod` from CLI
2. [ ] Watch Vercel build logs for errors
3. [ ] VERIFY: Build completes without errors
4. [ ] VERIFY: Preview URL works before promoting to production

### Verification:
- [ ] Visit `https://advance.al`
- [ ] VERIFY: Home page loads fully (no blank screen)
- [ ] VERIFY: No console errors in browser DevTools
- [ ] VERIFY: API calls go to production backend (not localhost)
- [ ] Check Network tab — all API requests to production URL

---

## Phase 7: Post-Deploy — Smoke Tests

> Run these tests against the production environment. Read-only tests only — no destructive operations.

### Core Flows:
1. [ ] **Home page loads**: Visit `https://advance.al` — page renders, images load
2. [ ] **Jobs page**: `/jobs` — jobs load with pagination
3. [ ] **Job search**: Search for a term — results appear
4. [ ] **Job detail**: Click a job — detail page loads
5. [ ] **Registration flow**: Register a new test account → receive verification email → verify → logged in
6. [ ] **Login flow**: Login with test account → see dashboard
7. [ ] **Profile update**: Update profile bio → save → refresh → persists
8. [ ] **Job creation**: Create a test job → verify it appears in listings
9. [ ] **Application flow**: Apply to a job → verify in "My Applications"
10. [ ] **Notifications**: Check notifications load
11. [ ] **Privacy page**: `/privacy` — all 14 sections render
12. [ ] **Terms page**: `/terms` — all 16 sections render
13. [ ] **About page**: `/about` — page loads, contact section has ID

### Email Verification:
- [ ] Registration verification email received in real inbox (not spam)
- [ ] Password reset email received
- [ ] Notification emails received (if triggered)
- [ ] Email sender shows as `advance.al <noreply@advance.al>`
- [ ] SPF/DKIM pass (check email headers)

### API Tests (read-only):
```bash
API_URL=https://api.advance.al node tests/api-tests.js
```
- [ ] All read-only tests pass (GET endpoints)
- [ ] Auth endpoints work (login returns tokens)
- [ ] Note: Write tests will create data — run selectively

---

## Phase 8: Post-Deploy — Monitoring (First 24 Hours)

### Hour 1:
- [ ] Check Sentry for any errors — should be minimal/zero
- [ ] Check Railway logs — no crash loops, no unhandled rejections
- [ ] Check MongoDB Atlas: connections count reasonable (< 50)
- [ ] Check Upstash Redis: connections count reasonable, no errors

### Hours 2-8:
- [ ] Check Sentry error rate trend — should be flat/declining
- [ ] Check Railway CPU and memory usage — stable, not climbing
- [ ] MongoDB Atlas: query performance (no slow queries > 100ms)
- [ ] Test email deliverability: send a test and check if it lands in inbox (not spam)

### Hours 8-24:
- [ ] Monitor for any user-reported issues
- [ ] Check background jobs running:
  - [ ] Job expiry cron (if jobs have expiry dates)
  - [ ] Data retention cleanup
  - [ ] Embedding worker processing queue
- [ ] Verify cron jobs work by checking last-run timestamps in logs
- [ ] Run API test suite again — all tests still pass

---

## Phase 9: Post-Deploy — Security Verification

- [ ] HTTPS enforced: HTTP redirects to HTTPS
- [ ] CORS: only `advance.al` and Vercel preview URLs allowed
- [ ] Rate limiting active: rapid requests get 429 (test with `for i in {1..20}; do curl -s -o /dev/null -w "%{http_code}\n" https://api.advance.al/api/auth/login -X POST -H "Content-Type: application/json" -d '{"email":"test@test.com","password":"wrong"}'; done`)
- [ ] Security headers present (check with `curl -I`):
  - [ ] `X-Content-Type-Options: nosniff`
  - [ ] `X-Frame-Options: DENY` or `SAMEORIGIN`
  - [ ] `X-XSS-Protection: 1; mode=block`
  - [ ] No `X-Powered-By` header (removed by helmet)
- [ ] Admin endpoints reject non-admin tokens (test with regular user token)
- [ ] Password reset tokens are single-use
- [ ] No sensitive data in API error responses (no stack traces)

---

## Phase 10: Rollback Plan

If critical issues are found after deployment:

### Backend Rollback (Railway):
```bash
# Option 1: Redeploy previous commit
railway rollback

# Option 2: Revert git commit and push
git revert HEAD
git push origin main
```

### Frontend Rollback (Vercel):
```bash
# Option 1: Promote previous deployment
# Go to Vercel dashboard → Deployments → find previous deployment → "Promote to Production"

# Option 2: Revert git commit
git revert HEAD
git push origin main
```

### Database Rollback:
- MongoDB Atlas automatic daily backups
- Point-in-time recovery available (M10+ clusters)
- **CAUTION**: Database rollback may lose data created after the backup point

### Rollback Decision Criteria:
- **Immediate rollback**: Server crashes on startup, database connection failures, complete frontend blank screen
- **Quick fix preferred**: Individual endpoint errors, UI glitches, non-critical feature issues
- **Monitor**: Intermittent errors < 1% rate, performance degradation < 2x normal

---

## Contacts & Resources

| Resource | Location |
|----------|----------|
| Railway Dashboard | https://railway.app |
| Vercel Dashboard | https://vercel.com |
| MongoDB Atlas | https://cloud.mongodb.com |
| Sentry Dashboard | https://sentry.io |
| Upstash Console | https://console.upstash.com |
| Cloudinary Console | https://console.cloudinary.com |
| Resend Dashboard | https://resend.com |
| OpenAI Dashboard | https://platform.openai.com |
| Domain DNS | (wherever advance.al is registered) |
