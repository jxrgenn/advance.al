/**
 * End-to-end QuickUser signup → parse → embed pipeline tests.
 *
 * Three scenarios:
 *   1. With CV (real DOCX + stubbed OpenAI) → parse completes → embed reads
 *      parsed CV data (not interests-only).
 *   2. Without CV → no parse → embed runs from interests-only text.
 *   3. With CV but parse throws → parsedCV.status='failed' → embed still
 *      completes (falls back to interests text).
 *
 * The whole pipeline runs in a setImmediate after the HTTP response, so we
 * flush the event loop a few times before asserting.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, jest } from '@jest/globals';
import request from 'supertest';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import QuickUser from '../../src/models/QuickUser.js';
import jobEmbeddingService from '../../src/services/jobEmbeddingService.js';
import { _setOpenAIClient } from '../../src/services/cvParsingService.js';
import { makeOpenAIStub } from '../helpers/openai-stub.js';

// Poll the QuickUser until its embedding.status changes from 'pending' OR
// timeout. The chained setImmediate (parse → embed → notify) takes a few
// hundred ms in practice because of the real DOCX extraction + stubbed
// OpenAI calls.
async function waitForPipelineComplete(quickUserId, timeoutMs = 6000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const qu = await QuickUser.findById(quickUserId).select('parsedCV embedding');
    if (qu?.embedding?.status === 'completed' || qu?.embedding?.status === 'failed') return;
    await new Promise(r => setTimeout(r, 50));
  }
  throw new Error(`Pipeline didn't complete within ${timeoutMs}ms for ${quickUserId}`);
}

async function makeDocx(text = 'Senior Software Engineer with 6 years experience in React, Node.js, TypeScript, and AWS.') {
  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({ children: [new TextRun(text)] }),
        new Paragraph({ children: [new TextRun('Skills: React, Node.js, TypeScript, AWS, PostgreSQL.')] }),
      ],
    }],
  });
  return Packer.toBuffer(doc);
}

const FAKE_VECTOR = Array.from({ length: 1024 }, (_, i) => Math.cos(i / 50));
let openAISpy;

describe('QuickUser CV pipeline — signup → parse → embed', () => {
  const ORIGINAL_OPENAI_KEY = process.env.OPENAI_API_KEY;
  const ORIGINAL_EMBED_MODEL = process.env.OPENAI_EMBEDDING_MODEL;
  const ORIGINAL_EMBED_DIMS = process.env.OPENAI_EMBEDDING_DIMS;

  beforeAll(async () => {
    await connectTestDB();
    process.env.OPENAI_API_KEY = 'sk-test-stub';
    // Stub the embedding-side OpenAI call (jobEmbeddingService.callOpenAIWithRetry)
    // so we don't make real network requests for the vector.
    openAISpy = jest.spyOn(jobEmbeddingService, 'callOpenAIWithRetry').mockResolvedValue(FAKE_VECTOR);
  });

  afterEach(async () => {
    _setOpenAIClient(null);
    await clearTestDB();
  });

  afterAll(async () => {
    if (ORIGINAL_OPENAI_KEY === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = ORIGINAL_OPENAI_KEY;
    if (ORIGINAL_EMBED_MODEL === undefined) delete process.env.OPENAI_EMBEDDING_MODEL;
    else process.env.OPENAI_EMBEDDING_MODEL = ORIGINAL_EMBED_MODEL;
    if (ORIGINAL_EMBED_DIMS === undefined) delete process.env.OPENAI_EMBEDDING_DIMS;
    else process.env.OPENAI_EMBEDDING_DIMS = ORIGINAL_EMBED_DIMS;
    openAISpy?.mockRestore();
    await closeTestDB();
  });

  it('signup WITH CV → parsedCV completed AND embedding completed (parse runs before embed)', async () => {
    _setOpenAIClient(makeOpenAIStub({ cv: {
      title: 'Senior Software Engineer',
      skills: ['React', 'Node.js'],
      experience: '5-10 vjet',
      industries: ['Teknologji'],
      summary: 'Experienced full-stack developer.',
      education: 'Bachelor in CS',
      languages: ['Shqip', 'English'],
    } }));

    const docx = await makeDocx();
    const r = await request(app)
      .post('/api/quickusers')
      .field('firstName', 'Erion')
      .field('lastName', 'Basha')
      .field('email', 'qu-cv-success@example.com')
      .field('location', 'Tiranë')
      .field('interests', JSON.stringify(['Teknologji']))
      .attach('resume', docx, { filename: 'cv.docx', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });

    expect(r.status).toBe(201);
    await waitForPipelineComplete(r.body.data.id);

    const qu = await QuickUser.findById(r.body.data.id).select('+embedding.vector');
    expect(qu.parsedCV?.status).toBe('completed');
    expect(qu.parsedCV?.title).toBe('Senior Software Engineer');
    expect(qu.parsedCV?.skills).toEqual(expect.arrayContaining(['React', 'Node.js']));
    expect(qu.embedding?.status).toBe('completed');
    expect(qu.embedding?.vector?.length).toBe(FAKE_VECTOR.length);
  }, 30000);

  it('signup WITHOUT CV → parsedCV stays pending (default), embedding still completes from interests', async () => {
    const r = await request(app)
      .post('/api/quickusers')
      .send({
        firstName: 'NoCv',
        lastName: 'User',
        email: 'qu-no-cv@example.com',
        location: 'Tiranë',
        interests: ['Teknologji'],
      });

    expect(r.status).toBe(201);
    await waitForPipelineComplete(r.body.data.id);

    const qu = await QuickUser.findById(r.body.data.id).select('+embedding.vector');
    // No CV uploaded → parse was never called → default status 'pending' persists
    expect(qu.parsedCV?.status).toBe('pending');
    // Embedding still ran from interests-only text
    expect(qu.embedding?.status).toBe('completed');
    expect(qu.embedding?.vector?.length).toBe(FAKE_VECTOR.length);
  }, 30000);

  it('signup WITH CV but parse throws → parsedCV failed, embedding still completes from interests', async () => {
    // Stub OpenAI to throw inside parseWithAI
    _setOpenAIClient(makeOpenAIStub({ throwOnCompletion: new Error('Simulated OpenAI rate limit') }));

    const docx = await makeDocx();
    const r = await request(app)
      .post('/api/quickusers')
      .field('firstName', 'ParseFail')
      .field('lastName', 'User')
      .field('email', 'qu-cv-fail@example.com')
      .field('location', 'Durrës')
      .field('interests', JSON.stringify(['Marketing']))
      .attach('resume', docx, { filename: 'cv.docx', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });

    expect(r.status).toBe(201);
    await waitForPipelineComplete(r.body.data.id);

    const qu = await QuickUser.findById(r.body.data.id).select('+embedding.vector');
    expect(qu.parsedCV?.status).toBe('failed');
    expect(qu.parsedCV?.error).toBeTruthy();
    // Embedding STILL completes — interests-only fallback
    expect(qu.embedding?.status).toBe('completed');
    expect(qu.embedding?.vector?.length).toBe(FAKE_VECTOR.length);
  }, 30000);
});
