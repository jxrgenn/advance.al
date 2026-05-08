/**
 * Phase 28 — coverage push for routes/admin.js GET /system-health
 * databaseStatus branches not exercised by happy-path test:
 *   - L334-336 databaseStatus = 'slow' when dbResponseTime > 1000ms
 *   - L337-340 databaseStatus = 'disconnected' when User.findOne throws
 *   - L373-374 errorRate24h elevated when status='disconnected' or 'slow'
 *   - L379 uptime degraded when database not connected
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, jest } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createAdmin } from '../factories/user.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import User from '../../src/models/User.js';

describe('admin.js — GET /system-health database status branches', () => {
  beforeAll(async () => {
    await connectTestDB();
    await seedLocations();
  });

  afterEach(async () => {
    await clearTestDB();
    await seedLocations();
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await closeTestDB();
  });

  it('reports databaseStatus="slow" when User.findOne takes >1000ms (L334-336)', async () => {
    const { user: admin } = await createAdmin();

    // Mock User.findOne to introduce a >1s delay
    const realFindOne = User.findOne.bind(User);
    const slowSpy = jest.spyOn(User, 'findOne').mockImplementation((...args) => {
      const query = realFindOne(...args);
      // Wrap .limit() so the query takes >1s
      const origLimit = query.limit.bind(query);
      query.limit = (n) => {
        const q = origLimit(n);
        const origExec = q.exec ? q.exec.bind(q) : null;
        // Patch then() so awaiting the query introduces delay
        const origThen = q.then.bind(q);
        q.then = function (resolve, reject) {
          return new Promise((res) => setTimeout(res, 1100)).then(() => origThen(resolve, reject));
        };
        return q;
      };
      return query;
    });

    const r = await request(app)
      .get('/api/admin/system-health')
      .set(createAuthHeaders(admin));

    expect(r.status).toBe(200);
    expect(r.body.data.databaseStatus).toBe('slow');
    expect(r.body.data.databaseResponseTime).toBeGreaterThan(1000);
    slowSpy.mockRestore();
  }, 15000);

  it('reports databaseStatus="disconnected" when User.findOne().limit() rejects (L337-340)', async () => {
    const { user: admin } = await createAdmin();

    // Mongoose's findById is implemented as findOne({_id: ...}), so spying on
    // findOne globally also affects auth middleware's findById call. To avoid
    // breaking auth, intercept ONLY the no-arg call from the system-health
    // probe and pass through everything else to the real implementation.
    const realFindOne = User.findOne.bind(User);
    const spy = jest.spyOn(User, 'findOne').mockImplementation(function (...args) {
      const isProbeCall = args.length === 0 || (args[0] && Object.keys(args[0]).length === 0);
      if (isProbeCall) {
        return { limit: () => Promise.reject(new Error('mongo connection lost')) };
      }
      return realFindOne(...args);
    });

    const r = await request(app)
      .get('/api/admin/system-health')
      .set(createAuthHeaders(admin));

    expect(r.status).toBe(200);
    expect(r.body.data.databaseStatus).toBe('disconnected');
    expect(r.body.data.serverStatus).toBe('warning');
    // Error rates should be elevated for disconnected
    expect(r.body.data.errorRates.last24h).toBe(5.0);
    spy.mockRestore();
  });
});
