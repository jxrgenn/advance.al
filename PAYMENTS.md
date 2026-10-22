# PAYMENTS — how advance.al takes money

Owner decisions (2026-10-02, binding):

1. **Stripe-hosted Checkout is the only checkout.** Which payment methods it
   offers is set in the **Stripe Dashboard → Settings → Payment methods**
   (recommended: Cards + Apple Pay / Google Pay), or by an optional
   `STRIPE_PAYMENT_METHOD_CONFIGURATION=pmc_…`. Paysera code stays in the repo
   but is disabled unless `PAYMENT_PROVIDERS` includes `paysera`.
2. **Fixed prices**: standard 35 € / promoted 49 € by default, editable by an
   admin (SystemConfiguration `pricing_standard_posting`,
   `pricing_promoted_posting`). The PricingRule / BusinessCampaign discount
   engine does **not** influence what is charged.
3. **Renewal is paid**, same price as a new post. Employers with
   `freePostingEnabled` (or everyone when `payment_enabled=false`) post and
   renew free.
4. **Paid from day one**: production without Stripe keys fails loudly
   (boot ERROR + admin alert + `/healthz/payments` `blocking: true` + checkout 503).
5. **Fail closed**: with `NODE_ENV=production` no fake/mock/dev payment path
   exists, whatever any env flag says. `PAYSERA_ALLOW_FAKE_SUCCESS`,
   `ENABLE_MOCK_PAYMENTS` and `PAYMENTS_ALLOW_FAKE` are ignored in production
   and each one that is set is logged as an ERROR at boot (+ admin alert).
   The dev-fake provider, `POST /orders/:id/fake-complete`, fulfilment of any
   `dev-fake` order, and the mock candidate-matching purchase all refuse in
   production. A **missing/unreadable `payment_enabled` switch counts as paid
   posting ON** in production (boot ERROR + alert + healthz degraded).
6. **No test money in production** (review H1): with `NODE_ENV=production` an
   `sk_test_` key is refused (checkout 503, healthz degraded + blocking, boot
   ERROR) — unless `STRIPE_ALLOW_TEST_MODE_IN_PRODUCTION=true` AND
   `STRIPE_TEST_MODE_ALLOWLIST` lists the employers (emails or ids) who may run
   a supervised rehearsal. Everyone else still gets 503, healthz stays
   degraded, and even a test payment that slips through never publishes for a
   non-allowlisted employer.

---

## 1. Moving parts

| Piece | File |
|---|---|
| Price list (single source of truth) | `backend/src/lib/pricing.js` |
| Order model + state machine doc | `backend/src/models/PaymentOrder.js` |
| Every money path | `backend/src/services/payments/orderService.js` |
| Stripe SDK adapter (only file that talks to Stripe) | `backend/src/services/payments/stripeProvider.js` |
| Which provider is on / dev-fake rules | `backend/src/services/payments/providerConfig.js` |
| Webhook route (raw body, before `express.json`) | `backend/src/routes/stripeWebhook.js` |
| Checkout / order status / dev completion / legacy Paysera | `backend/src/routes/payments.js` |
| Admin orders, refund, resolve, manual accept | `backend/src/routes/admin.js` (`/api/admin/payments…`) |
| Reconcile cron (lost webhooks, stuck orders, refund digest) | `backend/src/services/payments/reconcileWorker.js` |
| Boot / health readiness | `backend/src/services/payments/bootCheck.js`, `GET /healthz/payments` |
| Admin alerts (Discord `payments` + email `ALERT_EMAIL_TO`) | `backend/src/services/payments/paymentAlerts.js` |
| Audit log (every step, append-only) | `backend/src/models/PaymentEvent.js` |
| Frontend | `pages/PaymentJobPosting.tsx`, `PaymentSuccess.tsx`, `PaymentCancel.tsx`, `PaymentFakeSuccess.tsx`, admin tab "Pagesat" |

**The ORDER owns the money.** A `PaymentOrder` (`ord_` + 24 hex) is created
for every checkout and carries `amountCents`, `tier`, `purpose`
(`job_post` | `job_renewal`) and `provider`. The job is only touched when a
paid order is applied to it. Nothing about price or tier is written to the
job at checkout time (that was bug O-34: paying an older checkout page used to
charge one amount and expect another).

