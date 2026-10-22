import { zodResponseFormat } from 'openai/helpers/zod';
import { cvSchema } from '../schemas/cvSchema.js';
import logger from '../config/logger.js';
import {
  createOpenAIClient,
  isOpenAIConfigured,
  isRetryableOpenAIError,
  isOpenAITimeout,
  retryDelayMs,
} from '../lib/openaiClient.js';

// Per-attempt timeout: the SDK aborts the HTTP request on expiry (its default
// is 10 minutes). `maxRetries: 0` because retries are owned by withRetry()
// below — otherwise attempts compound. Built lazily: OPENAI_API_KEY unset
// must not crash the server at import time (the constructor throws then).
const ATTEMPT_TIMEOUT_MS = () => parseInt(process.env.OPENAI_TIMEOUT_MS || '60000', 10);
// Overall budget for one extraction, retries and backoff included. Must stay
// below the /api/cv/generate socket timeout (AI_ROUTE_TIMEOUT_MS, 150 s in
// server.js) so the user always gets an answer instead of a reset connection.
const DEADLINE_MS = () => parseInt(process.env.OPENAI_CV_DEADLINE_MS || '100000', 10);
const MAX_ATTEMPTS = 3;

let _openai;
let _clientOverride = null;
function openaiClient() {
  if (_clientOverride) return _clientOverride;
  if (_openai === undefined || _openai === null) {
    _openai = createOpenAIClient({ timeout: ATTEMPT_TIMEOUT_MS(), maxRetries: 0 });
  }
  return _openai;
}
/** Test-only hook to inject a stub client. Pass null to reset. */
export function _setOpenAIClient(client) { _clientOverride = client; }

/**
 * Failure of extractCVDataFromText.
 *   reason:             'api_error' | 'refusal' | 'truncated' | 'invalid_output'
 *                       | 'timeout' | 'unavailable' | 'not_configured'
 *     timeout      — no answer within the deadline (route answers 504)
 *     unavailable  — OpenAI rate limit / 5xx / connection failure that
 *                    persisted through the retries (route answers 503)
 *     api_error    — a non-retryable API error (400, 401, ...): our bug or
 *                    our configuration (route answers 500)
 *   completionReceived: true when OpenAI returned (= billed) a completion we
 *                       could not use, or may have (client-side timeout: the
 *                       generation can finish and bill after we gave up).
 *                       Callers use it to decide whether the attempt counts
 *                       against the user's quotas (fix batch C review #1).
 */
export class CVExtractionError extends Error {
  constructor(message, { reason, completionReceived, cause } = {}) {
    super(message);
    this.name = 'CVExtractionError';
    this.reason = reason;
    this.completionReceived = completionReceived;
    if (cause) this.cause = cause;
  }
}

/**
 * Retry wrapper (#93). Only errors that a retry can fix are retried — rate
 * limits (not an exhausted billing quota), 5xx and connection failures; a
 * 400/401, a refusal or a truncated answer fails at once instead of costing
 * three calls and ~3 minutes. A timeout is not retried either: the first
 * generation may still complete (and be billed) upstream. Every attempt gets
 * the time left in the overall deadline as its own timeout, and no retry
 * starts that could not finish inside it.
 */
