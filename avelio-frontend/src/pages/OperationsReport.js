import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { getApiBaseUrl } from '../services/api';
import ModernDatePicker from '../components/ModernDatePicker';
import './OperationsReport.css';

const API_BASE = getApiBaseUrl();

// Date preset helpers
const getDatePreset = (preset) => {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay());

  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case 'yesterday':
      return { from: yesterday, to: yesterday };
    case 'this_week':
      return { from: startOfWeek, to: today };
    case 'this_month':
      return { from: startOfMonth, to: today };
    default:
      return { from: today, to: today };
  }
};

const formatDateForApi = (date) => {
  if (!date) return null;
  if (typeof date === 'string') return date;
  return date.toISOString().split('T')[0];
};

export default function OperationsReport() {
  // Token
  const token = localStorage.getItem('token') || sessionStorage.getItem('token');

  // Loading and messages
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Report type: 'agencies' or 'settlements'
  const [reportType, setReportType] = useState('agencies');

  // Filters
  const [dateFrom, setDateFrom] = useState(formatDateForApi(new Date()));
  const [dateTo, setDateTo] = useState(formatDateForApi(new Date()));
  const [selectedStation, setSelectedStation] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [activeTab, setActiveTab] = useState('sales');
  const [datePreset, setDatePreset] = useState('today');

  // Data
  const [stations, setStations] = useState([]);
  const [reportData, setReportData] = useState(null);
  const [agenciesData, setAgenciesData] = useState(null);
  const [showAgencyDetails, setShowAgencyDetails] = useState(false);

  // Fetch stations for filter dropdown
  const fetchStations = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/reports/stations`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setStations(data.data?.stations || []);
      }
    } catch (err) {
      console.error('Failed to load stations:', err);
    }
  }, [token]);

  // Fetch settlements report data
  const fetchReport = useCallback(async () => {
    if (reportType !== 'settlements') return;
    try {
      setLoading(true);
      setError('');

      const params = new URLSearchParams({
        date_from: dateFrom,
        date_to: dateTo,
        currency,
        report_type: 'all'
      });

      if (selectedStation) {
        params.append('station_id', selectedStation);
      }

      const res = await fetch(`${API_BASE}/reports/operations?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Failed to load report');
      }

      if (data.success) {
        setReportData(data.data);
      }
    } catch (err) {
      console.error('Fetch error:', err);
      setError(err.message || 'Failed to load report');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, selectedStation, currency, token, reportType]);

  // Fetch agencies report data
  const fetchAgenciesReport = useCallback(async () => {
    if (reportType !== 'agencies') return;
    try {
      setLoading(true);
      setError('');

      const params = new URLSearchParams({
        date_from: dateFrom,
        date_to: dateTo,
      });

      const res = await fetch(`${API_BASE}/reports/agencies-summary?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Failed to load agencies report');
      }

      if (data.success) {
        setAgenciesData(data.data);
      }
    } catch (err) {
      console.error('Fetch error:', err);
      setError(err.message || 'Failed to load agencies report');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, token, reportType]);

  // Initial load
  useEffect(() => {
    fetchStations();
  }, [fetchStations]);

  // Fetch report when filters change
  useEffect(() => {
    if (dateFrom && dateTo) {
      if (reportType === 'settlements') {
        fetchReport();
      } else {
        fetchAgenciesReport();
      }
    }
  }, [dateFrom, dateTo, selectedStation, currency, reportType, fetchReport, fetchAgenciesReport]);

  // Handle date preset change
  const handlePresetChange = (preset) => {
    setDatePreset(preset);
    const { from, to } = getDatePreset(preset);
    setDateFrom(formatDateForApi(from));
    setDateTo(formatDateForApi(to));
  };

  // Clear all filters
  const handleClearFilters = () => {
    setDatePreset('today');
    const today = formatDateForApi(new Date());
    setDateFrom(today);
    setDateTo(today);
    setSelectedStation('');
    setCurrency('USD');
  };

  // Handle print
  const handlePrint = () => {
    window.print();
  };

  // Format helpers
  const formatCurrency = (amount) => {
    return Number(amount || 0).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  // Get variance class
  const getVarianceClass = (status) => {
    if (!status) return '';
    const s = status.toUpperCase();
    if (s === 'BALANCED') return 'balanced';
    if (s === 'SHORT') return 'short';
    if (s === 'EXTRA') return 'extra';
    return 'pending';
  };

  // Get variance display
  const getVarianceDisplay = (variance, status) => {
    if (status === 'BALANCED' || variance === 0) {
      return { text: 'BALANCED', icon: '✓' };
    }
    if (status === 'SHORT' || variance < 0) {
      return { text: `${formatCurrency(Math.abs(variance))} SHORT`, icon: '⚠' };
    }
    if (status === 'EXTRA' || variance > 0) {
      return { text: `${formatCurrency(variance)} EXTRA`, icon: '↑' };
    }
    return { text: 'PENDING', icon: '…' };
  };

  // Memoized data for each tab
  const salesData = useMemo(() => reportData?.sales || null, [reportData]);
  const settlementsData = useMemo(() => reportData?.settlements || null, [reportData]);
  const financialData = useMemo(() => reportData?.financial || null, [reportData]);

  // Print date footer
  const printDate = new Date().toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  // Category badge for agency details
  const categoryBadge = (cat) => {
    const styles = {
      paid: { bg: '#ecfdf5', color: '#047857', label: 'PAID' },
      pending: { bg: '#fffbeb', color: '#92400e', label: 'PENDING' },
      bank_transfer: { bg: '#f0f9ff', color: '#0369a1', label: 'BANK' },
      ebb: { bg: '#eef2ff', color: '#4f46e5', label: 'EBB' },
    };
    const s = styles[cat] || styles.paid;
    return (
      <span style={{
        display: 'inline-block', padding: '2px 8px', borderRadius: '6px',
        fontSize: '10px', fontWeight: 700, textTransform: 'uppercase',
        background: s.bg, color: s.color,
      }}>{s.label}</span>
    );
  };

  const summary = agenciesData?.summary;

  return (
    <div className="operations-report" data-print-date={printDate}>
      {/* Header */}
      <header className="report-header">
        <div className="header-content">
          <h1>Operations Report Center</h1>
          <p>
            {reportType === 'settlements'
              ? (reportData?.filters?.station_name || 'All Stations') + ' | '
              : 'Agencies Report | '
            }
            {formatDate(dateFrom)} {dateFrom !== dateTo && `- ${formatDate(dateTo)}`}
          </p>
        </div>
        <button className="print-btn no-print" onClick={handlePrint}>
          Print Report
        </button>
      </header>

      {/* Messages */}
      {error && (
        <div className="report-message error no-print">
          {error}
        </div>
      )}

      {/* Report Type Selector */}
      <section className="filters-section no-print" style={{ marginBottom: '12px', padding: '12px 20px' }}>
        <div className="filters-row" style={{ alignItems: 'center' }}>
          <div className="filter-group">
            <label className="filter-label">Report Type</label>
            <select
              className="filter-select"
              value={reportType}
              onChange={(e) => {
                setReportType(e.target.value);
                if (e.target.value === 'settlements') {
                  setActiveTab('sales');
                }
              }}
              style={{ minWidth: '240px', fontWeight: 600 }}
            >
              <option value="agencies">Agencies Report</option>
              <option value="settlements">Settlements Report</option>
            </select>
          </div>
        </div>
      </section>

      {/* Filters Section */}
      <section className="filters-section no-print">
        <div className="filters-row">
          {/* Date Presets */}
          <div className="filter-group">
            <label className="filter-label">Quick Select</label>
            <div className="preset-buttons">
              <button
                className={`preset-btn ${datePreset === 'today' ? 'active' : ''}`}
                onClick={() => handlePresetChange('today')}
              >
                Today
              </button>
              <button
                className={`preset-btn ${datePreset === 'yesterday' ? 'active' : ''}`}
                onClick={() => handlePresetChange('yesterday')}
              >
                Yesterday
              </button>
              <button
                className={`preset-btn ${datePreset === 'this_week' ? 'active' : ''}`}
                onClick={() => handlePresetChange('this_week')}
              >
                This Week
              </button>
              <button
                className={`preset-btn ${datePreset === 'this_month' ? 'active' : ''}`}
                onClick={() => handlePresetChange('this_month')}
              >
                This Month
              </button>
            </div>
          </div>

          {/* Date Range */}
          <div className="filter-group">
            <label className="filter-label">From</label>
            <ModernDatePicker
              selected={dateFrom}
              onChange={(date) => {
                setDateFrom(date);
                setDatePreset('custom');
              }}
              placeholder="Start date"
            />
          </div>

          <div className="filter-group">
            <label className="filter-label">To</label>
            <ModernDatePicker
              selected={dateTo}
              onChange={(date) => {
                setDateTo(date);
                setDatePreset('custom');
              }}
              placeholder="End date"
            />
          </div>

          {/* Station Filter - only for settlements */}
          {reportType === 'settlements' && (
            <div className="filter-group">
              <label className="filter-label">Station</label>
              <select
                className="filter-select"
                value={selectedStation}
                onChange={(e) => setSelectedStation(e.target.value)}
              >
                <option value="">All Stations</option>
                {stations.map(st => (
                  <option key={st.id} value={st.id}>
                    {st.station_code} - {st.station_name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="filters-row secondary">
          {/* Currency Toggle - only for settlements */}
          {reportType === 'settlements' && (
            <div className="filter-group">
              <label className="filter-label">Currency</label>
              <div className="currency-toggle">
                <button
                  className={`currency-btn ${currency === 'USD' ? 'active' : ''}`}
                  onClick={() => setCurrency('USD')}
                >
                  USD
                </button>
                <button
                  className={`currency-btn ${currency === 'SSP' ? 'active' : ''}`}
                  onClick={() => setCurrency('SSP')}
                >
                  SSP
                </button>
              </div>
            </div>
          )}

          <button className="clear-filters-btn" onClick={handleClearFilters}>
            Clear Filters
          </button>
        </div>
      </section>

      {/* Loading State */}
      {loading && (
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading report...</p>
        </div>
      )}

      {/* ========================================
          AGENCIES REPORT
          ======================================== */}
      {reportType === 'agencies' && !loading && (
        <div className="tab-content">
          <section className="report-section">
            <h2 className="section-title">Agencies Deposit Summary</h2>

            {!summary ? (
              <div className="empty-state">
                <p>No receipt data for the selected period.</p>
              </div>
            ) : (
              <>
                {/* Summary Cards */}
                <div className="agencies-summary-grid">
                  <div className="agency-summary-card total-card">
                    <div className="asc-label">Paid</div>
                    <div className="asc-amount">USD {formatCurrency(summary.total_deposited.amount)}</div>
                    <div className="asc-count">{summary.total_deposited.count} receipt{summary.total_deposited.count !== 1 ? 's' : ''}</div>
                  </div>

                  <div className="agency-summary-card pending-card">
                    <div className="asc-label">Total Pending</div>
                    <div className="asc-amount">USD {formatCurrency(summary.total_pending.amount)}</div>
                    <div className="asc-count">{summary.total_pending.count} receipt{summary.total_pending.count !== 1 ? 's' : ''}</div>
                  </div>

                  <div className="agency-summary-card bank-card">
                    <div className="asc-label">Bank Transfer</div>
                    <div className="asc-amount">USD {formatCurrency(summary.total_bank_transfer.amount)}</div>
                    <div className="asc-count">{summary.total_bank_transfer.count} receipt{summary.total_bank_transfer.count !== 1 ? 's' : ''}</div>
                  </div>

                  <div className="agency-summary-card ebb-card">
                    <div className="asc-label">EBB Deposited</div>
                    <div className="asc-amount">USD {formatCurrency(summary.total_ebb.amount)}</div>
                    <div className="asc-count">{summary.total_ebb.count} receipt{summary.total_ebb.count !== 1 ? 's' : ''}</div>
                  </div>
                </div>

                {/* Safe Amount - highlighted */}
                <div className="safe-amount-card">
                  <div className="safe-label">To Agencies Deposit Safe</div>
                  <div className="safe-formula">
                    Paid - Pending - Bank Transfer - EBB Deposits
                  </div>
                  <div className="safe-calculation">
                    {formatCurrency(summary.total_deposited.amount)} - {formatCurrency(summary.total_pending.amount)} - {formatCurrency(summary.total_bank_transfer.amount)} - {formatCurrency(summary.total_ebb.amount)}
                  </div>
                  <div className="safe-value">USD {formatCurrency(summary.safe_amount)}</div>
                </div>

                {/* Collections for selected date */}
                {agenciesData?.collections && agenciesData.collections.count > 0 && (
                  <div className="todays-collections-card" style={{
                    background: 'linear-gradient(135deg, #0f766e 0%, #115e59 100%)',
                    color: '#fff', borderRadius: '12px', padding: '18px 22px', marginTop: '16px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <div style={{ fontWeight: 700, fontSize: '15px' }}>
                        Collections ({agenciesData.collections.date_from === agenciesData.collections.date_to
                          ? formatDate(agenciesData.collections.date_from)
                          : `${formatDate(agenciesData.collections.date_from)} - ${formatDate(agenciesData.collections.date_to)}`})
                      </div>
                      <div style={{ fontWeight: 800, fontSize: '22px' }}>USD {formatCurrency(agenciesData.collections.total)}</div>
                    </div>
                    <div style={{ fontSize: '12px', opacity: 0.85, marginBottom: '10px' }}>
                      {agenciesData.collections.count} receipt{agenciesData.collections.count !== 1 ? 's' : ''} paid on this date (including late payments from earlier dates)
                    </div>
                    <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                      <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.2)' }}>
                            <th style={{ textAlign: 'left', padding: '4px 6px', fontWeight: 600 }}>Receipt #</th>
                            <th style={{ textAlign: 'left', padding: '4px 6px', fontWeight: 600 }}>Agency</th>
                            <th style={{ textAlign: 'right', padding: '4px 6px', fontWeight: 600 }}>Amount</th>
                            <th style={{ textAlign: 'left', padding: '4px 6px', fontWeight: 600 }}>Issued</th>
                          </tr>
                        </thead>
                        <tbody>
                          {agenciesData.collections.details.map((c, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                              <td style={{ padding: '4px 6px', fontWeight: 600 }}>{c.receipt_number}</td>
                              <td style={{ padding: '4px 6px' }}>{c.agency_name}</td>
                              <td style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 600 }}>
                                {formatCurrency(c.amount)}
                                {c.issue_date < agenciesData.collections.date_from && (
                                  <span style={{ marginLeft: '6px', fontSize: '9px', background: 'rgba(255,255,255,0.2)', padding: '1px 5px', borderRadius: '4px' }}>LATE</span>
                                )}
                              </td>
                              <td style={{ padding: '4px 6px', opacity: 0.8 }}>{c.issue_date}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Toggle Details */}
                <button
                  className="toggle-details-btn"
                  onClick={() => setShowAgencyDetails(!showAgencyDetails)}
                >
                  {showAgencyDetails ? 'Hide Details' : 'Show Details'} ({agenciesData?.details?.length || 0} receipts)
                </button>

                {/* Details Table */}
                {showAgencyDetails && agenciesData?.details?.length > 0 && (
                  <table className="report-table" style={{ marginTop: '16px' }}>
                    <thead>
                      <tr>
                        <th>Receipt #</th>
                        <th>Agency</th>
                        <th className="text-right">Amount</th>
                        <th>Currency</th>
                        <th>Status</th>
                        <th>Category</th>
                        <th>Deposited</th>
                        <th>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {agenciesData.details.map((r, idx) => (
                        <tr key={idx}>
                          <td style={{ fontWeight: 600 }}>{r.receipt_number}</td>
                          <td>{r.agency_name}</td>
                          <td className="amount">{formatCurrency(r.amount)}</td>
                          <td>{r.currency}</td>
                          <td>
                            <span style={{
                              display: 'inline-block', padding: '2px 8px', borderRadius: '6px',
                              fontSize: '10px', fontWeight: 700, textTransform: 'uppercase',
                              background: r.status === 'PAID' ? '#ecfdf5' : '#fffbeb',
                              color: r.status === 'PAID' ? '#047857' : '#92400e',
                            }}>{r.status}</span>
                          </td>
                          <td>{categoryBadge(r.category)}</td>
                          <td>
                            {r.is_deposited && (
                              <span style={{
                                display: 'inline-block', padding: '2px 7px', borderRadius: '6px',
                                fontSize: '10px', fontWeight: 700,
                                background: '#d1fae5', color: '#065f46', border: '1px solid #a7f3d0',
                              }}>YES</span>
                            )}
                          </td>
                          <td style={{ fontSize: '13px', color: '#64748b' }}>
                            {formatDate(r.issue_date)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan="2"><strong>TOTAL</strong></td>
                        <td className="amount"><strong>{formatCurrency(summary.total_deposited.amount)}</strong></td>
                        <td colSpan="5"></td>
                      </tr>
                    </tfoot>
                  </table>
                )}
              </>
            )}
          </section>
        </div>
      )}

      {/* ========================================
          SETTLEMENTS REPORT (existing)
          ======================================== */}
      {reportType === 'settlements' && !loading && (
        <>
          {/* Tabs Navigation */}
          <nav className="tabs-nav">
            <button
              className={`tab-btn ${activeTab === 'sales' ? 'active' : ''}`}
              onClick={() => setActiveTab('sales')}
            >
              <span className="tab-icon">📊</span>
              Sales
            </button>
            <button
              className={`tab-btn ${activeTab === 'settlements' ? 'active' : ''}`}
              onClick={() => setActiveTab('settlements')}
            >
              <span className="tab-icon">📋</span>
              Settlements
            </button>
            <button
              className={`tab-btn ${activeTab === 'financial' ? 'active' : ''}`}
              onClick={() => setActiveTab('financial')}
            >
              <span className="tab-icon">💰</span>
              Financial
            </button>
          </nav>

          {/* Tab Content */}
          <div className="tab-content">
            {/* Sales Tab */}
            {activeTab === 'sales' && (
              <section className="report-section">
                <h2 className="section-title">Sales by Station / Agent</h2>

                {!salesData || salesData.by_station_agent.length === 0 ? (
                  <div className="empty-state">
                    <p>No sales data for the selected period.</p>
                  </div>
                ) : (
                  <table className="report-table">
                    <thead>
                      <tr>
                        <th>Station</th>
                        <th>Agent</th>
                        <th className="text-right">Sales</th>
                        <th className="text-right">Refunds</th>
                        <th className="text-right">Net Sales</th>
                        <th className="text-center">Transactions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {salesData.by_station_agent.map((row, idx) => (
                        <tr key={idx}>
                          <td className="station-cell">{row.station_code}</td>
                          <td>{row.agent_name}</td>
                          <td className="amount">{formatCurrency(row.total_sales)}</td>
                          <td className="amount refund">{formatCurrency(row.total_refunds)}</td>
                          <td className="amount net">{formatCurrency(row.net_sales)}</td>
                          <td className="text-center">{row.transaction_count}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan="2"><strong>TOTAL</strong></td>
                        <td className="amount"><strong>{formatCurrency(salesData.totals.sales)}</strong></td>
                        <td className="amount refund"><strong>{formatCurrency(salesData.totals.refunds)}</strong></td>
                        <td className="amount net"><strong>{formatCurrency(salesData.totals.net)}</strong></td>
                        <td className="text-center"><strong>{salesData.totals.transactions}</strong></td>
                      </tr>
                    </tfoot>
                  </table>
                )}
              </section>
            )}

            {/* Settlements Tab */}
            {activeTab === 'settlements' && (
              <section className="report-section">
                <h2 className="section-title">Agent Variances</h2>

                {!settlementsData || settlementsData.agent_variances.length === 0 ? (
                  <div className="empty-state">
                    <p>No settlement data for the selected period.</p>
                  </div>
                ) : (
                  <>
                    <table className="report-table">
                      <thead>
                        <tr>
                          <th>Station</th>
                          <th>Agent</th>
                          <th className="text-right">Expected</th>
                          <th className="text-right">Declared</th>
                          <th className="text-right">Variance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {settlementsData.agent_variances.map((row, idx) => {
                          const varDisplay = getVarianceDisplay(row.variance, row.variance_status);
                          return (
                            <tr key={idx}>
                              <td className="station-cell">{row.station_code}</td>
                              <td>{row.agent_name}</td>
                              <td className="amount">{formatCurrency(row.expected_cash)}</td>
                              <td className="amount">
                                {row.declared_cash !== null ? formatCurrency(row.declared_cash) : '—'}
                              </td>
                              <td className={`amount variance ${getVarianceClass(row.variance_status)}`}>
                                <span className="variance-icon">{varDisplay.icon}</span>
                                {varDisplay.text}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan="2"><strong>TOTAL</strong></td>
                          <td className="amount"><strong>{formatCurrency(settlementsData.totals.expected)}</strong></td>
                          <td className="amount"><strong>{formatCurrency(settlementsData.totals.declared)}</strong></td>
                          <td className={`amount variance ${settlementsData.totals.variance === 0 ? 'balanced' : (settlementsData.totals.variance < 0 ? 'short' : 'extra')}`}>
                            <strong>{formatCurrency(settlementsData.totals.variance)}</strong>
                          </td>
                        </tr>
                      </tfoot>
                    </table>

                    {/* Variance Summary Cards */}
                    <div className="variance-summary">
                      <div className="variance-card balanced">
                        <span className="count">{settlementsData.totals.balanced_count}</span>
                        <span className="label">Balanced</span>
                      </div>
                      <div className="variance-card short">
                        <span className="count">{settlementsData.totals.short_count}</span>
                        <span className="label">Short</span>
                      </div>
                      <div className="variance-card extra">
                        <span className="count">{settlementsData.totals.extra_count}</span>
                        <span className="label">Extra</span>
                      </div>
                    </div>
                  </>
                )}
              </section>
            )}

            {/* Financial Tab */}
            {activeTab === 'financial' && (
              <section className="report-section financial-section">
                <h2 className="section-title">Financial Summary</h2>

                {!financialData ? (
                  <div className="empty-state">
                    <p>No financial data for the selected period.</p>
                  </div>
                ) : (
                  <div className="financial-grid">
                    {/* Revenue Card */}
                    <div className="financial-card revenue-card">
                      <h3 className="card-title">Revenue</h3>
                      <div className="financial-row">
                        <span className="label">Total Sales:</span>
                        <span className="amount">{formatCurrency(financialData.revenue.sales)}</span>
                      </div>
                      <div className="financial-divider"></div>
                      <div className="financial-row total">
                        <span className="label">Gross Revenue:</span>
                        <span className="amount">{currency} {formatCurrency(financialData.revenue.gross)}</span>
                      </div>
                    </div>

                    {/* Expenses Card */}
                    <div className="financial-card expenses-card">
                      <h3 className="card-title">Expenses</h3>
                      <div className="financial-row">
                        <span className="label">Station Expenses:</span>
                        <span className="amount expense">{formatCurrency(financialData.expenses.station)}</span>
                      </div>
                      <div className="financial-divider"></div>
                      <div className="financial-row total">
                        <span className="label">Net Revenue:</span>
                        <span className="amount">{currency} {formatCurrency(financialData.net_revenue)}</span>
                      </div>
                    </div>

                    {/* Cash Position Card */}
                    <div className="financial-card cash-card">
                      <h3 className="card-title">Cash Position</h3>
                      <div className="financial-row">
                        <span className="label">Expected Cash:</span>
                        <span className="amount">{formatCurrency(financialData.cash.expected)}</span>
                      </div>
                      <div className="financial-row">
                        <span className="label">Cash Received:</span>
                        <span className="amount">{formatCurrency(financialData.cash.received)}</span>
                      </div>
                      <div className="financial-divider thick"></div>
                      <div className={`financial-row variance-row ${getVarianceClass(financialData.cash.variance_status)}`}>
                        <span className="label">Variance:</span>
                        <span className="amount">
                          {currency} {formatCurrency(financialData.cash.variance)}
                          <span className="status-tag">
                            {financialData.cash.variance_status === 'BALANCED' && '✓'}
                            {financialData.cash.variance_status === 'SHORT' && '⚠ SHORT'}
                            {financialData.cash.variance_status === 'EXTRA' && '↑ EXTRA'}
                          </span>
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </section>
            )}
          </div>
        </>
      )}

      {/* Totals Bar - settlements only */}
      {reportType === 'settlements' && reportData && !loading && (
        <footer className="totals-bar no-print">
          <div className="totals-content">
            <div className="total-item">
              <span className="label">Total Sales</span>
              <span className="value">{currency} {formatCurrency(salesData?.totals?.net || 0)}</span>
            </div>
            <div className="total-divider"></div>
            <div className="total-item">
              <span className="label">Cash Variance</span>
              <span className={`value ${getVarianceClass(financialData?.cash?.variance_status)}`}>
                {currency} {formatCurrency(financialData?.cash?.variance || 0)}
              </span>
            </div>
            <div className="total-divider"></div>
            <div className="total-item">
              <span className="label">Records</span>
              <span className="value">{salesData?.totals?.transactions || 0}</span>
            </div>
          </div>
        </footer>
      )}

      {/* Totals Bar - agencies */}
      {reportType === 'agencies' && summary && !loading && (
        <footer className="totals-bar no-print">
          <div className="totals-content">
            <div className="total-item">
              <span className="label">Paid</span>
              <span className="value">USD {formatCurrency(summary.total_deposited.amount)}</span>
            </div>
            <div className="total-divider"></div>
            <div className="total-item">
              <span className="label">To Safe</span>
              <span className="value" style={{ color: '#059669' }}>USD {formatCurrency(summary.safe_amount)}</span>
            </div>
            <div className="total-divider"></div>
            <div className="total-item">
              <span className="label">Receipts</span>
              <span className="value">{summary.total_deposited.count}</span>
            </div>
          </div>
        </footer>
      )}

      {/* Print-only: All Sections */}
      <div className="print-only-sections">
        {/* Print: Agencies Report - PAGE 1: Summary */}
        {reportType === 'agencies' && summary && (
          <>
            <section className="print-section print-agencies-summary-page">
              <h2 className="print-agencies-title">Agencies Deposit Summary</h2>
              <p className="print-agencies-period">
                Period: {formatDate(dateFrom)}{dateFrom !== dateTo ? ` - ${formatDate(dateTo)}` : ''}
              </p>

              {/* Summary Cards - Print-friendly grid */}
              <div className="print-cards-grid">
                <div className="print-card print-card--total">
                  <div className="print-card__label">Paid</div>
                  <div className="print-card__amount">USD {formatCurrency(summary.total_deposited.amount)}</div>
                  <div className="print-card__count">{summary.total_deposited.count} receipt{summary.total_deposited.count !== 1 ? 's' : ''}</div>
                </div>
                <div className="print-card print-card--pending">
                  <div className="print-card__label">Total Pending</div>
                  <div className="print-card__amount">USD {formatCurrency(summary.total_pending.amount)}</div>
                  <div className="print-card__count">{summary.total_pending.count} receipt{summary.total_pending.count !== 1 ? 's' : ''}</div>
                </div>
                <div className="print-card print-card--bank">
                  <div className="print-card__label">Bank Transfer</div>
                  <div className="print-card__amount">USD {formatCurrency(summary.total_bank_transfer.amount)}</div>
                  <div className="print-card__count">{summary.total_bank_transfer.count} receipt{summary.total_bank_transfer.count !== 1 ? 's' : ''}</div>
                </div>
                <div className="print-card print-card--ebb">
                  <div className="print-card__label">EBB Deposited</div>
                  <div className="print-card__amount">USD {formatCurrency(summary.total_ebb.amount)}</div>
                  <div className="print-card__count">{summary.total_ebb.count} receipt{summary.total_ebb.count !== 1 ? 's' : ''}</div>
                </div>
              </div>

              {/* Calculation Breakdown */}
              <div className="print-breakdown">
                <table className="print-breakdown__table">
                  <tbody>
                    <tr>
                      <td className="print-breakdown__label">Paid</td>
                      <td className="print-breakdown__value">{formatCurrency(summary.total_deposited.amount)}</td>
                    </tr>
                    <tr className="print-breakdown__deduction">
                      <td className="print-breakdown__label">Less: Pending</td>
                      <td className="print-breakdown__value">({formatCurrency(summary.total_pending.amount)})</td>
                    </tr>
                    <tr className="print-breakdown__deduction">
                      <td className="print-breakdown__label">Less: Bank Transfer</td>
                      <td className="print-breakdown__value">({formatCurrency(summary.total_bank_transfer.amount)})</td>
                    </tr>
                    <tr className="print-breakdown__deduction">
                      <td className="print-breakdown__label">Less: EBB Deposits</td>
                      <td className="print-breakdown__value">({formatCurrency(summary.total_ebb.amount)})</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Safe Amount - Hero */}
              <div className="print-safe-box">
                <div className="print-safe-box__label">To Agencies Deposit Safe</div>
                <div className="print-safe-box__amount">USD {formatCurrency(summary.safe_amount)}</div>
              </div>

              {/* Paid Cash breakdown */}
              <div className="print-paid-summary">
                <span>Cash Paid Receipts: {summary.total_paid_cash.count}</span>
                <span>Amount: USD {formatCurrency(summary.total_paid_cash.amount)}</span>
              </div>

              {/* Collections for selected date */}
              {agenciesData?.collections && agenciesData.collections.count > 0 && (
                <div style={{ marginTop: '16px', border: '2px solid #0f766e', borderRadius: '8px', padding: '12px' }}>
                  <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '6px', color: '#0f766e' }}>
                    Collections ({agenciesData.collections.date_from === agenciesData.collections.date_to
                      ? agenciesData.collections.date_from
                      : `${agenciesData.collections.date_from} - ${agenciesData.collections.date_to}`}) - USD {formatCurrency(agenciesData.collections.total)}
                  </div>
                  <div style={{ fontSize: '11px', color: '#666', marginBottom: '8px' }}>
                    {agenciesData.collections.count} receipt{agenciesData.collections.count !== 1 ? 's' : ''} collected on this date
                  </div>
                  <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #ddd' }}>
                        <th style={{ textAlign: 'left', padding: '3px 4px' }}>Receipt #</th>
                        <th style={{ textAlign: 'left', padding: '3px 4px' }}>Agency</th>
                        <th style={{ textAlign: 'right', padding: '3px 4px' }}>Amount</th>
                        <th style={{ textAlign: 'left', padding: '3px 4px' }}>Issued</th>
                      </tr>
                    </thead>
                    <tbody>
                      {agenciesData.collections.details.map((c, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                          <td style={{ padding: '3px 4px', fontWeight: 600 }}>{c.receipt_number}</td>
                          <td style={{ padding: '3px 4px' }}>{c.agency_name}</td>
                          <td style={{ padding: '3px 4px', textAlign: 'right' }}>
                            {formatCurrency(c.amount)}
                            {c.issue_date < agenciesData.collections.date_from ? ' (LATE)' : ''}
                          </td>
                          <td style={{ padding: '3px 4px' }}>{c.issue_date}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Print: Agencies Report - PAGE 2+: Details */}
            {agenciesData?.details?.length > 0 && (
              <section className="print-section print-agencies-details-page">
                <h2 className="print-agencies-title">Receipt Details</h2>
                <p className="print-agencies-period">
                  Period: {formatDate(dateFrom)}{dateFrom !== dateTo ? ` - ${formatDate(dateTo)}` : ''} | {agenciesData.details.length} receipt{agenciesData.details.length !== 1 ? 's' : ''}
                </p>
                <table className="report-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Receipt No.</th>
                      <th>Agency</th>
                      <th className="text-right">Amount</th>
                      <th>Cur</th>
                      <th>Status</th>
                      <th>Category</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agenciesData.details.map((r, idx) => (
                      <tr key={idx}>
                        <td className="print-row-num">{idx + 1}</td>
                        <td style={{ fontWeight: 600 }}>{r.receipt_number}</td>
                        <td>{r.agency_name}</td>
                        <td className="amount">{formatCurrency(r.amount)}</td>
                        <td>{r.currency}</td>
                        <td>{r.status}</td>
                        <td>{r.category.toUpperCase()}</td>
                        <td>{formatDate(r.issue_date)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan="3"><strong>TOTAL ({agenciesData.details.length} receipts)</strong></td>
                      <td className="amount"><strong>USD {formatCurrency(summary.total_deposited.amount)}</strong></td>
                      <td colSpan="4"></td>
                    </tr>
                  </tfoot>
                </table>
              </section>
            )}
          </>
        )}

        {/* Print: Settlements Report */}
        {reportType === 'settlements' && reportData && (
          <>
            <section className="print-section">
              <h2 className="section-title">Sales by Station / Agent ({currency})</h2>
              {salesData && salesData.by_station_agent.length > 0 && (
                <table className="report-table">
                  <thead>
                    <tr>
                      <th>Station</th>
                      <th>Agent</th>
                      <th className="text-right">Sales</th>
                      <th className="text-right">Refunds</th>
                      <th className="text-right">Net Sales</th>
                    </tr>
                  </thead>
                  <tbody>
                    {salesData.by_station_agent.map((row, idx) => (
                      <tr key={idx}>
                        <td>{row.station_code}</td>
                        <td>{row.agent_name}</td>
                        <td className="amount">{formatCurrency(row.total_sales)}</td>
                        <td className="amount">{formatCurrency(row.total_refunds)}</td>
                        <td className="amount">{formatCurrency(row.net_sales)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan="2"><strong>TOTAL</strong></td>
                      <td className="amount"><strong>{formatCurrency(salesData.totals.sales)}</strong></td>
                      <td className="amount"><strong>{formatCurrency(salesData.totals.refunds)}</strong></td>
                      <td className="amount"><strong>{formatCurrency(salesData.totals.net)}</strong></td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </section>

            <section className="print-section">
              <h2 className="section-title">Agent Variances ({currency})</h2>
              {settlementsData && settlementsData.agent_variances.length > 0 && (
                <table className="report-table">
                  <thead>
                    <tr>
                      <th>Station</th>
                      <th>Agent</th>
                      <th className="text-right">Expected</th>
                      <th className="text-right">Declared</th>
                      <th className="text-right">Variance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {settlementsData.agent_variances.map((row, idx) => (
                      <tr key={idx}>
                        <td>{row.station_code}</td>
                        <td>{row.agent_name}</td>
                        <td className="amount">{formatCurrency(row.expected_cash)}</td>
                        <td className="amount">{row.declared_cash !== null ? formatCurrency(row.declared_cash) : '—'}</td>
                        <td className={`amount ${getVarianceClass(row.variance_status)}`}>
                          {formatCurrency(row.variance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan="2"><strong>TOTAL</strong></td>
                      <td className="amount"><strong>{formatCurrency(settlementsData.totals.expected)}</strong></td>
                      <td className="amount"><strong>{formatCurrency(settlementsData.totals.declared)}</strong></td>
                      <td className="amount"><strong>{formatCurrency(settlementsData.totals.variance)}</strong></td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </section>

            <section className="print-section">
              <h2 className="section-title">Financial Summary ({currency})</h2>
              {financialData && (
                <div className="print-financial-summary">
                  <table className="report-table financial-table">
                    <tbody>
                      <tr>
                        <td>Total Sales</td>
                        <td className="amount">{formatCurrency(financialData.revenue.sales)}</td>
                      </tr>
                      <tr className="subtotal">
                        <td><strong>Gross Revenue</strong></td>
                        <td className="amount"><strong>{formatCurrency(financialData.revenue.gross)}</strong></td>
                      </tr>
                      <tr>
                        <td>Station Expenses</td>
                        <td className="amount expense">-{formatCurrency(financialData.expenses.station)}</td>
                      </tr>
                      <tr className="subtotal">
                        <td><strong>Net Revenue</strong></td>
                        <td className="amount"><strong>{formatCurrency(financialData.net_revenue)}</strong></td>
                      </tr>
                      <tr>
                        <td colSpan="2" style={{height: '10px'}}></td>
                      </tr>
                      <tr>
                        <td>Expected Cash</td>
                        <td className="amount">{formatCurrency(financialData.cash.expected)}</td>
                      </tr>
                      <tr>
                        <td>Cash Received</td>
                        <td className="amount">{formatCurrency(financialData.cash.received)}</td>
                      </tr>
                      <tr className={`total-row ${getVarianceClass(financialData.cash.variance_status)}`}>
                        <td><strong>Cash Variance</strong></td>
                        <td className="amount"><strong>{formatCurrency(financialData.cash.variance)} {financialData.cash.variance_status}</strong></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
