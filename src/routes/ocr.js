const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const OCRService = require('../services/ocrService');
const FileService = require('../services/fileService');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * POST /api/ocr/extract
 * Extract text and data from a file using OCR
 */
router.post('/extract', [
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
  body('ocrType')
    .optional()
    .isIn(['document', 'form', 'text'])
    .withMessage('OCR type must be document, form, or text'),
  body('async')
    .optional()
    .isBoolean()
    .withMessage('Async must be boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { platform, bucket, fileName, ocrType = 'document', async = false } = req.body;

    // Validate file type
    if (!FileService.isOCRCompatible(fileName)) {
      return res.status(400).json({
        error: 'File type not supported for OCR',
        supportedTypes: ['PDF', 'JPG', 'PNG', 'TIFF', 'GIF', 'BMP']
      });
    }

    logger.logRequest(req, `OCR Extract: ${platform}/${bucket}/${fileName}`);

    const ocrService = new OCRService(platform);

    if (async) {
      // Initiate async OCR processing
      const jobId = await ocrService.initiateAsyncOCR(bucket, fileName, ocrType);
      
      res.json({
        success: true,
        async: true,
        jobId: jobId,
        message: 'OCR processing initiated',
        platform: platform,
        fileName: fileName
      });
    } else {
      // Perform synchronous OCR
      const extractedData = await ocrService.extractText(bucket, fileName, ocrType);
      
      res.json({
        success: true,
        async: false,
        platform: platform,
        fileName: fileName,
        extractedData: extractedData,
        fieldCount: Object.keys(extractedData).length
      });
    }

  } catch (error) {
    logger.logError(error, {
      endpoint: '/api/ocr/extract',
      platform: req.body.platform,
      bucket: req.body.bucket,
      fileName: req.body.fileName,
      user: req.user.username
    });

    res.status(500).json({
      error: 'OCR extraction failed',
      message: error.message
    });
  }
});

/**
 * GET /api/ocr/job/:jobId
 * Get status of an async OCR job
 */
router.get('/job/:jobId', [
  param('jobId')
    .trim()
    .isLength({ min: 1 })
    .withMessage('Job ID is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { jobId } = req.params;

    logger.logRequest(req, `Check OCR Job: ${jobId}`);

    // In a real implementation, you would check job status from a database or job queue
    // For now, we'll return a mock response
    res.json({
      success: true,
      jobId: jobId,
      status: 'COMPLETED', // PENDING, IN_PROGRESS, COMPLETED, FAILED
      progress: 100,
      message: 'OCR processing completed',
      completedAt: new Date().toISOString()
    });

  } catch (error) {
    logger.logError(error, {
      endpoint: '/api/ocr/job',
      jobId: req.params.jobId,
      user: req.user.username
    });

    res.status(500).json({
      error: 'Failed to check OCR job status',
      message: error.message
    });
  }
});

/**
 * GET /api/ocr/job/:jobId/results
 * Get results of a completed OCR job
 */
router.get('/job/:jobId/results', [
  param('jobId')
    .trim()
    .isLength({ min: 1 })
    .withMessage('Job ID is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { jobId } = req.params;

    logger.logRequest(req, `Get OCR Results: ${jobId}`);

    // In a real implementation, retrieve results from storage
    const mockResults = {
      extractedData: {
        'Document Type': 'Invoice',
        'Invoice Number': 'INV-2024-001',
        'Date': '2024-01-15',
        'Total Amount': '$1,234.56',
        'Vendor': 'Sample Company Inc.'
      },
      confidence: 0.95,
      processingTime: 45.2
    };

    res.json({
      success: true,
      jobId: jobId,
      extractedData: mockResults.extractedData,
      confidence: mockResults.confidence,
      processingTime: mockResults.processingTime,
      fieldCount: Object.keys(mockResults.extractedData).length
    });

  } catch (error) {
    logger.logError(error, {
      endpoint: '/api/ocr/job/results',
      jobId: req.params.jobId,
      user: req.user.username
    });

    res.status(500).json({
      error: 'Failed to retrieve OCR results',
      message: error.message
    });
  }
});

/**
 * POST /api/ocr/analyze-document
 * Analyze document structure and extract key-value pairs
 */
