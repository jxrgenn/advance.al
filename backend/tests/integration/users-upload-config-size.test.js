/**
 * Phase 28 — coverage push for users.js /upload-resume + /parse-resume
 * config-driven max_cv_file_size enforcement (L633-641 + L823-831).
 *
 * No existing test exercised the SystemConfiguration.max_cv_file_size
 * branch — we set the cap to a tiny value (1MB) and submit a 1.5MB file
 * that passes magic-byte validation. This forces the L635-639 size-reject
 * branch.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createJobseeker } from '../factories/user.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import SystemConfiguration from '../../src/models/SystemConfiguration.js';
import { createAdmin } from '../factories/user.factory.js';

const resumeDir = path.join(process.cwd(), 'uploads', 'resumes');

function cleanupUploads() {
  if (!fs.existsSync(resumeDir)) return;
  for (const f of fs.readdirSync(resumeDir)) {
    try { fs.unlinkSync(path.join(resumeDir, f)); } catch { /* ignore */ }
  }
}

// Build a real PDF of the requested size (header + padding + EOF)
function makeBigPdf(sizeBytes) {
  const header = Buffer.from('%PDF-1.4\n', 'utf8');
  const trailer = Buffer.from('\n%%EOF', 'utf8');
  const padLen = sizeBytes - header.length - trailer.length;
  const pad = Buffer.alloc(padLen, 0x20);
  return Buffer.concat([header, pad, trailer]);
}

describe('users.js — config-driven max_cv_file_size', () => {
  beforeAll(async () => {
    await connectTestDB();
    await seedLocations();
  });

  afterEach(async () => {
    await clearTestDB();
    await seedLocations();
    cleanupUploads();
  });

  afterAll(async () => {
    await closeTestDB();
  });

  async function setMaxSize(maxMB, adminId) {
    await SystemConfiguration.findOneAndUpdate(
      { key: 'max_cv_file_size' },
      {
        key: 'max_cv_file_size',
        name: 'Max CV File Size',
        category: 'features',
        dataType: 'number',
        value: maxMB,
        description: 'Max CV file size in MB',
        lastModifiedBy: adminId,
      },
      { upsert: true }
    );
  }

  it('POST /upload-resume rejects file exceeding configured max (L635-639)', async () => {
    const { user: admin } = await createAdmin();
    await setMaxSize(1, admin._id); // 1MB cap

    const { user: js } = await createJobseeker({ email: 'sizecap@example.com' });
    const bigPdf = makeBigPdf(1.5 * 1024 * 1024); // 1.5MB

    const r = await request(app)
      .post('/api/users/upload-resume')
      .set(createAuthHeaders(js))
      .attach('resume', bigPdf, { filename: 'big.pdf', contentType: 'application/pdf' });

    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/1MB/);
  });

  it('POST /parse-resume rejects file exceeding configured max (L825-829)', async () => {
    const { user: admin } = await createAdmin();
    await setMaxSize(1, admin._id);

    const originalKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = 'sk-test-fake';
    try {
      const { user: js } = await createJobseeker({ email: 'sizecap-parse@example.com' });
      const bigPdf = makeBigPdf(1.5 * 1024 * 1024);

      const r = await request(app)
        .post('/api/users/parse-resume')
        .set(createAuthHeaders(js))
        .attach('resume', bigPdf, { filename: 'big.pdf', contentType: 'application/pdf' });

      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/1MB/);
    } finally {
      if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = originalKey;
    }
  });

  it('POST /upload-resume accepts file within configured max', async () => {
    const { user: admin } = await createAdmin();
    await setMaxSize(5, admin._id); // 5MB cap

    const { user: js } = await createJobseeker({ email: 'sizecap-ok@example.com' });
    const smallPdf = makeBigPdf(50 * 1024); // 50KB

    const r = await request(app)
      .post('/api/users/upload-resume')
      .set(createAuthHeaders(js))
      .attach('resume', smallPdf, { filename: 'ok.pdf', contentType: 'application/pdf' });

    // JUSTIFIED: 200 (uploaded via local-fallback) or 503 (Cloudinary not
    // configured AND local fallback disabled). Branch under test is the
    // size gate; both prove the 50KB payload passed it.
    expect([200, 503]).toContain(r.status);
  });
});
