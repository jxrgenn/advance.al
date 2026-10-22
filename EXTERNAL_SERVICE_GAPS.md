# External Service Test Coverage Gaps

Honest accounting of which external services have real integration tests
in CI vs. which are exercised only by offline mocks. Maintained as part
of Phase 28 (test-suite genuineness sprint).

## Summary

| Service | Integration in code | CI test mode | Status |
|---|---|---|---|
| MongoDB | yes | mongodb-memory-server (local in-process) | ✅ Real-ish (in-memory) |
| OpenAI (gpt-4o-mini, embeddings) | yes | snapshot-replay (real responses cached) | ✅ Real on first capture, replay thereafter |
| Cloudinary | yes | real upload + cleanup (free tier) | ✅ Real every CI run |
| Resend (email) | yes | offline mock + 1 live smoke (workflow_dispatch) | ⚠️ Partial |
| Upstash Redis | yes | gracefully degrades to in-memory | ⚠️ Real path uncovered in CI |
| Sentry | yes | not exercised | ⚠️ Production-only |
| Twilio (SMS) | partially configured | NOT TESTED — no Twilio account | 🔴 **Known gap** |
| Stripe (card checkout) | yes (2026-10) | SDK client faked at the network boundary (fake rejects what the real API rejects); webhook signatures REAL; real test-mode suite runs with any TEST key; full hosted-Checkout E2E run against a real sandbox 2026-10-22 | ✅ Real API path verified (test mode); delayed methods fake-only |

## Stripe (card checkout — added 2026-10)

**What CI proves offline**: every payment state transition, fulfilment,
refund/dispute bookkeeping and the full webhook route — with REAL signature
verification (`Stripe.webhooks.generateTestHeaderString` → route →
`Stripe.webhooks.constructEvent`, raw-body mount). Only the Stripe SDK's
network calls (`checkout.sessions.create/retrieve/expire`, `refunds.create`)
are replaced by an in-memory fake injected through
`stripeProvider.__setStripeClientForTests()`; tests assert the exact params
we send (amount, metadata, return URLs, idempotency keys). The fake REJECTS
`payment_method_types` (400) and unknown `payment_method_configuration`
exactly like the pinned real API — the 2026-10-22 real-Stripe run found that
an earlier "cards only" param broke every real checkout while the old fake
accepted it.

**What needs a real key** (`tests/integration/stripe-real/`): the pinned API
rejects `payment_method_types`; our Checkout Session params accepted
(expires_at window, pinned apiVersion `2026-09-30.endive`), retrieve with
`expand`, expire round-trip (+ the not-open 400), idempotency (identical
replay → same session, different body → refused),
`payment_method_configuration` pass-through, PaymentIntent retrieve with
`latest_charge`, refunds (partial, idempotent replay, full remainder), 404
shapes, key mode confirmed by Stripe. Runs when `STRIPE_SECRET_KEY` is any
TEST key (`sk_test_`/`rk_test_`/`rkcs_test_`), otherwise skipped with a
printed reason. 8/8 green against the claimable sandbox on 2026-10-22.

**Run manually, not in CI**: the full hosted-Checkout E2E (Playwright on
checkout.stripe.com, `stripe listen`) — card, decline, 3DS, cancel/retry,
tier switch, admin refund, renewal, webhook replay, lost webhook →
reconcile, dispute, Bancontact. Harness is local-only
(`backend/qa-harness/pa/`, git-excluded).

**Not verified against real Stripe**: delayed payment methods (no such
method was enabled in the sandbox; Stripe's own CLI fixture for
`async_payment_succeeded` fails on the same `payment_method_types` change) —
covered by signed-event tests against the fake. A live-mode charge: do the
€35 smoke payment + refund in `DEPLOY_RUNBOOK.md` on launch day.

## Twilio (the major gap)

**Status**: Twilio integration code exists in `backend/src/lib/` but no
Twilio account has been provisioned. SMS code paths are exercised only
by offline mocks.

**Why this matters**:
- Phone-based verification flows are not end-to-end validated
- Any regression in the Twilio integration code would not be caught by CI
- The first real SMS sent from production may surface bugs

**Workaround in code**: A mock SMS sender silently no-ops when Twilio
env vars are missing, so the rest of the verification flow can be
exercised with `console.log`-style assertions.

**To close this gap** (when ready):
1. Provision a paid Twilio account (no free tier for real SMS)
2. Add `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`
   to GitHub Actions secrets
3. Use Twilio's test credentials + magic numbers for free SMS-shaped
   responses without actual SMS:
   - `+15005550006` → "succeeds"
   - `+15005550001` → "invalid phone number"
   - Other magic numbers documented at twilio.com/docs/iam/test-credentials
4. Add `backend/tests/integration/twilio-real.test.js` following the
   same pattern as `cloudinary-real.test.js`

**Until then, do not claim SMS coverage.** Production launches involving
SMS should include manual smoke testing with a real phone.

## Resend (partial gap)

Real Resend send happens in only one CI job (`workflow_dispatch`-only
"smoke" job in `.github/workflows/qa-tests.yml`). All other email-related
tests use the offline test-mode that logs payload but doesn't send.

**Phase 3D goal**: expand the smoke job to cover transactional triggers
(welcome email on register, password reset, application notification).
Use Resend's sandbox domain to avoid spam-reputation impact.

## Upstash Redis (partial gap)

The application gracefully degrades to in-memory caching when
`UPSTASH_REDIS_REST_URL` is missing. Tests run with no Redis. Real
Redis path (cache hit/miss across requests, TTL behavior, eviction) is
not exercised.

**Production note**: This is intentional — local dev and CI use the
in-memory fallback. Production uses real Upstash Redis. The two paths
must remain behaviorally identical or production will have surprises.

## Sentry (production-only)

Sentry SDK is loaded but not configured in test mode. Error reporting
is a "fire-and-forget" sink — failures to report don't impact correctness.
Not testing this path is acceptable trade-off.

---

**Maintained by**: Phase 28 sprint. Last updated: 2026-05-07.
