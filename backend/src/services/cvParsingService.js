import { createOpenAIClient, isOpenAIConfigured } from '../lib/openaiClient.js';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import mammoth from 'mammoth';
import validator from 'validator';
import { QuickUser } from '../models/index.js';
import logger from '../config/logger.js';
import { fireEmbedding } from './embeddingTrigger.js';
import { JOB_CATEGORIES } from '../constants/jobCategories.js';
import { isEmailFormat } from '../lib/emailFormat.js';
import { normalizeAlbanianPhone, isValidAlbanianPhone } from '../lib/phonePolicy.js';
import { stripHtml, normalizeOneLine, escapeRegex } from '../utils/sanitize.js';

// Lazy-init to avoid throwing at import time when API key is not yet set.
// `_clientOverride` is a test-only injection hook; production code never sets it.
let openai;
let _clientOverride = null;
function getOpenAI() {
  if (_clientOverride) return _clientOverride;
  if (!openai) {
    // #60 (W2-4b): bounded. `new OpenAI({ apiKey })` meant the SDK defaults —
    // a 10-minute timeout and 2 hidden retries — so POST /users/parse-resume
    // could outlive its socket. 45 s × (1 + 1 SDK retry for 429/5xx/network)
    // + the Cloudinary upload stays below AI_ROUTE_TIMEOUT_MS (150 s).
    openai = createOpenAIClient({ timeout: parseInt(process.env.OPENAI_PARSE_TIMEOUT_MS || '45000', 10), maxRetries: 1 });
    if (!openai) throw new Error('OPENAI_API_KEY is not configured');
  }
  return openai;
}
/** Test-only hook to inject a stub/snapshot client. Pass null to reset. */
export function _setOpenAIClient(client) { _clientOverride = client; }

// The quick-profile preview is interactive (the visitor waits on the upload
// screen): one short attempt, no retries — on a timeout the confirm step
// still opens with what the pattern pass found. Bounded well below the
// route's socket timeout (server.js LONG_RUNNING_ROUTES).
let quickProfileOpenai;
function getQuickProfileOpenAI() {
  if (_clientOverride) return _clientOverride;
  if (!isOpenAIConfigured()) return null;
  if (!quickProfileOpenai) {
    quickProfileOpenai = createOpenAIClient({ timeout: parseInt(process.env.OPENAI_QUICK_CV_TIMEOUT_MS || '20000', 10), maxRetries: 0 });
  }
  return quickProfileOpenai;
}

/**
 * Extract text from a PDF buffer using pdfjs-dist.
 */
async function extractTextFromPDF(pdfBuffer) {
  const uint8 = new Uint8Array(pdfBuffer);
  const doc = await getDocument({ data: uint8 }).promise;
  let text = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(item => item.str).join(' ') + '\n';
  }
  doc.destroy();
  return text;
}

/**
 * Extract text from a DOCX buffer using mammoth.
 */
async function extractTextFromDOCX(docxBuffer) {
  const result = await mammoth.extractRawText({ buffer: docxBuffer });
  return result.value;
}

/**
 * Detect file type from buffer magic bytes and extract text accordingly.
 * PDF starts with %PDF, DOCX/ZIP starts with PK (0x504B).
 */
async function extractTextFromCV(buffer) {
  if (!buffer || buffer.length < 4) {
    throw new Error('File buffer is empty or too small');
  }

  const header = buffer.slice(0, 4);

  // PDF: starts with %PDF (0x25504446)
  if (header[0] === 0x25 && header[1] === 0x50 && header[2] === 0x44 && header[3] === 0x46) {
    return extractTextFromPDF(buffer);
  }

  // DOCX (ZIP): starts with PK (0x504B)
  if (header[0] === 0x50 && header[1] === 0x4B) {
    return extractTextFromDOCX(buffer);
  }

  // Fallback: try PDF first, then DOCX
  try {
    return await extractTextFromPDF(buffer);
  } catch {
    return extractTextFromDOCX(buffer);
  }
}

