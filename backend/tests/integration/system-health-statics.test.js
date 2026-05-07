/**
 * Phase 28 — coverage push for SystemHealth model statics + methods.
 *
 * Targets:
 *   - virtuals: storageUsagePercentage, formattedStorage, activeAlertsCount
 *   - methods: calculateOverallStatus (3 status branches), addAlert
 *     (with 50-cap pruning), resolveAlert (success + missing-id reject)
 *   - statics: getHealthHistory (default 24h), getHealthStats (aggregation),
 *     cleanupOldRecords
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import SystemHealth from '../../src/models/SystemHealth.js';

function mkHealth(overrides = {}) {
  return new SystemHealth({
    overallStatus: overrides.overallStatus || 'healthy',
    metrics: {
      database: { status: 'healthy', connectionCount: 1, responseTime: 50, lastChecked: new Date() },
      email: { status: 'healthy', lastChecked: new Date() },
      storage: {
        status: 'healthy',
        usedSpace: overrides.usedSpace ?? 50 * 1024 * 1024 * 1024, // 50 GB
        totalSpace: overrides.totalSpace ?? 100 * 1024 * 1024 * 1024, // 100 GB
        lastChecked: new Date(),
      },
      memory: { status: 'healthy', used: 1000, total: 2000, percentage: 50, lastChecked: new Date() },
      cpu: { status: 'healthy', usage: 30, lastChecked: new Date() },
      ...overrides.metrics,
    },
    alerts: overrides.alerts ?? [],
    timestamp: overrides.timestamp || new Date(),
  });
}

describe('SystemHealth — virtuals + methods', () => {
  beforeAll(async () => { await connectTestDB(); });
  afterEach(async () => { await clearTestDB(); });
  afterAll(async () => { await closeTestDB(); });

  describe('virtuals', () => {
    it('storageUsagePercentage returns 0 when totalSpace=0', () => {
      const h = mkHealth({ usedSpace: 0, totalSpace: 0 });
      expect(h.storageUsagePercentage).toBe(0);
    });

    it('storageUsagePercentage returns rounded ratio', () => {
      const h = mkHealth({ usedSpace: 25, totalSpace: 100 });
      expect(h.storageUsagePercentage).toBe(25);
    });

    it('formattedStorage returns human-readable sizes', () => {
      const h = mkHealth({ usedSpace: 1024 * 1024, totalSpace: 1024 * 1024 * 1024 });
      const fs = h.formattedStorage;
      expect(fs.used).toMatch(/MB/);
      expect(fs.total).toMatch(/GB/);
      expect(fs.percentage).toBeDefined();
    });

    it('formattedStorage handles 0 bytes', () => {
      const h = mkHealth({ usedSpace: 0, totalSpace: 0 });
      expect(h.formattedStorage.used).toBe('0 Bytes');
    });

    it('activeAlertsCount counts only unresolved alerts', () => {
      const h = mkHealth({
        alerts: [
          { type: 'a', level: 'warning', message: 'm1', resolved: false },
          { type: 'b', level: 'error', message: 'm2', resolved: true },
          { type: 'c', level: 'warning', message: 'm3', resolved: false },
        ],
      });
      expect(h.activeAlertsCount).toBe(2);
    });

    it('activeAlertsCount returns 0 for empty alerts array', () => {
      const h = mkHealth();
      expect(h.activeAlertsCount).toBe(0);
    });
  });

  describe('calculateOverallStatus', () => {
    it('returns "error" when any subsystem is in error', () => {
      const h = mkHealth({
        metrics: {
          database: { status: 'error', lastChecked: new Date() },
          email: { status: 'healthy', lastChecked: new Date() },
          storage: { status: 'healthy', usedSpace: 0, totalSpace: 100, lastChecked: new Date() },
          memory: { status: 'warning', used: 1000, total: 2000, percentage: 50, lastChecked: new Date() },
          cpu: { status: 'healthy', usage: 30, lastChecked: new Date() },
        },
      });
      expect(h.calculateOverallStatus()).toBe('error');
    });

    it('returns "warning" when no error but at least one warning', () => {
      const h = mkHealth({
        metrics: {
          database: { status: 'healthy', lastChecked: new Date() },
          email: { status: 'healthy', lastChecked: new Date() },
          storage: { status: 'warning', usedSpace: 0, totalSpace: 100, lastChecked: new Date() },
          memory: { status: 'healthy', used: 1000, total: 2000, percentage: 50, lastChecked: new Date() },
          cpu: { status: 'healthy', usage: 30, lastChecked: new Date() },
        },
      });
      expect(h.calculateOverallStatus()).toBe('warning');
    });

    it('returns "healthy" when all subsystems healthy', () => {
      const h = mkHealth();
      expect(h.calculateOverallStatus()).toBe('healthy');
    });
  });

  describe('addAlert + resolveAlert', () => {
    it('addAlert appends a new unresolved alert and saves', async () => {
      const h = await mkHealth().save();
      await h.addAlert('database', 'warning', 'Slow query');
      const refreshed = await SystemHealth.findById(h._id);
      expect(refreshed.alerts.length).toBe(1);
      expect(refreshed.alerts[0].message).toBe('Slow query');
      expect(refreshed.alerts[0].resolved).toBe(false);
    });

    it('addAlert prunes to last 50 when exceeded', async () => {
      const alerts = Array.from({ length: 50 }, (_, i) => ({
        type: 'database', level: 'warning', message: `m${i}`, resolved: false,
      }));
      const h = await mkHealth({ alerts }).save();
      await h.addAlert('memory', 'error', 'New alert');

      const refreshed = await SystemHealth.findById(h._id);
      expect(refreshed.alerts.length).toBe(50);
      expect(refreshed.alerts[refreshed.alerts.length - 1].message).toBe('New alert');
    });

    it('resolveAlert marks an existing alert resolved', async () => {
      const h = await mkHealth().save();
      await h.addAlert('database', 'warning', 'Slow');
      const refreshed = await SystemHealth.findById(h._id);
      const alertId = refreshed.alerts[0]._id;

      await refreshed.resolveAlert(alertId);
      const after = await SystemHealth.findById(h._id);
      expect(after.alerts[0].resolved).toBe(true);
    });

    it('resolveAlert rejects when alert id does not exist', async () => {
      const h = await mkHealth().save();
      await expect(h.resolveAlert('507f1f77bcf86cd799439099'))
        .rejects.toThrow(/Alert not found/i);
    });
  });

  describe('statics', () => {
    it('getHealthHistory returns recent records, sorted desc', async () => {
      await mkHealth({ timestamp: new Date(Date.now() - 1000) }).save();
      await mkHealth({ timestamp: new Date() }).save();
      // One outside the window
      await mkHealth({ timestamp: new Date(Date.now() - 25 * 60 * 60 * 1000) }).save();

      const r = await SystemHealth.getHealthHistory(24);
      expect(r.length).toBe(2);
      expect(r[0].timestamp.getTime()).toBeGreaterThanOrEqual(r[1].timestamp.getTime());
    });

    it('getHealthStats aggregates by overallStatus', async () => {
      await mkHealth({ overallStatus: 'healthy' }).save();
      await mkHealth({ overallStatus: 'healthy' }).save();
      await mkHealth({ overallStatus: 'warning' }).save();

      const r = await SystemHealth.getHealthStats(7);
      const map = Object.fromEntries(r.map(x => [x._id, x.count]));
      expect(map.healthy).toBe(2);
      expect(map.warning).toBe(1);
    });

    it('cleanupOldRecords deletes records older than threshold', async () => {
      await mkHealth({ timestamp: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) }).save();
      await mkHealth({ timestamp: new Date() }).save();

      const r = await SystemHealth.cleanupOldRecords(30);
      expect(r.deletedCount).toBe(1);

      const remaining = await SystemHealth.countDocuments();
      expect(remaining).toBe(1);
    });
  });
});
