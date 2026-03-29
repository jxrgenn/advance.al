# Remaining Human Work — advance.al

Everything the automated dev loop cannot do. These tasks require human accounts, credentials, visual verification, or legal decisions.

---

## Priority 1: Critical for Launch

### 1.1 Third-Party Service Credentials

Each service below requires a human to create an account, obtain API keys, and configure environment variables.

**Paysera Payment Integration**
- [ ] Create a Paysera business account at paysera.com (Stripe is not available in Albania)
- [ ] Obtain `PAYSERA_PROJECT_ID` and `PAYSERA_SIGN_PASSWORD`
- [ ] Configure callback/webhook URLs pointing to `https://api.advance.al/api/payments/callback`
- [ ] Implement and test the full payment flow end-to-end with real/sandbox transactions
- [ ] Verify payment confirmation webhooks are received and processed correctly

**Resend Email — Production Recipients**
- [ ] Currently all emails route to `advance.al123456@gmail.com` for testing
- [ ] Search codebase for TODO comments about changing to real recipients
- [ ] Update email sending logic to use actual user email addresses
- [ ] Verify delivery to real inboxes (check spam folders, formatting, links)

**Twilio SMS**
- [ ] Create Twilio account and obtain `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`
- [ ] Purchase an SMS-capable phone number (Albanian numbers preferred for local delivery)
- [ ] Set environment variables in production
- [ ] Test SMS delivery to Albanian phone numbers

**Cloudinary**
- [ ] Create Cloudinary account (free tier is fine initially)
- [ ] Obtain `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
- [ ] Configure upload presets for resumes, company logos, and profile photos
- [ ] Set file size limits and allowed formats in Cloudinary dashboard
- [ ] Replace local `uploads/` directory usage with Cloudinary URLs in production

**Sentry Error Monitoring**
- [ ] Create Sentry project for Node.js (backend) and React (frontend)
- [ ] Obtain DSN values for both projects
- [ ] Set `SENTRY_DSN` in backend environment variables
- [ ] Set `VITE_SENTRY_DSN` in frontend environment variables
- [ ] Verify errors are captured by triggering a test error in staging

---

### 1.2 Production Deployment

**MongoDB Atlas**
- [ ] Upgrade from free tier to M10 cluster (or appropriate tier for launch traffic)
- [ ] Enable backups and set backup schedule (daily minimum)
- [ ] Whitelist Railway backend IP addresses (or use `0.0.0.0/0` with strong auth)
- [ ] Create separate database users for production (not the dev credentials)
- [ ] Verify connection string works from Railway

**Railway Backend**
- [ ] Create Railway project and link to the repository
- [ ] Deploy using the existing Dockerfile
- [ ] Set all production environment variables:
  - `NODE_ENV=production`
  - `MONGODB_URI` (Atlas production cluster)
  - `JWT_SECRET` (generate a strong random secret, not the dev one)
  - `JWT_REFRESH_SECRET` (separate strong random secret)
  - `OPENAI_API_KEY`
  - `RESEND_API_KEY`
  - All third-party keys from section 1.1
- [ ] Verify health check endpoint responds: `GET /api/health`
- [ ] Confirm rate limiting is active (`NODE_ENV=production` enables it)

**Vercel Frontend**
- [ ] Create Vercel project and link to the repository
- [ ] Configure the existing `vercel.json` for the frontend build
- [ ] Set `VITE_API_URL` to `https://api.advance.al`
- [ ] Set any other `VITE_*` environment variables
- [ ] Verify build succeeds on Vercel

**DNS and SSL**
- [ ] Purchase/transfer `advance.al` domain if not already owned
- [ ] Configure DNS records:
  - `advance.al` and `www.advance.al` -> Vercel (A/CNAME records)
  - `api.advance.al` -> Railway (CNAME record)
- [ ] SSL certificates are auto-provisioned by Vercel and Railway — verify they are active
- [ ] Test `https://advance.al` and `https://api.advance.al` load correctly
- [ ] Verify CORS is configured to allow `https://advance.al` on the backend

---

## Priority 2: Required Before Public Launch

### 2.1 Legal and Compliance

**Privacy Policy**
- [ ] Draft a privacy policy for advance.al in Albanian
- [ ] Cover: data collected, purpose, retention, third-party sharing, user rights
- [ ] Include contact information for data inquiries
- [ ] Host at `/privacy-policy` route

