const express = require('express');
const multer = require('multer');
const { body, param, query, validationResult } = require('express-validator');
const { getCloudServiceManager } = require('../services/cloudService');
const FileService = require('../services/fileService');
const logger = require('../utils/logger');
const path = require('path');
const mime = require('mime-types');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
    files: 1
  },
  fileFilter: (req, file, cb) => {
    // Allow all file types but log suspicious ones
    const allowedTypes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/tiff',
      'text/plain',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'video/mp4',
      'video/avi',
      'video/mov',
      'application/zip',
      'application/x-rar-compressed'
    ];

    if (!allowedTypes.includes(file.mimetype)) {
      logger.warn(`Potentially unsafe file type uploaded: ${file.mimetype}`, {
        filename: file.originalname,
        user: req.user?.username
      });
    }

    cb(null, true);
  }
});

/**
 * GET /api/files/buckets/:platform
 * Get available buckets/containers for a platform
 */
router.get('/buckets/:platform', [
    param('platform')
        .isIn(['gcp', 'aws', 'azure'])
        .withMessage('Platform must be gcp, aws, or azure')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Validation failed',
                details: errors.array()
            });
        }

        const { platform } = req.params;
        const cloudService = getCloudServiceManager();

        logger.logRequest(req, `Get buckets for ${platform}`);

        try {
            const buckets = await cloudService.getBuckets(platform);
            res.json({
                success: true,
                platform: platform,
                buckets: buckets
            });
        } catch (error) {
            if (error.message.includes('not initialized')) {
                return res.status(400).json({
                    error: 'Platform not configured',
                    message: `Please configure ${platform.toUpperCase()} credentials first`
                });
            }
            throw error;
        }

    } catch (error) {
        logger.logError(error, {
            endpoint: '/api/files/buckets',
            platform: req.params.platform,
            user: req.user.username
        });

        res.status(500).json({
            error: 'Failed to retrieve buckets',
            message: error.message
        });
    }
});

/**
 * GET /api/files/list
 * List files in a bucket/container
 */
router.get('/list', [
  query('platform')
    .isIn(['gcp', 'aws', 'azure'])
    .withMessage('Platform must be gcp, aws, or azure'),
  query('bucket')
    .trim()
    .isLength({ min: 1 })
    .withMessage('Bucket name is required'),
  query('prefix')
    .optional()
    .trim(),
  query('recordId')
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

    const { platform, bucket, prefix, recordId } = req.query;
    
    // If recordId is provided, use it as prefix
    const actualPrefix = recordId ? `${recordId}/` : (prefix || '');

    logger.logRequest(req, `List files: ${platform}/${bucket}/${actualPrefix}`);

    const fileService = new FileService(platform);
    const files = await fileService.listFiles(bucket, actualPrefix);

    res.json({
      success: true,
      platform: platform,
      bucket: bucket,
      prefix: actualPrefix,
      files: files
    });

  } catch (error) {
    logger.logError(error, {
      endpoint: '/api/files/list',
      platform: req.query.platform,
      bucket: req.query.bucket,
      user: req.user.username
    });

    res.status(500).json({
      error: 'Failed to list files',
      message: error.message
    });
  }
});

/**
 * POST /api/files/upload
 * Upload a file to cloud storage
 */
