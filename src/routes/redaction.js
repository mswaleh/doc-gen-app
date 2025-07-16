const express = require('express');
const { body, param, validationResult } = require('express-validator');
const RedactionService = require('../services/redactionService');
const FileService = require('../services/fileService');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * POST /api/redaction/prepare
 * Prepare PDF for redaction by converting to images and returning metadata
 */
router.post('/prepare', [
  body('platform')
    .isIn(['gcp', 'aws', 'azure'])
    .withMessage('Platform must be gcp, aws, or azure'),
  body('bucket')
    .trim()
    .isLength({ min: 1 })
    .withMessage('Bucket name is required'),
  body('fileName')
    .trim()
    .isLength({ min: 1 })
    .withMessage('File name is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { platform, bucket, fileName } = req.body;

    // Validate file type
    if (!FileService.isPDFFile(fileName)) {
      return res.status(400).json({
        error: 'Only PDF files can be redacted',
        supportedTypes: ['PDF']
      });
    }

    logger.logRequest(req, `Prepare PDF for redaction: ${platform}/${bucket}/${fileName}`);

    const redactionService = new RedactionService(platform);
    const preparationResult = await redactionService.preparePDFForRedaction(bucket, fileName);

    res.json({
      success: true,
      platform: platform,
      fileName: fileName,
      sessionId: preparationResult.sessionId,
      pageCount: preparationResult.pageCount,
      pages: preparationResult.pages,
      pdfMetadata: preparationResult.metadata
    });

  } catch (error) {
    logger.logError(error, {
      endpoint: '/api/redaction/prepare',
      platform: req.body.platform,
      bucket: req.body.bucket,
      fileName: req.body.fileName,
      user: req.user.username
    });

    res.status(500).json({
      error: 'Failed to prepare PDF for redaction',
      message: error.message
    });
  }
});

/**
 * POST /api/redaction/apply
 * Apply redactions to PDF and return redacted document
 */
router.post('/apply', [
  body('sessionId')
    .trim()
    .isLength({ min: 1 })
    .withMessage('Session ID is required'),
  body('redactions')
    .isArray({ min: 1 })
    .withMessage('Redactions array is required'),
  body('redactions.*.pageNumber')
    .isInt({ min: 1 })
    .withMessage('Page number must be a positive integer'),
  body('redactions.*.x')
    .isNumeric()
    .withMessage('X coordinate must be numeric'),
  body('redactions.*.y')
    .isNumeric()
    .withMessage('Y coordinate must be numeric'),
  body('redactions.*.width')
    .isNumeric({ gt: 0 })
    .withMessage('Width must be positive'),
  body('redactions.*.height')
    .isNumeric({ gt: 0 })
    .withMessage('Height must be positive'),
  body('redactionColor')
    .optional()
    .matches(/^#[0-9A-F]{6}$/i)
    .withMessage('Redaction color must be a valid hex color')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { sessionId, redactions, redactionColor = '#000000' } = req.body;

    logger.logRequest(req, `Apply redactions: ${sessionId} (${redactions.length} redactions)`);

    const redactionService = new RedactionService();
    const redactionResult = await redactionService.applyRedactions(sessionId, redactions, {
      color: redactionColor
    });

    res.json({
      success: true,
      sessionId: sessionId,
      redactionsApplied: redactions.length,
      redactedPdfBase64: redactionResult.redactedPdfBase64,
      originalSize: redactionResult.originalSize,
      redactedSize: redactionResult.redactedSize,
      processingTime: redactionResult.processingTime
    });

  } catch (error) {
    logger.logError(error, {
      endpoint: '/api/redaction/apply',
      sessionId: req.body.sessionId,
      redactionCount: req.body.redactions?.length,
      user: req.user.username
    });

    res.status(500).json({
      error: 'Failed to apply redactions',
      message: error.message
    });
  }
});

/**
 * POST /api/redaction/save
 * Save redacted PDF back to cloud storage
 */
