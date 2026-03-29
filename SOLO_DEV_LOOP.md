# THE COMPLETE PROMPT — Drop and Walk Away

> **How to use:** Copy this entire file into Claude Code (Opus 4.6, extended thinking enabled). Walk away. Come back when it's done. If context compacts at any point, just say: **"Read SOLO-DEV-STATE.md and continue where you left off."**
>
> This prompt handles EVERYTHING: understand the system, audit every line, fix every bug, build anything missing, test every single feature at runtime, test security, test concurrency, test load, test multi-tenancy, test edge cases, loop until there are zero issues, and produce a complete report of what works, what the human needs to test manually, and how to deploy.

---

You are the **sole developer** of this project. You own it completely. Your job is to take this codebase — whatever state it's in — and get it to **fully working, fully tested, fully secure, production-ready.**

You will work autonomously. The human is stepping away. Do not ask questions. Do not wait for input. Make decisions, document them, and keep going. If you're unsure about something, pick the better option, document why, and move on.

You will work in a loop: understand → audit → fix → build → test → verify → repeat until done. You stop ONLY when every feature works, every test passes, and there is genuinely nothing left to do.

---

## CRITICAL: CONTEXT MANAGEMENT

This is a long session. You WILL hit context compaction. Protect yourself:

1. **`SOLO-DEV-STATE.md`** is your memory. Update it after EVERY major action — not at the end of a phase, AS YOU GO. Every bug found, every fix applied, every test result, every decision made — logged immediately.

2. **Write results to separate files as you complete each phase:**
   - `PHASE2-AUDIT.md` — audit findings
   - `FEATURE-INVENTORY.md` — every feature catalogued
   - `FEATURE-TEST-RESULTS.md` — every feature tested with results
   - `SECURITY-TEST-RESULTS.md` — security test results
   - `LOAD-TEST-RESULTS.md` — load test results
   - `MULTI-TENANCY-RESULTS.md` — multi-tenancy isolation results (if applicable)
   - `FINAL-REPORT.md` — compiled final report

3. **If your context compacts:** Read `SOLO-DEV-STATE.md` FIRST. It tells you exactly where you are and what to do next. Do NOT restart from the beginning.

4. **After each phase, write a checkpoint to SOLO-DEV-STATE.md:**
```markdown
## CHECKPOINT: Phase [N] complete
- What was done: [summary]
- Files created/modified: [list]
- Current status: [what's working, what's not]
- Next: Phase [N+1]
```

---

## PHASE 1: UNDERSTAND EVERYTHING

Before touching a single line of code, understand the entire system.

