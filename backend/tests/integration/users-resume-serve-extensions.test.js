/**
 * Phase 28 — coverage push for routes/users.js GET /resume/:filename
 * extension dispatcher branches not exercised by users-resume-serve.test.js:
 *   - .doc extension → application/msword content-type (L1928-1932)
 *   - Unknown extension → application/octet-stream fallback
 *   - query.token middleware (L1853-1857) used for new-tab opens that can't
 *     set Authorization headers
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import request from 'supertest';
import app from '../../server.js';
import jwt from 'jsonwebtoken';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createJobseeker } from '../factories/user.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';

const uploadsDir = path.join(process.cwd(), 'uploads', 'resumes');

describe('users.js — GET /resume/:filename extension dispatcher', () => {
  beforeAll(async () => {
    await connectTestDB();
    await seedLocations();
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  });

  afterEach(async () => {
    await clearTestDB();
    await seedLocations();
  });

  afterAll(async () => {
    await closeTestDB();
  });

  function writeFile(filename, content = 'fake bytes') {
    fs.writeFileSync(path.join(uploadsDir, filename), content);
  }
  function cleanup(filename) {
    const fp = path.join(uploadsDir, filename);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  }

  it('serves .doc with application/msword content-type', async () => {
    const { user } = await createJobseeker({ email: 'doc-ext@example.com' });
    const filename = `resume-${user._id}-${Date.now()}.doc`;
    writeFile(filename, 'fake doc bytes');

    try {
      const r = await request(app)
        .get(`/api/users/resume/${filename}`)
        .set(createAuthHeaders(user));
      expect(r.status).toBe(200);
      expect(r.headers['content-type']).toMatch(/application\/msword/);
    } finally {
      cleanup(filename);
    }
  });

  it('serves unknown extension with application/octet-stream fallback', async () => {
    const { user } = await createJobseeker({ email: 'unk-ext@example.com' });
    const filename = `resume-${user._id}-${Date.now()}.xyz`;
    writeFile(filename, 'fake bytes');

    try {
      const r = await request(app)
        .get(`/api/users/resume/${filename}`)
        .set(createAuthHeaders(user));
      expect(r.status).toBe(200);
      expect(r.headers['content-type']).toMatch(/application\/octet-stream/);
    } finally {
      cleanup(filename);
    }
  });

  it('accepts ?token query param when no Authorization header (L1853-1857)', async () => {
    const { user } = await createJobseeker({ email: 'qtoken@example.com' });
    const filename = `resume-${user._id}-${Date.now()}.pdf`;
    writeFile(filename);

    // Mint a real JWT for the user so authenticate middleware accepts it
    const token = jwt.sign(
      { id: user._id.toString(), email: user.email, userType: 'jobseeker' },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    try {
      const r = await request(app)
        .get(`/api/users/resume/${filename}?token=${token}`);
      // No Authorization header — should still authenticate via ?token=
      expect(r.status).toBe(200);
    } finally {
      cleanup(filename);
    }
  });

  it('?token does NOT override an existing Authorization header (precedence check)', async () => {
    const { user } = await createJobseeker({ email: 'qtoken-precedence@example.com' });
    const filename = `resume-${user._id}-${Date.now()}.pdf`;
    writeFile(filename);

    try {
      // Real Authorization header from the user — bogus query token should be ignored
      const r = await request(app)
        .get(`/api/users/resume/${filename}?token=bogus`)
        .set(createAuthHeaders(user));
      expect(r.status).toBe(200);
    } finally {
      cleanup(filename);
    }
  });
});
