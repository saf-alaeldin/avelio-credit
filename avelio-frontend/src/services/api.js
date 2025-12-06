import axios from 'axios';
import logger from '../utils/logger';
import cache, { CACHE_KEYS, CACHE_TTL } from '../utils/cache';

// ========================================
// SMART API URL DETECTION (Auto-detects based on window location)
// ========================================
const getApiBaseUrl = () => {
  // Debug logging
  console.log('🔍 DEBUG - Detecting API URL...');
  console.log('   window.location.hostname:', window.location.hostname);
  console.log('   window.location.href:', window.location.href);
  console.log('   process.env.REACT_APP_API_URL:', process.env.REACT_APP_API_URL);

  // 1. First priority: Environment variable (if set)
  if (process.env.REACT_APP_API_URL) {
    console.log('   ✅ Using env variable:', process.env.REACT_APP_API_URL);
    return process.env.REACT_APP_API_URL;
  }

  // 2. Auto-detect based on current window location (for local network access)
  const hostname = window.location.hostname;
  const port = 5001; // Backend port

  // If accessing via network IP, use that same IP for backend
  if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
    const apiUrl = `http://${hostname}:${port}/api/v1`;
    console.log('   ✅ Using network IP:', apiUrl);
    return apiUrl;
  }

  // 3. Default to localhost for local development
  const apiUrl = `http://localhost:${port}/api/v1`;
  console.log('   ✅ Using localhost:', apiUrl);
  return apiUrl;
};

// ========================================
// AXIOS INSTANCE WITH BASE CONFIGURATION
// ========================================
const api = axios.create({
  baseURL: 'http://placeholder', // Will be set dynamically per request
  headers: {
    'Content-Type': 'application/json'
  },
  timeout: 30000, // 30 second timeout
  withCredentials: false // Set to true if using cookies
});

// ========================================
// REQUEST INTERCEPTOR - Set dynamic baseURL and add token
// ========================================
api.interceptors.request.use(
  (config) => {
    // Dynamically set baseURL based on current window location
    config.baseURL = getApiBaseUrl();

    // Log configuration (only once)
    if (!window._apiConfigLogged) {
      logger.info('🌐 API Configuration:');
      logger.info('  - Base URL:', config.baseURL);
      logger.info('  - Hostname:', window.location.hostname);
      logger.info('  - Environment:', process.env.NODE_ENV);
      window._apiConfigLogged = true;
    }

    // Get token from localStorage
    const token = localStorage.getItem('token');

    // Add token to headers if it exists
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
      logger.debug('🔐 Token attached to request');
    } else {
      logger.debug('⚠️ No token found in localStorage');
    }

    return config;
  },
  (error) => {
    logger.error('❌ Request interceptor error:', error);
    return Promise.reject(error);
  }
);

// ========================================
// RESPONSE INTERCEPTOR - Handle errors globally
// ========================================
api.interceptors.response.use(
  (response) => {
    // Success response - just return it
    return response;
  },
  (error) => {
    // Handle different error scenarios
    if (error.response) {
      const { status, data } = error.response;
      
      switch (status) {
        case 401:
          // Unauthorized - token invalid or expired
          logger.error('🚫 Authentication failed - redirecting to login');
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          window.location.href = '/login';
          break;

        case 403:
          // Forbidden - user doesn't have permission
          logger.error('🚫 Access forbidden');
          break;
          
        case 404:
          // Not found
          logger.error('🔍 Resource not found');
          break;
          
        case 500:
          // Server error
          logger.error('💥 Server error:', data?.message);
          break;
          
        default:
          logger.error(`❌ Error ${status}:`, data?.message);
      }
    } else if (error.request) {
      // Request was made but no response received
      logger.error('📡 No response from server - check your connection');
    } else {
      // Something else happened
      logger.error('❌ Request error:', error.message);
    }
    
    return Promise.reject(error);
  }
);

// ========================================
// RECEIPTS API ENDPOINTS
// ========================================
export const receiptsAPI = {
  // Create new receipt
  create: async (data) => {
    logger.debug('📝 Creating receipt:', data);
    const response = await api.post('/receipts', data);
    // Invalidate stats cache after creating receipt
    cache.delete(CACHE_KEYS.DASHBOARD_STATS);
    cache.delete(CACHE_KEYS.TODAY_STATS);
    cache.invalidatePattern(/^receipts_/);
    return response;
  },
  
  // Get all receipts with filters
  getAll: (params) => {
    logger.debug('📋 Fetching receipts with params:', params);
    return api.get('/receipts', { params });
  },
  
  // Get single receipt by ID
  getById: (id) => {
    logger.debug('🔍 Fetching receipt:', id);
    return api.get(`/receipts/${id}`);
  },
  
  // Update receipt status
  updateStatus: async (id, data) => {
    logger.debug('✏️ Updating receipt status:', id, data);
    const response = await api.put(`/receipts/${id}/status`, data);
    // Invalidate cache after updating
    cache.delete(CACHE_KEYS.DASHBOARD_STATS);
    cache.delete(CACHE_KEYS.TODAY_STATS);
    cache.invalidatePattern(/^receipts_/);
    cache.delete(CACHE_KEYS.RECEIPT(id));
    return response;
  },

  // Void receipt
  void: async (id, reason) => {
    logger.debug('🗑️ Voiding receipt:', id, reason);
    const response = await api.post(`/receipts/${id}/void`, { reason });
    // Invalidate cache after voiding
    cache.delete(CACHE_KEYS.DASHBOARD_STATS);
    cache.delete(CACHE_KEYS.TODAY_STATS);
    cache.invalidatePattern(/^receipts_/);
    cache.delete(CACHE_KEYS.RECEIPT(id));
    return response;
  },
  
  // Generate PDF
  generatePDF: (id) => {
    logger.debug('📄 Generating PDF for receipt:', id);
    return api.get(`/receipts/${id}/pdf`, { 
      responseType: 'blob' 
    });
  },
  
  // Download PDF (alias for generatePDF)
  downloadPDF: (id) => {
    logger.debug('📥 Downloading PDF for receipt:', id);
    return api.get(`/receipts/${id}/pdf`, { 
      responseType: 'blob' 
    });
  }
};

