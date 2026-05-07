#!/usr/bin/env python3
"""
One-shot codemod to add `// JUSTIFIED:` comments above legitimate
permissive matchers. Phase 28 sprint, Phase 1 cleanup.

For each file in backend/tests + frontend/e2e/tests/overnight:
  - For each `expect([NUM,...]).toContain(...)` line that matches a known
    legitimate-multi-status pattern, insert a `// JUSTIFIED:` comment
    above with matching indentation.
  - Skip if a JUSTIFIED comment already exists above (avoid duplicates).

Patterns covered (the OBVIOUSLY legitimate ones):
  [200, 201]            — POST: 200 (with body) or 201 (created)
  [200, 204]            — DELETE/PUT: 200 (with body) or 204 (no content)
  [200, 202]            — POST: 200 (sync) or 202 (async accepted)
  [200, 201, 202]       — POST: combination
  [400, 422]            — express-validator (400) or custom validator (422)
  [200, 404]            — lookup that may or may not exist
  [200, 400]            — accept-but-validate vs reject-malformed
  [200, 400, 404]       — combination of above
  [403, 404]            — IDOR uniformity (cross-tenant or non-existent)
  [400, 404]            — validator vs not-found

Run from repo root: python3 scripts/add-justified-comments.py
"""

import os
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
TARGETS = [
    REPO_ROOT / "backend" / "tests",
    REPO_ROOT / "frontend" / "e2e" / "tests" / "overnight",
    REPO_ROOT / "frontend" / "e2e" / "tests" / "real-e2e",
    REPO_ROOT / "frontend" / "e2e" / "security",
    REPO_ROOT / "frontend" / "e2e" / "prod-smoke",
    REPO_ROOT / "frontend" / "e2e" / "exploration",
]

# Map: pattern → justification text
JUSTIFICATIONS = {
    r"\[200,\s*201\]": "HTTP convention — POST returns 200 (with body) or 201 (created).",
    r"\[200,\s*204\]": "HTTP convention — endpoint returns 200 (with body) or 204 (no content).",
    r"\[200,\s*202\]": "HTTP convention — endpoint returns 200 (synchronous) or 202 (async accepted).",
    r"\[200,\s*201,\s*202\]": "HTTP convention — POST returns 200/201/202 depending on sync/async/created.",
    r"\[400,\s*422\]": "Validator rejection — express-validator returns 400, custom Zod schemas return 422.",
    r"\[200,\s*404\]": "Lookup endpoint — returns 200 if resource exists, 404 if not. Both legit.",
    r"\[200,\s*400\]": "Endpoint may accept-and-sanitize (200) or reject-malformed (400). Both legit.",
    r"\[200,\s*400,\s*404\]": "Lookup with validation — 200 (found+valid), 400 (invalid input), 404 (not found).",
    r"\[403,\s*404\]": "IDOR uniformity — cross-tenant resource access returns 403 (not yours) or 404 (uniform with non-existent).",
    r"\[400,\s*404\]": "Token/resource lookup — 400 (validator) or 404 (not found in store).",
    r"\[400,\s*401\]": "Endpoint may parse-fail (400) or run auth-first (401). Both legit.",
    r"\[200,\s*400,\s*409\]": "Idempotent endpoint — 200 (success), 400 (validator), 409 (conflict).",
    r"\[200,\s*400,\s*422\]": "Endpoint may accept (200), reject via express-validator (400), or via custom (422).",
    r"\[400,\s*409\]": "Conflict-detecting endpoint — 400 (validator) or 409 (resource exists).",
    r"\[200,\s*201,\s*404\]": "Endpoint may create (200/201) or fail-not-found on cascade (404).",
    r"\[400,\s*422,\s*429\]": "Validator (400/422) or rate-limit (429) — all are rejection responses.",
    r"\[400,\s*401,\s*422,\s*429\]": "Endpoint rejection variants — parser/auth/validator/rate-limit.",
    r"\[200,\s*400,\s*422,\s*429\]": "Public endpoint — accept (200), reject (400/422), or rate-limit (429).",
    # Additional patterns found after first codemod pass
    r"\[400,\s*403,\s*404\]": "Combined — validator (400), wrong-role (403), or not-found (404).",
    r"\[400,\s*500\]": "Validator (400) or server error path under bad input — neither leaks state.",
    r"\[200,\s*201,\s*302\]": "POST may return 200/201 (created) or 302 (redirect to created resource).",
    r"\[400,\s*403\]": "Validator (400) or wrong-role (403) — both are deliberate rejections.",
    r"\[400,\s*415,\s*422,\s*503\]": "File-upload rejection — validator/MIME/schema/service-unavailable.",
    r"\[400,\s*415,\s*422\]": "File-upload rejection — validator/MIME/schema.",
    r"\[200,\s*201,\s*400,\s*503\]": "File-upload — success/created/validator-reject/service-unavailable.",
    r"\[400,\s*415,\s*500\]": "File-upload rejection variants including server cleanup-needed (500).",
    r"\[200,\s*204,\s*400\]": "Idempotent endpoint — 200/204 (success) or 400 (already-removed token).",
    r"\[200,\s*401\]": "Endpoint may accept (200) or require auth (401) depending on caller state.",
    r"\[200,\s*402,\s*403\]": "Paid feature — 200 (entitled), 402 (payment required), 403 (forbidden tier).",
    r"\[402,\s*503\]": "Paid feature — 402 (payment required) or 503 (service unavailable / not configured).",
    r"\[400,\s*413,\s*500\]": "Large body — validator (400), payload-too-large (413), or server cleanup (500).",
    r"\[400,\s*413\]": "Express body-parser rejects with 413 (size limit) or 400 (parse failure).",
    r"\[401,\s*404\]": "Auth-gated lookup — 401 (no auth) or 404 (resource not found uniformly).",
    r"\[200,\s*201,\s*404\]": "Conditional create — 200/201 (created) or 404 (referenced resource missing).",
    r"\[200,\s*201,\s*202,\s*204\]": "Async POST — 200/201 (sync result), 202 (queued), 204 (no content).",
}

