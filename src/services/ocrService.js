const { getCloudServiceManager } = require('./cloudService');
const FileService = require('./fileService');
const logger = require('../utils/logger');

/**
 * OCR Service - Handles text extraction across cloud platforms
 */
class OCRService {
  constructor(platform) {
    this.platform = platform.toLowerCase();
    this.cloudService = getCloudServiceManager();
    this.fileService = new FileService(platform);
  }

  /**
   * Extract text from a document
   */
  async extractText(bucketName, fileName, ocrType = 'document') {
    try {
      switch (this.platform) {
        case 'gcp':
          return await this.extractTextGCP(bucketName, fileName, ocrType);
        case 'aws':
          return await this.extractTextAWS(bucketName, fileName, ocrType);
        case 'azure':
          return await this.extractTextAzure(bucketName, fileName, ocrType);
        default:
          throw new Error(`Unsupported platform: ${this.platform}`);
      }
    } catch (error) {
      logger.error(`OCR extraction failed on ${this.platform}:`, error);
      throw error;
    }
  }

  /**
   * Analyze document structure
   */
  async analyzeDocument(bucketName, fileName, analysisType = 'general') {
    try {
      switch (this.platform) {
        case 'gcp':
          return await this.analyzeDocumentGCP(bucketName, fileName, analysisType);
        case 'aws':
          return await this.analyzeDocumentAWS(bucketName, fileName, analysisType);
        case 'azure':
          return await this.analyzeDocumentAzure(bucketName, fileName, analysisType);
        default:
          throw new Error(`Unsupported platform: ${this.platform}`);
      }
    } catch (error) {
      logger.error(`Document analysis failed on ${this.platform}:`, error);
      throw error;
    }
  }

  /**
   * Extract tables from document
   */
  async extractTables(bucketName, fileName) {
    try {
      switch (this.platform) {
        case 'gcp':
          return await this.extractTablesGCP(bucketName, fileName);
        case 'aws':
          return await this.extractTablesAWS(bucketName, fileName);
        case 'azure':
          return await this.extractTablesAzure(bucketName, fileName);
        default:
          throw new Error(`Unsupported platform: ${this.platform}`);
      }
    } catch (error) {
      logger.error(`Table extraction failed on ${this.platform}:`, error);
      throw error;
    }
  }

  /**
   * Initiate async OCR processing
   */
  async initiateAsyncOCR(bucketName, fileName, ocrType = 'document') {
    try {
      const jobId = `ocr_${this.platform}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // In a real implementation, you would:
      // 1. Store job info in database
      // 2. Queue the job for processing
      // 3. Return job ID for tracking
      
      logger.info(`Initiated async OCR job: ${jobId}`, {
        platform: this.platform,
        bucket: bucketName,
        fileName: fileName,
        ocrType: ocrType
      });

      // For demo purposes, simulate async processing
      setTimeout(async () => {
        try {
          const result = await this.extractText(bucketName, fileName, ocrType);
          logger.info(`Async OCR job completed: ${jobId}`, { result });
          // In real implementation, update job status and notify client
        } catch (error) {
          logger.error(`Async OCR job failed: ${jobId}`, error);
        }
      }, 5000); // Simulate 5 second processing time

      return jobId;
    } catch (error) {
      logger.error(`Failed to initiate async OCR on ${this.platform}:`, error);
      throw error;
    }
  }

  /**
   * Initiate batch OCR processing
   */
  async initiateBatchOCR(bucketName, files, ocrType = 'document') {
    try {
      const batchJobId = `batch_ocr_${this.platform}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      logger.info(`Initiated batch OCR job: ${batchJobId}`, {
        platform: this.platform,
        bucket: bucketName,
        fileCount: files.length,
        ocrType: ocrType
      });

      // In real implementation, process files in parallel/queue
      return batchJobId;
    } catch (error) {
      logger.error(`Failed to initiate batch OCR on ${this.platform}:`, error);
      throw error;
    }
  }

  // GCP Implementation Methods

	async extractTextGCP(bucketName, fileName, ocrType) {
	    try {
	        const documentAI = this.cloudService.getGCPDocumentAI();
        
	        if (!process.env.GCP_DOCUMENT_PROCESSOR_ID) {
	            throw new Error('GCP Document Processor ID not configured');
	        }
        
	        const processorId = process.env.GCP_DOCUMENT_PROCESSOR_ID;
	        //const name = `projects/${process.env.GCP_PROJECT_ID}/locations/us/processors/${processorId}`;
					const name = processorId;

	        const gcsUri = `gs://${bucketName}/${fileName}`;
        
	        const request = {
	            name: name,
	            gcsDocument: {
	                gcsUri: gcsUri,
	                mimeType: this.getMimeType(fileName)
	            }
	        };

	        const [response] = await documentAI.processDocument(request);
        
	        return this.parseGCPResponse(response);
	    } catch (error) {
	        throw new Error(`GCP OCR failed: ${error.message}`);
	    }
	}

