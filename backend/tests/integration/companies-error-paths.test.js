/**
 * Phase 28 — coverage push for routes/companies.js error/404 paths.
 *
 * Targets:
 *   - L167-168 GET / catch (User.find throws)
 *   - L249 GET /:id ?? specific line in jobs map
 *   - L269-270 GET /:id catch (User.findOne throws)
 *   - L359-360 GET /:id/jobs catch
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, jest } from '@jest/globals';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createVerifiedEmployer } from '../factories/user.factory.js';
import User from '../../src/models/User.js';

describe('companies.js — error paths', () => {
  beforeAll(async () => { await connectTestDB(); await seedLocations(); });
  afterEach(async () => {
    jest.restoreAllMocks();
    await clearTestDB();
    await seedLocations();
  });
  afterAll(async () => { await closeTestDB(); });

  it('GET / returns 500 when User.aggregate throws (L167-168)', async () => {
    jest.spyOn(User, 'aggregate').mockRejectedValueOnce(new Error('aggregate fail'));
    const r = await request(app).get('/api/companies');
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/marrjen e kompanive/);
  });

  it('GET /:id returns 404 when company not found', async () => {
    const id = new mongoose.Types.ObjectId().toString();
    const r = await request(app).get(`/api/companies/${id}`);
    expect(r.status).toBe(404);
    expect(r.body.message).toMatch(/Kompania nuk u gjet/);
  });

  it('GET /:id returns 500 when User.findOne throws (L269-270)', async () => {
    const realFindOne = User.findOne.bind(User);
    jest.spyOn(User, 'findOne').mockImplementationOnce(function (...args) {
      // Only throw for company query (which has userType='employer')
      if (args[0]?.userType === 'employer') throw new Error('company findOne fail');
      return realFindOne(...args);
    });
    const id = new mongoose.Types.ObjectId().toString();
    const r = await request(app).get(`/api/companies/${id}`);
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/profilit të kompanisë/);
  });

  it('GET /:id/jobs returns 404 when company not found', async () => {
    const id = new mongoose.Types.ObjectId().toString();
    const r = await request(app).get(`/api/companies/${id}/jobs`);
    expect(r.status).toBe(404);
  });

  it('GET /:id/jobs returns 500 when User.findOne throws (L359-360)', async () => {
    const realFindOne = User.findOne.bind(User);
    jest.spyOn(User, 'findOne').mockImplementationOnce(function (...args) {
      if (args[0]?.userType === 'employer') throw new Error('company-jobs findOne fail');
      return realFindOne(...args);
    });
    const id = new mongoose.Types.ObjectId().toString();
    const r = await request(app).get(`/api/companies/${id}/jobs`);
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/punëve të kompanisë/);
  });

  it('GET /:id returns the company with stats and jobs (happy path)', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const r = await request(app).get(`/api/companies/${emp._id}`);
    expect(r.status).toBe(200);
    expect(r.body.data.company).toBeDefined();
    expect(r.body.data.company.stats).toBeDefined();
    expect(r.body.data.company.stats.totalJobs).toBe(0);
  });
});
