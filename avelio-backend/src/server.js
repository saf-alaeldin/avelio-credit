require('dotenv').config();

// Validate required environment variables
const requiredEnvVars = ['JWT_SECRET'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  console.error('❌ FATAL ERROR: Missing required environment variables:');
  missingEnvVars.forEach(varName => {
    console.error(`   - ${varName}`);
  });
  console.error('\nPlease set these variables in your .env file before starting the server.');
  process.exit(1);
}

const db = require('./config/db');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const logger = require('./utils/logger');
const app = express();
const PORT = process.env.PORT || 5001;

// Security headers with Helmet
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
  },
}));

// CORS configuration
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

app.use(express.json({ limit: '10mb' })); // Add request size limit
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// General API rate limiter - 100 requests per 15 minutes
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true, // Return rate limit info in headers
  legacyHeaders: false,
});

// Strict rate limiter for authentication - 5 attempts per 15 minutes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many login attempts, please try again after 15 minutes.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting
app.use('/api/v1/', apiLimiter);

// HTTP request logging
app.use((req, res, next) => {
  logger.logRequest(req);
  next();
});

// Routes
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Avelio API is running!',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/v1', (req, res) => {
  res.json({
    success: true,
    version: '1.0.0',
    message: 'Avelio Credit-Lite API v1'
  });
});

// Import routes
const authRoutes = require('./routes/authRoutes');
const receiptRoutes = require('./routes/receiptRoutes');
const statsRoutes = require('./routes/statsRoutes');
const exportRoutes = require('./routes/exportRoutes');
const agencyRoutes = require('./routes/agencyRoutes');



// Use routes (auth has stricter rate limiting)
app.use('/api/v1/auth/login', authLimiter); // Apply strict rate limit to login
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/receipts', receiptRoutes);
app.use('/api/v1/stats', statsRoutes);
app.use('/api/v1/export', exportRoutes);
app.use('/api/v1/receipts', receiptRoutes);
app.use('/api/v1/agencies', agencyRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Error handler
app.use((err, req, res, next) => {
  logger.logError(err, req, 'Unhandled error');
  res.status(err.status || 500).json({
    success: false,
    message: process.env.NODE_ENV === 'production'
      ? 'An error occurred'
      : err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Start server
const HOST = process.env.HOST || '0.0.0.0'; // Listen on all network interfaces
const server = app.listen(PORT, HOST, () => {
  logger.info('===========================================');
  logger.info('🚀 Avelio Credit-Lite API Server');
  logger.info('===========================================');
  logger.info(`✅ Server running on: http://${HOST}:${PORT}`);
  logger.info(`✅ Local access: http://localhost:${PORT}`);
  logger.info(`✅ Network access: http://192.168.7.114:${PORT}`);
  logger.info(`✅ Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`✅ Health check: http://${HOST}:${PORT}/health`);
  logger.info('===========================================');

  // Test database connection after server starts
  db.testConnection().then(() => {
    logger.info('===========================================');
  }).catch(err => {
    logger.error('Database connection failed:', { error: err.message });
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully...');
  server.close(() => {
    process.exit(0);
  });
});