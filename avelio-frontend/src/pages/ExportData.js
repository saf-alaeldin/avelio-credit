// src/pages/ExportData.js
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import './ExportData.css';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5001/api/v1';

async function apiGet(path) {
  const token =
    localStorage.getItem('token') ||
    localStorage.getItem('authToken') ||
    sessionStorage.getItem('token');
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const res = await fetch(API_BASE + path, { headers });
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(msg || `HTTP ${res.status}`);
  }
  return await res.json();
}

export default function ExportData() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [filters, setFilters] = useState({
    status: '',
    dateFrom: '',
    dateTo: ''
  });

  const token =
    localStorage.getItem('token') ||
    localStorage.getItem('authToken') ||
    sessionStorage.getItem('token');

  const convertToCSV = (data) => {
    if (!data || data.length === 0) return '';

    const headers = [
      'Receipt Number',
      'Agency Name',
      'Agency ID',
      'Amount',
      'Currency',
      'Status',
      'Payment Method',
      'Issue Date',
      'Issue Time',
      'Payment Date',
      'Station',
      'Issued By'
    ];

    const rows = data.map(r => [
      r.receipt_number || '',
      r.agency?.agency_name || r.agency_name || '',
      r.agency?.agency_id || r.agency_id || '',
      r.amount || 0,
      r.currency || 'USD',
      r.status || '',
      r.payment_method || '',
      r.issue_date || '',
      r.issue_time || '',
      r.payment_date || '',
      r.station || '',
      r.issued_by || ''
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    return csvContent;
  };

  const downloadFile = (content, filename, mimeType) => {
    const blob = new Blob([content], { type: mimeType });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const handleExportCSV = async () => {
    try {
      setLoading(true);
      setError('');
      setSuccess('');

      // Build query params
      const params = {};
      if (filters.status) params.status = filters.status;
      if (filters.dateFrom) params.date_from = filters.dateFrom;
      if (filters.dateTo) params.date_to = filters.dateTo;

      // Fetch data
      const queryString = new URLSearchParams(params).toString();
      const data = await apiGet(`/receipts${queryString ? `?${queryString}` : ''}`);
      const receipts = data?.data?.receipts || data?.receipts || [];

      if (receipts.length === 0) {
        setError('No receipts found matching the filters');
        return;
      }

      // Export to CSV
      const csv = convertToCSV(receipts);
      const filename = `receipts_export_${new Date().toISOString().split('T')[0]}.csv`;
      downloadFile(csv, filename, 'text/csv;charset=utf-8;');
      setSuccess(`Successfully exported ${receipts.length} receipts to CSV`);

    } catch (e) {
      setError(e.message || 'Failed to export data');
    } finally {
      setLoading(false);
    }
  };

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

  return (
    <div className="export-page">
      <div className="export-header">
        <div>
          <h2 className="export-title">Export Data</h2>
          <p className="export-subtitle">Download receipts and summaries</p>
        </div>
      </div>

      {/* CSV Export Section */}
      <div className="export-card">
        <div className="export-section">
          <h3 className="export-section-title">Export Receipts (CSV)</h3>
          <p className="export-section-desc">
            Select filters to export specific receipts or leave blank to export all
          </p>

          <div className="export-form">
            <div className="export-field">
              <label className="export-label">Status</label>
              <select
                className="export-select"
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              >
                <option value="">All Statuses</option>
                <option value="PAID">Paid</option>
                <option value="PENDING">Pending</option>
                <option value="VOID">Void</option>
              </select>
            </div>

            <div className="export-field">
              <label className="export-label">Date From</label>
              <input
                type="date"
                className="export-input"
                value={filters.dateFrom}
                onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
              />
            </div>

            <div className="export-field">
              <label className="export-label">Date To</label>
              <input
                type="date"
                className="export-input"
                value={filters.dateTo}
                onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
              />
            </div>
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

        <div className="export-actions">
          <button
            className="export-btn"
            onClick={handleExportCSV}
            disabled={loading}
          >
            {loading ? '⏳ Exporting...' : '📥 Export to CSV'}
          </button>
          <button
            className="export-btn export-btn--secondary"
            onClick={() => setFilters({ status: '', dateFrom: '', dateTo: '' })}
          >
            🔄 Reset Filters
          </button>
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
          <div className="export-info-icon">📄</div>
          <div className="export-info-content">
            <h4 className="export-info-title">CSV Export</h4>
            <p className="export-info-text">
              Best for Excel and spreadsheet applications. Includes all receipt data in comma-separated format with customizable filters.
            </p>
          </div>
        </div>

        <div className="export-info-card">
          <div className="export-info-icon">📊</div>
          <div className="export-info-content">
            <h4 className="export-info-title">PDF Summaries</h4>
            <p className="export-info-text">
              Professional one-page summary reports with statistics, breakdowns, and receipt details. Perfect for daily/monthly reporting.
            </p>
          </div>
        </div>

        <div className="export-info-card">
          <div className="export-info-content">
            <h4 className="export-info-title">Export includes:</h4>
            <ul className="export-info-list">
              <li>Receipt numbers and dates</li>
              <li>Agency information</li>
              <li>Payment amounts and status</li>
              <li>Station and user details</li>
              <li>Summary statistics (PDF)</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
