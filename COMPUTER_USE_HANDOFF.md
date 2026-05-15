# Computer Use Handoff — advance.al QA

> **Purpose:** Tasks where Computer Use (Claude desktop app) is genuinely better than Playwright. Everything else is already covered by `MANUAL_QA_GUIDE.md` (manual) or the Playwright walker (automated).
>
> **Why these tasks specifically:** Playwright runs Chromium / Firefox / WebKit *engines* in headless or headed mode. It cannot drive your real installed Safari / Chrome / Firefox apps with their installed extensions, cannot operate Mail.app / Outlook.app / Apple Mail, cannot interact with the iOS Simulator app, and cannot open third-party SaaS dashboards through your real authenticated browser sessions. Computer Use can.
>
> **How to use:** Open Claude (claude.ai or desktop app) with Computer Use enabled. Paste each section's prompt as a separate conversation (one task per conversation works best). Claude will drive your mouse/keyboard/screenshots in real time.

---

## Task A — Real email-client rendering audit

**Why Computer Use beats Playwright:** Playwright can verify the email was *sent* (Resend logs + side-channel inbox API). It cannot verify how the email *renders* in real Mail.app, real Gmail web, real Outlook desktop. Email rendering is the single biggest "looks fine in our test, looks broken in the wild" trap.

**Setup before pasting:** Trigger one of each email type from a logged-in admin or via the test flows. Make sure the test inbox (`advance.al123456@gmail.com`) is configured in:
- Apple Mail.app on the Mac
- Gmail web (logged in)
- Outlook web (logged in to a Microsoft account that has `advance.al123456` aliased, or a side test account)

**Prompt to paste into Claude with Computer Use:**

```
You are doing a manual QA pass on email rendering for advance.al. There are
22 email templates that I need verified across 3 real email clients:

1. Apple Mail.app (Mac native)
2. Gmail web (chrome browser)
3. Outlook web (chrome browser)

For each email type listed below, find the most recent matching email in the
test inbox and verify in EACH of the 3 clients. The test inbox is
advance.al123456@gmail.com (or whichever advance.al test inbox is configured).

Email types to check (find the most recent of each):
EM.1  — Welcome (jobseeker registration)
EM.2  — Welcome (employer registration, mentions "pending approval")
EM.3  — Welcome (quickuser job-alerts signup)
EM.4  — Verification 6-digit code
EM.5  — Password reset link
EM.6  — Application status: viewed
EM.7  — Application status: shortlisted
EM.8  — Application status: rejected
EM.9  — Application status: hired
EM.10 — Application message: text
EM.11 — Application message: interview_invite
EM.12 — Application message: offer
EM.13 — Application message: rejection
EM.14 — New application notification (to employer)
EM.15 — Account action: warning
EM.16 — Account action: temporary suspension
EM.17 — Account action: permanent suspension
EM.18 — Account action: account termination
EM.19 — Bulk: announcement
EM.20 — Bulk: maintenance
EM.21 — Job match alert
EM.22 — Generic transactional

For each email, in each client, verify and screenshot:
- Subject line is in Albanian and clearly summarizes the email
- "From" name is "advance.al" (not "noreply" or random)
- Logo loads (no broken-image icon)
- Body text is readable (not cramped, not too wide)
- CTA button is visible and tappable-sized (>=44px tall)
- Mobile view (resize Apple Mail window or use Gmail mobile-preview): no horizontal scroll
- Dark mode toggled on (System Settings → Appearance → Dark, or Gmail dark theme): logo + colors still readable, no white-on-white or black-on-black
- Plain-text version exists (in Apple Mail: View → Message → Plain Text Alternative; in Gmail: "..." → "Show original")
- Unsubscribe link present at the footer (where applicable)
- No stray English text mixed into Albanian copy
- No broken {{template_variable}} placeholders showing literally

For each finding, log:
- email type code (e.g., EM.4)
- client (Apple Mail / Gmail / Outlook)
- mode (light / dark)
- description of the issue
- screenshot

Compile findings into a bulleted markdown report at the end. Take a final
screenshot of the test inbox showing the count of received emails.

Start by opening Apple Mail.app and showing me the inbox. Then proceed
through each email type one at a time.
```

---

## Task B — Real-browser cross-browser audit

