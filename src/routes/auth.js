const express = require('express');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const { 
  generateToken, 
  verifyPlatformToken, 
  refreshTokenIfNeeded 
} = require('../middleware/auth');
const logger = require('../utils/logger');
const jwt = require('jsonwebtoken');

const fs = require('fs');
const axios = require('axios');

const router = express.Router();

// Rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: { error: 'Too many authentication attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * POST /api/auth/login
 * Authenticate user with platform-specific credentials
 */
router.post('/login', authLimiter, [
  body('platform')
    .isIn(['salesforce', 'servicenow', 'standalone'])
    .withMessage('Platform must be salesforce, servicenow, or standalone'),
  body('username')
    .trim()
    .isLength({ min: 1 })
    .withMessage('Username is required'),
  body('token')
    .optional()
    .isLength({ min: 1 })
    .withMessage('Token cannot be empty if provided')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { platform, username, token } = req.body;

    logger.logRequest(req, 'Login attempt');
    logger.info(`Login attempt for platform: ${platform}, username: ${username}`);

    let verificationResult;

    if (platform === 'standalone') {
      verificationResult = {
        valid: true,
        userId: username,
        username: username,
        platform: 'standalone'
      };
    } else if (token) {
      verificationResult = await verifyPlatformToken(platform, token);
    } else {
      return res.status(400).json({
        error: 'Token is required for platform authentication'
      });
    }

    if (!verificationResult.valid) {
      logger.warn(`Failed login attempt for ${username} on ${platform}: ${verificationResult.error}`);
      return res.status(401).json({
        error: 'Authentication failed',
        message: verificationResult.error
      });
    }

    // Generate our internal JWT token
    const internalToken = generateToken({
      username: verificationResult.username,
      platform: verificationResult.platform,
      userId: verificationResult.userId
    });

    logger.info(`Successful login for ${verificationResult.username} on ${platform}`);

    res.json({
      success: true,
      token: internalToken,
      user: {
        username: verificationResult.username,
        platform: verificationResult.platform,
        userId: verificationResult.userId
      },
      expiresIn: '24h'
    });

  } catch (error) {
    logger.logError(error, {
      endpoint: '/api/auth/login',
      body: { platform: req.body.platform, username: req.body.username }
    });

    res.status(500).json({
      error: 'Internal server error during authentication'
    });
  }
});

/**
 * POST /api/auth/verify
 * Verify and refresh token if needed
 */
router.post('/verify', [
  body('token')
    .isLength({ min: 1 })
    .withMessage('Token is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { token } = req.body;
    const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key';

    try {
      // Verify the token
      const decoded = jwt.verify(token, JWT_SECRET);
      
      // Check if token needs refresh
      const newToken = refreshTokenIfNeeded(token);

      res.json({
        valid: true,
        refreshed: !!newToken,
        token: newToken || token,
        user: {
          username: decoded.username,
          platform: decoded.platform,
          userId: decoded.userId
        }
      });
    } catch (jwtError) {
      res.status(401).json({
        valid: false,
        error: 'Invalid token'
      });
    }

  } catch (error) {
    logger.logError(error, { endpoint: '/api/auth/verify' });
    res.status(401).json({
      valid: false,
      error: 'Invalid token'
    });
  }
});

/**
 * POST /api/auth/logout
 * Logout user (client-side token removal)
 */
router.post('/logout', (req, res) => {
  logger.logRequest(req, 'Logout');
  
  // In a stateless JWT system, logout is handled client-side
  // We could implement a token blacklist here if needed
  
  res.json({
    success: true,
    message: 'Logged out successfully'
  });
});

/**
 * GET /api/auth/status
 * Get current authentication status
 */
router.get('/status', (req, res) => {
  // This endpoint doesn't require authentication
  // It's used to check if the user has a valid session
  
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.json({
      authenticated: false,
      message: 'No token provided'
    });
  }

  try {
    const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key';
    const decoded = jwt.verify(token, JWT_SECRET);
    
    res.json({
      authenticated: true,
      user: {
        username: decoded.username,
        platform: decoded.platform,
        userId: decoded.userId
      }
    });
  } catch (error) {
    res.json({
      authenticated: false,
      message: 'Invalid token'
    });
  }
});

/**
 * POST /api/auth/embed
 * Special authentication endpoint for embedded applications
 */
