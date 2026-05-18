/**
 * Integration tests for notificationService matching orchestration
 * (Phase 28 — Phase 6 coverage push).
 *
 * Targets the two large untested orchestration functions:
 *   - notifyMatchingUsers(job): semantic + keyword fallback, batch dispatch,
 *     QuickUser + JobSeeker fan-out, error aggregation.
 *   - notifyUserAboutMatchingJobs({type, userId}): semantic reverse-match,
 *     digest-email rendering, missing-embedding short-circuits.
 *
 * Email sends are short-circuited via resendEmailService.enabled=false so
 * no real network calls happen; we exercise the full template + dispatch
 * code paths and assert on returned metadata + DB side-effects.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import mongoose from 'mongoose';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { createJobseeker, createEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import notificationService from '../../src/lib/notificationService.js';
import emailService from '../../src/lib/emailService.js';
import resendEmailService from '../../src/lib/resendEmailService.js';
import userEmbeddingService from '../../src/services/userEmbeddingService.js';
import QuickUser from '../../src/models/QuickUser.js';
import Job from '../../src/models/Job.js';
import User from '../../src/models/User.js';

// Build a 1536-dim vector with most weight on one axis. Two vectors created
// with the same `axis` will have cosine similarity 1.0; different axes ~0.0.
function vectorAt(axis = 0, magnitude = 1) {
  const v = new Array(1536).fill(0.001); // tiny noise so it's not all-zeros
  v[axis] = magnitude;
  return v;
}

describe('notificationService.notifyMatchingUsers', () => {
  beforeAll(async () => {
    await connectTestDB();
    emailService.isConfigured = false;
    resendEmailService.enabled = false;
  });

  afterEach(async () => {
    await clearTestDB();
  });

  afterAll(async () => {
    await closeTestDB();
  });

  it('returns "No matching users found" when no users match', async () => {
    const { user: emp } = await createEmployer();
    const job = await createJob(emp);

    const r = await notificationService.notifyMatchingUsers(job);
    expect(r.success).toBe(true);
    expect(r.stats.totalUsers).toBe(0);
    expect(r.stats.notificationsSent).toBe(0);
  });

  it('falls through cleanly when semantic matching throws (catches error, falls back)', async () => {
    const { user: emp } = await createEmployer();
    const job = await createJob(emp);

    // Force semantic matching to throw
    const original = userEmbeddingService.findSemanticMatchesForJob;
    userEmbeddingService.findSemanticMatchesForJob = async () => {
      throw new Error('embedding service down');
    };
    try {
      const r = await notificationService.notifyMatchingUsers(job);
      // Catches the semantic error and continues to keyword fallback
      expect(r.success).toBe(true);
    } finally {
      userEmbeddingService.findSemanticMatchesForJob = original;
    }
  });

  it('notifies semantic-matched QuickUsers and updates lastNotifiedAt', async () => {
    const { user: emp } = await createEmployer();
    // Create a job WITH an embedding vector
    const job = await createJob(emp, { category: 'Teknologji', city: 'Tiranë' });
    job.embedding = {
      vector: vectorAt(5),
      model: 'text-embedding-3-small',
      dimensions: 1536,
      generatedAt: new Date(),
      status: 'completed',
      retries: 0,
      error: null,
    };
    await job.save();

    // Create a QuickUser with matching embedding
    const qu = await QuickUser.create({
      firstName: 'Match', lastName: 'User',
      email: 'semantic-qu@example.com',
      location: 'Tiranë',
      interests: ['Teknologji'],
      embedding: {
        vector: vectorAt(5),
        model: 'text-embedding-3-small',
        dimensions: 1536,
        generatedAt: new Date(),
        status: 'completed',
        error: null,
      },
    });

    const r = await notificationService.notifyMatchingUsers(job);
    expect(r.success).toBe(true);
    expect(r.stats.totalUsers).toBeGreaterThanOrEqual(1);
    expect(r.stats.notificationsSent).toBeGreaterThanOrEqual(1);
    expect(r.stats.breakdown.quickUsers).toBeGreaterThanOrEqual(1);

    // Side effect — QuickUser.recordNotificationSent was called
    const refreshed = await QuickUser.findById(qu._id);
    expect(refreshed.lastNotifiedAt).toBeInstanceOf(Date);
  });

  it('notifies semantic-matched JobSeekers (full accounts with jobAlerts on)', async () => {
    const { user: emp } = await createEmployer();
    const job = await createJob(emp, { category: 'Teknologji', city: 'Tiranë' });
    job.embedding = {
      vector: vectorAt(7), model: 'text-embedding-3-small', dimensions: 1536,
      generatedAt: new Date(), status: 'completed', retries: 0, error: null,
    };
    await job.save();

    // Create a jobseeker WITH a matching embedding + jobAlerts enabled.
    // Round P Stage 2: city pinned to match the job (Tiranë) since
    // notifyMatchingUsers now pre-filters candidates by city at the query level.
    const { user: js } = await createJobseeker({ city: 'Tiranë' });
    js.profile.jobSeekerProfile = js.profile.jobSeekerProfile || {};
    js.profile.jobSeekerProfile.notifications = { jobAlerts: true };
    js.profile.jobSeekerProfile.embedding = {
      vector: vectorAt(7), model: 'text-embedding-3-small', dimensions: 1536,
      generatedAt: new Date(), status: 'completed', error: null,
    };
    await js.save();

    const r = await notificationService.notifyMatchingUsers(job);
    expect(r.success).toBe(true);
    expect(r.stats.breakdown.jobSeekers).toBeGreaterThanOrEqual(1);
  });

  it('QuickUsers with completed embeddings go through semantic path ONLY, never keyword (PR-G partition)', async () => {
    // Regression for PR-G: after the keyword-fallback filter, a QuickUser with
    // a completed embedding must NEVER be returned by QuickUser.findMatchesForJob.
    // The dedup logic in notifyMatchingUsers stays as a defensive backstop but
    // shouldn't be load-bearing anymore.
    const { user: emp } = await createEmployer();
    const job = await createJob(emp, {
      category: 'Teknologji', city: 'Tiranë',
      tags: ['react', 'frontend'],
    });
    job.embedding = {
      vector: vectorAt(21), model: 'text-embedding-3-small', dimensions: 1536,
      generatedAt: new Date(), status: 'completed', retries: 0, error: null,
    };
    await job.save();

    // Two QuickUsers — both would keyword-match (location + interest). But one has
    // a completed embedding (PR-G semantic territory) and the other doesn't.
    const semanticOnly = await QuickUser.create({
      firstName: 'Semantic', lastName: 'Only',
      email: 'semantic-only@example.com',
      location: 'Tiranë',
      interests: ['Teknologji'],
      embedding: {
        vector: vectorAt(21), model: 'text-embedding-3-small', dimensions: 1536,
        generatedAt: new Date(), status: 'completed', error: null,
      },
    });
    const keywordOnly = await QuickUser.create({
      firstName: 'Keyword', lastName: 'Only',
      email: 'keyword-only@example.com',
      location: 'Tiranë',
      interests: ['Teknologji'],
      embedding: { status: 'failed', error: 'parse blew up' },
    });

    // Sanity check: keyword path only returns the user without a completed embedding
    const keywordHits = await QuickUser.findMatchesForJob(job);
    expect(keywordHits.map(u => u.email).sort()).toEqual(['keyword-only@example.com']);

    // End-to-end: notifyMatchingUsers reaches both users but via different paths
    const r = await notificationService.notifyMatchingUsers(job);
    expect(r.success).toBe(true);
    expect(r.stats.breakdown.quickUsers).toBe(2); // 1 semantic + 1 keyword
    expect(r.stats.breakdown.semanticMatches).toBeGreaterThanOrEqual(1);
    expect(r.stats.breakdown.keywordMatches).toBe(1);

    // Each user notified exactly once (no double-send via the partition)
    const refreshSem = await QuickUser.findById(semanticOnly._id);
    const refreshKey = await QuickUser.findById(keywordOnly._id);
    expect(refreshSem.notificationCount).toBe(1);
    expect(refreshKey.notificationCount).toBe(1);
  });

  it('deduplicates QuickUsers found by both semantic and keyword matching', async () => {
    const { user: emp } = await createEmployer();
    const job = await createJob(emp, {
      category: 'Teknologji', city: 'Tiranë',
      tags: ['react', 'frontend', 'remote'],
    });
    job.embedding = {
      vector: vectorAt(9), model: 'text-embedding-3-small', dimensions: 1536,
      generatedAt: new Date(), status: 'completed', retries: 0, error: null,
    };
    await job.save();

    // Same QuickUser matches BOTH paths (semantic by vector, keyword by city+interest)
    const qu = await QuickUser.create({
      firstName: 'Dedup', lastName: 'User',
      email: 'dedup@example.com',
      location: 'Tiranë',
      interests: ['Teknologji'],
      embedding: {
        vector: vectorAt(9), model: 'text-embedding-3-small', dimensions: 1536,
        generatedAt: new Date(), status: 'completed', error: null,
      },
    });

    const r = await notificationService.notifyMatchingUsers(job);
    expect(r.success).toBe(true);
    // Should only count user ONCE, not twice
    expect(r.stats.totalUsers).toBe(1);
    expect(r.stats.notificationsSent).toBe(1);

    // Refreshed user only got ONE notification
    const refreshed = await QuickUser.findById(qu._id);
    expect(refreshed.notificationCount).toBe(1);
  });

  it('counts errors when sendJobNotificationToUser rejects', async () => {
    const { user: emp } = await createEmployer();
    const job = await createJob(emp, { category: 'Teknologji', city: 'Tiranë' });
    job.embedding = {
      vector: vectorAt(11), model: 'text-embedding-3-small', dimensions: 1536,
      generatedAt: new Date(), status: 'completed', retries: 0, error: null,
    };
    await job.save();

    await QuickUser.create({
      firstName: 'Err', lastName: 'User',
      email: 'err@example.com', location: 'Tiranë',
      interests: ['Teknologji'],
      embedding: {
        vector: vectorAt(11), model: 'text-embedding-3-small', dimensions: 1536,
        generatedAt: new Date(), status: 'completed', error: null,
      },
    });

    // Force send to reject
    const original = notificationService.sendJobNotificationToUser;
    notificationService.sendJobNotificationToUser = async () => {
      throw new Error('SMTP down');
    };
    try {
      const r = await notificationService.notifyMatchingUsers(job);
      expect(r.success).toBe(true); // outer try succeeds even if individual sends fail
      expect(r.stats.errors).toBeGreaterThanOrEqual(1);
    } finally {
      notificationService.sendJobNotificationToUser = original;
    }
  });

  it('returns success:false with error when DB load fails', async () => {
    // Pass a bad job whose findById throws
    const original = Job.findById;
    Job.findById = () => ({
      select: () => ({
        populate: () => Promise.reject(new Error('DB connection lost')),
      }),
    });
    try {
      const r = await notificationService.notifyMatchingUsers({ _id: 'bogus' });
      expect(r.success).toBe(false);
      expect(r.error).toMatch(/DB connection lost/);
      expect(r.stats.errors).toBe(1);
    } finally {
      Job.findById = original;
    }
  });
});

describe('notificationService.notifyUserAboutMatchingJobs', () => {
  beforeAll(async () => {
    await connectTestDB();
    emailService.isConfigured = false;
    resendEmailService.enabled = false;
  });

  afterEach(async () => {
    await clearTestDB();
  });

  afterAll(async () => {
    await closeTestDB();
  });

  it('returns matchCount=0 when QuickUser has no embedding', async () => {
    const qu = await QuickUser.create({
      firstName: 'No', lastName: 'Embed',
      email: 'no-embed@example.com',
      location: 'Tiranë', interests: ['Teknologji'],
    });

    const r = await notificationService.notifyUserAboutMatchingJobs({
      type: 'quickuser', userId: qu._id,
    });
    expect(r.success).toBe(true);
    expect(r.matchCount).toBe(0);
    expect(r.message).toMatch(/No embedding/i);
  });

  it('returns matchCount=0 when QuickUser does not exist', async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const r = await notificationService.notifyUserAboutMatchingJobs({
      type: 'quickuser', userId: fakeId,
    });
    expect(r.success).toBe(true);
    expect(r.matchCount).toBe(0);
  });

  it('returns matchCount=0 when JobSeeker has no embedding', async () => {
    const { user: js } = await createJobseeker();
    const r = await notificationService.notifyUserAboutMatchingJobs({
      type: 'jobseeker', userId: js._id,
    });
    expect(r.success).toBe(true);
    expect(r.matchCount).toBe(0);
  });

  it('returns matchCount=0 when no matching jobs found', async () => {
    const qu = await QuickUser.create({
      firstName: 'Lonely', lastName: 'User',
      email: 'lonely@example.com',
      location: 'Tiranë', interests: ['Teknologji'],
      embedding: {
        vector: vectorAt(13), model: 'text-embedding-3-small', dimensions: 1536,
        generatedAt: new Date(), status: 'completed', error: null,
      },
    });

    const r = await notificationService.notifyUserAboutMatchingJobs({
      type: 'quickuser', userId: qu._id,
    });
    expect(r.success).toBe(true);
    expect(r.matchCount).toBe(0);
    expect(r.message).toMatch(/No matching jobs/i);
  });

  it('sends digest email when QuickUser matches existing jobs', async () => {
    const { user: emp } = await createEmployer();
    const job = await createJob(emp, { category: 'Teknologji', city: 'Tiranë' });
    job.embedding = {
      vector: vectorAt(15), model: 'text-embedding-3-small', dimensions: 1536,
      generatedAt: new Date(), status: 'completed', retries: 0, error: null,
    };
    await job.save();

    const qu = await QuickUser.create({
      firstName: 'Match', lastName: 'Maker',
      email: 'matcher@example.com',
      location: 'Tiranë', interests: ['Teknologji'],
      embedding: {
        vector: vectorAt(15), model: 'text-embedding-3-small', dimensions: 1536,
        generatedAt: new Date(), status: 'completed', error: null,
      },
    });

    const r = await notificationService.notifyUserAboutMatchingJobs({
      type: 'quickuser', userId: qu._id,
    });
    expect(r.matchCount).toBeGreaterThanOrEqual(1);
    expect(r.email).toBe('matcher@example.com');
  });

  it('sends digest email when JobSeeker matches existing jobs', async () => {
    const { user: emp } = await createEmployer();
    const job = await createJob(emp, { category: 'Marketing', city: 'Vlorë' });
    job.embedding = {
      vector: vectorAt(17), model: 'text-embedding-3-small', dimensions: 1536,
      generatedAt: new Date(), status: 'completed', retries: 0, error: null,
    };
    await job.save();

    const { user: js } = await createJobseeker();
    js.profile.jobSeekerProfile = js.profile.jobSeekerProfile || {};
    js.profile.jobSeekerProfile.embedding = {
      vector: vectorAt(17), model: 'text-embedding-3-small', dimensions: 1536,
      generatedAt: new Date(), status: 'completed', error: null,
    };
    js.profile.location = { city: 'Vlorë' };
    await js.save();

    const r = await notificationService.notifyUserAboutMatchingJobs({
      type: 'jobseeker', userId: js._id,
    });
    expect(r.matchCount).toBeGreaterThanOrEqual(1);
    expect(r.email).toBe(js.email);
  });

  it('returns success:false when an unexpected error occurs', async () => {
    const original = userEmbeddingService.findMatchingJobsForUser;
    userEmbeddingService.findMatchingJobsForUser = async () => {
      throw new Error('vector store offline');
    };
    try {
      const qu = await QuickUser.create({
        firstName: 'X', lastName: 'Y',
        email: 'err-path@example.com',
        location: 'Tiranë', interests: ['Teknologji'],
        embedding: {
          vector: vectorAt(19), model: 'text-embedding-3-small', dimensions: 1536,
          generatedAt: new Date(), status: 'completed', error: null,
        },
      });
      const r = await notificationService.notifyUserAboutMatchingJobs({
        type: 'quickuser', userId: qu._id,
      });
      expect(r.success).toBe(false);
      expect(r.error).toMatch(/vector store offline/);
      expect(r.matchCount).toBe(0);
    } finally {
      userEmbeddingService.findMatchingJobsForUser = original;
    }
  });
});
