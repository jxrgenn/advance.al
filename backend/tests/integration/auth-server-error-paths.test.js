/**
 * Phase 28 — coverage push for routes/auth.js outer 500 catch blocks
 * not covered by auth-error-paths.test.js.
 *
 * Targets:
 *   - L650-651 POST /login outer catch (User.findOne throws)
 *   - L754-759 GET /me catch (User.findById throws)
 *   - L813-818 PUT /change-password catch (save throws)
 *   - L880-886 POST /forgot-password outer catch (User.findOne throws)
 *   - L932-937 POST /reset-password outer catch (User.findOne throws)
 *   - L959-961 POST /send-verification catch (User.findById throws)
 *   - L1004-1005 POST /verify-email catch (User.findById throws)
 *   - L1029-1033 POST /logout swallows error and returns success
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, jest } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createJobseeker } from '../factories/user.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import User from '../../src/models/User.js';

// Spy on User.findById with a guard so auth middleware (first call) passes
function mockFindByIdToThrow(error = new Error('mongo down')) {
  const real = User.findById.bind(User);
  let calls = 0;
  return jest.spyOn(User, 'findById').mockImplementation(function (...args) {
    calls++;
    if (calls === 1) return real(...args); // auth middleware
    throw error;
  });
}

describe('auth.js — server-error catch paths', () => {
  beforeAll(async () => { await connectTestDB(); await seedLocations(); });
  afterEach(async () => {
    jest.restoreAllMocks();
    await clearTestDB();
    await seedLocations();
  });
  afterAll(async () => { await closeTestDB(); });

  it('POST /login returns 500 when User.findOne throws (L650-651)', async () => {
    const realFindOne = User.findOne.bind(User);
    jest.spyOn(User, 'findOne').mockImplementationOnce(function (...args) {
      if (args[0]?.email !== undefined) throw new Error('login findOne fail');
      return realFindOne(...args);
    });
    const r = await request(app)
      .post('/api/auth/login')
      .send({ email: 'x@example.com', password: 'Password123!' });
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/Gabim në kyçje/);
  });

  it('GET /me returns 500 when User.findById throws (L754-759)', async () => {
    const { user: js } = await createJobseeker();
    mockFindByIdToThrow();
    const r = await request(app)
      .get('/api/auth/me')
      .set(createAuthHeaders(js));
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/marrjen e të dhënave/);
  });

  it('PUT /change-password returns 500 when save throws (L813-818)', async () => {
    const { user: js, plainPassword } = await createJobseeker();
    jest.spyOn(User.prototype, 'save').mockRejectedValueOnce(new Error('save fail'));
    const r = await request(app)
      .put('/api/auth/change-password')
      .set(createAuthHeaders(js))
      .send({ currentPassword: plainPassword, newPassword: 'NewPassword123!' });
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/ndryshimin e fjalëkalimit/);
  });

  it('POST /forgot-password returns 500 when User.findOne throws (L880-886)', async () => {
    const realFindOne = User.findOne.bind(User);
    jest.spyOn(User, 'findOne').mockImplementationOnce(function (...args) {
      if (args[0]?.email !== undefined) throw new Error('forgot findOne fail');
      return realFindOne(...args);
    });
    const r = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: `unique-${Date.now()}@example.com` });
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/dërgimin e emailit për rivendosjen/);
  });

  it('POST /reset-password returns 500 when User.findOne throws (L932-937)', async () => {
    const realFindOne = User.findOne.bind(User);
    jest.spyOn(User, 'findOne').mockImplementationOnce(function (...args) {
      if (args[0]?.passwordResetToken !== undefined) throw new Error('reset findOne fail');
      return realFindOne(...args);
    });
    const r = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'a'.repeat(64), password: 'NewPassword123!' });
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/rivendosjen e fjalëkalimit/);
  });

  it('POST /send-verification returns 500 when User.findById throws (L959-961)', async () => {
    const { user: js } = await createJobseeker();
    mockFindByIdToThrow();
    const r = await request(app)
      .post('/api/auth/send-verification')
      .set(createAuthHeaders(js));
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/dërgimin e kodit të verifikimit/);
  });

  it('POST /verify-email returns 500 when User.findById throws (L1004-1005)', async () => {
    const { user: js } = await createJobseeker();
    mockFindByIdToThrow();
    const r = await request(app)
      .post('/api/auth/verify-email')
      .set(createAuthHeaders(js))
      .send({ code: '123456' });
    expect(r.status).toBe(500);
    expect(r.body.message).toMatch(/verifikimin e emailit/);
  });

  it('POST /logout swallows revocation error and still returns 200 (L1029-1033)', async () => {
    const { user: js } = await createJobseeker();
    jest.spyOn(User.prototype, 'removeAllRefreshTokens').mockRejectedValueOnce(new Error('revocation failed'));
    const r = await request(app)
      .post('/api/auth/logout')
      .set(createAuthHeaders(js));
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.message).toMatch(/Daljet u krye/);
  });

  it('POST /send-verification returns 400 when user.emailVerified=true (L952-954)', async () => {
    const { user: js } = await createJobseeker();
    await User.updateOne({ _id: js._id }, { $set: { emailVerified: true } });
    const r = await request(app)
      .post('/api/auth/send-verification')
      .set(createAuthHeaders(js));
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/tashmë i verifikuar/);
  });
});