---

## 2. Order state machine

```
created ──► pending                     provider session created (URL handed out)
created|pending ──► paid                provider confirmed the money
created|pending ──► failed | canceled | expired
pending (+processingSince)              delayed method: checkout complete, bank still settling
canceled|expired ──► paid               late payment (a Paysera page can't be expired)
paid ──► refunded | partially_refunded | disputed
paid ──► refunded | partially_refunded refunded BEFORE it could be applied (activation skipped)
partially_refunded ──► refunded | partially_refunded   (refundedCents only grows)
disputed ──► paid | partially_refunded dispute won / warning closed
disputed ──► refunded                  dispute lost (money gone, listing closed)
```

* Transitions happen **only** through atomic `findOneAndUpdate` filtered on the
  current status. Concurrent webhook + success-page reconcile + cron collapse
  to exactly one transition (tested with 5 parallel fulfils).
* `paid` never goes back. A provider "paid" for a **failed** order
  (verification failure / provider error) does not change its status — it sets
  `needsRefund=true` (`paid_after_close`).
* `openSlot = "<jobId>:<purpose>"` is set while an order is `created|pending`,
  with a unique sparse index → at most **one open checkout per job+purpose**.
  Two parallel "Pay" clicks give one checkout and one `409 CHECKOUT_IN_PROGRESS`.
* Activation (job update) is a separate, claimed step
  (`activation.status: not_applied → applied | skipped`, `activation.claimedAt`)
  so exactly one caller publishes the job even when paid twice concurrently.

---

## 3. Every money path

### 3.1 Checkout (employer)
`POST /api/payments/checkout { jobId, tier: standard|promoted, purpose: job_post|job_renewal }`
— auth employer, **verified**, 20/h per employer.

1. Rejections: bad tier/purpose/jobId → 400; not owner or deleted → 404;
   free employer / `payment_enabled=false` → 400 `FREE_POSTING`; job state
   wrong → 400 `INVALID_JOB_STATE` (`job_post` needs `pending_payment`,
   `job_renewal` needs `expired|closed`).
2. Provider: first of `PAYMENT_PROVIDERS` (default `stripe`). If not
   configured: non-production → **dev-fake** (no money, URL
   `/payment/fake-success?order=…`); production → **503
   `PAYMENTS_UNAVAILABLE`** "Pagesat me kartë nuk janë aktive ende…" + deduped
   admin alert.
3. Price: `priceCentsForTier(tier)` from `lib/pricing.js` (integer cents).
4. Open checkout for the same job+purpose:
   same tier, same price, > 2 min left → **reused** (same URL);
   otherwise retired first (Stripe: `checkout.sessions.expire`; if Stripe
   says that session is already **paid**, it is fulfilled instead and the
   caller gets `409 ALREADY_PAID`).
5. Order `created` → Stripe Checkout Session (idempotency key
   `checkout-<orderId>`, `expires_at` now + 31 min, metadata
   `{orderId, jobId, purpose, tier}` on session AND PaymentIntent,
   `success_url …/payment/success?order=<id>&session_id={CHECKOUT_SESSION_ID}`,
   `cancel_url …/payment/cancel?order=<id>`) → order `pending`.
   Stripe error → order `failed`, slot freed, `502 PROVIDER_ERROR`. If Stripe
   **rejected the request itself** (invalid parameter, unknown payment method
   configuration, key permissions — it will fail for every employer) the
   order also gets a `checkout_rejected` audit event and admins are alerted at
   once ("Stripe rejects our checkout request — nobody can pay").
   **Payment methods are NOT sent** — the pinned API version **rejects**
   `payment_method_types` on Checkout Sessions (found against real Stripe
   2026-10-22; the earlier "cards only" L2 fix broke every real checkout).
   Methods come from the Dashboard settings, or from
   `STRIPE_PAYMENT_METHOD_CONFIGURATION=pmc_…` (sent as
   `payment_method_configuration`; a malformed value is ignored and reported
   by healthz). The test-suite's fake Stripe rejects `payment_method_types`
   exactly like the real API, so this cannot regress silently.

