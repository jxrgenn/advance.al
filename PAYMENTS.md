# PAYMENTS — how advance.al takes money

Owner decisions (2026-10-02, binding):

1. **Stripe-hosted Checkout is the only checkout** (cards). Paysera code stays
   in the repo but is disabled unless `PAYMENT_PROVIDERS` includes `paysera`.
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
   production.

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
canceled|expired ──► paid               late payment (a Paysera page can't be expired)
paid ──► refunded | partially_refunded | disputed
partially_refunded ──► refunded | partially_refunded   (refundedCents only grows)
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
   Stripe error → order `failed`, slot freed, `502 PROVIDER_ERROR`.

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
publication), then retires the employer's open card checkout.

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

### 3.6 Employer lifecycle (no money moves here)
* `PATCH /api/jobs/:id/status` (verified owner) accepts only `closed` or
  `active`. `closed` from active/pending_approval/draft/pending_payment
  (retires open checkouts; 409 if one was just paid). `active` only
  **re-opens a job the employer closed**, still paid (or employer free), not
  expired; a job closed while awaiting approval goes back to
  `pending_approval`. Everything else → 400 with an Albanian message. No
  `paused`.
* `POST /api/jobs/:id/renew` (verified owner): free employers → fresh 21-day
  period, tier basic. Paying employers → **402 `PAYMENT_REQUIRED`**
  `{ data: { checkout: { purpose: 'job_renewal', jobId } } }` → the dashboard
  sends them to `/payment/job/:id?purpose=job_renewal`.
* `DELETE /api/jobs/:id` retires open checkouts first (409 if one was just
  paid); a late payment for a deleted job → `activation: skipped` +
  needsRefund.
* `POST /api/jobs` ignores any client `tier` (always `basic`) and never runs
  the discount engine; `job.pricing` is informational (list price).
* Admin moderation is not a payment bypass: approving an unpaid job of a
  paying employer → 409 (use manual accept); rejecting/deleting a paid job
  flags its order `needsRefund` for a decision.

---

## 4. Webhook

`POST https://api.advance.al/api/payments/stripe/webhook` — mounted in
`server.js` **before** `express.json()` with `express.raw()`, before the
global `/api` rate limiter and before maintenance mode.

| Event | Effect |
|---|---|
| `checkout.session.completed` | `payment_status=paid` → fulfil; `unpaid` (delayed method) → stays pending |
| `checkout.session.async_payment_succeeded` | fulfil |
| `checkout.session.async_payment_failed` | order failed |
| `checkout.session.expired` | order expired (slot freed) |
| `charge.refunded` | record refund (cumulative `amount_refunded`) |
| `charge.dispute.created` | order disputed + alert |
| anything else | 200, recorded as ignored |

Responses: 400 bad/missing signature · 503 secret not set (Stripe retries) ·
500 transient failure (Stripe retries) · 200 otherwise. Each Stripe event id
is stored once (`PaymentEvent.providerEventId`, unique); a re-delivery of a
processed event is a no-op, a re-delivery of one that failed half-way is
processed again (every handler is idempotent).

---

## 5. Configuration

```
STRIPE_SECRET_KEY=sk_test_… | sk_live_…
STRIPE_WEBHOOK_SECRET=whsec_…          # per endpoint AND per mode (test ≠ live)
PAYMENT_PROVIDERS=stripe                # first = checkout provider
ALERT_EMAIL_TO=ops@advance.al           # + Discord DISCORD_WEBHOOK_PAYMENTS
FRONTEND_URL=https://advance.al         # Stripe return URLs
PAYMENTS_RECONCILE_INTERVAL_MS=900000   # optional
```
**Remove from production** (ignored there, logged as an ERROR at boot):
`PAYSERA_ALLOW_FAKE_SUCCESS`, `ENABLE_MOCK_PAYMENTS`, `PAYMENTS_ALLOW_FAKE`.
In non-production environments without Stripe keys, checkout uses the
dev-fake provider automatically (no flag needed).

