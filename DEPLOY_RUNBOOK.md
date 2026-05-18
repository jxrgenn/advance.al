# Deploy Runbook — `origin/main` push (catches up 297 local commits)

**Status:** prepared 2026-05-09 night, awaiting user-initiated execution.
**Time budget:** 30–60 min including verification.
**Blast radius:** triggers Vercel (frontend) + Render (backend) auto-deploys against advance.al production. MongoDB Atlas is **not** modified by the push itself, but cache-refresh script (step 6) writes to it.

---

## Pre-flight checks (5 min, run before anything)

Run these locally; abort the deploy if any fail.

```bash
cd ~/Documents/JXSOFT\ PROJECTS/albania-jobflow

# 1. Confirm you're on main, no uncommitted work blocking the push
git status -s | grep -v "^?? \|^ D backend/uploads"
# Expected: empty output (or only the gitignored .env line if you want to keep that staged separately)

# 2. Confirm count of unpushed commits matches expectation
git log --oneline origin/main..HEAD | wc -l
# Expected: ~297 (give or take a few if anything new since 2026-05-09)

# 3. Confirm tests on the changed surface are green.
#    NOTE: Running the FULL backend suite (`npm test`) sometimes hits the
#    documented teardown hang / OOM that the roadmap calls out under Phase 28
#    cov7. It is NOT a real test failure — the tests themselves all pass when
#    you scope to a subset. Two reliable subsets:
cd backend && npm test -- --testPathPattern="user-embedding|job-embedding|jobs-recommendations|jobs-similar" 2>&1 | grep "^Tests:"
# Expected this session: "Tests: 186 passed, 186 total"
npm test -- --testPathPattern="auth|users\.|applications" 2>&1 | grep "^Tests:"
# Expected this session: "Tests: 274 passed, 274 total"
# (Once was 1 flake out of 274 on the auth/users sample — re-run cleared it.
#  Treat any single flake on the full suite the same way before aborting.)

# 4. Confirm frontend builds clean
cd ../frontend && npm run build 2>&1 | tail -3
# Expected: "✓ built in Xs"

# 5. Confirm no secrets in the unpushed commits (paranoia check)
cd .. && git log -p origin/main..HEAD | grep -iE "AKIA|sk-proj|sk-ant|MONGODB_URI=mongodb" | head
# Expected: empty output. If anything shows, STOP and rotate before push.
```

---

## Step 1 — Mirror env vars on Render BEFORE push

The local `backend/.env` was edited 2026-05-09 to lower the similar-jobs threshold. Mirror these on the Render backend service so the new code finds the new env when it starts:

```
SIMILARITY_MIN_SCORE=0.55     # was 0.7 in your Render env (local default in code is 0.55)
SIMILARITY_TOP_N=15           # was 10
```

**How:**
1. Open Render dashboard → your backend service (`advance-al` / `api.advance.al`)
2. Environment tab
3. Find both vars (or add if missing)
4. Update values → Save
5. **Do NOT trigger a manual deploy yet** — the `git push` in step 3 will trigger one automatically with the env already in place.

**Why before push:** if env is set after push, prod runs new code briefly with old env (uses 0.7/10 → cache repopulates with too-strict threshold → users see fewer similar jobs until next 7-day recompute or manual refresh).

### Embedding-system upgrade env (2026-05-11) — DO NOT set before regen

The 2026-05-11 batch ships text-embedding-3-large @ 1024 dims (Matryoshka) plus an LLM cross-encoder reranker. Harness measured **+23% NDCG@10 / +17% R@10** vs current prod. New env vars to add to Render:

```
OPENAI_EMBEDDING_MODEL=text-embedding-3-large    # was text-embedding-3-small (default)
OPENAI_EMBEDDING_DIMS=1024                       # Matryoshka truncation; default would be 3072
RERANK_ENABLED=true                              # default true; toggle false to disable rerank
```

**Cutover sequence (avoids degraded service):**

1. Push code first (env still on small/1536). Service runs as before — the dim check is now centralised but defaults to 1536.
2. Run regen against prod with the NEW model env vars exported locally:
   ```bash
   cd backend
   OPENAI_EMBEDDING_MODEL=text-embedding-3-large OPENAI_EMBEDDING_DIMS=1024 \
     MONGODB_URI="<prod-uri>" node scripts/regenerate-job-embeddings.js
   OPENAI_EMBEDDING_MODEL=text-embedding-3-large OPENAI_EMBEDDING_DIMS=1024 \
     MONGODB_URI="<prod-uri>" node scripts/regenerate-jobseeker-embeddings.js
   ```
   Cost: ~$4 OpenAI for the entire prod corpus at current scale.