### 3.1b Delayed payment methods ("processing")
Some Dashboard methods settle later (bank debits / transfers). Then Checkout
completes with `payment_status: unpaid`:
* `checkout.session.completed` (unpaid) → the order stays **`pending`** with
  `processingSince` (+ the PaymentIntent id); its open slot keeps a second
  payment for the same job impossible. The success page shows **"Pagesa po
  përpunohet"**; admin Pagesat shows "Në përpunim (banka)".
* Another checkout for that job → **409 `PAYMENT_PROCESSING`** "Pagesa juaj
  për këtë punë po përpunohet nga banka… mos paguani përsëri" (never a second
  Stripe session); deleting/closing the job → 409 `PAYMENT_PROCESSING`.
* `checkout.session.async_payment_succeeded` → normal fulfilment (fresh 21
  days from settlement, receipt, job alerts).
  `checkout.session.async_payment_failed` → order `failed`, slot freed, the
  employer can pay again.
* Lost webhook: a new checkout or the reconcile cron reads the session from
  Stripe and marks the order processing. Still unsettled after **14 days** →
  one admin alert + healthz `processingOverdue` (degraded).
* These orders are NOT counted as stuck checkouts (`openOlderThan60m`).
* Verified with signed events against the fake Stripe; the claimable sandbox
  offered no delayed method, and Stripe's own CLI fixture for
  `async_payment_succeeded` fails on the same `payment_method_types` change.

`GET /api/payments/options?jobId=` (verified owner) tells the tier page what
THIS employer can do now: `{ free, paymentsAvailable, testMode, prices }` —
the per-user answer (production test-mode allowlist, free-now employers).

### 3.2 Fulfilment (provider says "paid")
Sources: Stripe webhook, success-page reconcile (`GET /api/payments/orders/:id`
asks Stripe when the order is > 20 s old), reconcile cron, Paysera callback,
dev-fake completion, admin manual accept. All call `fulfillOrder()`:

1. **Verify** provider, session id, `amount === order.amountCents`, currency
   (EUR), livemode matches the configured key (`sk_live_` ⇒ live). Any mismatch
   → order `failed` + **needsRefund** + admin alert. The job is never touched.
2. Atomic `→ paid`. Already paid → idempotent no-op (re-runs a stuck
   activation if needed).
3. **Activate** (claimed, single conditional update on the job, only from
   `pending_payment` for `job_post`, from `expired|closed` for `job_renewal`):
   * status `active` (or `pending_approval` when `require_job_approval=true`)
   * `tier` from the ORDER (standard → basic, promoted → premium)
   * `paymentStatus=paid`, `paymentId=<orderId>`, `paymentMethod=<provider>`,
     `paidAt`, `paymentRequired`
   * **`postedAt = now`, `expiresAt = now + JOB_TTL_DAYS (21)`** — a paid
     listing always gets its full period (O-65)
   * renewal: `viewCount = 0`; `closedReason` cleared
   * first publication (`job_post` → `active`): `notification.status =
     pending`, `lastAttemptAt = now` in the same update — the embedding
     retry worker's "active + idle" sweep skips it for its 1 h cooldown so the
     inline fan-out below can't be duplicated, and still recovers it if the
     inline path dies
   * `Location.jobCount +1` (the update bypasses the post-save hook)
   * Job cannot be activated (deleted, rejected, closed, already paid by
     another order = **duplicate payment**) → `activation: skipped`,
     **needsRefund**, admin alert, job untouched.
   * **Guards before anything is published** (review M2/M3/H1) — each one
     skips activation and leaves the job untouched:
     - the payment was refunded (fully/partly) before we could apply it — a
       `charge.refunded` that beat `checkout.session.completed`, or a refund the
       reconcile sees on the expanded PaymentIntent → order `refunded`
       (no flag) / `partially_refunded` (**needsRefund** review)
     - the employer is suspended / banned / deleted (paid while on the Stripe
       page) → **needsRefund**
     - a test-mode payment in production for a non-allowlisted employer → no
       flag (no real money)
   * `postingBasis` = `paid` (amount > 0) or `free` (waiver / free order), and
     job `paymentStatus` = `paid` (amount > 0) or **`not_required`** (0 €).
     Free posts and free renewals (whitelisted employer, `payment_enabled`
     off) are `not_required` too. "Unpaid" is only ever job status
     `pending_payment` — reminder, timeout, checkout and admin views all
     select on that status; a legacy free job left at `paymentStatus:
     pending` is therefore never treated as unpaid.
