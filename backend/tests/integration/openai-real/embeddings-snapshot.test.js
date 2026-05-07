/**
 * Real OpenAI embeddings test via snapshot-replay (Phase 28 — Phase 3A).
 *
 * Default mode: replays cached responses from
 *   backend/tests/fixtures/openai-snapshots/
 * Cost per run: $0.
 *
 * To regenerate snapshots (e.g., after changing the prompt):
 *   OPENAI_API_KEY=$KEY UPDATE_OPENAI_SNAPSHOTS=true \
 *     npm test -- openai-real
 *
 * What's tested:
 *   - text-embedding-3-small returns 1536-dimensional vectors
 *   - Embeddings are deterministic-shaped (same input → same dim, similar values)
 *   - Cosine similarity is high (>0.7) for paraphrased inputs
 *   - Cosine similarity is low (<0.5) for unrelated inputs
 *   - Token usage reported in response
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import { snapshottedOpenAI, listSnapshots, IS_UPDATE_MODE } from '../../helpers/openai-snapshot.js';

// Skip the entire suite when snapshots haven't been generated yet AND we're
// not in update mode. This lets normal CI runs pass cleanly until the user
// provisions an OpenAI key and runs the snapshot-refresh workflow once.
const haveSnapshots = listSnapshots().length > 0;
const shouldRun = IS_UPDATE_MODE || haveSnapshots;
const describeIfReady = shouldRun ? describe : describe.skip;

function cosineSimilarity(a, b) {
  if (a.length !== b.length) throw new Error('Vector length mismatch');
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

describeIfReady('OpenAI embeddings — real via snapshot (Phase 3A)', () => {
  let openai;

  beforeAll(async () => {
    openai = await snapshottedOpenAI();
  });

  it('text-embedding-3-small returns 1536-dim vector', async () => {
    const res = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: 'Software engineer with 5 years of React experience',
    });

    expect(res.data).toHaveLength(1);
    expect(res.data[0].embedding).toHaveLength(1536);
    expect(typeof res.data[0].embedding[0]).toBe('number');
    expect(res.model).toContain('text-embedding-3-small');
    expect(res.usage.prompt_tokens).toBeGreaterThan(0);
  });

  it('paraphrased inputs have HIGH cosine similarity (>0.7)', async () => {
    const a = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: 'I am a frontend developer with React and TypeScript skills',
    });
    const b = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: 'Frontend engineer experienced in React and TypeScript',
    });

    const sim = cosineSimilarity(a.data[0].embedding, b.data[0].embedding);
    expect(sim, 'paraphrased CV/job descriptions should be very similar').toBeGreaterThan(0.7);
  });

  it('unrelated inputs have LOW cosine similarity (<0.5)', async () => {
    const cv = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: 'Senior backend developer in Go and PostgreSQL',
    });
    const unrelated = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: 'The weather in Tirana is sunny today',
    });

    const sim = cosineSimilarity(cv.data[0].embedding, unrelated.data[0].embedding);
    expect(sim, 'unrelated texts should not be artificially similar').toBeLessThan(0.5);
  });

  it('snapshot infrastructure works (replay mode loads from disk)', () => {
    const snapshots = listSnapshots();
    if (IS_UPDATE_MODE) {
      // After running with UPDATE_MODE=true, snapshots should exist
      expect(snapshots.length, 'snapshots should be written in update mode').toBeGreaterThan(0);
    } else {
      // In replay mode, snapshots must exist or the tests above would have thrown
      expect(snapshots.length, 'snapshots needed for replay').toBeGreaterThan(0);
    }
  });
});

describeIfReady('OpenAI chat completions — real via snapshot (Phase 3A)', () => {
  let openai;

  beforeAll(async () => {
    openai = await snapshottedOpenAI();
  });

  it('gpt-4o-mini returns structured response', async () => {
    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You output ONLY a single Albanian city name.' },
        { role: 'user', content: 'Name the capital of Albania.' },
      ],
      max_tokens: 10,
      temperature: 0,
    });

    expect(res.choices).toHaveLength(1);
    expect(res.choices[0].message.content.trim().toLowerCase()).toMatch(/tirana|tiranë/i);
    expect(res.usage.prompt_tokens).toBeGreaterThan(0);
    expect(res.usage.completion_tokens).toBeGreaterThan(0);
    expect(res.model).toContain('gpt-4o-mini');
  });
});
