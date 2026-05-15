# Phase 29 — SEO/GEO setup guide

**Purpose:** External (browser/dashboard) steps you must do yourself — Claude cannot log into your Google or Microsoft accounts. These complement the code changes shipped in PR-L Phase A.

**Time budget:** ~25 minutes.

**Why this matters:** Without Google Search Console + Bing Webmaster, search engines cannot tell you what's wrong with indexing, can't show you which queries surface advance.al, and cannot accept your sitemap directly. Phase A added the verification meta-tag *placeholders* into `frontend/index.html` (commented out); you paste the codes you get from these dashboards into those placeholders and redeploy.

---

## 1. Google Search Console (10 min)

1. Open https://search.google.com/search-console
2. Sign in with the Google account that should own SEO data for advance.al
3. Click "Add property" → choose **URL prefix** (NOT Domain — URL prefix is simpler and we don't need subdomain coverage)
4. Enter `https://advance.al` (no trailing slash, no www)
5. On the verification screen, pick **HTML tag** method
6. Google shows you a tag like:
   ```html
   <meta name="google-site-verification" content="abc123XYZ..." />
   ```
   Copy ONLY the `content` value (the `abc123XYZ...` string)
7. Tell Claude / open the editor and update `frontend/index.html` — find these two commented lines:
   ```html
   <!-- <meta name="google-site-verification" content="" /> -->
   <!-- <meta name="msvalidate.01" content="" /> -->
   ```
   Uncomment the first one and paste your code:
   ```html
   <meta name="google-site-verification" content="abc123XYZ..." />
   ```
8. Commit + push → Vercel auto-deploys (~1 min)
9. Back in Search Console click **Verify**. If it says "Ownership verified" you're in.
10. Inside the property:
    - Sidebar → **Sitemaps** → enter `sitemap.xml` → Submit
    - Sidebar → **URL inspection** → paste `https://advance.al/` → "Request indexing"
    - Repeat URL inspection for: `/jobs`, `/about`, `/employers`, `/jobseekers` (5 requests/day quota — plenty)

**Expected timeline after submission:**
- Sitemap status changes to "Success" within 24-48h
- First indexed URLs appear in Coverage report within 3-7 days
- Performance report starts showing impressions within 7-14 days

---

## 2. Bing Webmaster Tools (5 min if importing from GSC)

Easiest path — wait until Google Search Console verification (step 1) is complete, then:

1. Open https://www.bing.com/webmasters
2. Sign in with a Microsoft account
3. Click "Import" → "Import from Google Search Console" → authorize → pick `advance.al` → Import
4. Done. Bing inherits the verification + sitemap from Google.

**Why Bing matters even if "no one uses Bing":**
- Bing powers DuckDuckGo, Yahoo, Ecosia
- **ChatGPT Search uses Bing's index** — this is your most direct GEO win for ChatGPT specifically
- Bing's WebmasterTools surfaces unique data Google doesn't (e.g. Bing's crawl errors)

**If you don't want to use GSC import:**
- Add Site → choose Meta tag method → copy code → paste into the SECOND placeholder in `frontend/index.html`:
  ```html
  <meta name="msvalidate.01" content="paste-bing-code-here" />
  ```
- Commit + push, verify, submit `sitemap.xml`.

---

## 3. HSTS preload list submission (2 min)

Your HSTS header is already correctly set (verified). Submit the domain for inclusion in the Chrome/Firefox/Safari hardcoded preload list:

1. Open https://hstspreload.org
2. Enter `advance.al`
3. Site will check headers automatically. All three required conditions are met (max-age ≥ 31536000, includeSubDomains, preload). It should be eligible immediately.
4. Click "Submit advance.al for hardcoded preloading"

**What this does:** Even on a user's first-ever visit, browsers refuse to make an HTTP request — they always go straight to HTTPS. Improves trust signals and protects users on hostile networks. Takes weeks to propagate but is permanent and a small ranking signal.

---

## 4. Optional: register the brand entity

These don't directly affect Google indexing but help with GEO (AI assistants prefer to cite entities they recognize):

- **Wikidata** — create a minimal entry: Q-item for "Advance.al" with properties `instance of: job board`, `country: Albania`, `official website: https://advance.al`, `inception: 2026`. https://www.wikidata.org/wiki/Special:NewItem
- **Crunchbase** — free company profile (5 min)
- **LinkedIn Company Page** — must-have, links back to advance.al as official site (5 min)
- **Facebook Page** — optional but Albanian audience uses Facebook heavily

These create the **knowledge graph** anchors that ChatGPT/Claude/Perplexity use to ground claims about your business.

---

## 5. Verification — run these after step 1 is done

From any terminal:

```bash
# Confirm Phase A markup is live
curl -s https://advance.al/ | grep -E '<html lang|canonical|geo\.region|og:locale|application/ld' | head -10

# Confirm sitemap is fresh
curl -s https://advance.al/sitemap.xml | grep -c "<lastmod>2026-05-15"   # expect 10

# Confirm robots.txt allows AI crawlers
curl -s https://advance.al/robots.txt | grep -E "GPTBot|ClaudeBot|PerplexityBot" | head

# Confirm llms.txt served
curl -s -o /dev/null -w "%{http_code}\n" https://advance.al/llms.txt   # expect 200

# Validate JSON-LD with Google's tool (open in browser):
# https://search.google.com/test/rich-results?url=https%3A%2F%2Fadvance.al%2F
```

---

## 6. What's coming next (Phase B + C, post-launch)

You don't need to do anything for these — they're code changes Claude will ship after launch is stable. Listed here so you know what's coming:

- **Phase B (Saturday, 2026-05-16):** `react-helmet-async` for per-page `<title>` and `<meta description>` on every page; JSON-LD `JobPosting` markup on every job detail page (eligibility for Google for Jobs rich results — that's the prominent "Jobs" card in Google search results that captures most job-search traffic in Albania); slug-based job URLs (`/jobs/senior-developer-tirana` vs current `/jobs/65f1a...`).

- **Phase C (Sunday/Monday, 2026-05-17 or 18):** A Vercel serverless function that intercepts requests from AI crawlers (GPTBot, ClaudeBot, PerplexityBot, etc.) and serves them fully-rendered HTML with structured data injected. Today these crawlers see a blank shell and harvest nothing — this is the crown jewel for GEO. Humans never hit this function; the SPA loads exactly as today.

- **Phase D (ongoing):** GitHub Actions weekly sitemap regen; backlinks from LinkedIn/Facebook/Wikidata; Albanian-language content/blog posts targeting head queries.

---

## TL;DR for tomorrow's launch day

The only things you MUST do before launch:
1. Step 1.1–1.7 (GSC verify) — 5 min
2. Step 2.1–2.3 (Bing import) — 3 min
3. Step 1.10 sitemap submit — 1 min

The rest can wait.
