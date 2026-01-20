import express from 'express';
import { authenticate, requireJobSeeker } from '../middleware/auth.js';
import { extractCVDataFromText } from '../services/openaiService.js';
import { generateCVDocument } from '../services/cvDocumentService.js';
import User from '../models/User.js';
import File from '../models/File.js';

const router = express.Router();

// POST /api/cv/generate - Generate CV from natural language
router.post('/generate', authenticate, requireJobSeeker, async (req, res) => {
  try {
    const { naturalLanguageInput, targetLanguage = 'sq' } = req.body;

    console.log(`📝 CV generation request from user: ${req.user._id}, target language: ${targetLanguage}`);

    // Validate input
    if (!naturalLanguageInput || naturalLanguageInput.trim().length < 50) {
      return res.status(400).json({
        success: false,
        message: 'Please provide at least 50 characters of information about yourself'
      });
    }

    // Extract structured data using OpenAI with target language
    console.log('🤖 Calling OpenAI to extract CV data...');
    const extractionResult = await extractCVDataFromText(naturalLanguageInput, targetLanguage);
    const cvData = extractionResult.data;

    console.log(`✅ CV data extracted - Language: ${cvData.language}`);

    // Generate Word document in the target language
    console.log('📄 Generating Word document...');
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

    console.log(`💾 CV file saved with ID: ${cvFile._id}`);

    // Update user profile with CV data
    await User.findByIdAndUpdate(req.user._id, {
      'profile.jobSeekerProfile.aiGeneratedCV': cvData,
      'profile.jobSeekerProfile.cvFile': cvFile._id,
      'profile.jobSeekerProfile.cvGeneratedAt': new Date(),
      'profile.jobSeekerProfile.cvLastUpdatedAt': new Date()
    });

    console.log('✅ User profile updated with CV data');

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
    console.error('❌ CV Generation Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate CV',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
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

    console.log(`⬇️ User ${req.user._id} downloading CV: ${file.fileName}`);

    res.setHeader('Content-Type', file.fileType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
    res.send(file.fileData);

  } catch (error) {
    console.error('❌ Download error:', error);
    res.status(500).json({ success: false, message: error.message });
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

    console.log(`👁️ User ${req.user._id} previewing CV: ${file.fileName}`);

    res.setHeader('Content-Type', file.fileType);
    res.setHeader('Content-Disposition', `inline; filename="${file.fileName}"`);
    res.send(file.fileData);

  } catch (error) {
    console.error('❌ Preview error:', error);
    res.status(500).json({ success: false, message: error.message });
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
    console.error('❌ Get CV error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
