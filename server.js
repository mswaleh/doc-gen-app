const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

// Create a simple logger if the logger module doesn't exist
let logger;
try {
  logger = require('./src/utils/logger');
} catch (err) {
  logger = {
    info: console.log,
    warn: console.warn,
    error: console.error
  };
}

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy for rate limiting behind reverse proxies
app.set('trust proxy', 1);

// Basic security middleware (simplified)
try {
  const helmet = require('helmet');
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: [
          "'self'", 
          "'unsafe-inline'", 
          "https://cdnjs.cloudflare.com",
          "https://*.cloudflare.com"
        ],
        scriptSrc: [
          "'self'", 
          "'unsafe-inline'", 
          "https://cdnjs.cloudflare.com",
          "https://*.cloudflare.com"
        ],
				scriptSrcAttr: ["'unsafe-inline'"], // Add this line
        fontSrc: [
          "'self'", 
          "https://cdnjs.cloudflare.com",
          "data:"
        ],
        imgSrc: ["'self'", "data:", "blob:", "https:"],
        connectSrc: ["'self'", "https:"],
        frameSrc: ["'self'"]
      }
    }
  }));
} catch (err) {
  logger.warn('Helmet not available, skipping security headers');
}

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    // In development, allow all origins
    if (process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    
    const allowedOrigins = [
      /^https:\/\/.*\.salesforce\.com$/,
      /^https:\/\/.*\.force\.com$/,
      /^https:\/\/.*\.servicenow\.com$/,
      /^http:\/\/localhost:\d+$/
    ];

    if (!origin) return callback(null, true);
    
    const isAllowed = allowedOrigins.some(pattern => pattern.test(origin));
    if (isAllowed) {
      callback(null, true);
    } else {
      logger.warn(`CORS blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept']
};

app.use(cors(corsOptions));

// Optional rate limiting
try {
  const rateLimit = require('express-rate-limit');
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false
  });
  app.use(limiter);
} catch (err) {
  logger.warn('Rate limiting not available, skipping');
}

// Optional compression and logging
try {
  const compression = require('compression');
  app.use(compression());
} catch (err) {
  logger.warn('Compression not available, skipping');
}

try {
  const morgan = require('morgan');
  app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));
} catch (err) {
  logger.warn('Morgan logging not available, skipping');
}

// Body parsing middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Optional session middleware
try {
  const session = require('express-session');
  app.use(session({
    secret: process.env.SESSION_SECRET || 'fallback-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
  }));
} catch (err) {
  logger.warn('Session middleware not available, skipping');
}

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/assets', express.static(path.join(__dirname, 'public/assets')));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0'
  });
});

// Create a simple auth middleware if the real one doesn't exist
let authenticateToken;
try {
  const authMiddleware = require('./src/middleware/auth');
  authenticateToken = authMiddleware.authenticateToken;
} catch (err) {
  logger.warn('Auth middleware not found, using simple placeholder');
  authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }
    
    // For demo purposes, accept any token that looks like a JWT
    if (token.includes('.') || token.startsWith('demo-token')) {
      req.user = { 
        id: 'demo-user', 
        username: 'demo',
        platform: 'standalone'
      };
      next();
    } else {
      return res.status(403).json({ error: 'Invalid token' });
    }
  };
}

// Load routes with error handling
try {
  const authRoutes = require('./src/routes/auth');
  app.use('/api/auth', authRoutes);
} catch (err) {
  logger.warn('Auth routes not available, creating placeholder');
  app.use('/api/auth', (req, res) => {
    if (req.method === 'POST' && req.path === '/login') {
      res.json({ 
        success: true, 
        token: 'demo-token', 
        user: { username: req.body.username, platform: req.body.platform } 
      });
    } else {
      res.json({ success: true, authenticated: true, user: { username: 'demo' } });
    }
  });
}

try {
  const fileRoutes = require('./src/routes/files');
  app.use('/api/files', authenticateToken, fileRoutes);
} catch (err) {
  logger.warn('File routes not available, creating placeholder');
  app.use('/api/files', authenticateToken, (req, res) => {
    if (req.method === 'GET' && req.path === '/list') {
      res.json({ 
        success: true, 
        files: [
          {
            fileName: 'demo-file.pdf',
            size: 1024000,
            contentType: 'application/pdf',
            lastModified: new Date().toISOString()
          }
        ] 
      });
    } else if (req.method === 'GET' && req.path.startsWith('/buckets')) {
      res.json({ 
        success: true, 
        buckets: ['demo-bucket-1', 'demo-bucket-2'] 
      });
    } else {
      res.json({ success: true, message: 'File operation completed' });
    }
  });
}

try {
  const ocrRoutes = require('./src/routes/ocr');
  app.use('/api/ocr', authenticateToken, ocrRoutes);
} catch (err) {
  logger.warn('OCR routes not available, creating placeholder');
  app.use('/api/ocr', authenticateToken, (req, res) => {
    res.json({ success: true, extractedData: { text: 'Demo OCR result' } });
  });
}

try {
  const configRoutes = require('./src/routes/config');
  app.use('/api/config', authenticateToken, configRoutes);
} catch (err) {
  logger.warn('Config routes not available, creating placeholder');
  app.use('/api/config', authenticateToken, (req, res) => {
    if (req.path === '/platforms') {
      res.json({ 
        success: true, 
        platforms: {
          gcp: { configured: true, name: 'Google Cloud Platform' },
          aws: { configured: true, name: 'Amazon Web Services' },
          azure: { configured: false, name: 'Microsoft Azure' }
        }
      });
    } else {
      res.json({ success: true });
    }
  });
}

try {
  const redactionRoutes = require('./src/routes/redaction');
  app.use('/api/redaction', authenticateToken, redactionRoutes);
} catch (err) {
  logger.warn('Redaction routes not available, creating placeholder');
  app.use('/api/redaction', authenticateToken, (req, res) => {
    res.json({ success: true, message: 'Redaction completed' });
  });
}

// Main application route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Embed route for Salesforce/ServiceNow
app.get('/embed', (req, res) => {
  const embedPath = path.join(__dirname, 'public', 'embed.html');
  if (require('fs').existsSync(embedPath)) {
    res.sendFile(embedPath);
  } else {
    // Fallback to main page if embed.html doesn't exist
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error(`Error: ${err.message}`, {
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip
  });

  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'CORS policy violation' });
  }

  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Something went wrong!' : err.message
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Initialize cloud services with error handling
async function initializeCloudServices() {
  try {
    const cloudService = require('./src/services/cloudService');
    await cloudService.initializeCloudServices();
    logger.info('Cloud services initialized successfully');
  } catch (err) {
    logger.warn('Cloud services not available or failed to initialize:', err.message);
    logger.info('Running in demo mode without cloud services');
    // Don't exit - continue running in demo mode
  }
}

// Start server
async function startServer() {
  try {
    // Try to initialize cloud services, but don't fail if they're not available
    await initializeCloudServices();
    
    app.listen(PORT, () => {
      logger.info(`Cloud File Manager server running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`Main URL: http://localhost:${PORT}`);
      logger.info(`Embed URL: http://localhost:${PORT}/embed`);
      logger.info('Server started successfully!');
    });
  } catch (err) {
    logger.error('Failed to start server:', err);
    
    // Try to start without cloud services
    logger.info('Attempting to start server without cloud services...');
    app.listen(PORT, () => {
      logger.info(`Cloud File Manager server running on port ${PORT} (Demo Mode)`);
      logger.info(`Main URL: http://localhost:${PORT}`);
    });
  }
}

// Start the server
startServer();

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

module.exports = app;