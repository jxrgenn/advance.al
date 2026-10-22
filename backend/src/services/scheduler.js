/**
 * Restart-safe scheduler for the hourly/daily background jobs (#63).
 *
 * Before: each job was a bare `setInterval(fn, 24h)` with no run at boot, so
 * a daily job only fired after 24 h of CONTINUOUS uptime. On Render a deploy,
 * crash or spin-down restarts every timer from zero — with a deploy or a
 * restart at least once a day, the payment-timeout alerts and the Discord
 * digest never ran; the hourly payment reminders and job expiry lost up to
 * an hour after every restart.
 *
 * Now each job's `nextRunAt` lives in Mongo (models/CronState.js):
 *   - after boot (short jittered delay) a job that is due runs at once;
 *     one that ran recently waits for its real next slot — restarts neither
 *     skip nor repeat a run;
 *   - a run is claimed atomically (`lockedUntil`), so two processes (deploy
 *     overlap) never run the same job twice; the lock expires on its own if
 *     the process dies mid-run, and the run is retried;
 *   - a failed run is retried after `failureRetryMs` (default 30 min, capped
 *     at the interval) instead of waiting a full day;
 *   - schedules can be boundary-aligned (`nextRunAfter`), e.g. "daily at
 *     07:00 UTC" for the Discord digest.
 *
 * The jobs are idempotent by design (each worker records what it already
 * handled), so the rare at-least-once re-run after a crash is harmless.
 */
import os from 'os';
import CronState from '../models/CronState.js';
import logger from '../config/logger.js';

const MIN_POLL_MS = 5_000;

export function everyMs(intervalMs) {
  return (from) => new Date(from.getTime() + intervalMs);
}

/** Next HH:00 UTC strictly after `from`. */
export function dailyAtUtcHour(hourUtc) {
  return (from) => {
    const next = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), hourUtc, 0, 0, 0));
    if (next.getTime() <= from.getTime()) next.setUTCDate(next.getUTCDate() + 1);
    return next;
  };
}

/**
 * @param {object} [opts]
 * @param {string} [opts.instanceId]   lock owner id (default host:pid)
 * @param {number} [opts.maxPollMs]    longest sleep between checks (default 5 min) —
 *                                     bounds drift and picks up nextRunAt edits
 * @param {() => Date} [opts.now]      clock (tests)
 */
