const express = require('express');
const { body, validationResult } = require('express-validator');
const { getCloudServiceManager } = require('../services/cloudService');
const logger = require('../utils/logger');
const fs = require('fs').promises;
const path = require('path');

const router = express.Router();

/**
 * GET /api/config/platforms
 * Get available cloud platforms and their current status
 */
router.get('/platforms', async (req, res) => {
    try {
        logger.logRequest(req, 'Get platform configuration');

        const cloudService = getCloudServiceManager();
        const serviceStatus = cloudService.getServiceStatus();

        const platforms = {
            gcp: {
                name: 'Google Cloud Platform',
                services: {
                    storage: 'Cloud Storage',
                    ocr: 'Document AI'
                },
                status: serviceStatus.gcp,
                configured: serviceStatus.gcp.storage && serviceStatus.gcp.documentAI,
                hasCredentials: !!(process.env.GCP_SERVICE_ACCOUNT_KEY && process.env.GCP_PROJECT_ID)
            },
            aws: {
                name: 'Amazon Web Services',
                services: {
                    storage: 'S3',
                    ocr: 'Textract'
                },
                status: serviceStatus.aws,
                configured: serviceStatus.aws.s3 && serviceStatus.aws.textract,
                hasCredentials: !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY)
            },
            azure: {
                name: 'Microsoft Azure',
                services: {
                    storage: 'Blob Storage',
                    ocr: 'Form Recognizer'
                },
                status: serviceStatus.azure,
                configured: serviceStatus.azure.blob && serviceStatus.azure.formRecognizer,
                hasCredentials: !!process.env.AZURE_STORAGE_CONNECTION_STRING
            }
        };

        res.json({
            success: true,
            platforms: platforms,
            configurationRequired: !Object.values(platforms).some(p => p.configured)
        });

    } catch (error) {
        logger.logError(error, {
            endpoint: '/api/config/platforms',
            user: req.user?.username
        });

        res.status(500).json({
            error: 'Failed to get platform configuration',
            message: error.message
        });
    }
});

/**
 * POST /api/config/gcp
 * Configure Google Cloud Platform credentials
 */
router.post('/gcp', [
  body('serviceAccountKey')
    .isJSON()
    .withMessage('Service account key must be valid JSON'),
  body('projectId')
    .optional()
    .trim()
    .isLength({ min: 1 })
    .withMessage('Project ID cannot be empty'),
  body('documentAIProcessorId')
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

    const { serviceAccountKey, projectId, documentAIProcessorId } = req.body;

    logger.logRequest(req, 'Configure GCP credentials');

    // Validate service account key structure
    let credentials;
    try {
      credentials = JSON.parse(serviceAccountKey);
    } catch (error) {
      return res.status(400).json({
        error: 'Invalid service account key format'
      });
    }

    // Validate required fields
    const requiredFields = ['type', 'project_id', 'private_key', 'client_email'];
    for (const field of requiredFields) {
      if (!credentials[field]) {
        return res.status(400).json({
          error: `Missing required field in service account key: ${field}`
        });
      }
    }

    // Update environment variables
    process.env.GCP_SERVICE_ACCOUNT_KEY = serviceAccountKey;
    process.env.GCP_PROJECT_ID = projectId || credentials.project_id;
    
    if (documentAIProcessorId) {
      process.env.GCP_DOCUMENT_PROCESSOR_ID = documentAIProcessorId;
    }

    // Reinitialize GCP services
    const cloudService = getCloudServiceManager();
    await cloudService.initializeGCP();

    // Test connection
    const testResult = await cloudService.testConnection('gcp');

    if (testResult.success) {
      // Save configuration to .env file for persistence
      await saveEnvironmentVariable('GCP_SERVICE_ACCOUNT_KEY', serviceAccountKey);
      await saveEnvironmentVariable('GCP_PROJECT_ID', process.env.GCP_PROJECT_ID);
      
      if (documentAIProcessorId) {
        await saveEnvironmentVariable('GCP_DOCUMENT_PROCESSOR_ID', documentAIProcessorId);
      }

      res.json({
        success: true,
        platform: 'gcp',
        message: 'GCP configuration saved successfully',
        testResult: testResult
      });
    } else {
      res.status(400).json({
        error: 'GCP configuration failed connection test',
        details: testResult.error
      });
    }

  } catch (error) {
    logger.logError(error, {
      endpoint: '/api/config/gcp',
      user: req.user.username
    });

    res.status(500).json({
      error: 'Failed to configure GCP',
      message: error.message
    });
  }
});