**Why Computer Use beats Playwright:** Playwright drives the WebKit engine (which is what Safari uses) but does NOT drive the actual Safari.app — no real Safari extensions, no real Safari Reader Mode, no real iOS Safari quirks. Same for Chrome with extensions installed, and Firefox.

**Prompt to paste:**

```
Manual cross-browser QA audit for advance.al. The site is at
http://localhost:5173 in dev (start it with `cd frontend && npm run dev` if not
already running) — or whatever staging URL I tell you.

For each browser below, walk through the smoke flow and capture screenshots:

Browsers:
1. Safari (latest, on macOS)
2. Chrome (with my installed extensions enabled — verify ad-blockers don't break the page)
3. Firefox (latest)
4. Edge (if installed)
5. Brave (if installed) — privacy mode is brutal on tracking; verify site works

Smoke flow per browser (~5 min each):
1. Open http://localhost:5173 in incognito/private mode (so cookies are fresh)
2. Screenshot the homepage
3. Click into "Punët" / Jobs nav link, screenshot listing
4. Click first job, screenshot detail
5. Click "Apliko" — should redirect to login since not authed
6. Screenshot the login page
7. Open browser DevTools (Cmd+Opt+I or F12) → Console tab
8. Screenshot the console — flag ANY red errors as findings
9. Network tab — screenshot if any 5xx or red-status requests appear
10. Try resizing window from full-width down to ~360px; screenshot at 1024px and 360px

Browser-specific things to flag:
- Safari: any JS not running? Date inputs render natively? Cmd+click new-tab works?
- Firefox: any CSS warnings about unsupported properties?
- Chrome with extensions: any ad-blockers blocking real assets (Cloudinary, Sentry)?
- Brave: any tracker-block warnings on legitimate features?

Compile findings as: browser + page + issue + screenshot. Group by browser at the end.
Pay special attention to Safari — it's the iOS browser too and tends to break in subtle ways.
```

---

## Task C — Third-party SaaS dashboard verification

**Why Computer Use beats Playwright:** I have no credentials for and cannot drive Cloudinary / Resend / Sentry dashboards. You're already logged in to those in your browser — Computer Use can drive them with your existing session.

**Prompt to paste:**

```
QA audit of third-party services advance.al uses. I should be already logged
in to each. If not, prompt me before continuing.

Services to verify:

1. Cloudinary (cloudinary.com console)
   - Open the Media Library for the advance.al cloud
   - Verify the upload preset for resumes/logos/profile-photos exists and is
     configured correctly (auth-required, max size, allowed formats)
   - Verify recent uploads from QA testing show up (filter to last 24 hours)
   - Click into one uploaded file, verify the URL pattern, file size, format
   - Take a screenshot of the dashboard showing recent uploads

2. Resend (resend.com dashboard)
   - Open Logs / Activity
   - Filter to last 24 hours
   - Verify recent QA-triggered emails are listed (from test runs)
   - Click into one email, check delivery status (delivered / bounced)
   - Verify sender domain is verified (DKIM/SPF green)
   - Screenshot the recent activity table

3. Sentry (sentry.io)
   - Open the advance.al project
   - Issues tab — any unresolved issues from last 24h?
   - For each issue: severity, count, first seen, last seen, sample stack trace
   - Performance tab — any slow transactions?
   - Verify NO PII is in error messages (no emails, no IDs in plaintext)
   - Screenshot the issues list

4. MongoDB Atlas (cloud.mongodb.com) — production database
   - Cluster health: green?
   - Connection count is reasonable (<1% of pool)
   - Recent slow queries logged?
   - Screenshot cluster overview

5. Vercel (vercel.com)
   - advance.al frontend project
   - Latest deployment status
   - Build logs — any warnings?
   - Screenshot deployments tab

6. Render (render.com) — backend
   - advance-al.onrender.com backend service
   - Memory + CPU usage graphs
   - Logs — any recent errors?
   - Screenshot resource usage

Compile findings: service + issue + severity + screenshot. Anything unusual
(unverified domain, slow queries, unresolved Sentry errors, ballooning resource
usage) is a P0/P1 finding.
```

---

## Task D — iOS Simulator / Real Device testing

