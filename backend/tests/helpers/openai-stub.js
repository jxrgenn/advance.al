/**
 * Deterministic OpenAI stub client for unit + integration tests (Phase 28 — Phase 6).
 *
 * Returns canned, realistic GPT-4o-mini / text-embedding-3-small responses
 * so the production service code (text preparation, response parsing,
 * sanitization, error handling) gets full coverage WITHOUT actual API
 * calls.
 *
 * This is a stop-gap until the snapshot-replay infra (`openai-snapshot.js`)
 * has real fixtures populated. When the user provisions an OPENAI_API_KEY
 * and runs the snapshot-refresh workflow, those tests will run with real
 * fixtures; this stub remains useful for unit-level coverage of error
 * paths and edge cases that real API calls can't reliably trigger
 * (e.g., malformed-response handling, retry logic).
 *
 * Per TESTING_PHILOSOPHY.md:
 *   "Real services > mocks past system boundary"
 *
 * The OpenAI SDK is the system boundary; this stub replaces THAT, not any
 * application code. Production behavior is unchanged because the stub is
 * only injected via test-only hooks.
 */

/**
 * Build a stub openai client with canned responses.
 *
 * @param {object} opts
 * @param {object} opts.cv - canned CV-extraction response (parsed JSON)
 * @param {Array<number>} opts.embedding - canned embedding vector (1536 floats)
 * @param {Error} opts.throwOnCompletion - if set, completions.create rejects with this
 * @param {Error} opts.throwOnEmbedding - if set, embeddings.create rejects with this
 * @returns {object} OpenAI-shaped stub
 */
export function makeOpenAIStub(opts = {}) {
  const cv = opts.cv ?? {
    title: 'Software Engineer',
    bio: 'Experienced developer.',
    skills: ['React', 'Node.js'],
    experience: '2-5 vjet',
    workExperience: [
      {
        position: 'Senior Engineer', company: 'Acme',
        startDate: '2020-01', endDate: '2023-12',
        isCurrentJob: false,
        description: 'Built things.',
        achievements: 'Shipped many things.',
        location: 'Tiranë',
      },
    ],
    education: [
      {
        degree: 'Bachelor', institution: 'University of Tirana',
        fieldOfStudy: 'CS',
        startDate: '2014-09', endDate: '2018-06',
        isCurrentStudy: false,
        gpa: '3.8',
        description: '',
        location: 'Tiranë',
      },
    ],
    languages: [
      { name: 'Albanian', proficiency: 'Native' },
      { name: 'English', proficiency: 'C2' },
    ],
  };

  const embedding = opts.embedding ?? Array.from({ length: 1536 }, (_, i) => (i % 17) / 100);

  return {
    chat: {
      completions: {
        create: async (params) => {
          if (opts.throwOnCompletion) throw opts.throwOnCompletion;
          // Mimic GPT-4o-mini structured-output response
          return {
            id: 'chatcmpl-stub',
            model: params.model || 'gpt-4o-mini',
            choices: [{
              index: 0,
              message: {
                role: 'assistant',
                content: JSON.stringify(opts.completionContent ?? cv),
              },
              finish_reason: 'stop',
            }],
            usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
          };
        },
      },
    },
    embeddings: {
      create: async (params) => {
        if (opts.throwOnEmbedding) throw opts.throwOnEmbedding;
        // Handle both string and array inputs
        const inputs = Array.isArray(params.input) ? params.input : [params.input];
        return {
          object: 'list',
          data: inputs.map((_, idx) => ({
            object: 'embedding',
            index: idx,
            embedding,
          })),
          model: params.model || 'text-embedding-3-small',
          usage: { prompt_tokens: 20, total_tokens: 20 },
        };
      },
    },
  };
}

/**
 * Build a stub that returns malformed JSON in the completion content.
 * Used to test error handling in services that JSON.parse the response.
 */
export function makeOpenAIStubMalformed() {
  return {
    chat: {
      completions: {
        create: async () => ({
          id: 'chatcmpl-stub-bad',
          choices: [{
            message: { content: '{not valid json' },
            finish_reason: 'stop',
          }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
      },
    },
    embeddings: { create: async () => { throw new Error('not implemented in malformed stub'); } },
  };
}
