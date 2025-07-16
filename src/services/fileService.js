const { getCloudServiceManager } = require('./cloudService');
const logger = require('../utils/logger');
const mime = require('mime-types');
const path = require('path');

/**
 * File Service - Handles file operations across cloud platforms
 */
class FileService {
  constructor(platform) {
    this.platform = platform.toLowerCase();
    this.cloudService = getCloudServiceManager();
  }

  /**
   * List files in a bucket/container
   */
  async listFiles(bucketName, prefix = '') {
    try {
      switch (this.platform) {
        case 'gcp':
          return await this.listGCPFiles(bucketName, prefix);
        case 'aws':
          return await this.listAWSFiles(bucketName, prefix);
        case 'azure':
          return await this.listAzureFiles(bucketName, prefix);
        default:
          throw new Error(`Unsupported platform: ${this.platform}`);
      }
    } catch (error) {
      logger.error(`Failed to list files on ${this.platform}:`, error);
      throw error;
    }
  }

  /**
   * Upload a file
   */
  async uploadFile(bucketName, fileName, buffer, contentType) {
    try {
      // Ensure content type is set
      if (!contentType) {
        contentType = mime.lookup(fileName) || 'application/octet-stream';
      }

      switch (this.platform) {
        case 'gcp':
          return await this.uploadGCPFile(bucketName, fileName, buffer, contentType);
        case 'aws':
          return await this.uploadAWSFile(bucketName, fileName, buffer, contentType);
        case 'azure':
          return await this.uploadAzureFile(bucketName, fileName, buffer, contentType);
        default:
          throw new Error(`Unsupported platform: ${this.platform}`);
      }
    } catch (error) {
      logger.error(`Failed to upload file on ${this.platform}:`, error);
      throw error;
    }
  }

  /**
   * Delete a file
   */
  async deleteFile(bucketName, fileName) {
    try {
      switch (this.platform) {
        case 'gcp':
          return await this.deleteGCPFile(bucketName, fileName);
        case 'aws':
          return await this.deleteAWSFile(bucketName, fileName);
        case 'azure':
          return await this.deleteAzureFile(bucketName, fileName);
        default:
          throw new Error(`Unsupported platform: ${this.platform}`);
      }
    } catch (error) {
      logger.error(`Failed to delete file on ${this.platform}:`, error);
      throw error;
    }
  }

  /**
   * Download a file
   */
  async downloadFile(bucketName, fileName) {
    try {
      switch (this.platform) {
        case 'gcp':
          return await this.downloadGCPFile(bucketName, fileName);
        case 'aws':
          return await this.downloadAWSFile(bucketName, fileName);
        case 'azure':
          return await this.downloadAzureFile(bucketName, fileName);
        default:
          throw new Error(`Unsupported platform: ${this.platform}`);
      }
    } catch (error) {
      logger.error(`Failed to download file on ${this.platform}:`, error);
      throw error;
    }
  }

  /**
   * Generate a temporary share link
   */
  async generateShareLink(bucketName, fileName, expirationHours) {
    try {
      const expirationDate = new Date(Date.now() + expirationHours * 60 * 60 * 1000);

      switch (this.platform) {
        case 'gcp':
          return await this.generateGCPShareLink(bucketName, fileName, expirationDate);
        case 'aws':
          return await this.generateAWSShareLink(bucketName, fileName, expirationHours);
        case 'azure':
          return await this.generateAzureShareLink(bucketName, fileName, expirationDate);
        default:
          throw new Error(`Unsupported platform: ${this.platform}`);
      }
    } catch (error) {
      logger.error(`Failed to generate share link on ${this.platform}:`, error);
      throw error;
    }
  }

  /**
   * Initiate multipart upload
   */
  async initiateMultipartUpload(bucketName, fileName, contentType) {
    try {
      switch (this.platform) {
        case 'gcp':
          return await this.initiateGCPResumableUpload(bucketName, fileName, contentType);
        case 'aws':
          return await this.initiateAWSMultipartUpload(bucketName, fileName, contentType);
        case 'azure':
          return await this.initiateAzureBlockUpload(bucketName, fileName, contentType);
        default:
          throw new Error(`Unsupported platform: ${this.platform}`);
      }
    } catch (error) {
      logger.error(`Failed to initiate multipart upload on ${this.platform}:`, error);
      throw error;
    }
  }

  /**
   * Upload a part of multipart upload
   */
  async uploadPart(bucketName, fileName, uploadId, partNumber, buffer) {
    try {
      switch (this.platform) {
        case 'gcp':
          return await this.uploadGCPChunk(bucketName, fileName, uploadId, partNumber, buffer);
        case 'aws':
          return await this.uploadAWSPart(bucketName, fileName, uploadId, partNumber, buffer);
        case 'azure':
          return await this.uploadAzureBlock(bucketName, fileName, uploadId, partNumber, buffer);
        default:
          throw new Error(`Unsupported platform: ${this.platform}`);
      }
    } catch (error) {
      logger.error(`Failed to upload part on ${this.platform}:`, error);
      throw error;
    }
  }