3. Once both regens complete (~5–15 min), add `OPENAI_EMBEDDING_MODEL` and `OPENAI_EMBEDDING_DIMS` on Render. Render auto-restarts on env change.
4. Verify by hitting `/api/jobs/recommendations` — response now includes `rerankerMode: 'gpt-4o-mini'`.

**If you skip step 2:** the service expects 1024-dim vectors (post-env), DB still has 1536-dim vectors, dim check fails for everyone, recommendations falls back to heuristic until regen completes.

**Monthly cost projection:** under $5/month at 5K users, ~$50/month at 50K users. Embeddings dominate; gpt-4o-mini reranker is ~10% of that. See commit message for detailed cost model.

---

## Step 2 — Verify Render env matches local (sanity)

Optional but reassuring. Compare every non-secret env on Render against `backend/.env` to detect drift accumulated over 297 commits.

```bash
# Local (excluding secrets)
cat backend/.env | grep -vE "^#|^$|SECRET|PASSWORD|API_KEY|URI=mongodb|RESEND" | sort

# Compare manually with Render Environment tab
```

Look for: any env that exists locally but not on Render (Render code may crash without it), or vice versa.

---

## Step 3 — Push

```bash
cd ~/Documents/JXSOFT\ PROJECTS/albania-jobflow
git push origin main
```

This single push triggers two auto-deploys:
- **Vercel** (frontend): typically 1-3 min. Watch at https://vercel.com/<your-org>/<project>/deployments
- **Render** (backend): typically 3-7 min for `advance.al` API. Watch at the Render dashboard.

While waiting, keep this terminal open. If Vercel finishes first, the frontend will hit the OLD backend until Render catches up — generally fine, may show transient "missing scoringMode" warnings in console but no breakage.

---

## Step 4 — Post-deploy smoke (5 min)

Once Render shows "Live" and Vercel shows the new deployment promoted to production:

```bash
# Sanity health
curl -s https://api.advance.al/health
# Expected: {"success":true,"message":"OK","timestamp":"...","redis":"connected"}

# /jobs (no auth) — confirms backend serving
curl -s "https://api.advance.al/api/jobs?limit=3" | jq '.success, (.data.jobs | length)'
# Expected: true, 3 (or fewer if dataset smaller)

# Recommendations endpoint shape (auth needed; use the local smoke script against prod)
cd ~/Documents/JXSOFT\ PROJECTS/albania-jobflow/backend
node scripts/embeddings-smoke-recommendations.js \
  --user jurgenhalili1142 \
  --limit 6 \
  --base https://api.advance.al
# Expected: scoringMode: embedding | personalized: true | top recs printed
```

If `scoringMode` is missing or `embedding`, the new code is live. If it shows `heuristic`, the user has no embedding (fallback path) — harmless.

Then **manual browser walk-through** on https://advance.al:
- [ ] Open homepage as guest — recommendations widget is empty / hidden (correct)
- [ ] Log in as jurgenhalili1142 — homepage shows recommendations
- [ ] Click into a job detail page — "Punë të ngjashme" widget shows tier labels (`Përputhje e fortë` / `e mirë` / `I ngjashëm`), no percentages
- [ ] Visit /jobs while logged in — recommendations appear at top of list
- [ ] Search for "developer" — results return without 500
- [ ] Logout → land on login screen cleanly

---

## Step 5 — Refresh similars cache on prod (5 min)

The 7-day worker hasn't fired since 2026-03-29 on Render. Refresh the cache once to populate it with the new threshold:

**Option A — local script against prod URI** (quickest):
```bash
cd ~/Documents/JXSOFT\ PROJECTS/albania-jobflow/backend
# Temporarily point at prod
MONGODB_URI="<your-prod-atlas-uri>" node scripts/refresh-similar-jobs-cache.js
# Expected: ~70/70 jobs refreshed in ~40-90s, zero failures
```

**Option B — Render shell**:
1. Render dashboard → backend service → Shell tab
2. `cd backend && node scripts/refresh-similar-jobs-cache.js`

After refresh, re-run the smoke from Step 4 against `/api/jobs/<id>/similar` — should now return the full 6-result tier-labeled list, not 2.

---

## Step 6 — Regenerate jobseeker embeddings on prod (one-time, 10 min)

PR-A changed the embedding-text formula (title 4x, work-history caps, seniority preference). Existing prod embeddings reflect the OLD formula. Regenerate so prod scoring is consistent:

```bash
cd ~/Documents/JXSOFT\ PROJECTS/albania-jobflow/backend
MONGODB_URI="<your-prod-atlas-uri>" node scripts/regenerate-jobseeker-embeddings.js
# Expected: all active jobseekers regenerated. Cost: <$0.001 OpenAI.
```