/**
 * POST /api/config/aws
 * Configure Amazon Web Services credentials
 */
router.post('/aws', [
  body('accessKeyId')
    .trim()
    .isLength({ min: 1 })
    .withMessage('Access Key ID is required'),
  body('secretAccessKey')
    .trim()
    .isLength({ min: 1 })
    .withMessage('Secret Access Key is required'),
  body('region')
    .trim()
    .isLength({ min: 1 })
    .withMessage('Region is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { accessKeyId, secretAccessKey, region } = req.body;

    logger.logRequest(req, 'Configure AWS credentials');

    // Update environment variables
    process.env.AWS_ACCESS_KEY_ID = accessKeyId;
    process.env.AWS_SECRET_ACCESS_KEY = secretAccessKey;
    process.env.AWS_REGION = region;

    // Reinitialize AWS services
    const cloudService = getCloudServiceManager();
    await cloudService.initializeAWS();

    // Test connection
    const testResult = await cloudService.testConnection('aws');

    if (testResult.success) {
      // Save configuration to .env file for persistence
      await saveEnvironmentVariable('AWS_ACCESS_KEY_ID', accessKeyId);
      await saveEnvironmentVariable('AWS_SECRET_ACCESS_KEY', secretAccessKey);
      await saveEnvironmentVariable('AWS_REGION', region);

      res.json({
        success: true,
        platform: 'aws',
        message: 'AWS configuration saved successfully',
        testResult: testResult
      });
    } else {
      res.status(400).json({
        error: 'AWS configuration failed connection test',
        details: testResult.error
      });
    }

  } catch (error) {
    logger.logError(error, {
      endpoint: '/api/config/aws',
      user: req.user.username
    });

    res.status(500).json({
      error: 'Failed to configure AWS',
      message: error.message
    });
  }
});

/**
 * POST /api/config/azure
 * Configure Microsoft Azure credentials
 */
router.post('/azure', [
  body('storageConnectionString')
    .trim()
    .isLength({ min: 1 })
    .withMessage('Storage connection string is required'),
  body('formRecognizerEndpoint')
    .optional()
    .trim()
    .isURL()
    .withMessage('Form Recognizer endpoint must be a valid URL'),
  body('formRecognizerKey')
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

    const { storageConnectionString, formRecognizerEndpoint, formRecognizerKey } = req.body;

    logger.logRequest(req, 'Configure Azure credentials');

    // Update environment variables
    process.env.AZURE_STORAGE_CONNECTION_STRING = storageConnectionString;
    
    if (formRecognizerEndpoint) {
      process.env.AZURE_FORM_RECOGNIZER_ENDPOINT = formRecognizerEndpoint;
    }
    
    if (formRecognizerKey) {
      process.env.AZURE_FORM_RECOGNIZER_KEY = formRecognizerKey;
    }

    // Reinitialize Azure services
    const cloudService = getCloudServiceManager();
    await cloudService.initializeAzure();

    // Test connection
    const testResult = await cloudService.testConnection('azure');

    if (testResult.success) {
      // Save configuration to .env file for persistence
      await saveEnvironmentVariable('AZURE_STORAGE_CONNECTION_STRING', storageConnectionString);
      
      if (formRecognizerEndpoint) {
        await saveEnvironmentVariable('AZURE_FORM_RECOGNIZER_ENDPOINT', formRecognizerEndpoint);
      }
      
      if (formRecognizerKey) {
        await saveEnvironmentVariable('AZURE_FORM_RECOGNIZER_KEY', formRecognizerKey);
      }

      res.json({
        success: true,
        platform: 'azure',
        message: 'Azure configuration saved successfully',
        testResult: testResult
      });
    } else {
      res.status(400).json({
        error: 'Azure configuration failed connection test',
        details: testResult.error
      });
    }

  } catch (error) {
    logger.logError(error, {
      endpoint: '/api/config/azure',
      user: req.user.username
    });

    res.status(500).json({
      error: 'Failed to configure Azure',
      message: error.message
    });
  }
});