/**
 * Parse CV text with GPT-4o-mini to extract structured profile data.
 * Cost: ~$0.0003 per CV (very cheap).
 */
async function parseWithAI(cvText) {
  const truncated = cvText.slice(0, 6000); // Keep tokens reasonable

  const completion = await getOpenAI().chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.1,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `You extract structured data from CV/resume text. Return a JSON object with these fields:
- "title": the person's current or most recent job title (string, e.g. "Software Engineer")
- "skills": array of specific skills mentioned (max 15, e.g. ["React", "Node.js", "SQL"])
- "experience": approximate total years of experience (string, e.g. "3 vjet" or "5 years")
- "industries": array of industries the person has worked in, using these Albanian categories where possible: ${JOB_CATEGORIES.filter(c => c !== 'Tjetër').join(', ')}. Max 3.
- "education": highest education level with field (string, e.g. "Bachelor në Informatikë")
- "languages": array of languages spoken (e.g. ["Shqip", "English", "Italian"])
- "summary": a 1-2 sentence professional summary of the candidate

Be accurate. Only extract what is clearly stated or strongly implied. Do not fabricate.`
      },
      {
        role: 'user',
        content: `Extract structured data from this CV:\n\n${truncated}`
      }
    ]
  });

  return JSON.parse(completion.choices[0].message.content);
}

/**
 * Parse a QuickUser's uploaded CV (PDF or DOCX) and save structured data.
 * Called asynchronously after signup — non-blocking.
 *
 * Auto-kicks an embedding regeneration after a successful parse (parsedCV is
 * embedding-relevant; see prepareQuickUserText). Callers that await their
 * OWN explicit `generateQuickUserEmbedding` call in the same chain can pass
 * `{ fireEmbeddingAfter: false }` to avoid a redundant second OpenAI call.
 *
 * @param {string} quickUserId - The QuickUser's MongoDB ID
 * @param {Buffer} fileBuffer - The raw file buffer (PDF or DOCX)
 * @param {object} [opts]
 * @param {boolean} [opts.fireEmbeddingAfter=true] - Kick embedding regen after parse
 */
export async function parseQuickUserCV(quickUserId, fileBuffer, opts = {}) {
  const fireEmbeddingAfter = opts.fireEmbeddingAfter !== false;
  try {
    if (!process.env.OPENAI_API_KEY) {
      logger.warn('OpenAI API key not configured — skipping CV parsing');
      return null;
    }

    // Step 1: Extract text from CV (auto-detects PDF vs DOCX)
    const cvText = await extractTextFromCV(fileBuffer);

    if (!cvText || cvText.trim().length < 20) {
      await QuickUser.findByIdAndUpdate(quickUserId, {
        $set: {
          'parsedCV.status': 'failed',
          'parsedCV.error': 'File had no extractable text'
        }
      });
      logger.warn('CV parsing skipped — file had no text', { quickUserId });
      return null;
    }

    // Step 2: Parse with AI
    const parsed = await parseWithAI(cvText);

    // Step 3: Save to QuickUser
    await QuickUser.findByIdAndUpdate(quickUserId, {
      $set: {
        'parsedCV.title': parsed.title || null,
        'parsedCV.skills': parsed.skills || [],
        'parsedCV.experience': parsed.experience || null,
        'parsedCV.industries': parsed.industries || [],
        'parsedCV.education': parsed.education || null,
        'parsedCV.languages': parsed.languages || [],
        'parsedCV.summary': parsed.summary || null,
        'parsedCV.parsedAt': new Date(),
        'parsedCV.status': 'completed',
        'parsedCV.error': null
      }
    });

    logger.info('CV parsed successfully', {
      quickUserId,
      title: parsed.title,
      skillCount: parsed.skills?.length,
      industries: parsed.industries
    });

    // Parsed-CV content is embedding-relevant (skills, summary, industries
    // feed prepareQuickUserText). Kick re-embed so any caller — not just the
    // signup chain — gets a fresh vector after parse.
    if (fireEmbeddingAfter) {
      fireEmbedding({ kind: 'quickuser', id: quickUserId, reason: 'cv-parse' });
    }

    return parsed;
  } catch (error) {
    logger.error('CV parsing failed', { quickUserId, error: error.message });
    await QuickUser.findByIdAndUpdate(quickUserId, {
      $set: {
        'parsedCV.status': 'failed',
        'parsedCV.error': error.message?.substring(0, 200)
      }
    });
    return null;
  }
}

