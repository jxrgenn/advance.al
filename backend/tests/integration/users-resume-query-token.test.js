/**
 * Phase 28 — coverage push for users.js GET /resume/:filename query-param
 * token branch (L1853-1856). Existing users-resume-serve.test.js only
 * uses Authorization header; this exercises the ?token=... fallback that
 * window.open() uses for new-tab opens.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createJobseeker } from '../factories/user.factory.js';
import { generateToken } from '../../src/middleware/auth.js';

const uploadsDir = path.join(process.cwd(), 'uploads', 'resumes');

describe('users.js — GET /resume/:filename ?token= query-param branch', () => {
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

  function writeFakeResume(filename, content = 'fake pdf bytes') {
    fs.writeFileSync(path.join(uploadsDir, filename), content);
  }
  function cleanup(filename) {
    const fp = path.join(uploadsDir, filename);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  }

  it('owner can fetch resume using ?token= query param (L1853-1856)', async () => {
    const { user } = await createJobseeker({ email: 'qtok@example.com' });
    const filename = `resume-${user._id.toString()}-${Date.now()}.pdf`;
    writeFakeResume(filename);

    try {
      const token = generateToken({ id: user._id, email: user.email, userType: user.userType });
      const r = await request(app).get(`/api/users/resume/${filename}?token=${token}`);
      expect(r.status).toBe(200);
      expect(r.headers['content-type']).toMatch(/pdf|octet-stream/);
    } finally {
      cleanup(filename);
    }
  });

  it('rejects without any token (header or query) — 401 from auth middleware', async () => {
    const { user } = await createJobseeker({ email: 'noauth@example.com' });
    const filename = `resume-${user._id.toString()}-${Date.now()}.pdf`;
    writeFakeResume(filename);

    try {
      const r = await request(app).get(`/api/users/resume/${filename}`);
      expect(r.status).toBe(401);
    } finally {
      cleanup(filename);
    }
  });

  it('header takes precedence over query if both present', async () => {
    const { user: owner } = await createJobseeker({ email: 'ownerprec@example.com' });
    const filename = `resume-${owner._id.toString()}-${Date.now()}.pdf`;
    writeFakeResume(filename);

    try {
      const ownerToken = generateToken({ id: owner._id, email: owner.email, userType: owner.userType });
      // Even with bogus query token, the header auth wins
      const r = await request(app)
        .get(`/api/users/resume/${filename}?token=garbage`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(r.status).toBe(200);
    } finally {
      cleanup(filename);
    }
  });
});