router.post('/upload', upload.single('file'), [
  body('platform')
    .isIn(['gcp', 'aws', 'azure'])
    .withMessage('Platform must be gcp, aws, or azure'),
  body('bucket')
    .trim()
    .isLength({ min: 1 })
    .withMessage('Bucket name is required'),
  body('fileName')
    .optional()
    .trim(),
  body('recordId')
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

    if (!req.file) {
      return res.status(400).json({
        error: 'No file provided'
      });
    }

    const { platform, bucket, fileName, recordId } = req.body;
    const file = req.file;

    // Determine final filename
    let finalFileName = fileName || file.originalname;
    
    // Add recordId prefix if provided
    if (recordId) {
      finalFileName = `${recordId}/${finalFileName}`;
    }

    // Ensure safe filename
    finalFileName = finalFileName.replace(/[^a-zA-Z0-9._\/-]/g, '_');

    logger.logRequest(req, `Upload file: ${platform}/${bucket}/${finalFileName}`);
    logger.info(`File upload details:`, {
      originalName: file.originalname,
      finalFileName: finalFileName,
      size: file.size,
      mimetype: file.mimetype,
      user: req.user.username
    });

    const fileService = new FileService(platform);
    const result = await fileService.uploadFile(bucket, finalFileName, file.buffer, file.mimetype);

    res.json({
      success: true,
      platform: platform,
      bucket: bucket,
      fileName: finalFileName,
      size: file.size,
      mimetype: file.mimetype,
      result: result
    });

  } catch (error) {
    logger.logError(error, {
      endpoint: '/api/files/upload',
      platform: req.body.platform,
      bucket: req.body.bucket,
      fileName: req.body.fileName,
      user: req.user.username
    });

    res.status(500).json({
      error: 'Failed to upload file',
      message: error.message
    });
  }
});

/**
 * DELETE /api/files/delete
 * Delete a file from cloud storage
 */
router.delete('/delete', [
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

    logger.logRequest(req, `Delete file: ${platform}/${bucket}/${fileName}`);

    const fileService = new FileService(platform);
    const result = await fileService.deleteFile(bucket, fileName);

    res.json({
      success: true,
      platform: platform,
      bucket: bucket,
      fileName: fileName,
      result: result
    });

  } catch (error) {
    logger.logError(error, {
      endpoint: '/api/files/delete',
      platform: req.body.platform,
      bucket: req.body.bucket,
      fileName: req.body.fileName,
      user: req.user.username
    });

    res.status(500).json({
      error: 'Failed to delete file',
      message: error.message
    });
  }
});

/**
 * POST /api/files/share
 * Generate a temporary share link for a file
 */
router.post('/share', [
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
  body('expirationHours')
    .isInt({ min: 1, max: 168 })
    .withMessage('Expiration hours must be between 1 and 168 (1 week)')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { platform, bucket, fileName, expirationHours } = req.body;

    logger.logRequest(req, `Generate share link: ${platform}/${bucket}/${fileName}`);

    const fileService = new FileService(platform);
    const shareUrl = await fileService.generateShareLink(bucket, fileName, expirationHours);

    res.json({
      success: true,
      platform: platform,
      bucket: bucket,
      fileName: fileName,
      shareUrl: shareUrl,
      expirationHours: expirationHours,
      expiresAt: new Date(Date.now() + expirationHours * 60 * 60 * 1000).toISOString()
    });

  } catch (error) {
    logger.logError(error, {
      endpoint: '/api/files/share',
      platform: req.body.platform,
      bucket: req.body.bucket,
      fileName: req.body.fileName,
      user: req.user.username
    });

    res.status(500).json({
      error: 'Failed to generate share link',
      message: error.message
    });
  }
});

/**
 * GET /api/files/download
 * Download file content (for preview/redaction)
 */
router.get('/download', [
  query('platform')
    .isIn(['gcp', 'aws', 'azure'])
    .withMessage('Platform must be gcp, aws, or azure'),
  query('bucket')
    .trim()
    .isLength({ min: 1 })
    .withMessage('Bucket name is required'),
  query('fileName')
    .trim()
    .isLength({ min: 1 })
    .withMessage('File name is required'),
  query('asBase64')
    .optional()
    .isBoolean()
    .withMessage('asBase64 must be boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { platform, bucket, fileName, asBase64 } = req.query;

    logger.logRequest(req, `Download file: ${platform}/${bucket}/${fileName}`);

    const fileService = new FileService(platform);
    const fileData = await fileService.downloadFile(bucket, fileName);

    if (asBase64 === 'true') {
      // Return as base64 for client-side processing
      res.json({
        success: true,
        fileName: fileName,
        contentType: fileData.contentType,
        content: fileData.buffer.toString('base64'),
        size: fileData.buffer.length
      });
    } else {
      // Stream the file directly
      res.set({
        'Content-Type': fileData.contentType,
        'Content-Length': fileData.buffer.length,
        'Content-Disposition': `inline; filename="${path.basename(fileName)}"`
      });
      res.send(fileData.buffer);
    }

  } catch (error) {
    logger.logError(error, {
      endpoint: '/api/files/download',
      platform: req.query.platform,
      bucket: req.query.bucket,
      fileName: req.query.fileName,
      user: req.user.username
    });

    res.status(500).json({
      error: 'Failed to download file',
      message: error.message
    });
  }
});

