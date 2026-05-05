# MANUAL QA — pre-deploy walkthrough

**Audience:** you, sitting in front of the live staging URL with `advance.al123456@gmail.com` open in another tab.
**Time:** 30–45 min.
**Purpose:** verify the four production-code changes shipped in commit `5a89faa` (Phase 25) and the standing pre-deploy items that automation cannot reach.

---

## SECTION 1 — Phase 25 production fixes (B-009…B-012)

### B-009 — Verification code arrives via real email (Redis-ON path)

The fix: `backend/src/routes/verification.js` no longer drops codes when Redis is OFF, and the Redis-ON path is unchanged. Production has Redis ON, so this walkthrough verifies the unchanged path still works.

1. Open an incognito window. Visit `https://<your-frontend>/jobseekers?signup=true`
2. Fill the form with a fresh email like `manual-qa-${date}@gmail.com` (use your real inbox or `+tag` notation on advance.al123456@gmail.com)
3. Click submit. Expect: code-modal opens.
4. Switch to the inbox. Within ~10 seconds you should see "Kodi i Verifikimit - advance.al" with a 6-digit code.
5. Enter the code. Expect: redirected to dashboard. Token in localStorage.

**Fail signals:** no email arrives within 60s → check Resend dashboard for the send. If send was made but never delivered, check spam folder. If send was never made, verification.js + Redis interaction is broken.

---

### B-010 — Stored XSS sanitization on employer registration

The fix: `companyName`, `industry`, `description` are `stripHtml`'d on `initiate-registration`. The walkthrough below confirms (a) the script tag is stripped, (b) the displayed name is still readable.

1. Incognito. Visit `https://<your-frontend>/employers?signup=true`
2. Fill the form. In **Company Name**, paste: `TestCo<script>alert('XSS-MANUAL-QA')</script>End`
3. Fill industry, size, etc. with normal values. Submit.
4. Verify the verification code email arrives. Enter code.
5. After landing on the employer dashboard, navigate to your company profile page.

**Pass criteria:**
- ✅ No JavaScript alert dialog appears anywhere in the flow
- ✅ The displayed company name is `TestCoEnd` (or `TestCo End` with whitespace) — the `<script>...</script>` block is stripped
- ✅ Browser DevTools Console: no errors

**Fail signals:**
- ❌ An alert dialog pops up at any step → XSS still possible, do NOT deploy
- ❌ Displayed name shows literal `&lt;script&gt;` → over-escape; functional but ugly. Acceptable.
- ❌ Displayed name shows raw `<script>` characters → not sanitized at all. Do NOT deploy.

---

### B-011 — Refresh-token FIFO cap of 5

The fix: `User.addRefreshToken` now enforces `$slice: -5`. Concurrent logins past 5 evict the oldest. Walkthrough verifies the documented 5-token limit holds.

1. Pick or create a real test account (e.g. `manual-qa@advance.al`).
2. Open 6 separate incognito windows (or use 6 different browsers if you have them).
3. Log in to the same account in all 6, in sequence.
4. After window 6 logs in successfully, go back to window 1 and try to navigate to a protected page like `/profile`.
5. Window 1's session should now be invalid (oldest token evicted). It should either:
   - 401 on the next API call and redirect to /login, OR
   - Force-logout via AuthContext's auto-refresh failure path

**Pass criteria:** windows 2–6 still work. Window 1 is logged out.

**Fail signals:** window 1 still works → cap not enforced. Window 6 fails → cap is enforced from the wrong end.

---

### B-012 — `/stats/public` cache TTL

The fix: cache is bypassed when `NODE_ENV !== 'production'`. Production behavior unchanged (5 min TTL). This walkthrough verifies the production cache is doing its job (and a fresh post eventually shows up).

1. Visit `https://<your-frontend>/` and note the homepage stats numbers (totalJobs, etc.).
2. As an employer, post a new job.
3. Reload the homepage. Stats should NOT immediately reflect the new job (cache is hot).
4. Wait 5 minutes 30 seconds. Reload. Stats should now reflect the new job.

