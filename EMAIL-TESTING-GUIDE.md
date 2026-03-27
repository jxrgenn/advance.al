# advance.al — Email Testing Guide

All emails in test mode go to: **advance.al123456@gmail.com**
(Set by `EMAIL_TEST_MODE=true` in `.env`)

---

## Quick Summary: All Email Types

| # | Email Type | Trigger | Who Receives |
|---|-----------|---------|-------------|
| 1 | Verification Code | User signs up (initiate-registration) | New user |
| 2 | JobSeeker Welcome | Registration completes | New jobseeker |
| 3 | Employer Welcome | Registration completes | New employer |
| 4 | QuickUser Welcome | Quick signup on /jobseekers | QuickUser |
| 5 | Password Reset | "Keni harruar fjalekalimin?" | User (always 200, no enumeration) |
| 6 | Job Match Notification | New job created (active) or admin approves job | Matching QuickUsers + jobseekers with alerts on |
| 7 | New Application | Jobseeker applies for job | Employer (job owner) |
| 8 | Application Status | Employer changes app status | Applicant (jobseeker) |
| 9 | Application Message | (Template ready, no endpoint yet) | — |
| 10 | Account Action | Admin takes action on report | Reported user |
| 11 | Bulk Notification | Admin sends bulk notification | Configurable audience |
| 12 | Email Verification | User requests code from profile | User |

---

## How to Test Each Email

### 1. Verification Code Email
**URL:** No UI needed — triggered during signup
**Steps:**
1. Go to `/jobseekers` or `/employers`
2. Start the registration process
3. Enter email, name, password, city
4. Click "Vazhdo" — verification code email is sent

**Check email for:** Subject "Kodi i Verifikimit — advance.al" with a 6-digit code

---

### 2. JobSeeker Welcome Email
**Steps:**
1. Complete a full jobseeker registration (enter code, finish signup)
2. Welcome email sends automatically

**Check email for:** Subject "Mire se vini ne advance.al! Llogaria juaj u krijua me sukses"

---

### 3. Employer Welcome Email
**Steps:**
1. Complete a full employer registration
2. Welcome email sends automatically

**Check email for:** Subject "Mire se vini ne advance.al! Llogara e punedhenesit u krijua"

---

### 4. QuickUser Welcome Email
**URL:** `/jobseekers` (scroll to quick signup form at bottom)
**Steps:**
1. Fill in: name, email, phone, city, interests
2. Optionally attach a PDF CV
3. Click submit
4. Welcome email triggers in background

**Check email for:** Subject "Mire se vini ne advance.al! Regjistrimi per njoftimet u krye me sukses"

**Variations to test:**
- Without CV (JSON request)
- With CV (FormData, PDF uploaded to Cloudinary)
- Duplicate email (should be rejected)

---

### 5. Password Reset Email
**URL:** `/login` → "Keni harruar fjalekalimin?"
**Steps:**
1. Click forgot password link
2. Enter any registered email
3. Click send

**Check email for:** Subject "Rivendosni Fjalekalimin — advance.al" with reset link

**Security test:** Enter a non-existent email — should still show success (no email enumeration)

---

### 6. Job Match Notifications (MOST IMPORTANT)
**Trigger:** When a new job is posted with status 'active'
**Steps:**
1. Login as employer (klajdi@techinnovations.al / password123)
2. Go to `/post-job`
3. Create a job in **Tirane** with category **Teknologji**
4. Submit — notifications fire in background

**What happens:**
- System finds QuickUsers matching location + interests (keyword matching)
- System finds QuickUsers + jobseekers with matching embeddings (semantic matching)
- Emails sent in batches of 4 (1.2s delay between batches)
- All emails go to advance.al123456@gmail.com in test mode

**Check email for:** Subject "Pune e re: [Job Title] ne Tirane"
- Contains job title, company, salary, deadline, category
- Has "Shiko Detajet dhe Apliko" button
- Has unsubscribe link in footer

**Also triggered by:** Admin approving a pending job

---

### 7. New Application Email (to Employer)
**Steps:**
1. Login as jobseeker (jurgenhalili1142@gmail.com / password123)
2. Find an active job
3. Click "Apliko" (one-click apply)
4. Employer receives notification email

**Check email for:** Subject "Aplikim i ri per [Job Title] — advance.al"

---

### 8. Application Status Update Email
**Steps:**
1. Login as employer
2. Go to employer dashboard → applications tab
3. Click on an application
4. Change status to "Shortlisted" or "Rejected"
5. Applicant receives status email

**Check email for:** Subject with status icon and label:
- Shortlisted: "Aplikimi juaj u shtua ne listen e shkurter"
- Rejected: "Aplikimi juaj u refuzua"
- Hired: "Aplikimi juaj u pranua"

---

### 9. Account Action Emails
**Steps:** (Admin only)
1. Login as admin
2. Go to reports section
3. Take action on a report (warn, suspend, ban)
4. User receives action email

**Check email for:** Subjects like:
- Warning: "Paralajmerim per llogarire tuaj"
- Suspension: "Llogara juaj eshte pezulluar"

---

### 10. Bulk Notification Email
**Steps:** (Admin only)
1. Login as admin
2. Go to admin dashboard → notifications
3. Create a new bulk notification
4. Select audience (all, employers, jobseekers, quick_users)
5. Enter title + message
6. Send

