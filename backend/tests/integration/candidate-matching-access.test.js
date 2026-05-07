/**
 * Integration tests for candidateMatching access controls (Phase 28 — Phase 6).
 *
 * Covers:
 *   - hasAccessToJob: false for non-employers, false when candidateMatchingEnabled=false,
 *     false when employer hasn't paid for THIS job, true when access granted, false when expired
 *   - grantAccessToJob: idempotent (granting twice doesn't add duplicate),
 *     enables global flag if not yet on, validates employer userType
 *   - trackContact: marks the CandidateMatch as contacted with timestamp + method
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { createJobseeker, createEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import service from '../../src/services/candidateMatching.js';
import User from '../../src/models/User.js';
import CandidateMatch from '../../src/models/CandidateMatch.js';

describe('candidateMatching.hasAccessToJob', () => {
  beforeAll(async () => { await connectTestDB(); });
  afterEach(async () => { await clearTestDB(); });
  afterAll(async () => { await closeTestDB(); });

  it('returns false for a jobseeker (not an employer)', async () => {
    const { user: js } = await createJobseeker();
    const { user: emp } = await createEmployer();
    const job = await createJob(emp);
    expect(await service.hasAccessToJob(js._id, job._id)).toBe(false);
  });

  it('returns false when employer has candidateMatchingEnabled=false (default)', async () => {
    const { user: emp } = await createEmployer();
    const job = await createJob(emp);
    expect(await service.hasAccessToJob(emp._id, job._id)).toBe(false);
  });

  it('returns false when employer is enabled globally but has no entry for THIS job', async () => {
    const { user: emp } = await createEmployer();
    emp.profile.employerProfile.candidateMatchingEnabled = true;
    emp.profile.employerProfile.candidateMatchingJobs = [];
    emp.markModified('profile');
    await emp.save();
    const job = await createJob(emp);
    expect(await service.hasAccessToJob(emp._id, job._id)).toBe(false);
  });

  it('returns true when employer has unexpired access for the job', async () => {
    const { user: emp } = await createEmployer();
    const job = await createJob(emp);
    // Note: candidateMatchingEnabled lives on profile.employerProfile, NOT root
    emp.profile.employerProfile.candidateMatchingEnabled = true;
    emp.profile.employerProfile.candidateMatchingJobs = [{
      jobId: job._id,
      enabledAt: new Date(),
      expiresAt: null,
    }];
    emp.markModified('profile');
    await emp.save();
    expect(await service.hasAccessToJob(emp._id, job._id)).toBe(true);
  });

  it('returns false when access for the job has expired', async () => {
    const { user: emp } = await createEmployer();
    const job = await createJob(emp);
    emp.profile.employerProfile.candidateMatchingEnabled = true;
    emp.profile.employerProfile.candidateMatchingJobs = [{
      jobId: job._id,
      enabledAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30),
      expiresAt: new Date(Date.now() - 1000), // 1 second in the past
    }];
    emp.markModified('profile');
    await emp.save();
    expect(await service.hasAccessToJob(emp._id, job._id)).toBe(false);
  });

  it('returns false (not throws) when employer does not exist', async () => {
    const fakeId = '507f1f77bcf86cd799439099';
    const { user: emp } = await createEmployer();
    const job = await createJob(emp);
    expect(await service.hasAccessToJob(fakeId, job._id)).toBe(false);
  });
});

describe('candidateMatching.grantAccessToJob', () => {
  beforeAll(async () => { await connectTestDB(); });
  afterEach(async () => { await clearTestDB(); });
  afterAll(async () => { await closeTestDB(); });

  it('grants access and enables global flag', async () => {
    const { user: emp } = await createEmployer({ candidateMatchingEnabled: false });
    const job = await createJob(emp);

    const r = await service.grantAccessToJob(emp._id, job._id);
    expect(r.success).toBe(true);

    const refetched = await User.findById(emp._id);
    expect(refetched.profile.employerProfile.candidateMatchingEnabled).toBe(true);
    expect(refetched.profile.employerProfile.candidateMatchingJobs).toHaveLength(1);
    expect(refetched.profile.employerProfile.candidateMatchingJobs[0].jobId.toString())
      .toBe(job._id.toString());
  });

  it('is idempotent — granting the same job twice does not duplicate', async () => {
    const { user: emp } = await createEmployer();
    const job = await createJob(emp);

    await service.grantAccessToJob(emp._id, job._id);
    await service.grantAccessToJob(emp._id, job._id);

    const refetched = await User.findById(emp._id);
    expect(refetched.profile.employerProfile.candidateMatchingJobs).toHaveLength(1);
  });

  it('appends a NEW job to existing access list (does not overwrite)', async () => {
    const { user: emp } = await createEmployer();
    const job1 = await createJob(emp);
    const job2 = await createJob(emp);

    await service.grantAccessToJob(emp._id, job1._id);
    await service.grantAccessToJob(emp._id, job2._id);

    const refetched = await User.findById(emp._id);
    expect(refetched.profile.employerProfile.candidateMatchingJobs).toHaveLength(2);
  });

  it('returns success:false when target user is a jobseeker (not employer)', async () => {
    const { user: js } = await createJobseeker();
    const { user: emp } = await createEmployer();
    const job = await createJob(emp);

    const r = await service.grantAccessToJob(js._id, job._id);
    expect(r.success).toBe(false);
    expect(r.message).toMatch(/invalid employer|employer/i);
  });

  it('returns success:false when employer does not exist', async () => {
    const r = await service.grantAccessToJob('507f1f77bcf86cd799439099', '507f1f77bcf86cd799439098');
    expect(r.success).toBe(false);
  });
});

describe('candidateMatching.trackContact', () => {
  beforeAll(async () => { await connectTestDB(); });
  afterEach(async () => { await clearTestDB(); });
  afterAll(async () => { await closeTestDB(); });

  it('marks an existing CandidateMatch as contacted with method + timestamp', async () => {
    const { user: emp } = await createEmployer();
    const { user: candidate } = await createJobseeker();
    const job = await createJob(emp);
    const match = await CandidateMatch.create({
      jobId: job._id,
      candidateId: candidate._id,
      matchScore: 80,
      matchBreakdown: { titleMatch: 20 },
      calculatedAt: new Date(),
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      contacted: false,
    });

    const r = await service.trackContact(job._id, candidate._id, 'email');
    expect(r.success).toBe(true);

    const refetched = await CandidateMatch.findById(match._id);
    expect(refetched.contacted).toBe(true);
    expect(refetched.contactMethod).toBe('email');
    expect(refetched.contactedAt).toBeInstanceOf(Date);
  });

  it('returns success:true even when no matching record exists (no-op)', async () => {
    const { user: emp } = await createEmployer();
    const { user: candidate } = await createJobseeker();
    const job = await createJob(emp);
    // No CandidateMatch created
    const r = await service.trackContact(job._id, candidate._id, 'phone');
    expect(r.success).toBe(true);
  });

  it('returns success:false on invalid ObjectId (mongoose throws)', async () => {
    const r = await service.trackContact('not-an-objectid', 'also-not', 'email');
    expect(r.success).toBe(false);
    expect(r.message).toBeDefined();
  });
});
