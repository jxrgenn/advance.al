# Testing Baseline — 2026-05-07

Snapshot of test suite state at the start of the genuineness & coverage overhaul sprint.
Plan: `/Users/user/.claude/plans/hazy-stargazing-frost.md`

## Headline numbers

| Metric | Value | Audit estimate | Notes |
|---|---|---|---|
| Backend test files | 64 | — | unit + integration, all real DB via mongodb-memory-server |
| Frontend e2e spec files | 139 | — | spread across 8 playwright configs |
| Permissive `expect([...])` ORs | **503** | 96 (×5.2 undercount) | concentrated in security tests |
| Existence-only `toBeTruthy/Defined` | 62 | 18 | mostly in unit tests |
| `page.route(` backend mocks | 34 | — | mostly Phase 14 mocked suite |
| Obvious tautologies | 6 | 12 | shallow grep — deeper audit may find more |
| Playwright configs | 8 | — | sprawling, must consolidate |
| Backend coverage | TBD | unknown | running `npm run test:coverage` now |

## Permissive OR distribution (top concentrations)

```
144  frontend/e2e/prod-smoke         (security tests are the worst)
 50  frontend/e2e/tests/real-e2e
 43  frontend/e2e/tests/overnight/jobseeker
 41  frontend/e2e/tests/overnight/employer
 38  frontend/e2e/tests/overnight/admin
 28  frontend/e2e/tests/overnight    (UJ-* + lettered files)
 27  frontend/e2e/tests/overnight/auth
 26  backend/tests/integration/phase-9
 26  backend/tests/integration       (root)
 20  frontend/e2e/tests/overnight/cross-cutting
 17  frontend/e2e/tests/overnight/domain
 10  backend/tests/integration/phase-18
  9  backend/tests/integration/phase-2
  6  backend/tests/integration/phase-15
```

**Top offending files** (worst-first targets for Phase 1):
- `A13-multi-tenant-isolation.spec.ts` — 28 permissive ORs (security test that allows 401/403/404 — masks 404 enumeration leaks)
- `A11-advanced-security.spec.ts` — 20
- `A10-deep-security.spec.ts` — 20
- `A19-business-logic.spec.ts` — 16
- `A14-file-upload-deep.spec.ts` — 13 (allows 200 on malicious uploads)
- `A16-openai-security.spec.ts` — 10

## Playwright config inventory (8 → must reduce to 3)

| Config | testDir | baseURL | webServer | Status |
|---|---|---|---|---|
| `playwright.config.ts` | `./e2e/tests` | `localhost:5173` | yes (backend+vite) | KEEP — default |
| `playwright.cross-browser.config.ts` | `./e2e/tests/overnight` | `localhost:5174` | yes | MERGE into default |
| `playwright.exploration.config.ts` | `./e2e/exploration` | `localhost:5174` | yes | DELETE (one-off audit artifacts) |
| `playwright.overnight.config.ts` | `./e2e/tests/overnight` | `localhost:5174` | yes (real backend, replSet) | MERGE into default |
| `playwright.phase-14.config.ts` | `./e2e/tests/phase-14` | `localhost:5174` | yes (vite only — backend mocked!) | DELETE after Phase 2 |
| `playwright.prod-smoke.config.ts` | `./e2e/prod-smoke` | `https://advance.al` | no | KEEP — slim down |
| `playwright.real-e2e.config.ts` | `./e2e/tests/real-e2e` | `localhost:5174` | yes | MERGE into default |
| `playwright.walker.config.ts` | `./e2e/tests/walker` | `localhost:5174` | yes | EVALUATE — likely delete |

## Test suite character analysis

### What's actually GOOD

- **Backend integration tests are real** — zero `jest.mock(` in `backend/tests/integration/`, all hit real mongodb-memory-server + real Express via supertest
- **Overnight suite (87 specs) is real** — real backend (replSet on :3199), real browser, comprehensive flow coverage. **NOT currently in CI** — should be wired in.
- **No empty `try {} catch {}` swallowing failures**
- **No `expect.soft(`** anywhere (failures still fail)
- **`.skip()` usage is legit** — only 3, all gated on missing API keys

### What's BAD

- **503 permissive ORs**: `expect([200, 401, 403, 404]).toContain(r.status)` — passes regardless of which status
- **62 existence-only checks**: `expect(user).toBeTruthy()` instead of asserting field correctness
- **34 `page.route()` mocks** — almost all in Phase 14 mocked suite; a real-backend equivalent exists in overnight/
- **8 sprawling playwright configs** — overlapping testDirs, multiple ports (5173 vs 5174), confusing maintenance burden
- **Coverage report not committed** despite 80% jest threshold being configured
- **Overnight (real, comprehensive) not in CI**; Phase 14 (mocked) IS in CI

