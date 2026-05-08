/**
 * Phase 28 — coverage push for cvParsingService edge paths.
 *
 * Targets:
 *   - L375-377 parseUserProfileCV: file with no extractable text → success=false
 *   - L367-369 parseUserProfileCV: no OPENAI_API_KEY → success=false
 *   - L125-133 parseQuickUserCV: file with no extractable text → null + status=failed
 *   - L117-120 parseQuickUserCV: no OPENAI_API_KEY → null
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { parseUserProfileCV, parseQuickUserCV } from '../../src/services/cvParsingService.js';
import QuickUser from '../../src/models/QuickUser.js';

describe('cvParsingService — edge paths', () => {
  beforeAll(async () => { await connectTestDB(); });
  afterEach(async () => { await clearTestDB(); });
  afterAll(async () => { await closeTestDB(); });

  it('parseUserProfileCV returns success=false when OPENAI_API_KEY missing (L367-369)', async () => {
    const original = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const r = await parseUserProfileCV(Buffer.from('any'));
      expect(r.success).toBe(false);
      expect(r.error).toMatch(/OpenAI API key/);
    } finally {
      if (original !== undefined) process.env.OPENAI_API_KEY = original;
    }
  });

  it('parseQuickUserCV returns null when OPENAI_API_KEY missing (L117-120)', async () => {
    const original = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const qu = await QuickUser.create({
        email: `qu-${Date.now()}@example.com`,
        firstName: 'Q',
        lastName: 'L',
        location: 'Tiranë',
        preferences: {},
      });
      const r = await parseQuickUserCV(qu._id, Buffer.from('any'));
      expect(r).toBeNull();
    } finally {
      if (original !== undefined) process.env.OPENAI_API_KEY = original;
    }
  });

});
