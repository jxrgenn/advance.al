# 🚨 URGENT: Secrets Rotation Checklist

**Status:** Production secrets are in the public git history of
`https://github.com/jxrgenn/advance.al`. Anyone on the internet can
read them right now. This checklist is what you (the human) need to
do — Claude cannot rotate keys for you.

**Scope:** Read every step. Tick the box when done. Order matters
(MongoDB first because it's the worst).

---

## What's leaked

`git log -p --all -- '**.env'` on the public repo shows:

| Secret | Leaked value | Severity |
|--------|--------------|----------|
| `MONGODB_URI` (incl. cluster password) | `mongodb+srv://advanceal123456:StrongPassword123!@cluster0.gazdf55.mongodb.net/...` | **CRITICAL** |
| `RESEND_API_KEY` | `re_ZECNG5Y8_KapSbxLcMyiGqik6QbsSzfox` | **HIGH** |
| `ADMIN_PASSWORD` | `admin123!@#` (verify whether this is your real admin login) | **HIGH** if real |
| `OPENAI_API_KEY` | Only fragment + placeholder visible — but referenced | Medium (rotate cheaply) |

The repo is **public** (verified: `curl https://api.github.com/repos/jxrgenn/advance.al` returns `"private": false`).

---

## ⏱️ Phase 0 — Do these in order

### [ ] Step 1 — Rotate MongoDB Atlas password (BLOCKING)

**Why first:** the cluster hostname `cluster0.gazdf55.mongodb.net` is
stable and reachable from any IP that's whitelisted. If your Atlas
IP whitelist contains `0.0.0.0/0` (the development default), an
attacker can connect _right now_.

1. Open https://cloud.mongodb.com/
2. Project → **Database Access** (left nav, under SECURITY)
3. Find the user `advanceal123456` → **Edit** → **Edit Password**
4. Click **Autogenerate Secure Password** → Copy
5. Save with the new password
6. **Update the connection string in Render:**
   - https://dashboard.render.com/ → `advance-al` service
   - **Environment** tab → find `MONGODB_URI`
   - Replace the old password in the URL
   - Click **Save Changes** (Render auto-redeploys)
7. **Update local `.env` files** (so you can run dev):
   - `backend/.env` — replace `MONGODB_URI`
   - Root `.env` if any
8. Wait for Render deploy to go green. Verify production is up:
   `curl https://api.advance.al/health` → `{"redis":"connected"}`

### [ ] Step 2 — Lock down MongoDB Atlas IP whitelist

If you skip this and an attacker grabbed the old password before you
rotated, they can keep getting in.

1. Atlas → project → **Network Access**
2. If you see `0.0.0.0/0` (Allow access from anywhere), **DELETE IT**
3. Add Render's outbound IPs:
   - https://dashboard.render.com/ → `advance-al` service → **Settings** → "Outbound IPs"
   - Atlas → Network Access → **+ Add IP Address** → paste each IP
   - Description: `Render production`
4. Add YOUR IP for local dev (Atlas auto-detects: "Add Current IP")
5. Verify production still works:
   `curl https://api.advance.al/api/jobs?limit=1` → 200

### [ ] Step 3 — Rotate Resend API key

**Why:** with the old key, anyone can send emails as `noreply@advance.al`
including fake password resets to your users.

1. https://resend.com/api-keys → **Revoke** the key starting `re_ZECNG5Y8...`
2. **Create API Key** → name it `advance-al-prod` → permission: *Sending access* → save
3. Copy the new key (you only see it once)
4. Update in Render:
   - Dashboard → `advance-al` → Environment → `RESEND_API_KEY` → paste new
5. Update `backend/.env` locally
6. Verify: trigger a `/forgot-password` to a test email, confirm it arrives

### [ ] Step 4 — Rotate OpenAI API key

Cheap insurance; only a fragment was visible but key was referenced.

1. https://platform.openai.com/api-keys → revoke any key starting `sk-proj-lpuVnk...`
2. Create new key, restrict to `chat.completions.read+write` + `embeddings`
3. Update Render env `OPENAI_API_KEY`
4. Update local `backend/.env`
5. Verify: trigger CV generation flow with a test account

### [ ] Step 5 — Rotate JWT secrets

If real `JWT_SECRET` / `JWT_REFRESH_SECRET` ever sat in `.env` (mine of
git history shows only placeholder `your_jwt_secret_key`, but verify),
rotate now. **Side effect: every logged-in user gets logged out.** That's
acceptable as part of incident response.

1. Generate a new secret:
   ```sh
   node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
   ```
2. Run twice (one for `JWT_SECRET`, one for `JWT_REFRESH_SECRET`)
3. Update Render env vars
4. Render auto-redeploys; all sessions invalidate
5. Verify by logging in to the live site with your admin account

### [ ] Step 6 — Verify admin password

Was the `admin123!@#` from the leaked `.env` ever the real admin login?

1. Log in to https://advance.al with `admin@advance.al` (or whatever
   the admin email is) using `admin123!@#`
