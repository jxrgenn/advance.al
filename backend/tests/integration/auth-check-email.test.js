/**
 * QA-C3 — GET /api/auth/check-email
 *
 * Boolean availability endpoint. Pre-flight check used by signup forms on
 * email-input blur to surface "already registered" inline. Must:
 *   - return {available: true} for unused emails
 *   - return {available: false} for taken emails (case-insensitive)
 *   - fail-open (available: true) on garbage / missing input — never leak
 *     whether a malformed string is "in the system"
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { createJobseeker } from '../factories/user.factory.js';

describe('GET /api/auth/check-email — QA-C3', () => {
  beforeAll(async () => {
    await connectTestDB();
  });
  afterAll(async () => {
    await closeTestDB();
  });
  beforeEach(async () => {
    await clearTestDB();
  });

  it('returns {available: true} for a never-seen email', async () => {
    const r = await request(app).get('/api/auth/check-email?email=neverseen@example.com');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ available: true });
  });

  it('returns {available: false} for a registered email', async () => {
    await createJobseeker({ email: 'taken@example.com' });
    const r = await request(app).get('/api/auth/check-email?email=taken@example.com');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ available: false });
  });

  it('case-insensitive: TAKEN@EXAMPLE.COM matches the lowercased taken@example.com', async () => {
    await createJobseeker({ email: 'taken@example.com' });
    const r = await request(app).get('/api/auth/check-email?email=TAKEN@EXAMPLE.COM');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ available: false });
  });

  it('returns {available: true} for missing email param (fail-open)', async () => {
    const r = await request(app).get('/api/auth/check-email');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ available: true });
  });

  it('returns {available: true} for malformed email (no leak)', async () => {
    const r = await request(app).get('/api/auth/check-email?email=not-an-email');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ available: true });
  });

  it('returns {available: true} for SQL-injection attempt (no crash, no leak)', async () => {
    const r = await request(app).get(`/api/auth/check-email?email=${encodeURIComponent("'; DROP TABLE users; --")}`);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ available: true });
  });
});