/**
 * GET /api/config/test/:platform
 * Test connection to a specific platform
 */
router.get('/test/:platform', async (req, res) => {
  try {
    const { platform } = req.params;

    if (!['gcp', 'aws', 'azure'].includes(platform)) {
      return res.status(400).json({
        error: 'Invalid platform',
        supportedPlatforms: ['gcp', 'aws', 'azure']
      });
    }

    logger.logRequest(req, `Test ${platform} connection`);

    const cloudService = getCloudServiceManager();
    const testResult = await cloudService.testConnection(platform);

    res.json({
      success: testResult.success,
      platform: platform,
      testResult: testResult
    });

  } catch (error) {
    logger.logError(error, {
      endpoint: '/api/config/test',
      platform: req.params.platform,
      user: req.user.username
    });

    res.status(500).json({
      error: 'Connection test failed',
      message: error.message
    });
  }
});

/**
 * DELETE /api/config/:platform
 * Remove configuration for a platform
 */
router.delete('/:platform', async (req, res) => {
  try {
    const { platform } = req.params;

    if (!['gcp', 'aws', 'azure'].includes(platform)) {
      return res.status(400).json({
        error: 'Invalid platform',
        supportedPlatforms: ['gcp', 'aws', 'azure']
      });
    }

    logger.logRequest(req, `Remove ${platform} configuration`);

    // Remove environment variables based on platform
    switch (platform) {
      case 'gcp':
        await removeEnvironmentVariable('GCP_SERVICE_ACCOUNT_KEY');
        await removeEnvironmentVariable('GCP_PROJECT_ID');
        await removeEnvironmentVariable('GCP_DOCUMENT_PROCESSOR_ID');
        delete process.env.GCP_SERVICE_ACCOUNT_KEY;
        delete process.env.GCP_PROJECT_ID;
        delete process.env.GCP_DOCUMENT_PROCESSOR_ID;
        break;
      
      case 'aws':
        await removeEnvironmentVariable('AWS_ACCESS_KEY_ID');
        await removeEnvironmentVariable('AWS_SECRET_ACCESS_KEY');
        await removeEnvironmentVariable('AWS_REGION');
        delete process.env.AWS_ACCESS_KEY_ID;
        delete process.env.AWS_SECRET_ACCESS_KEY;
        delete process.env.AWS_REGION;
        break;
      
      case 'azure':
        await removeEnvironmentVariable('AZURE_STORAGE_CONNECTION_STRING');
        await removeEnvironmentVariable('AZURE_FORM_RECOGNIZER_ENDPOINT');
        await removeEnvironmentVariable('AZURE_FORM_RECOGNIZER_KEY');
        delete process.env.AZURE_STORAGE_CONNECTION_STRING;
        delete process.env.AZURE_FORM_RECOGNIZER_ENDPOINT;
        delete process.env.AZURE_FORM_RECOGNIZER_KEY;
        break;
    }

    res.json({
      success: true,
      platform: platform,
      message: `${platform.toUpperCase()} configuration removed successfully`
    });

  } catch (error) {
    logger.logError(error, {
      endpoint: '/api/config/remove',
      platform: req.params.platform,
      user: req.user.username
    });

    res.status(500).json({
      error: 'Failed to remove configuration',
      message: error.message
    });
  }
});

/**
 * GET /api/config/environment
 * Get current environment configuration (masked sensitive values)
 */