2. **If it works** → CRITICAL. Change it immediately:
   - Go to admin profile → change password to a strong password from your password manager (≥ 20 chars, mixed)
3. **If it doesn't** → confirm it never was, no further action

### [ ] Step 7 — Audit Atlas access logs

Look for any connection from an unexpected IP in the last 90 days.

1. Atlas → cluster → **Monitoring** → **Real-Time** → Network
2. **Connections** tab → filter "last 90 days"
3. Compare source IPs vs Render outbound IPs you added in Step 2
4. Anything unexpected? Note the IP, the timestamp, and what queries
   were run (Performance Advisor → Query Profiler can show actual ops)

If you find unauthorized access:
- Treat it as a confirmed breach — assume all data was exfiltrated
- Notify users per GDPR Article 33 (within 72 hours of discovery)
- Force-rotate all passwords (server-side: increment a `passwordVersion`
  field in User schema and reject JWTs with old version)

### [ ] Step 8 — Audit Resend dashboard

1. https://resend.com → **Emails** tab
2. Filter "Last 90 days"
3. Look for emails NOT triggered by your app (unexpected recipients,
   subjects you don't recognize, weird from-addresses)
4. If you see suspicious emails: assume the API key was used; the fact
   that you've already rotated it (Step 3) closes the door now

### [ ] Step 9 (Optional, recommended) — Scrub git history

This rewrites SHAs. Anyone with a clone needs to re-clone. Tags and
branches keep their names. **GitHub may still serve old commits via
direct SHA URLs** for some hours after the force-push (unless you also
contact GitHub support to purge their cache), so **rotation in steps
1-8 is the actual protection** — this is just hygiene.

```sh
# install git-filter-repo
brew install git-filter-repo
# or: pip install git-filter-repo

cd "/Users/user/Documents/JXSOFT PROJECTS/albance-jobflow"
# (you'll need a fresh clone — filter-repo refuses on a clone with origin set)
git clone https://github.com/jxrgenn/advance.al advance-al-scrub
cd advance-al-scrub

# Remove every .env file from every commit
git filter-repo \
  --path '.env' --path 'backend/.env' --path 'frontend/.env' \
  --path '.env.local' --path '.env.production' --path '.env.development' \
  --invert-paths --force

# Add origin back and force-push
git remote add origin https://github.com/jxrgenn/advance.al.git
git push origin --force --all
git push origin --force --tags
```

After this, in your normal working directory, delete and re-clone:
```sh
cd ..
mv advance-al advance-al-old.bak    # or rm -rf
git clone https://github.com/jxrgenn/advance.al
```

### [ ] Step 10 — Add gitleaks pre-commit hook to prevent recurrence

```sh
brew install gitleaks
cd "/Users/user/Documents/JXSOFT PROJECTS/albania-jobflow"
gitleaks protect --staged    # warns on secrets in staged files

# Add to .git/hooks/pre-commit:
echo '#!/bin/sh
gitleaks protect --staged --redact -v
' > .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

Or use husky + the shared `.husky/pre-commit` if you want it tracked
in the repo.

### [ ] Step 11 — Consider GitHub repo private

If this codebase doesn't need to be public for any reason (e.g., you're
not seeking contributors), make it private:

1. https://github.com/jxrgenn/advance.al/settings → bottom of page → **Change visibility** → **Make private**

This doesn't undo the leak (anyone could have cloned the repo while
public), but reduces ongoing exposure for any future slip-ups.

---

## When all 11 steps are done

Tell me — I'll resume Phase 2 (build A12-A27 specs and run them).
The bulk of automated testing doesn't depend on Phase 0, so I'll write
the specs in parallel while you're rotating.

---

## What this audit also caught (will fix in Phase 2-4 commits, no user
action needed)

- **Backend HPP→500** on `/api/jobs?city=A&city=B` — fixed locally
- **Mongoose HIGH CVE** (NoSQL injection via `$nor`) — fixed via `npm audit fix`
- **Two more moderate backend CVEs** — fixed via `npm audit fix`
- **CSP `script-src 'unsafe-inline'`** — removed in `vercel.json`
- **7 a11y violations** (Mantine WCAG colors + missing aria-labels) — fixed
- **Render `trust proxy`** — fixed in commit `a1da9a3` (pending push)
- **Render cold-start** — keep-warm cron added in `a1da9a3` (pending push)
- **OpenAI 503 guard** — added in `a1da9a3` (pending push)

Once you complete Phase 0 and I finish Phase 2, a single commit ships
all of the above.
