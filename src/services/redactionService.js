const { PDFDocument, rgb } = require('pdf-lib');
const fs = require('fs').promises;
const path = require('path');
const FileService = require('./fileService');
const logger = require('../utils/logger');
const NodeCache = require('node-cache');

// Cache for redaction sessions (1 hour TTL)
const sessionCache = new NodeCache({ stdTTL: 3600 });

/**
 * Redaction Service - Handles PDF redaction operations
 */
class RedactionService {
  constructor(platform = null) {
    this.platform = platform;
    this.fileService = platform ? new FileService(platform) : null;
    this.tempDir = path.join(process.cwd(), 'temp', 'redaction');
    this.initializeTempDirectory();
  }

  /**
   * Initialize temporary directory for redaction operations
   */
  async initializeTempDirectory() {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      logger.error('Failed to create temp directory:', error);
    }
  }

  /**
   * Prepare PDF for redaction by loading and analyzing it
   */
  async preparePDFForRedaction(bucketName, fileName) {
    try {
      const sessionId = this.generateSessionId();
      const startTime = Date.now();

      logger.info(`Preparing PDF for redaction: ${fileName}`, { sessionId });

      // Download PDF from cloud storage
      const fileData = await this.fileService.downloadFile(bucketName, fileName);
      
      if (!fileData || !fileData.buffer) {
        throw new Error('Failed to download PDF file');
      }

      // Load PDF document
      const pdfDoc = await PDFDocument.load(fileData.buffer);
      const pageCount = pdfDoc.getPageCount();

      // Generate page previews (convert to images for redaction interface)
      const pages = [];
      for (let i = 0; i < pageCount; i++) {
        const pageInfo = {
          pageNumber: i + 1,
          dimensions: this.getPageDimensions(pdfDoc, i),
          // In a real implementation, you'd convert PDF pages to images here
          previewUrl: `/api/redaction/session/${sessionId}/page/${i + 1}/preview`
        };
        pages.push(pageInfo);
      }

      // Store session data
      const sessionData = {
        sessionId: sessionId,
        fileName: fileName,
        bucketName: bucketName,
        platform: this.platform,
        pdfBuffer: fileData.buffer,
        pageCount: pageCount,
        pages: pages,
        createdAt: new Date(),
        redactions: []
      };

      sessionCache.set(sessionId, sessionData);

      const processingTime = Date.now() - startTime;

      logger.info(`PDF prepared for redaction: ${sessionId}`, {
        fileName: fileName,
        pageCount: pageCount,
        processingTime: processingTime
      });

      return {
        sessionId: sessionId,
        pageCount: pageCount,
        pages: pages,
        metadata: {
          originalSize: fileData.buffer.length,
          processingTime: processingTime
        }
      };

    } catch (error) {
      logger.error('Failed to prepare PDF for redaction:', error);
      throw error;
    }
  }

  /**
   * Apply redactions to PDF
   */
  async applyRedactions(sessionId, redactions, options = {}) {
    try {
      const startTime = Date.now();
      const sessionData = sessionCache.get(sessionId);

      if (!sessionData) {
        throw new Error('Redaction session not found or expired');
      }

      logger.info(`Applying redactions: ${sessionId}`, {
        redactionCount: redactions.length,
        fileName: sessionData.fileName
      });

      // Load PDF document
      const pdfDoc = await PDFDocument.load(sessionData.pdfBuffer);

      // Apply redactions to each page
      for (const redaction of redactions) {
        await this.applyRedactionToPage(pdfDoc, redaction, options);
      }

      // Generate redacted PDF
      const redactedPdfBytes = await pdfDoc.save();
      const redactedPdfBase64 = Buffer.from(redactedPdfBytes).toString('base64');

      // Update session data
      sessionData.redactions = redactions;
      sessionData.redactedAt = new Date();
      sessionCache.set(sessionId, sessionData);

      const processingTime = Date.now() - startTime;

      logger.info(`Redactions applied: ${sessionId}`, {
        redactionCount: redactions.length,
        originalSize: sessionData.pdfBuffer.length,
        redactedSize: redactedPdfBytes.length,
        processingTime: processingTime
      });

      return {
        redactedPdfBase64: redactedPdfBase64,
        originalSize: sessionData.pdfBuffer.length,
        redactedSize: redactedPdfBytes.length,
        processingTime: processingTime
      };

    } catch (error) {
      logger.error('Failed to apply redactions:', error);
      throw error;
    }
  }

  /**
   * Apply a single redaction to a PDF page
   */
  async applyRedactionToPage(pdfDoc, redaction, options) {
    try {
      const pageIndex = redaction.pageNumber - 1;
      const page = pdfDoc.getPages()[pageIndex];

      if (!page) {
        throw new Error(`Page ${redaction.pageNumber} not found`);
      }

      const { width: pageWidth, height: pageHeight } = page.getSize();

      // Convert coordinates (assuming they're in percentage or pixel coordinates)
      const x = this.convertCoordinate(redaction.x, pageWidth);
      const y = this.convertCoordinate(redaction.y, pageHeight);
      const width = this.convertCoordinate(redaction.width, pageWidth);
      const height = this.convertCoordinate(redaction.height, pageHeight);

      // Parse redaction color
      const color = this.parseColor(options.color || '#000000');

      // Draw redaction rectangle
      page.drawRectangle({
        x: x,
        y: pageHeight - y - height, // PDF coordinates are bottom-up
        width: width,
        height: height,
        color: color,
        opacity: 1.0 // Solid color to completely hide text
      });

      // Note: In a production system, you would also need to:
      // 1. Remove the actual text content under the redaction area
      // 2. Remove any searchable text that falls within the redaction bounds
      // 3. Handle vector graphics and images that might contain sensitive data

    } catch (error) {
      logger.error('Failed to apply redaction to page:', error);
      throw error;
    }
  }

  /**
   * Generate preview of redacted page
   */
  async generatePreview(sessionId, pageNumber, redactions, options = {}) {
    try {
      const sessionData = sessionCache.get(sessionId);

      if (!sessionData) {
        throw new Error('Redaction session not found or expired');
      }

      // For demonstration, we'll return a placeholder
      // In a real implementation, you would:
      // 1. Render the PDF page to an image
      // 2. Apply redaction overlays
      // 3. Return the preview image as base64

      const previewImageBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

      return {
        previewImageBase64: previewImageBase64
      };

    } catch (error) {
      logger.error('Failed to generate redaction preview:', error);
      throw error;
    }
  }

  /**
   * Auto-detect sensitive information in PDF
   */
  async autoDetectSensitiveInfo(sessionId, detectionTypes, confidenceThreshold = 0.8) {
    try {
      const sessionData = sessionCache.get(sessionId);

      if (!sessionData) {
        throw new Error('Redaction session not found or expired');
      }

      logger.info(`Auto-detecting sensitive info: ${sessionId}`, {
        detectionTypes: detectionTypes,
        confidenceThreshold: confidenceThreshold
      });

      // For demonstration, we'll return mock detections
      // In a real implementation, you would:
      // 1. Extract text from PDF using OCR
      // 2. Apply NLP/regex patterns to detect sensitive information
      // 3. Return suggested redaction areas

      const suggestedRedactions = [];

      // Mock detections based on requested types
      if (detectionTypes.includes('email')) {
        suggestedRedactions.push({
          type: 'email',
          text: 'john.doe@example.com',
          confidence: 0.95,
          pageNumber: 1,
          x: 100,
          y: 200,
          width: 150,
          height: 20
        });
      }

      if (detectionTypes.includes('phone')) {
        suggestedRedactions.push({
          type: 'phone',
          text: '(555) 123-4567',
          confidence: 0.92,
          pageNumber: 1,
          x: 100,
          y: 250,
          width: 120,
          height: 20
        });
      }

      if (detectionTypes.includes('ssn')) {
        suggestedRedactions.push({
          type: 'ssn',
          text: '123-45-6789',
          confidence: 0.98,
          pageNumber: 1,
          x: 100,
          y: 300,
          width: 100,
          height: 20
        });
      }

      const averageConfidence = suggestedRedactions.length > 0 
        ? suggestedRedactions.reduce((sum, r) => sum + r.confidence, 0) / suggestedRedactions.length 
        : 0;

      return {
        suggestedRedactions: suggestedRedactions.filter(r => r.confidence >= confidenceThreshold),
        averageConfidence: averageConfidence
      };

    } catch (error) {
      logger.error('Failed to auto-detect sensitive information:', error);
      throw error;
    }
  }

  /**
   * Get session details
   */
  async getSessionDetails(sessionId) {
    try {
      const sessionData = sessionCache.get(sessionId);

      if (!sessionData) {
        throw new Error('Redaction session not found or expired');
      }

      return {
        fileName: sessionData.fileName,
        bucketName: sessionData.bucketName,
        platform: sessionData.platform,
        pageCount: sessionData.pageCount,
        createdAt: sessionData.createdAt,
        redactionCount: sessionData.redactions ? sessionData.redactions.length : 0,
        redactedAt: sessionData.redactedAt || null
      };

    } catch (error) {
      logger.error('Failed to get session details:', error);
      throw error;
    }
  }

  /**
   * Clean up redaction session
   */
  async cleanupSession(sessionId) {
    try {
      const sessionData = sessionCache.get(sessionId);

      if (sessionData) {
        // Remove from cache
        sessionCache.del(sessionId);

        // Clean up any temporary files
        await this.cleanupTempFiles(sessionId);

        logger.info(`Redaction session cleaned up: ${sessionId}`);
      }

    } catch (error) {
      logger.error('Failed to cleanup redaction session:', error);
      throw error;
    }
  }

  // Helper Methods

  /**
   * Generate unique session ID
   */
  generateSessionId() {
    return `redaction_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get page dimensions from PDF
   */
  getPageDimensions(pdfDoc, pageIndex) {
    try {
      const page = pdfDoc.getPages()[pageIndex];
      const { width, height } = page.getSize();
      
      return {
        width: Math.round(width),
        height: Math.round(height)
      };
    } catch (error) {
      logger.error('Failed to get page dimensions:', error);
      return { width: 612, height: 792 }; // Default letter size
    }
  }

  /**
   * Convert coordinate based on type (percentage, pixel, etc.)
   */
  convertCoordinate(value, maxValue) {
    // If value is between 0 and 1, treat as percentage
    if (value >= 0 && value <= 1) {
      return value * maxValue;
    }
    
    // Otherwise, treat as absolute pixel value
    return value;
  }

  /**
   * Parse color string to PDF-lib RGB color
   */
  parseColor(colorString) {
    // Remove # if present
    const hex = colorString.replace('#', '');
    
    // Parse RGB values
    const r = parseInt(hex.substr(0, 2), 16) / 255;
    const g = parseInt(hex.substr(2, 2), 16) / 255;
    const b = parseInt(hex.substr(4, 2), 16) / 255;
    
    return rgb(r, g, b);
  }

  /**
   * Clean up temporary files for a session
   */
  async cleanupTempFiles(sessionId) {
    try {
      const sessionTempDir = path.join(this.tempDir, sessionId);
      
      try {
        await fs.rmdir(sessionTempDir, { recursive: true });
      } catch (error) {
        // Directory might not exist, that's okay
      }
    } catch (error) {
      logger.error('Failed to cleanup temp files:', error);
    }
  }

  /**
   * Validate redaction coordinates
   */
  validateRedaction(redaction, pageWidth, pageHeight) {
    const errors = [];

    if (!redaction.pageNumber || redaction.pageNumber < 1) {
      errors.push('Invalid page number');
    }

    if (redaction.x < 0 || redaction.x > pageWidth) {
      errors.push('X coordinate out of bounds');
    }

    if (redaction.y < 0 || redaction.y > pageHeight) {
      errors.push('Y coordinate out of bounds');
    }

    if (redaction.width <= 0 || redaction.x + redaction.width > pageWidth) {
      errors.push('Invalid width or extends beyond page');
    }

    if (redaction.height <= 0 || redaction.y + redaction.height > pageHeight) {
      errors.push('Invalid height or extends beyond page');
    }

    return {
      isValid: errors.length === 0,
      errors: errors
    };
  }

  /**
   * Get redaction statistics
   */
  getRedactionStatistics(redactions) {
    const stats = {
      totalRedactions: redactions.length,
      redactionsByPage: {},
      averageRedactionSize: 0,
      totalRedactedArea: 0
    };

    for (const redaction of redactions) {
      const page = redaction.pageNumber;
      stats.redactionsByPage[page] = (stats.redactionsByPage[page] || 0) + 1;
      
      const area = redaction.width * redaction.height;
      stats.totalRedactedArea += area;
    }

    if (redactions.length > 0) {
      stats.averageRedactionSize = stats.totalRedactedArea / redactions.length;
    }

    return stats;
  }
}

module.exports = RedactionService;