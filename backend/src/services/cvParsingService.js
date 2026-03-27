import OpenAI from 'openai';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import mammoth from 'mammoth';
import { QuickUser } from '../models/index.js';
import logger from '../config/logger.js';

// Lazy-init to avoid throwing at import time when API key is not yet set
let openai;
function getOpenAI() {
  if (!openai) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openai;
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
- "industries": array of industries the person has worked in, using these Albanian categories where possible: Teknologji, Marketing, Shitje, Financë, Burime Njerëzore, Inxhinieri, Dizajn, Menaxhim, Shëndetësi, Arsim, Turizëm, Ndërtim, Transport. Max 3.
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
 * @param {string} quickUserId - The QuickUser's MongoDB ID
 * @param {Buffer} fileBuffer - The raw file buffer (PDF or DOCX)
 */
export async function parseQuickUserCV(quickUserId, fileBuffer) {
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
      "degree": "string (REQUIRED) — e.g. Bachelor, Master, PhD, Diploma",
      "institution": "string (REQUIRED)",
      "fieldOfStudy": "string or empty",
      "location": "string or empty",
      "startDate": "YYYY-MM format string",
      "endDate": "YYYY-MM format string, or empty string if current",
      "isCurrentStudy": true/false,
      "gpa": "string or empty",
      "description": "string or empty"
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
    if (entry.isCurrentJob || !entry.endDate || !DATE_REGEX.test(entry.endDate)) {
      end = now;
    } else {
      end = new Date(entry.endDate + '-01');
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
        startDate: DATE_REGEX.test(w.startDate) ? w.startDate : '',
        endDate: w.isCurrentJob ? '' : (DATE_REGEX.test(w.endDate) ? w.endDate : ''),
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
        degree: e.degree.trim().slice(0, 100),
        institution: e.institution.trim().slice(0, 100),
        fieldOfStudy: typeof e.fieldOfStudy === 'string' ? e.fieldOfStudy.trim().slice(0, 100) : '',
        location: typeof e.location === 'string' ? e.location.trim().slice(0, 100) : '',
        startDate: DATE_REGEX.test(e.startDate) ? e.startDate : '',
        endDate: e.isCurrentStudy ? '' : (DATE_REGEX.test(e.endDate) ? e.endDate : ''),
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

export default { parseQuickUserCV, parseUserProfileCV };
