// src/pages/ExportData.js
import React, { useState } from 'react';
import ModernDatePicker from '../components/ModernDatePicker';
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
  const [loadingType, setLoadingType] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Date range selection
  const today = new Date().toISOString().split('T')[0];
  const [periodType, setPeriodType] = useState('range'); // 'single', 'range'
  const [singleDate, setSingleDate] = useState(today);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);

  const token =
    localStorage.getItem('token') ||
    localStorage.getItem('authToken') ||
    sessionStorage.getItem('token');

  // Get the effective date range based on period type
  const getDateRange = () => {
    if (periodType === 'single') {
      return { start_date: singleDate, end_date: singleDate };
    }
    return { start_date: startDate, end_date: endDate };
  };

  // Format date for display
  const formatDateDisplay = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Get period display text
  const getPeriodDisplay = () => {
    if (periodType === 'single') {
      return formatDateDisplay(singleDate);
    }
    if (startDate === endDate) {
      return formatDateDisplay(startDate);
    }
    return `${formatDateDisplay(startDate)} - ${formatDateDisplay(endDate)}`;
  };

  const handleDailySummaryPDF = async () => {
    try {
      setLoading(true);
      setLoadingType('daily');
      setError('');
      setSuccess('');

      const url = `${API_BASE}/export/daily-summary?date=${today}`;
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to generate daily summary');
      }

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
      setLoadingType('');
    }
  };

  const handleSalesSettlementsPDF = async () => {
    try {
      setLoading(true);
      setLoadingType('pdf');
      setError('');
      setSuccess('');

      const { start_date, end_date } = getDateRange();
      const url = `${API_BASE}/export/sales-settlements?start_date=${start_date}&end_date=${end_date}`;
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to generate PDF report');
      }

      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `sales-settlements-executive-summary-${start_date}-to-${end_date}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);

      setSuccess('Successfully downloaded Executive Summary PDF');

    } catch (e) {
      setError(e.message || 'Failed to generate PDF report');
    } finally {
      setLoading(false);
      setLoadingType('');
    }
  };

  const handleSalesSettlementsExcel = async () => {
    try {
      setLoading(true);
      setLoadingType('excel');
      setError('');
      setSuccess('');

      const { start_date, end_date } = getDateRange();
      const url = `${API_BASE}/export/sales-settlements-excel?start_date=${start_date}&end_date=${end_date}`;
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to generate Excel report');
      }

      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `sales-settlements-detailed-report-${start_date}-to-${end_date}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);

      setSuccess('Successfully downloaded Detailed Excel Report');

    } catch (e) {
      setError(e.message || 'Failed to generate Excel report');
    } finally {
      setLoading(false);
      setLoadingType('');
    }
  };

  return (
    <div className="export-page">
      <div className="export-header">
        <div>
          <h2 className="export-title">Export Reports</h2>
          <p className="export-subtitle">Professional reports for executive review</p>
        </div>
      </div>

      {error && (
        <div className="export-message export-message--error">
          {error}
        </div>
      )}

      {success && (
        <div className="export-message export-message--success">
          {success}
        </div>
      )}

      {/* Sales & Settlements Report Section - MAIN */}
      <div className="export-card export-card--featured">
        <div className="export-card-badge">Executive Reports</div>
        <div className="export-section">
          <h3 className="export-section-title">Sales & Settlements Report</h3>
          <p className="export-section-desc">
            Comprehensive analysis with KPIs, station performance, agent rankings, and settlement insights
          </p>

          {/* Period Type Selector */}
          <div className="period-type-selector">
            <button
              className={`period-type-btn ${periodType === 'single' ? 'active' : ''}`}
              onClick={() => setPeriodType('single')}
            >
              Single Day
            </button>
            <button
              className={`period-type-btn ${periodType === 'range' ? 'active' : ''}`}
              onClick={() => setPeriodType('range')}
            >
              Date Range
            </button>
          </div>

          {/* Date Picker */}
          <div className="date-picker-section">
            {periodType === 'single' ? (
              <div className="date-picker-group">
                <label className="date-label">Select Date:</label>
                <ModernDatePicker
                  selected={singleDate}
                  onChange={setSingleDate}
                  placeholder="Select date"
                  maxDate={new Date()}
                />
              </div>
            ) : (
              <div className="date-picker-row">
                <div className="date-picker-group">
                  <label className="date-label">From:</label>
                  <ModernDatePicker
                    selected={startDate}
                    onChange={(date) => {
                      setStartDate(date);
                      if (date > endDate) {
                        setEndDate(date);
                      }
                    }}
                    placeholder="Start date"
                    maxDate={new Date()}
                  />
                </div>
                <div className="date-picker-group">
                  <label className="date-label">To:</label>
                  <ModernDatePicker
                    selected={endDate}
                    onChange={setEndDate}
                    placeholder="End date"
                    minDate={startDate ? new Date(startDate) : null}
                    maxDate={new Date()}
                  />
                </div>
              </div>
            )}

            <div className="period-display">
              Report Period: <strong>{getPeriodDisplay()}</strong>
            </div>
          </div>

          {/* Export Buttons */}
          <div className="export-buttons-grid">
            {/* PDF Button */}
            <div className="export-button-card">
              <div className="export-button-icon pdf-icon">PDF</div>
              <div className="export-button-content">
                <h4>Executive Summary</h4>
                <p>Single-page overview for CEO/CFO</p>
                <ul className="export-features">
                  <li>Key performance indicators</li>
                  <li>Top stations & agents</li>
                  <li>Settlement status overview</li>
                  <li>Key insights</li>
                </ul>
              </div>
              <button
                className="export-btn export-btn--pdf"
                onClick={handleSalesSettlementsPDF}
                disabled={loading}
              >
                {loading && loadingType === 'pdf' ? (
                  <>
                    <span className="btn-spinner"></span>
                    Generating...
                  </>
                ) : (
                  <>Download PDF</>
                )}
              </button>
            </div>

            {/* Excel Button */}
            <div className="export-button-card">
              <div className="export-button-icon excel-icon">XLS</div>
              <div className="export-button-content">
                <h4>Detailed Report</h4>
                <p>Complete data for analysis</p>
                <ul className="export-features">
                  <li>All sales transactions</li>
                  <li>Settlement details</li>
                  <li>Daily breakdown</li>
                  <li>Multiple analysis sheets</li>
                </ul>
              </div>
              <button
                className="export-btn export-btn--excel"
                onClick={handleSalesSettlementsExcel}
                disabled={loading}
              >
                {loading && loadingType === 'excel' ? (
                  <>
                    <span className="btn-spinner"></span>
                    Generating...
                  </>
                ) : (
                  <>Download Excel</>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Additional Reports Section */}
      <div className="export-card">
        <div className="export-section">
          <h3 className="export-section-title">Quick Reports</h3>
          <p className="export-section-desc">
            Pre-configured summary reports
          </p>

          <div className="export-actions-row">
            <button
              className="export-btn export-btn--secondary"
              onClick={handleDailySummaryPDF}
              disabled={loading}
            >
              {loading && loadingType === 'daily' ? 'Generating...' : "Today's Receipts Summary (PDF)"}
            </button>
          </div>
        </div>
      </div>

      {/* Report Info Section */}
      <div className="export-info-section">
        <h4 className="export-info-title">Report Contents</h4>
        <div className="export-info-grid">
          <div className="export-info-item">
            <div className="export-info-icon-small">PDF</div>
            <div>
              <strong>Executive Summary (PDF)</strong>
              <p>Single-page report with KPIs, charts, and key insights. Perfect for sharing with CEO/CFO in meetings or email.</p>
            </div>
          </div>
          <div className="export-info-item">
            <div className="export-info-icon-small excel">XLS</div>
            <div>
              <strong>Detailed Report (Excel)</strong>
              <p>Multi-sheet workbook with all transactions, settlements, agent performance, station analysis, and daily breakdowns.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
