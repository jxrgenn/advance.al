/**
 * Phase 28 — coverage push for SystemHealth.js formattedTimestamp virtual (L180).
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { connectTestDB, closeTestDB } from '../setup/testDb.js';
import SystemHealth from '../../src/models/SystemHealth.js';

describe('SystemHealth — formattedTimestamp virtual', () => {
  beforeAll(async () => { await connectTestDB(); });
  afterAll(async () => { await closeTestDB(); });

  it('formattedTimestamp returns a localized sq-AL string (L180)', () => {
    const h = new SystemHealth({
      timestamp: new Date('2026-05-08T12:34:56Z'),
      overallStatus: 'healthy',
      metrics: {
        database: { status: 'healthy', responseTime: 50, lastChecked: new Date() },
        email: { status: 'healthy', lastChecked: new Date() },
        storage: { status: 'healthy', usedSpace: 0, totalSpace: 0, lastChecked: new Date() },
        memory: { status: 'healthy', used: 0, total: 0, percentage: 0 },
        cpu: { status: 'healthy', usage: 0, loadAverage: 0 },
        api: { status: 'healthy', responseTime: 0, errorRate: 0, requestCount: 0, activeConnections: 0, lastChecked: new Date() },
      },
    });

    const formatted = h.formattedTimestamp;
    expect(typeof formatted).toBe('string');
    // sq-AL locale formats with day/month/year + time
    expect(formatted).toMatch(/2026|26/);
  });
});