  async analyzeDocumentGCP(bucketName, fileName, analysisType) {
    // Use Document AI layout parser for document analysis
    return await this.extractTextGCP(bucketName, fileName, 'form');
  }

  async extractTablesGCP(bucketName, fileName) {
    const result = await this.extractTextGCP(bucketName, fileName, 'form');
    
    // Extract tables from the parsed result
    return this.extractTablesFromGCPResult(result);
  }

  getGCPProcessorId(ocrType) {
    // Return processor ID based on type
    // In real implementation, these would be configured per environment
    const processors = {
      'document': process.env.GCP_DOCUMENT_PROCESSOR_ID || 'default-processor',
      'form': process.env.GCP_FORM_PROCESSOR_ID || 'form-processor',
      'text': process.env.GCP_TEXT_PROCESSOR_ID || 'text-processor'
    };
    
    return processors[ocrType] || processors['document'];
  }

	parseGCPResponse(response) {
	    const document = response.document;
	    const extractedData = {};

	    if (document.pages) {
	        for (const page of document.pages) {
	            if (page.formFields) {
	                for (const field of page.formFields) {
	                    const fieldName = this.extractTextFromGCPAnchor(field.fieldName, document.text);
	                    const fieldValue = this.extractTextFromGCPAnchor(field.fieldValue, document.text);
                    
	                    if (fieldName && fieldValue) {
	                        extractedData[fieldName.trim()] = fieldValue.trim();
	                    }
	                }
	            }
	        }
	    }

	    // If no form fields, extract general text
	    if (Object.keys(extractedData).length === 0 && document.text) {
	        const lines = document.text.split('\n').filter(line => line.trim());
	        extractedData['extracted_text'] = lines.join('\n');
        
	        // Try to extract key-value patterns
	        for (const line of lines) {
	            const kvMatch = line.match(/^([^:]+):\s*(.+)$/);
	            if (kvMatch) {
	                const key = kvMatch[1].trim();
	                const value = kvMatch[2].trim();
	                if (key && value) {
	                    extractedData[key] = value;
	                }
	            }
	        }
	    }

	    return extractedData;
	}

  extractTextFromGCPAnchor(anchor, documentText) {
    if (!anchor || !anchor.textAnchor || !documentText) return '';
    
    const textSegments = anchor.textAnchor.textSegments;
    if (!textSegments || textSegments.length === 0) return '';
    
    let text = '';
    for (const segment of textSegments) {
      const startIndex = parseInt(segment.startIndex) || 0;
      const endIndex = parseInt(segment.endIndex) || documentText.length;
      text += documentText.substring(startIndex, endIndex);
    }
    
    return text;
  }

  extractTablesFromGCPResult(result) {
    // Placeholder for table extraction logic
    return [];
  }

  // AWS Implementation Methods

  async extractTextAWS(bucketName, fileName, ocrType) {
    try {
      const textract = this.cloudService.getAWSTextract();
      
      const params = {
        Document: {
          S3Object: {
            Bucket: bucketName,
            Name: fileName
          }
        },
        FeatureTypes: ['FORMS', 'TABLES']
      };

      const response = await textract.analyzeDocument(params).promise();
      
      return this.parseAWSResponse(response);
    } catch (error) {
      throw new Error(`AWS Textract failed: ${error.message}`);
    }
  }

  async analyzeDocumentAWS(bucketName, fileName, analysisType) {
    return await this.extractTextAWS(bucketName, fileName, 'form');
  }

  async extractTablesAWS(bucketName, fileName) {
    const result = await this.extractTextAWS(bucketName, fileName, 'form');
    return this.extractTablesFromAWSResult(result);
  }

  parseAWSResponse(response) {
    const extractedData = {};
    const blocks = response.Blocks;
    
    if (!blocks) return extractedData;

    // Create a map of all blocks
    const blockMap = {};
    blocks.forEach(block => {
      blockMap[block.Id] = block;
    });

    // Extract key-value pairs
    blocks.forEach(block => {
      if (block.BlockType === 'KEY_VALUE_SET' && block.EntityTypes && block.EntityTypes.includes('KEY')) {
        const keyText = this.getTextFromAWSBlock(block, blockMap);
        const valueText = this.getValueForAWSKey(block, blockMap);
        
        if (keyText && valueText) {
          extractedData[keyText.trim()] = valueText.trim();
        }
      }
    });

    // If no key-value pairs found, extract all text
    if (Object.keys(extractedData).length === 0) {
      const allText = blocks
        .filter(block => block.BlockType === 'LINE')
        .map(block => block.Text)
        .join('\n');
      
      if (allText) {
        extractedData['extracted_text'] = allText;
      }
    }

    return extractedData;
  }