**Why Computer Use beats Playwright:** Playwright simulates an iPhone *viewport* with WebKit engine. It does NOT drive Xcode's iOS Simulator app — which is the closest you get to a real iPhone without holding one. Real Simulator catches: tap-target hit testing on real touch model, native iOS scroll physics, real iOS keyboard behavior, native PWA install prompt, real Safari Web Inspector, Reader Mode, hover-on-touch.

**Setup:** Have Xcode installed with iOS Simulator. Open Simulator app and pick "iPhone 15 Pro" (or latest).

**Prompt to paste:**

```
Manual iOS QA on advance.al using Xcode iOS Simulator.

1. Open Xcode → Open Developer Tool → Simulator
2. Pick iPhone 15 Pro (latest iOS)
3. In Simulator's Safari, visit http://localhost:5173 (use the host machine's IP if
   localhost doesn't resolve from simulator — typically host.docker.internal or
   the host's LAN IP)
4. Screenshot the homepage on iPhone 15 Pro
5. Test these flows:
   - Sign up flow — does the keyboard cover the submit button? (common iOS bug)
   - Date picker on registration — does it use native iOS date wheel?
   - File upload (try uploading a resume) — does Photos / Files picker open?
   - Form scroll — does iOS auto-scroll input into view above keyboard?
   - Tap-target audit — are buttons / links < 44pt anywhere? (Apple HIG)
   - Pull-to-refresh on /jobs page — does native iOS refresh trigger?
   - Long-press on a job card — does iOS preview show?
   - PWA install prompt: Safari → Share → "Add to Home Screen" — does the icon look correct?
   - Open the installed PWA — does it run standalone (no Safari chrome)?
   - Force-touch / 3D Touch on links (newer iPhones) — preview menu?
   - Rotate to landscape — layout adapts?
   - VoiceOver: Settings → Accessibility → VoiceOver ON — swipe through homepage,
     does every interactive element get announced correctly?
   - Reduce Motion: Settings → Accessibility → Reduce Motion ON — do animations respect this?
   - Larger Text: Settings → Accessibility → Display → Larger Text → max — does
     content reflow without breaking layout?

6. Repeat the most important checks on iPad Simulator (iPad Pro 12.9").

For each finding: device + iOS version + step + screenshot + severity (P0-P3).
The biggest risks here are tap-target sizing and keyboard-covering-input —
both ship-blockers for iOS users.
```

---

## Task E — Native screen-reader accessibility audit

**Why Computer Use beats Playwright:** Playwright can check ARIA attributes statically. It cannot run a real screen reader to hear what a blind user actually experiences. The actual experience is the test.

**Prompt to paste:**

```
Native screen-reader accessibility audit for advance.al.

On Mac: enable VoiceOver with Cmd+F5. Use VO+arrow keys to navigate.
On iPhone: enable VoiceOver in Settings → Accessibility.
On Windows: install NVDA (free, nvaccess.org) and use Insert+arrow keys.

For each of these flows, do them BLINDFOLDED (or with eyes closed) using only
keyboard + screen reader. Record yourself or take notes.

Flows:
1. Land on http://localhost:5173 — VO reads page title? "advance.al — find your dream job in Albania" or similar?
2. Tab through the navigation — every link announced with meaningful text (not "link, link, link")?
3. Search for a job — search input announced as "search field, edit text"? Submit Enter — results announced?
4. Open a job detail — heading hierarchy makes sense (page title, sections)?
5. Sign up flow — every form field has a label announced (no "edit text" without context)?
6. Submit form with errors — errors announced via aria-live or as you tab back through?
7. Modal dialog (apply job) — focus trapped inside modal? Esc dismisses? Focus returns sensibly?
8. Toast notifications (success/error) — announced via aria-live="polite"?

For each finding: page + element + what was missing + actual experience + recommendation.

Common things to flag:
- Buttons without accessible labels ("Button" instead of "Apply for this job")
- Images without alt text (or with redundant alt like alt="image")
- Form fields where the label isn't programmatically associated
- Modals that don't trap focus
- Headings that skip levels (H1 → H4)
- Links that all say "Click here" / "More" without context
- Color-only conveyance of info (red error without text label)
- Skip-to-content link missing
- Loading states that don't announce ("Loading..." should be aria-live)

Compile findings ranked by severity. WCAG AA failures are P0 for accessibility-aware users.
```

---

## Task F — Real device QA on YOUR phone

