// src/pages/ExportData.js
import React, { useState } from 'react';
import './ExportData.css';

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

export default function ExportData() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const token =
    localStorage.getItem('token') ||
    localStorage.getItem('authToken') ||
    sessionStorage.getItem('token');

  const handleDailySummaryPDF = async () => {
    try {
      setLoading(true);
      setError('');
      setSuccess('');

      // Use today's date
      const today = new Date().toISOString().split('T')[0];

      // Fetch PDF from backend
      const url = `${API_BASE}/export/daily-summary?date=${today}`;
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to generate daily summary');
      }

      // Download PDF
      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `daily-summary-${today}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);

      setSuccess('Successfully downloaded daily summary PDF');

    } catch (e) {
      setError(e.message || 'Failed to generate daily summary');
    } finally {
      setLoading(false);
    }
  };

  const handleMonthlySummaryPDF = async () => {
    try {
      setLoading(true);
      setError('');
      setSuccess('');

      // Use current month
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;

      // Fetch PDF from backend
      const url = `${API_BASE}/export/monthly-summary?year=${year}&month=${month}`;
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to generate monthly summary');
      }

      // Download PDF
      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `monthly-summary-${year}-${String(month).padStart(2, '0')}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);

      setSuccess('Successfully downloaded monthly summary PDF');

    } catch (e) {
      setError(e.message || 'Failed to generate monthly summary');
    } finally {
      setLoading(false);
    }
  };

  const handleSalesSettlementsReport = async () => {
    try {
      setLoading(true);
      setError('');
      setSuccess('');

      // Use current month
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;

      // Fetch PDF from backend
      const url = `${API_BASE}/export/sales-settlements?year=${year}&month=${month}`;
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to generate sales & settlements report');
      }

      // Download PDF
      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `sales-settlements-report-${year}-${String(month).padStart(2, '0')}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);

      setSuccess('Successfully downloaded Sales & Settlements Report');

    } catch (e) {
      setError(e.message || 'Failed to generate sales & settlements report');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="export-page">
      <div className="export-header">
        <div>
          <h2 className="export-title">Export Reports</h2>
          <p className="export-subtitle">Professional reports for sales and settlements</p>
        </div>
      </div>

      {error && (
        <div className="export-message export-message--error">
          ❌ {error}
        </div>
      )}

      {success && (
        <div className="export-message export-message--success">
          ✅ {success}
        </div>
      )}

      {/* Sales & Settlements Report Section */}
      <div className="export-card" style={{ marginTop: '24px' }}>
        <div className="export-section">
          <h3 className="export-section-title">📊 Sales & Settlements Report</h3>
          <p className="export-section-desc">
            Comprehensive analysis report with sales performance, settlement status, agent insights, and revenue breakdowns
          </p>

          <div className="export-actions" style={{ marginTop: '20px' }}>
            <button
              className="export-btn export-btn--pdf"
              onClick={handleSalesSettlementsReport}
              disabled={loading}
              style={{
                backgroundColor: '#0EA5E9',
                color: 'white',
                padding: '12px 24px',
                fontSize: '15px',
                fontWeight: '600'
              }}
            >
              {loading ? '⏳ Generating...' : '📈 Sales & Settlements Report (PDF)'}
            </button>
          </div>

          <div style={{ marginTop: '15px', fontSize: '13px', color: '#6B7280' }}>
            <p style={{ marginBottom: '8px' }}><strong>Report includes:</strong></p>
            <ul style={{ marginLeft: '20px', lineHeight: '1.8' }}>
              <li>Executive summary with key metrics</li>
              <li>Revenue breakdown by currency and station</li>
              <li>Settlement status analytics</li>
              <li>Top performing agents ranking</li>
              <li>Point of Sale analysis for Juba station</li>
              <li>Performance insights and trends</li>
            </ul>
          </div>
        </div>
      </div>

      {/* PDF Summary Export Section */}
      <div className="export-card" style={{ marginTop: '24px' }}>
        <div className="export-section">
          <h3 className="export-section-title">Export Summary Reports (PDF)</h3>
          <p className="export-section-desc">
            Download professional summary reports for today or current month
          </p>

          <div className="export-actions" style={{ marginTop: '20px' }}>
            <button
              className="export-btn export-btn--pdf"
              onClick={handleDailySummaryPDF}
              disabled={loading}
            >
              {loading ? '⏳ Generating...' : '📊 Daily Summary (PDF)'}
            </button>
            <button
              className="export-btn export-btn--pdf"
              onClick={handleMonthlySummaryPDF}
              disabled={loading}
            >
              {loading ? '⏳ Generating...' : '📈 Monthly Summary (PDF)'}
            </button>
          </div>
        </div>
      </div>

      {/* Info Section */}
      <div className="export-info">
        <div className="export-info-card">
          <div className="export-info-icon">📊</div>
          <div className="export-info-content">
            <h4 className="export-info-title">Professional Reports</h4>
            <p className="export-info-text">
              Comprehensive PDF reports with detailed analytics, summaries, and insights for sales performance and settlements tracking.
            </p>
          </div>
        </div>

        <div className="export-info-card">
          <div className="export-info-icon">📈</div>
          <div className="export-info-content">
            <h4 className="export-info-title">Daily & Monthly Insights</h4>
            <p className="export-info-text">
              Track performance trends with daily snapshots and monthly overviews including revenue breakdowns, station comparisons, and payment method analytics.
            </p>
          </div>
        </div>

        <div className="export-info-card">
          <div className="export-info-content">
            <h4 className="export-info-title">Report Features:</h4>
            <ul className="export-info-list">
              <li>Revenue and sales summaries</li>
              <li>Station performance breakdown</li>
              <li>Payment method analytics</li>
              <li>Settlement status tracking</li>
              <li>Agency insights and trends</li>
              <li>Professional PDF formatting</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
