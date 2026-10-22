/**
 * Phase 28 — coverage push for openaiService.js retry wrapper (L19-30) +
 * extractCVDataFromText error catch (L65-67).
 *
 * Uses _setOpenAIClient stub to inject failing/succeeding responses without
 * making real API calls.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import OpenAI from 'openai';
import { extractCVDataFromText, _setOpenAIClient, CVExtractionError } from '../../src/services/openaiService.js';

// Default failure: an OpenAI 5xx — retryable (#93).
const serverError = (n) => new OpenAI.InternalServerError(500, { message: `upstream ${n}` }, `upstream ${n}`, {});

function makeStub({ throwTimes = 0, completionContent = null, makeError = serverError } = {}) {
  let callCount = 0;
  return {
    chat: {
      completions: {
        create: jest.fn(async () => {
          callCount++;
          if (callCount <= throwTimes) {
            throw makeError(callCount);
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

  it('retryable error (5xx) on every attempt: 3 attempts, then CVExtractionError reason=unavailable', async () => {
    const stub = makeStub({ throwTimes: 99 }); // always 500
    _setOpenAIClient(stub);

    const err = await extractCVDataFromText('Some valid input here.', 'sq').catch(e => e);
    expect(err).toBeInstanceOf(CVExtractionError);
    expect(err.reason).toBe('unavailable');
    expect(err.completionReceived).toBe(false);
    expect(err.message).toMatch(/^Failed to extract CV data: /);
    expect(stub.chat.completions.create).toHaveBeenCalledTimes(3);
  }, 30000);

  it('retry succeeds after 1 transient failure (5xx)', async () => {
    const stub = makeStub({ throwTimes: 1 });
    _setOpenAIClient(stub);

    const r = await extractCVDataFromText('Valid input text for retry test.', 'sq');
    expect(r.success).toBe(true);
    // 1st throws, 2nd succeeds
    expect(stub.chat.completions.create).toHaveBeenCalledTimes(2);
  }, 30000);

  // #93: errors a retry cannot fix fail on the FIRST attempt — no tripled
  // cost, no ~3-minute wait for the user.
  it.each([
    ['401 bad key', 'api_error', () => new OpenAI.AuthenticationError(401, { message: 'Incorrect API key' }, 'Incorrect API key', {})],
    ['400 bad request / context too long', 'api_error', () => new OpenAI.BadRequestError(400, { message: 'context_length_exceeded' }, 'context_length_exceeded', {})],
    ['429 insufficient_quota (billing)', 'unavailable', () => new OpenAI.RateLimitError(429, { message: 'quota', code: 'insufficient_quota' }, 'quota', {})],
    ['a plain programming error', 'api_error', () => new TypeError('boom')],
    ['the SDK request timeout', 'timeout', () => new OpenAI.APIConnectionTimeoutError()],
  ])('%s → 1 attempt, reason=%s', async (_label, reason, makeError) => {
    const stub = makeStub({ throwTimes: 99, makeError });
    _setOpenAIClient(stub);
    const err = await extractCVDataFromText('Some valid input here.', 'sq').catch(e => e);
    expect(err).toBeInstanceOf(CVExtractionError);
    expect(err.reason).toBe(reason);
    expect(stub.chat.completions.create).toHaveBeenCalledTimes(1);
  });

  it('a timeout counts as a received completion (OpenAI may still bill it)', async () => {
    _setOpenAIClient(makeStub({ throwTimes: 99, makeError: () => new OpenAI.APIConnectionTimeoutError() }));
    const err = await extractCVDataFromText('Some valid input here.', 'sq').catch(e => e);
    expect(err.completionReceived).toBe(true);
  });

  it('a 429 rate limit (not quota) is retried', async () => {
    const stub = makeStub({ throwTimes: 1, makeError: () => new OpenAI.RateLimitError(429, { message: 'slow down', code: 'rate_limit_exceeded' }, 'slow down', {}) });
    _setOpenAIClient(stub);
    const r = await extractCVDataFromText('Valid input text for retry test.', 'sq');
    expect(r.success).toBe(true);
    expect(stub.chat.completions.create).toHaveBeenCalledTimes(2);
  }, 30000);

  it('every attempt passes a per-request timeout no larger than OPENAI_TIMEOUT_MS (SDK aborts the request)', async () => {
    const stub = makeStub();
    _setOpenAIClient(stub);
    await extractCVDataFromText('Valid input text for retry test.', 'sq');
    const opts = stub.chat.completions.create.mock.calls[0][1];
    expect(opts.timeout).toBe(parseInt(process.env.OPENAI_TIMEOUT_MS || '60000', 10));
  });

  it('no OPENAI_API_KEY and no injected client → reason=not_configured, nothing called', async () => {
    const saved = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = '';
    try {
      const err = await extractCVDataFromText('Some valid input here.', 'sq').catch(e => e);
      expect(err).toBeInstanceOf(CVExtractionError);
      expect(err.reason).toBe('not_configured');
      expect(err.completionReceived).toBe(false);
    } finally {
      process.env.OPENAI_API_KEY = saved;
    }
  });
});

// #89: the system prompt used to instruct the model to add metrics ("improved
// performance by 40%") and showed invented numbers as the ideal output, and it
// anchored every date calculation to 2024.
describe('openaiService — CV prompt content (#89)', () => {
  afterEach(() => _setOpenAIClient(null));

  async function systemPrompt() {
    const stub = makeStub();
    _setOpenAIClient(stub);
    await extractCVDataFromText('Kam punuar 5 vjet si zhvillues web me React dhe Node.js në Tiranë.', 'sq');
    const messages = stub.chat.completions.create.mock.calls[0][0].messages;
    expect(messages.map(m => m.role)).toEqual(['system', 'user']);
    return messages[0].content;
  }

  it("states today's date and computes example ranges from the current year", async () => {
    const prompt = await systemPrompt();
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const year = now.getUTCFullYear();
    expect(prompt).toContain(`TODAY IS ${today} (current year: ${year})`);
    expect(prompt).toContain(`→ Calculate Dates: ~${year - 5} - ${year} (5 years back from today, ${today})`);
    expect(prompt).not.toContain('assuming current is 2024');
  });

  it('no longer asks for metrics or shows invented numbers as the target', async () => {
    const prompt = await systemPrompt();
    for (const removed of [
      'Add METRICS wherever logical',
      'Led development of 5+ production applications serving 10K+ users',
      'Successfully delivered 8+ production-ready applications serving 50,000+ monthly active users',
      'achieving 80%+ code coverage',
      'reducing initial load time by 40%',
      'datasets with 100K+ documents',
      'Minimum 2-3 achievement bullets with measurable impact',
    ]) {
      expect(prompt).not.toContain(removed);
    }
    expect(prompt).toContain('NEVER invent percentages, user counts, uptime, budgets, team sizes or project counts');
    expect(prompt).toContain('Does EVERY number in the CV appear in the user\'s input?');
  });
});
