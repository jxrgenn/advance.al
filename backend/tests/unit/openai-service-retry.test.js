/**
 * Phase 28 — coverage push for openaiService.js retry wrapper (L19-30) +
 * extractCVDataFromText error catch (L65-67).
 *
 * Uses _setOpenAIClient stub to inject failing/succeeding responses without
 * making real API calls.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { extractCVDataFromText, _setOpenAIClient } from '../../src/services/openaiService.js';

function makeStub({ throwTimes = 0, completionContent = null } = {}) {
  let callCount = 0;
  return {
    chat: {
      completions: {
        create: jest.fn(async () => {
          callCount++;
          if (callCount <= throwTimes) {
            throw new Error(`stub failure attempt ${callCount}`);
          }
          return {
            choices: [{
              message: {
                content: completionContent ?? JSON.stringify({
                  language: 'sq',
                  personalInfo: { fullName: 'Test User' },
                  workExperience: [],
                  education: [],
                  skills: [],
                }),
              },
            }],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          };
        }),
      },
    },
  };
}

describe('openaiService — retry + error paths', () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'sk-test-stub';
  });

  afterEach(() => {
    _setOpenAIClient(null);
  });

  it('happy path: stub returns CV data on first attempt', async () => {
    const stub = makeStub();
    _setOpenAIClient(stub);

    const r = await extractCVDataFromText('Software engineer with 3 years of experience in React, Node, and Postgres at Acme Corp.', 'sq');
    expect(r.success).toBe(true);
    expect(r.data.language).toBe('sq');
    expect(stub.chat.completions.create).toHaveBeenCalledTimes(1);
  }, 30000);

  it('overrides language to "en" when targetLanguage="en"', async () => {
    const stub = makeStub();
    _setOpenAIClient(stub);

    const r = await extractCVDataFromText('Software engineer with 3 years of experience.', 'en');
    expect(r.success).toBe(true);
    expect(r.data.language).toBe('en'); // overridden by route
  }, 30000);

  it('throws wrapped error when all retries exhaust (L65-67)', async () => {
    const stub = makeStub({ throwTimes: 99 }); // always throws
    _setOpenAIClient(stub);

    await expect(
      extractCVDataFromText('Some valid input here.', 'sq')
    ).rejects.toThrow(/Failed to extract CV data/);

    // withRetry retries 2 extra times (3 total) before giving up
    expect(stub.chat.completions.create).toHaveBeenCalledTimes(3);
  }, 30000);

  it('retry succeeds after 1 transient failure (L24-28)', async () => {
    const stub = makeStub({ throwTimes: 1 });
    _setOpenAIClient(stub);

    const r = await extractCVDataFromText('Valid input text for retry test.', 'sq');
    expect(r.success).toBe(true);
    // 1st throws, 2nd succeeds
    expect(stub.chat.completions.create).toHaveBeenCalledTimes(2);
  }, 30000);
});