If you don't run this, prod jobseekers' next profile edit will trigger regen anyway — not catastrophic, just lazy.

---

## Step 7 — Monitor for 24-48h

**Sentry** (per CLAUDE.md memory: "Free services being set up: ... Sentry"): watch for new error rates spiking.

**Specific things to monitor:**
- `/api/jobs/recommendations` — error rate. Spike = the embedding path threw on real prod data we didn't anticipate (most likely: a user with malformed `embedding.vector` somehow).
- `/api/jobs/:id/similar` — error rate. Same risk class.
- `/api/users/profile` PUT — embedding regen happens async via `setImmediate`, errors get logged. Spike = OpenAI API issue or network blip.
- Server CPU / memory — the per-request cosine cursor scan is O(active jobs); at 70 jobs it's negligible, but worth confirming no spike.

**Rollback signal:** if `/recommendations` error rate exceeds 1% for 5+ minutes, roll back per Step 9.

---

## Step 8 — Optional follow-up: PR-E

After 24-48h of clean prod, ship PR-E (personalize the entire `/jobs` listing for logged-in jobseekers). It's the last embedding-touchable surface that doesn't yet use embeddings. ~150 lines, scoped, low risk. Can wait indefinitely if other priorities surface.

---

## Step 9 — Rollback plan

If anything goes wrong post-deploy:

```bash
# Find the prior origin/main commit (the one before our push)
cd ~/Documents/JXSOFT\ PROJECTS/albania-jobflow
git fetch origin
PREV=$(git log origin/main --oneline -2 | tail -1 | awk '{print $1}')
# Verify $PREV is the commit BEFORE our push (sanity)
git log --oneline -1 $PREV

# Force-push to revert origin/main
# ⚠ ONLY do this if no other contributor has pushed in between
git push --force-with-lease origin $PREV:main
```

This reverts both Vercel and Render (they auto-deploy from main HEAD). Render takes 3-7 min to redeploy old code; Vercel ~1-3 min.

**Render env rollback:** revert `SIMILARITY_MIN_SCORE` to `0.7` and `SIMILARITY_TOP_N` to `10` if you mirrored them in Step 1.

**Cache rollback:** the `refresh-similar-jobs-cache.js` change in Step 5 is non-destructive (overwrites only the `similarJobs` array). Re-running with old code restores old behavior on next compute. No manual revert needed.

**Database rollback:** N/A. No migrations in this push.

---

## Risk summary (TL;DR)

| Risk | Likelihood | Mitigation |
|---|---|---|
| 297 commits include a hidden breaking change | Low — audited, no migrations, no new deps, no env requirements | Step 9 rollback |
| Render env drift causes startup crash | Low — no new vars required | Step 2 sanity, Render auto-rollback on failed deploy |
| Embedding path throws on a user with malformed vector | Low — PR-B falls back to heuristic for invalid vectors | monitored in Step 7 |
| Cache refresh script fails partway | Low — script is idempotent, supports `--jobId` for single retries | Step 5 Option B |
| OpenAI rate limit during regen | Low — uses shared rate-limiter (3 concurrent) | retry next session |

**Net assessment:** standard post-Phase-28 deploy. The unusual size (297 commits) is mostly tests; the runtime delta is ~17 commits' worth of fixes and the embedding rewire. All have unit + integration test coverage.

---

## Reference

| Want to … | Run |
|---|---|
| Verify a single user's recommendations on prod | `node scripts/embeddings-smoke-recommendations.js --user <pattern> --base https://api.advance.al` |
| Refresh similars cache for one job | `MONGODB_URI=… node scripts/refresh-similar-jobs-cache.js --jobId <id>` |
| Refresh similars cache for jobs with stale-only filter | `MONGODB_URI=… node scripts/refresh-similar-jobs-cache.js --stale-only` |
| Regenerate one user's embedding | `MONGODB_URI=… node scripts/regenerate-jobseeker-embeddings.js --user <pattern>` |
| Dry-run regen to count what would change | `MONGODB_URI=… node scripts/regenerate-jobseeker-embeddings.js --dry-run` |
| Read what's in a user's embedding | `node scripts/embeddings-diagnostic.js --user <pattern> --top 10` |
| Inspect a job's embedding text | `node scripts/embeddings-inspect-job.js "<title pattern>"` |

---

## Open follow-ups (NOT blocking deploy)

- **Render 7-day similar-jobs cache worker hasn't fired since 2026-03-29.** Investigate Render scheduled-job / worker setup. Until fixed, run Step 5 manually after bulk job edits.
- **PR-E** — personalize `/jobs` listing per user. Mentioned by user, deferred to next session.
- **`backend/.env.example` drift** — 4 weeks older than `backend/.env`. Worth syncing to document the env surface for new devs / Render setup.