**Check email for:** Subject "[Type Icon] [Title] - advance.al"

---

### 11. Email Verification (from Profile)
**Steps:**
1. Login as any user
2. Go to profile
3. If email is unverified, click "Verifiko emailin"
4. Verification code email is sent

**Check email for:** Subject "Kodi i Verifikimit - advance.al"

---

## Automated Test Script (via curl)

You can test emails via API directly:

```bash
# Set BASE URL
BASE=http://localhost:3001

# 1. Quick User Welcome
curl -X POST $BASE/api/quickusers \
  -H "Content-Type: application/json" \
  -d '{"firstName":"Test","lastName":"User","email":"test_'$(date +%s)'@example.com","phone":"+355691234567","location":"Tiranë","interests":["Teknologji"]}'

# 2. Verification Code
curl -X POST $BASE/api/auth/initiate-registration \
  -H "Content-Type: application/json" \
  -d '{"email":"reg_'$(date +%s)'@example.com","password":"TestPass123!","userType":"jobseeker","firstName":"Test","lastName":"Code","city":"Tiranë"}'

# 3. Password Reset
curl -X POST $BASE/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email":"klajdi@techinnovations.al"}'

# 4. Login (get token for auth'd requests)
TOKEN=$(curl -s -X POST $BASE/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"klajdi@techinnovations.al","password":"password123"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")

# 5. Create Job (triggers notifications)
curl -X POST $BASE/api/jobs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"title":"Test Job","description":"Ky eshte nje test pune per testimin e sistemit te emaileve. Duhet minimumi 50 karaktere per pershkrimin e punes.","requirements":["React","Node.js"],"category":"Teknologji","jobType":"full-time","location":{"city":"Tiranë","remote":false},"salary":{"min":500,"max":1000,"currency":"EUR","isNegotiable":false},"applicationDeadline":"'$(date -v+30d +%Y-%m-%dT%H:%M:%S)'Z","contactEmail":"test@test.al","platformCategories":{"diaspora":false,"ngaShtepia":false,"partTime":false,"administrata":false,"sezonale":false}}'
```

---

## How Matching Works (Technical)

### Job → User Matching Flow:
1. **Job created/approved** → `notifyMatchingUsers(job)` called
2. **Semantic matching** (primary):
   - Load job's embedding vector (1536-dim, OpenAI text-embedding-3-small)
   - Compare against QuickUsers + jobseekers with completed embeddings
   - Cosine similarity threshold: **0.55**
3. **Keyword matching** (always runs for QuickUsers):
   - Match job category/tags against user interests
   - Match job city against user location
   - Respects frequency gating (immediate/daily/weekly)
4. **Deduplicate** semantic + keyword results
5. **Send emails** in batches of 4, 1.2s between batches

### Who gets notified:
- **QuickUsers**: Active, not converted, matching by semantic OR keyword
- **Full jobseekers**: Active, `notifications.jobAlerts = true`, matching by semantic only (must have embedding)

### Frequency gating:
- **Immediate**: Can receive if last notification > 1 hour ago
- **Daily**: Can receive if last notification > 24 hours ago
- **Weekly**: Can receive if last notification > 7 days ago

---

## Test Results (Automated Suite — March 26, 2026)

| Test | Status | Notes |
|------|--------|-------|
| Verification Code Email | PASS | Code sent, resend works |
| QuickUser Welcome | PASS | Email triggered |
| QuickUser Welcome + CV | PASS | Resume uploaded to Cloudinary |
| Password Reset | PASS | Email sent |
| Password Reset (enum protection) | PASS | Returns 200 for non-existent emails |
| Job Notification | PASS | Job created, notifications triggered |
| Application Notification | PASS | Employer notified |
| Status → Shortlisted | PASS | Applicant notified |
| Status → Rejected | PASS | Applicant notified |
| Email Verification | PASS | Code sent to new email |
| Unsubscribe (invalid token) | PASS | Returns 404 |
| Edge: Empty email | PASS | Rejected (400) |
| Edge: Invalid email format | PASS | Rejected (400) |
| Edge: XSS in name | PASS | Rejected (400) — HTML stripped |
| Edge: Long name (100 chars) | PASS | Rejected (400) — max 50 |
| Auth: Stats without token | PASS | Rejected (401) |
| Auth: Test-job-match without token | PASS | Rejected (401) |
| Auth: Manual-notify without token | PASS | Rejected (401) |
| Application Messaging | N/A | Template ready, no API endpoint yet |

**Overall: 21/23 PASS, 2 N/A (messaging endpoint not built yet)**

---

## Known Issues / Production Checklist

1. **Clean test data before launch**: Remove test QuickUsers with fake names (Rate Test, Quick Test, aaa, `<script>` names)
2. **Disable EMAIL_TEST_MODE**: Remove or set to `false` so emails go to real users
3. **Set FRONTEND_URL**: Currently defaults to localhost — must be `https://advance.al`
4. **OpenAI quota**: API key currently at quota limit (429 errors). Top up billing for CV parsing + embeddings
5. **Daily/weekly digest**: Endpoints exist but are stubs — not yet implemented
6. **Application messaging**: Email template ready but no API endpoint for sending messages on applications
7. **SMS**: Twilio not configured — SMS notifications will silently skip