export function createScheduler(opts = {}) {
  const instanceId = opts.instanceId || `${os.hostname()}:${process.pid}`;
  const maxPollMs = opts.maxPollMs ?? 5 * 60 * 1000;
  const clock = opts.now || (() => new Date());
  const jobs = new Map();
  const timers = new Map();
  const inflight = new Set();
  let stopped = true;

  /**
   * @param {object} job
   * @param {string} job.name
   * @param {() => Promise<any>} job.run
   * @param {number} [job.intervalMs]            fixed cadence (or give nextRunAfter)
   * @param {(from: Date) => Date} [job.nextRunAfter]
   * @param {(now: Date) => Date} [job.firstRunAt]  first run when no state exists (default: now)
   * @param {number} [job.lockMs]                max expected run time (default min(interval, 30 min), ≥ 2 min)
   * @param {number} [job.failureRetryMs]        retry delay after a failure (default 30 min, ≤ interval)
   */
  function add(job) {
    if (!job?.name || typeof job.run !== 'function') throw new Error('scheduler.add: name and run are required');
    const nextRunAfter = job.nextRunAfter || (job.intervalMs ? everyMs(job.intervalMs) : null);
    if (!nextRunAfter) throw new Error(`scheduler.add(${job.name}): intervalMs or nextRunAfter is required`);
    const approxInterval = job.intervalMs || 24 * 60 * 60 * 1000;
    jobs.set(job.name, {
      name: job.name,
      run: job.run,
      nextRunAfter,
      firstRunAt: job.firstRunAt || ((now) => now),
      lockMs: job.lockMs || Math.max(2 * 60 * 1000, Math.min(approxInterval, 30 * 60 * 1000)),
      failureRetryMs: Math.min(job.failureRetryMs || 30 * 60 * 1000, approxInterval),
    });
    return api;
  }

  function schedule(name, delayMs) {
    if (stopped) return;
    clearTimeout(timers.get(name));
    const t = setTimeout(() => { check(name); }, Math.max(MIN_POLL_MS, Math.min(delayMs, maxPollMs)));
    t.unref?.();
    timers.set(name, t);
  }

  /**
   * Run the job if it is due and the lock is free. Returns the outcome
   * ('ran' | 'failed' | 'not-due' | 'locked' | 'error') — used by tests.
   */
  async function check(name) {
    const job = jobs.get(name);
    if (!job) return 'unknown';
    let outcome = 'not-due';
    try {
      const now = clock();
      // First time this job is seen: seed its schedule (no-op afterwards).
      await CronState.updateOne(
        { _id: name },
        { $setOnInsert: { nextRunAt: job.firstRunAt(now) } },
        { upsert: true }
      ).catch((err) => { if (err?.code !== 11000) throw err; });

      const claimed = await CronState.findOneAndUpdate(
        {
          _id: name,
          nextRunAt: { $lte: now },
          $or: [{ lockedUntil: null }, { lockedUntil: { $lte: now } }],
        },
        { $set: { lockedUntil: new Date(now.getTime() + job.lockMs), lockedBy: instanceId, lastStartedAt: now } },
        { new: true }
      ).lean();

      if (!claimed) {
        const state = await CronState.findById(name).select('nextRunAt lockedUntil').lean();
        outcome = state?.lockedUntil && state.lockedUntil > now ? 'locked' : 'not-due';
        const wakeAt = Math.max(state?.nextRunAt?.getTime() ?? 0, state?.lockedUntil?.getTime() ?? 0);
        schedule(name, wakeAt - clock().getTime());
        return outcome;
      }

      const startedAt = now;
      let error = null;
      const p = (async () => {
        try { await job.run(); } catch (err) { error = err; }
      })();
      inflight.add(p);
      try { await p; } finally { inflight.delete(p); }

      const finishedAt = clock();
      const nextRunAt = error
        ? new Date(finishedAt.getTime() + job.failureRetryMs)
        : job.nextRunAfter(startedAt);
      await CronState.updateOne(
        { _id: name, lockedBy: instanceId },
        {
          $set: {
            nextRunAt,
            lockedUntil: null,
            lockedBy: null,
            lastFinishedAt: finishedAt,
            lastDurationMs: finishedAt.getTime() - startedAt.getTime(),
            lastError: error ? String(error.message || error).slice(0, 500) : null,
            ...(error ? {} : { lastSuccessAt: finishedAt }),
          },
          $inc: error ? { runs: 1, failures: 1 } : { runs: 1 },
        }
      );
      if (error) {
        outcome = 'failed';
        logger.error(`Scheduled job "${name}" failed:`, error.message || String(error));
      } else {
        outcome = 'ran';
      }
      schedule(name, nextRunAt.getTime() - clock().getTime());
      return outcome;
    } catch (err) {
      // Mongo unavailable etc. — try again shortly; never crash the process.
      logger.warn(`Scheduler check for "${name}" failed:`, err.message);
      schedule(name, 60_000);
      return 'error';
    }
  }

  /** Start checking every job after `initialDelayMs` (+ up to `jitterMs`). */
  function start({ initialDelayMs = 20_000, jitterMs = 20_000 } = {}) {
    stopped = false;
    for (const name of jobs.keys()) {
      const delay = initialDelayMs + Math.floor(Math.random() * jitterMs);
      const t = setTimeout(() => { check(name); }, delay);
      t.unref?.();
      timers.set(name, t);
    }
    return api;
  }

  function stop() {
    stopped = true;
    for (const t of timers.values()) clearTimeout(t);
    timers.clear();
  }

  const api = {
    add,
    start,
    stop,
    check,
    names: () => [...jobs.keys()],
    inflight: () => [...inflight],
  };
  return api;
}
