/**
 * #63 — restart-safe scheduler (src/services/scheduler.js + CronState).
 *
 * Before: daily jobs were `setInterval(fn, 24h)` with no run at boot, so on a
 * service restarted more often than daily (Render deploys / restarts) the
 * payment-timeout alerts and the Discord digest never ran. Now the next run
 * time is persisted: a due job runs right after boot, a job that just ran is
 * not repeated by a restart, a run is exclusive across processes, a crashed
 * run is retried after its lock expires, and failures retry early.
 *
 * Each "restart" below is a brand-new scheduler instance over the same DB —
 * exactly what a process restart is to this code. A fake clock drives time.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import CronState from '../../src/models/CronState.js';
import { createScheduler, dailyAtUtcHour } from '../../src/services/scheduler.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function clockAt(iso) {
  let now = new Date(iso).getTime();
  return { now: () => new Date(now), advance: (ms) => { now += ms; } };
}

function bootScheduler(clock, instanceId, runs, { fail = false, intervalMs = DAY, name = 'payment-timeouts', ...extra } = {}) {
  return createScheduler({ now: clock.now, instanceId }).add({
    name,
    intervalMs,
    run: async () => {
      runs.push({ by: instanceId, at: clock.now().toISOString() });
      if (fail) throw new Error('worker exploded');
    },
    ...extra,
  });
}

describe('#63 persistent scheduler', () => {
  beforeAll(connectTestDB);
  afterEach(clearTestDB);
  afterAll(closeTestDB);

  it('first boot runs a never-run daily job immediately, and persists the next run 24h later', async () => {
    const clock = clockAt('2026-10-10T10:00:00Z');
    const runs = [];
    const s = bootScheduler(clock, 'p1', runs);
    expect(await s.check('payment-timeouts')).toBe('ran');
    expect(runs).toEqual([{ by: 'p1', at: '2026-10-10T10:00:00.000Z' }]);
    const state = await CronState.findById('payment-timeouts').lean();
    expect(state.nextRunAt.toISOString()).toBe('2026-10-11T10:00:00.000Z');
    expect(state.lockedUntil).toBeNull();
    expect(state.lastError).toBeNull();
    expect(state.runs).toBe(1);
  });

  it('restarts every few hours: the daily job runs exactly once per day (was: never)', async () => {
    const clock = clockAt('2026-10-10T10:00:00Z');
    const runs = [];
    // 4 days, a "deploy" (new process) every 5 hours
    for (let t = 0; t < 4 * DAY; t += 5 * HOUR) {
      const s = bootScheduler(clock, `boot-${t}`, runs);
      await s.check('payment-timeouts');
      clock.advance(5 * HOUR);
    }
    // Checks happen only at boots here (every 5 h), so each run lands on the
    // first boot at/after its 24 h mark — once per day, never zero, never twice.
    // (A live process also polls every <= 5 min, so the real drift is minutes.)
    expect(runs.map(r => r.at)).toEqual([
      '2026-10-10T10:00:00.000Z',
      '2026-10-11T11:00:00.000Z',
      '2026-10-12T12:00:00.000Z',
      '2026-10-13T13:00:00.000Z',
    ]);
  });

  it('a restart right after a run does not repeat it', async () => {
    const clock = clockAt('2026-10-10T10:00:00Z');
    const runs = [];
    await bootScheduler(clock, 'p1', runs).check('payment-timeouts');
    clock.advance(60 * 1000);
    expect(await bootScheduler(clock, 'p2', runs).check('payment-timeouts')).toBe('not-due');
    expect(runs).toHaveLength(1);
  });

  it('two processes at once (deploy overlap): only one runs the job', async () => {
    const clock = clockAt('2026-10-10T10:00:00Z');
    const runs = [];
    const a = bootScheduler(clock, 'old', runs);
    const b = bootScheduler(clock, 'new', runs);
    const outcomes = await Promise.all([a.check('payment-timeouts'), b.check('payment-timeouts')]);
    expect(outcomes.filter(o => o === 'ran')).toHaveLength(1);
    expect(runs).toHaveLength(1);
  });

  it('a process that dies mid-run leaves a lock; once it expires the run is retried (no skipped day)', async () => {
    const clock = clockAt('2026-10-10T10:00:00Z');
    // Simulate the crash: state claimed by a dead process, never released.
    await CronState.create({
      _id: 'payment-timeouts',
      nextRunAt: new Date('2026-10-10T09:00:00Z'),
      lockedUntil: new Date('2026-10-10T10:20:00Z'),
      lockedBy: 'dead-process',
    });
    const runs = [];
    expect(await bootScheduler(clock, 'p2', runs).check('payment-timeouts')).toBe('locked');
    clock.advance(25 * 60 * 1000);
    expect(await bootScheduler(clock, 'p3', runs).check('payment-timeouts')).toBe('ran');
    expect(runs).toEqual([{ by: 'p3', at: '2026-10-10T10:25:00.000Z' }]);
  });

  it('a failed run is recorded and retried after failureRetryMs (30 min), not a day later', async () => {
    const clock = clockAt('2026-10-10T10:00:00Z');
    const runs = [];
    expect(await bootScheduler(clock, 'p1', runs, { fail: true }).check('payment-timeouts')).toBe('failed');
    const state = await CronState.findById('payment-timeouts').lean();
    expect(state.lastError).toBe('worker exploded');
    expect(state.failures).toBe(1);
    expect(state.nextRunAt.toISOString()).toBe('2026-10-10T10:30:00.000Z');
    clock.advance(30 * 60 * 1000);
    expect(await bootScheduler(clock, 'p1', runs).check('payment-timeouts')).toBe('ran');
    expect(runs).toHaveLength(2);
    expect((await CronState.findById('payment-timeouts').lean()).lastError).toBeNull();
  });

  it('boundary schedule: the Discord digest waits for 07:00 UTC, then runs daily at 07:00 — a missed day runs at the next boot', async () => {
    const clock = clockAt('2026-10-10T03:00:00Z');
    const runs = [];
    const at7 = dailyAtUtcHour(7);
    const boot = (id) => bootScheduler(clock, id, runs, { name: 'discord-digest', nextRunAfter: at7, firstRunAt: at7 });
    expect(await boot('p1').check('discord-digest')).toBe('not-due');
    expect((await CronState.findById('discord-digest').lean()).nextRunAt.toISOString()).toBe('2026-10-10T07:00:00.000Z');
    clock.advance(4 * HOUR + 5 * 60 * 1000); // 07:05
    expect(await boot('p2').check('discord-digest')).toBe('ran');
    expect((await CronState.findById('discord-digest').lean()).nextRunAt.toISOString()).toBe('2026-10-11T07:00:00.000Z');
    clock.advance(2 * DAY); // service down through 11th 07:00; boots on the 12th 07:05
    expect(await boot('p3').check('discord-digest')).toBe('ran');
    expect((await CronState.findById('discord-digest').lean()).nextRunAt.toISOString()).toBe('2026-10-13T07:00:00.000Z');
    expect(runs.map(r => r.at)).toEqual(['2026-10-10T07:05:00.000Z', '2026-10-12T07:05:00.000Z']);
  });
});