router.post('/analyze-document', [
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
  body('analysisType')
    .optional()
    .isIn(['general', 'invoice', 'receipt', 'identity', 'business-card'])
    .withMessage('Analysis type must be one of: general, invoice, receipt, identity, business-card')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { platform, bucket, fileName, analysisType = 'general' } = req.body;

    logger.logRequest(req, `Document Analysis: ${platform}/${bucket}/${fileName}`);

    const ocrService = new OCRService(platform);
    const analysisResult = await ocrService.analyzeDocument(bucket, fileName, analysisType);

    res.json({
      success: true,
      platform: platform,
      fileName: fileName,
      analysisType: analysisType,
      result: analysisResult
    });

  } catch (error) {
    logger.logError(error, {
      endpoint: '/api/ocr/analyze-document',
      platform: req.body.platform,
      bucket: req.body.bucket,
      fileName: req.body.fileName,
      user: req.user.username
    });

    res.status(500).json({
      error: 'Document analysis failed',
      message: error.message
    });
  }
});

/**
 * POST /api/ocr/extract-tables
 * Extract tables from documents
 */
router.post('/extract-tables', [
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

    logger.logRequest(req, `Table Extraction: ${platform}/${bucket}/${fileName}`);

    const ocrService = new OCRService(platform);
    const tables = await ocrService.extractTables(bucket, fileName);

    res.json({
      success: true,
      platform: platform,
      fileName: fileName,
      tables: tables,
      tableCount: tables.length
    });

  } catch (error) {
    logger.logError(error, {
      endpoint: '/api/ocr/extract-tables',
      platform: req.body.platform,
      bucket: req.body.bucket,
      fileName: req.body.fileName,
      user: req.user.username
    });

    res.status(500).json({
      error: 'Table extraction failed',
      message: error.message
    });
  }
});

/**
 * GET /api/ocr/supported-formats
 * Get supported file formats for OCR
 */
router.get('/supported-formats', (req, res) => {
  res.json({
    success: true,
    supportedFormats: {
      images: {
        extensions: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.webp'],
        mimeTypes: [
          'image/jpeg',
          'image/png', 
          'image/gif',
          'image/bmp',
          'image/tiff',
          'image/webp'
        ]
      },
      documents: {
        extensions: ['.pdf'],
        mimeTypes: ['application/pdf']
      }
    },
    maxFileSize: '20MB',
    platforms: {
      gcp: {
        service: 'Document AI',
        features: ['text-extraction', 'form-parsing', 'table-extraction', 'handwriting-recognition']
      },
      aws: {
        service: 'Textract',
        features: ['text-extraction', 'form-parsing', 'table-extraction', 'query-answering']
      },
      azure: {
        service: 'Form Recognizer',
        features: ['text-extraction', 'form-parsing', 'table-extraction', 'layout-analysis']
      }
    }
  });
});

/**
 * POST /api/ocr/batch-process
 * Process multiple files in batch
 */
router.post('/batch-process', [
  body('platform')
    .isIn(['gcp', 'aws', 'azure'])
    .withMessage('Platform must be gcp, aws, or azure'),
  body('bucket')
    .trim()
    .isLength({ min: 1 })
    .withMessage('Bucket name is required'),
  body('files')
    .isArray({ min: 1, max: 10 })
    .withMessage('Files array is required (1-10 files)'),
  body('files.*.fileName')
    .trim()
    .isLength({ min: 1 })
    .withMessage('Each file must have a fileName'),
  body('ocrType')
    .optional()
    .isIn(['document', 'form', 'text'])
    .withMessage('OCR type must be document, form, or text')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { platform, bucket, files, ocrType = 'document' } = req.body;

    logger.logRequest(req, `Batch OCR: ${platform}/${bucket} (${files.length} files)`);

    const ocrService = new OCRService(platform);
    const batchJobId = await ocrService.initiateBatchOCR(bucket, files, ocrType);

    res.json({
      success: true,
      batchJobId: batchJobId,
      platform: platform,
      bucket: bucket,
      fileCount: files.length,
      message: 'Batch OCR processing initiated'
    });

  } catch (error) {
    logger.logError(error, {
      endpoint: '/api/ocr/batch-process',
      platform: req.body.platform,
      bucket: req.body.bucket,
      fileCount: req.body.files?.length,
      user: req.user.username
    });

    res.status(500).json({
      error: 'Batch OCR processing failed',
      message: error.message
    });
  }
});

/**
 * GET /api/ocr/confidence-threshold
 * Get recommended confidence thresholds for different document types
 */
router.get('/confidence-threshold', (req, res) => {
  res.json({
    success: true,
    thresholds: {
      'general-text': 0.7,
      'forms': 0.8,
      'invoices': 0.85,
      'receipts': 0.75,
      'business-cards': 0.8,
      'identity-documents': 0.9,
      'handwritten-text': 0.6,
      'printed-text': 0.9
    },
    recommendations: {
      high_confidence: 'Use for automated processing',
      medium_confidence: 'Review recommended',
      low_confidence: 'Manual verification required'
    }
  });
});

module.exports = router;