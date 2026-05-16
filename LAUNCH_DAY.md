# Launch day — advance.al

Date: 2026-05-16
Prepared by: tonight's session + Round L (overnight) + Round M (this morning, pre-launch hardening)
For: tomorrow's you (and anyone helping)

---

## 🟢 Shipped this morning (Round M — pre-launch hardening)

These items came from the security + perf audit done before the deploy. They're already live (commits `53aecd3` + `656a70c` on `main`).

- `healthz/embeddings` was leaking growth metrics publicly — now gated by `HEALTHZ_TOKEN` env. **Default-deny when env unset**, so even if you don't set it, the leak is closed.
- 5 missing Mongoose indexes added for hot read paths (token lookups on signup verify + password reset, payment-worker scans, "have I applied?" filter, unread-notification poll).
- `quickusers` admin GET `/:id` no longer 500s on malformed IDs; preferences-token compare is now timing-safe.

See `SECURITY_AUDIT_ROUND_M.md` (root of repo) for the full audit + `INDEX_AUDIT_ROUND_M.md` for index reasoning.

**One-time operator action remaining**: set `HEALTHZ_TOKEN` on Render if you want to poll the embedding-coverage endpoint from a monitor. Token value was provided in this morning's chat. Otherwise the endpoint stays 503 (safe but unusable).

---

## 🔴 DO FIRST — security tasks (do these BEFORE going public)

These two credentials leaked into prior conversation transcripts. Rotate before anyone else can read them.

### 1. Rotate ADMIN_PASSWORD (5 min)

The current admin password is `PasswordIForte123@` and it's been visible in this session. Steps:

1. Generate a new strong password (use 1Password, Bitwarden, or run `openssl rand -base64 32`)
2. Update Render env var: Dashboard → advance-al service → Environment → `ADMIN_PASSWORD` → save → redeploy
3. Verify login at `https://advance.al/login` with email `admin@advance.al` and new password
4. Store the new password in your password manager, NOT in any file or chat

### 2. Rotate RESEND_API_KEY (5 min)

The Resend key `re_ZECNG5Y8_KapSbxLcMyiGqik6QbsSzfox` is in this transcript. Rotate it:

1. Go to resend.com → API Keys → revoke the old one
2. Create a new key with the same permissions
3. Update Render env var: Environment → `RESEND_API_KEY` → save → redeploy
4. Send a test email (e.g., trigger a password reset) to confirm

**Until both are rotated, anyone with this transcript has admin access and can send email from your domain.**

---

## ✅ Already done tonight — verify these work

Live verification ran 2026-05-16 right before this doc was written. All passed. Quick re-check before launch:

### Smoke test (run in your browser)

| URL | What you should see |
|---|---|
| https://advance.al/ | Homepage loads, jobs list renders, no console errors |
| https://advance.al/jobs | Job listing page |
| https://advance.al/blog | Blog index with 5 articles linked |
| https://advance.al/blog/cv-guide-shqiperi-2026 | Full Albanian CV article |
| https://advance.al/login | Login form |
| https://advance.al/employer-register | Employer registration form |

### What's deployed and verified

