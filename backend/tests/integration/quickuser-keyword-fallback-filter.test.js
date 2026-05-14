/**
 * Verifies that QuickUser.findMatchesForJob now skips QuickUsers with a
 * completed embedding. After PR-G the keyword path is a FALLBACK only:
 * users with completed embeddings are handled by the semantic path
 * (userEmbeddingService.findSemanticMatchesForJob); the keyword path is
 * for users still in the embedding pipeline or who never uploaded a CV.
 *
 * Tests build on the same fixtures as notify-matching-users.test.js.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { createEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import QuickUser from '../../src/models/QuickUser.js';

function vectorAt(axis = 0) {
  const v = new Array(1536).fill(0.001);
  v[axis] = 1;
  return v;
}

async function buildJob(opts = {}) {
  const { user: emp } = await createEmployer();
  return createJob(emp, {
    category: 'Teknologji',
    city: 'Tiranë',
    tags: ['react', 'frontend'],
    ...opts,
  });
}

const baseQuickUser = (over = {}) => ({
  firstName: 'Kandidat',
  lastName: 'Test',
  location: 'Tiranë',
  interests: ['Teknologji'],
  preferences: { emailFrequency: 'immediate' },
  ...over,
});

describe('QuickUser.findMatchesForJob — embedding.status partition', () => {
  beforeAll(async () => { await connectTestDB(); });
  afterEach(async () => { await clearTestDB(); });
  afterAll(async () => { await closeTestDB(); });

  it('EXCLUDES QuickUsers with embedding.status=completed (handled by semantic path)', async () => {
    const job = await buildJob();
    await QuickUser.create(baseQuickUser({
      email: 'completed-embed@example.com',
      embedding: {
        vector: vectorAt(5),
        model: 'text-embedding-3-small',
        dimensions: 1536,
        generatedAt: new Date(),
        status: 'completed',
      },
    }));

    const matches = await QuickUser.findMatchesForJob(job);
    const emails = matches.map(m => m.email);
    expect(emails).not.toContain('completed-embed@example.com');
  });

  it('INCLUDES QuickUsers with embedding.status=failed (keyword fallback path)', async () => {
    const job = await buildJob();
    await QuickUser.create(baseQuickUser({
      email: 'failed-embed@example.com',
      embedding: {
        vector: [],
        status: 'failed',
        error: 'OpenAI rate limit',
      },
    }));

    const matches = await QuickUser.findMatchesForJob(job);
    expect(matches.map(m => m.email)).toContain('failed-embed@example.com');
  });

  it('INCLUDES QuickUsers with embedding.status=pending', async () => {
    const job = await buildJob();
    await QuickUser.create(baseQuickUser({
      email: 'pending-embed@example.com',
      embedding: { status: 'pending' },
    }));

    const matches = await QuickUser.findMatchesForJob(job);
    expect(matches.map(m => m.email)).toContain('pending-embed@example.com');
  });

  it('INCLUDES QuickUsers with no embedding subdocument at all', async () => {
    // Direct insert via collection so we can omit the embedding field entirely
    // (Mongoose would otherwise apply schema defaults).
    const job = await buildJob();
    await QuickUser.collection.insertOne({
      ...baseQuickUser({ email: 'no-embed-field@example.com' }),
      isActive: true,
      convertedToFullUser: false,
      unsubscribeToken: 'no-embed-token-' + Date.now(),
      allInterests: ['Teknologji'],
      // intentionally NO `embedding` key
    });

    const matches = await QuickUser.findMatchesForJob(job);
    expect(matches.map(m => m.email)).toContain('no-embed-field@example.com');
  });

  it('partition is clean: one user can never be returned by both paths', async () => {
    // Two QuickUsers — same location, same interests. One has completed
    // embedding, the other has failed. Only the failed one should appear
    // in the keyword (fallback) path; the completed one is the semantic path's
    // territory.
    const job = await buildJob();
    await QuickUser.create(baseQuickUser({
      email: 'qu-completed@example.com',
      embedding: { vector: vectorAt(5), status: 'completed', dimensions: 1536, model: 'text-embedding-3-small', generatedAt: new Date() },
    }));
    await QuickUser.create(baseQuickUser({
      email: 'qu-failed@example.com',
      embedding: { status: 'failed', error: 'parse failure' },
    }));

    const matches = await QuickUser.findMatchesForJob(job);
    const emails = matches.map(m => m.email);
    expect(emails).toContain('qu-failed@example.com');
    expect(emails).not.toContain('qu-completed@example.com');
  });
});
