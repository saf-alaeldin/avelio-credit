import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import logger from './utils/logger';
import { ToastProvider } from './contexts/ToastContext';
import ErrorBoundary from './components/ErrorBoundary';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import NewReceipt from './pages/NewReceipt';
import EditReceipt from './pages/EditReceipt';
import ReceiptSuccess from './pages/ReceiptSuccess';
import Account from './pages/Account';
import Receipts from './pages/Receipts';
import TravelAgencies from './pages/TravelAgencies';
import ExportData from './pages/ExportData';
import Analytics from './pages/Analytics';
import Users from './pages/Users';
import AppHeader from './pages/AppHeader';

// Station Settlement pages
import StationSettlementSimple from './pages/StationSettlementSimple';
import SettlementsList from './pages/SettlementsList';
import SettlementReview from './pages/SettlementReview';
import ExpenseCodesAdmin from './pages/ExpenseCodesAdmin';
import SalesAgentsAdmin from './pages/SalesAgentsAdmin';
import StationsAdmin from './pages/StationsAdmin';
import StationSummarySimple from './pages/StationSummarySimple';      

function App() {
  // Use state for authentication to trigger re-renders
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Helper to check if token is expired
  const isTokenExpired = (token) => {
    if (!token) return true;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const expirationTime = payload.exp * 1000;
      return Date.now() >= expirationTime;
    } catch (error) {
      return true;
    }
  };

  // Check authentication on mount and when localStorage changes
  useEffect(() => {
    const checkAuth = () => {
      const token = localStorage.getItem('token');

      // Check if token exists AND is not expired
      if (token && isTokenExpired(token)) {
        logger.debug('🔐 Token expired - logging out');
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.setItem('sessionExpiredMessage', 'Your session has expired. Please log in again.');
        setIsAuthenticated(false);
        setIsLoading(false);
        return;
      }

      setIsAuthenticated(!!token);
      setIsLoading(false);
      logger.debug('🔐 Auth check:', !!token ? 'Authenticated' : 'Not authenticated');
    };

    // Initial check
    checkAuth();

    // Periodic token expiration check (every 5 minutes)
    const intervalId = setInterval(() => {
      const token = localStorage.getItem('token');
      if (token && isTokenExpired(token)) {
        logger.debug('🔐 Periodic check: Token expired');
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.setItem('sessionExpiredMessage', 'Your session has expired. Please log in again.');
        setIsAuthenticated(false);
        window.location.href = '/login';
      }
    }, 300000); // Check every 5 minutes (300 seconds)

    // Listen for storage changes (in case of logout in another tab)
    window.addEventListener('storage', checkAuth);

    // Custom event for when login happens
    window.addEventListener('login-success', checkAuth);

    // Custom event for when logout happens
    window.addEventListener('logout-success', checkAuth);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener('storage', checkAuth);
      window.removeEventListener('login-success', checkAuth);
      window.removeEventListener('logout-success', checkAuth);
    };
  }, []);

  // Show loading state while checking authentication
  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        fontFamily: 'system-ui, -apple-system, sans-serif'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '40px',
            height: '40px',
            border: '4px solid #f3f3f3',
            borderTop: '4px solid #0ea5e9',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 20px'
          }}></div>
          <p style={{ color: '#64748b' }}>Loading...</p>
        </div>
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <ToastProvider>
        <Router>
          <AppHeader />
          <Routes>
            <Route
              path="/login"
              element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <Login />}
            />
            <Route
              path="/dashboard"
              element={isAuthenticated ? <Dashboard /> : <Navigate to="/login" replace />}
            />
            <Route
              path="/new-receipt"
              element={isAuthenticated ? <NewReceipt /> : <Navigate to="/login" replace />}
            />
            <Route
              path="/receipts/:id/edit"
              element={isAuthenticated ? <EditReceipt /> : <Navigate to="/login" replace />}
            />
            <Route
              path="/receipt-success"
              element={isAuthenticated ? <ReceiptSuccess /> : <Navigate to="/login" replace />}
            />
            <Route
              path="/account"
              element={isAuthenticated ? <Account /> : <Navigate to="/login" replace />}
            />
            <Route
              path="/receipts"
              element={isAuthenticated ? <Receipts /> : <Navigate to="/login" replace />}
            />
            <Route
              path="/agencies"
              element={isAuthenticated ? <TravelAgencies /> : <Navigate to="/login" replace />}
            />
            <Route
              path="/export"
              element={isAuthenticated ? <ExportData /> : <Navigate to="/login" replace />}
            />
            <Route
              path="/analytics"
              element={isAuthenticated ? <Analytics /> : <Navigate to="/login" replace />}
            />
            <Route
              path="/users"
              element={isAuthenticated ? <Users /> : <Navigate to="/login" replace />}
            />
            {/* Station Settlement */}
            <Route
              path="/station-settlement"
              element={isAuthenticated ? <StationSettlementSimple /> : <Navigate to="/login" replace />}
            />
            <Route
              path="/station-settlement/:id"
              element={isAuthenticated ? <StationSettlementSimple /> : <Navigate to="/login" replace />}
            />
            <Route
              path="/settlements"
              element={isAuthenticated ? <SettlementsList /> : <Navigate to="/login" replace />}
            />
            <Route
              path="/settlements/:id/review"
              element={isAuthenticated ? <SettlementReview /> : <Navigate to="/login" replace />}
            />
            <Route
              path="/expense-codes"
              element={isAuthenticated ? <ExpenseCodesAdmin /> : <Navigate to="/login" replace />}
            />
            <Route
              path="/sales-agents"
              element={isAuthenticated ? <SalesAgentsAdmin /> : <Navigate to="/login" replace />}
            />
            <Route
              path="/stations-admin"
              element={isAuthenticated ? <StationsAdmin /> : <Navigate to="/login" replace />}
            />
            {/* Station Summary - simplified single page */}
            <Route
              path="/station-summary"
              element={isAuthenticated ? <StationSummarySimple /> : <Navigate to="/login" replace />}
            />
            {/* Redirect old HQ Settlement routes */}
            <Route
              path="/hq-settlement"
              element={<Navigate to="/station-summary" replace />}
            />
            <Route
              path="/hq-settlement/:id"
              element={<Navigate to="/station-summary" replace />}
            />
            <Route
              path="*"
              element={<Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />}
            />
          </Routes>
        </Router>
      </ToastProvider>
    </ErrorBoundary>
  );
}

export default App;