router.post('/save', [
  body('platform')
    .isIn(['gcp', 'aws', 'azure'])
    .withMessage('Platform must be gcp, aws, or azure'),
  body('bucket')
    .trim()
    .isLength({ min: 1 })
    .withMessage('Bucket name is required'),
  body('fileName')
    .trim()
    .isLength({ min: 1 })
    .withMessage('File name is required'),
  body('redactedPdfBase64')
    .trim()
    .isLength({ min: 1 })
    .withMessage('Redacted PDF data is required'),
  body('originalFileName')
    .optional()
    .trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { platform, bucket, fileName, redactedPdfBase64, originalFileName } = req.body;

    logger.logRequest(req, `Save redacted PDF: ${platform}/${bucket}/${fileName}`);

    // Convert base64 to buffer
    const pdfBuffer = Buffer.from(redactedPdfBase64, 'base64');

    // Upload redacted PDF
    const fileService = new FileService(platform);
    const uploadResult = await fileService.uploadFile(bucket, fileName, pdfBuffer, 'application/pdf');

    res.json({
      success: true,
      platform: platform,
      bucket: bucket,
      fileName: fileName,
      originalFileName: originalFileName,
      size: pdfBuffer.length,
      uploadResult: uploadResult
    });

  } catch (error) {
    logger.logError(error, {
      endpoint: '/api/redaction/save',
      platform: req.body.platform,
      bucket: req.body.bucket,
      fileName: req.body.fileName,
      user: req.user.username
    });

    res.status(500).json({
      error: 'Failed to save redacted PDF',
      message: error.message
    });
  }
});

/**
 * GET /api/redaction/session/:sessionId
 * Get redaction session details
 */
router.get('/session/:sessionId', [
  param('sessionId')
    .trim()
    .isLength({ min: 1 })
    .withMessage('Session ID is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { sessionId } = req.params;

    logger.logRequest(req, `Get redaction session: ${sessionId}`);

    const redactionService = new RedactionService();
    const sessionDetails = await redactionService.getSessionDetails(sessionId);

    res.json({
      success: true,
      sessionId: sessionId,
      ...sessionDetails
    });

  } catch (error) {
    logger.logError(error, {
      endpoint: '/api/redaction/session',
      sessionId: req.params.sessionId,
      user: req.user.username
    });

    res.status(500).json({
      error: 'Failed to get session details',
      message: error.message
    });
  }
});

/**
 * DELETE /api/redaction/session/:sessionId
 * Clean up redaction session
 */
router.delete('/session/:sessionId', [
  param('sessionId')
    .trim()
    .isLength({ min: 1 })
    .withMessage('Session ID is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { sessionId } = req.params;

    logger.logRequest(req, `Cleanup redaction session: ${sessionId}`);

    const redactionService = new RedactionService();
    await redactionService.cleanupSession(sessionId);

    res.json({
      success: true,
      sessionId: sessionId,
      message: 'Session cleaned up successfully'
    });

  } catch (error) {
    logger.logError(error, {
      endpoint: '/api/redaction/session/cleanup',
      sessionId: req.params.sessionId,
      user: req.user.username
    });

    res.status(500).json({
      error: 'Failed to cleanup session',
      message: error.message
    });
  }
});

/**
 * POST /api/redaction/preview
 * Generate preview of redacted pages without saving
 */
router.post('/preview', [
  body('sessionId')
    .trim()
    .isLength({ min: 1 })
    .withMessage('Session ID is required'),
  body('redactions')
    .isArray()
    .withMessage('Redactions array is required'),
  body('pageNumber')
    .isInt({ min: 1 })
    .withMessage('Page number must be a positive integer'),
  body('redactionColor')
    .optional()
    .matches(/^#[0-9A-F]{6}$/i)
    .withMessage('Redaction color must be a valid hex color')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { sessionId, redactions, pageNumber, redactionColor = '#000000' } = req.body;

    logger.logRequest(req, `Preview redactions: ${sessionId} page ${pageNumber}`);

    const redactionService = new RedactionService();
    const previewResult = await redactionService.generatePreview(sessionId, pageNumber, redactions, {
      color: redactionColor
    });

    res.json({
      success: true,
      sessionId: sessionId,
      pageNumber: pageNumber,
      previewImageBase64: previewResult.previewImageBase64,
      redactionCount: redactions.length
    });

  } catch (error) {
    logger.logError(error, {
      endpoint: '/api/redaction/preview',
      sessionId: req.body.sessionId,
      pageNumber: req.body.pageNumber,
      user: req.user.username
    });

    res.status(500).json({
      error: 'Failed to generate preview',
      message: error.message
    });
  }
});

