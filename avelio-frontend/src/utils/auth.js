// src/utils/auth.js
// Authentication utility functions

/**
 * Handle user logout
 * Clears all authentication data and redirects to login
 */
export const handleLogout = () => {
  console.log('👋 Logging out...');
  
  // Clear all auth data from localStorage
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  
  // Dispatch logout event to notify App.js
  window.dispatchEvent(new Event('logout-success'));
  
  console.log('✅ Logout successful');
  
  // Redirect to login page with full page reload
  window.location.href = '/login';
};

/**
 * Handle user login
 * Saves token and user data, then redirects to dashboard
 */
export const handleLogin = (token, user) => {
  console.log('🔐 Logging in...');

  // Save token
  localStorage.setItem('token', token);

  // Save user data if provided
  if (user) {
    localStorage.setItem('user', JSON.stringify(user));
  }

  console.log('✅ Login successful');
  console.log('🔑 Token saved');

  // Dispatch login event to notify App.js
  window.dispatchEvent(new Event('login-success'));

  // Redirect based on role - auditors go to settlements, others to dashboard
  const redirectPath = user?.role === 'auditor' ? '/settlements' : '/dashboard';
  window.location.href = redirectPath;
};

/**
 * Check if user is authenticated
 */
export const isAuthenticated = () => {
  const token = localStorage.getItem('token');
  return !!token;
};

/**
 * Get current user from localStorage
 */
export const getCurrentUser = () => {
  const userStr = localStorage.getItem('user');
  try {
    return userStr ? JSON.parse(userStr) : null;
  } catch (error) {
    console.error('Error parsing user data:', error);
    return null;
  }
};

/**
 * Get authentication token
 */
export const getToken = () => {
  return localStorage.getItem('token');
};