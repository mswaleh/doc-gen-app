const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key';

/**
 * Middleware to authenticate JWT tokens
 */
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      logger.warn(`Invalid token attempt from IP: ${req.ip}`);
      return res.status(403).json({ error: 'Invalid or expired token' });
    }

    req.user = user;
    next();
  });
};

/**
 * Generate JWT token for user
 */
const generateToken = (user) => {
  const payload = {
    username: user.username,
    platform: user.platform,
    userId: user.userId,
    iat: Math.floor(Date.now() / 1000)
  };

  return jwt.sign(payload, JWT_SECRET, { 
    expiresIn: '24h',
    issuer: 'cloud-file-manager'
  });
};

/**
 * Verify Salesforce JWT token
 */
const verifySalesforceToken = async (token) => {
  try {
    // In a real implementation, you would verify against Salesforce's JWT verification endpoint
    // For now, we'll do basic JWT verification
    const decoded = jwt.decode(token, { complete: true });
    
    if (!decoded) {
      throw new Error('Invalid token format');
    }

    // Basic validation
    const payload = decoded.payload;
    if (!payload.sub || !payload.aud) {
      throw new Error('Invalid Salesforce token payload');
    }

    return {
      valid: true,
      userId: payload.sub,
      username: payload.sub,
      platform: 'salesforce'
    };
  } catch (error) {
    logger.error('Salesforce token verification failed:', error);
    return { valid: false, error: error.message };
  }
};

/**
 * Verify ServiceNow JWT token
 */
const verifyServiceNowToken = async (token) => {
  try {
    // In a real implementation, you would verify against ServiceNow's JWT verification endpoint
    const decoded = jwt.decode(token, { complete: true });
    
    if (!decoded) {
      throw new Error('Invalid token format');
    }

    const payload = decoded.payload;
    if (!payload.user_name) {
      throw new Error('Invalid ServiceNow token payload');
    }

    return {
      valid: true,
      userId: payload.user_name,
      username: payload.user_name,
      platform: 'servicenow'
    };
  } catch (error) {
    logger.error('ServiceNow token verification failed:', error);
    return { valid: false, error: error.message };
  }
};

/**
 * Platform-specific token verification
 */
const verifyPlatformToken = async (platform, token) => {
  switch (platform.toLowerCase()) {
    case 'salesforce':
      return await verifySalesforceToken(token);
    case 'servicenow':
      return await verifyServiceNowToken(token);
    case 'standalone':
      // For standalone mode, we'll accept any valid JWT structure
      try {
        const decoded = jwt.decode(token);
        if (decoded && decoded.username) {
          return {
            valid: true,
            userId: decoded.username,
            username: decoded.username,
            platform: 'standalone'
          };
        }
        throw new Error('Invalid standalone token');
      } catch (error) {
        return { valid: false, error: error.message };
      }
    default:
      return { valid: false, error: 'Unsupported platform' };
  }
};

/**
 * Refresh token if it's close to expiring
 */
const refreshTokenIfNeeded = (token) => {
  try {
    const decoded = jwt.decode(token);
    const now = Math.floor(Date.now() / 1000);
    const timeUntilExpiry = decoded.exp - now;
    
    // Refresh if less than 1 hour remaining
    if (timeUntilExpiry < 3600) {
      return generateToken({
        username: decoded.username,
        platform: decoded.platform,
        userId: decoded.userId
      });
    }
    
    return null; // No refresh needed
  } catch (error) {
    logger.error('Token refresh check failed:', error);
    return null;
  }
};

module.exports = {
  authenticateToken,
  generateToken,
  verifySalesforceToken,
  verifyServiceNowToken,
  verifyPlatformToken,
  refreshTokenIfNeeded
};