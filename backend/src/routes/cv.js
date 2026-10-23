import express from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import mammoth from 'mammoth';
import { authenticate, requireJobSeeker } from '../middleware/auth.js';
import { validateObjectId, stripHtml } from '../utils/sanitize.js';
import { extractCVDataFromText, CVExtractionError } from '../services/openaiService.js';
import { generateCVDocument } from '../services/cvDocumentService.js';
import { generateCVPdf } from '../services/cvPdfService.js';
import User from '../models/User.js';
import File from '../models/File.js';
import logger from '../config/logger.js';
import { fireEmbedding } from '../services/embeddingTrigger.js';
import { incrementAndCheck, refund } from '../lib/dailyQuota.js';
import { storeResumeBuffer, deleteStoredResume, swapProfileResume } from '../lib/resumeStorage.js';

// Cost-cap for CV generation. CV gen uses gpt-4o (~$0.018/CV at typical token usage).
// Two layers:
//   - Hourly limit (express-rate-limit): bounds burst spend per user per window
//   - Daily cap (dailyQuota): bounds 24h spend per user
// Round P tighten: 2/hr + 5/day. Legit users iterate a few times then settle;
// abusers can't compound. Admins bypass daily cap. Both env-overridable.
//   OPENAI_CV_HOURLY_CAP  default 2  (overridable via env if you need to loosen)
//   OPENAI_CV_DAILY_CAP   default 5
const CV_HOURLY_CAP = parseInt(process.env.OPENAI_CV_HOURLY_CAP, 10) || 2;
const CV_DAILY_CAP = parseInt(process.env.OPENAI_CV_DAILY_CAP, 10) || 5;

const router = express.Router();

// Rate limiting for CV generation (expensive OpenAI calls).
// Keyed on the authenticated userId so rotating IPs / Tor exits cannot bypass
// the cost ceiling. Falls back to IP only if (somehow) called pre-auth.
const cvGenerateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: CV_HOURLY_CAP,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || ipKeyGenerator(req.ip),
  skip: () => process.env.NODE_ENV !== 'production' && process.env.SKIP_RATE_LIMIT === 'true',
  // O-71: requests that never got an OpenAI completion (bad input, feature
  // off, API/connection error) don't burn one of the user's 2/hr. Everything
  // that got a completion counts — even if it was then unusable (refusal,
  // truncated, bad JSON): OpenAI billed it (review #1). A client abort is
  // un-counted by the library itself; the daily cap below still holds then.
  skipFailedRequests: true,
  requestWasSuccessful: (req, res) => res.statusCode < 400 || req.cvCompletionReceived === true,
  message: {
    success: false,
    message: `Keni arritur limitin e krijimit të CV-ve (${CV_HOURLY_CAP}/orë). Provoni përsëri pas 1 ore.`
  }
});

// Bounds Cloudinary uploads from POST /use-as-profile (O-70).
const useAsProfileLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || ipKeyGenerator(req.ip),
  skip: () => process.env.NODE_ENV !== 'production' && process.env.SKIP_RATE_LIMIT === 'true',
  message: {
    success: false,
    message: 'Shumë kërkesa. Provoni përsëri pas 1 ore.'
  }
});

