# Computer Use Overnight QA — advance.al (LOCALHOST)

**One paste-ready handoff for the Claude desktop app with Computer Use enabled.** Runs on your local dev environment. Tests everything UI/UX automation can't. Documents findings to disk. Does **NOT** modify source code.

Estimated runtime: **4–7 hours unattended**. About 150 user stories across 14 sections.

---

# ✅ Everything is already running — just paste the prompt

Claude Code already started everything for you. Verify in your browser:

- **http://localhost:5174** → loads the advance.al homepage
- **http://localhost:3001/health** → returns `{"success":true,...}`
- **http://localhost:3199/__test/health** → side-channel for test DB queries

Already in place:

| Item | Status |
|---|---|
| Backend (Express :3001, fresh in-memory MongoDB) | ✅ Running, log at `/tmp/qa-overnight-backend.log` |
| Frontend (Vite :5174) | ✅ Running, log at `/tmp/qa-overnight-frontend.log` |
| Side-channel test API (:3199) | ✅ Running |
| Admin account `qa-admin-local@test.local` / `QaOvernight2026!` | ✅ Created, login verified |
| 5 sample jobs by Seed Tech Co | ✅ Seeded so /jobs has data |
| 10 Albanian cities seeded in Locations | ✅ Tiranë, Durrës, Vlorë, Shkodër, Elbasan, Korçë, Fier, Berat, Gjirokastër, Lushnjë |
| Test files on Desktop (qa-resume.pdf, qa-resume.docx, qa-logo.png, qa-photo.jpg) | ✅ Generated |
| Output folders at `~/Desktop/advance-al-qa-{date}/` | ✅ Created |
| Email diversion (`EMAIL_TEST_MODE=true`) | ✅ Active — codes log to backend log file |
| Rate limit bypass (`SKIP_RATE_LIMIT=true`) | ✅ Active — Computer Use won't get blocked |
| Production DB | ❌ Untouched — fresh in-memory replica set |

## How to read verification codes

Whenever the registration UI shows a "verification code" modal, the code is in
the backend log. From any Terminal:

```sh
grep "Verification code for {email}" /tmp/qa-overnight-backend.log | tail -1
```

Same for password reset tokens:

```sh
grep "Password reset token for {email}" /tmp/qa-overnight-backend.log | tail -1
```

## How to keep servers alive overnight

The launcher and Vite are running as background processes detached from this
chat. They will survive even if you close this Claude Code session. To check:

```sh
lsof -i :5174 -i :3001 -i :3199
# All three should show node processes
```

If anything dies overnight, restart from scratch:
```sh
# Kill everything first
for p in 5174 3001 3199; do kill $(lsof -ti :$p) 2>/dev/null; done
# Then ask Claude Code (me) to "restart the overnight QA environment"
```

## How to start the run

1. Open the **Claude desktop app** (claude.ai or the macOS app).
2. Make sure **Computer Use is enabled** for this conversation.
3. Open a fresh chat.
4. Copy **everything** between `═══ BEGIN PROMPT ═══` and `═══ END PROMPT ═══`.
5. Paste as ONE message and hit send.
6. Walk away. ~5 hours overnight.

In the morning, open `~/Desktop/advance-al-qa-{date}/SUMMARY.md`.

## "Dangerously skip permissions" — honest answer for Claude desktop