// ─── Quick-profile CV preview ─────────────────────────────────────────────
// CV-first quick profile (owner decision 2026-10-22): the visitor uploads a
// CV, we read the contact details + profession out of it, and the quick
// profile's CONFIRM step shows them pre-filled and editable. Nothing is
// stored here — only POST /api/quickusers (after the user confirms) creates
// the subscription, so an email found in a CV is never subscribed on its own.
//
// Contact details are found by PATTERN first (email, Albanian mobile, a known
// city near the top of the CV), so an unavailable or failing AI call still
// pre-fills what it can. The AI adds the name, title, city and industries;
// an AI email / phone is only used when it literally appears in the CV text
// (no fabricated contacts).

const PATTERN_SCAN_CHARS = 20000;   // contact details live near the top
const CITY_SCAN_CHARS = 1500;       // a city in the header, not a past employer's
const QUICK_PROFILE_INDUSTRIES = JOB_CATEGORIES.filter(c => c !== 'Tjetër');

// "Tiranë" ~ "Tirane" ~ "TIRANA": lower-case, ë→e, ç→c (and any other mark).
const foldText = (str) => String(str).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Albanian city names in the definite form, as CVs often write them:
// Tiranë→Tirana, Shkodër→Shkodra, Durrës→Durrësi, Kamëz→Kamza, Fier→Fieri.
function cityVariants(foldedCity) {
  const v = new Set([foldedCity]);
  if (foldedCity.endsWith('er')) v.add(`${foldedCity.slice(0, -2)}ra`);
  if (foldedCity.endsWith('e')) v.add(`${foldedCity.slice(0, -1)}a`);
  if (/[^aeiouy]$/.test(foldedCity)) { v.add(`${foldedCity}i`); v.add(`${foldedCity}a`); }
  if (/ez$/.test(foldedCity)) v.add(`${foldedCity.slice(0, -2)}za`);
  return [...v];
}

/** Map free text ("Tirana", "durres") to a canonical Location city, or null. */
export function canonicalCity(input, cities = []) {
  if (typeof input !== 'string' || !input.trim()) return null;
  const folded = foldText(input.trim());
  for (const city of cities) {
    if (cityVariants(foldText(city)).includes(folded)) return city;
  }
  return null;
}