// POST /api/cv/generate - Generate CV from natural language
router.post('/generate', authenticate, requireJobSeeker, cvGenerateLimiter, async (req, res) => {
  // Daily-quota key reserved below; refunded if generation fails (O-71).
  let reservedQuotaKey = null;
  try {
    // Fail fast with 503 (not 500) when OpenAI isn't configured.
    // Without this guard, every request would 500 deep inside the OpenAI
    // SDK and confuse users with "internal server error" instead of
    // "feature unavailable".
    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({
        success: false,
        message: 'Krijimi i CV-së me AI nuk është i disponueshëm për momentin'
      });
    }

    const { naturalLanguageInput, targetLanguage = 'sq' } = req.body;

    // Validate input length
    if (!naturalLanguageInput || typeof naturalLanguageInput !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Ju lutemi jepni informacion rreth vetes (minimumi 50 karaktere)'
      });
    }

    const sanitizedInput = naturalLanguageInput.trim().replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

    if (sanitizedInput.length < 50) {
      return res.status(400).json({
        success: false,
        message: 'Ju lutemi jepni të paktën 50 karaktere informacion'
      });
    }

    if (sanitizedInput.length > 10000) {
      return res.status(400).json({
        success: false,
        message: 'Inputi nuk mund të kalojë 10,000 karaktere'
      });
    }

    // Pre-deploy audit (O-D): daily quota check. Admins bypass.
    if (req.user.userType !== 'admin') {
      const quotaKey = `cv:${req.user._id}`;
      const { allowed, count, remaining } = await incrementAndCheck(quotaKey, CV_DAILY_CAP);
      if (!allowed) {
        // The over-cap attempt itself must not keep the counter climbing.
        await refund(quotaKey);
        logger.info('cv/generate daily cap hit', { userId: String(req.user._id), count, cap: CV_DAILY_CAP });
        return res.status(429).json({
          success: false,
          message: `Limiti ditor i krijimit të CV-ve është arritur (${CV_DAILY_CAP}/ditë). Provoni nesër.`,
          data: { remaining, cap: CV_DAILY_CAP },
        });
      }
      reservedQuotaKey = quotaKey;
    }

    // Current AI CV pair — replaced (and deleted) once the new pair is saved (O-71).
    const previous = await User.findById(req.user._id)
      .select('profile.jobSeekerProfile.cvFile profile.jobSeekerProfile.cvPdfFile')
      .lean();

    // Extract structured data using OpenAI with target language
    const extractionResult = await extractCVDataFromText(sanitizedInput, targetLanguage);
    // A billed completion exists from here on: this attempt counts against
    // both caps whatever happens next.
    req.cvCompletionReceived = true;
    const cvData = extractionResult.data;

    // Render the SAME cvData as both a Word doc and a PDF. The expensive
    // step (the OpenAI call above) ran once; rendering twice is just a few
    // ms of layout work. DOCX = editable Word file; PDF = viewable inline.
    const [docBuffer, pdfBuffer] = await Promise.all([
      generateCVDocument(cvData, targetLanguage),
      generateCVPdf(cvData, targetLanguage),
    ]);

    const baseName = `CV_${req.user.profile.firstName}_${req.user.profile.lastName}_${Date.now()}`;
    const docxName = `${baseName}.docx`;
    const pdfName = `${baseName}.pdf`;

    const docxFile = new File({
      fileName: docxName,
      fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      fileSize: docBuffer.length,
      uploadedBy: req.user._id,
      fileCategory: 'cv',
      fileData: docBuffer,
    });
    const pdfFile = new File({
      fileName: pdfName,
      fileType: 'application/pdf',
      fileSize: pdfBuffer.length,
      uploadedBy: req.user._id,
      fileCategory: 'cv',
      fileData: pdfBuffer,
    });
    await Promise.all([docxFile.save(), pdfFile.save()]);

    // Point the profile at the new pair. Compare-and-swap on the pair we
    // expect to replace so concurrent generations can't orphan File docs
    // (review #7): whoever displaces a pair deletes it; on a lost race we
    // re-read and displace the winner's pair instead (last writer wins).
    // O-71: deleting displaced pairs keeps the binary-in-Mongo files from
    // growing unboundedly. Safe even if a displaced PDF was set as the profile
    // CV: POST /use-as-profile stores its own copy of the bytes.
    let expected = previous?.profile?.jobSeekerProfile || {};
    let swapped = false;
    for (let attempt = 0; attempt < 5 && !swapped; attempt++) {
      const result = await User.updateOne(
        { _id: req.user._id, 'profile.jobSeekerProfile.cvPdfFile': expected.cvPdfFile ?? null },
        { $set: {
          'profile.jobSeekerProfile.aiGeneratedCV': cvData,
          'profile.jobSeekerProfile.cvFile': docxFile._id,
          'profile.jobSeekerProfile.cvPdfFile': pdfFile._id,
          'profile.jobSeekerProfile.cvGeneratedAt': new Date(),
          'profile.jobSeekerProfile.cvLastUpdatedAt': new Date()
        } }
      );
      if (result.matchedCount === 1) {
        swapped = true;
        const displaced = [expected.cvFile, expected.cvPdfFile].filter(Boolean);
        if (displaced.length > 0) {
          try {
            await File.deleteMany({ _id: { $in: displaced }, uploadedBy: req.user._id });
          } catch (cleanupError) {
            logger.warn('cv/generate: failed to delete previous CV files (non-fatal)', { error: cleanupError.message });
          }
        }
      } else {
        const current = await User.findById(req.user._id)
          .select('profile.jobSeekerProfile.cvFile profile.jobSeekerProfile.cvPdfFile')
          .lean();
        expected = current?.profile?.jobSeekerProfile || {};
      }
    }
    if (!swapped) {
      // Pathological contention: don't leave our pair behind unreferenced.
      await File.deleteMany({ _id: { $in: [docxFile._id, pdfFile._id] } }).catch(() => {});
      throw new Error('cv/generate: could not attach the generated CV (concurrent updates)');
    }

    // Generation succeeded — the reserved daily-quota unit is now spent.
    reservedQuotaKey = null;

    // Re-generate embedding with rich AI CV data (skills, summary, certs, languages)
    fireEmbedding({ kind: 'jobseeker', id: req.user._id, reason: 'cv-generate' });

    res.json({
      success: true,
      message: 'CV generated successfully',
      data: {
        cvData,
        language: cvData.language,
        files: {
          pdf: { fileId: pdfFile._id, fileName: pdfName, fileSize: pdfBuffer.length },
          docx: { fileId: docxFile._id, fileName: docxName, fileSize: docBuffer.length },
        },
        // Legacy fields — kept so an older cached frontend build keeps working.
        fileId: docxFile._id,
        fileName: docxName,
        fileSize: docBuffer.length,
        downloadUrl: `/api/cv/download/${docxFile._id}`,
        previewUrl: `/api/cv/preview/${pdfFile._id}`,
      }
    });

  } catch (error) {
    logger.error('CV generation error:', error.message);
    if (error instanceof CVExtractionError && error.completionReceived) {
      req.cvCompletionReceived = true;
    }
    // O-71: only an attempt that never got an OpenAI completion gives the
    // reserved daily-quota unit back (review #1: refusals/truncations/bad JSON
    // are billed, so refunding them allowed unlimited paid calls).
    if (reservedQuotaKey && !req.cvCompletionReceived) await refund(reservedQuotaKey);

    if (error instanceof CVExtractionError && error.reason === 'refusal') {
      return res.status(422).json({
        success: false,
        message: 'AI nuk mund ta përpunojë këtë tekst. Përdorni vetëm informacion profesional për veten (përvojë, arsim, aftësi) dhe provoni përsëri.'
      });
    }
    if (error instanceof CVExtractionError && error.reason === 'truncated') {
      return res.status(422).json({
        success: false,
        message: 'CV-ja doli shumë e gjatë për t\'u krijuar. Shkurtoni tekstin dhe provoni përsëri.'
      });
    }
    // #60: bounded AI calls answer with a clear status instead of the socket
    // being cut (502 at the proxy) or a generic 500.
    if (error instanceof CVExtractionError && error.reason === 'timeout') {
      return res.status(504).json({
        success: false,
        message: 'Krijimi i CV-së po zgjat më shumë se zakonisht. Provoni përsëri pas pak minutash.'
      });
    }
    if (error instanceof CVExtractionError && (error.reason === 'unavailable' || error.reason === 'not_configured')) {
      return res.status(503).json({
        success: false,
        message: 'Shërbimi i AI për CV-të nuk është i disponueshëm për momentin. Provoni përsëri pas pak minutash.'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Gabim në krijimin e CV-së'
    });
  }
});

