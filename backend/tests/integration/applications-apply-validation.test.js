/**
 * Phase 28 — coverage push for routes/applications.js validation branches.
 *
 *   - L46-54  handleValidationErrors 400 branch (POST /apply)
 *   - L74-78  coverLetter customSanitizer + maxLength
 *
 * The /apply route uses express-validator with applyValidation. None of the
 * other applications-*.test.js suites exercise the failure branch where
 * !errors.isEmpty() — they all send valid jobIds. This test sends a payload
 * that fails every validator so we hit each path's withMessage() AND the
 * 400 response shape produced by handleValidationErrors.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createJobseeker } from '../factories/user.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';

describe('applications.js — POST /apply validation 400 (L46-54)', () => {
  beforeAll(async () => { await connectTestDB(); await seedLocations(); });
  afterEach(async () => { await clearTestDB(); await seedLocations(); });
  afterAll(async () => { await closeTestDB(); });

  it('returns 400 with field-level error when jobId is not a Mongo ID', async () => {
    const { user: js } = await createJobseeker({ emailVerified: true });
    const r = await request(app)
      .post('/api/applications/apply')
      .set(createAuthHeaders(js))
      .send({ jobId: 'not-a-mongo-id', applicationMethod: 'one_click' });

    expect(r.status).toBe(400);
    expect(r.body.success).toBe(false);
    expect(r.body.message).toMatch(/Gabime në validim/);
    expect(Array.isArray(r.body.errors)).toBe(true);
    expect(r.body.errors.some(e => e.field === 'jobId')).toBe(true);
    expect(r.body.errors.some(e => /pavlefshme/.test(e.message))).toBe(true);
  });

  it('returns 400 when applicationMethod is not one_click/custom_form', async () => {
    const { user: js } = await createJobseeker({ emailVerified: true });
    const r = await request(app)
      .post('/api/applications/apply')
      .set(createAuthHeaders(js))
      .send({ jobId: '507f1f77bcf86cd799439011', applicationMethod: 'invalid_method' });

    expect(r.status).toBe(400);
    expect(r.body.errors.some(e => e.field === 'applicationMethod')).toBe(true);
  });

  it('returns 400 when coverLetter exceeds 2000 chars', async () => {
    const { user: js } = await createJobseeker({ emailVerified: true });
    const longLetter = 'a'.repeat(2001);
    const r = await request(app)
      .post('/api/applications/apply')
      .set(createAuthHeaders(js))
      .send({
        jobId: '507f1f77bcf86cd799439011',
        applicationMethod: 'one_click',
        coverLetter: longLetter,
      });

    expect(r.status).toBe(400);
    expect(r.body.errors.some(e => e.field === 'coverLetter')).toBe(true);
    expect(r.body.errors.some(e => /2000/.test(e.message))).toBe(true);
  });

  it('returns 400 when customAnswers is not an array', async () => {
    const { user: js } = await createJobseeker({ emailVerified: true });
    const r = await request(app)
      .post('/api/applications/apply')
      .set(createAuthHeaders(js))
      .send({
        jobId: '507f1f77bcf86cd799439011',
        applicationMethod: 'custom_form',
        customAnswers: 'not-an-array',
      });

    expect(r.status).toBe(400);
    expect(r.body.errors.some(e => e.field === 'customAnswers')).toBe(true);
  });
});