### What's MISSING

- Real Cloudinary tests (config gracefully degrades to local storage when env missing)
- Real OpenAI tests in CI (gated to `workflow_dispatch` only)
- Real Twilio tests (Twilio not configured at all)
- Real adversarial security tests (A1–A27 are deployment health checks, not bypass attempts)

## Audit artifacts

- `tests/results/permissive-or-audit.txt` — all 503 instances, file:line:expr
- `tests/results/existence-check-audit.txt` — all 62 instances
- `tests/results/mock-route-audit.txt` — all 34 page.route calls
- `tests/results/tautology-audit.txt` — 6 obvious tautologies (more likely exist)
- `tests/results/COVERAGE_BASELINE_2026-05-07/` — coverage snapshot (pending)

## Revised scope based on findings

The audit agent significantly undercounted. Adjustments to the approved plan:

- **Phase 1 timeline extended** from 3 days → ~2 weeks (5.2× more permissive ORs to triage)
- **Phase 2 simpler than planned**: instead of "build real E2E from scratch", verify overnight covers the same flows as Phase 14 mocked, then delete Phase 14
- **Phase 7 priority bumped**: wire overnight into CI ASAP (it's the best E2E coverage we have, currently invisible)
- **Total sprint**: 7–8 weeks instead of 5–6

## Coverage baseline (real numbers, finally measured)

`cd backend && NODE_OPTIONS='--max-old-space-size=8192' npm run test:coverage`

| Metric | Actual | Threshold | Distance to 90% target |
|---|---|---|---|
| Statements | **57.2%** (3712/6489) | 80% ❌ | need +2128 statements covered |
| Branches | **42.7%** (1815/4247) | 80% ❌ | need +2007 branches covered |
| Lines | **58.6%** | 80% ❌ | — |
| Functions | **63.2%** (533/844) | 80% ❌ | need +226 functions covered |

**Test results**: 751 passed, 2 failed, 5 skipped, 758 total. **2 failing test suites** that need triage in Phase 1:
- `tests/integration/phase-15/security-adversarial.test.js` — JWT non-existent user test times out at 30s (likely flake or auth-server hang)
- `tests/integration/reports.test.js` — `admin can list reports` expects 200, gets 401 (real auth or route bug)

**The threshold check did fire** (Jest printed `coverage threshold for statements (80%) not met: 57.2%`) but our pipe-to-tail consumed the non-zero exit code. **CI gotcha to fix in Phase 7**: ensure `npm test:coverage` exit code propagates through any pipes.

### Worst-covered files (Phase 6 priority targets)

| Coverage | File | Reason untested |
|---|---|---|
| 2.7% | `src/services/cvParsingService.js` | CV parsing logic — needs Cloudinary fixtures |
| 3.9% | `src/lib/notificationService.js` | notification dispatch — needs real DB integration |
| 11.3% | `src/services/accountCleanup.js` | scheduled cleanup job |
| 13.0% | `src/services/candidateMatching.js` | matching logic |
| 16.7% | `src/services/jobEmbeddingService.js` | needs OpenAI snapshot tests (Phase 3A) |
| 18.9% | `src/config/redis.js` | Upstash Redis — likely env-gated |
| 25.9% | `src/lib/emailService.js` | Resend — needs Phase 3D expansion |
| 26.5% | `src/services/alertService.js` | error alerting |
| 42.4% | `src/services/userEmbeddingService.js` | needs OpenAI snapshot tests (Phase 3A) |
| 56.1% | `src/routes/auth.js` | many error paths untested |
| 56.2% | `src/routes/verification.js` | OTP flows |
| 60.0% | `src/routes/cv.js` | CV gen endpoint — needs OpenAI snapshot |

### Best-covered files (good baseline)

- `src/models/User.js` — 95.6%
- `src/models/JobQueue.js` — 94.4%
- `src/middleware/auth.js` — 90.6%
- Most `src/models/*` — 80%+ via `models-batch-*.test.js`

### OOM workaround applied

Default 4GB Node heap OOMs after ~6 min on full coverage run. Workaround: `NODE_OPTIONS='--max-old-space-size=8192'`. Real fix in Phase 7: audit `tests/setup/testDb.js` — `mongoServer` module-level ref is overwritten by each `connectTestDB()` call, orphaning previous in-memory mongods if a test file forgets `afterAll(closeTestDB)`.