function findEmailInText(text) {
  for (const raw of text.split(/[\s,;<>()[\]"'|]+/)) {
    if (!raw.includes('@')) continue;
    const token = raw.replace(/^(mailto:)/i, '').replace(/[.:]+$/, '');
    if (token.length <= 254 && isEmailFormat(token) && validator.isEmail(token)) return token.toLowerCase();
  }
  return null;
}

// +355 69 123 4567 · 00355691234567 · +355 (0)69… · 069 123 4567 · 69-123-4567
const AL_MOBILE_RE = /(?:(?:\+|00)\s?355[\s.\-]?(?:\(0\)[\s.\-]?)?|0)?6[5-9](?:[\s.\-]?\d){7}/g;
function findPhoneInText(text) {
  AL_MOBILE_RE.lastIndex = 0;
  let m;
  while ((m = AL_MOBILE_RE.exec(text)) !== null) {
    const before = text[m.index - 1];
    const after = text[m.index + m[0].length];
    if ((before && /\d/.test(before)) || (after && /\d/.test(after))) continue; // part of a longer number
    const normalized = normalizeAlbanianPhone(m[0].replace('(0)', ''));
    if (isValidAlbanianPhone(normalized)) return normalized;
  }
  return null;
}

function findCityInText(text, cities) {
  const head = foldText(text.slice(0, CITY_SCAN_CHARS));
  let best = null;
  for (const city of cities) {
    for (const variant of cityVariants(foldText(city))) {
      const re = new RegExp(`(?:^|[^a-z])${escapeRegex(variant)}(?:$|[^a-z])`);
      const m = re.exec(head);
      if (m && (best === null || m.index < best.index)) best = { city, index: m.index };
    }
  }
  return best ? best.city : null;
}

/** Contact details by pattern only (no AI). Exported for tests. */
export function extractContactByPattern(text, cities = []) {
  const scan = String(text || '').slice(0, PATTERN_SCAN_CHARS);
  return {
    email: findEmailInText(scan),
    phone: findPhoneInText(scan),
    city: findCityInText(scan, cities),
  };
}

const cleanName = (v) => {
  if (typeof v !== 'string') return null;
  const n = normalizeOneLine(stripHtml(v)).trim();
  // A name: 2-50 chars, letters (any script) with spaces / ' / - / . only.
  return n.length >= 2 && n.length <= 50 && /^[\p{L}][\p{L}\s'’.-]*$/u.test(n) ? n : null;
};

async function parseQuickProfileWithAI(client, cvText) {
  const completion = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        // [quick-profile] marks this prompt (the QA sandbox stub keys on it).
        content: `[quick-profile] You read the header and contact section of a CV/resume for an Albanian job platform. Return a JSON object with exactly these fields:
- "firstName": the candidate's first name (string or "")
- "lastName": the candidate's last name (string or "")
- "email": the candidate's own email address exactly as written in the CV (string or "")
- "phone": the candidate's own phone number exactly as written in the CV (string or "")
- "city": the city where the candidate lives, from the contact/address section (string or ""). Not a past employer's or school's city.
- "title": the candidate's current or most recent job title / profession (string, max 100 chars, or "")
- "industries": up to 3 of these exact Albanian categories that fit the candidate's profession: ${QUICK_PROFILE_INDUSTRIES.join(', ')}

Only extract what is written in the CV. Never invent contact details. Use "" when a field is missing.`
      },
      { role: 'user', content: `CV:\n\n${cvText.slice(0, 6000)}` }
    ]
  });
  return JSON.parse(completion.choices[0].message.content);
}

/**
 * Read a CV (PDF / DOCX buffer) for the quick-profile confirm step.
 * Never writes to the database.
 *
 * @param {Buffer} fileBuffer
 * @param {{ cities?: string[], useAI?: boolean }} [opts]
 *   cities — canonical Location cities (the city is only returned when it is one of them)
 *   useAI  — false skips the AI call (e.g. the daily AI budget is spent)
 * @returns {Promise<{ status: 'completed'|'partial'|'failed', reason?: string,
 *   fields: { firstName?, lastName?, email?, phone?, city?, title?, interests: string[] } }>}
 *   completed = the AI read the CV; partial = only some details were found
 *   by pattern; failed = nothing usable (unreadable / scanned / empty file).
 */