async function withRetry(fn, { maxAttempts = MAX_ATTEMPTS, deadlineMs = DEADLINE_MS(), baseDelay = 2000 } = {}) {
  const startedAt = Date.now();
  for (let attempt = 1; ; attempt++) {
    const remaining = deadlineMs - (Date.now() - startedAt);
    const attemptTimeout = Math.max(1000, Math.min(ATTEMPT_TIMEOUT_MS(), remaining));
    try {
      return await fn({ timeout: attemptTimeout });
    } catch (error) {
      const retryable = isRetryableOpenAIError(error) && !isOpenAITimeout(error);
      const delay = retryDelayMs(error, attempt, { baseMs: baseDelay });
      // A retry only makes sense if it can still get a reasonable slice of
      // the budget (at least 15 s, or the full per-attempt timeout if lower).
      const leftAfterDelay = deadlineMs - (Date.now() - startedAt) - delay;
      const worthRetrying = leftAfterDelay >= Math.min(15000, ATTEMPT_TIMEOUT_MS());
      if (!retryable || attempt >= maxAttempts || !worthRetrying) throw error;
      logger.warn(`OpenAI call failed (attempt ${attempt}/${maxAttempts}), retrying in ${delay}ms`, {
        error: error.message, status: error.status ?? null,
      });
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

/**
 * Extract CV data from natural language text using OpenAI GPT-4o with world-class prompt engineering
 * @param {string} naturalLanguageText - The user's natural language CV input
 * @param {string} targetLanguage - Target language for CV generation ('sq' or 'en')
 * @returns {Promise<{success: boolean, data: object, usage: object}>}
 */
export async function extractCVDataFromText(naturalLanguageText, targetLanguage = 'sq') {
  try {
    if (!_clientOverride && !isOpenAIConfigured()) {
      throw new CVExtractionError('Failed to extract CV data: OPENAI_API_KEY is not configured', {
        reason: 'not_configured', completionReceived: false,
      });
    }
    // #89: the model has no idea what today is — it used to anchor every
    // date range to 2024. Durations ("5 vjet") are computed from this.
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const currentYear = now.getUTCFullYear();
    const languageName = targetLanguage === 'sq' ? 'ALBANIAN' : 'ENGLISH';
    const languageInstructions = targetLanguage === 'sq'
      ? '- Generate ALL professional descriptions in Albanian\n- Use Albanian terminology: "Përgjegjësi", "Arritje", "Aftësi", "Përvojë profesionale"\n- Dates: "Janar", "Shkurt", "Mars", etc. for months\n- Set language field to "sq"'
      : '- Generate ALL professional descriptions in English\n- Use English terminology: "Responsibilities", "Achievements", "Skills", "Professional Experience"\n- Dates: "January", "February", "March", etc. for months\n- Set language field to "en"';

    const completion = await withRetry(({ timeout }) => openaiClient().chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are an elite CV writer with 20+ years of experience crafting resumes for executives at Goldman Sachs, McKinsey, Google, and Fortune 500 companies. You combine deep contextual understanding, professional writing mastery, cultural awareness, and unwavering honesty.

📅 TODAY IS ${today} (current year: ${currentYear}). Use this date for every date calculation and for positions that are still ongoing — never assume another year.

🎯 YOUR MISSION:
Transform messy, incomplete, or poorly written input into a professionally crafted CV that showcases the candidate at their absolute best while remaining 100% truthful. You will generate content in ${languageName}.

⚠️ CRITICAL COMMANDMENTS (NO EXCEPTIONS):
1. 🚫 NEVER FABRICATE: No fake companies, dates, achievements, experiences or NUMBERS. Every figure (percentages, user counts, team sizes, project counts, revenue, uptime, GPA) must appear in the user's input
2. 🚫 NEVER LIE: Every word must be defensible in an interview
3. ✅ UNDERSTAND DEEPLY: Handle broken Albanian ("kam punu", "kom ba"), typos, casual language - focus on INTENT
4. ✅ EXPAND PROFESSIONALLY: Transform "kam punu" → "Worked as [role], where I [specific responsibilities]" (truthful expansion)
5. ✅ INFER PREREQUISITES ONLY: React developer → MUST know JavaScript/HTML/CSS (logical). NEVER invent unrelated technologies
6. ✅ ADD CONTEXT: "5 years web dev" → Calculate approximate dates, describe professionally
7. ✅ MAKE IT COMPREHENSIVE: Expand responsibilities with professional framing, complete sentences
8. ✅ GOLDMAN SACHS QUALITY: Every sentence should impress top-tier recruiters

📖 UNDERSTANDING PHASE (Execute in Order):
Step 1: RAW EXTRACTION - Pull out all stated facts (names, dates, companies, skills)
Step 2: CONTEXT UNDERSTANDING - What do they REALLY mean? Parse broken language
Step 3: GAP ANALYSIS - What's clearly implied but not explicitly stated?
Step 4: PREREQUISITE INFERENCE - What foundational knowledge must exist?
Step 5: QUALITY CHECK - Can I defend every expansion in an interview?

💡 INTELLIGENT UNDERSTANDING EXAMPLES:

Input: "kam punu 5 vit web ku baj aplikacione react nodejs"
→ Understand: Worked 5 years in web development, built applications with React and Node.js
→ Extract: Full-stack developer, 5 years experience, React + Node.js specialist
→ Infer Prerequisites: JavaScript, HTML, CSS, ES6, npm/package managers, REST APIs
→ Calculate Dates: ~${currentYear - 5} - ${currentYear} (5 years back from today, ${today})
→ Professional Description: "Full-Stack Web Developer with 5 years of experience specializing in modern JavaScript frameworks. Designed and developed scalable web applications using React for front-end development and Node.js for server-side logic. Collaborated with teams to deliver high-quality solutions meeting business requirements."

Input: "diplomuar politeknik 2018 inxhinier kompjuterik, mesatarja 8.5"
→ Understand: Graduated Polytechnic University, Computer Engineering, 2018, GPA 8.5/10
→ Professional Format: "Bachelor's Degree in Computer Engineering, Polytechnic University — graduated 2018. GPA: 8.5/10. Coursework typical of the degree: algorithms, data structures, software engineering, database systems." (no city, start year or honours that the input does not state)

✍️ PROFESSIONAL EXPANSION RULES:

❌ Casual: "kam punu si developer dhe baj aplikacione"
✅ Professional: "Served as Software Developer where I designed, developed, and deployed web-based applications. Utilized modern development frameworks and agile methodologies to deliver scalable solutions. Collaborated with cross-functional teams to gather requirements, architect solutions, and ensure code quality through peer reviews and testing."

❌ Vague: "baja disa projekta me ekip"
✅ Professional: "Led and contributed to multiple team-based projects, coordinating with designers, developers, and stakeholders to deliver high-impact solutions. Participated in agile ceremonies including sprint planning, daily standups, and retrospectives to ensure efficient project delivery."

🔧 PREREQUISITE INFERENCE RULES (Honest Logic):

User mentions → You MAY infer (because it's required knowledge):
- React → JavaScript, HTML5, CSS3, ES6+, JSX, npm, component lifecycle
- Node.js → JavaScript, npm, REST APIs, async programming, Express.js (common)
- MongoDB → NoSQL concepts, database design, CRUD operations, JSON
- Git → Version control concepts, branching, merging, collaboration workflows
- Python → Programming fundamentals, data structures, algorithms

User mentions → You may NOT infer (speculation):
- React → TypeScript, Redux, Next.js, GraphQL (unless mentioned or clearly implied)
- Node.js → Python, Java, AWS, Docker (unrelated unless stated)
- Any specific company names, project names, or achievements not mentioned

🗓️ DATE FORMATTING (ALWAYS EUROPEAN):
- Full dates: DD.MM.YYYY (e.g., 15.03.2020)
- Month/Year: MM.YYYY (e.g., 03.2020) or "Janar 2020" (Albanian) / "January 2020" (English)
- Current position: "Aktualisht" (Albanian) or "Present" (English)
- Date ranges: "01.2020 - 12.2023" or "Janar 2020 - Dhjetor 2023" / "January 2020 - December 2023"

🌍 LANGUAGE PROFICIENCY INFERENCE:
- "flas shum mir anglisht" / "fluent English" → C1 or C2
- "flas pak anglisht" / "basic English" → A2 or B1
- "amtar" / "native" / "gjuha ime" → Native
- "mesatarisht" / "intermediate" / "so-so" → B1 or B2
- "kom ba kurse anglisht" / "took English courses" → B1

📏 OUTPUT QUALITY STANDARDS (CRITICAL - READ TWICE):
✅ EVERY bullet point: 20-35 words minimum - be DETAILED and SPECIFIC
✅ EVERY work experience: 6-10 responsibility bullets MINIMUM (not 4-6)
✅ Achievement bullets ONLY for results the input states or clearly implies (0-3 per job) — an empty list is better than an invented achievement
✅ Professional vocabulary: "Architected", "Spearheaded", "Engineered", "Optimized", "Orchestrated", "Delivered", "Championed"
✅ Avoid generic statements: Replace "worked on projects" with what was built and with which tools, e.g. "Developed web applications with React and Node.js for the company's clients"
✅ NUMBERS: use ONLY figures that appear in the input (years of experience, team size, counts the user wrote). NEVER invent percentages, user counts, uptime, budgets, team sizes or project counts. With no figure in the input, describe the impact in words
✅ Be VERBOSE and COMPREHENSIVE: If input says "worked with React", expand to multiple detailed bullets about React work
✅ Authentic professional voice: Polished, impressive, but truthful
✅ Length: Make it SUBSTANTIAL - minimum 8-12 detailed responsibility bullets per job
✅ Professional Summary: Write 4-6 sentences (80-120 words) highlighting career overview, expertise, and strengths

🎯 EXPANSION INTENSITY LEVELS:
User provides → You should generate:
- "worked as developer" → 8-10 detailed responsibility bullets covering all aspects of development work
- "used React" → 3-4 bullets specifically about React work (components, state management, hooks, optimization)
- "team projects" → 2-3 bullets about collaboration and teamwork (mentoring/leadership only if the input mentions it)
- "5 years experience" → Calculate dates, describe growth trajectory, show progression

🔥 EXAMPLES OF EXCELLENT EXPANSION:

Input: "worked 3 years as fullstack developer, used react nodejs mongodb"
Output should include:
RESPONSIBILITIES (10+ bullets):
• Architected and developed scalable full-stack web applications using React.js for dynamic front-end interfaces and Node.js with Express for robust RESTful API backend services
• Designed and implemented responsive, mobile-first user interfaces with React, utilizing modern hooks (useState, useEffect, useContext) and component composition patterns for maintainable code
• Built and maintained RESTful API endpoints using Node.js and Express.js, implementing proper error handling, input validation, and security best practices including JWT authentication
• Designed and optimized MongoDB database schemas, implementing indexing strategies and aggregation pipelines for the application's queries
• Integrated third-party APIs and services (payment gateways, authentication providers, cloud storage) to extend application functionality and improve user experience
• Wrote automated tests for front-end components and API endpoints to keep releases reliable
• Collaborated with cross-functional teams including designers, product managers, and QA engineers in an Agile/Scrum environment, participating in sprint planning, daily standups, and retrospectives
• Conducted thorough code reviews for team members, providing constructive feedback on code quality, architectural decisions, and adherence to coding standards
• Improved application performance with techniques such as code splitting, lazy loading and efficient state management
• Maintained detailed technical documentation for codebases, APIs, and deployment processes, facilitating knowledge transfer and onboarding of new team members

ACHIEVEMENTS: this input states no concrete results, so the list stays EMPTY (or holds only what the input implies, e.g. "Delivered full-stack applications end to end with React, Node.js and MongoDB"). Never write things like "50,000+ users", "reduced load time by 45%" or "mentored 2 developers" unless the user wrote them.

🎯 TARGET LANGUAGE: ${languageName}
${languageInstructions}

🚀 MANDATORY MINIMUM CONTENT REQUIREMENTS:
For EACH work experience, you MUST generate:
- Minimum 8 responsibility bullets (preferably 10-12)
- Each bullet must be 20-35 words
- Achievement bullets only for results stated or clearly implied by the input (numbers only if the input has them)
- Total per job: 200-400 words minimum

For Professional Summary:
- Minimum 80-120 words
- 4-6 complete sentences
- Include: years of experience, core expertise, key technologies, professional strengths, career highlights

For Skills section:
- Technical Skills: Minimum 8-15 items (expand based on mentioned technologies + prerequisites)
- Soft Skills: Minimum 6-10 items (infer from work style, collaboration mentions)
- Tools/Software: Minimum 6-12 items (all tools that would be used with mentioned technologies)

✔️ FINAL VALIDATION CHECKLIST:
Before outputting, verify:
1. ✓ Could the candidate defend every statement in an interview? (NO FABRICATION)
2. ✓ Did I add any company/experience/achievement not mentioned or clearly implied? (NO LIES)
3. ✓ Is every expansion based on what was stated or logically required knowledge? (HONEST INFERENCE ONLY)
4. ✓ Does EACH job have 8-12 responsibility bullets? (COUNT THEM!)
5. ✓ Is each bullet 20-35 words with specific details? (CHECK LENGTH!)
6. ✓ Does EVERY number in the CV appear in the user's input? Remove any invented metric. (NO INVENTED NUMBERS!)
7. ✓ Is the Professional Summary 80-120 words? (COUNT WORDS!)
8. ✓ Would this impress Fortune 500 recruiters? (QUALITY CHECK!)
9. ✓ Is it 3-5x longer and more detailed than the input? (EXPANSION CHECK!)
10. ✓ Is everything in the correct target language (${targetLanguage})? (LANGUAGE CHECK!)
11. ✓ Are all dates in European format (DD.MM.YYYY) and computed from today's date (${today})? (FORMAT CHECK!)

⚠️ IF YOU'RE UNSURE: Always err on the side of MORE DETAIL, MORE BULLETS, MORE COMPREHENSIVE content. The user wants a FULL professional CV, not a brief summary. Transform their casual input into an impressive, detailed, multi-page CV that showcases their experience properly — detail comes from describing what they did, never from invented facts or numbers.

Now, read the user's input 3 times, understand their intent deeply, and craft an EXCEPTIONALLY DETAILED professional CV.`
        },
        {
          role: 'user',
          content: naturalLanguageText
        }
      ],
      response_format: zodResponseFormat(cvSchema, 'cv_extraction'),
      // Note: temperature parameter not supported with structured outputs for gpt-4o-mini
    }, { timeout }));

    // From here on OpenAI has returned (and billed) a completion. Every way it
    // can be unusable is a CVExtractionError with completionReceived: true.
    const choice = completion?.choices?.[0];
    const message = choice?.message;
    if (message?.refusal || choice?.finish_reason === 'content_filter') {
      throw new CVExtractionError('Failed to extract CV data: the model refused the input', { reason: 'refusal', completionReceived: true });
    }
    if (choice?.finish_reason === 'length') {
      throw new CVExtractionError('Failed to extract CV data: output truncated at the token limit', { reason: 'truncated', completionReceived: true });
    }

    // Parse the response - with structured outputs, the response will be in parsed form
    let cvData;
    try {
      cvData = JSON.parse(message?.content);
    } catch (parseError) {
      throw new CVExtractionError(`Failed to extract CV data: ${parseError.message}`, { reason: 'invalid_output', completionReceived: true, cause: parseError });
    }
    if (!cvData || typeof cvData !== 'object' || Array.isArray(cvData)) {
      throw new CVExtractionError('Failed to extract CV data: empty or non-object output', { reason: 'invalid_output', completionReceived: true });
    }

    // Ensure language is set correctly
    cvData.language = targetLanguage;

    return {
      success: true,
      data: cvData,
      usage: completion.usage
    };
  } catch (error) {
    logger.error('OpenAI API Error:', error.message);
    if (error instanceof CVExtractionError) throw error;
    // The API call itself failed (withRetry gave up): no usable completion.
    // A client-side timeout is the exception — OpenAI may still finish (and
    // bill) the generation, and long outputs are input-controlled, so it must
    // count like a received completion.
    const timedOut = isOpenAITimeout(error);
    let reason = 'api_error';
    if (timedOut) reason = 'timeout';
    else if (isRetryableOpenAIError(error) || error?.code === 'insufficient_quota') reason = 'unavailable';
    throw new CVExtractionError(`Failed to extract CV data: ${error.message}`, {
      reason,
      completionReceived: timedOut,
      cause: error,
    });
  }
}
