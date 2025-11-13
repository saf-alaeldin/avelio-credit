import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, User, AlertCircle, Plane } from 'lucide-react';
import { handleLogin } from '../utils/auth';
import './Login.css';

function Login() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      console.log('🔐 Attempting login...');

      // Get API URL from environment or use port 5001 with /api/v1
      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5001/api/v1';
      console.log('📡 API URL:', apiUrl);

      // Make login request with username
      const response = await fetch(`${apiUrl}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      console.log('📥 Response status:', response.status);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Login failed');
      }

      const data = await response.json();
      console.log('✅ Login successful');
      
      // Extract token from response
      const token = data?.token || data?.data?.token;
      const user = data?.user || data?.data?.user;
      
      if (!token) {
        throw new Error('No token received from server');
      }
      
      // Use auth utility to handle login
      handleLogin(token, user);
      
    } catch (err) {
      console.error('❌ Login error:', err);
      
      let errorMessage = 'Login failed. Please try again.';
      
      if (err.message === 'Failed to fetch' || err.message.includes('Network')) {
        errorMessage = 'Cannot connect to server. Please check if the backend is running on port 5001.';
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        {/* Logo Section */}
        <div className="login-logo">
          <div className="logo-icon">
            <Plane size={36} />
          </div>
          <h1 className="login-title">Kush Air</h1>
          <p className="login-subtitle">Credit Management System</p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="login-form">
          {error && (
            <div className="error-message">
              <AlertCircle size={18} />
              {error}
            </div>
          )}

          {/* Username Input */}
          <div className="form-group">
            <label>Username</label>
            <div className="input-wrapper">
              <User size={20} className="input-icon" />
              <input
                type="text"
                className="form-input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                required
                autoFocus
                disabled={loading}
              />
            </div>
          </div>

          {/* Password Input */}
          <div className="form-group">
            <label>Password</label>
            <div className="input-wrapper">
              <Lock size={20} className="input-icon" />
              <input
                type="password"
                className="form-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                disabled={loading}
              />
            </div>
          </div>

          {/* Forgot Password */}
          <div className="forgot-password">
            <button type="button" className="forgot-link" disabled>
              Forgot password?
            </button>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            className="login-btn"
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="loading-spinner"></span>
                Signing in...
              </>
            ) : (
              'Sign In'
            )}
          </button>

          {/* Info Box */}
          <div className="login-info">
            <p>
              <strong>Note:</strong> Use your Kush Air username and password to access the system.
            </p>
          </div>
        </form>

        {/* Footer */}
        <div className="login-footer">
          <p className="powered-by">Kush Air • IATA: KU • Juba, South Sudan</p>
        </div>
      </div>
    </div>
  );
}

export default Login;