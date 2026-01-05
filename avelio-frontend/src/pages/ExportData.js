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
  const [filters, setFilters] = useState({
    status: '',
    dateFrom: '',
    dateTo: ''
  });

  // Cash Closing States
  const [cashClosingDate, setCashClosingDate] = useState(new Date().toISOString().split('T')[0]);
  const [cashClosingPeriod, setCashClosingPeriod] = useState('daily'); // 'daily' or 'monthly'
  const [cashClosingMonth, setCashClosingMonth] = useState(new Date().getMonth() + 1);
  const [cashClosingYear, setCashClosingYear] = useState(new Date().getFullYear());
  const [stationFilter, setStationFilter] = useState('ALL'); // 'ALL', 'JUB', 'EBB'
  const [includeAfterHours, setIncludeAfterHours] = useState(true);
  const [externalReceipts, setExternalReceipts] = useState([]);
  const [cashClosingData, setCashClosingData] = useState(null);
  const [loadingCashClosing, setLoadingCashClosing] = useState(false);

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
      const url = `${API_BASE}/receipts${queryString ? `?${queryString}` : ''}`;
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (!res.ok) {
        throw new Error('Failed to fetch receipts');
      }
      const data = await res.json();
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

  // Cash Closing Functions
  const fetchCashClosingData = async () => {
    try {
      setLoadingCashClosing(true);
      setError('');

      let url;
      if (cashClosingPeriod === 'daily') {
        url = `${API_BASE}/export/cash-closing?date=${cashClosingDate}&station=${stationFilter}&includeAfterHours=${includeAfterHours}`;
      } else {
        url = `${API_BASE}/export/cash-closing?month=${cashClosingMonth}&year=${cashClosingYear}&station=${stationFilter}&includeAfterHours=${includeAfterHours}`;
      }

      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });

      if (!res.ok) {
        throw new Error('Failed to fetch cash closing data');
      }

      const data = await res.json();
      setCashClosingData(data);
    } catch (e) {
      setError(e.message || 'Failed to fetch cash closing data');
    } finally {
      setLoadingCashClosing(false);
    }
  };

  const addExternalReceipt = () => {
    const newReceipt = {
      id: Date.now(),
      receiptNumber: '',
      amount: 0,
      description: '',
      time: ''
    };
    setExternalReceipts([...externalReceipts, newReceipt]);
  };

  const updateExternalReceipt = (id, field, value) => {
    setExternalReceipts(externalReceipts.map(receipt =>
      receipt.id === id ? { ...receipt, [field]: value } : receipt
    ));
  };

  const removeExternalReceipt = (id) => {
    setExternalReceipts(externalReceipts.filter(receipt => receipt.id !== id));
  };

  const calculateTotalWithAdjustments = () => {
    if (!cashClosingData) return 0;

    const systemTotal = parseFloat(cashClosingData.totalAmount || 0);
    const externalTotal = externalReceipts.reduce((sum, r) => sum + parseFloat(r.amount || 0), 0);

    return systemTotal + externalTotal;
  };

  const printCashClosingReport = () => {
    const printWindow = window.open('', '_blank');
    const reportDate = cashClosingPeriod === 'daily'
      ? new Date(cashClosingDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
      : `${new Date(cashClosingYear, cashClosingMonth - 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Cash Closing Report - ${reportDate}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          h1 { color: #333; border-bottom: 2px solid #0EA5E9; padding-bottom: 10px; }
          h2 { color: #555; margin-top: 30px; }
          table { width: 100%; border-collapse: collapse; margin: 15px 0; }
          th, td { padding: 10px; text-align: left; border: 1px solid #ddd; }
          th { background-color: #f5f5f5; font-weight: bold; }
          .summary { background-color: #e8f4f8; padding: 15px; border-radius: 5px; margin: 20px 0; }
          .total-row { font-weight: bold; background-color: #f0f9ff; }
          .header-info { display: flex; justify-content: space-between; margin-bottom: 20px; }
          .station-badge { background-color: #0EA5E9; color: white; padding: 5px 10px; border-radius: 3px; }
          @media print {
            body { margin: 10px; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <h1>Cash Closing Report</h1>
        <div class="header-info">
          <div>
            <strong>Period:</strong> ${reportDate}<br>
            <strong>Station:</strong> <span class="station-badge">${stationFilter}</span><br>
            <strong>Generated:</strong> ${new Date().toLocaleString('en-GB')}
          </div>
        </div>

        <div class="summary">
          <h3>Summary</h3>
          <table>
            <tr>
              <td><strong>Total System Receipts:</strong></td>
              <td>${cashClosingData?.totalReceipts || 0}</td>
              <td><strong>Amount:</strong></td>
              <td>$${(cashClosingData?.totalAmount || 0).toFixed(2)}</td>
            </tr>
            <tr>
              <td><strong>Regular Hours:</strong></td>
              <td>${cashClosingData?.regularHoursCount || 0}</td>
              <td><strong>Amount:</strong></td>
              <td>$${(cashClosingData?.regularHoursAmount || 0).toFixed(2)}</td>
            </tr>
            <tr>
              <td><strong>After Hours:</strong></td>
              <td>${cashClosingData?.afterHoursCount || 0}</td>
              <td><strong>Amount:</strong></td>
              <td>$${(cashClosingData?.afterHoursAmount || 0).toFixed(2)}</td>
            </tr>
          </table>
        </div>

        <h2>System Receipts</h2>
        <table>
          <thead>
            <tr>
              <th>Receipt #</th>
              <th>Agency</th>
              <th>Time</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Type</th>
            </tr>
          </thead>
          <tbody>
            ${(cashClosingData?.receipts || []).map(r => `
              <tr>
                <td>${r.receipt_number}</td>
                <td>${r.agency_name}</td>
                <td>${r.issue_time || 'N/A'}</td>
                <td>$${parseFloat(r.amount).toFixed(2)}</td>
                <td>${r.status}</td>
                <td>${r.afterHours ? 'After Hours' : 'Regular'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        ${externalReceipts.length > 0 ? `
          <h2>External/Manual Receipts</h2>
          <table>
            <thead>
              <tr>
                <th>Receipt #</th>
                <th>Description</th>
                <th>Time</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              ${externalReceipts.map(r => `
                <tr>
                  <td>${r.receiptNumber}</td>
                  <td>${r.description}</td>
                  <td>${r.time}</td>
                  <td>$${parseFloat(r.amount || 0).toFixed(2)}</td>
                </tr>
              `).join('')}
              <tr class="total-row">
                <td colspan="3">External Total</td>
                <td>$${externalReceipts.reduce((sum, r) => sum + parseFloat(r.amount || 0), 0).toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
        ` : ''}

        <div class="summary" style="margin-top: 30px;">
          <h3>Final Closing</h3>
          <table>
            <tr class="total-row">
              <td>System Receipts Total:</td>
              <td>$${(cashClosingData?.totalAmount || 0).toFixed(2)}</td>
            </tr>
            <tr class="total-row">
              <td>External Receipts Total:</td>
              <td>$${externalReceipts.reduce((sum, r) => sum + parseFloat(r.amount || 0), 0).toFixed(2)}</td>
            </tr>
            <tr class="total-row" style="font-size: 1.2em;">
              <td>GRAND TOTAL:</td>
              <td>$${calculateTotalWithAdjustments().toFixed(2)}</td>
            </tr>
          </table>
        </div>

        <div style="margin-top: 50px; border-top: 1px solid #ccc; padding-top: 20px;">
          <table style="width: 100%; border: none;">
            <tr>
              <td style="border: none; width: 45%;">
                <p>Prepared By: _______________________</p>
                <p>Date: ${new Date().toLocaleDateString('en-GB')}</p>
              </td>
              <td style="border: none; width: 10%;"></td>
              <td style="border: none; width: 45%;">
                <p>Verified By: _______________________</p>
                <p>Date: _______________________</p>
              </td>
            </tr>
          </table>
        </div>
      </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
    setTimeout(() => {
      printWindow.print();
    }, 500);
  };

  const handleYesterdaySummaryPDF = async () => {
    try {
      setLoading(true);
      setError('');
      setSuccess('');

      // Get yesterday's date
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayDate = yesterday.toISOString().split('T')[0];

      // Fetch PDF from backend
      const url = `${API_BASE}/export/daily-summary?date=${yesterdayDate}`;
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to generate yesterday summary');
      }

      // Download PDF
      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `daily-summary-${yesterdayDate}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);

      setSuccess('Successfully downloaded yesterday\'s summary PDF');

    } catch (e) {
      setError(e.message || 'Failed to generate yesterday summary');
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

      {/* Cash Closing Section */}
      <div className="export-card" style={{ marginBottom: '30px' }}>
        <div className="export-section">
          <h3 className="export-section-title">💰 Cash Closing Report</h3>
          <p className="export-section-desc">
            Generate daily or monthly cash closing reports with station filtering and manual adjustments
          </p>

          {/* Period Selection */}
          <div style={{ marginTop: '20px', display: 'flex', gap: '15px', flexWrap: 'wrap', alignItems: 'center' }}>
            <select
              value={cashClosingPeriod}
              onChange={(e) => setCashClosingPeriod(e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid #E2E8F0',
                fontSize: '14px'
              }}
            >
              <option value="daily">Daily Closing</option>
              <option value="monthly">Monthly Closing</option>
            </select>

            {cashClosingPeriod === 'daily' ? (
              <input
                type="date"
                value={cashClosingDate}
                onChange={(e) => setCashClosingDate(e.target.value)}
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid #E2E8F0',
                  fontSize: '14px'
                }}
              />
            ) : (
              <div style={{ display: 'flex', gap: '10px' }}>
                <select
                  value={cashClosingMonth}
                  onChange={(e) => setCashClosingMonth(Number(e.target.value))}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #E2E8F0',
                    fontSize: '14px'
                  }}
                >
                  {Array.from({ length: 12 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>
                      {new Date(2024, i).toLocaleDateString('en-GB', { month: 'long' })}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  value={cashClosingYear}
                  onChange={(e) => setCashClosingYear(Number(e.target.value))}
                  min="2024"
                  max="2030"
                  style={{
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #E2E8F0',
                    fontSize: '14px',
                    width: '100px'
                  }}
                />
              </div>
            )}

            {/* Station Filter */}
            <select
              value={stationFilter}
              onChange={(e) => setStationFilter(e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid #E2E8F0',
                fontSize: '14px',
                backgroundColor: stationFilter === 'JUB' ? '#0EA5E9' : stationFilter === 'EBB' ? '#10B981' : '#64748B',
                color: 'white'
              }}
            >
              <option value="ALL">All Stations</option>
              <option value="JUB">JUB - Juba</option>
              <option value="EBB">EBB - Entebbe</option>
            </select>

            {/* After Hours Toggle */}
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={includeAfterHours}
                onChange={(e) => setIncludeAfterHours(e.target.checked)}
                style={{ width: '18px', height: '18px' }}
              />
              <span style={{ fontSize: '14px' }}>Include After-Hours (18:00+)</span>
            </label>

            <button
              className="export-btn"
              onClick={fetchCashClosingData}
              disabled={loadingCashClosing}
              style={{
                backgroundColor: '#0EA5E9',
                color: 'white',
                padding: '8px 20px',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500'
              }}
            >
              {loadingCashClosing ? '⏳ Loading...' : '📊 Generate Report'}
            </button>
          </div>

          {/* Cash Closing Results */}
          {cashClosingData && (
            <div style={{ marginTop: '30px' }}>
              <div style={{
                backgroundColor: '#F0F9FF',
                padding: '20px',
                borderRadius: '10px',
                marginBottom: '20px'
              }}>
                <h4 style={{ marginTop: 0, color: '#0C4A6E' }}>Summary</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
                  <div>
                    <div style={{ fontSize: '12px', color: '#64748B' }}>Total Receipts</div>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#0C4A6E' }}>
                      {cashClosingData.totalReceipts || 0}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', color: '#64748B' }}>System Total</div>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#0C4A6E' }}>
                      ${(cashClosingData.totalAmount || 0).toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', color: '#64748B' }}>Regular Hours</div>
                    <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#10B981' }}>
                      ${(cashClosingData.regularHoursAmount || 0).toFixed(2)}
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748B' }}>
                      ({cashClosingData.regularHoursCount || 0} receipts)
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', color: '#64748B' }}>After Hours</div>
                    <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#F59E0B' }}>
                      ${(cashClosingData.afterHoursAmount || 0).toFixed(2)}
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748B' }}>
                      ({cashClosingData.afterHoursCount || 0} receipts)
                    </div>
                  </div>
                </div>
              </div>

              {/* External Receipts Section */}
              <div style={{
                backgroundColor: '#FEF3C7',
                padding: '20px',
                borderRadius: '10px',
                marginBottom: '20px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                  <h4 style={{ margin: 0, color: '#92400E' }}>📝 External/Manual Receipts</h4>
                  <button
                    onClick={addExternalReceipt}
                    style={{
                      backgroundColor: '#F59E0B',
                      color: 'white',
                      padding: '6px 12px',
                      borderRadius: '6px',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '13px'
                    }}
                  >
                    + Add External Receipt
                  </button>
                </div>

                {externalReceipts.length > 0 && (
                  <div style={{ marginTop: '10px' }}>
                    {externalReceipts.map((receipt) => (
                      <div key={receipt.id} style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 2fr 1fr 1fr auto',
                        gap: '10px',
                        marginBottom: '10px',
                        alignItems: 'center'
                      }}>
                        <input
                          type="text"
                          placeholder="Receipt #"
                          value={receipt.receiptNumber}
                          onChange={(e) => updateExternalReceipt(receipt.id, 'receiptNumber', e.target.value)}
                          style={{
                            padding: '6px',
                            borderRadius: '4px',
                            border: '1px solid #E5E7EB',
                            fontSize: '13px'
                          }}
                        />
                        <input
                          type="text"
                          placeholder="Description"
                          value={receipt.description}
                          onChange={(e) => updateExternalReceipt(receipt.id, 'description', e.target.value)}
                          style={{
                            padding: '6px',
                            borderRadius: '4px',
                            border: '1px solid #E5E7EB',
                            fontSize: '13px'
                          }}
                        />
                        <input
                          type="text"
                          placeholder="Time"
                          value={receipt.time}
                          onChange={(e) => updateExternalReceipt(receipt.id, 'time', e.target.value)}
                          style={{
                            padding: '6px',
                            borderRadius: '4px',
                            border: '1px solid #E5E7EB',
                            fontSize: '13px'
                          }}
                        />
                        <input
                          type="number"
                          placeholder="Amount"
                          value={receipt.amount}
                          onChange={(e) => updateExternalReceipt(receipt.id, 'amount', e.target.value)}
                          style={{
                            padding: '6px',
                            borderRadius: '4px',
                            border: '1px solid #E5E7EB',
                            fontSize: '13px'
                          }}
                        />
                        <button
                          onClick={() => removeExternalReceipt(receipt.id)}
                          style={{
                            backgroundColor: '#EF4444',
                            color: 'white',
                            padding: '6px 10px',
                            borderRadius: '4px',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '12px'
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    <div style={{
                      marginTop: '15px',
                      paddingTop: '10px',
                      borderTop: '1px solid #F59E0B',
                      fontSize: '14px',
                      fontWeight: 'bold',
                      color: '#92400E'
                    }}>
                      External Total: ${externalReceipts.reduce((sum, r) => sum + parseFloat(r.amount || 0), 0).toFixed(2)}
                    </div>
                  </div>
                )}
              </div>

              {/* Final Total */}
              <div style={{
                backgroundColor: '#DCFCE7',
                padding: '20px',
                borderRadius: '10px',
                marginBottom: '20px'
              }}>
                <h4 style={{ margin: 0, color: '#14532D' }}>💵 Final Cash Closing</h4>
                <div style={{ marginTop: '15px', fontSize: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span>System Total:</span>
                    <strong>${(cashClosingData.totalAmount || 0).toFixed(2)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span>External Total:</span>
                    <strong>${externalReceipts.reduce((sum, r) => sum + parseFloat(r.amount || 0), 0).toFixed(2)}</strong>
                  </div>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginTop: '10px',
                    paddingTop: '10px',
                    borderTop: '2px solid #10B981',
                    fontSize: '20px',
                    fontWeight: 'bold',
                    color: '#14532D'
                  }}>
                    <span>GRAND TOTAL:</span>
                    <span>${calculateTotalWithAdjustments().toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '15px' }}>
                <button
                  onClick={printCashClosingReport}
                  className="export-btn"
                  style={{
                    backgroundColor: '#10B981',
                    color: 'white',
                    padding: '10px 24px',
                    borderRadius: '8px',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '15px',
                    fontWeight: '500'
                  }}
                >
                  🖨️ Print Cash Closing Report
                </button>
              </div>
            </div>
          )}
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
