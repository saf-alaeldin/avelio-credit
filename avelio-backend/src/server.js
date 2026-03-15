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

const path = require('path');
const db = require('./config/db');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const logger = require('./utils/logger');
const app = express();
const PORT = process.env.PORT || 5001;

// Compress all responses (gzip/deflate)
app.use(compression({
  threshold: 1024, // Only compress responses larger than 1KB
}));

// Security headers with Helmet
app.use(helmet({
  contentSecurityPolicy: process.env.NODE_ENV === 'production' ? {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
    },
  } : {
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

// CORS configuration - Allow configured frontend and localhost for development
const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:3000',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  // Allow any origin from local network for development (HTTP and HTTPS)
  /^http:\/\/192\.168\.\d{1,3}\.\d{1,3}(:\d+)?$/,
  /^https:\/\/192\.168\.\d{1,3}\.\d{1,3}(:\d+)?$/
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    // Check if origin is allowed
    const isAllowed = allowedOrigins.some(allowed => {
      if (typeof allowed === 'string') {
        return origin === allowed;
      } else if (allowed instanceof RegExp) {
        return allowed.test(origin);
      }
      return false;
    });

    if (isAllowed) {
      callback(null, true);
    } else {
      logger.warn(`CORS blocked origin: ${origin}`);
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 86400 // 24 hours
}));

app.use(express.json({ limit: '10mb' })); // Add request size limit
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// General API rate limiter - 500 requests per 15 minutes (relaxed for local network)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Limit each IP to 500 requests per window
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true, // Return rate limit info in headers
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for local network IPs during development
    const ip = req.ip || req.connection.remoteAddress;
    return ip && (ip.startsWith('192.168.') || ip === '127.0.0.1' || ip === '::1');
  }
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
app.get('/health', async (req, res) => {
  let dbStatus = 'unknown';
  let dbLatency = null;
  try {
    const start = Date.now();
    await db.pool.query('SELECT 1');
    dbLatency = Date.now() - start;
    dbStatus = 'connected';
  } catch (err) {
    dbStatus = 'disconnected';
    logger.error('Health check DB error:', { error: err.message });
  }

  const healthy = dbStatus === 'connected';
  res.status(healthy ? 200 : 503).json({
    success: healthy,
    message: healthy ? 'Avelio API is running!' : 'Database connection failed',
    timestamp: new Date().toISOString(),
    database: {
      status: dbStatus,
      latency_ms: dbLatency,
      pool: {
        total: db.pool.totalCount,
        idle: db.pool.idleCount,
        waiting: db.pool.waitingCount
      }
    }
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
const userRoutes = require('./routes/userRoutes');
const paymentRoutes = require('./routes/paymentRoutes');

// Station Settlement routes
const stationRoutes = require('./routes/stationRoutes');
const salesAgentRoutes = require('./routes/salesAgentRoutes');
const expenseCodeRoutes = require('./routes/expenseCodeRoutes');
const stationSalesRoutes = require('./routes/stationSalesRoutes');
const settlementRoutes = require('./routes/settlementRoutes');
const hqSettlementRoutes = require('./routes/hqSettlementRoutes');
const reportRoutes = require('./routes/reportRoutes');



// Use routes (auth has stricter rate limiting)
app.use('/api/v1/auth/login', authLimiter); // Apply strict rate limit to login
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/receipts', receiptRoutes);
app.use('/api/v1/stats', statsRoutes);
app.use('/api/v1/export', exportRoutes);
app.use('/api/v1/agencies', agencyRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/payments', paymentRoutes);

// Station Settlement routes
app.use('/api/v1/stations', stationRoutes);
app.use('/api/v1/sales-agents', salesAgentRoutes);
app.use('/api/v1/expense-codes', expenseCodeRoutes);
app.use('/api/v1/station-sales', stationSalesRoutes);
app.use('/api/v1/settlements', settlementRoutes);
app.use('/api/v1/hq-settlements', hqSettlementRoutes);
app.use('/api/v1/reports', reportRoutes);

// In production, serve the React frontend build
if (process.env.NODE_ENV === 'production') {
  const frontendBuild = path.join(__dirname, '..', '..', 'avelio-frontend', 'build');
  app.use(express.static(frontendBuild));

  // All non-API routes serve the React app (SPA client-side routing)
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendBuild, 'index.html'));
  });
} else {
  // 404 handler (development only - frontend runs separately)
  app.use((req, res) => {
    res.status(404).json({
      success: false,
      message: 'Route not found'
    });
  });
}

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