router.post('/embed', [
  body('parentUrl')
    .isURL()
    .withMessage('Valid parent URL is required'),
  body('username')
    .trim()
    .isLength({ min: 1 })
    .withMessage('Username is required'),
  body('platform')
    .isIn(['salesforce', 'servicenow'])
    .withMessage('Platform must be salesforce or servicenow'),
  body('recordId')
    .optional()
    .trim()
    .isLength({ min: 1 })
    .withMessage('Record ID cannot be empty if provided')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { parentUrl, username, platform, recordId, token } = req.body;

    logger.info(`Embed authentication for ${username} on ${platform} from ${parentUrl}`);

    // Verify parent URL is from allowed domain
    const allowedDomains = [
      /^https:\/\/.*\.salesforce\.com/,
      /^https:\/\/.*\.force\.com/,
      /^https:\/\/.*\.lightning\.force\.com/,
      /^https:\/\/.*\.servicenow\.com/,
      /^https:\/\/.*\.service-now\.com/
    ];

    const isAllowedDomain = allowedDomains.some(pattern => pattern.test(parentUrl));
    if (!isAllowedDomain) {
      logger.warn(`Embed request from unauthorized domain: ${parentUrl}`);
      return res.status(403).json({
        error: 'Unauthorized parent domain'
      });
    }

    let verificationResult;

    if (token) {
      // Verify platform token if provided
      verificationResult = await verifyPlatformToken(platform, token);
    } else {
      // For embedded mode, we can be more lenient with verification
      // In production, you'd want stronger verification
      verificationResult = {
        valid: true,
        userId: username,
        username: username,
        platform: platform
      };
    }

    if (!verificationResult.valid) {
      return res.status(401).json({
        error: 'Platform authentication failed',
        message: verificationResult.error
      });
    }

    // Generate token with additional embed context
    const internalToken = generateToken({
      username: verificationResult.username,
      platform: verificationResult.platform,
      userId: verificationResult.userId,
      embed: true,
      parentUrl: parentUrl,
      recordId: recordId
    });

    res.json({
      success: true,
      token: internalToken,
      user: {
        username: verificationResult.username,
        platform: verificationResult.platform,
        userId: verificationResult.userId
      },
      context: {
        embed: true,
        parentUrl: parentUrl,
        recordId: recordId
      }
    });

  } catch (error) {
    logger.logError(error, {
      endpoint: '/api/auth/embed',
      parentUrl: req.body.parentUrl,
      platform: req.body.platform
    });

    res.status(500).json({
      error: 'Internal server error during embed authentication'
    });
  }
});

/**
 * POST /api/auth/salesforce-jwt
 * Authenticate using Salesforce JWT Bearer Flow
 */
router.post('/salesforce-jwt', [
  body('username')
    .trim()
    .isLength({ min: 1 })
    .withMessage('Username is required'),
  body('instanceUrl')
    .optional()
    .isURL()
    .withMessage('Instance URL must be valid'),
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

    const { username, instanceUrl, recordId } = req.body;

    logger.info(`Salesforce JWT authentication for user: ${username}`);

    // Generate JWT for Salesforce
    const salesforceToken = await generateSalesforceJWT(username);
    
    if (!salesforceToken) {
      return res.status(401).json({
        error: 'Failed to authenticate with Salesforce'
      });
    }

    // Get user info from Salesforce
    const userInfo = await getSalesforceUserInfo(salesforceToken, instanceUrl);
    
    // Generate our internal token
    const internalToken = generateToken({
      username: userInfo.username || username,
      platform: 'salesforce',
      userId: userInfo.user_id || username,
      salesforceToken: salesforceToken,
      instanceUrl: instanceUrl,
      recordId: recordId
    });

    logger.info(`Successful Salesforce JWT authentication for ${username}`);

    res.json({
      success: true,
      token: internalToken,
      user: {
        username: userInfo.username || username,
        platform: 'salesforce',
        userId: userInfo.user_id || username,
        displayName: userInfo.display_name,
        email: userInfo.email
      },
      salesforce: {
        instanceUrl: instanceUrl,
        recordId: recordId,
        accessToken: salesforceToken // Be careful about exposing this
      }
    });

  } catch (error) {
    logger.logError(error, {
      endpoint: '/api/auth/salesforce-jwt',
      username: req.body.username
    });

    res.status(500).json({
      error: 'Salesforce authentication failed',
      message: error.message
    });
  }
});

/**
 * Generate JWT for Salesforce using private key
 */
async function generateSalesforceJWT(username) {
  try {
    const clientId = process.env.SALESFORCE_CLIENT_ID;
    const privateKeyPath = process.env.SALESFORCE_PRIVATE_KEY_PATH;
    const loginUrl = process.env.SALESFORCE_LOGIN_URL || 'https://login.salesforce.com';

    if (!clientId || !privateKeyPath) {
      throw new Error('Salesforce Connected App configuration missing');
    }

    // Read private key
    const privateKey = fs.readFileSync(privateKeyPath, 'utf8');

    // Create JWT payload
    const payload = {
      iss: clientId,
      sub: username,
      aud: loginUrl,
      exp: Math.floor(Date.now() / 1000) + (5 * 60) // 5 minutes
    };

    // Sign JWT
    const token = jwt.sign(payload, privateKey, { algorithm: 'RS256' });

    // Exchange JWT for access token
    const tokenResponse = await axios.post(`${loginUrl}/services/oauth2/token`, 
      new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: token
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    return tokenResponse.data.access_token;

  } catch (error) {
    logger.error('Failed to generate Salesforce JWT:', error);
    throw error;
  }
}

/**
 * Get user info from Salesforce
 */
async function getSalesforceUserInfo(accessToken, instanceUrl) {
  try {
    const response = await axios.get(`${instanceUrl}/services/oauth2/userinfo`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    return response.data;
  } catch (error) {
    logger.error('Failed to get Salesforce user info:', error);
    return {}; // Return empty object as fallback
  }
}

module.exports = router;