export async function extractQuickProfileFromCV(fileBuffer, { cities = [], useAI = true } = {}) {
  let text;
  try {
    text = await extractTextFromCV(fileBuffer);
  } catch (error) {
    logger.warn('Quick-profile CV: text extraction failed', { error: error.message });
    return { status: 'failed', reason: 'unreadable', fields: { interests: [] } };
  }
  if (!text || text.trim().length < 20) {
    return { status: 'failed', reason: 'no_text', fields: { interests: [] } };
  }

  const byPattern = extractContactByPattern(text, cities);
  const fields = { interests: [] };
  if (byPattern.email) fields.email = byPattern.email;
  if (byPattern.phone) fields.phone = byPattern.phone;
  if (byPattern.city) fields.city = byPattern.city;

  const client = useAI ? getQuickProfileOpenAI() : null;
  let aiOk = false;
  let reason;
  if (client) {
    try {
      const ai = await parseQuickProfileWithAI(client, text);
      aiOk = true;
      const firstName = cleanName(ai?.firstName);
      const lastName = cleanName(ai?.lastName);
      if (firstName) fields.firstName = firstName;
      if (lastName) fields.lastName = lastName;
      const foldedText = foldText(text);
      // AI contacts only when they are really in the CV (anti-fabrication).
      if (!fields.email && typeof ai?.email === 'string') {
        const e = ai.email.trim().toLowerCase();
        if (isEmailFormat(e) && validator.isEmail(e) && foldedText.includes(foldText(e))) fields.email = e;
      }
      if (!fields.phone && typeof ai?.phone === 'string' && isValidAlbanianPhone(ai.phone)) {
        const digits = text.replace(/\D/g, '');
        const national = normalizeAlbanianPhone(ai.phone).slice(4); // 9 digits after +355
        if (digits.includes(national)) fields.phone = normalizeAlbanianPhone(ai.phone);
      }
      const aiCity = canonicalCity(ai?.city, cities);
      if (aiCity) fields.city = aiCity;
      if (typeof ai?.title === 'string') {
        const title = normalizeOneLine(stripHtml(ai.title)).trim().slice(0, 100);
        if (title) fields.title = title;
      }
      if (Array.isArray(ai?.industries)) {
        fields.interests = [...new Set(ai.industries.filter(i => typeof i === 'string' && QUICK_PROFILE_INDUSTRIES.includes(i)))].slice(0, 3);
      }
    } catch (error) {
      reason = 'ai_failed';
      logger.warn('Quick-profile CV: AI read failed — pattern results only', { error: error.message });
    }
  } else {
    reason = 'ai_unavailable';
  }

  const found = ['firstName', 'lastName', 'email', 'phone', 'city', 'title'].filter(k => fields[k]).length
    + fields.interests.length;
  if (aiOk) return { status: 'completed', fields };
  if (found > 0) return { status: 'partial', reason, fields };
  return { status: 'failed', reason: reason || 'nothing_found', fields };
}

/**
 * Parse CV text with GPT-4o to extract DETAILED profile data matching User model schema.
 * Used for the "Upload CV & Auto-fill Profile" feature.
 */
async function parseProfileWithAI(cvText) {
  const truncated = cvText.slice(0, 8000);

  const completion = await getOpenAI().chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.1,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `You extract DETAILED structured data from CV/resume text for an Albanian job platform. Return a JSON object with these EXACT fields:

{
  "title": "string (max 100 chars) — current or most recent job title",
  "bio": "string (max 500 chars) — professional summary/about section",
  "skills": ["string array, max 20 items, each max 50 chars — specific skills"],
  "experience": "MUST be one of: 0-1 vjet | 1-2 vjet | 2-5 vjet | 5-10 vjet | 10+ vjet — calculate from total working years",
  "workExperience": [
    {
      "position": "string (REQUIRED)",
      "company": "string (REQUIRED)",
      "location": "string or empty",
      "startDate": "YYYY-MM format string",
      "endDate": "YYYY-MM format string, or empty string if current job",
      "isCurrentJob": true/false,
      "description": "string (max 500 chars) — job responsibilities",
      "achievements": "string (max 500 chars) — key achievements"
    }
  ],
  "education": [
    {
      "degree": "MUST be one of: diploma_shkollore | certificate | bachelors | masters | phd | other — map: 'High school'/'Maturë'/'Diplomë' → diploma_shkollore; 'Certificate'/'Certifikatë' → certificate; 'Bachelor'/'BA'/'BS'/'BSc'/'Licencë' → bachelors; 'Master'/'MA'/'MS'/'MSc'/'MBA' → masters; 'PhD'/'Doctorate'/'Doktoraturë' → phd; anything else → other",
      "institution": "string (REQUIRED)",
      "fieldOfStudy": "string or empty — e.g. 'Software Engineering', 'Business Administration', 'Inxhinieri Mekanike'",
      "location": "string or empty",
      "startDate": "YYYY-MM format string",
      "endDate": "YYYY-MM format string, or empty string if current",
      "isCurrentStudy": true/false,
      "gpa": "string or empty — extract grade if present (e.g. '9.2/10', '3.8/4.0', 'Magna Cum Laude', '8.5')",
      "description": "string or empty — relevant projects, honors, thesis topic"
    }
  ],
  "languages": [
    {
      "name": "string — language name",
      "proficiency": "MUST be one of: A1 | A2 | B1 | B2 | C1 | C2 | Native"
    }
  ]
}

IMPORTANT RULES:
- Albanian month mapping: Janar=01, Shkurt=02, Mars=03, Prill=04, Maj=05, Qershor=06, Korrik=07, Gusht=08, Shtator=09, Tetor=10, Nëntor=11, Dhjetor=12
- All dates MUST be in YYYY-MM format (e.g. "2020-03"). If only year is given, use "YYYY-01".
- "experience" field: calculate total years from work history and map to the closest enum value.
- Handle multilingual CVs (Albanian, English, Italian are common).
- NEVER fabricate data — only extract what is clearly stated or strongly implied.
- If a field cannot be determined, use empty string "" or empty array [].
- For "isCurrentJob"/"isCurrentStudy": set true only if explicitly stated as current/present/ongoing.
- Order work experience and education by most recent first.`
      },
      {
        role: 'user',
        content: `Extract detailed structured profile data from this CV:\n\n${truncated}`
      }
    ]
  });

  return JSON.parse(completion.choices[0].message.content);
}