There is no exact equivalent to Claude Code's `--dangerously-skip-permissions`
in Claude desktop's Computer Use. Computer Use generally auto-approves
keystrokes, mouse clicks, scrolling, and screenshots — those run without
prompting. It MAY prompt for:
- Running terminal commands (rare in our flow — only for grep'ing the log)
- Writing files outside the designated output folder (we don't)
- Sending data to external services (we don't — all localhost)

The prompt below begins with an explicit pre-authorization paragraph:
"I (the user) hereby authorize all actions in this entire prompt in advance."
That covers most cases. If Computer Use still pauses on something, you can
also enable any "Always allow" toggle in the Claude desktop app's preferences
panel for the current session.

If you wake up and Computer Use is paused waiting for your approval on
something, just hit "Approve" and let it continue.

1. Open the Claude desktop app.
2. Make sure Computer Use is enabled.
3. Open a fresh conversation.
4. Copy **everything** between the `═══ BEGIN PROMPT ═══` and `═══ END PROMPT ═══` markers below.
5. Paste as ONE message and hit send.
6. Walk away.

In the morning, check `~/Desktop/advance-al-qa-{date}/SUMMARY.md`.

---

# The Prompt — Copy everything below

═══ BEGIN PROMPT ═══

PRE-AUTHORIZATION: I (the user) hereby authorize, in advance, every action
described in this prompt — including reading log files in /tmp/, running grep
commands in Terminal, writing screenshot/markdown files to
~/Desktop/advance-al-qa-{date}/, opening Chrome, navigating to localhost
URLs, filling forms, clicking buttons, typing text. Proceed without
asking for confirmation on any of these. Only pause to ask if you are about
to do something genuinely outside this scope (e.g., deleting files outside
the QA folder, sending real emails, making purchases, modifying source code,
running git commands, accessing production URLs).

You are running an exhaustive overnight QA pass on advance.al, a job platform.
The site is running on the user's local machine. The user is asleep. Run for
4–7 hours uninterrupted. Document findings — DO NOT FIX BUGS. The user will
fix them in the morning.

═══════════════════════════════════════════════════════════════════════════════
PROJECT CONTEXT
═══════════════════════════════════════════════════════════════════════════════

advance.al is a job marketplace platform built for Albania. Stack:
- Frontend: React 18 / TypeScript / Vite / Tailwind / Mantine UI / shadcn
- Backend: Node.js / Express 5 / MongoDB / Mongoose / JWT
- AI: OpenAI text-embedding-3-small + GPT-4o for CV generation
- Email: Resend (in test mode locally — emails captured to console logs)
- File uploads: Cloudinary (mocked locally if creds not set)
- Languages: Albanian UI (Shqip), English code

Roles in the system:
- jobseeker — looks for jobs, applies
- employer — posts jobs, reviews applicants
- admin — moderates platform
- quickuser — simple email-only signup for job alerts (separate model)

Project root: /Users/user/Documents/JXSOFT PROJECTS/albania-jobflow

═══════════════════════════════════════════════════════════════════════════════
WHAT'S ALREADY BEEN TESTED (DO NOT RE-DO THESE)
═══════════════════════════════════════════════════════════════════════════════

The following coverage already exists from prior automation rounds:

- 627 backend integration tests (Phase 1, 2, 6, 8, 9, 11, 12, 15, 18, 19, 20)
- 127 backend unit tests for models + services
- 238 real end-to-end tests with REAL backend + REAL MongoDB:
   - location: /Users/user/Documents/JXSOFT PROJECTS/albania-jobflow/frontend/e2e/tests/real-e2e/
   - covers all 157 backend endpoints, every cron job, every cascade,
     every race condition, security adversarial (JWT/role/XSS/NoSQL/etc.)
- 55 frontend E2E tests with mocked APIs
- 18 Playwright "walker" tests across desktop + mobile that captured
  128 full-page screenshots (already reviewed visually).
- 5 production bug fixes already shipped:
   - F-21: change-password now invalidates refresh tokens
   - F-22: pricing-rules POST handler aligned with schema
   - F-23: Job schema gained adminApproved + rejectionReason fields
   - W-1/W-2/W-3: Albanian translations added to homepage search bar
   - W-4: "Quick Users" → "Përdorues të Shpejtë" in admin

The full results: /Users/user/Documents/JXSOFT PROJECTS/albania-jobflow/tests/results/HONEST_TEST_RESULTS.md
Findings docs: PHASE-21/22/19-FINDINGS.md in same folder.

YOUR FOCUS is the gap automation can't fully reach:
1. Real user clicking through chained workflows (not API-injected setup)
2. UX feel — animation smoothness, loading states, empty states, error toasts
3. Visual layout at different zoom levels and screen sizes
4. Tutorial overlays / onboarding modals
5. Form validation timing (real-time vs on-blur vs on-submit)
6. Date/time/currency/phone formatting consistency
7. Modal dismissal patterns (Esc key, click outside, X button)
8. Browser back/forward state preservation
9. Albanian copy quality (find any English leaking through)
10. Accessibility (Tab navigation, focus indicators, alt text)
11. Visual bugs the screenshot album might have missed (you'll be more
    thorough than a static walkthrough — try interactions)

═══════════════════════════════════════════════════════════════════════════════
ENVIRONMENT
═══════════════════════════════════════════════════════════════════════════════

Localhost frontend: http://localhost:5174
Localhost backend:  http://localhost:3001
Backend health:     http://localhost:3001/health
                    (should return {"success":true,"message":"OK","redis":...})

VERIFY BEFORE STARTING: open http://localhost:5174. If it doesn't load,
check both terminal windows. If backend is not running, message the user
"BLOCKER: backend not running at :3001 — please start it." and stop.

═══════════════════════════════════════════════════════════════════════════════
CREDENTIALS
═══════════════════════════════════════════════════════════════════════════════

Pre-created admin (created by user before starting):
  Email:    qa-admin-local@test.local
  Password: QaOvernight2026!

You will create these accounts via the registration UI as part of the test:
  Jobseeker — generate fresh email per Story B.1
  Employer  — generate fresh email per Story C.1
  Use password QaOvernight2026! for everything

Email format convention: qa-temp-{unix_timestamp}-{role}@test.local
Job title prefix:        [QA-OVERNIGHT]
Message prefix:          [QA-OVERNIGHT]

This makes cleanup at the end trivial.

═══════════════════════════════════════════════════════════════════════════════
TEST FILES (must exist on Desktop, user prepared)
═══════════════════════════════════════════════════════════════════════════════

~/Desktop/qa-resume.pdf
~/Desktop/qa-resume.docx
~/Desktop/qa-logo.png
~/Desktop/qa-photo.jpg

If any are missing when you need them, log a finding and skip the file-upload
step but continue the rest of the story.

═══════════════════════════════════════════════════════════════════════════════
OUTPUT
═══════════════════════════════════════════════════════════════════════════════

Output root: ~/Desktop/advance-al-qa-{today_yyyymmdd}/
            (created already by user setup)

Files you write:

A. Per-finding files at: findings/F-NNN-short-title.md
   Format:
   ─────────────────────────────────────
   # F-{number} [P{0-3}] {Section X.Y} {Short title}
   **URL:** ...
   **Browser:** Chrome (whichever you're using)
   **Time:** YYYY-MM-DD HH:MM
   **User role:** logged-out / jobseeker / employer / admin
   **Steps:**
   1. ...
   2. ...
   **Expected:** ...
   **Actual:** ...
   **Screenshot:** ../screenshots/F-{number}-{n}.png
   **Console errors:** (paste from DevTools, or "none")
   **Network errors:** (red rows in DevTools Network, or "none")
   **Note:** any extra context
   ─────────────────────────────────────

B. Screenshots at: screenshots/F-{number}-{n}-{description}.png
   Take FullPage screenshots when possible. Always screenshot the bug
   state. Bonus: screenshot the EXPECTED state for comparison.

C. Progress checkpoint at: state/progress.json
   After every 5 stories, update with:
   {
     "completed_stories": ["A.1", "A.2", "B.1", ...],
     "findings_count": 17,
     "last_updated": "2026-04-30T03:24:11Z",
     "current_section": "C",
     "current_story": "C.4",
     "blockers": []
   }
   This lets you (or the user) resume if something interrupts you.

D. Final summary at: SUMMARY.md (created at the very end)
   Include:
   - Total findings by severity (P0/P1/P2/P3 counts)
   - Top 10 most critical findings (titles + links)
   - List of completed sections
   - List of any skipped/blocked sections + why
   - Total runtime
   - Final screenshot of homepage proving the site still works

═══════════════════════════════════════════════════════════════════════════════
RULES OF ENGAGEMENT
═══════════════════════════════════════════════════════════════════════════════

1. ❌ DO NOT modify source code. EVER. Only document findings.
2. ❌ DO NOT run `git push`, `git commit`, or any deploy command.
3. ❌ DO NOT delete the user's files outside the QA output folder.
4. ❌ DO NOT close terminal windows or kill the dev servers.
5. ❌ DO NOT modify .env files or credentials.
6. ❌ DO NOT install/uninstall packages.
7. ❌ DO NOT touch production. All work stays on localhost:5174 / :3001.

8. ✅ DO take frequent screenshots — even of working states. They become
   reference material.
9. ✅ DO log findings as you go, not in batches at the end.
10. ✅ DO use Chrome (open it fresh if it's not already open).
11. ✅ DO open DevTools (Cmd+Option+I) on every page and watch the Console
    tab — any red error is a finding even if the UI looks fine.
12. ✅ DO clean up state between stories (logout, clear localStorage if
    instructed) so tests are independent.
13. ✅ DO continue past failures. One broken story doesn't block others.

If you encounter ANY OS-level dialog (permission, security warning,
keychain prompt) that is unrelated to advance.al — dismiss it and continue.

If you genuinely lose your place, READ state/progress.json, find the last
completed story, and resume from the next one.

═══════════════════════════════════════════════════════════════════════════════
SEVERITY RUBRIC
═══════════════════════════════════════════════════════════════════════════════

P0 — SHIP BLOCKER. Examples:
   - Site doesn't load
   - Login broken
   - Data loss (action that doesn't save, but says it did)
   - Security flaw (PII leak, accessing other users' data, XSS executes)
   - Whole feature non-functional

P1 — Must fix before launch. Examples:
   - English text in Albanian UI
   - Form validation missing or broken
   - Email not sent for an action that should send one
   - State machine wrong (e.g., status transition allowed that shouldn't be)
   - Mobile layout broken
   - Console error on every page load

P2 — Fix in v1.1. Examples:
   - Cosmetic (alignment off by a few px)
   - Edge case (only happens with specific input)
   - Nice-to-have feature missing
   - Loading state UX could be better

P3 — Polish. Examples:
   - Animation slightly janky
   - Micro-copy could be friendlier
   - Color choice subjective
   - Tooltip wording

═══════════════════════════════════════════════════════════════════════════════
ALBANIAN UI VOCABULARY (cheatsheet — search-by-text relies on this)
═══════════════════════════════════════════════════════════════════════════════

Punët         = Jobs               Aplikimet      = Applications
Hyrje / Kyçu  = Login              Regjistrohu    = Register / Sign Up
Punëkërkues   = Jobseeker          Punëdhënës     = Employer
Profili       = Profile            Cilësimet      = Settings
Posto Punë    = Post a Job         Apliko         = Apply
Aplikuesit    = Applicants         Mesazhe        = Messages
Njoftime      = Notifications      Përdorues      = Users
Fshi          = Delete             Edito          = Edit
Ruaj          = Save               Anulo          = Cancel
Vazhdo        = Continue           Prapa          = Back
Pranoj        = Accept             Refuzoj        = Reject
Kërko         = Search             Filtra         = Filters
Diaspora      = Diaspora           Nga shtëpia    = Work from home
Sezonale      = Seasonal           Administrata   = Administration
Tiranë        = Tirana             Ngarko         = Upload
Fjalëkalimi   = Password           Email          = Email
Telefoni      = Phone              Vendndodhja    = Location
Titulli       = Title              Përshkrimi     = Description
Kategoria     = Category           Lloji i Punës  = Job Type
Përvoja       = Experience         Aftësitë       = Skills
Arsimimi      = Education          Përvojë Pune   = Work Experience
Paga          = Salary             Plot orari     = Full-time
Pjesë orari   = Part-time          Kontratë       = Contract
Praktikë      = Internship

═══════════════════════════════════════════════════════════════════════════════
WORKFLOW ORDER
═══════════════════════════════════════════════════════════════════════════════

You will complete sections A through N below in order. Each section has
multiple "user stories" — each story is a small chunk of testing with a
clear goal. Treat each story as independent. After each story:

1. If everything passed, just continue.
2. If anything failed, write a finding file F-NNN, screenshot, continue.
3. After every 5 completed stories, update state/progress.json.

Section runtimes are approximate. Total: ~5 hours.

A. Setup verification             (5 min)
B. Public pages (logged-out)      (25 min)
C. Job listing + search           (35 min)
D. Auth flows                     (40 min)
E. Jobseeker profile build        (50 min)
F. Jobseeker apply + manage       (35 min)
G. Employer onboard + post job    (45 min)
H. Employer applicant management  (35 min)
I. Admin moderation               (40 min)
J. Notifications + bulk           (20 min)
K. Edge cases + error handling    (30 min)
L. Visual feel + accessibility    (25 min)
M. Mobile responsive emulation    (25 min)
N. Cleanup + final report         (15 min)

═══════════════════════════════════════════════════════════════════════════════
SECTION A — Setup verification (5 min)
═══════════════════════════════════════════════════════════════════════════════

A.1  Verify environment is ready.
     - Open Chrome. Go to http://localhost:5174.
     - Page loads. Albanian copy throughout. Screenshot.
     - In a new tab: http://localhost:3001/health.
     - Returns JSON with success:true. Screenshot.
     - If either fails, write SUMMARY.md "BLOCKER: dev environment down"
       and stop. Otherwise continue.

A.2  Open Chrome DevTools (Cmd+Option+I). Pin Console tab.
     - Reload http://localhost:5174. Watch console for red errors.
     - Log every red error as finding (P0 if 'Uncaught', P2 otherwise).
     - Take screenshot of console state.

A.3  Verify Computer Use can write to output folder.
     - Write a test file: ~/Desktop/advance-al-qa-{date}/state/started.txt
     - Content: today's ISO timestamp.
     - If write fails, message the user and stop.

═══════════════════════════════════════════════════════════════════════════════
SECTION B — Public pages, logged-out (25 min)
═══════════════════════════════════════════════════════════════════════════════

B.1  Homepage hero + CTAs.
     - / loads. Screenshot full page.
     - Verify navigation has these links: Punët, Rreth Nesh, Punëdhënes,
       Punëkërkues. All clickable, navigate correctly.
     - Top-right: "Hyrje" + "Posto Punë" buttons.
     - Cookie banner appears at bottom on first visit. "Pranoj" + "Refuzoj"
       buttons. Click "Pranoj". Banner disappears.
     - Reload — banner does NOT reappear. Verify with screenshot.
     - Open Application tab in DevTools → Local Storage → confirm
       cookieConsent flag set with timestamp.

B.2  Footer integrity.
     - Scroll to footer. 4 columns: advance.al / Për Punëkërkuesit /
       Për Punëdhënësit / Mbështetje.
     - Click each link in footer. Each navigates correctly. None 404.
     - "Politika e Privatësisë" → /privacy.
     - "Termat e Shërbimit" → /terms.
     - Email contact link mailto: opens mail client (cancel the dialog).

B.3  /about page.
     - Page renders. Screenshot.
     - All images load (no broken image icons — sometimes a tiny gray box
       indicates broken image).
     - Albanian throughout. No "Lorem Ipsum" placeholders.

B.4  /privacy page.
     - Full GDPR document. Multiple sections (target: 14 sections).
     - "Eksporto të Dhënat" button visible somewhere on the page (or
       mention if missing — that's a finding).
     - Albanian throughout. Long page; scroll to bottom and back.

B.5  /terms page.
     - Albanian Terms of Service. Renders. Scroll to bottom.

B.6  /jobseekers landing.
     - Renders. Hero "NDERTO KARRIEREN TENDE!" or similar.
     - "Krijo Llogari" / "Regjistrohu" CTA visible.
     - All sections render — illustrations load, no broken images.

B.7  /employers landing.
     - Renders. Hero with employer-focused copy.
     - Pricing cards visible (Postim standart / Postim i promovuar).
     - "Krijo Llogari Punëdhënësi" CTA visible.

B.8  Robot assistant / floating contact.
     - Bottom-right corner has a circular floating button.
     - Click it — opens contact panel/modal.
     - Verify content. Close it (Esc or X).

B.9  Resize browser window slowly: 1920 → 1280 → 1024 → 768 → 480 → 360.
     - At each width, verify no horizontal scrollbar appears.
     - Screenshot the homepage at 1024 and 360.

B.10 Logged-out protected routes redirect.
     For each URL below, visit and verify it redirects to /login (NOT
     leaks any data, NOT shows a blank page, NOT crashes):
     - /profile
     - /admin
     - /admin/reports
     - /post-job
     - /edit-job/000000000000000000000000
     - /saved-jobs
     - /preferences
     - /employer-dashboard

B.11 NotFound route.
     - Visit /this-page-does-not-exist.
     - 404 page renders with Albanian copy + a "Kthehu te kreu" or
       similar return-home button.
     - Click it → returns to /.

B.12 Password reset page (logged-out).
     - /forgot-password renders. Form has email field + submit button.
     - Submit empty → HTML5 required-field validation OR inline error.
     - /reset-password (no token) — should show error or redirect.
     - /reset-password?token=invalid-token-here — clean error message
       in Albanian.

B.13 Unsubscribe page.
     - /unsubscribe — what does it show? Probably empty state.
     - /unsubscribe?token=invalid → error message.

B.14 Companies page (currently disabled in routing).
     - Visit /companies — should 404 or redirect (per recent product
       decision). If it shows hardcoded fake companies (TechShqip etc.)
       that's a P1 finding (mock data leaking).

B.15 Sentinel: console errors throughout B.
     - Re-check DevTools Console after this section.
     - Each unique red error → one finding.

═══════════════════════════════════════════════════════════════════════════════
SECTION C — Job listing + search (35 min)
═══════════════════════════════════════════════════════════════════════════════

Note: localhost may have few or no jobs. If /jobs is empty after tests
B.1–B.15, the rest of section C will need you to first seed data via the
employer test (Section G). For now, do what you can.

C.1  /jobs initial render.
     - Visit /jobs. Wait for jobs to render. Screenshot.
     - If empty state: "Nuk u gjetën rezultate". Note this; continue.

C.2  Search debounce.
     - Click search input. Type "developer" character by character with
       a noticeable delay between each keystroke (don't type instantly).
     - URL updates after a brief debounce delay.
     - Verify in DevTools Network tab: only ONE request fires after the
       debounce, NOT one per keystroke. (P1 if it fires per keystroke.)

C.3  Empty search state.
     - Type a string that won't match: "xyzqwertynonsense12345".
     - Empty state appears with helpful copy.
     - Clear search → all jobs return.

C.4  Quick filter toggles.
     - On the left/quick-filter sidebar, click each toggle one by one:
       Diaspora → Nga shtëpia → Part Time → Administrata → Sezonale.
     - Each toggle adds a query param to URL.
     - Each refines the result list.

C.5  Advanced filter modal.
     - Click "Shiko të gjitha filtrat" or similar to open advanced.
     - Modal opens. Has:
       - Salary range slider
       - Currency dropdown (EUR/ALL)
       - Experience levels (5 options)
       - Company name input
       - Remote checkbox
       - 14 category checkboxes
       - "Posted within" select (today/week/month)
       - SortBy select (newest / oldest / salary / title)
     - Set 3 random filters → close modal → URL updated with params.

C.6  Active filter badges.
     - After applying filters, badges appear at top showing active.
     - Click "X" on a badge → that filter clears, URL updates.
     - "Pastro filtrat" button clears all.

C.7  Sort options.
     - Sort by "Pagës më të lartë" → results re-order.
     - Sort by "Më të rejat" → newest first.
     - Verify visually that order changed.

C.8  Pagination.
     - If there are >10 jobs total: scroll to bottom.
     - Pagination control visible. Click "Page 2" or ">".
     - URL has &page=2.
     - Scroll position resets to top OR is preserved (note which).
     - Click ">" past the last page — should be disabled.

C.9  Job card details.
     - Each card shows: title, company name, city, salary range
       (if present), "ago" timestamp, save heart icon.
     - Hover effect on card (border / shadow change).
     - Click somewhere on card not the heart → navigates to detail.
     - Click heart while logged out → redirects to /login (or shows
       login modal).

C.10 Job detail page.
     - Click into any job. Detail page renders.
     - Sections: title, company, location, salary, posted date, expires,
       description, requirements (if any), apply button, similar jobs.
     - Tutorial overlay appears for first-time visitors. Click "Skip" or
       "Got it" — overlay dismisses.
     - Reload — overlay does NOT reappear.

C.11 Bogus job ID.
     - Visit /jobs/000000000000000000000000.
     - Clean Albanian "Pozicioni nuk u gjet" page. Return-home button works.

C.12 Open in new tab.
     - On /jobs, right-click a job → "Open in new tab".
     - Detail loads in new tab.

C.13 Browser back button preserves state.
     - From a job detail, click browser back → returns to /jobs with
       previous filters/scroll preserved (or top of page — note which).

C.14 Visual: card alignment.
     - Take a screenshot of /jobs with multiple jobs.
     - Verify all cards are same height (or respond gracefully if
       descriptions vary in length).
     - Spacing between cards is consistent.

C.15 Filter combos.
     - Apply: city=Tiranë + jobType=full-time + minSalary=1500.
     - URL has all three params.
     - Results match all three constraints.
     - Reload page → filters persist (read from URL).

═══════════════════════════════════════════════════════════════════════════════
SECTION D — Auth flows (40 min)
═══════════════════════════════════════════════════════════════════════════════

D.1  Register a new jobseeker (you'll keep using this account in E+F).
     - Visit /jobseekers?signup=true.
     - Generate a unique email NOW: qa-temp-{current_unix_ts}-jobseeker@test.local
     - Save this email — you'll need it. Write to state/jobseeker-email.txt
     - Fill: firstName=Anila, lastName=Krasniqi, email={the email above},
       password=QaOvernight2026!, city=Tiranë.
     - Submit Step 1 → verification code modal opens.
     - The verification code is logged to the BACKEND LOG FILE at
       /tmp/qa-overnight-backend.log in this format:
         [DEV] Verification code for {email}: 123456
     - Open Terminal (or use any shell command). Run:
         grep "Verification code for {email}" /tmp/qa-overnight-backend.log | tail -1
       That line ends with the 6-digit code.
     - Switch back to Chrome. Enter the code in the modal. Submit.
     - Should redirect to /profile with localStorage authToken set.
     - Verify in DevTools → Application → Local Storage → authToken present.
     - Screenshot the profile page just-registered state.

D.2  Logout flow.
     - Click avatar/menu top-right → Logout.
     - Redirected to / (homepage).
     - Verify Local Storage authToken is gone.
     - Visit /profile → redirects to /login.

D.3  Login back in.
     - Visit /login. Submit jobseeker email + QaOvernight2026!.
     - Redirects to /profile.
     - localStorage has authToken.

D.4  Wrong password.
     - Logout. Login with same email + "WrongPassword123!".
     - Error toast/alert in Albanian: "Email ose fjalëkalim i gabuar".
     - Does NOT distinguish between unknown email and wrong password
       (same error either way — anti-enumeration).

D.5  Unknown email.
     - Login with "definitely-not-real-99999@test.local" + any password.
     - Same generic error as D.4.

D.6  Empty submit.
     - Click "Kyçu" with both fields empty.
     - HTML5 validation triggers OR inline errors. No crash.

D.7  Forgot password flow.
     - Visit /forgot-password.
     - Submit jobseeker email.
     - Generic success message ("If this email exists, you'll receive...").
     - Run in Terminal:
         grep "Password reset token for {email}" /tmp/qa-overnight-backend.log | tail -1
     - The line ends with the token. Copy it.
     - Visit /reset-password?token={token-value}.
     - Form opens. Submit new password "NewQaOvernight2026!".
     - Success message. Redirected to /login.
     - Login with NEW password — succeeds.
     - Login with OLD password QaOvernight2026! — fails 401.
     - Note: jobseeker password is now NewQaOvernight2026! Use it for
       remaining stories.

D.8  Reset token reuse.
     - Try to use the same reset token again at /reset-password?token=...
     - Should fail "token already used" or "invalid token".

D.9  Tampered reset token.
     - /reset-password?token=just-a-fake-string — clean error.

D.10 Change password while logged in.
     - Login as jobseeker. Find "Ndrysho fjalëkalimin" / Change password
       in profile/settings.
     - Submit current=NewQaOvernight2026!, new=AnotherChange2026!.
     - Success.
     - Logout → login with AnotherChange2026! → succeeds.
     - The current jobseeker password is now AnotherChange2026!

D.11 5-wrong-code lockout (during registration).
     - Start a NEW registration: email=qa-temp-lockout-{ts}@test.local.
     - Get to verification modal.
     - Enter wrong code 5 times (e.g., 000000, 111111, 222222, 333333, 444444).
     - On 6th attempt, even with the correct code, registration should
       fail (the pending registration was deleted after 5 wrong tries).
     - Verify by checking backend terminal for behavior.

D.12 Suspended user login.
     - Use admin to suspend the lockout test user (this requires Section I
       to have run or you'd skip and come back). For now, log this as
     "DEFERRED — re-test after Section I".

D.13 Email case-insensitive login.
     - Login with the jobseeker email but in UPPERCASE letters.
     - Should still succeed (emails are case-insensitive per spec).

D.14 Whitespace-padded email login.
     - Login with "  {jobseeker_email}  " (leading/trailing spaces).
     - Backend should trim — should succeed.

D.15 Token survives reload.
     - When logged in, reload the page → still logged in.

═══════════════════════════════════════════════════════════════════════════════
SECTION E — Jobseeker profile build (50 min)
═══════════════════════════════════════════════════════════════════════════════

Login as jobseeker (use email + AnotherChange2026!).

E.1  Profile page initial state.
     - /profile renders.
     - Tabs: Informacion Personal / Përvojë Pune / Aplikimet / Cilësimet.
     - Stats sidebar: Aplikime / Aktive / Kompletimi (%).
     - Tutorial banner "Nuk e di si të plotësosh profilin?" visible.
     - Screenshot.

E.2  General info update.
     - On Informacion Personal tab.
     - Edit firstName="Anila Updated", lastName="Krasniqi", phone="+355681234567".
     - Save. Toast success in Albanian.
     - Reload — values persist.

E.3  Phone validation.
     - Try phone "0681234567" (no +355). Should error.
     - Try phone "+38612345" (wrong country code). Should error.
     - Try phone "+355abc123" (letters). Should error.
     - Set phone back to "+355681234567".

E.4  Bio length.
     - Type a 600-char bio. Counter visible. Submit blocked or trimmed at 500.
     - Set bio to short valid string and save.

E.5  Title field.
     - Set title = "Senior Full-Stack Developer". Save.
     - Try 150-char title — blocked at 100.

E.6  Experience dropdown.
     - Try setting to '0-1 vjet', '2-5 vjet', '5-10 vjet', '10+ vjet'.
     - Each option saves correctly.

E.7  Skills.
     - Add skill "JavaScript". Appears as chip.
     - Add: TypeScript, React, Node.js, MongoDB, AWS, Docker.
     - Click X on Docker — chip removed.
     - Try adding duplicate "JavaScript" — should be no-op (idempotent)
       or warning.
     - Save. Reload — skills persist.

E.8  Add work experience entry 1.
     - Click "Shto" / "+" on Përvojë Pune section.
     - position="Senior Developer", company="TechShqip", location="Tiranë",
       startDate="2020-01-01", endDate="2024-01-01",
       description="Led frontend team of 5".
     - Save. Entry appears.

E.9  Add work experience entry 2 (current job).
     - position="Freelancer", company="Self-employed",
       startDate="2024-01-01", isCurrentJob=YES (toggle).
     - End date should be disabled or auto-cleared.
     - Save.

E.10 Edit work experience.
     - Click edit on entry 1.
     - Change description.
     - Save. Reload — change persists.

E.11 Delete work experience.
     - Delete entry 2.
     - Confirm dialog appears.
     - Confirm. Entry removed.
     - Reload — only entry 1 remains.

E.12 Invalid work experience.
     - Try adding entry with endDate BEFORE startDate.
     - Validation error.
     - Try empty position. Inline error.

E.13 Add education entry.
     - degree="Bachelor", fieldOfStudy="Computer Science",
       institution="University of Tirana",
       startDate="2014-09-01", endDate="2018-06-30".
     - Save. Appears.

E.14 Add second education + edit + delete (mirror of E.10–E.11).

E.15 CV / Resume upload (PDF).
     - Find CV upload area on profile.
     - Upload ~/Desktop/qa-resume.pdf.
     - Upload progress visible. Filename + actions appear.
     - Verify: filename shown, "Shiko" or "View" button.
     - Click "Shiko" → opens in new tab. Verify renders.

E.16 CV upload (DOCX).
     - Replace with ~/Desktop/qa-resume.docx. Same flow.

E.17 CV size/type rejection.
     - Try uploading any small .txt file (e.g. /tmp/test.txt). Should
       error "PDF/DOCX only".
     - Try uploading a 10MB+ file (create with `dd if=/dev/zero
       of=/tmp/big.pdf bs=1M count=11`). Should error "max 5MB".

E.18 AI CV generation.
     - Click "Krijo CV me AI" / generate AI CV.
     - Loading spinner 5–30s. (May fail if OpenAI key not configured
       locally — log finding "OpenAI not configured locally" if so.)
     - DOCX downloads. Open in Pages/Word.
     - Verify: name, sections, Albanian language, no Lorem Ipsum.

E.19 Resume parsing (auto-fill from CV).
     - "Plotëso nga CV" or similar. Upload qa-resume.docx.
     - Profile fields auto-populate.

E.20 Profile photo upload.
     - Upload ~/Desktop/qa-photo.jpg.
     - Preview. Save. Persists.
     - Try uploading SVG or .gif — should be rejected (security).

E.21 Saved jobs interaction (read-only here; we'll save in section F).
     - /saved-jobs as logged-in jobseeker — empty state if no saves yet.

E.22 Notification preferences.
     - /preferences. Toggle "Email notifications" off. Save. Reload —
       persists.

E.23 GDPR data export.
     - Click "Eksporto të Dhënat" wherever it exists.
     - JSON file downloads.
     - Open file in any text editor.
     - Verify: NO password, NO refreshTokens, NO passwordResetToken.
     - Should have profile, applications, etc.

E.24 Cookie consent recorded.
     - DevTools → Application → check that cookieConsent is recorded
       per user (User.consentTracking.cookieConsentAt should be set —
       can verify via /api call OR just take it on faith).

E.25 Console clear-state check.
     - After E section: any new console errors?

═══════════════════════════════════════════════════════════════════════════════
SECTION F — Jobseeker apply + manage (35 min)
═══════════════════════════════════════════════════════════════════════════════

The jobseeker is logged in. We need jobs to apply to. Section G will create
some — for now, do what you can with whatever's already in /jobs.

F.1  Browse jobs.
     - /jobs. Scroll. Visual sanity.

F.2  Save a job.
     - Click heart icon on first job. Toast "Ruajtur".
     - Heart fills.

F.3  Save 5 jobs total. Each persists.

F.4  Visit /saved-jobs. All 5 visible.

F.5  Unsave a job from /saved-jobs.
     - Click heart on first → removes. List shrinks.

F.6  Save same job twice (idempotent).
     - Spam-click heart on a job. Should toggle, not duplicate.

F.7  Apply to first available job (one-click).
     - Visit /jobs. Click into a job.
     - Click "Apliko me 1-klik" / one-click apply.
     - Confirm if asked.
     - Toast "Aplikim u dërgua".

F.8  Try to apply same job again.
     - Click apply on the same job → "Tashmë keni aplikuar" / already applied.

F.9  Apply with custom form (if any job has custom questions).
     - Find a job that requires custom answers.
     - Click "Apliko" → form modal.
     - Submit empty → required errors.
     - Fill all → submit.
     - If no custom-form job available, skip and note.

F.10 View my applications.
     - /profile → Aplikimet tab.
     - Applications listed with status, applied date.

F.11 Open an application.
     - Click into one. Detail view shows: job title, status, employer,
       message thread (if any).

F.12 Withdraw application.
     - Click "Tërhiq" / Withdraw on an app. Confirm. Status updates.
     - Try applying to that job again — should be ALLOWED (creates new app).

F.13 Empty applications state.
     - If you withdraw all + delete, empty state shows clear copy.

F.14 Console after section F — any new errors?

F.15 Logout. Move to G.

═══════════════════════════════════════════════════════════════════════════════
SECTION G — Employer onboard + post job (45 min)
═══════════════════════════════════════════════════════════════════════════════

G.1  Register a new employer.
     - /employers?signup=true.
     - Generate email: qa-temp-{ts}-employer@test.local. Save to
       state/employer-email.txt.
     - Fill 3-step form:
       Step 1: firstName="Emp", lastName="Loyer", email, password,
              city=Tiranë.
       Step 2: companyName="QA Test Co", industry=Teknologji,
              companySize=11-50.
       Step 3: phone="+355682345678", website="qatestco.al".
     - Submit → verification code modal.
     - Get code from backend terminal. Submit.
     - Should redirect to /employer-dashboard.
     - Look for "Pending approval" banner. (Logging this as a finding
       depends on whether new employers are auto-approved or manual.)

G.2  If pending approval, skip ahead — admin will approve later in I.

G.3  (After admin approves in I, return to G.4 onwards. For now, do the
     parts that don't require approval.)

G.4  Logo upload.
     - From dashboard or settings. Upload ~/Desktop/qa-logo.png.
     - Preview. Save.

G.5  Post job — wizard step 1.
     - Click "+" or "Posto Punë të Re".
     - Title: "[QA-OVERNIGHT] Senior Frontend Engineer".
     - Category: Teknologji.
     - JobType: full-time.
     - Custom industry field: "Custom Tech Industry".
     - "Vazhdo".

G.6  Wizard step 2.
     - Description: 100+ chars (use Albanian + English mix; whatever).
     - Requirements: a 5-bullet list.
     - "Vazhdo".

G.7  Wizard step 3.
     - Salary min=1500 max=3000 currency=EUR.
     - Location: Tiranë.
     - Toggle 5 platform categories ON: diaspora, ngaShtepia, partTime,
       administrata, sezonale.

G.8  Wizard step 4.
     - Application method: internal.
     - 3 custom questions:
       1. "Sa vite eksperiencë?" (text)
       2. "Disponibilitet remote?" (yes/no)
       3. "Roga dëshiruar?" (text)
     - Click "Ruaj draft".
     - Toast "Draft ruajtur".

G.9  Reload mid-flow.
     - Close the post-job tab. Reopen /post-job.
     - Form auto-restored from localStorage 'postjob-draft'.
     - Verify all values preserved.

G.10 Publish.
     - Click "Posto" / Publish.
     - Job published. Redirected to dashboard.
     - In incognito, /jobs should show "[QA-OVERNIGHT] Senior Frontend
       Engineer".

G.11 Post 3 more jobs (rapid).
     - "[QA-OVERNIGHT] Backend Engineer"
     - "[QA-OVERNIGHT] Marketing Manager"
     - "[QA-OVERNIGHT] Product Designer"
     - Each succeeds. Dashboard shows 4 jobs.

G.12 Edit job.
     - Click "Edito" on first. /edit-job/{id}.
     - All fields pre-filled.
     - Change title to "[QA-OVERNIGHT] Senior FE (Updated)". Save.
     - In incognito, /jobs shows the new title.

G.13 Close a job.
     - Mark Marketing Manager as closed.
     - In incognito, /jobs no longer shows it.

G.14 Soft-delete a job.
     - Delete Product Designer.
     - In incognito, /jobs no longer shows it. (But applicants who
       applied still see it as read-only.)

G.15 Validation: salary min > max.
     - Try posting a job with min=3000 max=1000. Should error.

G.16 Validation: title 1 char.
     - Try title "x". Should error (min length).

G.17 Validation: city not in Locations.
     - Try city="Atlantis". Should error (must be in Albania).

G.18 Verified employer companyName field locked (after admin approves).
     - Once approved (after Section I), try editing companyName in
       profile. Should be locked or rejected.
     - description, website should still be editable.

G.19 Console after G — any new errors?

═══════════════════════════════════════════════════════════════════════════════
SECTION H — Employer applicant management (35 min)
═══════════════════════════════════════════════════════════════════════════════

(Some of this requires applications to exist. The jobseeker from D.1 may
not have applied to the employer's [QA-OVERNIGHT] jobs. For better
results, log out as employer, login as jobseeker, apply to 2-3 of the
employer's [QA-OVERNIGHT] jobs, then come back as employer.)

H.1  Login as employer. /employer-dashboard.
     - Stats cards visible: Punë Aktive / Aplikues / Shikime / Punë Gjithsej.

H.2  Click into a job. Aplikuesit / Applicants tab.
     - List of applicants with status, applied date.

H.3  Filter by status.
     - All / Pending / Viewed / Shortlisted / Rejected / Hired.
     - Each filter narrows correctly.

H.4  Click an applicant.
     - Profile detail visible: name, skills, work history, education,
       resume link.
     - PII level appropriate (depends on jobseeker's privacySettings).

H.5  Mark applicant viewed.
     - Click "Pa" / Mark viewed.
     - Status updates.
     - Verify (if you can): jobseeker (in another browser/tab) gets
       notification.

H.6  Send message to applicant — text type.
     - Compose: "[QA-OVERNIGHT] Përshëndetje, ju falënderojmë për aplikimin."
     - Send.
     - Persists in thread.

H.7  Send interview_invite.
     - Pick "Interview invite" type. Body: "[QA-OVERNIGHT] Do dëshiroja
       t'ju ftoja për intervistë."
     - Sends with different UI accent (color/icon).

H.8  Send offer + rejection (each with [QA-OVERNIGHT] prefix).

H.9  Status state machine forward.
     - Pending → Viewed → Shortlisted → Hired. Each transition succeeds.

H.10 State machine backward attempt.
     - Try Hired → Rejected. Per spec, should be BLOCKED with 400
       "Cannot transition backward". (If it succeeds, that's a P1
       finding.)

H.11 Cycling Rejected → Shortlisted.
     - Ambiguous per spec. Document the actual behavior.

H.12 Custom-form review.
     - On an applicant who answered custom questions, verify each
       answer is visible with the question label.

H.13 Empty applicants state.
     - Find a job with 0 applicants. Empty state copy clear.

H.14 Search applicants.
     - If search exists in applicants list, test it.

H.15 Console after H — any new errors?

═══════════════════════════════════════════════════════════════════════════════
SECTION I — Admin moderation (40 min)
═══════════════════════════════════════════════════════════════════════════════

Login as ADMIN: qa-admin-local@test.local / QaOvernight2026!

I.1  /admin loads.
     - Dashboard cards: Total Users, Active Jobs, Applications, Revenue.
     - Recent activity feed populated.
     - Top categories chart.
     - Top cities chart.
     - Verify counts match reality (jobseeker + employer + admin = 3-4 users).

I.2  /admin Users tab.
     - List users. Filter by userType.
     - Search "qa-temp" — should find your jobseeker + employer.

I.3  Approve pending employer (from G.1).
     - Find the employer (qa-temp-...employer@test.local).
     - Click "Aprovoje" / Approve.
     - Status changes to "active". Verified=true.
     - Now go back and finish G.4–G.18 if you didn't.

I.4  Suspend a test user.
     - Find a test user (NOT the QA admin, NOT yourself).
     - Click "Pezullo" / Suspend.
     - Reason: "[QA-OVERNIGHT] Test suspension".
     - Duration: 1 day.
     - Status updates.

I.5  Login as suspended user (in another browser/incognito).
     - Login attempt → 403 with "account suspended" message.

I.6  Activate (un-suspend) — same user.
     - Status returns to active. User can login.

I.7  Ban a test user (with cascade).
     - Find a test EMPLOYER. Ban.
     - Status updates. Their active jobs cascade-close.
     - Verify in /admin Jobs tab: their jobs all show closed.

I.8  Soft-delete a user.
     - Soft-delete a non-essential test user. Confirm.
     - User.isDeleted=true.

I.9  Self-action prevention.
     - On qa-admin-local@test.local row, try Suspend.
     - Should be BLOCKED: "Cannot self-action".

I.10 Cannot delete other admins.
     - If 2 admins exist, try deleting the other. Blocked: 403.

I.11 Jobs admin tab.
     - List of all jobs.
     - Filter pending_approval.
     - Approve a pending job → status active, adminApproved=true persists.
     - Reject another with reason → status rejected, rejectionReason persists.
     - Feature a job → tier=premium.
     - Soft-delete a job.

I.12 Pending jobs view.
     - /admin/jobs/pending or similar — shows only pending_approval.

I.13 Reports queue.
     - /admin/reports.
     - List of reports.
     - Filter by status / priority / category.
     - Click into a report — full detail.

I.14 Take action on a report.
     - Action: warning. Reason: "[QA-OVERNIGHT] Test warning".
     - ReportAction created. Email to target user.

I.15 Update report status.
     - status: pending → under_review → resolved.
     - Each transition succeeds.

I.16 Reopen closed report.
     - Click "Rihap". Status → pending again.

I.17 Escalation race verification (F-8 fix).
     - Setup: in 3 different incognito windows, logged in as 3 different
       jobseekers. Have each one report the same target user.
     - After 3rd report, check /admin/reports — target's reports priority
       is "high".
     - After 5th report, priority is "critical", escalated=true.
     (If you can't easily set up 3 jobseekers, skip and note as
     "DEFERRED — needs 3+ jobseekers".)

I.18 Bulk notifications.
     - /admin/bulk-notifications or admin tab.
     - Compose: title="[QA-OVERNIGHT] Welcome to advance.al",
       message="[QA-OVERNIGHT] Test bulk", type=announcement,
       targetAudience=jobseekers, deliveryChannels.inApp=true,
       email=false.
     - Send.
     - In another browser as jobseeker → bell icon shows new notification.

I.19 Scheduled bulk.
     - Same form. Set scheduledFor=tomorrow's date.
     - Status=draft. NOT immediately sent.

I.20 Configuration init defaults.
     - /admin/configuration or system settings.
     - Click "Initialize defaults".
     - Settings created.

I.21 Maintenance mode toggle.
     - Toggle ON.
     - In another browser as non-admin, site shows maintenance message.
     - Toggle OFF. Site returns.

I.22 Pricing rule (F-22 verification).
     - Create rule: name="QA Test Rule", category=industry, basePrice=28,
       multiplier=1.5.
     - Save → success (was broken pre-F-22).

I.23 Embeddings dashboard.
     - /admin/embeddings.
     - Coverage %, queue, workers visible.
     - "Backfill" button — queues tasks (or "no missing" if up-to-date).

I.24 System health view.
     - /admin/system-health or similar. Verify renders.

I.25 Console after I — any new errors?

═══════════════════════════════════════════════════════════════════════════════
SECTION J — Notifications + bulk (20 min)
═══════════════════════════════════════════════════════════════════════════════

J.1  Bell icon on logged-in pages.
     - As jobseeker, look for bell icon top-right.
     - Click it. Dropdown opens with recent notifications.

J.2  Mark single notification as read.
     - Click a notification → marked read, dot disappears.

J.3  Mark all as read.
     - Click "Shëno të gjitha si lexuar".
     - All notifications marked read.

J.4  Empty state.
     - Eventually all are read. Bell badge gone. Dropdown empty state copy.

J.5  Click into a notification.
     - Each notification has a target (job, application, etc.).
     - Click navigates to relevant page.

═══════════════════════════════════════════════════════════════════════════════
SECTION K — Edge cases + error handling (30 min)
═══════════════════════════════════════════════════════════════════════════════

K.1  Concurrent tabs.
     - Open Tab 1 logged in as jobseeker.
     - Open Tab 2 (same window) → still logged in.
     - Logout in Tab 1.
     - Switch to Tab 2 → next click triggers 401, redirect to /login.

K.2  Token expired simulation.
     - DevTools → Application → Local Storage → delete authToken.
     - Click any action. Should redirect to /login OR auto-refresh
       silently if refresh-token mechanism is on.

K.3  Network offline.
     - DevTools → Network → throttle to "Offline".
     - Click apply on a job. Toast or error shown clearly.
     - Restore network. Retry succeeds.

K.4  Slow 3G.
     - Throttle Slow 3G. Visit /jobs. Loading state visible.

K.5  Browser back/forward.
     - Walk through 3 pages. Use back. Use forward. State preserved.

K.6  Reload mid-form.
     - Start filling /post-job. Reload mid-flow.
     - Either restored OR clear "session expired" message.

K.7  XSS attempt in profile bio.
     - Set bio to "<script>alert('xss')</script>Some text".
     - Save.
     - Reload. Verify text shows escaped (no popup, no script tag executed).

K.8  Special characters everywhere.
     - Use "çëŠÇë àáâãäå" in firstName, search query, job title.
     - Each saved correctly.

K.9  Long content.
     - Try profile bio with 10,000 chars. Should error (length limit).

K.10 Spam-click apply.
     - Spam-click apply on a job 10 times.
     - Only 1 application created.

K.11 Right-click + open in new tab + cmd-click.
     - All work correctly on links.

K.12 Browser zoom.
     - Cmd+= to zoom 200%. Critical pages still usable.
     - Cmd+- to zoom 50%. Same.

K.13 Print preview.
     - Cmd+P on /jobs/:id. Preview renders sensibly.

K.14 Empty state quality.
     - Saved jobs empty / Applications empty / Notifications empty.
     - Each has Albanian copy + helpful CTA.

K.15 Cookie reject path.
     - Open new incognito. /  → click "Refuzoj" on cookie banner.
     - DevTools Network — verify NO Sentry/GA tracking calls fire.

═══════════════════════════════════════════════════════════════════════════════
SECTION L — Visual feel + accessibility (25 min)
═══════════════════════════════════════════════════════════════════════════════

L.1  Animation feel.
     - Page transitions, modal opens, toast appearances. Smooth?
     - If anything looks janky or stuttery, log P3.

L.2  Loading states.
     - On every action (login submit, save, post job), loading state
       appears within 100ms (not blank for 2s).

L.3  Hover states on interactive elements.
     - Buttons, links, cards. Visual change on hover.

L.4  Focus indicators (keyboard).
     - Click in body, then Tab through homepage. Each interactive
       element has visible focus ring.
     - If any button has no visible focus when tabbed, log P1.

L.5  Modal Escape key.
     - Open any modal. Press Esc. Modal closes.

L.6  Click outside modal.
     - Open modal. Click backdrop area. Modal closes.

L.7  Alt text on images.
     - Inspect logos/photos with DevTools. Verify alt attribute set.
     - Decorative images may have empty alt="" — that's OK.

L.8  Color contrast.
     - DevTools → Inspect any text on a button or background.
     - Accessibility panel shows contrast ratio. Body text should be
       4.5:1+, large text 3:1+. Log violations as P2.

L.9  Date formatting consistency.
     - Note all date displays across pages. Should use ONE format
       consistently (e.g., "30 Mars 2026" or "30/03/2026"). Mix = P2.

L.10 Currency formatting.
     - Same — should use one format throughout.

L.11 Phone formatting.
     - "+355 68 123 4567" consistent.

L.12 Copy quality.
     - Read 5 random Albanian sentences. Note any awkward phrasing
       (potential Google Translate output) — log as P3 with the actual
       text.

L.13 Skip-to-content link.
     - Press Tab on /. First focusable element should be a "Skip to
       main content" link (often visually hidden until focused).
     - If missing, log P2 a11y finding.

═══════════════════════════════════════════════════════════════════════════════
SECTION M — Mobile responsive emulation (25 min)
═══════════════════════════════════════════════════════════════════════════════

In Chrome DevTools, click the device toggle icon (top-left of DevTools)
to enable device emulation.

M.1  iPhone 14 Pro emulation.
     - Visit /. Screenshot.
     - Visit /jobs. Screenshot.
     - Visit /jobs/:id. Click apply.
     - On any form, verify keyboard does NOT cover submit button.
     - Hamburger menu opens drawer? Drawer closes properly?
     - All buttons ≥ 44×44 visually.
     - No horizontal scroll on any page.

M.2  Pixel 7 emulation. Same.

M.3  iPad Pro 12.9. Same. Layout adapts to wider tablet.

M.4  iPhone SE (small). Same. Verify no overflow on narrow screen.

M.5  Landscape orientation. Layout adapts.

M.6  Touch interactions.
     - Tap, long-press, swipe (if any swipe UI). Verify behavior.

═══════════════════════════════════════════════════════════════════════════════
SECTION N — Cleanup + final report (15 min)
═══════════════════════════════════════════════════════════════════════════════

N.1  Login as admin. /admin Users.
     - Find all "qa-temp-*" users from this run.
     - Soft-delete each.

N.2  /admin Jobs.
     - Find all "[QA-OVERNIGHT]" jobs.
     - Delete each.

N.3  Verify on /jobs (incognito) — no [QA-OVERNIGHT] jobs visible.

N.4  Logout admin.

N.5  Generate SUMMARY.md at ~/Desktop/advance-al-qa-{date}/SUMMARY.md.

   Format:

   # advance.al QA Overnight Run — {date}
   
   **Runtime:** {start_time} → {end_time} ({duration})
   **Sections completed:** A, B, C, D, E, F, G, H, I, J, K, L, M, N
   **Sections skipped:** (list with reason)
   
   ## Findings count
   - P0: {count}
   - P1: {count}
   - P2: {count}
   - P3: {count}
   - **Total: {count}**
   
   ## Top 10 critical findings
   1. [F-XXX P0] short title — link to file
   2. ...
   
   ## All findings
   (List each F-NNN with link)
   
   ## Blockers encountered
   (Anything that prevented sections from completing)
   
   ## Notes for the user
   - Any patterns observed (e.g., "form validation seems to only fire on
     submit, never on blur — would be better UX to validate on blur")
   - Any features that worked unexpectedly well (positive signals worth
     keeping)

N.6  Take final screenshot of homepage.

N.7  Open SUMMARY.md in default markdown viewer (e.g., `open ~/Desktop/...`).

N.8  Take a screenshot showing SUMMARY.md open on screen — this is what
     the user wakes up to.

N.9  Done. Write to state/done.txt with timestamp.

═══════════════════════════════════════════════════════════════════════════════
TROUBLESHOOTING / RECOVERY
═══════════════════════════════════════════════════════════════════════════════

If you can't find a button by label:
  - Search by Albanian text (use cheatsheet above).
  - Try icon-only buttons (heart, trash, gear).
  - Inspect DOM via DevTools to find selector.

If a modal won't dismiss:
  - Press Escape twice.
  - Click far outside the modal.
  - Hard reload (Cmd+Shift+R) and retry.

If logged out unexpectedly:
  - Re-login using credentials at top.

If backend stops responding:
  - Check terminal — is the process alive?
  - If dead: write SUMMARY blocker and stop.

If you're at section X and 1+ hour has passed:
  - You may be stuck in a loop. Check progress.json.
  - If current_story hasn't changed in 30+ min, skip ahead 5 stories
    and continue.

If Chrome crashes:
  - Reopen Chrome. Re-login. Read progress.json. Resume from
    last completed story + 1.

If Computer Use Quota / context fills up:
  - You're encouraged to keep going — re-pasting the spec is wasteful.
  - Your "memory" is your filesystem. Re-read progress.json frequently.

═══ END PROMPT ═══

---

# Morning routine (when user wakes up)

1. Open `~/Desktop/advance-al-qa-{date}/SUMMARY.md` in your favorite editor.
2. Skim the counts. P0 first.
3. Open `findings/` folder. For each P0/P1, read the markdown.
4. Reply to me (Claude Code in your project) with:
   ```
   here are findings: <paste all P0 + P1 entries>
   ```
5. I'll fix every one with code changes + add automated regression tests.
6. Re-run the relevant Phase 22 tier to confirm no regressions.

---

# Why this works

| Risk | Mitigation in this prompt |
|---|---|
| Computer Use loses context mid-run | Cheatsheet + state/progress.json checkpoints + restart-from-progress logic |
| Selectors change | Search by Albanian text + visual descriptions, not CSS selectors |
| Computer Use tries to fix code | Explicit "DO NOT modify source code" rule at top |
| Deletes/breaks user files | Explicit forbidden actions list |
| Pollutes prod | Localhost only — explicit in environment block |
| Pollutes local with junk forever | [QA-OVERNIGHT] prefix + cleanup at Section N |
| Account locked out (5 wrong codes) | Uses admin-elevated account that doesn't go through the lockout path |
| Backend dies and user wakes to a dead site | Backend lifecycle is the user's responsibility — kept alive in their terminal |
| Computer Use stalls forever | "30+ min same story = skip 5 ahead" rule |

---

# What this prompt does NOT do

- Does NOT call the real Cloudinary API (your local backend mocks it unless you put real creds in backend/.env)
- Does NOT call real Resend (EMAIL_TEST_MODE=true diverts emails to console logs)
- Does NOT touch production database
- Does NOT call real OpenAI unless you have OPENAI_API_KEY in backend/.env
- Does NOT install packages or modify environment
- Does NOT commit, push, or deploy
- Does NOT run real Twilio SMS (mocked)

If you want any of those tested for real, that's a separate manual task you do
yourself the next morning.

---

# Estimated session resources

- Disk: ~500 MB of screenshots + findings markdown
- Memory (Claude desktop app): standard
- Network: localhost only (effectively zero external)
- Battery: keep laptop plugged in — 6 hours of active screen recording is heavy
- Time: 4–7 hours

---

**Final note on Computer Use limits:**

Computer Use cannot:
- Hold your real iPhone (you do this in the morning, ~15 min)
- Verify real Apple Mail.app rendering (you do this, ~10 min)
- Run native screen-reader tests rigorously (briefly tries with VoiceOver
  if you enable it; for thorough a11y use the manual guide)
- Test cross-mailbox-app email rendering (Gmail/Outlook/Apple)

Plan for ~30 min of YOUR time in the morning AFTER the run, doing:
- Real iPhone Safari pass on http://YOUR_LAN_IP:5173
- One real welcome email open in Apple Mail.app + Gmail web
- Confirm the Findings list is accurate (spot-check 5 random ones)

That, plus the overnight automation, is the practical limit of what's testable
before you put the site in front of real users.
