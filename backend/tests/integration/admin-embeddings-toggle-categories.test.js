/**
 * Phase 28 — coverage push for admin/embeddings.js POST /toggle-debug
 * with all valid categories + enabled toggle states.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createAdmin } from '../factories/user.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';

describe('admin/embeddings.js — POST /toggle-debug all categories', () => {
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

  for (const cat of ['EMBEDDING', 'WORKER', 'QUEUE']) {
    it(`enables debug for category=${cat}`, async () => {
      const { user: admin } = await createAdmin();
      const r = await request(app)
        .post('/api/admin/embeddings/toggle-debug')
        .set(createAuthHeaders(admin))
        .send({ category: cat, enabled: true });
      expect(r.status).toBe(200);
      expect(r.body.message).toMatch(new RegExp(`enabled.*${cat}`, 'i'));
    });

    it(`disables debug for category=${cat}`, async () => {
      const { user: admin } = await createAdmin();
      const r = await request(app)
        .post('/api/admin/embeddings/toggle-debug')
        .set(createAuthHeaders(admin))
        .send({ category: cat, enabled: false });
      expect(r.status).toBe(200);
      expect(r.body.message).toMatch(new RegExp(`disabled.*${cat}`, 'i'));
    });
  }
});