| Feature | Status |
|---|---|
| Bot prerendering (Google, Bing, GPTBot, ClaudeBot, etc.) on `/`, `/jobs`, `/jobs/<slug>`, `/about`, `/employers`, `/jobseekers`, `/blog`, `/blog/<slug>` | ✅ All return enriched HTML with JSON-LD |
| Humans get unchanged SPA on every URL | ✅ 3,575-byte shell, identical to pre-Phase-C state |
| JobPosting JSON-LD on every job detail page | ✅ Eligible for Google for Jobs |
| Article + BreadcrumbList + FAQPage JSON-LD on every blog article | ✅ 5 articles live |
| IndexNow integration (Bing, Yandex, Naver, Seznam) | ✅ Auto-fires when jobs go live; blog URLs already submitted |
| Sitemap (https://advance.al/sitemap.xml) | ✅ 15 URLs (static + blog), no job URLs yet (intentional — see Tier-2 below) |
| robots.txt | ✅ 30+ AI/search bots explicitly allowed; admin/profile/dashboard disallowed |
| Slug-based job URLs (regression-fixed) | ✅ Apply/save buttons work correctly on slug URLs |

---

## 🟡 TIER 1 — do this week (high-ROI, low-effort)

### Submit/re-verify sitemap in Google Search Console

You said you already submitted it. Just re-confirm in GSC:
1. https://search.google.com/search-console → select advance.al property
2. Left nav → "Sitemaps"
3. Confirm `sitemap.xml` is listed with status "Success" and last-read date within 24h
4. If status is anything else → resubmit (URL: `sitemap.xml` — relative path, not full URL)

### Same for Bing Webmaster Tools
1. https://www.bing.com/webmasters → select advance.al
2. Sitemaps → confirm submitted

### When you have ≥10 real active jobs in prod: regen sitemap

```bash
node scripts/generate-sitemap.mjs
git add frontend/public/sitemap.xml
git commit -m "chore: regen sitemap with current active jobs"
git push
```

This appends job URLs to the existing 15. Vercel auto-deploys. IndexNow pings will already have fired per-job from the backend hooks.

### Set up Google Indexing API for instant job indexing (15 min)

Google's official "this URL just changed, crawl it now" endpoint. Specifically built for JobPostings. Free.

Steps (in order):
1. https://console.cloud.google.com → New Project → name it "advance-al" or similar
2. APIs & Services → Library → search "Indexing API" → Enable
3. IAM & Admin → Service Accounts → Create. Name: "advance-al-indexing". Skip permission grants in step 2.
4. Click the newly-created service account → Keys tab → Add Key → Create new key → JSON. Download. **This file is a secret — treat like a password.**
5. Note the service-account email (looks like `advance-al-indexing@advance-al-XXXX.iam.gserviceaccount.com`)
6. https://search.google.com/search-console → select advance.al → Settings → Users and Permissions → Add user → paste service-account email → role: **Owner** (not "Full" — Owner specifically)
7. Open the JSON file you downloaded. Copy the ENTIRE contents. In Render dashboard: Environment → add new env var `GOOGLE_INDEXING_API_KEY` → paste the JSON contents as the value → save → redeploy
8. Tell me when done; I'll wire the backend integration (~30 min of code)

---

## 🟢 TIER 2 — when you have data (3+ months in)

After ~3 months of real jobs and real applications:

- Regen sitemap automatically via GitHub Actions cron (weekly). Ask me to wire it.
- Write data-driven content: "Pagat reale në IT në Tiranë 2026" (actual platform data) — unique content nobody else can replicate. AI assistants will cite you when asked Albanian wage questions.
- City-specific landing pages: `/jobs/tirane`, `/jobs/durres`, `/jobs/vlore` with curated content.
- Industry guides: `/karriera/teknologji`, `/karriera/turizem`.

Apply the same editorial doctrine as the blog (see `frontend/api/_lib/articles/*.js` SAFETY AUDIT headers).

---

## 🔵 OPTIONAL — at your pace

### Native-speaker QA of the 5 blog articles

I wrote them carefully but I'm an AI — only a native Albanian speaker (you) can catch phrasing that sounds slightly off. Read each in your browser:

- https://advance.al/blog/cv-guide-shqiperi-2026
- https://advance.al/blog/pyetjet-ne-interviste-pune-2026
- https://advance.al/blog/si-te-negocosh-pagen-2026
- https://advance.al/blog/kerkim-pune-diaspora-shqiptare-2026
- https://advance.al/blog/si-te-hulumtosh-pagen-shqiperi-2026

If anything reads as non-native or factually off, tell me which file and which line and I'll fix it. Files are at `frontend/api/_lib/articles/<slug>.js` in the `bodyHtml` field.

### Social profiles (when you create them)

LinkedIn company page > Wikidata > Facebook page > Twitter/X. Each should:
- Have "advance.al" or "https://advance.al" in the Website / Bio / About field
- Cross-link to each other
- Post 1-2 things at launch so they're not empty profiles

Backlinks from these compound over months — Google trusts them.

### Apply to Albanian job-board directories (later)

Submit advance.al to:
- Wikidata (create an entry as a job-board service in Albania)
- gjirafa.com directory
- Any Albanian press contact who covers tech / business

DO NOT buy backlinks or submit to "100 free backlinks" services. Those got domains penalized for the last 15 years.

---

## 📁 Untracked files in the working tree (your call)

These were created by parallel Claude sessions during the night and are NOT committed. Decide what to keep:

```
AD_CREATION_PLAYBOOK.md
COMPUTER_USE_HANDOFF.md
COMPUTER_USE_OVERNIGHT_QA.md
OVERNIGHT_QA_RESULTS.md
backend/scripts/.embedding-snapshots/
```

- If they're useful reference docs → `git add` and commit
- If they're temp notes → just delete them
- If unsure → leave alone, decide later

---

## 📞 If something breaks at launch

| Symptom | Likely cause | Quick fix |
|---|---|---|
| Site loads slowly first time | Render backend sleeping (free tier) | Wait 30-60s on first request. GitHub Action "Keep Render backend warm" runs every 5 min to prevent this. |
| Bot prerender returns SPA shell instead of enriched HTML for `/` | Vercel edge cache stale | Append `?nocache=$(date +%s)` to URL when testing. Real bots will get fresh content within 5 min. |
| Apply button shows "Apliko" after applying | Old slug regression returns | Should be fully fixed (PR-B.5). If you see it, send me URL + screenshot. |
| Email not sending | Resend key broken (expected after rotation) | Re-test in Render env vars, redeploy. |
| Login fails for admin | Password not rotated correctly | Re-set ADMIN_PASSWORD in Render env, redeploy. |
| `/blog` returns 404 | Vercel deploy didn't pick up new routes | Check Vercel deploys dashboard. Force redeploy. |

---

## 🗂 What changed tonight (full commit history)

```
feb699c docs: roadmap reflects PR-N blog shipped + editorial doctrine
43271cd feat: PR-N — blog (5 launch articles, Albanian, Google/Bing-safe)
93dc24b feat: PR-M — IndexNow integration (Bing/Yandex/Naver instant index)
be06f7c fix: PR-L hotfix 4 — seo function honors ?path= from middleware fetch
49483a6 fix: PR-L hotfix 3 — Edge Middleware routes bots to /api/seo (fixes root)
580ce3d fix: PR-L hotfix 2 — explicit / rewrite for bot prerender
cb32fdf fix: PR-L hotfix — add Vary: User-Agent to bot-prerender response
2db04cb feat: PR-L Phase C — Vercel bot-prerender function for SEO/GEO crawlers
```

All shipped to https://github.com/jxrgenn/advance.al main branch and live on https://advance.al.

---

## ✋ When NOT to call me / what I cannot fix from here

- Anything in Google Cloud Console (you have to click through the GCP UI)
- Anything in Google Search Console or Bing Webmaster Tools (web UI only)
- Anything in Resend dashboard (web UI only)
- Anything in Render dashboard (web UI only)
- Anything that requires reading actual Albanian for nuance — you're a native speaker, I'm an AI

For everything else, the conversation history is full context. Open a new session and reference this doc.

Good luck. 🚀
