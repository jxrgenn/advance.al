#!/usr/bin/env bash
# Phase 23 finalization — extract findings + write HONEST_TEST_RESULTS.md update
set -euo pipefail

cd "$(dirname "$0")/../.."
ROOT=$PWD

RESULTS=frontend/test-results/overnight-results.json
FINDINGS=tests/results/PHASE-23-FINDINGS.md
HONEST=tests/results/HONEST_TEST_RESULTS.md

if [[ ! -f $RESULTS ]]; then
  echo "Missing $RESULTS — playwright did not produce JSON output"
  exit 1
fi

echo "Extracting findings from $RESULTS..."
node tests/scripts/extract-findings.mjs $RESULTS > /tmp/p23-findings-snapshot.md
TOTAL_FAIL=$(grep -c "^### " /tmp/p23-findings-snapshot.md 2>/dev/null || echo 0)
echo "Failure spec files: $TOTAL_FAIL"

# Write the structured findings doc (overwrite, preserve summary/format)
cat > $FINDINGS <<'HEADER'
# Phase 23 — Findings (Live)

This file is appended-to as tests are run. Each finding is a real bug discovered by a strict test. **Do not fix during the test run; fixes go in a follow-up session after user review.**

---

## Run snapshot

HEADER

cat /tmp/p23-findings-snapshot.md >> $FINDINGS

echo "Wrote $FINDINGS"
echo
echo "Done. Review $FINDINGS and decide what to triage."
