/**
 * Logging utility that conditionally logs based on environment
 * In production, only errors are logged. In development, all logs are shown.
 */

const isDevelopment = process.env.NODE_ENV === 'development';

export const logger = {
  /**
   * Debug messages - only shown in development
   */
  debug: (...args) => {
    if (isDevelopment) {
      console.log(...args);
    }
  },

  /**
   * Info messages - only shown in development
   */
  info: (...args) => {
    if (isDevelopment) {
      console.info(...args);
    }
  },

  /**
   * Warning messages - only shown in development
   */
  warn: (...args) => {
    if (isDevelopment) {
      console.warn(...args);
    }
  },

  /**
   * Error messages - always shown (production and development)
   */
  error: (...args) => {
    console.error(...args);
  },

  /**
   * API call logging - only in development
   */
  api: (method, url, data = null) => {
    if (isDevelopment) {
      console.log(`[API] ${method} ${url}`, data ? data : '');
    }
  },
};

export default logger;
