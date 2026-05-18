# Security Audit — advance.al

**Date:** 2026-04-30
**Targets:**
- Frontend: `https://advance.al` (Vercel, behind Cloudflare/Vercel edge)
- Backend: `https://api.advance.al` (Render, behind Cloudflare)

---

## Executive summary

| Layer | Status |
|---|---|
| TLS / cert | ✅ Strong (Let's Encrypt, TLSv1.3 only, valid through Jul 2026) |
| HSTS | ✅ Set on both frontend (2y) and backend (1y) |
| Backend security headers | ✅ Solid (CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, COOP/CORP) |
| Frontend security headers | 🔴 **WAS missing CSP / X-Frame / X-Content-Type / Permissions-Policy — fixed in this audit** |
| Backend rate limiting | ✅ 100/15min general; 15/15min on auth endpoints |
| Auth flows | ✅ No user enumeration; consistent 401 for known/unknown emails |
| Input validation | ✅ NoSQL injection blocked at validation layer |
| XSS | ✅ Search query escaped; no reflection |
| Information disclosure | ✅ No `.env`, `.git/HEAD`, `server.js` leaks (all 404 on backend) |
| **DNS — SPF** | 🔴 **MISSING — anyone can spoof emails as @advance.al** |
| **DNS — DKIM** | 🔴 **MISSING — Resend emails can fail authentication** |
| **DNS — DMARC** | 🟠 `p=none` — monitoring only, not enforcing |
| **DNS — DNSSEC** | 🟡 Not enabled |
| **DNS — MX** | ⚠️ No MX records (you can't receive @advance.al email — fine if you don't need to) |
| **DNS — CAA** | 🟡 Not set (any CA can issue certs for advance.al) |

**Code changes shipped in this audit:**
1. `frontend/vercel.json` — added comprehensive security headers (CSP, X-Frame, Permissions-Policy, etc.)
2. `backend/server.js` — tightened Helmet CSP (explicit frame-ancestors 'none', restricted img-src to Cloudinary, added permittedCrossDomainPolicies)
3. `backend/server.js` — added CORS error handler (rejected origins now get clean 403, not 500)

**Action required from you (DNS-level — registrar dashboard):**
1. Add SPF record (P0)
2. Add DKIM record from Resend (P0)
3. Set DMARC to `p=quarantine` (P1)
4. Add CAA record (P2)
5. Enable DNSSEC if registrar supports (P2)

---

## 1. Frontend findings (advance.al)

### 1.1 🔴 P0 — Missing security headers (FIXED in this audit)

**Was:** Vercel returned only HSTS. No CSP, no X-Frame-Options, no X-Content-Type-Options, no Referrer-Policy, no Permissions-Policy.

**Risk:** Clickjacking (anyone can iframe advance.al into a phishing site), MIME-sniffing attacks, insecure default referrer leakage, browser feature abuse (camera/microphone/geolocation).

**Fix shipped:** `frontend/vercel.json` now sets:
- `Content-Security-Policy` — restricts script-src to self + Sentry, restricts connect-src to backend + Sentry, blocks frame-ancestors entirely, blocks object-src
- `X-Frame-Options: DENY` — defense-in-depth against clickjacking on browsers that don't support frame-ancestors
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: accelerometer=(), camera=(), geolocation=(), microphone=(), payment=(), usb=()` (disables browser features the app doesn't use)
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` (was already there)
- `Cross-Origin-Opener-Policy: same-origin`
- Long-cache headers on `/assets/*`

**Verify after deploy:** `curl -I https://advance.al` should show all headers above.

### 1.2 🟢 P3 — `access-control-allow-origin: *` on static HTML

Vercel returns `access-control-allow-origin: *` on static asset responses. This is informational only — it allows any origin to fetch your public HTML/CSS/JS files, which is the entire point of a public website. Not a security issue.

### 1.3 🟢 P3 — `server: Vercel` header leaks the host

Informational. Tells attackers you're on Vercel. Vercel doesn't allow stripping this. Not exploitable by itself.

---

## 2. Backend findings (api.advance.al)

### 2.1 🟢 P3 — `x-xss-protection: 0` header

Helmet sets this to `0` intentionally. Modern browsers ignore the legacy XSS auditor (it caused more bugs than it fixed). CSP is the modern replacement and is set correctly. **No action.**

### 2.2 🟠 P2 — Backend Helmet CSP was permissive (TIGHTENED in this audit)

**Was:**
```js
imgSrc: ["'self'", "data:", "https:"],   // any HTTPS image
```

**Now:**
```js
imgSrc: ["'self'", "data:", "https://res.cloudinary.com", "https://*.cloudinary.com"],
frameAncestors: ["'none'"],   // explicit clickjacking block
objectSrc: ["'none'"],
baseUri: ["'self'"],
formAction: ["'self'"],
upgradeInsecureRequests: [],
```

The backend rarely serves HTML, but the CSP applies to the few cases where it does (error pages, file previews). Tighter directives shipped.

### 2.3 🟠 P2 — CORS rejection returned 500 (FIXED in this audit)

**Was:** A request from a disallowed origin (e.g., `evil.example.com`) hit the CORS middleware, which threw `new Error('Not allowed by CORS')`, caught by the default Express error handler → returned generic 500.

**Now:** A specific error handler converts `Not allowed by CORS` errors into clean `403 { success: false, message: 'Origin not allowed' }` responses.

**Risk if unfixed:** Confused attackers might think there's a server bug to exploit. Functionally the request was already blocked, but the 500 was misleading.

### 2.4 ✅ Auth endpoints don't leak user existence

Tested: `POST /api/auth/login` with a known email + wrong password returns the same `401 "Email ose fjalëkalim i gabuar"` as an unknown email. No enumeration via response or status code.

Tested: `POST /api/auth/forgot-password` with a known/unknown email returns the same generic success message.

### ✅ NoSQL injection blocked

Tested: `POST /api/auth/login` with `{"email":{"$gt":""},"password":{"$gt":""}}` — rejected at validation layer with 400 "Email i pavlefshëm".

### ✅ Rate limiting active

- General: 100 requests / 15 min per IP
- Auth: 15 requests / 15 min per IP (tighter)

Verified via Render's `RateLimit-Limit` / `RateLimit-Remaining` headers.

### ✅ No path-traversal / file leaks

Tested: `GET /.env`, `/.git/HEAD`, `/server.js`, `/package.json` — all return 404.

---

## 3. DNS findings (advance.al — registrar dashboard required)

### 3.1 🔴 P0 — NO SPF record (anyone can spoof emails as @advance.al)

**Risk:** Without SPF, anyone can send email pretending to be `info@advance.al`, `noreply@advance.al`, etc. This gets you into the spam folder for legitimate sends AND enables phishing your own users.

**Fix:** Add this TXT record at your registrar:

```
Host:  @  (or advance.al)
Type:  TXT
Value: v=spf1 include:_spf.resend.com ~all
TTL:   3600
```

Replace `_spf.resend.com` with whatever Resend's documentation specifies (it varies by year; check https://resend.com/docs/dashboard/domains/introduction).

After publishing, verify:
```sh
dig +short advance.al TXT
# Should include: "v=spf1 include:_spf.resend.com ~all"
```

### 3.2 🔴 P0 — NO DKIM record (Resend emails fail signature verification)

**Risk:** Without DKIM, Gmail/Outlook show "via amazonses.com" or similar warnings, and emails can be more easily spoofed.

**Fix:** In Resend dashboard → Domains → advance.al → click "Verify". Resend will give you 2-3 CNAME records. Copy them to your DNS:

```
Host:  resend._domainkey   →  CNAME  resend._domainkey.resend.com
Host:  resend2._domainkey  →  CNAME  resend2._domainkey.resend.com
(and any others Resend specifies)
```

Wait 5-30 min, then click "Verify" in Resend.

### 3.3 🟠 P1 — DMARC is `p=none` (monitoring only, no enforcement)

**Current:** `_dmarc.advance.al  TXT  "v=DMARC1; p=none;"`

This means: report violations but don't reject them. Spoofers still get delivered.

**Fix path:**

1. Now (P1): change to `p=quarantine` so suspicious emails go to spam.
2. After 2 weeks of clean reports: change to `p=reject` for full enforcement.

Add reporting addresses too:

```
Host:  _dmarc
Type:  TXT
Value: v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@advance.al; ruf=mailto:dmarc-failures@advance.al; fo=1; adkim=r; aspf=r; pct=100
```

You'll need to actually be able to receive at those email addresses (Google Workspace, Zoho, or a forwarding service). If you can't, drop the rua/ruf fields.

### 3.4 🟡 P2 — No CAA record (any Certificate Authority can issue certs for advance.al)

**Risk:** A compromised or rogue CA could issue a certificate for advance.al. CAA limits which CAs are allowed.

**Fix:**

```
Host:  @
Type:  CAA
Value: 0 issue "letsencrypt.org"
       0 issue "pki.goog"
       0 iodef "mailto:security@advance.al"
```

(Three separate CAA records.) Verify with `dig +short advance.al CAA`.

### 3.5 🟡 P2 — No DNSSEC

DNSSEC prevents DNS spoofing/cache-poisoning attacks. Not all registrars support it — check yours. If supported, enable in registrar dashboard. Verify with `dig +dnssec advance.al | grep RRSIG`.

### 3.6 🟢 P3 — No MX records

You don't receive email at @advance.al. Resend handles outbound only. **No action needed unless you want to receive email** — in which case set up Google Workspace / Zoho / Fastmail and add their MX records.

---

## 4. Tested attack surfaces (all clean ✅)

These were probed and confirmed safe:

- **OWASP A01: Broken Access Control** — admin endpoints require admin role; user endpoints check ownership; tested via Phase 22 + manually
- **OWASP A02: Cryptographic Failures** — TLS 1.3, JWT signed with HS256, password hashed with bcrypt
- **OWASP A03: Injection** — express-validator on all input, NoSQL injection blocked, no SQL stack
- **OWASP A04: Insecure Design** — auth flows verified (no enumeration, lockout after 5 wrong codes, rate limiting on auth)
- **OWASP A05: Security Misconfiguration** — Helmet + CSP + secure cookies + no debug info in errors
- **OWASP A06: Vulnerable Components** — `npm audit` clean (8 of 10 fixed in prior phase; remaining 2 are dev-only Vite/esbuild)
- **OWASP A07: Auth Failures** — strong password req, JWT rotation on password change (F-21 fix), refresh token theft detection
- **OWASP A08: Data Integrity** — no untrusted deserialization; CSP blocks inline scripts
- **OWASP A09: Logging** — Sentry capturing prod errors with PII filtering (errorSanitizer)
- **OWASP A10: SSRF** — no URL fetcher endpoints exposed to user input

---

## 5. Action checklist

### ✅ Done in this audit (code changes pushed to your repo)

- [x] Add Vercel security headers (CSP, X-Frame, Permissions-Policy, etc.)
- [x] Tighten backend Helmet CSP (frame-ancestors none, scoped img-src)
- [x] Fix CORS error 500 → 403

### 🔴 You must do (at DNS registrar — ~15 min)

- [ ] Publish SPF TXT record (P0 — email spoofing)
- [ ] Publish Resend DKIM CNAME records (P0 — email auth)
- [ ] Update DMARC from `p=none` → `p=quarantine` (P1)
- [ ] Add CAA records limiting CAs to Let's Encrypt + Google (P2)
- [ ] Enable DNSSEC in registrar dashboard if available (P2)

### ✅ Already correct (no action)

- TLS, HSTS, cert validity
- Backend rate limiting + auth flow
- Backend leak paths (.env, .git, etc.)

---

## 6. Re-audit commands (paste in terminal anytime)

```sh
# DNS records
dig +short advance.al TXT          # check SPF
dig +short _dmarc.advance.al TXT   # check DMARC
dig +short advance.al CAA          # check CAA
dig +dnssec advance.al | grep RRSIG  # check DNSSEC

# HTTP headers
curl -I https://advance.al                          # frontend headers
curl -I https://api.advance.al/health      # backend headers

# CORS test (should be 403 after fix)
curl -I -H "Origin: https://evil.example.com" https://api.advance.al/api/jobs

# CSP enforcement (load https://advance.al, browser DevTools → Console — should see no CSP violations on legitimate use)
```

---

**Date stamp:** 2026-04-30
**Re-audit recommended:** After every deploy of `vercel.json` or `server.js` security middleware.