**Pass criteria:** stats update after the cache TTL expires.

**Fail signals:** stats never update → cache invalidation broken. Stats update immediately → cache is being bypassed in production (this would mean B-012's `NODE_ENV !== 'production'` gate is wrong, or `NODE_ENV` is misset on Render).

---

## SECTION 2 — Standing pre-deploy checklist (independent of Phase 25)

### Real services smoke

| Service | What to verify |
|---|---|
| Resend | Real welcome email arrives at `advance.al123456@gmail.com` end-to-end |
| Cloudinary | Profile-photo upload flows end-to-end (file appears in Cloudinary dashboard) |
| Twilio | If SMS verification is wired, send a real code to a phone you control |
| Sentry | Trigger a deliberate frontend error (paste `throw new Error('Sentry-test')` into DevTools console) — appears in Sentry within 60s |
| MongoDB Atlas | Backend connects on Render cold start (check `/health` endpoint within 60s of last user request) |
| Vercel deploy | Build succeeds, `dist/` deploys, source maps upload to Sentry per `vercel.json` |
| Render deploy | Backend exposes `/health` and `/api/jobs` from the public URL |
| CORS | Vercel domain → Render domain preflight returns 204, real GET returns 200 |

### Browser-class smoke

| Browser | Verify |
|---|---|
| Real Safari macOS | Login + post a job (Playwright WebKit ≠ real Safari, so verify here) |
| Real iPhone Safari | Open `/`, search jobs, view detail. Hamburger menu opens. |
| Real Android Chrome | Same as iPhone but on Android. |
| Real Firefox latest | Login + view profile. (Cross-browser tests should have caught most issues, but real Firefox profile differs from Playwright's.) |

### Critical paths to sanity-walk on production URL

- [ ] Homepage loads, no console errors
- [ ] `/jobs` lists jobs, filters work
- [ ] Job detail loads, "Apliko" visible
- [ ] Register jobseeker → verify code → land on dashboard
- [ ] Register employer (3-step) → admin approval → post job
- [ ] Apply to a job, see employer notification email
- [ ] As employer, change applicant status → applicant gets notification
- [ ] Forgot password → real email arrives → reset flow works
- [ ] Logout from every role → redirected to /login or /
- [ ] Cookie consent banner appears on first visit, persists after reject

### What to do if anything fails

1. Take a screenshot of the failure
2. Open DevTools Console + Network tab and copy any errors
3. Check Render logs for backend stack traces
4. Check Sentry for any captured frontend errors
5. Open a GitHub issue or revert commit `5a89faa` if blocking

---

## SECTION 3 — What automation already covered (you do NOT need to re-verify these)

For your awareness — these were verified by the test suite. Skip them.

- All 157 backend endpoints respond with documented status codes (Phase 23 + exploration)
- 799 overnight specs on chromium-desktop (Phase 23)
- 753 jest integration specs across all 18 route files (Phase 23.5)
- Refresh-token cap of 5 under controlled concurrency (B-011 unit test + concurrency-stress.spec.ts)
- Verification code in-memory fallback when Redis OFF (B-009 regression test in V.4)
- Stored XSS for `<script>alert(1)</script>` payload on companyName (RE.10) — but the deeper payload matrix (SVG, attribute, polyglot) is in `xss-deep.spec.ts`
- Cross-browser (Firefox / WebKit / Pixel 5 / iPhone 12) — see `tests/results/PHASE-26-OVERNIGHT.md` for per-browser pass/fail counts

---

## SECTION 4 — Sign-off

Once this checklist is fully ✅:
- [ ] Tag the deploy commit: `git tag v$VERSION && git push --tags`
- [ ] Document this manual-QA pass in `DEVELOPMENT_ROADMAP.md` ("Manual QA passed by [name] on [date]")
- [ ] Deploy to production
- [ ] Smoke the production URL one final time (the standing pre-deploy checklist above)

If you find a defect, file it in `tests/results/BUGS-FOUND.md` as B-013+ with severity, reproduction steps, and your initials.
