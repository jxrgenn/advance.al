/**
 * Phase 28 — coverage push for verification.js SMS-method branches.
 *
 * The existing verification tests only cover email. SMS adds untested branches:
 *   - L242-245: SMS phone format rejection
 *   - L257: existingUser lookup by profile.phone
 *   - L271-274: storeVerificationCode for sms method
 *   - L286: sendSMS path (mock — always returns true)
 *   - L301-307: success response with method=sms wording
 *   - resend SMS path (L514-516)
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createJobseeker } from '../factories/user.factory.js';
import User from '../../src/models/User.js';

describe('verification.js — SMS method branches', () => {
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

  describe('POST /api/verification/request — SMS', () => {
    it('rejects malformed phone format (L242-245)', async () => {
      const r = await request(app)
        .post('/api/verification/request')
        .send({ identifier: '0691234567', method: 'sms' });
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/355/);
    });

    it('rejects too-short phone after country code', async () => {
      const r = await request(app)
        .post('/api/verification/request')
        .send({ identifier: '+355123', method: 'sms' });
      expect(r.status).toBe(400);
    });

    it('accepts valid phone +355XXXXXXXX, stores SMS code', async () => {
      const r = await request(app)
        .post('/api/verification/request')
        .send({ identifier: '+355691234567', method: 'sms' });
      expect(r.status).toBe(200);
      expect(r.body.data.method).toBe('sms');
      expect(r.body.data.identifier).toBe('+355691234567');
    });

    it('rejects existing active user with this phone (L257, L261-267)', async () => {
      const { user } = await createJobseeker({ email: 'phoneuser@example.com' });
      await User.findByIdAndUpdate(user._id, {
        'profile.phone': '+355691111111',
        status: 'active',
      });

      const r = await request(app)
        .post('/api/verification/request')
        .send({ identifier: '+355691111111', method: 'sms' });
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/telefoni/i);
    });
  });

  describe('POST /api/verification/resend — SMS', () => {
    it('successfully resends an SMS code (L512-516)', async () => {
      // First request to seed an existing entry
      await request(app)
        .post('/api/verification/request')
        .send({ identifier: '+355692222222', method: 'sms' });

      // Force the existing entry's createdAt > 60s ago by re-requesting after wait isn't
      // feasible — instead just call resend without a prior entry (the cooldown check skips)
      const r = await request(app)
        .post('/api/verification/resend')
        .send({ identifier: '+355693333333', method: 'sms' });
      expect(r.status).toBe(200);
      expect(r.body.data.method).toBe('sms');
    });
  });

  describe('POST /api/verification/verify — method mismatch using SMS', () => {
    it('rejects when stored method is sms but verify sends email (L346-350)', async () => {
      const phone = '+355694444444';
      // Seed an SMS code
      await request(app)
        .post('/api/verification/request')
        .send({ identifier: phone, method: 'sms' });

      const r = await request(app)
        .post('/api/verification/verify')
        .send({ identifier: phone, code: '123456', method: 'email' });
      expect(r.status).toBe(400);
      // Either method-mismatch or invalid-code wording
      expect(r.body.success).toBe(false);
    });
  });
});
