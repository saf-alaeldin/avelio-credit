const winston = require('winston');
const path = require('path');

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...metadata }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(metadata).length > 0) {
      msg += ` ${JSON.stringify(metadata)}`;
    }
    return msg;
  })
);

// Create transports array
const transports = [];

// Console transport (always enabled)
transports.push(
  new winston.transports.Console({
    format: consoleFormat
  })
);

// File transports (only in production or if LOG_TO_FILE is true)
if (process.env.NODE_ENV === 'production' || process.env.LOG_TO_FILE === 'true') {
  // Error log file
  transports.push(
    new winston.transports.File({
      filename: path.join(__dirname, '../../logs/error.log'),
      level: 'error',
      format: logFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    })
  );

  // Combined log file
  transports.push(
    new winston.transports.File({
      filename: path.join(__dirname, '../../logs/combined.log'),
      format: logFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    })
  );
}

// Create the logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  format: logFormat,
  transports,
  exceptionHandlers: [
    new winston.transports.Console({
      format: consoleFormat
    })
  ],
  rejectionHandlers: [
    new winston.transports.Console({
      format: consoleFormat
    })
  ]
});

// Create a stream object for Morgan HTTP logging
logger.stream = {
  write: (message) => {
    logger.info(message.trim());
  }
};

// Helper methods for structured logging
logger.logRequest = (req, message = 'HTTP Request') => {
  logger.info(message, {
    method: req.method,
    path: req.path,
    ip: req.ip,
    userId: req.user?.id,
    userAgent: req.get('user-agent')
  });
};

logger.logError = (error, req = null, message = 'Error occurred') => {
  const logData = {
    error: error.message,
    stack: error.stack,
  };

  if (req) {
    logData.method = req.method;
    logData.path = req.path;
    logData.ip = req.ip;
    logData.userId = req.user?.id;
  }

  logger.error(message, logData);
};

logger.logSecurityEvent = (event, req, details = {}) => {
  logger.warn(`Security Event: ${event}`, {
    event,
    ...details,
    method: req?.method,
    path: req?.path,
    ip: req?.ip,
    userId: req?.user?.id,
    userAgent: req?.get('user-agent')
  });
};

logger.logAudit = (action, userId, resourceType, resourceId, details = {}) => {
  logger.info(`Audit: ${action}`, {
    action,
    userId,
    resourceType,
    resourceId,
    ...details,
    timestamp: new Date().toISOString()
  });
};

module.exports = logger;
