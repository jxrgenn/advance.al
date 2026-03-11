import express from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate, requireJobSeeker } from '../middleware/auth.js';
import { extractCVDataFromText } from '../services/openaiService.js';
import { generateCVDocument } from '../services/cvDocumentService.js';
import User from '../models/User.js';
import File from '../models/File.js';

const router = express.Router();

// Rate limiting for CV generation (expensive OpenAI calls)
const cvGenerateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 requests per hour per IP
  message: {
    success: false,
    message: 'Keni arritur limitin e gjenerimit të CV. Provoni përsëri pas 1 ore.'
  }
});

// POST /api/cv/generate - Generate CV from natural language
router.post('/generate', cvGenerateLimiter, authenticate, requireJobSeeker, async (req, res) => {
  try {
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

    // Extract structured data using OpenAI with target language
    const extractionResult = await extractCVDataFromText(sanitizedInput, targetLanguage);
    const cvData = extractionResult.data;

    // Generate Word document in the target language
    const docBuffer = await generateCVDocument(cvData, targetLanguage);

    // Save file to File model
    const fileName = `CV_${req.user.profile.firstName}_${req.user.profile.lastName}_${Date.now()}.docx`;

    // Create File document
    const cvFile = new File({
      fileName: fileName,
      fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      fileSize: docBuffer.length,
      uploadedBy: req.user._id,
      fileCategory: 'cv',
      fileData: docBuffer
    });
    await cvFile.save();

    // Update user profile with CV data
    await User.findByIdAndUpdate(req.user._id, {
      'profile.jobSeekerProfile.aiGeneratedCV': cvData,
      'profile.jobSeekerProfile.cvFile': cvFile._id,
      'profile.jobSeekerProfile.cvGeneratedAt': new Date(),
      'profile.jobSeekerProfile.cvLastUpdatedAt': new Date()
    });

    res.json({
      success: true,
      message: 'CV generated successfully',
      data: {
        cvData,
        fileId: cvFile._id,
        fileName: fileName,
        fileSize: docBuffer.length,
        language: cvData.language,
        downloadUrl: `/api/cv/download/${cvFile._id}`,
        previewUrl: `/api/cv/preview/${cvFile._id}`
      }
    });

  } catch (error) {
    console.error('CV generation error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Gabim në gjenerimin e CV'
    });
  }
});

// GET /api/cv/download/:fileId - Download CV
router.get('/download/:fileId', authenticate, async (req, res) => {
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
    res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
    res.send(file.fileData);

  } catch (error) {
    console.error('CV download error:', error.message);
    res.status(500).json({ success: false, message: 'Gabim në shkarkimin e CV' });
  }
});

// GET /api/cv/preview/:fileId - Preview CV (same as download but inline)
router.get('/preview/:fileId', authenticate, async (req, res) => {
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
    res.setHeader('Content-Disposition', `inline; filename="${file.fileName}"`);
    res.send(file.fileData);

  } catch (error) {
    console.error('CV preview error:', error.message);
    res.status(500).json({ success: false, message: 'Gabim në shikimin e CV' });
  }
});

// GET /api/cv/my-cv - Get current user's CV data
router.get('/my-cv', authenticate, requireJobSeeker, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate('profile.jobSeekerProfile.cvFile');

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
        generatedAt: user.profile.jobSeekerProfile.cvGeneratedAt,
        lastUpdatedAt: user.profile.jobSeekerProfile.cvLastUpdatedAt
      }
    });

  } catch (error) {
    console.error('Get CV error:', error.message);
    res.status(500).json({ success: false, message: 'Gabim në marrjen e CV' });
  }
});

export default router;