// POST /api/cv/use-as-profile - Set the latest AI-generated PDF as the profile CV (O-70)
// Owner ruling: never automatic — only when the jobseeker clicks
// "Përdore si CV-në time". The PDF bytes are COPIED into resume storage the
// same way uploads are stored (lib/resumeStorage.js → Cloudinary authenticated,
// public_id resume-<userId>-<ms>), so employers with an application open it
// through the existing POST /api/users/resume/sign flow, and later
// regenerations (which delete the old File docs) can't break it.
router.post('/use-as-profile', authenticate, requireJobSeeker, useAsProfileLimiter, async (req, res) => {
  let stored = null;
  try {
    const user = await User.findById(req.user._id)
      .select('profile.jobSeekerProfile.cvPdfFile profile.jobSeekerProfile.resume')
      .lean();
    const pdfFileId = user?.profile?.jobSeekerProfile?.cvPdfFile;
    if (!pdfFileId) {
      return res.status(404).json({
        success: false,
        message: 'Nuk keni një CV të krijuar me AI. Krijoni një CV fillimisht.'
      });
    }

    // Stale-tab guard: the client names the PDF it is showing; if the user
    // regenerated elsewhere since, don't silently attach a different CV.
    const { fileId } = req.body || {};
    if (fileId !== undefined && String(fileId) !== String(pdfFileId)) {
      return res.status(409).json({
        success: false,
        message: 'Kjo CV është zëvendësuar nga një CV më e re. Rifreskoni faqen dhe provoni përsëri.'
      });
    }

    const file = await File.findOne({ _id: pdfFileId, uploadedBy: req.user._id });
    if (!file || !file.fileData) {
      return res.status(404).json({
        success: false,
        message: 'Nuk keni një CV të krijuar me AI. Krijoni një CV fillimisht.'
      });
    }
    const pdfBuffer = Buffer.isBuffer(file.fileData) ? file.fileData : Buffer.from(file.fileData);

    try {
      stored = await storeResumeBuffer(pdfBuffer, req.user._id);
    } catch (storeError) {
      logger.error('cv/use-as-profile: storage failed', { error: storeError.message });
      return res.status(503).json({
        success: false,
        message: 'Ruajtja e CV-së nuk është e disponueshme momentalisht. Provoni përsëri më vonë.'
      });
    }

    // $set only the two paths (not user.save()) so unrelated legacy profile
    // data can't fail validation and strand the freshly stored file. The swap
    // is compare-and-set and deletes the CV it replaces (same as a
    // re-upload), so parallel clicks can't orphan stored copies (review #7).
    const { displacedUrl: previousResumeUrl } = await swapProfileResume(req.user._id, stored.url, {
      resumeType: 'pdf',
      expectedUrl: user.profile.jobSeekerProfile.resume,
    });
    const resumeUrl = stored.url;
    stored = null; // now referenced by the profile

    return res.json({
      success: true,
      message: 'CV-ja e krijuar me AI u vendos si CV-ja juaj në profil',
      data: { resumeUrl, resumeType: 'pdf', replacedExisting: !!previousResumeUrl }
    });
  } catch (error) {
    logger.error('cv/use-as-profile error:', error.message);
    if (stored) await deleteStoredResume(stored.url, req.user._id);
    return res.status(500).json({ success: false, message: 'Gabim në vendosjen e CV-së në profil' });
  }
});