  /**
   * Complete multipart upload
   */
  async completeMultipartUpload(bucketName, fileName, uploadId, parts) {
    try {
      switch (this.platform) {
        case 'gcp':
          return await this.completeGCPResumableUpload(bucketName, fileName, uploadId);
        case 'aws':
          return await this.completeAWSMultipartUpload(bucketName, fileName, uploadId, parts);
        case 'azure':
          return await this.completeAzureBlockUpload(bucketName, fileName, uploadId, parts);
        default:
          throw new Error(`Unsupported platform: ${this.platform}`);
      }
    } catch (error) {
      logger.error(`Failed to complete multipart upload on ${this.platform}:`, error);
      throw error;
    }
  }

  // GCP Implementation Methods
	async listGCPFiles(bucketName, prefix) {
	    try {
	        const storage = this.cloudService.getGCPStorage();
	        const bucket = storage.bucket(bucketName);
        
	        const [files] = await bucket.getFiles({
	            prefix: prefix,
	            maxResults: 1000
	        });

	        const fileList = [];
	        for (const file of files) {
	            try {
	                const [metadata] = await file.getMetadata();
	                fileList.push({
	                    fileName: file.name,
	                    size: parseInt(metadata.size) || 0,
	                    lastModified: new Date(metadata.updated || metadata.timeCreated),
	                    contentType: metadata.contentType || this.getMimeType(file.name),
	                    etag: metadata.etag,
	                    md5Hash: metadata.md5Hash
	                });
	            } catch (metadataError) {
	                logger.warn(`Failed to get metadata for file ${file.name}:`, metadataError);
	                fileList.push({
	                    fileName: file.name,
	                    size: 0,
	                    lastModified: new Date(),
	                    contentType: this.getMimeType(file.name),
	                    etag: '',
	                    md5Hash: ''
	                });
	            }
	        }

	        return fileList;
	    } catch (error) {
	        logger.error('Failed to list GCP files:', error);
	        throw new Error(`Failed to list files: ${error.message}`);
	    }
	}

  async uploadGCPFile(bucketName, fileName, buffer, contentType) {
    const storage = this.cloudService.getGCPStorage();
    const bucket = storage.bucket(bucketName);
    const file = bucket.file(fileName);

    const stream = file.createWriteStream({
      metadata: {
        contentType: contentType
      },
      resumable: false
    });

    return new Promise((resolve, reject) => {
      stream.on('error', reject);
      stream.on('finish', () => {
        resolve({ success: true, fileName: fileName });
      });
      stream.end(buffer);
    });
  }

  async deleteGCPFile(bucketName, fileName) {
    const storage = this.cloudService.getGCPStorage();
    const bucket = storage.bucket(bucketName);
    const file = bucket.file(fileName);

    await file.delete();
    return { success: true, fileName: fileName };
  }

  async downloadGCPFile(bucketName, fileName) {
    const storage = this.cloudService.getGCPStorage();
    const bucket = storage.bucket(bucketName);
    const file = bucket.file(fileName);

    const [buffer] = await file.download();
    const [metadata] = await file.getMetadata();

    return {
      buffer: buffer,
      contentType: metadata.contentType || mime.lookup(fileName) || 'application/octet-stream',
      size: parseInt(metadata.size)
    };
  }

  async generateGCPShareLink(bucketName, fileName, expirationDate) {
    const storage = this.cloudService.getGCPStorage();
    const bucket = storage.bucket(bucketName);
    const file = bucket.file(fileName);

    const [url] = await file.getSignedUrl({
      action: 'read',
      expires: expirationDate
    });

    return url;
  }

