#!/usr/bin/env bash
# Test-genuineness CI gate (Phase 28 — Phase 7).
#
# Counts permissive `expect([...])` matchers WITHOUT an adjacent
# `// JUSTIFIED:` comment, and own-backend `page.route` mocks. Fails CI
# if either count exceeds the locked-in floor (the floor only goes down
# over time; new permissive matchers without justification are blocked).
#
# Run locally:  ./scripts/check-test-genuineness.sh
# Run in CI:    add to .github/workflows/test.yml as a required check.

set -euo pipefail

cd "$(dirname "$0")/.."

# --- Lockfile: floor counts as of last passing run.
# Edit only DOWN — never up. If you need to raise a floor temporarily
# for a known-bad situation, justify in the commit message and open a
# follow-up ticket to bring it back down.
#
# As of 2026-05-07 (Phase 28 sprint, partial Phase 1):
#   permissive_unjustified: ~376 remaining ORs across overnight + backend
#     (was 503 before sprint; ~127 tightened so far in worst-offender files)
#   backend_mocks: 0 (Phase 14 deleted; only legitimate third-party mocks remain)
FLOOR_PERMISSIVE=380
# 5 page.route() calls in network-conditions.spec.ts are legitimate
# network-failure simulations (route.abort, slow, 500 fulfill) — they
# don't bypass real backend coverage, they exercise frontend behavior
# under adverse network conditions. Cap floor at 5; do not add more.
FLOOR_BACKEND_MOCKS=5

# --- Permissive ORs without JUSTIFIED comment immediately above ---
# Find every line matching `expect([NUM` (permissive matcher) and check
# whether the line ABOVE contains "JUSTIFIED:" (within the same comment block).
permissive_unjustified=$(
  grep -rEn "expect\(\[[0-9]+" backend/tests frontend/e2e 2>/dev/null \
    | while IFS=: read -r file line _; do
        prev_line=$(sed -n "$((line-1))p" "$file")
        # If the line above does NOT contain "JUSTIFIED:" (case-insensitive),
        # this matcher is unjustified.
        if ! echo "$prev_line" | grep -qi "JUSTIFIED:"; then
          echo "$file:$line"
        fi
      done \
    | wc -l \
    | tr -d ' '
)

# --- page.route() mocks of own backend ---
# Catches `page.route('/api/...', ...)` and `page.route('**/api/...', ...)`
# and `page.route(/api/.../, ...)` — i.e., intercepting our own backend.
# Allows third-party route mocks (cdn., googleapis, etc).
backend_mocks=$(
  grep -rEn "page\.route\(\s*['\"\`/][^'\"]*api[/'\"]" frontend/e2e 2>/dev/null \
    | wc -l \
    | tr -d ' '
)

# --- Verdict ---
fail=0

echo "=== Test genuineness gate ==="
echo

if [ "$permissive_unjustified" -le "$FLOOR_PERMISSIVE" ]; then
  echo "✅ permissive_unjustified: $permissive_unjustified (floor: $FLOOR_PERMISSIVE)"
else
  echo "❌ permissive_unjustified: $permissive_unjustified (floor: $FLOOR_PERMISSIVE) — exceeds floor by $((permissive_unjustified - FLOOR_PERMISSIVE))"
  fail=1
fi

if [ "$backend_mocks" -le "$FLOOR_BACKEND_MOCKS" ]; then
  echo "✅ backend_mocks: $backend_mocks (floor: $FLOOR_BACKEND_MOCKS)"
else
  echo "❌ backend_mocks: $backend_mocks (floor: $FLOOR_BACKEND_MOCKS) — exceeds floor by $((backend_mocks - FLOOR_BACKEND_MOCKS))"
  fail=1
fi

echo

if [ "$fail" -eq 0 ]; then
  echo "PASS — test suite genuineness within floor."
  exit 0
else
  echo "FAIL — new permissive assertions or own-backend mocks introduced."
  echo
  echo "To debug:"
  echo "  Permissive ORs without // JUSTIFIED: comment:"
  echo "    grep -rEn 'expect\\(\\[[0-9]+' backend/tests frontend/e2e | head -10"
  echo "  Own-backend page.route mocks:"
  echo "    grep -rEn \"page.route.*api[/']\" frontend/e2e | head -10"
  echo
  echo "Either tighten the assertion to assert ONE specific behavior, OR add"
  echo "a // JUSTIFIED: comment immediately above explaining why multiple codes"
  echo "are legitimately valid. See TESTING_PHILOSOPHY.md."
  exit 1
fi