**Terms of Service**
- [ ] Draft terms of service in Albanian
- [ ] Cover: user responsibilities, employer responsibilities, payment terms, dispute resolution
- [ ] Host at `/terms-of-service` route

**GDPR Compliance**
- [ ] Review all user data collection points for GDPR compliance
- [ ] Implement data export functionality (user can download their data)
- [ ] Implement account deletion that removes all personal data
- [ ] Ensure consent is collected before processing (job applications, emails, etc.)
- [ ] Document data processing activities

**Cookie Consent**
- [ ] Review cookie usage (analytics, auth tokens, preferences)
- [ ] Implement cookie consent banner in Albanian
- [ ] Allow users to accept/reject non-essential cookies
- [ ] Respect cookie preferences in analytics/tracking code

---

### 2.2 Missing Features

These features are documented in the codebase but not yet built.

**Digest/Cron Scheduler**
- [ ] Implement periodic notification digests (daily/weekly job alerts)
- [ ] Use Railway cron jobs or a dedicated scheduler service
- [ ] Configure: new job matching alerts, application status reminders, expiring job warnings

**Scheduled Notification Processor**
- [ ] Build the worker that processes queued notifications on a schedule
- [ ] Handle email batching to stay within Resend rate limits
- [ ] Add retry logic for failed notification deliveries

**Full Paysera Payment Flow**
- [ ] Implement subscription plan selection UI
- [ ] Build payment initiation endpoint that redirects to Paysera
- [ ] Handle Paysera callback to confirm payment
- [ ] Activate employer premium features upon successful payment
- [ ] Handle payment failures, refunds, and subscription expiry

---

## Priority 3: Pre-Launch Validation

### 3.1 Load Testing

Must be performed against a staging environment that mirrors production.

- [ ] Set up a staging environment (separate Railway + Vercel + Atlas deployments)
- [ ] Install k6 or autocannon locally
- [ ] Test scenarios:
  - Job search with 100 concurrent users
  - Job posting with 50 concurrent employers
  - CV upload with 20 concurrent users
  - Authentication endpoints under sustained load
- [ ] Verify rate limiting kicks in at configured thresholds
- [ ] Check response times remain under 500ms at expected traffic levels
- [ ] Identify and fix any bottlenecks before production launch

### 3.2 Frontend QA

Requires a human to visually verify the UI across devices and roles. See `HUMAN-QA-CHECKLIST.md` for the full checklist.

**Key areas requiring visual verification:**
- [ ] Responsive layout on mobile (375px), tablet (768px), desktop (1440px)
- [ ] All forms submit correctly and show appropriate validation errors
- [ ] Job search, filtering, and pagination work smoothly
- [ ] Employer dashboard: post job, view applications, manage company profile
- [ ] Jobseeker dashboard: apply to jobs, upload CV, manage profile
- [ ] Admin dashboard: manage users, jobs, and platform settings
- [ ] Email templates render correctly in Gmail, Outlook, and mobile mail clients
- [ ] Albanian language text displays correctly (special characters: e, c, gj, etc.)

---

## Quick Reference: Environment Variables Needed

| Variable | Service | Where |
|---|---|---|
| `MONGODB_URI` | MongoDB Atlas | Backend |
| `JWT_SECRET` | Auth | Backend |
| `JWT_REFRESH_SECRET` | Auth | Backend |
| `OPENAI_API_KEY` | OpenAI | Backend |
| `RESEND_API_KEY` | Resend | Backend |
| `PAYSERA_PROJECT_ID` | Paysera | Backend |
| `PAYSERA_SIGN_PASSWORD` | Paysera | Backend |
| `TWILIO_ACCOUNT_SID` | Twilio | Backend |
| `TWILIO_AUTH_TOKEN` | Twilio | Backend |
| `TWILIO_PHONE_NUMBER` | Twilio | Backend |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary | Backend |
| `CLOUDINARY_API_KEY` | Cloudinary | Backend |
| `CLOUDINARY_API_SECRET` | Cloudinary | Backend |
| `SENTRY_DSN` | Sentry | Backend |
| `VITE_API_URL` | API endpoint | Frontend |
| `VITE_SENTRY_DSN` | Sentry | Frontend |