const EXPERIENCE_ENUMS = ['0-1 vjet', '1-2 vjet', '2-5 vjet', '5-10 vjet', '10+ vjet'];
const PROFICIENCY_ENUMS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'Native'];
const DATE_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

// Frontend education dropdown uses these enum values. AI may return free-text
// labels ("Bachelor", "BsC", "Master") which would leave the dropdown unselected
// in the edit modal — normalize at parse time so saved value matches the form.
const DEGREE_ENUMS = ['diploma_shkollore', 'certificate', 'bachelors', 'masters', 'phd', 'other'];

// 64: words/abbreviations are matched as WHOLE tokens (start-of-token for the
// spelled-out words, both ends for abbreviations). The previous patterns
// matched any word starting with "ma"/"ms" — "Bachelor in Management",
// "Maturë Shtetërore", "Bachelor në Matematikë" all became 'masters'.
// \p{L} (Unicode letter) instead of \b, which treats ë/ç as non-letters.
const TOKEN_START = '(?:^|[^\\p{L}])';
const TOKEN_END = '(?=$|[^\\p{L}])';
const degreeRe = (body, { wholeWord = false } = {}) =>
  new RegExp(`${TOKEN_START}(?:${body})${wholeWord ? TOKEN_END : ''}`, 'iu');
const DEGREE_RULES = [
  ['phd', degreeRe('doktor|doctor|ph\\.?\\s?d')],
  ['masters', degreeRe('master|magjist')],
  ['masters', degreeRe('m\\.?\\s?sc|m\\.?\\s?a|m\\.?\\s?s|m\\.?\\s?b\\.?\\s?a|mph|msh', { wholeWord: true })],
  ['bachelors', degreeRe('bachelor|baçelor|licenc|license|licence|undergraduate')],
  ['bachelors', degreeRe('b\\.?\\s?sc|b\\.?\\s?a|b\\.?\\s?s|b\\.?\\s?eng', { wholeWord: true })],
  ['certificate', degreeRe('certifi|certifik')],
  ['diploma_shkollore', degreeRe('matur|gjimnaz|high\\s*school|secondary|shkoll\\p{L}*\\s+(?:e\\s+)?mesm|shkoll\\p{L}*\\s+profesional|e\\s+mesme|diplom')],
];
function normalizeDegreeToEnum(raw) {
  if (!raw || typeof raw !== 'string') return 'other';
  const v = raw.trim().toLowerCase();
  if (DEGREE_ENUMS.includes(v)) return v;
  for (const [degree, re] of DEGREE_RULES) {
    if (re.test(v)) return degree;
  }
  return 'other';
}