4. Side effects (never block or fail the money path): receipt email (+ .docx,
   says "awaiting approval" when applicable), Discord, embedding refresh with
   **`notifyUsers: true` for the first publication of a `job_post` that is
   `active`** (job-alert emails to matching jobseekers; renewals don't
   re-notify; `pending_approval` jobs notify on admin approval), IndexNow ping,
   `RevenueAnalytics` daily `$inc` of the real amount, and retiring any other
   open checkout for the same job.

### 3.3 Admin manual accept
`POST /api/admin/payments/:jobId/manual-accept { reason ≥5, tier?, amountCents? }`
— money received outside the card flow (bank transfer, cash) or a waiver
(`amountCents: 0`). Allowed from `pending_payment` (post) or `expired|closed`
(renewal); anything else → 409. Creates a provider **`admin`** order and goes
through the **same** fulfilment/activation (fresh 21 days, job alerts on first
publication), then retires the employer's open card checkout. The admin UI
asks which it was (review L4): **"Paguar jashtë sistemit"** (package + amount
received, booked as revenue, invoice emailed) or **"Falas (pa faturë)"**
(0 €, no invoice, `postingBasis: free`).

### 3.3b Free publication (employer became free after posting — review M5a)
If a `pending_payment` job's employer posts free NOW (whitelisted, or
`payment_enabled` switched off after the job was created), checkout answers
`FREE_POSTING` and the tier page shows **"Publiko tani"** →
`POST /api/payments/publish-free { jobId }` → a 0 € provider **`free`** order
through the normal activation (fresh 21 days, job alerts, no invoice; any open
card checkout is retired first). Refused (400 `PAYMENT_REQUIRED`) when the
employer is not free.

### 3.4 Refunds
* **Admin → Pagesat → Porositë → "Rimburso"**
  (`POST /api/admin/payments/orders/:orderId/refund { reason, amountCents? }`).
  Stripe orders: real refund (idempotency key
  `refund-<orderId>-<amount|full>-<alreadyRefunded>`), recorded immediately;
  the later `charge.refunded` webhook is a no-op. Other providers: record-only
  ("Regjistro rimbursim" — you moved the money yourself).
* Refunds made in the Stripe dashboard arrive via `charge.refunded` and are
  recorded the same way.
* **Full refund of the order that paid for the current listing closes the
  job** (`status: closed`, `closedReason: refund`, `paymentStatus: refunded`);
  the employer cannot re-open it, only renew (pay again). Partial refunds keep
  the job live.
* Revenue analytics are reduced by the refunded amount.

### 3.5 Disputes (chargebacks)
`charge.dispute.created` → order `disputed`, admin alerted (Discord + email).
The job is **not** closed automatically — respond in the Stripe dashboard and
decide. Admin refund is blocked while disputed.
`charge.dispute.closed` (review L6b): `won`/`warning_closed` → back to `paid`
(refunds unblocked); `lost` → order `refunded` (money gone), revenue reversed,
the listing it paid for closed (`closedReason: refund`), admin alerted.

### 3.6 Employer lifecycle (no money moves here)
* `PATCH /api/jobs/:id/status` (verified owner) accepts only `closed` or
  `active`. `closed` from active/pending_approval/draft/pending_payment
  (retires open checkouts). `active` only **re-opens a job the employer
  closed** (or a legacy closed job without `closedReason`) whose period was
  paid or granted free (`postingBasis`/legacy free price) — or whose employer
  is free now — and is not expired; a job closed while awaiting approval goes
  back to `pending_approval`. An unpaid legacy job is never re-opened for free
  (review L6c). Everything else → 400 with an Albanian message. No `paused`.
  Dashboard: **"Mbyll"** on active jobs (confirm dialog), **"Rihap"** only where
  this rule allows; refusals show the backend's message.
