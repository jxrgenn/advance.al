# Testing Philosophy

These rules govern test code in this repository. They were established
during the Phase 28 sprint after a skeptical audit found 503 permissive
assertions, fully-mocked frontend "E2E" tests, and "deep security" tests
that were really just deployment health checks.

**Read this before adding or modifying any test.**

---

## Rule 1: Every assertion must fail when the behavior is wrong

A test that passes regardless of behavior provides no signal. The most
common offender is the permissive `.toContain([...])` matcher:

```ts
// ❌ BAD — passes whether the route returns 401, 403, or 404
expect([401, 403, 404]).toContain(r.status);

// ✅ GOOD — asserts ONE specific behavior. If it changes, the test fails.
expect(r.status).toBe(401);
```

If you genuinely cannot decide which single status is correct, **read
the route handler** in `backend/src/routes/` and `backend/src/middleware/`.
The auth middleware in particular has uniform behavior:

- No `Authorization` header → **401** always
- Invalid / expired / forged JWT → **401** always
- User not in DB / soft-deleted / suspended / banned → **401** always
- Authenticated user with wrong role (authorize middleware) → **403**

If you still need a multi-status matcher because multiple outcomes are
genuinely valid (e.g., rate limiter may fire before auth check), add
a `// JUSTIFIED:` comment explaining which scenarios produce which code:

```ts
// JUSTIFIED: jwtWrongSecret produces a token whose signature fails verification → 401.
// 429 is also acceptable — rate limiter may fire before the auth check.
expect([401, 429]).toContain(r.status);
```

The CI gate (Phase 7) will look for `expect([...])` patterns without
a `// JUSTIFIED:` comment within 3 lines above.

## Rule 2: Existence is not correctness

Asserting that something exists tells you the test ran, not that the
behavior was correct.

```ts
// ❌ BAD — passes if the function returned literally any object
const user = await getUser(id);
expect(user).toBeTruthy();

// ✅ GOOD — asserts the actual property under test
const user = await getUser(id);
expect(user.email).toBe('expected@example.com');
expect(user.userType).toBe('jobseeker');
```

The audit found 62 `toBeTruthy()` / `toBeDefined()` checks that should
have been field-correctness assertions.

## Rule 3: No tautologies

Assertions that cover all possible return values are decoration, not tests:

```ts
// ❌ BAD — covers every value the function might return
expect(result === 'expected@email.com' || result === undefined || result === null).toBe(true);

// ✅ GOOD — asserts the specific expected return
expect(result).toBe('expected@email.com');
```

If the test has no assertion that can fail, delete it. It is misleading
documentation.

## Rule 4: Real services > mocks past the system boundary

For our system, the boundary is the HTTP layer of our own backend. Inside
that boundary (between Express and Mongo, between routes and services),
do NOT mock — let the real code path run. The audit found ~55 frontend
"E2E" tests that mocked the entire backend via `page.route()`; they have
been deleted in favor of real-backend equivalents in `e2e/tests/overnight/`.

For external services beyond our control (OpenAI, Cloudinary, Resend,
Twilio), use real services in CI when possible:

| Service | Strategy |
|---|---|
| MongoDB | mongodb-memory-server (in-process, real Mongo wire protocol) |
| OpenAI | snapshot-replay (`tests/helpers/openai-snapshot.js`) — records once, replays every CI run at $0 |
| Cloudinary | real upload + cleanup, free tier ($0/run) |
| Resend | offline mock + 1 live smoke (workflow_dispatch) |
| Twilio | known gap, see `EXTERNAL_SERVICE_GAPS.md` |

`page.route()` in frontend tests is **forbidden for our own backend
routes**. It is acceptable for third-party CDNs or analytics endpoints
that don't affect product behavior.

## Rule 5: Security tests must attempt the actual attack

A test named "JWT alg:none rejected" must actually attempt the alg:none
attack, then assert the specific response. Tests that only check "endpoint
returns some auth-failure code" are theatrical — an attacker who finds
a real bypass would be silently accepted by `expect([401, 403, 404]).toContain(...)`.

Real adversarial tests live in `frontend/e2e/security/`. The lighter
prod-smoke checks (deployment health, headers, TLS) live in
`frontend/e2e/prod-smoke/` and should NOT have "security" in their name.

## Rule 6: Coverage measures execution, not correctness

90% line coverage with permissive assertions is worse than 70% coverage
with strict assertions. **Coverage is a floor metric, not a goal.**

When you exclude code from coverage, you must explain why:

```js
/* istanbul ignore next */ // REASON: unreachable — exhaustive switch's default branch
default: throw new Error(`Unknown variant: ${x}`);
```

Allowed exclusion categories:
- DB connection lost mid-request handlers
- Process exit handlers
- Truly unreachable defaults (exhaustive switches with throw)
- Framework boilerplate

**Forbidden** exclusions (must write tests for these):
- Error handlers for user-input errors — these ARE reachable
- Branches in business logic
- Anything that "might fail in production"

## Rule 7: When you discover a hidden bug, fix it

Tightening assertions exists to surface bugs that were hidden by
permissive matchers. When you find one:

1. Log it in `tests/results/PHASE-1-BUGS-DISCOVERED.md` with file:line
   and severity.
2. Fix it in the same commit (or follow-up commit) — do not "leave the
   tightened test failing for later." Failing tests in `main` train
   developers to ignore failures.
3. If the fix is risky and needs review, mark the test `it.fails(...)`
   (Jest) or `test.fail(...)` (Playwright) with a TODO comment naming
   who is on the hook to fix it.

## Rule 8: Test names must match what the code does

The audit found tests named "→ 403" whose loose `[401, 403]` matcher
hid that the code actually returns 401. The misleading name created a
false narrative about system behavior. **If the code returns X, the
test name says "→ X".** No exceptions.

---

## CI gates

The following automated checks enforce these rules (Phase 7):

- PRs that introduce a new `expect([200, 401, 403, 404])` pattern
  (multi-status array of >2 elements) without an adjacent `// JUSTIFIED:`
  comment fail the PR check.
- PRs that introduce new `expect(x).toBeTruthy()` calls in test files
  trigger a review comment asking for field-correctness assertions.
- PRs that drop coverage by >0.5% vs main fail the PR check.
- PRs that add `page.route('/api/...', ...)` mocks of own-backend routes
  fail the PR check.

---

## When in doubt

Ask: "If this test passed and the code was wrong, would I notice?"

If the answer is "no," the test is theatrical. Fix it before committing.