  getTextFromAWSBlock(block, blockMap) {
    let text = '';
    
    if (block.Relationships) {
      for (const relationship of block.Relationships) {
        if (relationship.Type === 'CHILD') {
          for (const childId of relationship.Ids) {
            const childBlock = blockMap[childId];
            if (childBlock && childBlock.BlockType === 'WORD') {
              text += childBlock.Text + ' ';
            }
          }
        }
      }
    }
    
    return text.trim();
  }

  getValueForAWSKey(keyBlock, blockMap) {
    if (!keyBlock.Relationships) return '';
    
    for (const relationship of keyBlock.Relationships) {
      if (relationship.Type === 'VALUE') {
        for (const valueId of relationship.Ids) {
          const valueBlock = blockMap[valueId];
          if (valueBlock) {
            return this.getTextFromAWSBlock(valueBlock, blockMap);
          }
        }
      }
    }
    
    return '';
  }

  extractTablesFromAWSResult(result) {
    // Placeholder for AWS table extraction
    return [];
  }

  // Azure Implementation Methods

  async extractTextAzure(bucketName, fileName, ocrType) {
    try {
      const formRecognizer = this.cloudService.getAzureFormRecognizer();
      
      // Get file URL
      const fileUrl = await this.getAzureFileUrl(bucketName, fileName);
      
      // Choose the right model based on OCR type
      const modelId = this.getAzureModelId(ocrType);
      
      const poller = await formRecognizer.beginAnalyzeDocumentFromUrl(modelId, fileUrl);
      const response = await poller.pollUntilDone();
      
      return this.parseAzureResponse(response);
    } catch (error) {
      throw new Error(`Azure Form Recognizer failed: ${error.message}`);
    }
  }

  async analyzeDocumentAzure(bucketName, fileName, analysisType) {
    return await this.extractTextAzure(bucketName, fileName, 'form');
  }

  async extractTablesAzure(bucketName, fileName) {
    const result = await this.extractTextAzure(bucketName, fileName, 'form');
    return this.extractTablesFromAzureResult(result);
  }

  async getAzureFileUrl(bucketName, fileName) {
    // Generate a temporary URL for the file
    return await this.fileService.generateShareLink(bucketName, fileName, 1); // 1 hour expiry
  }

  getAzureModelId(ocrType) {
    const models = {
      'document': 'prebuilt-document',
      'form': 'prebuilt-document',
      'text': 'prebuilt-read'
    };
    
    return models[ocrType] || models['document'];
  }

  parseAzureResponse(response) {
    const extractedData = {};
    
    // Extract key-value pairs
    if (response.keyValuePairs) {
      for (const kvp of response.keyValuePairs) {
        if (kvp.key && kvp.value) {
          const keyText = kvp.key.content;
          const valueText = kvp.value.content;
          
          if (keyText && valueText) {
            extractedData[keyText.trim()] = valueText.trim();
          }
        }
      }
    }

    // If no key-value pairs, extract general content
    if (Object.keys(extractedData).length === 0 && response.content) {
      extractedData['extracted_text'] = response.content;
    }

    return extractedData;
  }

  extractTablesFromAzureResult(result) {
    // Placeholder for Azure table extraction
    return [];
  }

  // Helper Methods

  getMimeType(fileName) {
    const ext = fileName.toLowerCase().split('.').pop();
    const mimeTypes = {
      'pdf': 'application/pdf',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'bmp': 'image/bmp',
      'tiff': 'image/tiff',
      'tif': 'image/tiff'
    };
    
    return mimeTypes[ext] || 'application/octet-stream';
  }

  /**
   * Clean extracted text by removing extra whitespace and normalizing
   */
  cleanText(text) {
    if (!text) return '';
    
    return text
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .replace(/\n\s*\n/g, '\n') // Remove empty lines
      .trim();
  }

  /**
   * Validate OCR results quality
   */
  validateResults(extractedData) {
    const validation = {
      isValid: true,
      confidence: 1.0,
      issues: []
    };

    // Check if we have any data
    if (!extractedData || Object.keys(extractedData).length === 0) {
      validation.isValid = false;
      validation.confidence = 0;
      validation.issues.push('No data extracted');
      return validation;
    }

    // Check for common OCR issues
    for (const [key, value] of Object.entries(extractedData)) {
      const text = String(value);
      
      // Check for garbled text (too many special characters)
      const specialCharRatio = (text.match(/[^a-zA-Z0-9\s]/g) || []).length / text.length;
      if (specialCharRatio > 0.3) {
        validation.confidence *= 0.8;
        validation.issues.push(`Possible garbled text in field: ${key}`);
      }
      
      // Check for extremely short values (might be misrecognized)
      if (text.length === 1 && /[^a-zA-Z0-9]/.test(text)) {
        validation.confidence *= 0.9;
        validation.issues.push(`Very short field value: ${key}`);
      }
    }

    // Lower confidence if too many issues
    if (validation.issues.length > 3) {
      validation.confidence *= 0.7;
    }

    validation.isValid = validation.confidence > 0.5;
    
    return validation;
  }
}

module.exports = OCRService;