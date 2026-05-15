/**
 * Verifies the "embedded at mutation" contract — every create/update path
 * that touches an embedding-relevant field fires the centralized helper
 * `fireEmbedding` from services/embeddingTrigger.js.
 *
 * Coverage:
 *   1. Job create kicks job embedding with reason 'create'
 *   2. Job renew (G1) kicks job embedding with reason 'renew'
 *   3. Profile update with embedding-relevant fields fires generation
 *   4. Profile update with ONLY filter-only fields does NOT fire generation
 *   5. parseQuickUserCV auto-fires embedding (default) — closes G2
 *   6. parseQuickUserCV with {fireEmbeddingAfter: false} does NOT fire
 *   7. fireEmbedding with unknown kind logs warning, doesn't throw
 *   8. fireEmbedding with missing id logs warning, doesn't throw
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, jest } from '@jest/globals';
import request from 'supertest';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createJobseeker, createEmployer } from '../factories/user.factory.js';
import { createJob, createClosedJob } from '../factories/job.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import jobEmbeddingService from '../../src/services/jobEmbeddingService.js';
import userEmbeddingService from '../../src/services/userEmbeddingService.js';
import { fireEmbedding } from '../../src/services/embeddingTrigger.js';
import { parseQuickUserCV, _setOpenAIClient } from '../../src/services/cvParsingService.js';
import QuickUser from '../../src/models/QuickUser.js';
import logger from '../../src/config/logger.js';
import { makeOpenAIStub } from '../helpers/openai-stub.js';

async function makeDocx(text = 'Senior Frontend Engineer with 4 years of React, TypeScript, and Next.js experience.') {
  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({ children: [new TextRun(text)] }),
        new Paragraph({ children: [new TextRun('Skills: React, TypeScript, Next.js, Tailwind.')] }),
      ],
    }],
  });
  return Packer.toBuffer(doc);
}

async function flushImmediate() {
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setImmediate(() => setImmediate(r)));
  }
}

describe('Embedded by construction — fireEmbedding contract', () => {
  beforeAll(async () => {
    await connectTestDB();
    await seedLocations();
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    _setOpenAIClient(null);
    await clearTestDB();
    await seedLocations();
  });
  afterAll(async () => { await closeTestDB(); });

  describe('Job paths', () => {
    it('POST /api/jobs kicks job embedding with reason=create', async () => {
      const spy = jest.spyOn(jobEmbeddingService, 'queueEmbeddingGeneration').mockResolvedValue({});
      const { user: emp } = await createEmployer();

      const r = await request(app)
        .post('/api/jobs')
        .set(createAuthHeaders(emp))
        .send({
          title: 'Backend Engineer',
          description: 'Build APIs with Node.js and MongoDB. Strong experience required.',
          requirements: ['3+ years Node.js', 'MongoDB experience'],
          location: { city: 'Tiranë', remote: false, remoteType: 'none' },
          jobType: 'full-time',
          category: 'Teknologji',
          seniority: 'mid',
          salary: { min: 1000, max: 2000, currency: 'EUR', negotiable: true, showPublic: true },
          platformCategories: { diaspora: false, ngaShtepia: false, partTime: false, administrata: false, sezonale: false },
        });

      expect([200, 201]).toContain(r.status);
      await flushImmediate();

      expect(spy).toHaveBeenCalled();
      const args = spy.mock.calls[0];
      // signature: queueEmbeddingGeneration(jobId, priority, extraMetadata)
      expect(args[2]).toMatchObject({ reason: 'create' });
    }, 15000);

    it('POST /api/jobs/:id/renew kicks job embedding with reason=renew (G1)', async () => {
      const { user: emp } = await createEmployer();
      const job = await createClosedJob(emp);

      const spy = jest.spyOn(jobEmbeddingService, 'queueEmbeddingGeneration').mockResolvedValue({});

      const r = await request(app)
        .post(`/api/jobs/${job._id}/renew`)
        .set(createAuthHeaders(emp));

      expect(r.status).toBe(200);
      await flushImmediate();

      expect(spy).toHaveBeenCalled();
      const renewCall = spy.mock.calls.find(c => c[2]?.reason === 'renew');
      expect(renewCall).toBeDefined();
      expect(String(renewCall[0])).toBe(String(job._id));
    });
  });

  describe('Jobseeker paths', () => {
    it('PUT /api/users/profile with title change fires jobseeker embedding', async () => {
      const spy = jest.spyOn(userEmbeddingService, 'generateJobSeekerEmbedding').mockResolvedValue([0.1, 0.2]);
      const { user: js } = await createJobseeker();

      const r = await request(app)
        .put('/api/users/profile')
        .set(createAuthHeaders(js))
        .send({ jobSeekerProfile: { title: 'Senior Backend Engineer' } });

      expect(r.status).toBe(200);
      await flushImmediate();

      expect(spy).toHaveBeenCalledWith(expect.anything());
      expect(String(spy.mock.calls[0][0])).toBe(String(js._id));
    });

    it('PUT /api/users/profile with ONLY non-embedding fields does NOT fire embedding', async () => {
      const spy = jest.spyOn(userEmbeddingService, 'generateJobSeekerEmbedding').mockResolvedValue([0.1]);
      const { user: js } = await createJobseeker();

      // Only mutate phone (not embedding-relevant per the contract)
      const r = await request(app)
        .put('/api/users/profile')
        .set(createAuthHeaders(js))
        .send({ phone: '+355691234567' });

      expect(r.status).toBe(200);
      await flushImmediate();

      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('QuickUser CV parse (G2)', () => {
    it('parseQuickUserCV SUCCESS path auto-fires embedding (G2 fix)', async () => {
      const spy = jest.spyOn(userEmbeddingService, 'generateQuickUserEmbedding').mockResolvedValue([0.1]);

      // Real DOCX + stubbed OpenAI so extractTextFromCV succeeds, parseWithAI
      // returns deterministic data, parsedCV.status flips to 'completed', and
      // the success-path fireEmbedding call inside parseQuickUserCV runs.
      _setOpenAIClient(makeOpenAIStub({ cv: {
        title: 'Frontend Engineer',
        skills: ['React', 'TypeScript'],
        experience: '2-5 vjet',
        industries: ['Teknologji'],
        summary: 'Frontend engineer.',
        education: 'BSc',
        languages: ['English'],
      } }));

      const qu = await QuickUser.create({
        firstName: 'Test', lastName: 'User',
        email: 'cvtest-success@example.com',
        location: 'Tiranë',
        interests: ['Teknologji'],
      });

      const docx = await makeDocx();
      const result = await parseQuickUserCV(qu._id, docx);
      await flushImmediate();

      expect(result).toBeTruthy();
      expect(result.title).toBe('Frontend Engineer');
      expect(spy).toHaveBeenCalled();
      expect(String(spy.mock.calls[0][0])).toBe(String(qu._id));
    });

    it('parseQuickUserCV SUCCESS path with fireEmbeddingAfter:false does NOT fire', async () => {
      const spy = jest.spyOn(userEmbeddingService, 'generateQuickUserEmbedding').mockResolvedValue([0.1]);

      _setOpenAIClient(makeOpenAIStub({ cv: {
        title: 'Marketing Manager',
        skills: ['SEO', 'Content'],
        experience: '2-5 vjet',
        industries: ['Marketing'],
        summary: 'Marketing pro.',
        education: 'BA',
        languages: ['English'],
      } }));

      const qu = await QuickUser.create({
        firstName: 'OptOut', lastName: 'Test',
        email: 'optout-success@example.com',
        location: 'Tiranë',
        interests: ['Marketing'],
      });

      const docx = await makeDocx('Marketing manager with SEO + content expertise.');
      const result = await parseQuickUserCV(qu._id, docx, { fireEmbeddingAfter: false });
      await flushImmediate();

      expect(result).toBeTruthy();
      expect(result.title).toBe('Marketing Manager');
      expect(spy).not.toHaveBeenCalled();
    });

    it('parseQuickUserCV FAILURE path (bogus buffer) does NOT fire', async () => {
      const spy = jest.spyOn(userEmbeddingService, 'generateQuickUserEmbedding').mockResolvedValue([0.1]);

      const qu = await QuickUser.create({
        firstName: 'Fail', lastName: 'Test',
        email: 'cvtest-fail@example.com',
        location: 'Tiranë',
        interests: ['Teknologji'],
      });

      const result = await parseQuickUserCV(qu._id, Buffer.from('xx'));
      await flushImmediate();

      expect(result).toBeNull();
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('fireEmbedding helper hardening', () => {
    it('logs warning and does not throw on unknown kind', async () => {
      const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});

      expect(() => fireEmbedding({ kind: 'orca', id: 'abc123', reason: 'test' })).not.toThrow();
      await flushImmediate();

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringMatching(/unknown kind/),
        expect.objectContaining({ kind: 'orca' })
      );
    });

    it('logs warning and does not throw on missing id', async () => {
      const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});

      expect(() => fireEmbedding({ kind: 'job', id: null, reason: 'test' })).not.toThrow();
      await flushImmediate();

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringMatching(/missing id/),
        expect.objectContaining({ kind: 'job' })
      );
    });
  });
});