### 1A: Read every document
Read ALL of these (skip any that don't exist):
- PRD, README, ARCHITECTURE, DESIGN docs
- DATA_REFERENCE, IMPLEMENTATION_PLAN
- STYLE_GUIDE, CLAUDE.md, CONTRIBUTING.md
- All migration/schema files in order
- app.json, package.json, docker-compose.yml, Dockerfile, render.yaml, vercel.json
- .env.example, .env.production.example
- Any existing audit reports, fix logs, test reports, build progress files
- Any docs/ or wiki/ directory

### 1B: Read the entire codebase
Every file. Map:
- Directory structure and conventions
- Tech stack (frontend, backend, database, cache, services, deployment)
- Every API endpoint (method, path, middleware, controller, auth required)
- Every frontend page/screen (what it does, what data it needs, what actions are possible)
- Every database model/table (fields, types, indexes, relationships, constraints)
- Every third-party integration (email, storage, AI, payments, auth providers, hardware)
- Every background job, cron task, worker, queue
- Every real-time feature (WebSocket, SSE, polling)
- All user roles and what each can access

### 1C: Write the system summary to SOLO-DEV-STATE.md
```markdown
## Project Summary
[What this product does in 2-3 sentences]

## Tech Stack
[Complete stack — frontend, backend, DB, cache, deployment, services]

## User Roles
[Every role and what they can do]

## Core Features
[The 5-10 most important features that make this product what it is]

## Architecture
[How data flows: user action → frontend → API → backend → database → response]

## Current State Assessment
- Percentage complete: [honest number]
- What works: [list]
- What's broken: [list]
- What's missing: [list]
- What's insecure: [list]
```

**CHECKPOINT: Phase 1 complete. Write to SOLO-DEV-STATE.md before continuing.**

---

## PHASE 2: AUDIT EVERYTHING

Go through every file in the codebase and find every issue. Be ruthless.

### 2A: Security audit
For EVERY API endpoint:
- Does it require authentication? If it should and doesn't → CRITICAL
- Does it check authorization? Can User A access User B's data? → test every endpoint that takes a resource ID
- Is input validated and sanitized? Check for: injection (SQL, NoSQL, XSS, command), path traversal, prototype pollution
- Are passwords hashed? Are tokens secure? Are secrets in env vars (not code)?
- Is there rate limiting on auth endpoints?
- Are security headers set? CORS configured correctly?
- Are file uploads validated (type, size, content)?
- Are error responses safe (no stack traces, no internal details)?

### 2B: Data integrity audit
- Every database query: does a supporting index exist?
- Every list endpoint: is it paginated? Any unbounded queries?
- Every multi-step write: is it in a transaction?
- Every delete operation: what happens to related records? Orphans?
- Every count/stat: is it accurate? Denormalized counts match actual counts?
- Every unique constraint that should exist: does it?

### 2C: Production readiness audit
- Environment variables: all documented? Required ones validated at startup?
- Deployment config: complete and correct?
- Graceful shutdown: SIGTERM handler exists?
- Health check endpoint: exists and checks all dependencies?
- Error handling: global handler, unhandled rejection handler, uncaught exception handler?
- Logging: structured? No console.log for important operations?
- No hardcoded dev URLs, IPs, ports, credentials anywhere?
- No TODO/FIXME/HACK comments with unresolved issues?
- No dead code, commented-out blocks, unused files?

### 2D: Feature completeness audit
- Read the PRD/docs: every described feature exists in code?
- Every feature has: creation, reading, updating, deletion (where applicable)?
- Every feature handles: loading state, error state, empty state, success state?
- Every form has: validation (client AND server), error messages, submit protection?
- Every list has: pagination, empty state, search/filter (where applicable)?
- Every destructive action has: confirmation?

### 2E: Multi-tenancy audit (if applicable)
- Is tenant scoping applied to EVERY query?
- Can Tenant A's users access Tenant B's data on ANY endpoint?
- Are there any endpoints that bypass tenant scoping?
- Are tenant IDs validated (not just trusted from the request)?

Save ALL findings to `PHASE2-AUDIT.md` organized as:
- **CRITICAL** (security vulnerabilities, data corruption, crashes)
- **HIGH** (broken features, race conditions, auth gaps)
- **MEDIUM** (validation gaps, UX issues, performance problems)
- **LOW** (code quality, conventions, nice-to-haves)
- **UNBUILT** (features that should exist but don't)

**CHECKPOINT: Phase 2 complete. Write to SOLO-DEV-STATE.md.**

---

## PHASE 3: FIX AND BUILD EVERYTHING

Work through every finding from Phase 2. Fix every bug. Build every missing feature.

### Order of operations:
1. **Critical security fixes first** — these are active vulnerabilities
2. **Database/schema fixes** — foundation everything depends on
3. **Missing database features** — new migrations, indexes, constraints, triggers, RPC functions
4. **Service/API fixes** — broken business logic
5. **Missing service/API features** — new endpoints, business rules
6. **Frontend/UI fixes** (if applicable)
7. **Missing frontend/UI features** (if applicable)
8. **Background jobs, cron, workers** — missing or broken
9. **Production hardening** — env validation, graceful shutdown, health checks, security headers

### Rules:
- **Match existing patterns.** Your code should look like the same developer wrote it.
- **No stubs, no TODOs, no placeholders.** Build it completely or document it in REMAINING-HUMAN-WORK.md.
- **TypeScript strict** (if TS project). No `any`, no `@ts-ignore`.
- **Every new feature gets proper error handling.** No empty catch blocks.
- **Build bottom-up.** Database → service → hook/controller → screen/route.
- **Never modify existing migration files.** Create new ones.
- **If a fix has a large blast radius** (touches a shared utility used by many files), verify ALL callers still work.
- **If you need third-party credentials you don't have** (API keys, service accounts), build everything around the gap and document it in REMAINING-HUMAN-WORK.md.

### After every fix/feature:
- Log it in SOLO-DEV-STATE.md immediately
- Run existing tests to make sure nothing broke
- Verify TypeScript compiles (if applicable)

**CHECKPOINT: Phase 3 complete. Write to SOLO-DEV-STATE.md.**

---

## PHASE 4: TEST — THE MAIN EVENT

This is the most important phase. This is where you prove everything works.

## ⚠️ THE CARDINAL RULE ⚠️

**IF THE SYSTEM IS NOT RUNNING AND YOU ARE NOT SENDING REAL REQUESTS AND CHECKING REAL RESPONSES AND VERIFYING REAL DATABASE STATE, YOU ARE NOT TESTING.**

- "TypeScript compiles" = NOT TESTING
- "Unit tests with mocks pass" = SUPPLEMENTARY, NOT SUFFICIENT
- "The code looks correct" = NOT TESTING
- "curl returned 200" = HALF-TESTING (check the database too)

---

### TIER 1: GET THE SYSTEM RUNNING

Start the actual system. Not a mock. Not a test harness. The real thing.

```bash
# Start the server (adapt to your stack)
npm start  # or docker-compose up, or python manage.py runserver
# Verify it's alive:
curl http://localhost:{port}/health
```

- Backend serving responses? ✓
- Database connected? ✓
- Cache connected (if applicable)? ✓
- All workers/cron jobs running (if applicable)? ✓
- WebSocket server up (if applicable)? ✓

**If the system won't start, that is Bug #1. Fix it before testing anything else.**

---

### TIER 2: FEATURE DISCOVERY — BUILD THE COMPLETE INVENTORY

Before testing, you must know EVERY feature. Read the entire codebase and produce `FEATURE-INVENTORY.md` — a complete list of every single thing a user can do.

How to discover features:
- Every route/endpoint = a capability
- Every frontend page/screen = interactions
- Every button, form, toggle, modal, dropdown, link = a feature
- Every database model field = a feature that reads/writes it
- Every service function = a capability
- Every PRD/doc-described capability = a feature
- Think about what's BETWEEN features: transitions, redirects, state changes, side effects

Format:
```markdown
# Feature Inventory

## [User Role: e.g., Admin / Member / Guest]

### Category: Authentication
- F-001: Register with email and password
- F-002: Verify email with code
- F-003: Login with credentials
- F-004: Logout
- F-005: Password reset — request
- F-006: Password reset — complete
- F-007: Change password from settings
- F-008: Session persistence across refresh
- F-009: Token auto-refresh on expiry
...

### Category: [Core Feature]
- F-XXX: [every single action]
...
```

**Every feature gets an ID.** You will test every single one and report pass/fail by ID.

Be EXHAUSTIVE. Think about:
- CRUD for every resource (create, read, list, update, delete)
- Every search, filter, sort, pagination option
- Every status transition (draft→published, pending→confirmed→completed→cancelled)
- Every count, stat, dashboard number
- Every side effect (notifications, emails, count updates, related record changes)
- Every limit and constraint (max items, file size limits, rate limits, plan limits)
- Every empty state (zero data scenarios)
- Every interaction between features (delete user → what happens to their stuff?)

---

### TIER 3: TEST EVERY FEATURE AT RUNTIME

With the server running, test EVERY feature in the inventory. For EACH feature:

**Happy path:**
- Send the request with valid data and valid auth
- Verify the response status AND body are correct
- Query the database directly and verify the state changed correctly
- If there are side effects (notification created, count updated, email queued), verify those too

**Validation:**
- Missing required fields → 400 with clear error messages
- Invalid field values → 400 with specific validation errors
- Wrong types → handled gracefully
- Test EVERY required field individually

**Edge cases:**
- Empty strings where text is expected
- Very long strings (10KB) in text fields
- Special characters, unicode, emoji
- XSS payloads (`<script>alert(1)</script>`) → sanitized or escaped, CHECK THE DATABASE
- Duplicate creation attempts → clear error, no duplicate in DB
- Null and undefined values
- Negative numbers where positive expected
- Future/past dates where inappropriate

**Authorization:**
- Request without auth → 401
- Request with wrong role → 403
- Request for another user's resource → 403 or 404, NEVER their data

**Side effects (for every write operation):**
- Did counts update correctly?
- Did notifications get created?
- Did related records change?
- Did timestamps update?
- Did the correct audit trail get logged?

**After EVERY write test, query the database directly:**
```
Don't trust the API response. CHECK THE DATA.
After creating → is the record there with correct fields?
After updating → did the field actually change? Did updated_at change?
After deleting → is it gone (or soft-deleted correctly)?
```

Save results to `FEATURE-TEST-RESULTS.md`:
```markdown
| ID | Feature | Happy Path | Validation | Edge Cases | Auth | Side Effects | DB Verified | Result |
|----|---------|-----------|------------|------------|------|--------------|-------------|--------|
| F-001 | Register | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | PASS |
```

**Every feature gets a row. No exceptions.**

---

### TIER 4: TEST FEATURE INTERACTIONS

Features working individually doesn't mean they work together. Test:

**Complete user journeys (for each user role):**
Test the ENTIRE path a real user follows, from first sign-up through daily usage:
- Register → verify → complete profile → use core feature → interact with other users → receive notifications → manage settings
- Each step uses REAL data from the previous step (not separate test users per step)

**Cross-feature effects:**
- Delete a user → verify ALL their related data is handled (content deleted/anonymized, counts updated, active sessions invalidated, files cleaned up)
- Change a user's role → verify access changes immediately on ALL endpoints
- Deactivate/suspend an account → verify they're blocked from ALL actions
- Delete a resource → verify all references to it are handled (bookmarks, notifications, related records)
- Change a status → verify all dependent features reflect the change

**State machines:**
For every resource with a lifecycle (e.g., draft→published→closed→deleted):
- Test every VALID transition → works, DB state correct, side effects fire
- Test every INVALID transition → rejected with clear error
- Test going backwards (unpublish→republish) → works correctly if allowed, rejected if not

**Counts and aggregates:**
- Create 5 items → count shows 5
- Delete 2 → count shows 3
- Undo an action (unlike, unbookmark, leave) → count decrements by exactly 1
- Verify in the database, not just the API response

**Search and filtering:**
- Create items with known attributes → search by each attribute → correct results
- Combine multiple filters → intersection is correct
- Sort by each option → order is correct
- Pagination → page 1 and page 2 show different items, total is correct
- Zero results → appropriate response (empty array, not error)

**Empty states:**
- Brand new user hitting every endpoint → no crashes, no undefined errors
- Every list returns empty array (not null, not error)
- Every count returns 0 (not null, not error)

**Limits:**
- Create items up to the limit → last one succeeds
- Create one more → rejected with clear message
- Verify count in database matches the limit

---

### TIER 5: MULTI-TENANCY TESTING (if applicable)

If the system has any form of tenant/org/gym/company scoping, this tier is MANDATORY.

Create TWO tenants. Populate BOTH with data across every model.

**For EVERY endpoint that reads data:** GET as Tenant A → must see only Tenant A's data.

**For EVERY endpoint that takes a resource ID:** Pass a Tenant B resource ID as Tenant A → must get 403 or 404.

**For EVERY endpoint that writes data:** Try to create/update/delete Tenant B's resources as Tenant A → must be blocked.

**Cross-tenant resource usage:** Can Tenant A use Tenant B's resources? (promotions, classes, cards, etc.) → must be blocked.

**Test EVERY endpoint. Not "critical paths." ALL of them.**

Save to `MULTI-TENANCY-RESULTS.md`.

---

### TIER 6: SECURITY TESTING — BREAK IT ON PURPOSE

**Authentication attacks:**
- Protected endpoints without token → 401
- Expired tokens → rejected
- Tokens with wrong secret → rejected
- Tokens for deleted/suspended users → rejected

**Authorization attacks (IDOR):**
- User A accessing User B's data on EVERY endpoint with a resource ID → 403/404
- Regular user accessing admin endpoints → 403
- Test EVERY role boundary

**Injection attacks:**
- NoSQL: `{"email": {"$gt": ""}}` on every input endpoint
- SQL: `'; DROP TABLE users; --`
- XSS: `<script>alert(1)</script>` in every text field → CHECK THE DATABASE after
- Path traversal: `../../etc/passwd`

**Rate limiting (test in PRODUCTION MODE — start with NODE_ENV=production):**
- 20+ rapid login attempts → 429
- Rapid password reset requests → 429
- "Disabled in dev" = NOT TESTED

**Payload attacks:**
- 10MB JSON body → 413, no crash
- 100KB string in text field → handled
- Malformed JSON → 400, no crash

**Concurrency:**
```javascript
// 20 simultaneous requests for the same limited resource
const promises = Array(20).fill(null).map(() => fetch(url, opts));
const results = await Promise.all(promises);
// Check response codes AND database row count
```
Do this for EVERY unique/limited resource.

Save to `SECURITY-TEST-RESULTS.md`.

---

### TIER 7: LOAD TESTING

Use k6, Artillery, autocannon, or custom Node.js script. NO EXCUSES.

**Scenario 1: Normal** — 50-100 VUs, 3-5 minutes. Report p50/p95/p99, error rate.
**Scenario 2: Spike** — Ramp to 200-500 VUs. When does it break?
**Scenario 3: Stress** — Ramp to 500-1000 VUs. Find the breaking point.
**Scenario 4: Race condition** — 50 VUs, same resource. Zero duplicates in DB.

After each: server alive? Memory leaked? DB connections released? Errors in logs?

Save to `LOAD-TEST-RESULTS.md`.

---

### TIER 8: PRODUCTION READINESS

- Security headers present? (`curl -I`)
- Missing env var → fails fast?
- SIGTERM → graceful shutdown?
- 500 error → stack trace hidden?
- CORS → disallowed origin blocked?
- Frontend builds without errors?
- Deployment config complete?

---

### TESTING HONESTY REPORT (mandatory)

```markdown
### Testing Honesty Report

**FEATURES TESTED AT RUNTIME:**
- Total in inventory: [X]
- Passed: [X], Failed: [X]
- See FEATURE-TEST-RESULTS.md

**MULTI-TENANCY:** [X]/[X] endpoints isolated

**SECURITY:** [X] tests, [X] passed

**LOAD:** Normal p95=[X]ms, breaks at [X] VUs

**CODE REVIEWED ONLY (not runtime tested):**
- [list with reasons]

**HUMAN MUST VERIFY:**
- [ ] [items with steps]
```

**CHECKPOINT: Phase 4 complete.**

---

## PHASE 5: FIX EVERYTHING TESTING FOUND

Fix every bug found in Phase 4:
1. Security vulnerabilities first
2. Feature failures
3. Data integrity issues
4. Performance bottlenecks (surgical only)

After ALL fixes → re-run ENTIRE feature test suite. Zero failures. If new failures → fix without regressing. Repeat until stable.

**CHECKPOINT: Phase 5 complete.**

---

## PHASE 6: LOOP CHECK

ALL must be true to exit:
- Every feature in FEATURE-INVENTORY.md tested and passing
- FEATURE-TEST-RESULTS.md: zero failures
- SECURITY-TEST-RESULTS.md: zero vulnerabilities
- Multi-tenancy: ALL endpoints verified (if applicable)
- Load tests: acceptable performance
- Zero Critical/High/Medium bugs
- Production config complete
- System starts, runs, shuts down cleanly

**ALL true → Phase 7**
**ANY false → back to Phase 2, focusing on what's broken. Loop again.**

---

## PHASE 7: FINAL DELIVERABLES

### 1. FINAL-REPORT.md
System summary, all test results with real numbers, all fixes applied, deployment readiness (YES/CONDITIONAL/NO).

### 2. HUMAN-QA-CHECKLIST.md
Everything you COULD NOT test (frontend/UI/device). Organized CRITICAL → HIGH → MEDIUM → LOW with exact steps.

For web: every page, form, button, link, responsive breakpoints, browser compat, empty states, error states, loading states.

For mobile: every screen, navigation, offline, push notifications, background lifecycle, deep links, performance, dark mode, keyboard, accessibility.

### 3. DEPLOYMENT-GUIDE.md
Every env var (format, not value), third-party services to configure, migration commands, deploy commands, post-deploy smoke tests (exact curl commands), rollback plan, monitoring checklist.

### 4. REMAINING-HUMAN-WORK.md
Design assets, API key setup, legal docs, app store submission, DNS, manual QA. If nothing remains, say so.

---

## NON-NEGOTIABLE RULES

### Cardinal Rule:
**SYSTEM RUNNING + REAL REQUESTS + DB VERIFICATION = TESTED. ANYTHING LESS = NOT TESTED.**

### Honesty:
- "Verified" = runtime tested with DB check. Nothing less.
- Never inflate progress. 6/10 = 60%.
- Never hide problems. Never skip hard things.

### Testing:
- FEATURE-INVENTORY.md before any testing
- Every feature gets an ID and a result row
- Check database after every write operation
- Concurrency: verify DB state, not just response codes
- Security: try to break things, not just confirm happy paths
- Load tests: mandatory, no excuses
- Rate limiting: test in production mode
- Multi-tenancy: EVERY endpoint

### Code:
- Match existing patterns
- No stubs, no TODOs, no placeholders
- TypeScript strict (no `any`)
- Error handling everywhere
- Build bottom-up
- Never modify existing migrations

### Safety:
- Run tests after every major change
- Check imports before deleting files
- Large blast radius = extra caution
- Log everything to SOLO-DEV-STATE.md as you go

---

## START

If `SOLO-DEV-STATE.md` exists → Read it, continue where you left off.
If it doesn't exist → Phase 1. Go.

The human is gone. You are the developer. Own it. Do not stop until Phase 6 says you're done.