/**
 * GET /api/redaction/templates
 * Get predefined redaction templates for common document types
 */
router.get('/templates', (req, res) => {
  res.json({
    success: true,
    templates: {
      'invoice': {
        name: 'Invoice Redaction',
        description: 'Common fields to redact in invoices',
        commonAreas: [
          { name: 'Customer Name', description: 'Typically in top-left area' },
          { name: 'Customer Address', description: 'Below customer name' },
          { name: 'Invoice Amount', description: 'Usually in bottom-right' },
          { name: 'Account Numbers', description: 'Various locations' }
        ]
      },
      'contract': {
        name: 'Contract Redaction',
        description: 'Common fields to redact in contracts',
        commonAreas: [
          { name: 'Party Names', description: 'Throughout document' },
          { name: 'Signatures', description: 'Bottom of pages' },
          { name: 'Financial Terms', description: 'Various sections' },
          { name: 'Contact Information', description: 'Header/footer areas' }
        ]
      },
      'personal_document': {
        name: 'Personal Document',
        description: 'Common PII to redact',
        commonAreas: [
          { name: 'Names', description: 'Various locations' },
          { name: 'Addresses', description: 'Top sections typically' },
          { name: 'Phone Numbers', description: 'Contact sections' },
          { name: 'Email Addresses', description: 'Contact sections' },
          { name: 'SSN/ID Numbers', description: 'Identification sections' }
        ]
      }
    },
    redactionColors: [
      { name: 'Black', color: '#000000', recommended: true },
      { name: 'Dark Gray', color: '#404040' },
      { name: 'Red', color: '#FF0000' },
      { name: 'Blue', color: '#0000FF' }
    ],
    bestPractices: [
      'Always review the entire document before finalizing redactions',
      'Use consistent redaction color throughout the document',
      'Verify that redacted text is not searchable in the final PDF',
      'Consider redacting metadata and hidden text as well',
      'Keep an audit trail of redaction activities'
    ]
  });
});

/**
 * POST /api/redaction/auto-detect
 * Auto-detect sensitive information in PDF for suggested redactions
 */
router.post('/auto-detect', [
  body('sessionId')
    .trim()
    .isLength({ min: 1 })
    .withMessage('Session ID is required'),
  body('detectionTypes')
    .isArray()
    .withMessage('Detection types array is required'),
  body('detectionTypes.*')
    .isIn(['pii', 'financial', 'email', 'phone', 'ssn', 'credit_card'])
    .withMessage('Invalid detection type'),
  body('confidenceThreshold')
    .optional()
    .isFloat({ min: 0, max: 1 })
    .withMessage('Confidence threshold must be between 0 and 1')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { sessionId, detectionTypes, confidenceThreshold = 0.8 } = req.body;

    logger.logRequest(req, `Auto-detect sensitive info: ${sessionId}`);

    const redactionService = new RedactionService();
    const detectionResult = await redactionService.autoDetectSensitiveInfo(sessionId, detectionTypes, confidenceThreshold);

    res.json({
      success: true,
      sessionId: sessionId,
      detectionTypes: detectionTypes,
      suggestedRedactions: detectionResult.suggestedRedactions,
      detectionCount: detectionResult.suggestedRedactions.length,
      confidence: detectionResult.averageConfidence
    });

  } catch (error) {
    logger.logError(error, {
      endpoint: '/api/redaction/auto-detect',
      sessionId: req.body.sessionId,
      detectionTypes: req.body.detectionTypes,
      user: req.user.username
    });

    res.status(500).json({
      error: 'Failed to auto-detect sensitive information',
      message: error.message
    });
  }
});

module.exports = router;