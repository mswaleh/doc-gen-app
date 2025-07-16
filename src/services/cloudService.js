const { Storage } = require('@google-cloud/storage');
const { DocumentProcessorServiceClient } = require('@google-cloud/documentai');
// AWS SDK v3 imports
const { S3Client, ListBucketsCommand } = require('@aws-sdk/client-s3');
const { TextractClient } = require('@aws-sdk/client-textract');
const { BlobServiceClient } = require('@azure/storage-blob');
const { DocumentAnalysisClient, AzureKeyCredential } = require('@azure/ai-form-recognizer');
const logger = require('../utils/logger');
const NodeCache = require('node-cache');

// Cache for cloud service instances (1 hour TTL)
const serviceCache = new NodeCache({ stdTTL: 3600 });

/**
 * Clean and validate service account key JSON
 */
function cleanServiceAccountKey(serviceAccountKey) {
    let cleanKey = serviceAccountKey.trim();
    
    // Remove surrounding quotes if present
    if ((cleanKey.startsWith('"') && cleanKey.endsWith('"')) || 
        (cleanKey.startsWith("'") && cleanKey.endsWith("'"))) {
        cleanKey = cleanKey.slice(1, -1);
    }
    
    // Only replace \\n (double backslash) with \n, not actual newlines
    // This handles cases where the JSON was double-escaped
    cleanKey = cleanKey.replace(/\\\\n/g, '\\n');
    
    return cleanKey;
}

/**
 * Validate and parse service account key JSON
 */
function validateServiceAccountKey(serviceAccountKey) {
    if (!serviceAccountKey) {
        throw new Error('Service account key is empty or undefined');
    }

    // First try to parse as-is (for properly formatted JSON)
    try {
        const credentials = JSON.parse(serviceAccountKey);
        return validateCredentials(credentials);
    } catch (firstError) {
        // If that fails, try cleaning the key
        try {
            const cleanKey = cleanServiceAccountKey(serviceAccountKey);
            const credentials = JSON.parse(cleanKey);
            return validateCredentials(credentials);
        } catch (secondError) {
            // If still failing, provide detailed error
            logger.error('JSON parsing failed for service account key:', {
                originalError: firstError.message,
                cleanedError: secondError.message,
                keyLength: serviceAccountKey.length,
                firstChars: serviceAccountKey.substring(0, 100),
                hasActualNewlines: serviceAccountKey.includes('\n'),
                hasEscapedNewlines: serviceAccountKey.includes('\\n')
            });
            
            throw new Error(`JSON parsing failed: ${secondError.message}. Please ensure your service account key is properly formatted JSON.`);
        }
    }
}

/**
 * Validate credentials object
 */
function validateCredentials(credentials) {
    const requiredFields = ['type', 'project_id', 'private_key', 'client_email'];
    const missingFields = requiredFields.filter(field => !credentials[field]);
    
    if (missingFields.length > 0) {
        throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
    }
    
    if (credentials.type !== 'service_account') {
        throw new Error('Invalid credential type. Expected "service_account"');
    }
    
    // Validate private key format
    if (!credentials.private_key.includes('-----BEGIN PRIVATE KEY-----')) {
        throw new Error('Invalid private key format. Missing BEGIN marker.');
    }
    
    if (!credentials.private_key.includes('-----END PRIVATE KEY-----')) {
        throw new Error('Invalid private key format. Missing END marker.');
    }
    
    return credentials;
}

/**
 * Cloud Service Configuration Manager
 */
class CloudServiceManager {
  constructor() {
    this.gcpStorage = null;
    this.gcpDocumentAI = null;
    this.awsS3Client = null;
    this.awsTextractClient = null;
    this.azureBlob = null;
    this.azureFormRecognizer = null;
  }

  /**
   * Initialize all cloud services
   */
  async initialize() {
    logger.info('Initializing cloud services...');
    
    try {
      await this.initializeGCP();
      await this.initializeAWS();
      await this.initializeAzure();
      
      logger.info('All cloud services initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize some cloud services:', error);
      // Don't throw - app should still work with partial service availability
    }
  }

