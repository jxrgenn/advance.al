/**
 * Phase 28 — coverage push for business-control.js GET /pricing-rules
 * ?active filter branches (L356). Existing tests covered ?active=true only.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createAdmin } from '../factories/user.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import PricingRule from '../../src/models/PricingRule.js';

describe('business-control.js — GET /pricing-rules ?active filter', () => {
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

  async function seedRule({ admin, isActive, category = 'industry' }) {
    return PricingRule.create({
      name: `r-${Date.now()}-${Math.random()}`,
      category,
      rules: { basePrice: 28, multiplier: 1.0 },
      priority: 1,
      isActive,
      createdBy: admin._id,
    });
  }

  it('?active=false returns only inactive rules', async () => {
    const { user: admin } = await createAdmin();
    await seedRule({ admin, isActive: true });
    await seedRule({ admin, isActive: false });

    const r = await request(app)
      .get('/api/business-control/pricing-rules?active=false')
      .set(createAuthHeaders(admin));
    expect(r.status).toBe(200);
    expect(r.body.data.rules.every(rule => rule.isActive === false)).toBe(true);
  });

  it('?category= filter narrows results (L355)', async () => {
    const { user: admin } = await createAdmin();
    await seedRule({ admin, isActive: true, category: 'industry' });
    await seedRule({ admin, isActive: true, category: 'location' });

    const r = await request(app)
      .get('/api/business-control/pricing-rules?category=location')
      .set(createAuthHeaders(admin));
    expect(r.status).toBe(200);
    expect(r.body.data.rules.every(rule => rule.category === 'location')).toBe(true);
  });
});
