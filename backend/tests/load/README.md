# Load + Soak Testing

Standalone scripts (NOT jest tests). Each one boots the real express
server against an in-memory MongoDB, hammers it with concurrent HTTP
requests, and reports latency percentiles + throughput.

## Run

```
# Quick load test — 30s burst at 50 concurrent clients
npm run loadtest

# Soak test — 30 min sustained at 20 concurrent clients,
# tracks heap growth to detect memory leaks
npm run soak
```

## What each does

### `load.mjs` — burst load test
- Spins up server on random port
- Seeds 100 jobs, 50 jobseekers
- Runs N concurrent clients for D seconds
- Mix: 70% reads (GET /jobs, GET /jobs/:id, GET /locations),
  20% authed reads (GET /auth/me), 10% writes (PATCH /users/profile)
- Reports: total reqs, RPS, latency p50/p95/p99, error rate per status

### `soak.mjs` — sustained-load memory leak detector
- Same setup, longer duration, lower concurrency
- Samples Node heap size every 30s
- Flags FAIL if heap grows >50% over baseline at any sample after
  warm-up (5 min)
- Use to catch leaks in: connection pools, event-listener accumulation,
  mongoose schema cache, supertest agents

## Reading the output

```
=== LOAD TEST RESULTS ===
duration:        30.04s
total requests:  6291
successful:      6285 (99.90%)
errors:          6 (0.10%)
RPS:             209.4
latency p50:     45ms
latency p95:     180ms
latency p99:     420ms
latency max:     1208ms

errors by status:
  500: 4 (database timeout)
  429: 2 (rate limit kicked in)
```

## Targets

These are guidelines — production behind a real CDN/Atlas should hit
much better numbers. Locally on macbook + memory mongo:

| Endpoint type   | Acceptable p95  | Concerning p95 |
|-----------------|-----------------|-----------------|
| Static JSON     | < 50ms          | > 200ms         |
| Indexed read    | < 100ms         | > 500ms         |
| Authed read     | < 150ms         | > 800ms         |
| Write (small)   | < 300ms         | > 1000ms        |

If local p95 exceeds the "concerning" column, production will be
worse — investigate before shipping.