  async initiateGCPResumableUpload(bucketName, fileName, contentType) {
    const storage = this.cloudService.getGCPStorage();
    const bucket = storage.bucket(bucketName);
    const file = bucket.file(fileName);

    // For GCP, we'll use a simple identifier
    const uploadId = `gcp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Store upload session info (in production, use Redis or database)
    const uploadSession = {
      uploadId: uploadId,
      bucketName: bucketName,
      fileName: fileName,
      contentType: contentType,
      chunks: []
    };

    return uploadId;
  }

  async uploadGCPChunk(bucketName, fileName, uploadId, partNumber, buffer) {
    // For GCP resumable upload, we'll accumulate chunks and upload at completion
    // In production, implement proper GCP resumable upload protocol
    return `gcp_chunk_${partNumber}_${uploadId}`;
  }

  async completeGCPResumableUpload(bucketName, fileName, uploadId) {
    // For simplified implementation, perform final upload here
    // In production, combine all chunks and upload
    return { success: true, uploadId: uploadId };
  }

  // AWS Implementation Methods

  async listAWSFiles(bucketName, prefix) {
    const s3 = this.cloudService.getAWSS3();
    
    const params = {
      Bucket: bucketName,
      Prefix: prefix,
      MaxKeys: 1000
    };

    const result = await s3.listObjectsV2(params).promise();

    return result.Contents.map(object => ({
      fileName: object.Key,
      size: object.Size,
      lastModified: object.LastModified,
      contentType: null, // Not returned by listObjectsV2
      etag: object.ETag
    }));
  }

  async uploadAWSFile(bucketName, fileName, buffer, contentType) {
    const s3 = this.cloudService.getAWSS3();

    const params = {
      Bucket: bucketName,
      Key: fileName,
      Body: buffer,
      ContentType: contentType
    };

    const result = await s3.upload(params).promise();
    return { success: true, fileName: fileName, location: result.Location };
  }

  async deleteAWSFile(bucketName, fileName) {
    const s3 = this.cloudService.getAWSS3();

    const params = {
      Bucket: bucketName,
      Key: fileName
    };

    await s3.deleteObject(params).promise();
    return { success: true, fileName: fileName };
  }

  async downloadAWSFile(bucketName, fileName) {
    const s3 = this.cloudService.getAWSS3();

    const params = {
      Bucket: bucketName,
      Key: fileName
    };

    const result = await s3.getObject(params).promise();

    return {
      buffer: result.Body,
      contentType: result.ContentType || mime.lookup(fileName) || 'application/octet-stream',
      size: result.ContentLength
    };
  }

  async generateAWSShareLink(bucketName, fileName, expirationHours) {
    const s3 = this.cloudService.getAWSS3();

    const params = {
      Bucket: bucketName,
      Key: fileName,
      Expires: expirationHours * 3600 // Convert to seconds
    };

    return s3.getSignedUrl('getObject', params);
  }

  async initiateAWSMultipartUpload(bucketName, fileName, contentType) {
    const s3 = this.cloudService.getAWSS3();

    const params = {
      Bucket: bucketName,
      Key: fileName,
      ContentType: contentType
    };

    const result = await s3.createMultipartUpload(params).promise();
    return result.UploadId;
  }

  async uploadAWSPart(bucketName, fileName, uploadId, partNumber, buffer) {
    const s3 = this.cloudService.getAWSS3();

    const params = {
      Bucket: bucketName,
      Key: fileName,
      UploadId: uploadId,
      PartNumber: partNumber,
      Body: buffer
    };

    const result = await s3.uploadPart(params).promise();
    return result.ETag;
  }

  async completeAWSMultipartUpload(bucketName, fileName, uploadId, parts) {
    const s3 = this.cloudService.getAWSS3();

    const params = {
      Bucket: bucketName,
      Key: fileName,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: parts.map(part => ({
          ETag: part.etag,
          PartNumber: part.partNumber
        }))
      }
    };

    const result = await s3.completeMultipartUpload(params).promise();
    return { success: true, location: result.Location };
  }

  // Azure Implementation Methods

  async listAzureFiles(bucketName, prefix) {
    const blobService = this.cloudService.getAzureBlob();
    const containerClient = blobService.getContainerClient(bucketName);
    
    const blobs = [];
    for await (const blob of containerClient.listBlobsFlat({ prefix: prefix })) {
      blobs.push({
        fileName: blob.name,
        size: blob.properties.contentLength,
        lastModified: blob.properties.lastModified,
        contentType: blob.properties.contentType,
        etag: blob.properties.etag
      });
    }

    return blobs;
  }

  async uploadAzureFile(bucketName, fileName, buffer, contentType) {
    const blobService = this.cloudService.getAzureBlob();
    const containerClient = blobService.getContainerClient(bucketName);
    const blockBlobClient = containerClient.getBlockBlobClient(fileName);

    const result = await blockBlobClient.upload(buffer, buffer.length, {
      blobHTTPHeaders: {
        blobContentType: contentType
      }
    });

    return { success: true, fileName: fileName, etag: result.etag };
  }

  async deleteAzureFile(bucketName, fileName) {
    const blobService = this.cloudService.getAzureBlob();
    const containerClient = blobService.getContainerClient(bucketName);
    const blobClient = containerClient.getBlobClient(fileName);

    await blobClient.delete();
    return { success: true, fileName: fileName };
  }

  async downloadAzureFile(bucketName, fileName) {
    const blobService = this.cloudService.getAzureBlob();
    const containerClient = blobService.getContainerClient(bucketName);
    const blobClient = containerClient.getBlobClient(fileName);

    const downloadResponse = await blobClient.download();
    const buffer = await this.streamToBuffer(downloadResponse.readableStreamBody);

    return {
      buffer: buffer,
      contentType: downloadResponse.contentType || mime.lookup(fileName) || 'application/octet-stream',
      size: downloadResponse.contentLength
    };
  }

  async generateAzureShareLink(bucketName, fileName, expirationDate) {
    const blobService = this.cloudService.getAzureBlob();
    const containerClient = blobService.getContainerClient(bucketName);
    const blobClient = containerClient.getBlobClient(fileName);

    // Generate SAS token
    const sasToken = await blobClient.generateSasUrl({
      permissions: 'r', // read permission
      expiresOn: expirationDate
    });

    return sasToken;
  }

  async initiateAzureBlockUpload(bucketName, fileName, contentType) {
    // For Azure, we'll use a simple identifier and track blocks
    const uploadId = `azure_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    return uploadId;
  }