/**
 * POST /api/files/multipart/initiate
 * Initiate multipart upload for large files
 */
router.post('/multipart/initiate', [
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
  body('contentType')
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

    const { platform, bucket, fileName, contentType, recordId } = req.body;
    
    // Add recordId prefix if provided
    let finalFileName = fileName;
    if (recordId) {
      finalFileName = `${recordId}/${fileName}`;
    }

    logger.logRequest(req, `Initiate multipart upload: ${platform}/${bucket}/${finalFileName}`);

    const fileService = new FileService(platform);
    const uploadId = await fileService.initiateMultipartUpload(bucket, finalFileName, contentType);

    res.json({
      success: true,
      platform: platform,
      bucket: bucket,
      fileName: finalFileName,
      uploadId: uploadId
    });

  } catch (error) {
    logger.logError(error, {
      endpoint: '/api/files/multipart/initiate',
      platform: req.body.platform,
      bucket: req.body.bucket,
      fileName: req.body.fileName,
      user: req.user.username
    });

    res.status(500).json({
      error: 'Failed to initiate multipart upload',
      message: error.message
    });
  }
});

/**
 * POST /api/files/multipart/upload-part
 * Upload a part of a multipart upload
 */
router.post('/multipart/upload-part', upload.single('chunk'), [
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
  body('uploadId')
    .trim()
    .isLength({ min: 1 })
    .withMessage('Upload ID is required'),
  body('partNumber')
    .isInt({ min: 1 })
    .withMessage('Part number must be a positive integer')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    if (!req.file) {
      return res.status(400).json({
        error: 'No chunk data provided'
      });
    }

    const { platform, bucket, fileName, uploadId, partNumber } = req.body;

    logger.logRequest(req, `Upload part ${partNumber}: ${platform}/${bucket}/${fileName}`);

    const fileService = new FileService(platform);
    const etag = await fileService.uploadPart(bucket, fileName, uploadId, parseInt(partNumber), req.file.buffer);

    res.json({
      success: true,
      platform: platform,
      bucket: bucket,
      fileName: fileName,
      uploadId: uploadId,
      partNumber: parseInt(partNumber),
      etag: etag
    });

  } catch (error) {
    logger.logError(error, {
      endpoint: '/api/files/multipart/upload-part',
      platform: req.body.platform,
      bucket: req.body.bucket,
      fileName: req.body.fileName,
      partNumber: req.body.partNumber,
      user: req.user.username
    });

    res.status(500).json({
      error: 'Failed to upload part',
      message: error.message
    });
  }
});

/**
 * POST /api/files/multipart/complete
 * Complete a multipart upload
 */
router.post('/multipart/complete', [
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
  body('uploadId')
    .trim()
    .isLength({ min: 1 })
    .withMessage('Upload ID is required'),
  body('parts')
    .isArray({ min: 1 })
    .withMessage('Parts array is required and must not be empty')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { platform, bucket, fileName, uploadId, parts } = req.body;

    logger.logRequest(req, `Complete multipart upload: ${platform}/${bucket}/${fileName}`);

    const fileService = new FileService(platform);
    const result = await fileService.completeMultipartUpload(bucket, fileName, uploadId, parts);

    res.json({
      success: true,
      platform: platform,
      bucket: bucket,
      fileName: fileName,
      uploadId: uploadId,
      result: result
    });

  } catch (error) {
    logger.logError(error, {
      endpoint: '/api/files/multipart/complete',
      platform: req.body.platform,
      bucket: req.body.bucket,
      fileName: req.body.fileName,
      user: req.user.username
    });

    res.status(500).json({
      error: 'Failed to complete multipart upload',
      message: error.message
    });
  }
});

module.exports = router;