* **Race safety (review M1)**: close and delete are conditional writes on the
  status + `paymentId` that were read. A checkout that was paid a moment ago →
  409 `PAYMENT_COMPLETED`; one that cannot be confirmed retired (Stripe
  unreachable, session completing) → 409 `CHECKOUT_IN_PROGRESS` ("try again in
  a minute"); a job changed in between → 409 `JOB_CHANGED`. A paid activation
  is never overwritten; Location counts are adjusted explicitly.
* `POST /api/jobs/:id/renew` (verified owner): free employers → fresh 21-day
  period, tier basic. Paying employers → **402 `PAYMENT_REQUIRED`**
  `{ data: { checkout: { purpose: 'job_renewal', jobId } } }` → the dashboard
  sends them to `/payment/job/:id?purpose=job_renewal`.
* `DELETE /api/jobs/:id` retires open checkouts first (409s as above); a late
  payment for a deleted job → `activation: skipped` + needsRefund.
* `POST /api/jobs` ignores any client `tier` (always `basic`) and never runs
  the discount engine; `job.pricing` is informational (list price).
* Admin moderation is not a payment bypass (review L1): BOTH approve routes
  (`/admin/jobs/:id/manage` and `/admin/jobs/:id/approve`) share one rule —
  approvable when paid, granted free (`postingBasis: free`, or a legacy job
  created free — review M5b), or the employer is free now; otherwise 409 (use
  manual accept). **Approval starts the 21 days** (review L6a: `postedAt`/
  `expiresAt` reset at approval, not at payment). Rejecting/deleting a paid job
  flags its order `needsRefund` for a decision.

### 3.7 Employer sanctions (review M3, L5)
* Activation never publishes for a suspended/banned/deleted employer (money
  → needsRefund).
* `orderService.handleEmployerSanction({ employerId, closedJobIds, action, actor })`
  — call it AFTER the sanction closed the employer's live jobs (integration:
  `lib/employerSanctions.js closeJobsForSanctionedEmployer`, used by both the
  admin manage route and the report-action path). It retires the employer's
  open checkouts (`retireOpenCheckoutsForEmployer`) and flags the paid order of
  every listing the sanction closed as **needsRefund — refund review (admin
  decides)**. Owner rule: listings closed by a suspension stay closed; the
  refund is never automatic — decide in Pagesat (refund or "Zgjidh pa
  rimbursim").

---

## 4. Webhook

`POST https://api.advance.al/api/payments/stripe/webhook` — mounted in
`server.js` **before** `express.json()` with `express.raw()`, before the
global `/api` rate limiter and before maintenance mode.

| Event | Effect |
|---|---|
| `checkout.session.completed` | `payment_status=paid` → fulfil; `unpaid` (delayed method) → order processing (§3.1b) |
| `checkout.session.async_payment_succeeded` | fulfil |
| `checkout.session.async_payment_failed` | order failed |
| `checkout.session.expired` | order expired (slot freed) |
| `charge.refunded` | record refund (cumulative `amount_refunded`); payment not yet linked → order found through the PaymentIntent's metadata; still unmatched → **500, not marked processed** (Stripe re-delivers) |
| `charge.dispute.created` | order disputed + alert |
| `charge.dispute.closed` | won → paid; lost → refunded + listing closed |
| anything else | 200, recorded as ignored |

Responses: 400 bad/missing signature · 503 secret not set (Stripe retries) ·
500 transient failure or not-yet-applicable event (Stripe retries) · 200
otherwise. Each Stripe event id
is stored once (`PaymentEvent.providerEventId`, unique); a re-delivery of a
processed event is a no-op, a re-delivery of one that failed half-way is
processed again (every handler is idempotent).

---

## 5. Configuration

```
STRIPE_SECRET_KEY=sk_test_… | sk_live_… | rk_live_… (restricted)
STRIPE_WEBHOOK_SECRET=whsec_…          # per endpoint AND per mode (test ≠ live)
STRIPE_PAYMENT_METHOD_CONFIGURATION=pmc_…   # optional; unset = Dashboard default methods
STRIPE_KEY_MODE=live                    # ONLY for a key whose prefix says neither live nor test
PAYMENT_PROVIDERS=stripe                # first = checkout provider
ALERT_EMAIL_TO=ops@advance.al           # + Discord DISCORD_WEBHOOK_PAYMENTS
FRONTEND_URL=https://advance.al         # Stripe return URLs
PAYMENTS_RECONCILE_INTERVAL_MS=900000   # optional
# Supervised go-live rehearsal ONLY (production + sk_test_ key) — remove after:
STRIPE_ALLOW_TEST_MODE_IN_PRODUCTION=true
STRIPE_TEST_MODE_ALLOWLIST=owner@advance.al,<employer id>   # who may pay with test cards
```
**Remove from production** (ignored there, logged as an ERROR at boot):
`PAYSERA_ALLOW_FAKE_SUCCESS`, `ENABLE_MOCK_PAYMENTS`, `PAYMENTS_ALLOW_FAKE`.
In non-production environments without Stripe keys, checkout uses the
dev-fake provider automatically (no flag needed).

SystemConfiguration (Admin → Konfigurimi / Çmimet): `payment_enabled`,
`pricing_standard_posting`, `pricing_promoted_posting`,
`require_job_approval`. The public configuration endpoint serves the exact
prices checkout charges, plus `paymentsAvailable`. `PUT /configuration/pricing`
parses `paymentEnabled` strictly (`true`/`false`/`"true"`/`"false"`; anything
else → 400 — review L6d). In production the `payment_enabled` document MUST
exist and be active (missing ⇒ treated as ON + ERROR).

The Stripe API version is pinned in `stripeProvider.js`
(`2026-09-30.endive`, the version `stripe@23.0.0` was generated against). Bump
it together with the SDK — and re-run `tests/integration/stripe-real` with a
test key, which checks every request shape we send against the real API.

**Live or test?** Parsed from the key's `live`/`test` segment (`sk_live_`,
`rk_live_`, `sk_test_`, `rkcs_test_` claimable sandbox, …); then **Stripe's own
`livemode`** on the objects we create/retrieve wins (a contradiction is
logged as an ERROR). A signed webhook from the other mode is only logged (it
means `STRIPE_WEBHOOK_SECRET` and `STRIPE_SECRET_KEY` come from different
modes). A key with an unrecognised prefix: the boot check asks Stripe
(Checkout Sessions list — works with restricted keys); still unknown →
production refuses checkout (fail closed: a test key mistaken for live would
publish for free) with a boot ERROR + alert telling you to set
`STRIPE_KEY_MODE=live`. `/healthz/payments` shows `mode` and `modeSource`
(`api`/`key`/`env`/`none`).

