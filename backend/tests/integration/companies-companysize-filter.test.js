/**
 * Phase 28 — coverage push for companies.js GET / companySize filter (L53-58).
 *
 * No prior test exercised ?companySize= with valid + invalid values. Adds
 * direct coverage for both branches.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createVerifiedEmployer } from '../factories/user.factory.js';
import User from '../../src/models/User.js';

describe('companies.js — GET /?companySize= filter', () => {
  beforeAll(async () => {
    await connectTestDB();
    await seedLocations();
  });

  afterEach(async () => {
    await clearTestDB();
    await seedLocations();
  });

  afterAll(async () => {
    await closeTestDB();
  });

  it('?companySize=1-10 filters to small employers (L53-58)', async () => {
    const { user: small } = await createVerifiedEmployer({ companyName: 'TinyCo' });
    const { user: big } = await createVerifiedEmployer({ companyName: 'BigCo' });

    await User.findByIdAndUpdate(small._id, {
      'profile.employerProfile.companySize': '1-10',
    });
    await User.findByIdAndUpdate(big._id, {
      'profile.employerProfile.companySize': '200+',
    });

    const r = await request(app).get('/api/companies?companySize=1-10');
    expect(r.status).toBe(200);
    const names = r.body.data.companies.map(c => c.name);
    expect(names).toContain('TinyCo');
    expect(names).not.toContain('BigCo');
  });

  it('?companySize=200+ filters to large employers', async () => {
    const { user: emp } = await createVerifiedEmployer({ companyName: 'LargeCo' });
    await User.findByIdAndUpdate(emp._id, {
      'profile.employerProfile.companySize': '200+',
    });

    const r = await request(app).get('/api/companies?companySize=200%2B');
    expect(r.status).toBe(200);
    const names = r.body.data.companies.map(c => c.name);
    expect(names).toContain('LargeCo');
  });

  it('?companySize=INVALID is silently dropped (L55 whitelist)', async () => {
    await createVerifiedEmployer();
    // Invalid size value should not appear in matchQuery → returns all
    const r = await request(app).get('/api/companies?companySize=99999');
    expect(r.status).toBe(200);
    expect(r.body.data.companies.length).toBeGreaterThanOrEqual(1);
  });

  it('?companySize=11-50 (middle bucket) filters correctly', async () => {
    const { user: emp } = await createVerifiedEmployer({ companyName: 'MidCo' });
    await User.findByIdAndUpdate(emp._id, {
      'profile.employerProfile.companySize': '11-50',
    });

    const r = await request(app).get('/api/companies?companySize=11-50');
    expect(r.status).toBe(200);
    const names = r.body.data.companies.map(c => c.name);
    expect(names).toContain('MidCo');
  });
});