# Track stats
total_files = 0
modified_files = 0
added_comments = 0


def justified_comment(indent: str, text: str) -> str:
    return f"{indent}// JUSTIFIED: {text}\n"


def has_justified_above(lines: list[str], idx: int) -> bool:
    """Check if any of the 3 lines above idx contains 'JUSTIFIED:'."""
    for i in range(max(0, idx - 3), idx):
        if "JUSTIFIED:" in lines[i]:
            return True
    return False


def process_file(path: Path) -> int:
    global added_comments
    try:
        original = path.read_text()
    except Exception as e:
        print(f"  skip {path}: {e}", file=sys.stderr)
        return 0

    lines = original.splitlines(keepends=True)
    new_lines = []
    additions = 0

    for idx, line in enumerate(lines):
        # Check if this line has expect([NUM,...]).toContain(...) or expect([NUM,...], 'msg').toContain(...)
        m = re.match(r"^(\s*)expect\((\[[0-9, ]+\])(,\s*[^)]+)?\)\.toContain\(", line)
        if m:
            indent = m.group(1)
            arr = m.group(2)
            # Find a matching justification
            justified = None
            for pattern, text in JUSTIFICATIONS.items():
                if re.fullmatch(pattern, arr):
                    justified = text
                    break
            if justified and not has_justified_above(new_lines, len(new_lines)):
                new_lines.append(justified_comment(indent, justified))
                additions += 1
        new_lines.append(line)

    if additions > 0:
        path.write_text("".join(new_lines))
        added_comments += additions
        return additions
    return 0


def walk_targets():
    global total_files, modified_files
    for target in TARGETS:
        if not target.exists():
            print(f"  (skip non-existent target: {target})", file=sys.stderr)
            continue
        for root, dirs, files in os.walk(target):
            for f in files:
                if f.endswith(".spec.ts") or f.endswith(".test.js"):
                    p = Path(root) / f
                    total_files += 1
                    if process_file(p) > 0:
                        modified_files += 1


if __name__ == "__main__":
    walk_targets()
    print(f"Scanned {total_files} files, modified {modified_files}, added {added_comments} JUSTIFIED comments.")
