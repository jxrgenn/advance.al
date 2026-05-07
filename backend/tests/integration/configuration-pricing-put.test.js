/**
 * Phase 28 — coverage push for routes/configuration.js PUT /pricing.
 *
 * The biggest single gap in configuration.js is the pricing PUT route
 * (L196-223 — 16 stmts) which iterates 4 settings and conditionally updates.
 * Existing test only covers GET. This file covers the PUT update flow.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createAdmin, createJobseeker } from '../factories/user.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import SystemConfiguration from '../../src/models/SystemConfiguration.js';

async function seedPricingDefaults(adminId) {
  const defaults = [
    { key: 'pricing_standard_posting', name: 'Standard Posting', dataType: 'number', value: 10, description: 'd' },
    { key: 'pricing_promoted_posting', name: 'Promoted Posting', dataType: 'number', value: 25, description: 'd' },
    { key: 'pricing_candidate_viewing', name: 'Candidate Viewing', dataType: 'number', value: 5, description: 'd' },
    { key: 'payment_enabled', name: 'Payment Enabled', dataType: 'boolean', value: true, description: 'd' },
  ];
  for (const d of defaults) {
    await SystemConfiguration.create({
      ...d,
      category: 'payment',
      lastModifiedBy: adminId,
    });
  }
}

describe('configuration.js — PUT /pricing', () => {
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

  it('updates all 4 pricing settings when admin sends all fields', async () => {
    const { user: admin } = await createAdmin();
    await seedPricingDefaults(admin._id);

    const r = await request(app)
      .put('/api/configuration/pricing')
      .set(createAuthHeaders(admin))
      .send({
        standardPosting: 15,
        promotedPosting: 30,
        candidateViewing: 8,
        paymentEnabled: false,
      });

    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.data.updatedKeys.length).toBe(4);

    const standard = await SystemConfiguration.getSettingValue('pricing_standard_posting');
    expect(standard).toBe(15);
    const paymentEnabled = await SystemConfiguration.getSettingValue('payment_enabled');
    expect(paymentEnabled).toBe(false);
  });

  it('updates only fields that are provided (skips undefined)', async () => {
    const { user: admin } = await createAdmin();
    await seedPricingDefaults(admin._id);

    const r = await request(app)
      .put('/api/configuration/pricing')
      .set(createAuthHeaders(admin))
      .send({ standardPosting: 99 }); // only one field

    expect(r.status).toBe(200);
    expect(r.body.data.updatedKeys.length).toBe(1);
    expect(r.body.data.updatedKeys[0]).toBe('pricing_standard_posting');

    // Other settings unchanged
    const promoted = await SystemConfiguration.getSettingValue('pricing_promoted_posting');
    expect(promoted).toBe(25);
  });

  it('non-admin rejected with 403', async () => {
    const { user: js } = await createJobseeker();
    const r = await request(app)
      .put('/api/configuration/pricing')
      .set(createAuthHeaders(js))
      .send({ standardPosting: 99 });
    expect(r.status).toBe(403);
  });

  it('returns 0 updated when no settings exist', async () => {
    const { user: admin } = await createAdmin();
    // No defaults seeded — getSetting returns null, so no updates happen
    const r = await request(app)
      .put('/api/configuration/pricing')
      .set(createAuthHeaders(admin))
      .send({ standardPosting: 99 });

    expect(r.status).toBe(200);
    expect(r.body.data.updatedKeys.length).toBe(0);
  });
});
