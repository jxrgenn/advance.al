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