// GET /api/cv/download/:fileId - Download CV
router.get('/download/:fileId', validateObjectId('fileId'), authenticate, async (req, res) => {
  try {
    const file = await File.findById(req.params.fileId);

    if (!file) {
      return res.status(404).json({ success: false, message: 'File not found' });
    }

    // Verify ownership
    if (file.uploadedBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    res.setHeader('Content-Type', file.fileType);
    const safeName = file.fileName.replace(/[^\w.-]/g, '_');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    res.send(file.fileData);

  } catch (error) {
    logger.error('CV download error:', error.message);
    res.status(500).json({ success: false, message: 'Gabim në shkarkimin e CV' });
  }
});

// GET /api/cv/preview/:fileId - Preview CV (same as download but inline)
router.get('/preview/:fileId', validateObjectId('fileId'), authenticate, async (req, res) => {
  try {
    const file = await File.findById(req.params.fileId);

    if (!file) {
      return res.status(404).json({ success: false, message: 'File not found' });
    }

    // Verify ownership
    if (file.uploadedBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    const isDocx = file.fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      || file.fileName.endsWith('.docx');

    if (isDocx) {
      // Convert DOCX to HTML so browsers can display it in a new tab
      const result = await mammoth.convertToHtml({ buffer: Buffer.isBuffer(file.fileData) ? file.fileData : Buffer.from(file.fileData) });
      // Sanitize mammoth output: strip <script>, <iframe>, on* attributes to prevent XSS
      const sanitized = result.value
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '')
        .replace(/<object\b[^>]*>[\s\S]*?<\/object>/gi, '')
        .replace(/<embed\b[^>]*>/gi, '')
        .replace(/\bon\w+\s*=\s*["'][^"']*["']/gi, '')
        .replace(/\bon\w+\s*=\s*[^\s>]*/gi, '')
        .replace(/javascript\s*:/gi, '');
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>CV</title><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:;"><style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;padding:0 20px;line-height:1.6;color:#333}h1,h2,h3{color:#1a1a1a}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:8px}</style></head><body>${sanitized}</body></html>`;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } else {
      res.setHeader('Content-Type', file.fileType);
      const safePreviewName = file.fileName.replace(/[^\w.-]/g, '_');
      res.setHeader('Content-Disposition', `inline; filename="${safePreviewName}"`);
      res.send(file.fileData);
    }

  } catch (error) {
    logger.error('CV preview error:', error.message);
    res.status(500).json({ success: false, message: 'Gabim në shikimin e CV' });
  }
});

// GET /api/cv/my-cv - Get current user's CV data
router.get('/my-cv', authenticate, requireJobSeeker, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate('profile.jobSeekerProfile.cvFile')
      .populate('profile.jobSeekerProfile.cvPdfFile');

    if (!user.profile?.jobSeekerProfile?.aiGeneratedCV) {
      return res.status(404).json({
        success: false,
        message: 'No CV found. Please generate one first.'
      });
    }

    res.json({
      success: true,
      data: {
        cvData: user.profile.jobSeekerProfile.aiGeneratedCV,
        cvFile: user.profile.jobSeekerProfile.cvFile,
        cvPdfFile: user.profile.jobSeekerProfile.cvPdfFile,
        generatedAt: user.profile.jobSeekerProfile.cvGeneratedAt,
        lastUpdatedAt: user.profile.jobSeekerProfile.cvLastUpdatedAt
      }
    });

  } catch (error) {
    logger.error('Get CV error:', error.message);
    res.status(500).json({ success: false, message: 'Gabim në marrjen e CV' });
  }
});

export default router;