  async uploadAzureBlock(bucketName, fileName, uploadId, partNumber, buffer) {
    const blobService = this.cloudService.getAzureBlob();
    const containerClient = blobService.getContainerClient(bucketName);
    const blockBlobClient = containerClient.getBlockBlobClient(fileName);

    // Generate block ID
    const blockId = Buffer.from(partNumber.toString().padStart(6, '0')).toString('base64');
    
    await blockBlobClient.stageBlock(blockId, buffer, buffer.length);
    return blockId;
  }

  async completeAzureBlockUpload(bucketName, fileName, uploadId, parts) {
    const blobService = this.cloudService.getAzureBlob();
    const containerClient = blobService.getContainerClient(bucketName);
    const blockBlobClient = containerClient.getBlockBlobClient(fileName);

    // Commit the blocks
    const blockIds = parts.map(part => part.etag); // etag contains the block ID
    await blockBlobClient.commitBlockList(blockIds);
    
    return { success: true, fileName: fileName };
  }
	
	

  // Helper Methods

  /**
   * Convert a stream to buffer
   */
  async streamToBuffer(readableStream) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      readableStream.on('data', (data) => {
        chunks.push(data instanceof Buffer ? data : Buffer.from(data));
      });
      readableStream.on('end', () => {
        resolve(Buffer.concat(chunks));
      });
      readableStream.on('error', reject);
    });
  }

  /**
   * Format file size for display
   */
  static formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * Get file extension
   */
  static getFileExtension(fileName) {
    return path.extname(fileName).toLowerCase();
  }

  /**
   * Check if file is an image
   */
  static isImageFile(fileName, contentType) {
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.webp'];
    const imageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/bmp', 'image/tiff', 'image/webp'];
    
    const extension = this.getFileExtension(fileName);
    
    return imageExtensions.includes(extension) || 
           (contentType && imageTypes.some(type => contentType.includes(type)));
  }

  /**
   * Check if file is a PDF
   */
  static isPDFFile(fileName, contentType) {
    const extension = this.getFileExtension(fileName);
    return extension === '.pdf' || (contentType && contentType.includes('pdf'));
  }

  /**
   * Check if file is a video
   */
  static isVideoFile(fileName, contentType) {
    const videoExtensions = ['.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.mkv'];
    const videoTypes = ['video/'];
    
    const extension = this.getFileExtension(fileName);
    
    return videoExtensions.includes(extension) || 
           (contentType && videoTypes.some(type => contentType.includes(type)));
  }

  /**
   * Check if file is OCR compatible
   */
  static isOCRCompatible(fileName, contentType) {
    return this.isPDFFile(fileName, contentType) || this.isImageFile(fileName, contentType);
  }

  /**
   * Validate file name for cloud storage
   */
  static validateFileName(fileName) {
    // Remove or replace invalid characters
    const sanitized = fileName
      .replace(/[<>:"/\\|?*]/g, '_') // Replace invalid chars with underscore
      .replace(/\s+/g, '_') // Replace spaces with underscore
      .replace(/_{2,}/g, '_') // Replace multiple underscores with single
      .replace(/^_+|_+$/g, ''); // Remove leading/trailing underscores

    // Ensure it's not empty and not too long
    if (!sanitized || sanitized.length === 0) {
      throw new Error('File name cannot be empty');
    }

    if (sanitized.length > 255) {
      throw new Error('File name too long (max 255 characters)');
    }

    return sanitized;
  }

  /**
   * Get MIME type from file name
   */
  static getMimeType(fileName) {
    return mime.lookup(fileName) || 'application/octet-stream';
  }
}

module.exports = FileService;