  /**
   * Initialize Google Cloud Platform services
   */
  async initializeGCP() {
    try {
      if (process.env.GCP_SERVICE_ACCOUNT_KEY) {
        const credentials = validateServiceAccountKey(process.env.GCP_SERVICE_ACCOUNT_KEY);
        
        // Initialize Cloud Storage
        this.gcpStorage = new Storage({
          credentials,
          projectId: credentials.project_id
        });

        // Initialize Document AI if processor ID is provided
        if (process.env.GCP_DOCUMENT_PROCESSOR_ID) {
          this.gcpDocumentAI = new DocumentProcessorServiceClient({
            credentials,
            projectId: credentials.project_id
          });
        }

        logger.info('GCP services initialized successfully', {
          projectId: credentials.project_id,
          clientEmail: credentials.client_email,
          documentAI: !!this.gcpDocumentAI
        });
      } else {
        logger.warn('GCP_SERVICE_ACCOUNT_KEY not found - GCP services disabled');
      }
    } catch (error) {
      logger.error('Failed to initialize GCP services:', error);
      throw error;
    }
  }

  /**
   * Initialize Amazon Web Services
   */
  async initializeAWS() {
    try {
      if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
        const awsConfig = {
          credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
          },
          region: process.env.AWS_REGION || 'us-east-1'
        };

        this.awsS3Client = new S3Client(awsConfig);
        this.awsTextractClient = new TextractClient(awsConfig);

        logger.info('AWS services initialized');
      } else {
        logger.warn('AWS credentials not found - AWS services disabled');
      }
    } catch (error) {
      logger.error('Failed to initialize AWS services:', error);
      throw error;
    }
  }

  /**
   * Initialize Microsoft Azure services
   */
  async initializeAzure() {
    try {
      if (process.env.AZURE_STORAGE_CONNECTION_STRING) {
        this.azureBlob = BlobServiceClient.fromConnectionString(
          process.env.AZURE_STORAGE_CONNECTION_STRING
        );

        logger.info('Azure Blob Storage initialized');
      }

      if (process.env.AZURE_FORM_RECOGNIZER_ENDPOINT && process.env.AZURE_FORM_RECOGNIZER_KEY) {
        this.azureFormRecognizer = new DocumentAnalysisClient(
          process.env.AZURE_FORM_RECOGNIZER_ENDPOINT,
          new AzureKeyCredential(process.env.AZURE_FORM_RECOGNIZER_KEY)
        );

        logger.info('Azure Form Recognizer initialized');
      }

      if (!this.azureBlob && !this.azureFormRecognizer) {
        logger.warn('Azure credentials not found - Azure services disabled');
      }
    } catch (error) {
      logger.error('Failed to initialize Azure services:', error);
      throw error;
    }
  }

  /**
   * Get GCP Storage client
   */
  getGCPStorage() {
    if (!this.gcpStorage) {
      throw new Error('GCP Storage not initialized. Please configure GCP credentials.');
    }
    return this.gcpStorage;
  }

  /**
   * Get GCP Document AI client
   */
  getGCPDocumentAI() {
    if (!this.gcpDocumentAI) {
      throw new Error('GCP Document AI not initialized. Please configure GCP Document Processor ID.');
    }
    return this.gcpDocumentAI;
  }

  /**
   * Get AWS S3 client
   */
  getAWSS3() {
    if (!this.awsS3Client) {
      throw new Error('AWS S3 not initialized. Please configure AWS credentials.');
    }
    return this.awsS3Client;
  }

  /**
   * Get AWS Textract client
   */
  getAWSTextract() {
    if (!this.awsTextractClient) {
      throw new Error('AWS Textract not initialized. Please configure AWS credentials.');
    }
    return this.awsTextractClient;
  }

  /**
   * Get Azure Blob client
   */
  getAzureBlob() {
    if (!this.azureBlob) {
      throw new Error('Azure Blob Storage not initialized. Please configure Azure credentials.');
    }
    return this.azureBlob;
  }

  /**
   * Get Azure Form Recognizer client
   */
  getAzureFormRecognizer() {
    if (!this.azureFormRecognizer) {
      throw new Error('Azure Form Recognizer not initialized. Please configure Azure credentials.');
    }
    return this.azureFormRecognizer;
  }

  /**
   * Test connection to a specific cloud platform
   */
  async testConnection(platform) {
    try {
      switch (platform.toLowerCase()) {
        case 'gcp':
          return await this.testGCPConnection();
        case 'aws':
          return await this.testAWSConnection();
        case 'azure':
          return await this.testAzureConnection();
        default:
          throw new Error(`Unsupported platform: ${platform}`);
      }
    } catch (error) {
      logger.error(`Connection test failed for ${platform}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Test GCP connection
   */
  async testGCPConnection() {
    try {
      const storage = this.getGCPStorage();
      const [buckets] = await storage.getBuckets({ maxResults: 1 });
      
      return {
        success: true,
        message: 'GCP connection successful',
        bucketCount: buckets.length
      };
    } catch (error) {
      throw new Error(`GCP connection failed: ${error.message}`);
    }
  }

  /**
   * Test AWS connection
   */
  async testAWSConnection() {
    try {
      const s3Client = this.getAWSS3();
      const command = new ListBucketsCommand({});
      const result = await s3Client.send(command);
      
      return {
        success: true,
        message: 'AWS connection successful',
        bucketCount: result.Buckets.length
      };
    } catch (error) {
      throw new Error(`AWS connection failed: ${error.message}`);
    }
  }

  /**
   * Test Azure connection
   */
  async testAzureConnection() {
    try {
      const blobService = this.getAzureBlob();
      const iterator = blobService.listContainers({ maxPageSize: 1 });
      const { value } = await iterator.next();
      
      return {
        success: true,
        message: 'Azure connection successful',
        containerCount: value ? value.length : 0
      };
    } catch (error) {
      throw new Error(`Azure connection failed: ${error.message}`);
    }
  }

  /**
   * Get available buckets/containers for a platform
   */
  async getBuckets(platform) {
    const cacheKey = `buckets_${platform}`;
    const cached = serviceCache.get(cacheKey);
    
    if (cached) {
      return cached;
    }

    try {
      let buckets = [];
      
      switch (platform.toLowerCase()) {
        case 'gcp':
          buckets = await this.getGCPBuckets();
          break;
        case 'aws':
          buckets = await this.getAWSBuckets();
          break;
        case 'azure':
          buckets = await this.getAzureBuckets();
          break;
        default:
          throw new Error(`Unsupported platform: ${platform}`);
      }

      // Cache for 5 minutes
      serviceCache.set(cacheKey, buckets, 300);
      return buckets;
    } catch (error) {
      logger.error(`Failed to get buckets for ${platform}:`, error);
      throw error;
    }
  }

  /**
   * Get GCP buckets
   */
  async getGCPBuckets() {
    const storage = this.getGCPStorage();
    const [buckets] = await storage.getBuckets();
    return buckets.map(bucket => bucket.name);
  }

  /**
   * Get AWS buckets
   */
  async getAWSBuckets() {
    const s3Client = this.getAWSS3();
    const command = new ListBucketsCommand({});
    const result = await s3Client.send(command);
    return result.Buckets.map(bucket => bucket.Name);
  }

  /**
   * Get Azure containers
   */
  async getAzureBuckets() {
    const blobService = this.getAzureBlob();
    const containers = [];
    
    for await (const container of blobService.listContainers()) {
      containers.push(container.name);
    }
    
    return containers;
  }

  /**
   * Get service status for all platforms
   */
  getServiceStatus() {
    return {
      gcp: {
        storage: !!this.gcpStorage,
        documentAI: !!this.gcpDocumentAI
      },
      aws: {
        s3: !!this.awsS3Client,
        textract: !!this.awsTextractClient
      },
      azure: {
        blob: !!this.azureBlob,
        formRecognizer: !!this.azureFormRecognizer
      }
    };
  }
}

// Create singleton instance
const cloudServiceManager = new CloudServiceManager();

/**
 * Initialize cloud services
 */
const initializeCloudServices = async () => {
  await cloudServiceManager.initialize();
};

/**
 * Get cloud service manager instance
 */
const getCloudServiceManager = () => {
  return cloudServiceManager;
};

module.exports = {
  initializeCloudServices,
  getCloudServiceManager,
  CloudServiceManager,
  validateServiceAccountKey
};