// ========================================
// AGENCIES API ENDPOINTS
// ========================================
export const agenciesAPI = {
  // Get all agencies (with caching)
  getAll: async (params, useCache = true) => {
    logger.debug('🏢 Fetching agencies');

    if (useCache) {
      return cache.getOrFetch(
        CACHE_KEYS.AGENCIES,
        () => api.get('/agencies', { params }),
        CACHE_TTL.AGENCIES
      );
    }

    return api.get('/agencies', { params });
  },

  // Get single agency
  getById: (id) => {
    logger.debug('🏢 Fetching agency:', id);
    return api.get(`/agencies/${id}`);
  },

  // Create agency
  create: (data) => {
    logger.debug('🏢 Creating agency:', data);
    // Invalidate cache when creating new agency
    cache.delete(CACHE_KEYS.AGENCIES);
    return api.post('/agencies', data);
  },

  // Update agency
  update: (id, data) => {
    logger.debug('🏢 Updating agency:', id);
    // Invalidate cache when updating agency
    cache.delete(CACHE_KEYS.AGENCIES);
    return api.put(`/agencies/${id}`, data);
  }
};

// ========================================
// STATS API ENDPOINTS
// ========================================
export const statsAPI = {
  // Get dashboard summary (with caching)
  getDashboard: async (useCache = true) => {
    logger.debug('📊 Fetching dashboard stats');

    if (useCache) {
      return cache.getOrFetch(
        CACHE_KEYS.DASHBOARD_STATS,
        () => api.get('/stats/dashboard'),
        CACHE_TTL.DASHBOARD_STATS
      );
    }

    return api.get('/stats/dashboard');
  },

  // Get today's stats (with caching)
  getToday: async (useCache = true) => {
    logger.debug('📊 Fetching today stats');

    if (useCache) {
      return cache.getOrFetch(
        CACHE_KEYS.TODAY_STATS,
        () => api.get('/stats/today'),
        CACHE_TTL.TODAY_STATS
      );
    }

    return api.get('/stats/today');
  },

  // Get pending summary
  getPending: () => {
    logger.debug('📊 Fetching pending stats');
    return api.get('/stats/pending');
  },

  // Clear stats cache (call after creating/updating receipts)
  clearCache: () => {
    cache.delete(CACHE_KEYS.DASHBOARD_STATS);
    cache.delete(CACHE_KEYS.TODAY_STATS);
    logger.debug('📊 Stats cache cleared');
  }
};

// ========================================
// AUTH API ENDPOINTS
// ========================================
export const authAPI = {
  // Login
  login: (credentials) => {
    logger.debug('🔐 Logging in...');
    return api.post('/auth/login', credentials);
  },
  
  // Logout
  logout: () => {
    logger.debug('👋 Logging out...');
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
  },
  
  // Get current user
  getCurrentUser: () => {
    logger.debug('👤 Fetching current user');
    return api.get('/auth/me');
  },
  
  // Update password
  updatePassword: (data) => {
    logger.debug('🔑 Updating password');
    return api.put('/auth/password', data);
  },
  
  // Change password (alias for updatePassword)
  changePassword: (data) => {
    logger.debug('🔑 Changing password');
    return api.post('/auth/change-password', data);
  }
};

// ========================================
// UTILITY FUNCTIONS
// ========================================
export const utils = {
  // Check if user is authenticated
  isAuthenticated: () => {
    const token = localStorage.getItem('token');
    return !!token;
  },
  
  // Get stored user data
  getUser: () => {
    const userStr = localStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
  },
  
  // Save user data
  setUser: (user) => {
    localStorage.setItem('user', JSON.stringify(user));
  },
  
  // Get token
  getToken: () => {
    return localStorage.getItem('token');
  },
  
  // Set token
  setToken: (token) => {
    localStorage.setItem('token', token);
  },
  
  // Clear all auth data
  clearAuth: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  }
};

export default api;