#!/usr/bin/env bash
#
# Sharded cross-browser runner. Splits the 87 overnight spec files into 5
# shards, runs each shard in a separate `npx playwright test` invocation
# (= fresh global-setup, fresh launcher, fresh process pool). This avoids
# the Playwright process-pool exhaustion that aborted the earlier WebKit
# full run at ~700 tests.
#
# Usage:
#   ./e2e/run-cross-browser-sharded.sh <project> [shards]
# Examples:
#   ./e2e/run-cross-browser-sharded.sh webkit
#   ./e2e/run-cross-browser-sharded.sh mobile-chrome 6
#   ./e2e/run-cross-browser-sharded.sh mobile-safari
#
# Output: per-shard list reporter to stdout, JSON results to
# test-results/sharded-<project>-<n>.json, aggregate summary at end.

set -u

PROJECT="${1:-webkit}"
SHARDS="${2:-5}"

case "$PROJECT" in
  webkit|mobile-chrome|mobile-safari|firefox|chromium) ;;
  *) echo "[runner] unknown project: $PROJECT"; exit 2 ;;
esac

cd "$(dirname "$0")/.."

# Ensure no stale launcher / vite / backend from prior runs.
cleanup_stale() {
  pkill -9 -f "start-test-server.mjs" 2>/dev/null || true
  pkill -9 -f "node.*backend.*server\\.js" 2>/dev/null || true
  pkill -9 -f "vite.*--port 5174" 2>/dev/null || true
  rm -f /tmp/real-e2e-launcher.pid 2>/dev/null || true
  sleep 2
}

mkdir -p test-results

TOTAL_PASS=0
TOTAL_FAIL=0
TOTAL_FLAKY=0
FAILED_SHARDS=()

START_TS=$(date +%s)
echo "[runner] === Cross-browser sharded run: project=$PROJECT shards=$SHARDS ==="

for SHARD in $(seq 1 "$SHARDS"); do
  echo
  echo "[runner] === Shard $SHARD/$SHARDS — project=$PROJECT ==="
  cleanup_stale

  RESULTS_FILE="test-results/sharded-${PROJECT}-${SHARD}.json"
  LOG_FILE="test-results/sharded-${PROJECT}-${SHARD}.log"

  PLAYWRIGHT_JSON_OUTPUT_NAME="$RESULTS_FILE" \
    npx playwright test \
      -c playwright.cross-browser.config.ts \
      --project="$PROJECT" \
      --shard="${SHARD}/${SHARDS}" \
      --reporter=json,list \
      > "$LOG_FILE" 2>&1
  EXIT=$?

  # Pull pass/fail counts from log (Playwright list-reporter summary line).
  PASS=$(grep -E '^\s*[0-9]+ passed' "$LOG_FILE" | tail -1 | grep -oE '[0-9]+ passed' | head -1 | grep -oE '[0-9]+' || echo 0)
  FAIL=$(grep -E '^\s*[0-9]+ failed' "$LOG_FILE" | tail -1 | grep -oE '[0-9]+ failed' | head -1 | grep -oE '[0-9]+' || echo 0)
  FLAKY=$(grep -E '^\s*[0-9]+ flaky' "$LOG_FILE" | tail -1 | grep -oE '[0-9]+ flaky' | head -1 | grep -oE '[0-9]+' || echo 0)
  PASS=${PASS:-0}; FAIL=${FAIL:-0}; FLAKY=${FLAKY:-0}

  TOTAL_PASS=$((TOTAL_PASS + PASS))
  TOTAL_FAIL=$((TOTAL_FAIL + FAIL))
  TOTAL_FLAKY=$((TOTAL_FLAKY + FLAKY))

  echo "[runner] Shard $SHARD result: pass=$PASS fail=$FAIL flaky=$FLAKY (exit=$EXIT)"
  if [ "$EXIT" -ne 0 ] || [ "$FAIL" -gt 0 ]; then
    FAILED_SHARDS+=("$SHARD")
    echo "[runner] === FAILURES in shard $SHARD ==="
    grep -E '^\s*[0-9]+\)\s|FAIL ' "$LOG_FILE" | head -40 || true
  fi
done

cleanup_stale

END_TS=$(date +%s)
ELAPSED=$((END_TS - START_TS))

echo
echo "[runner] ============================================================"
echo "[runner] SUMMARY — project=$PROJECT shards=$SHARDS elapsed=${ELAPSED}s"
echo "[runner]   total passed: $TOTAL_PASS"
echo "[runner]   total failed: $TOTAL_FAIL"
echo "[runner]   total flaky:  $TOTAL_FLAKY"
echo "[runner]   failed shards: ${FAILED_SHARDS[*]:-none}"
echo "[runner] ============================================================"

[ "$TOTAL_FAIL" -eq 0 ] && exit 0 || exit 1