**Why Computer Use beats Playwright:** This isn't really "Computer Use" since the phone is yours, but it's pasted here because it complements the Simulator task. Computer Use can prep the test environment for you, but YOU hold the phone.

**Prompt to paste (Computer Use prepares; you operate the phone):**

```
Help me prep for real-phone QA on advance.al.

1. On my Mac, get the local IP address (System Settings → Network) — show it to me
2. In my router admin or hotspot, ensure my phone is on the same WiFi
3. Generate a temporary public URL for the dev server (use ngrok if installed,
   otherwise instruct me to install: `brew install ngrok` then `ngrok http 5173`)
4. Once the public URL is ready, encode it as a QR code I can scan from my phone
   (use https://qrcode.show/ or paste the URL into a QR generator)
5. Display the QR code so I can scan with my iPhone/Android camera

Then while I test on the phone, you:
- Wait for me to report findings
- For each finding, ask clarifying questions (which iOS version? which Safari version? was JS console showing errors?)
- Help me capture screenshots from my phone (instruct AirDrop or iCloud Photos sync)
- Compile findings into a markdown table
```

---

## Task G — Real payment flow (when Paysera ships)

**Why Computer Use beats Playwright:** Real payment requires real card numbers (sandbox or live), real 3DS authentication challenges, real bank redirects. Playwright can't drive a real bank's 3DS challenge page.

**Prompt to paste (only when Paysera is wired up — not yet):**

```
QA the real Paysera payment flow on advance.al.

Setup:
- Have a Paysera sandbox/test account with test card numbers
- Have an employer account on advance.al staging environment
- Test card numbers ready (success card, declined card, 3DS-required card)

Flow:
1. Login as employer
2. Post a job that triggers a paid feature (e.g. premium tier)
3. At checkout, observe Paysera redirect — capture the URL pattern
4. Test card 1: successful payment — does the user return to advance.al with success?
   - Database: PricingRule applied? Job tier upgraded?
   - Email receipt sent?
   - Cloudinary asset uploaded if logo was part of the flow?
5. Test card 2: declined payment — clean error returned?
6. Test card 3: 3DS challenge — bank redirect, OTP entry, return to advance.al
7. Test mid-flow abandon: close the Paysera tab partway — does advance.al show "payment cancelled"?
8. Test refund flow if implemented

Findings: each step + expected vs actual + screenshot + Paysera transaction ID.
```

---

# What's NOT in here (and why)

These were considered for Computer Use handoff but rejected because Playwright already covers them well:

- ❌ Walking every public page taking screenshots — **Playwright walker does this faster, deterministically, in 3 viewports**
- ❌ Filling registration / login / post-job forms — Playwright does this
- ❌ Verifying API responses — Playwright + side-channel does this with strict assertions
- ❌ Race conditions, cron triggers — Playwright via the test side-channel
- ❌ DB state verification after mutations — Playwright via side-channel
- ❌ Cross-browser engine testing (WebKit, Firefox) — Playwright runs all 3 engines

---

# Workflow recommendation

**Phase 1 — Run automation (5 min total):**
```sh
cd frontend
./scripts/run-walker.sh
npx playwright show-report playwright-walker-report
```

Scroll through the screenshot album. ~80 screenshots × 3 viewports = ~240 images. Spot anything visually wrong → log it as a finding.

**Phase 2 — Computer Use tasks A + C (2-3 hours):**
- Task A: real email rendering — paste prompt to Claude w/ Computer Use
- Task C: third-party SaaS dashboard verification — paste prompt to Claude

These are the highest-yield Computer Use tasks because they cover what's literally invisible to Playwright.

**Phase 3 — Computer Use tasks D + E (2-3 hours):**
- Task D: iOS Simulator
- Task E: VoiceOver accessibility

**Phase 4 — Manual on your real phone (1 hour):**
- Task F (with Computer Use prep) — scan QR, walk smoke flow on your iPhone

**Phase 5 — Manual UX feel sweep (use `MANUAL_QA_GUIDE.md` Section 12):**
- This is the irreducibly human part. ~30 min of just "does this feel right?"

**Total: ~6-8 hours. About 60% automated by Playwright walker + Computer Use, 40% pure human.**

That's the closest you can get to "everything tested" without flying to a usability lab.
