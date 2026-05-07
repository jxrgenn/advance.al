/**
 * Phase 28 — coverage push for SystemHealth.createHealthCheck (L270-349)
 * + getLatestHealth (L352-354). The big createHealthCheck static is the
 * meat — touches mongoose ping, process.memoryUsage, os.loadavg, then
 * persists. Existing system-health-statics.test.js covers every other
 * method but not these two.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import SystemHealth from '../../src/models/SystemHealth.js';

describe('SystemHealth — createHealthCheck + getLatestHealth', () => {
  beforeAll(async () => { await connectTestDB(); });
  afterEach(async () => { await clearTestDB(); });
  afterAll(async () => { await closeTestDB(); });

  describe('createHealthCheck', () => {
    it('creates and persists a record with all metric blocks populated', async () => {
      const h = await SystemHealth.createHealthCheck();
      expect(h._id).toBeDefined();

      // Database block populated from real ping
      expect(['healthy', 'warning', 'error']).toContain(h.metrics.database.status);
      expect(typeof h.metrics.database.responseTime).toBe('number');
      expect(h.metrics.database.lastChecked).toBeInstanceOf(Date);

      // Memory block populated from process.memoryUsage()
      expect(typeof h.metrics.memory.used).toBe('number');
      expect(typeof h.metrics.memory.total).toBe('number');
      expect(typeof h.metrics.memory.percentage).toBe('number');
      expect(['healthy', 'warning', 'error']).toContain(h.metrics.memory.status);

      // CPU block from os.loadavg()
      expect(typeof h.metrics.cpu.usage).toBe('number');
      expect(typeof h.metrics.cpu.loadAverage).toBe('number');

      // Email + storage + api defaults
      expect(h.metrics.email.status).toBe('healthy');
      expect(h.metrics.storage.status).toBe('healthy');
      expect(h.metrics.api.responseTime).toBe(0);

      // Overall calculated
      expect(['healthy', 'warning', 'error']).toContain(h.overallStatus);
    });

    it('persists to DB so getLatestHealth returns it', async () => {
      const created = await SystemHealth.createHealthCheck();
      const latest = await SystemHealth.getLatestHealth();
      expect(latest._id.toString()).toBe(created._id.toString());
    });
  });

  describe('getLatestHealth', () => {
    it('returns null when no records', async () => {
      const r = await SystemHealth.getLatestHealth();
      expect(r).toBeNull();
    });

    it('returns most recent by timestamp desc', async () => {
      // Older first
      const old = new SystemHealth({
        overallStatus: 'healthy',
        timestamp: new Date(Date.now() - 60 * 60 * 1000),
        metrics: {
          database: { status: 'healthy', connectionCount: 1, responseTime: 50, lastChecked: new Date() },
          email: { status: 'healthy', lastChecked: new Date() },
          storage: { status: 'healthy', usedSpace: 0, totalSpace: 100, lastChecked: new Date() },
          memory: { status: 'healthy', used: 1000, total: 2000, percentage: 50, lastChecked: new Date() },
          cpu: { status: 'healthy', usage: 30, lastChecked: new Date() },
        },
      });
      await old.save();

      const newer = new SystemHealth({
        overallStatus: 'warning',
        timestamp: new Date(),
        metrics: {
          database: { status: 'healthy', connectionCount: 1, responseTime: 50, lastChecked: new Date() },
          email: { status: 'healthy', lastChecked: new Date() },
          storage: { status: 'healthy', usedSpace: 0, totalSpace: 100, lastChecked: new Date() },
          memory: { status: 'warning', used: 1500, total: 2000, percentage: 75, lastChecked: new Date() },
          cpu: { status: 'healthy', usage: 30, lastChecked: new Date() },
        },
      });
      await newer.save();

      const latest = await SystemHealth.getLatestHealth();
      expect(latest._id.toString()).toBe(newer._id.toString());
      expect(latest.overallStatus).toBe('warning');
    });
  });
});