// Dates the profile accepts (routes/users.js parseHistoryDate): 1950…now+10.
const CV_MIN_YEAR = 1950;
/**
 * Normalize a CV date to 'YYYY-MM' (the profile's format), or '' when it
 * can't be read. Besides 'YYYY-MM' accepts 'YYYY-M', 'YYYY/MM', 'MM/YYYY',
 * 'MM.YYYY' and a bare 'YYYY' (CVs often list only years — they used to be
 * blanked, then stored as null and shown as "1970 – Tani"). A bare year is
 * read as January for a start date and December for an end date.
 */
function normalizeCvDate(raw, { isEnd = false } = {}) {
  if (typeof raw !== 'string') return '';
  const v = raw.trim();
  let year;
  let month;
  let m;
  if ((m = v.match(/^(\d{4})[-/.](\d{1,2})$/))) [, year, month] = m;
  else if ((m = v.match(/^(\d{1,2})[-/.](\d{4})$/))) [, month, year] = m;
  else if ((m = v.match(/^(\d{4})$/))) { year = m[1]; month = isEnd ? '12' : '01'; }
  else return '';
  const y = Number(year);
  const mo = Number(month);
  if (mo < 1 || mo > 12 || y < CV_MIN_YEAR || y > new Date().getFullYear() + 10) return '';
  return `${y}-${String(mo).padStart(2, '0')}`;
}

/**
 * Calculate experience enum from work history entries.
 */
function calculateExperienceFromHistory(workEntries) {
  if (!workEntries || workEntries.length === 0) return null;

  let totalMonths = 0;
  const now = new Date();

  for (const entry of workEntries) {
    if (!entry.startDate || !DATE_REGEX.test(entry.startDate)) continue;
    const start = new Date(entry.startDate + '-01');
    let end;
    if (entry.isCurrentJob) {
      end = now;
    } else if (entry.endDate && DATE_REGEX.test(entry.endDate)) {
      end = new Date(entry.endDate + '-01');
    } else {
      // 64: a PAST job whose end date is unknown is not counted — treating it
      // as "until today" turned a 2005–2007 job into "10+ vjet".
      continue;
    }
    const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
    if (months > 0) totalMonths += months;
  }

  const years = totalMonths / 12;
  if (years < 1) return '0-1 vjet';
  if (years < 2) return '1-2 vjet';
  if (years < 5) return '2-5 vjet';
  if (years < 10) return '5-10 vjet';
  return '10+ vjet';
}

/**
 * Sanitize and validate parsed profile data to match User model constraints.
 */
