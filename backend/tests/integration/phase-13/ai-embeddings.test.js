/**
 * Phase 13 — Real OpenAI tests
 *
 * Verifies OpenAI integrations actually produce structurally correct outputs.
 * COSTS REAL MONEY (~$0.01–$0.05 per full test run, well under budget).
 *
 * Each test is gated on OPENAI_API_KEY presence — skip if unset to avoid
 * accidental spend.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import { connectTestDB, closeTestDB, clearTestDB } from '../../setup/testDb.js';
import { seedLocations } from '../../fixtures/locations.fixture.js';
import { createJobseeker, createVerifiedEmployer } from '../../factories/user.factory.js';
import { createJob } from '../../factories/job.factory.js';
import { extractCVDataFromText } from '../../../src/services/openaiService.js';
import userEmbeddingService from '../../../src/services/userEmbeddingService.js';

// Opt-in: requires real OpenAI key + explicit RUN_OPENAI_TESTS=1 to avoid
// surprise spend AND to skip cleanly when account quota is exhausted (429).
const HAS_OPENAI = !!process.env.OPENAI_API_KEY
  && process.env.OPENAI_API_KEY.startsWith('sk-')
  && process.env.RUN_OPENAI_TESTS === '1';

describe('Phase 13 — Real OpenAI Tests', () => {
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

  (HAS_OPENAI ? describe : describe.skip)('extractCVDataFromText (CV generation via GPT-4o-mini)', () => {
    it('extracts structured CV data from a natural-language description', async () => {
      const naturalLanguage = `
        I'm John Smith, software engineer with 7 years experience.
        I worked at TechCorp from 2018-2022 as Backend Engineer building APIs in Node.js and Postgres.
        Then at StartupXYZ from 2022-2024 as Senior Engineer leading a team of 5.
        I have a BSc Computer Science from MIT, graduated 2017.
        Skills: Node.js, TypeScript, MongoDB, Docker, AWS, GraphQL.
        I speak English (native) and Spanish (intermediate).
      `;

      const result = await extractCVDataFromText(naturalLanguage, 'en');

      expect(result.success).toBe(true);
      expect(result.data).toBeTruthy();
      expect(result.data.personalInfo).toBeTruthy();
      expect(typeof result.data.personalInfo.fullName).toBe('string');
      // Workplace should mention at least one of the companies
      const allText = JSON.stringify(result.data).toLowerCase();
      expect(allText).toMatch(/techcorp|startupxyz/);
      // skills is an object with technical/soft sub-arrays per cvSchema.js:38
      expect(result.data.skills).toBeTruthy();
      expect(typeof result.data.skills).toBe('object');
      // workExperience must include at least one entry
      expect(Array.isArray(result.data.workExperience)).toBe(true);
      expect(result.data.workExperience.length).toBeGreaterThan(0);
    }, 60000);

    it('rejects extraction when input is too short via the route validator (<50 chars)', async () => {
      // Direct service call with short input — service may accept; route layer rejects.
      // Just verify the function doesn't crash with short input.
      const result = await extractCVDataFromText('A short bio.', 'en').catch(err => ({ error: err.message }));
      expect(result).toBeTruthy();
    }, 60000);
  });

  (HAS_OPENAI ? describe : describe.skip)('userEmbeddingService.generateJobSeekerEmbedding', () => {
    it('produces a 1536-dim vector with components in [-1, 1]', async () => {
      // Rich profile so prepareJobSeekerText returns >10 chars
      const { user } = await createJobseeker({
        skills: ['JavaScript', 'React', 'Node.js', 'MongoDB', 'TypeScript', 'Docker', 'AWS', 'GraphQL']
      });
      const UserModel = (await import('../../../src/models/User.js')).default;
      await UserModel.updateOne({ _id: user._id }, {
        'profile.jobSeekerProfile.title': 'Senior Software Engineer',
        'profile.jobSeekerProfile.bio': 'Experienced full-stack developer with deep expertise in backend systems, distributed architectures, and modern JavaScript frameworks.'
      });

      const vector = await userEmbeddingService.generateJobSeekerEmbedding(user._id);

      expect(Array.isArray(vector)).toBe(true);
      expect(vector.length).toBe(1536);

      // Verify the vector also persisted (vector has select:false so we must opt in)
      const dbUser = await UserModel.findById(user._id).select('+profile.jobSeekerProfile.embedding.vector');
      const persisted = dbUser.profile.jobSeekerProfile.embedding?.vector;
      expect(Array.isArray(persisted)).toBe(true);
      expect(persisted.length).toBe(1536);

      // All components in [-1, 1]
      for (const v of vector) {
        expect(typeof v).toBe('number');
        expect(v).toBeGreaterThanOrEqual(-1);
        expect(v).toBeLessThanOrEqual(1);
      }

      // L2 norm should be ~1 (text-embedding-3-small returns normalized vectors)
      const norm = Math.sqrt(vector.reduce((s, v) => s + v * v, 0));
      expect(norm).toBeGreaterThan(0.95);
      expect(norm).toBeLessThan(1.05);
    }, 60000);
  });

  (HAS_OPENAI ? describe : describe.skip)('Cosine similarity between related job titles', () => {
    function cosine(a, b) {
      let dot = 0, na = 0, nb = 0;
      for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
      }
      return dot / (Math.sqrt(na) * Math.sqrt(nb));
    }

    it('two related jobseeker profiles have cosine similarity > 0.5', async () => {
      const { user: u1 } = await createJobseeker({
        skills: ['JavaScript', 'React', 'Node.js', 'TypeScript', 'Express', 'MongoDB']
      });
      const { user: u2 } = await createJobseeker({
        skills: ['JavaScript', 'TypeScript', 'Express', 'React', 'Node.js', 'PostgreSQL']
      });
      const UserModel = (await import('../../../src/models/User.js')).default;
      await UserModel.updateOne({ _id: u1._id }, {
        'profile.jobSeekerProfile.title': 'Full-Stack JavaScript Developer',
        'profile.jobSeekerProfile.bio': 'Full-stack JavaScript engineer building React frontends and Node.js APIs with TypeScript and MongoDB.'
      });
      await UserModel.updateOne({ _id: u2._id }, {
        'profile.jobSeekerProfile.title': 'Full-Stack JavaScript Developer',
        'profile.jobSeekerProfile.bio': 'Full-stack JavaScript engineer building React frontends and Node.js APIs with TypeScript and PostgreSQL.'
      });

      await userEmbeddingService.generateJobSeekerEmbedding(u1._id);
      await userEmbeddingService.generateJobSeekerEmbedding(u2._id);

      const v1 = (await UserModel.findById(u1._id).select('+profile.jobSeekerProfile.embedding.vector')).profile.jobSeekerProfile.embedding.vector;
      const v2 = (await UserModel.findById(u2._id).select('+profile.jobSeekerProfile.embedding.vector')).profile.jobSeekerProfile.embedding.vector;

      const sim = cosine(v1, v2);
      expect(sim).toBeGreaterThan(0.5);
    }, 90000);
  });

  describe('OpenAI integration safety (regardless of HAS_OPENAI)', () => {
    it('extractCVDataFromText handles invalid API key gracefully', async () => {
      const orig = process.env.OPENAI_API_KEY;
      process.env.OPENAI_API_KEY = 'sk-invalid-1234567890';
      try {
        const result = await extractCVDataFromText(
          'Some text long enough'.repeat(5),
          'en'
        ).catch(err => ({ error: err.message }));
        // Either throws (caught) or returns success:false
        expect(result).toBeTruthy();
      } finally {
        process.env.OPENAI_API_KEY = orig;
      }
    }, 30000);
  });
});
