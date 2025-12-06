// src/utils/authHandler.js
// Centralized authentication handler

// Auto-detect API URL based on window location
const getApiUrl = () => {
  if (process.env.REACT_APP_API_URL) return process.env.REACT_APP_API_URL;
  const hostname = window.location.hostname;
  const port = 5001;
  if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
    return `http://${hostname}:${port}/api/v1`;
  }
  return 'http://localhost:5001/api/v1';
};
const API_BASE = getApiUrl();

// Check if token is expired
export const isTokenExpired = () => {
  const token = localStorage.getItem('token') || 
                localStorage.getItem('authToken') || 
                sessionStorage.getItem('token');
  
  if (!token) return true;

  try {
    // Decode JWT token
    const payload = JSON.parse(atob(token.split('.')[1]));
    const expirationTime = payload.exp * 1000; // Convert to milliseconds
    const currentTime = Date.now();
    
    return currentTime >= expirationTime;
  } catch (error) {
    console.error('Error checking token expiration:', error);
    return true; // Assume expired if we can't decode it
  }
};

// Logout and clear everything
export const handleLogout = (navigate, message) => {
  // Clear all storage
  localStorage.removeItem('token');
  localStorage.removeItem('authToken');
  localStorage.removeItem('user');
  sessionStorage.clear();
  
  // Show message if provided
  if (message) {
    localStorage.setItem('logoutMessage', message);
  }
  
  // Redirect to login
  if (navigate) {
    navigate('/login');
  } else {
    window.location.href = '/login';
  }
};

// Enhanced fetch with automatic token handling
export const authenticatedFetch = async (url, options = {}) => {
  // Check token before making request
  if (isTokenExpired()) {
    handleLogout(null, 'Your session has expired. Please log in again.');
    throw new Error('TOKEN_EXPIRED');
  }

  const token = localStorage.getItem('token') || 
                localStorage.getItem('authToken') || 
                sessionStorage.getItem('token');

  // Add authorization header
  const headers = {
    ...options.headers,
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };

  try {
    const response = await fetch(`${API_BASE}${url}`, {
      ...options,
      headers
    });

    // Handle authentication errors
    if (response.status === 401 || response.status === 403) {
      handleLogout(null, 'Your session has expired. Please log in again.');
      throw new Error('AUTHENTICATION_FAILED');
    }

    return response;
  } catch (error) {
    // If it's a network error, just throw it
    if (error.message === 'TOKEN_EXPIRED' || error.message === 'AUTHENTICATION_FAILED') {
      throw error;
    }
    
    // For other errors, check if it might be auth-related
    if (error.message.includes('401') || error.message.includes('403')) {
      handleLogout(null, 'Your session has expired. Please log in again.');
      throw new Error('AUTHENTICATION_FAILED');
    }
    
    throw error;
  }
};

// Helper to get authenticated JSON
export const apiGet = async (path, params = {}) => {
  const url = new URL(API_BASE + path);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== null && v !== undefined) {
      url.searchParams.set(k, v);
    }
  });
  
  const response = await authenticatedFetch(url.pathname + url.search);
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }
  
  return await response.json();
};

// Helper to post authenticated JSON
export const apiPost = async (path, body) => {
  const response = await authenticatedFetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }
  
  return await response.json();
};

// Check token on app load
export const checkAuthOnLoad = (navigate) => {
  if (isTokenExpired()) {
    handleLogout(navigate, 'Your session has expired. Please log in again.');
    return false;
  }
  return true;
};