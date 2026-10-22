/**
 * Round O-B — Resume signing endpoint
 *
 * Tests the new POST /api/users/resume/sign endpoint that mints short-lived
 * Cloudinary signed URLs for authenticated-type resume assets, and confirms
 * the legacy GET /api/users/resume/:filename now returns 410 Gone.
 *
 * Covered:
 *   - owner can sign their own resume URL (200, signed URL contains
 *     /authenticated/ marker)
 *   - admin can sign any resume URL (200)
 *   - employer WITH an active application from the owner can sign the owner's
 *     current profile CV (200) — application-attached CVs are covered in
 *     applications-apply-cv-and-answers.test.js
 *   - employer WITHOUT an application from the owner cannot sign (403)
 *   - another jobseeker cannot sign someone else's resume URL (403)
 *   - garbage / non-Cloudinary URL → 400
 *   - URL whose filename doesn't match the resume-<24hex>-<ms> pattern → 400
 *   - missing auth → 401
 *   - legacy GET /api/users/resume/:filename → 410
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createJobseeker, createVerifiedEmployer, createAdmin } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import Application from '../../src/models/Application.js';
import User from '../../src/models/User.js';
import { RESUME_SIGN_MAX_PER_HOUR } from '../../src/routes/users.js';

// Build a Cloudinary authenticated-type resume URL where the filename encodes
// the owner's userId. The resume-sign endpoint validates this pattern.
function buildResumeUrl(ownerId) {
  return `https://res.cloudinary.com/dk6jrzkts/raw/authenticated/v123/advance-al/cvs/resume-${ownerId}-1747000000.pdf`;
}

describe('POST /api/users/resume/sign — Round O-B', () => {
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

  it('rejects without auth → 401', async () => {
    const { user: owner } = await createJobseeker();
    const url = buildResumeUrl(owner._id.toString());
    const res = await request(app).post('/api/users/resume/sign').send({ resumeUrl: url });
    expect(res.status).toBe(401);
  });

  it('owner can sign their own resume URL → 200 + signed URL', async () => {
    const { user: owner } = await createJobseeker();
    const url = buildResumeUrl(owner._id.toString());

    const res = await request(app)
      .post('/api/users/resume/sign')
      .set(createAuthHeaders(owner))
      .send({ resumeUrl: url });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.data.url).toBe('string');
    expect(res.body.data.url).toContain('cloudinary.com');
    // private_download_url for type:'authenticated' produces a URL containing
    // /authenticated/ + a signature query param.
    expect(res.body.data.url).toMatch(/authenticated|signature=/);
    expect(typeof res.body.data.expiresAt).toBe('number');
    // 5-min TTL — must be within the next ~6 minutes
    const nowSec = Math.floor(Date.now() / 1000);
    expect(res.body.data.expiresAt).toBeGreaterThan(nowSec);
    expect(res.body.data.expiresAt).toBeLessThanOrEqual(nowSec + 360);
  });

  it('another jobseeker cannot sign someone else\'s resume → 403', async () => {
    const { user: owner } = await createJobseeker({ email: 'owner-a@example.com' });
    const { user: other } = await createJobseeker({ email: 'other-b@example.com' });
    const url = buildResumeUrl(owner._id.toString());

    const res = await request(app)
      .post('/api/users/resume/sign')
      .set(createAuthHeaders(other))
      .send({ resumeUrl: url });

    expect(res.status).toBe(403);
  });

  it('admin can sign any resume → 200', async () => {
    const { user: owner } = await createJobseeker();
    const { user: admin } = await createAdmin();
    const url = buildResumeUrl(owner._id.toString());

    const res = await request(app)
      .post('/api/users/resume/sign')
      .set(createAuthHeaders(admin))
      .send({ resumeUrl: url });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.url).toContain('cloudinary.com');
  });

  it('employer WITH an active application from the owner can sign the owner\'s profile CV → 200', async () => {
    const { user: owner } = await createJobseeker();
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp);
    await Application.create({
      jobId: job._id,
      jobSeekerId: owner._id,
      employerId: emp._id,
      coverLetter: 'I am interested',
      status: 'pending',
      applicationMethod: 'one_click',
      withdrawn: false,
    });
    const url = buildResumeUrl(owner._id.toString());
    // Fix batch C (O-42): an employer's grant is bound to a CV actually shared
    // with them — the owner's CURRENT profile CV, or a CV attached to an
    // application addressed to them. This URL is the profile CV.
    await User.updateOne({ _id: owner._id }, { $set: { 'profile.jobSeekerProfile.resume': url } });

    const res = await request(app)
      .post('/api/users/resume/sign')
      .set(createAuthHeaders(emp))
      .send({ resumeUrl: url });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('employer WITHOUT an application from the owner cannot sign → 403', async () => {
    const { user: owner } = await createJobseeker();
    const { user: emp } = await createVerifiedEmployer();
    // No Application doc linking emp ← owner.
    const url = buildResumeUrl(owner._id.toString());

    const res = await request(app)
      .post('/api/users/resume/sign')
      .set(createAuthHeaders(emp))
      .send({ resumeUrl: url });

    expect(res.status).toBe(403);
  });

  it('employer whose only application is withdrawn cannot sign → 403', async () => {
    const { user: owner } = await createJobseeker();
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJob(emp);
    await Application.create({
      jobId: job._id,
      jobSeekerId: owner._id,
      employerId: emp._id,
      coverLetter: 'I am interested',
      status: 'pending',
      applicationMethod: 'one_click',
      withdrawn: true,
    });
    const url = buildResumeUrl(owner._id.toString());

    const res = await request(app)
      .post('/api/users/resume/sign')
      .set(createAuthHeaders(emp))
      .send({ resumeUrl: url });

    expect(res.status).toBe(403);
  });

  it('rejects non-Cloudinary URL → 400', async () => {
    const { user: owner } = await createJobseeker();

    const res = await request(app)
      .post('/api/users/resume/sign')
      .set(createAuthHeaders(owner))
      .send({ resumeUrl: 'https://evil.example.com/leaked-cv.pdf' });

    expect(res.status).toBe(400);
  });

  it('rejects Cloudinary URL with malformed filename pattern → 400', async () => {
    const { user: owner } = await createJobseeker();
    // Filename doesn't follow `resume-<24hex>-<ms>` so ownerIdFromResumeUrl returns null.
    const badUrl = 'https://res.cloudinary.com/dk6jrzkts/raw/authenticated/v123/advance-al/cvs/random-file.pdf';

    const res = await request(app)
      .post('/api/users/resume/sign')
      .set(createAuthHeaders(owner))
      .send({ resumeUrl: badUrl });

    expect(res.status).toBe(400);
  });

  it('rejects empty body → 400', async () => {
    const { user: owner } = await createJobseeker();

    const res = await request(app)
      .post('/api/users/resume/sign')
      .set(createAuthHeaders(owner))
      .send({});

    expect(res.status).toBe(400);
  });
});

describe('GET /api/users/resume/:filename — legacy retirement (Round O-B)', () => {
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

  it('returns 410 Gone for any caller (legacy local-disk route retired)', async () => {
    const { user: owner } = await createJobseeker();
    const res = await request(app)
      .get(`/api/users/resume/resume-${owner._id.toString()}-1747000000.pdf`)
      .set(createAuthHeaders(owner));
    expect(res.status).toBe(410);
    expect(res.body.success).toBe(false);
  });
});

// The resume-sign limiter (30/hr per user) caps a malicious employer who
// holds ONE application from trying to enumerate other resume URLs. Normal
// test runs set SKIP_RATE_LIMIT=true so happy paths don't trip limits — this
// block un-sets it (same pattern as rate-limit-attacker-patterns.test.js).
describe('POST /api/users/resume/sign — rate limiting (Round O-B)', () => {
  let originalSkip;

  beforeAll(async () => {
    await connectTestDB();
    await seedLocations();
  });

  beforeEach(() => {
    originalSkip = process.env.SKIP_RATE_LIMIT;
    delete process.env.SKIP_RATE_LIMIT;
  });

  afterEach(async () => {
    if (originalSkip === undefined) delete process.env.SKIP_RATE_LIMIT;
    else process.env.SKIP_RATE_LIMIT = originalSkip;
    await clearTestDB();
    await seedLocations();
  });

  afterAll(async () => {
    await closeTestDB();
  });

  // 134: the budget was 30/hr, which locked an employer out of CVs after
  // screening ~15-30 applicants ("Shiko" + "Shkarko" each cost one). It is
  // now RESUME_SIGN_MAX_PER_HOUR (300) — still a cap on runaway loops.
  it('caps a single user at 300 sign requests/hour — 301st returns 429', async () => {
    expect(RESUME_SIGN_MAX_PER_HOUR).toBe(300);
    const { user: owner } = await createJobseeker();
    const url = buildResumeUrl(owner._id.toString());
    const headers = createAuthHeaders(owner);

    for (let i = 0; i < RESUME_SIGN_MAX_PER_HOUR; i++) {
      const r = await request(app)
        .post('/api/users/resume/sign')
        .set(headers)
        .send({ resumeUrl: url });
      expect(r.status).toBe(200);
    }

    const over = await request(app)
      .post('/api/users/resume/sign')
      .set(headers)
      .send({ resumeUrl: url });
    expect(over.status).toBe(429);
    expect(over.body).toEqual({ success: false, message: 'Shumë kërkesa për nënshkrim URL-je. Provoni përsëri pas një ore.' });
  }, 120000);
});
