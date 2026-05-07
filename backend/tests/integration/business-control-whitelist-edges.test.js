/**
 * Phase 28 — coverage push for business-control.js whitelist edge cases.
 *
 * - DELETE /whitelist/:id when employer not whitelisted → 400 (L854-859)
 * - DELETE /whitelist/:id non-existent → 404
 * - GET /whitelist with seeded whitelisted employers (loop body L758-760)
 * - GET /employers/search with empty q (matches everything via empty regex)
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createAdmin, createVerifiedEmployer } from '../factories/user.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import User from '../../src/models/User.js';

describe('business-control.js — whitelist edges', () => {
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

  it('DELETE /whitelist/:id rejects when employer not whitelisted (L854-859)', async () => {
    const { user: admin } = await createAdmin();
    const { user: emp } = await createVerifiedEmployer();
    // emp is NOT whitelisted (default)
    const r = await request(app)
      .delete(`/api/business-control/whitelist/${emp._id}`)
      .set(createAuthHeaders(admin));
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/privilegjuar/i);
  });

  it('DELETE /whitelist/:id returns 404 for non-existent employer', async () => {
    const { user: admin } = await createAdmin();
    const r = await request(app)
      .delete('/api/business-control/whitelist/507f1f77bcf86cd799439099')
      .set(createAuthHeaders(admin));
    expect(r.status).toBe(404);
  });

  it('GET /whitelist returns seeded whitelisted employers (loop L758-760)', async () => {
    const { user: admin } = await createAdmin();
    const { user: emp1 } = await createVerifiedEmployer({ email: 'wl1@example.com' });
    const { user: emp2 } = await createVerifiedEmployer({ email: 'wl2@example.com' });
    await User.updateOne({ _id: emp1._id }, {
      freePostingEnabled: true, freePostingReason: 'Strategic',
      freePostingGrantedBy: admin._id, freePostingGrantedAt: new Date(),
    });
    await User.updateOne({ _id: emp2._id }, {
      freePostingEnabled: true, freePostingReason: 'Partner',
      freePostingGrantedBy: admin._id, freePostingGrantedAt: new Date(),
    });

    const r = await request(app)
      .get('/api/business-control/whitelist')
      .set(createAuthHeaders(admin));
    expect(r.status).toBe(200);
    expect(r.body.data.count).toBe(2);
    expect(r.body.data.employers.length).toBe(2);
  });

  it('GET /employers/search with empty q returns all employers', async () => {
    const { user: admin } = await createAdmin();
    await createVerifiedEmployer({ email: 'srch1@example.com' });
    await createVerifiedEmployer({ email: 'srch2@example.com' });

    const r = await request(app)
      .get('/api/business-control/employers/search')
      .set(createAuthHeaders(admin));
    expect(r.status).toBe(200);
    expect(r.body.data.count).toBeGreaterThanOrEqual(2);
  });

  it('GET /employers/search with metacharacters in q (regex escape)', async () => {
    const { user: admin } = await createAdmin();
    const r = await request(app)
      .get('/api/business-control/employers/search?q=.*+?')
      .set(createAuthHeaders(admin));
    expect(r.status).toBe(200);
  });
});