SystemConfiguration (Admin → Konfigurimi / Çmimet): `payment_enabled`,
`pricing_standard_posting`, `pricing_promoted_posting`,
`require_job_approval`. The public configuration endpoint serves the exact
prices checkout charges, plus `paymentsAvailable`.

The Stripe API version is pinned in `stripeProvider.js`
(`2026-09-30.endive`, the version `stripe@23.0.0` was generated against). Bump
it together with the SDK.

---

## 6. Monitoring

* `GET /healthz/payments` (header `X-Healthz-Token`) →
  `payments: { provider, configured, mode: live|test|fake|unconfigured,
  webhookSecretSet, paymentEnabled, blocking }`, `orders: { open,
  openOlderThan60m, needsRefund, paidNotActivated }`, reconcile worker
  heartbeat. `status: degraded` when blocking, any `needsRefund`, any
  paid-not-activated, or checkouts open > 60 min (lost webhooks). Point
  UptimeRobot at it with a keyword monitor on `"healthy"`.
* Alerts (Discord `payments` + email): checkout unavailable, verification
  failure, duplicate / un-appliable payment, payment for a closed order,
  payment for an unknown order, dispute, daily needsRefund digest.
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
are idempotent.

**Refund flag that needs no refund** (customer agreed to a credit, etc.) →
"Zgjidh pa rimbursim" with a reason (recorded).

**Production says "Pagesat me kartë nuk janë aktive ende"** — Stripe env
missing on Render (see `/healthz/payments`). Set both keys, redeploy, or set
`payment_enabled=false` to let everyone post free in the meantime.

**Switch test → live** — create the live webhook endpoint (same URL, same 6
events), set `STRIPE_SECRET_KEY=sk_live_…` and the **live** `whsec_…`
together, redeploy, check `/healthz/payments` shows `mode: "live"`. Orders
created in test mode can no longer be fulfilled (livemode check) — let them
expire.

---

## 8. Test-mode procedure (before go-live)

1. Render (or local `backend/.env`): `STRIPE_SECRET_KEY=sk_test_…`.
2. Local: `stripe listen --forward-to localhost:3001/api/payments/stripe/webhook`
   and put the printed `whsec_…` in `STRIPE_WEBHOOK_SECRET`. Deployed: create
   the test-mode endpoint in the dashboard.
3. As a verified, non-whitelisted employer with `payment_enabled=true`: post a
   job → tier page → "Paguaj me kartë" → card `4242 4242 4242 4242`, any future
   date, any CVC → back on `/payment/success` the page must go from "Po
   verifikojmë…" to "Pagesa u krye me sukses" and the job is live with
   `expiresAt` 21 days from now.
4. Repeat with `4000 0000 0000 0002` (declined) → stays on Stripe, job not live.
5. Cancel on the Stripe page → `/payment/cancel` → "Provo përsëri" works.
6. Admin → Pagesat → refund the order → job closed; Stripe dashboard shows the
   refund; `charge.refunded` webhook delivered 200.
7. Expired/closed job → "Riposto" → checkout with `purpose=job_renewal` → live
   again for 21 days.
8. `cd backend && STRIPE_SECRET_KEY=sk_test_… npx jest tests/integration/stripe-real`
   — real test-mode API checks.

---

## 9. Paysera (legacy, disabled)

Enable only with `PAYMENT_PROVIDERS=paysera` (+ `PAYSERA_PROJECT_ID`,
`PAYSERA_SIGN_PASSWORD`, `PAYSERA_TEST`). It uses the same orders (Paysera
`orderid` = order id) and the same fulfilment. The callback additionally
rejects a different `projectid` and test payments unless `PAYSERA_TEST=true`
(O-59); currency must be EUR. Disabled: `/paysera/initiate` → 410,
`/paysera/callback` → 503. `PAYSERA_ALLOW_FAKE_SUCCESS` is no longer read.