function sanitizeParsedProfile(parsed) {
  const result = {};

  // Title (max 100)
  if (parsed.title && typeof parsed.title === 'string') {
    result.title = parsed.title.trim().slice(0, 100);
  }

  // Bio (max 500)
  if (parsed.bio && typeof parsed.bio === 'string') {
    result.bio = parsed.bio.trim().slice(0, 500);
  }

  // Skills (max 20, each max 50)
  if (Array.isArray(parsed.skills)) {
    result.skills = parsed.skills
      .filter(s => typeof s === 'string' && s.trim())
      .map(s => s.trim().slice(0, 50))
      .slice(0, 20);
  }

  // Work Experience — filter entries missing required fields, validate dates
  if (Array.isArray(parsed.workExperience)) {
    result.workExperience = parsed.workExperience
      .filter(w => w && typeof w.position === 'string' && w.position.trim() && typeof w.company === 'string' && w.company.trim())
      .map(w => ({
        position: w.position.trim().slice(0, 100),
        company: w.company.trim().slice(0, 100),
        location: typeof w.location === 'string' ? w.location.trim().slice(0, 100) : '',
        startDate: normalizeCvDate(w.startDate),
        endDate: w.isCurrentJob === true ? '' : normalizeCvDate(w.endDate, { isEnd: true }),
        isCurrentJob: w.isCurrentJob === true,
        description: typeof w.description === 'string' ? w.description.trim().slice(0, 500) : '',
        achievements: typeof w.achievements === 'string' ? w.achievements.trim().slice(0, 500) : ''
      }));
  }

  // Education — filter entries missing required fields, validate dates
  if (Array.isArray(parsed.education)) {
    result.education = parsed.education
      .filter(e => e && typeof e.degree === 'string' && e.degree.trim() && typeof e.institution === 'string' && e.institution.trim())
      .map(e => ({
        degree: normalizeDegreeToEnum(e.degree),
        institution: e.institution.trim().slice(0, 100),
        fieldOfStudy: typeof e.fieldOfStudy === 'string' ? e.fieldOfStudy.trim().slice(0, 100) : '',
        location: typeof e.location === 'string' ? e.location.trim().slice(0, 100) : '',
        startDate: normalizeCvDate(e.startDate),
        endDate: e.isCurrentStudy === true ? '' : normalizeCvDate(e.endDate, { isEnd: true }),
        isCurrentStudy: e.isCurrentStudy === true,
        gpa: typeof e.gpa === 'string' ? e.gpa.trim().slice(0, 20) : '',
        description: typeof e.description === 'string' ? e.description.trim().slice(0, 500) : ''
      }));
  }

  // Experience enum — validate or recalculate from work history
  if (parsed.experience && EXPERIENCE_ENUMS.includes(parsed.experience)) {
    result.experience = parsed.experience;
  } else {
    result.experience = calculateExperienceFromHistory(result.workExperience) || '0-1 vjet';
  }

  // Languages — validate proficiency enum
  if (Array.isArray(parsed.languages)) {
    result.languages = parsed.languages
      .filter(l => l && typeof l.name === 'string' && l.name.trim())
      .map(l => ({
        name: l.name.trim().slice(0, 50),
        proficiency: PROFICIENCY_ENUMS.includes(l.proficiency) ? l.proficiency : 'B1'
      }));
  }

  return result;
}

/**
 * Parse a user's CV (PDF or DOCX) and return structured profile data for preview.
 * Does NOT save to database — returns data for frontend to preview & apply.
 * @param {Buffer} fileBuffer - The raw file buffer (PDF or DOCX)
 * @returns {{ success: boolean, data?: object, error?: string }}
 */
export async function parseUserProfileCV(fileBuffer) {
  if (!process.env.OPENAI_API_KEY) {
    logger.warn('OpenAI API key not configured — skipping CV parsing');
    return { success: false, error: 'OpenAI API key not configured' };
  }

  // Step 1: Extract text from CV (auto-detects PDF vs DOCX)
  const cvText = await extractTextFromCV(fileBuffer);

  if (!cvText || cvText.trim().length < 20) {
    logger.warn('CV parsing skipped — file had no extractable text');
    return { success: false, error: 'Skedari ka pak ose aspak tekst të lexueshëm' };
  }

  // Step 2: Parse with AI
  const parsed = await parseProfileWithAI(cvText);

  // Step 3: Sanitize and validate
  const data = sanitizeParsedProfile(parsed);

  logger.info('User profile CV parsed successfully', {
    title: data.title,
    skillCount: data.skills?.length,
    workCount: data.workExperience?.length,
    eduCount: data.education?.length
  });

  return { success: true, data };
}

// Exported for testing — pure functions with no I/O
export const _internal = {
  extractTextFromCV,
  foldText,
  cityVariants,
  extractTextFromPDF,
  extractTextFromDOCX,
  calculateExperienceFromHistory,
  sanitizeParsedProfile,
  normalizeDegreeToEnum,
  normalizeCvDate,
  EXPERIENCE_ENUMS,
  PROFICIENCY_ENUMS,
  DATE_REGEX,
};

export default { parseQuickUserCV, parseUserProfileCV, extractQuickProfileFromCV };