**Restricted live key** (optional, instead of `sk_live_`): it needs Checkout
Sessions (write — create/expire/retrieve/list), PaymentIntents (read), Charges
(read — `latest_charge` is expanded to see refunds) and Refunds (write). It
does NOT need balance, account, disputes or payment-method-configuration
access (the claimable sandbox key had none of those and everything worked).
Create it in TEST mode first and run `stripe-real` with it.

---

## 6. Monitoring

* `GET /healthz/payments` (header `X-Healthz-Token`) →
  `payments: { provider, configured, mode: live|test|unknown|fake|unconfigured,
  modeSource, webhookSecretSet, paymentMethods: dashboard-default|configuration|invalid,
  testModeInProduction, testModeAllowlisted, paymentEnabled,
  paymentEnabledSource, blocking, degradedReasons[] }`, `orders: { open,
  openOlderThan60m, needsRefund, paidNotActivated, processing,
  processingOverdue }`, reconcile worker heartbeat. `status: degraded` when
  blocking, Stripe TEST mode or an unknown key mode in production,
  `payment_enabled` missing in production, a malformed
  `STRIPE_PAYMENT_METHOD_CONFIGURATION`, any `needsRefund`, any
  paid-not-activated, checkouts open > 60 min (lost webhooks — delayed
  payments still settling don't count), or a delayed payment unsettled > 14
  days. Point UptimeRobot at it with a keyword monitor on `"healthy"`.
* Business control → "update analytics" recomputes today's revenue from paid
  orders (net of refunds, split standard/promoted) — it used to overwrite it
  with jobs × 50 €. The admin overview card **"Të Ardhurat"** is this
  month's (UTC) money collected — paid orders that published a listing, net
  of refunds (it used to be premium jobs × 28 + featured × 42 over all jobs
  ever). The Discord daily digest counts paid / failed / refunded **orders**
  (it counted legacy Paysera `callback_paid` events — always 0 with Stripe).
* Alerts (Discord `payments` + email): checkout unavailable, **Stripe rejects
  our checkout request**, verification failure, duplicate / un-appliable
  payment, payment for a closed order, payment for an unknown order, dispute,
  delayed payment unsettled > 14 days, key mode unknown, daily needsRefund
  digest.
* Audit trail: `PaymentEvent` (filter by `orderId`); admin tab "Pagesat".

---

## 7. Runbook

**A customer says "I paid but my job isn't live".**
Admin → Pagesat → Porositë → filter their email.
* Order `pending` → the webhook hasn't arrived. Open the order status once
  (`GET /api/payments/orders/<id>` as admin or the employer's success page) —
  it asks Stripe directly and fulfils if paid. The reconcile cron does the same
  every 15 min for orders older than 10 min.
* Order `paid`, activation `skipped` → read `activationReason` (duplicate
  payment, job deleted/rejected). Refund it, or if the job should go live,
  fix the job state and use manual accept, then refund the stray order.
* Order `paid`, activation `not_applied` for > 5 min → the cron finishes it;
  `/healthz/payments` shows `paidNotActivated` until then.
* Job `pending_approval` → it is paid and waiting for moderation (approve it).

**Duplicate payment** (two orders paid for one job) — the second is `paid` +
`needsRefund` + `activation: skipped`. Refund it from the admin tab (full
refund). The job stays on the first order.

**Amount / currency / livemode mismatch** — order `failed` + `needsRefund`.
Money was captured but never applied. Refund (no amount → full PaymentIntent
refund), then investigate the price/config change that caused it.

**Stuck open orders** (`openOlderThan60m > 0`) — usually lost webhooks.
Stripe dashboard → Developers → Webhooks → endpoint → failed deliveries →
"Resend"; or wait for the cron. Check `STRIPE_WEBHOOK_SECRET` matches the
endpoint (wrong secret = every delivery 400).

**Webhook replay** — safe at any time: processed events are no-ops, the rest
are idempotent (verified against real Stripe: `stripe events resend` and a
re-signed copy of a real event both answered 200 `duplicate`, order paid once).

**Alert "Stripe rejects our checkout request — nobody can pay"** — every
checkout fails. Read the parameter/message in the alert (or the order's
`checkout_rejected` audit event). Typical causes: a wrong
`STRIPE_PAYMENT_METHOD_CONFIGURATION` (remove it or fix the `pmc_` id), a
restricted key missing a permission, a Stripe API change after an SDK bump.
Until fixed, set `payment_enabled=false` if employers must keep publishing.

**Order "Në përpunim (banka)" / employer sees "Pagesa po përpunohet"** — a
delayed payment method; nothing to do, the job goes live on
`async_payment_succeeded`. Alert after 14 days → check the PaymentIntent in
the Stripe dashboard; if the bank failed it without a webhook, the next
reconcile frees the slot.

**Alert "Stripe key mode unknown"** — the key's prefix says neither live nor
test and production refuses checkout. Set `STRIPE_KEY_MODE=live` (or `test`)
on Render and redeploy.

**Refund flag that needs no refund** (customer agreed to a credit, etc.) →
"Zgjidh pa rimbursim" with a reason (recorded).

**Production says "Pagesat me kartë nuk janë aktive ende"** — Stripe env
missing on Render (see `/healthz/payments`). Set both keys, redeploy, or set
`payment_enabled=false` to let everyone post free in the meantime.

**Switch test → live** — create the live webhook endpoint (same URL, same 7
events), set `STRIPE_SECRET_KEY=sk_live_…` and the **live** `whsec_…`
together, REMOVE `STRIPE_ALLOW_TEST_MODE_IN_PRODUCTION` and
`STRIPE_TEST_MODE_ALLOWLIST`, redeploy, check `/healthz/payments` shows
`mode: "live"`, `testModeInProduction: false`, `status: "healthy"`. Open
test-mode orders are retired automatically (mode-switch handling).

**An employer was suspended/banned** — their open checkouts are retired and
any paid listing the sanction closed appears in Pagesat as "Kërkon
rimbursim" (refund review). Decide per order: refund, or "Zgjidh pa
rimbursim" with the reason. Listings closed by a suspension stay closed.

---

## 8. Test-mode procedure (before go-live)

Never put a bare `sk_test_` key on the production service: production refuses
it (review H1). Choose ONE:
* **Staging / local** (preferred): a separate Render service or local backend
  with `NODE_ENV` ≠ production, or
* **Supervised rehearsal on production**: `sk_test_` + test webhook secret +
  `STRIPE_ALLOW_TEST_MODE_IN_PRODUCTION=true` +
  `STRIPE_TEST_MODE_ALLOWLIST=<your test employer email>`. Only that employer
  can check out; healthz stays `degraded` until you switch to live and remove
  both flags.

1. Set `STRIPE_SECRET_KEY=sk_test_…` (+ the two rehearsal flags on production).
2. Local: `stripe listen --forward-to localhost:3001/api/payments/stripe/webhook`
   and put the printed `whsec_…` in `STRIPE_WEBHOOK_SECRET`. Deployed: create
   the test-mode endpoint in the dashboard (7 events).
3. As a verified, non-whitelisted (and, on production, allowlisted) employer with `payment_enabled=true`: post a
   job → tier page → "Paguaj me kartë" → card `4242 4242 4242 4242`, any future
   date, any CVC → back on `/payment/success` the page must go from "Po
   verifikojmë…" to "Pagesa u krye me sukses" and the job is live with
   `expiresAt` 21 days from now.
4. Repeat with `4000 0000 0000 0002` (declined) → Stripe says "Your credit
   card was declined", stays on Stripe, job not live.
5. `4000 0027 6000 3184` → 3-D Secure test page → COMPLETE → paid, live.
6. Cancel on the Stripe page (← top left) → `/payment/cancel` → "Provo
   përsëri" → the SAME checkout is reused → pay → live.
7. Choose Standart → Stripe → browser Back → choose I Promovuar → Stripe shows
   €49.00; the first session is expired at Stripe; pay → job premium.
8. Admin → Pagesat → refund the order → job closed; Stripe dashboard shows the
   refund; `charge.refunded` webhook delivered 200.
9. Expired/closed job → "Riposto" → checkout with `purpose=job_renewal` → live
   again for 21 days.
10. `4000 0000 0000 0259` → paid, then a dispute within seconds → order
   "Kontestim", success page "Pagesa është në kontestim", alert; job stays live.
11. Webhook down (stop `stripe listen`), pay → order stays pending → the
   reconcile cron fulfils it (orders > 10 min old).
12. `cd backend && STRIPE_SECRET_KEY=<test key> npx jest tests/integration/stripe-real`
   — real test-mode API checks (any TEST key: sk_test_/rk_test_/rkcs_test_).
13. Then **switch to live** (§7) and remove the rehearsal flags.

All of 3–12 were run against a real Stripe sandbox on 2026-10-22 (Playwright
on the hosted Checkout page, `stripe listen` webhooks); see the payments
agent report for evidence.

---

## 9. Paysera (legacy, disabled)

Enable only with `PAYMENT_PROVIDERS=paysera` (+ `PAYSERA_PROJECT_ID`,
`PAYSERA_SIGN_PASSWORD`, `PAYSERA_TEST`). It uses the same orders (Paysera
`orderid` = order id) and the same fulfilment. The callback additionally
rejects a different `projectid` and test payments unless `PAYSERA_TEST=true`
(O-59); currency must be EUR. Disabled: `/paysera/initiate` → 410,
`/paysera/callback` → 503. `PAYSERA_ALLOW_FAKE_SUCCESS` is no longer read.
