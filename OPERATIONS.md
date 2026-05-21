# OPERATIONS — keeping advance.al alive

How to run advance.al in production: how you find out something broke, what to
do when it does, and the routine that prevents most breakage. Read this once;
come back to the **Incident response** section when something is on fire.

Stack: backend on **Render** (`advance-al.onrender.com`), frontend on **Vercel**,
database on **MongoDB Atlas**. Email via Resend, payments via Paysera, SMS via
Twilio, images on Cloudinary.

---

## 1. Monitoring — how you find out (set up BEFORE launch)

You cannot fix what you don't know broke. Three signals:

### a) Uptime monitor — the "site is DOWN" alarm
Sign up for **UptimeRobot** or **Better Stack** (both free) and add two monitors:
- `https://advance.al` — the frontend.
- `https://advance-al.onrender.com/health` — the backend. `GET /health` is
  public and returns **200** when the DB is connected, **503** when it isn't.

Set the interval to 1–5 min and alerts to email + (ideally) Telegram. This pages
you within ~2 min of a hard outage. Without it you find out from angry users.

### b) Sentry — the "something threw an error" feed
The code is **already wired** — backend (`server.js`) and frontend
(`main.tsx` + `ErrorBoundary`). It only activates when the DSN env vars are set:
- Render env: `SENTRY_DSN=<backend DSN>`
- Vercel env: `VITE_SENTRY_DSN=<frontend DSN>`
Create a free Sentry project (one for Node, one for React), paste the DSNs,
redeploy. Sentry then shows every exception with stack trace, route, and user.

### c) Discord notifier — app events
Already built (`discordNotifier.js`) — fires on payments, signups, etc. Keep the
`DISCORD_WEBHOOK_*` env vars set so these land in a channel you watch.

---

## 2. Incident response — what to do when something breaks

Work top to bottom. **Restore service first, understand it second.**

1. **Is it down or just degraded?**
   - Uptime monitor red / site won't load → hard outage.
   - Site loads but errors in Sentry / a feature is broken → degraded.

2. **Did it break right after a deploy?** → **ROLL BACK NOW.** Most breakage is
   the last deploy. Don't debug a live outage — restore the last good version,
   then debug calmly.
   - **Render (backend):** Dashboard → service → *Events* / *Deploys* → pick the
     last green deploy → **Rollback**. ~1 min.
   - **Vercel (frontend):** Project → *Deployments* → last good one → ⋯ →
     **Promote to Production** (instant rollback).

3. **Read the signal.**
   - Sentry → exact `file:line` + stack trace + which request.
   - Render **Logs** tab → backend runtime errors.
   - Vercel **Logs** / build output → frontend build/runtime errors.

4. **Fix it properly.** Reproduce locally → fix on a branch → `npm run build`
   + tests green → merge → deploy → **watch Sentry + the site for ~15 min.**

5. **Data looks wrong / corrupted?** Restore from a **MongoDB Atlas backup**
   (Atlas → Backup → point-in-time restore). Never hand-edit prod data under
   pressure.

6. **Write 3 lines in the incident log** (bottom of this file): date, what
   broke, root cause, fix. Patterns repeat.

### Common cases
| Symptom | First check | Likely fix |
|---|---|---|
| Whole site down after deploy | Render/Vercel deploy status | Roll back |
| Backend 503 on `/health` | Atlas — DB up? connection limit? | Restart service / check Atlas |
| Errors but site up | Sentry stack trace | Branch-fix, deploy |
| No emails arriving | Resend dashboard; is `EMAIL_TEST_MODE` set in prod? | Unset `EMAIL_TEST_MODE` |
| Payments not completing | Render logs for `/paysera/callback`; Paysera dashboard | Check Paysera keys/signature |
| Backend slow after idle | Render free tier slept | `keep-warm.yml` handles it; consider paid tier |

---

## 3. Routine maintenance — the calendar

**Each deploy**
- CI green before merge (`.github/workflows`). Never merge red.
- Prefer a Vercel preview + a Render staging service to test first.
- Don't deploy when you can't watch it for 15 min afterward (no Friday-night
  deploys).

**Weekly**
- Skim Sentry for new/recurring errors.
- Glance at the Discord channel for anything odd.

**Monthly**
- `npm audit` in `backend/` and `frontend/`; patch real CVEs.
- Check spend: OpenAI, Cloudinary, Render, Vercel, Atlas — set billing alerts so
  this is push, not pull.
- Confirm the background workers ran (embedding / notification digest / payment
  reminders) — `/healthz/embeddings` and `/healthz/notifications` (need the
  `X-Healthz-Token` header) plus Discord alerts cover this.

**One-time, before launch**
- Enable **Atlas automated backups** and do **one test restore** so you know it
  works before you need it.
- Set every prod env var on Render + Vercel; confirm `.env` is gitignored.
- Confirm `EMAIL_TEST_MODE` is **not** set in prod (else real users get no mail).
- Rotate any secret that has ever been pasted into a chat/screenshot.

---

## 4. KeepItUp — optional, later (not a launch dependency)

KeepItUp (the owner's AI SRE agent) detects errors in deployment logs and opens
fix **PRs**. It is genuinely useful but it is **not** a substitute for sections
1–3:
- It is not an uptime monitor (5-min polling, not 60-sec paging).
- On Vercel it only sees build logs — frontend runtime crashes need **BetterStack**
  wired as a log drain or KeepItUp is blind to them.
- It deliberately won't touch auth / payment / DB logic — the errors that hurt
  most on a job board.
- It is itself a self-hosted stack that needs running and watching.

**Plan:** launch on sections 1–3 (free, zero-maintenance, standard). Add KeepItUp
later as a convenience layer — point it at the Render backend, add BetterStack
for the Vercel frontend, and keep reviewing its PRs by hand.

---

## Incident log

_Append: `YYYY-MM-DD — what broke — root cause — fix`._

- (none yet)