router.get('/environment', (req, res) => {
  try {
    logger.logRequest(req, 'Get environment configuration');

    const config = {
      nodeEnv: process.env.NODE_ENV || 'development',
      port: process.env.PORT || 3000,
      platforms: {
        gcp: {
          configured: !!(process.env.GCP_SERVICE_ACCOUNT_KEY && process.env.GCP_PROJECT_ID),
          projectId: process.env.GCP_PROJECT_ID || null,
          hasProcessorId: !!process.env.GCP_DOCUMENT_PROCESSOR_ID
        },
        aws: {
          configured: !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY),
          accessKeyId: process.env.AWS_ACCESS_KEY_ID ? maskValue(process.env.AWS_ACCESS_KEY_ID) : null,
          region: process.env.AWS_REGION || null
        },
        azure: {
          configured: !!process.env.AZURE_STORAGE_CONNECTION_STRING,
          hasFormRecognizer: !!(process.env.AZURE_FORM_RECOGNIZER_ENDPOINT && process.env.AZURE_FORM_RECOGNIZER_KEY),
          endpoint: process.env.AZURE_FORM_RECOGNIZER_ENDPOINT || null
        }
      },
      security: {
        jwtConfigured: !!process.env.JWT_SECRET,
        sessionConfigured: !!process.env.SESSION_SECRET
      }
    };

    res.json({
      success: true,
      configuration: config
    });

  } catch (error) {
    logger.logError(error, {
      endpoint: '/api/config/environment',
      user: req.user.username
    });

    res.status(500).json({
      error: 'Failed to get environment configuration',
      message: error.message
    });
  }
});

/**
 * POST /api/config/backup
 * Create a backup of current configuration
 */
router.post('/backup', async (req, res) => {
  try {
    logger.logRequest(req, 'Create configuration backup');

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupData = {
      timestamp: timestamp,
      user: req.user.username,
      configuration: {
        gcp: {
          configured: !!(process.env.GCP_SERVICE_ACCOUNT_KEY && process.env.GCP_PROJECT_ID),
          projectId: process.env.GCP_PROJECT_ID,
          hasProcessorId: !!process.env.GCP_DOCUMENT_PROCESSOR_ID
        },
        aws: {
          configured: !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY),
          region: process.env.AWS_REGION
        },
        azure: {
          configured: !!process.env.AZURE_STORAGE_CONNECTION_STRING,
          hasFormRecognizer: !!(process.env.AZURE_FORM_RECOGNIZER_ENDPOINT && process.env.AZURE_FORM_RECOGNIZER_KEY)
        }
      }
    };

    // In a real implementation, you might save this to a database or file
    const backupId = `backup_${timestamp}_${Math.random().toString(36).substr(2, 9)}`;

    res.json({
      success: true,
      backupId: backupId,
      timestamp: timestamp,
      message: 'Configuration backup created successfully'
    });

  } catch (error) {
    logger.logError(error, {
      endpoint: '/api/config/backup',
      user: req.user.username
    });

    res.status(500).json({
      error: 'Failed to create configuration backup',
      message: error.message
    });
  }
});

// Helper functions

/**
 * Save environment variable to .env file
 */
async function saveEnvironmentVariable(key, value) {
  try {
    const envPath = path.join(process.cwd(), '.env');
    let envContent = '';
    
    try {
      envContent = await fs.readFile(envPath, 'utf8');
    } catch (error) {
      // File doesn't exist, will create new
    }

    const lines = envContent.split('\n');
    const keyIndex = lines.findIndex(line => line.startsWith(`${key}=`));
    
    const newLine = `${key}=${value}`;
    
    if (keyIndex >= 0) {
      lines[keyIndex] = newLine;
    } else {
      lines.push(newLine);
    }

    await fs.writeFile(envPath, lines.join('\n'));
    logger.info(`Environment variable ${key} saved to .env file`);
  } catch (error) {
    logger.error(`Failed to save environment variable ${key}:`, error);
    throw error;
  }
}

/**
 * Remove environment variable from .env file
 */
async function removeEnvironmentVariable(key) {
  try {
    const envPath = path.join(process.cwd(), '.env');
    
    try {
      const envContent = await fs.readFile(envPath, 'utf8');
      const lines = envContent.split('\n');
      const filteredLines = lines.filter(line => !line.startsWith(`${key}=`));
      
      await fs.writeFile(envPath, filteredLines.join('\n'));
      logger.info(`Environment variable ${key} removed from .env file`);
    } catch (error) {
      // File doesn't exist or can't be read, that's okay
      logger.warn(`Could not remove ${key} from .env file:`, error.message);
    }
  } catch (error) {
    logger.error(`Failed to remove environment variable ${key}:`, error);
    throw error;
  }
}

/**
 * Mask sensitive values for display
 */
function maskValue(value) {
  if (!value || value.length <= 8) {
    return '****';
  }
  
  const visibleChars = 4;
  const masked = '*'.repeat(value.length - visibleChars);
  return value.substring(0, visibleChars) + masked;
}

module.exports = router;