import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getApiBaseUrl } from '../services/api';
import './StationSettlementSimple.css';

const API_BASE = getApiBaseUrl();

export default function SettlementsList() {
  const navigate = useNavigate();
  const token = localStorage.getItem('token') || sessionStorage.getItem('token');

  // Get user role from token
  const getUserRole = () => {
    if (!token) return null;
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      const payload = JSON.parse(atob(parts[1]));
      return payload?.role || null;
    } catch {
      return null;
    }
  };
  const userRole = getUserRole();
  const isAdmin = userRole === 'admin';
  const isManager = userRole === 'manager';
  const isAuditor = userRole === 'auditor';
  const isAdminOrManager = isAdmin || isManager;

  // State
  const [settlements, setSettlements] = useState([]);
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [statusFilter, setStatusFilter] = useState('');
  const [stationFilter, setStationFilter] = useState('');
  const [currencyFilter, setCurrencyFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;

  // Fetch stations for filter dropdown
  const fetchStations = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/stations?active_only=true`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setStations(data.data?.stations || data.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch stations:', err);
    }
  }, [token]);

  // Fetch settlements
  const fetchSettlements = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      let url = `${API_BASE}/settlements?page=${page}&pageSize=${pageSize}`;
      if (statusFilter) url += `&status=${statusFilter}`;
      if (stationFilter) url += `&station_id=${stationFilter}`;
      if (currencyFilter) url += `&currency=${currencyFilter}`;
      if (dateFrom) url += `&date_from=${dateFrom}`;
      if (dateTo) url += `&date_to=${dateTo}`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) throw new Error('Failed to fetch settlements');

      const data = await res.json();
      setSettlements(data.data?.settlements || []);
      setTotal(data.total || 0);
      setTotalPages(Math.ceil((data.total || 0) / pageSize));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token, page, statusFilter, stationFilter, currencyFilter, dateFrom, dateTo]);

  // Initial load
  useEffect(() => {
    fetchStations();
  }, [fetchStations]);

  // Fetch settlements when filters change
  useEffect(() => {
    fetchSettlements();
  }, [fetchSettlements]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [statusFilter, stationFilter, currencyFilter, dateFrom, dateTo]);

  // Format helpers
  const formatDate = (date) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'Africa/Juba'
    });
  };

  const formatCurrency = (amount) => {
    return Number(amount || 0).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  // Get status badge class (lowercase to match CSS)
  const getStatusClass = (status) => {
    switch (status) {
      case 'DRAFT': return 'draft';
      case 'REVIEW': return 'review';
      case 'APPROVED': return 'approved';
      case 'APPROVED_WITH_VARIANCE': return 'approved_with_variance';
      case 'CLOSED': return 'closed';
      case 'REJECTED': return 'rejected';
      default: return '';
    }
  };

  // Get variance status class
  const getVarianceClass = (status) => {
    switch (status) {
      case 'BALANCED': return 'balanced';
      case 'SHORT': return 'short';
      case 'EXTRA': return 'extra';
      default: return 'pending';
    }
  };

  // Handle row click
  const handleRowClick = (settlement) => {
    // Auditors always go to review page (view-only)
    if (isAuditor) {
      navigate(`/settlements/${settlement.id}/review`);
    } else if (settlement.status === 'REVIEW' && isAdminOrManager) {
      navigate(`/settlements/${settlement.id}/review`);
    } else {
      navigate(`/station-settlement/${settlement.id}`);
    }
  };

  // Get primary summary (filtered currency, or USD preferred, then first available)
  const getPrimarySummary = (summaries) => {
    if (!summaries || summaries.length === 0) return null;
    // If currency filter is active, show that currency
    if (currencyFilter) {
      return summaries.find(s => s.currency === currencyFilter) || null;
    }
    // Default: prefer USD, then first available
    return summaries.find(s => s.currency === 'USD') || summaries[0];
  };

  return (
    <div className="settlement-simple">
      {/* Header */}
      <header className="simple-header" style={{ textAlign: 'left' }}>
        <div>
          <h1>Settlements</h1>
          <p>View and manage all station settlements</p>
        </div>
      </header>

      {/* Filters */}
      <section className="simple-section">
        <div className="setup-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
          <div className="setup-field">
            <label className="simple-label">Status</label>
            <select
              className="simple-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All Statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="REVIEW">Pending Review</option>
              <option value="APPROVED">Approved</option>
              <option value="CLOSED">Closed</option>
            </select>
          </div>

          <div className="setup-field">
            <label className="simple-label">Station</label>
            <select
              className="simple-select"
              value={stationFilter}
              onChange={(e) => setStationFilter(e.target.value)}
            >
              <option value="">All Stations</option>
              {stations.map(s => (
                <option key={s.id} value={s.id}>
                  {s.station_code} - {s.station_name}
                </option>
              ))}
            </select>
          </div>

          <div className="setup-field">
            <label className="simple-label">Currency</label>
            <select
              className="simple-select"
              value={currencyFilter}
              onChange={(e) => setCurrencyFilter(e.target.value)}
            >
              <option value="">All Currencies</option>
              <option value="USD">USD</option>
              <option value="SSP">SSP</option>
            </select>
          </div>

          <div className="setup-field">
            <label className="simple-label">From Date</label>
            <input
              type="date"
              className="simple-input"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </div>

          <div className="setup-field">
            <label className="simple-label">To Date</label>
            <input
              type="date"
              className="simple-input"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>

          <div className="setup-field">
            <label className="simple-label">&nbsp;</label>
            <button
              className="simple-btn simple-btn-secondary"
              onClick={() => {
                setStatusFilter('');
                setStationFilter('');
                setCurrencyFilter('');
                setDateFrom('');
                setDateTo('');
              }}
              style={{ width: '100%' }}
            >
              Clear Filters
            </button>
          </div>
        </div>
      </section>

      {/* Error message */}
      {error && (
        <div className="simple-message error">
          {error}
        </div>
      )}

      {/* Settlements Table */}
      <section className="simple-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 className="simple-section-header" style={{ margin: 0 }}>
            {total} Settlement{total !== 1 ? 's' : ''} Found
          </h2>
          <button
            className="simple-btn simple-btn-secondary"
            onClick={fetchSettlements}
            disabled={loading}
            style={{ padding: '8px 16px', fontSize: '14px' }}
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>

        {loading ? (
          <div className="simple-loading">
            <div className="spinner"></div>
            <p>Loading settlements...</p>
          </div>
        ) : settlements.length === 0 ? (
          <div className="empty-state">
            <p>No settlements found matching your filters.</p>
          </div>
        ) : (
          <>
            <table className="simple-table">
              <thead>
                <tr>
                  <th>Settlement #</th>
                  <th>Station</th>
                  <th>Period</th>
                  <th>Status</th>
                  <th className="text-right">Expected {currencyFilter && `(${currencyFilter})`}</th>
                  <th className="text-right">Cash Sent {currencyFilter && `(${currencyFilter})`}</th>
                  <th className="text-right">Variance</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {settlements.map(settlement => {
                  const summary = getPrimarySummary(settlement.summaries);
                  return (
                    <tr
                      key={settlement.id}
                      onClick={() => handleRowClick(settlement)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td>
                        <strong>{settlement.settlement_number}</strong>
                      </td>
                      <td>
                        <span className="station-code">{settlement.station_code}</span>
                        <span style={{ color: '#64748b', marginLeft: '8px' }}>{settlement.station_name}</span>
                      </td>
                      <td>
                        {formatDate(settlement.period_from)}
                        {settlement.period_from !== settlement.period_to && (
                          <> - {formatDate(settlement.period_to)}</>
                        )}
                      </td>
                      <td>
                        <span className={`status-badge ${getStatusClass(settlement.status)}`}>
                          {settlement.status === 'APPROVED_WITH_VARIANCE' ? 'APPROVED*' : settlement.status}
                        </span>
                      </td>
                      <td className="text-right amount">
                        {summary ? formatCurrency(summary.expected_net_cash) : '-'}
                      </td>
                      <td className="text-right amount">
                        {summary ? formatCurrency(summary.actual_cash_received) : '-'}
                      </td>
                      <td className="text-right">
                        {summary ? (
                          <span className={getVarianceClass(summary.variance_status)}>
                            {formatCurrency(summary.final_variance)}
                          </span>
                        ) : '-'}
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        {/* Auditors can only view, not edit or review */}
                        {isAuditor ? (
                          <button
                            className="simple-btn simple-btn-secondary simple-btn-small"
                            onClick={() => navigate(`/settlements/${settlement.id}/review`)}
                          >
                            View
                          </button>
                        ) : (
                          <>
                            {settlement.status === 'REVIEW' && isAdminOrManager && (
                              <button
                                className="simple-btn simple-btn-primary simple-btn-small"
                                onClick={() => navigate(`/settlements/${settlement.id}/review`)}
                              >
                                Review
                              </button>
                            )}
                            {settlement.status === 'DRAFT' && (
                              <button
                                className="simple-btn simple-btn-secondary simple-btn-small"
                                onClick={() => navigate(`/station-settlement/${settlement.id}`)}
                              >
                                Edit
                              </button>
                            )}
                            {(settlement.status === 'APPROVED' || settlement.status === 'CLOSED' || settlement.status === 'APPROVED_WITH_VARIANCE') && (
                              <button
                                className="simple-btn simple-btn-secondary simple-btn-small"
                                onClick={() => navigate(`/station-settlement/${settlement.id}`)}
                              >
                                View
                              </button>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px', marginTop: '24px' }}>
                <button
                  className="simple-btn simple-btn-secondary"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  Previous
                </button>
                <span style={{ color: '#64748b' }}>
                  Page {page} of {totalPages}
                </span>
                <button
                  className="simple-btn simple-btn-secondary"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </section>

      {/* Quick Stats */}
      {isAdminOrManager && (
        <section className="simple-section" style={{ marginTop: '24px' }}>
          <h2 className="simple-section-header">Quick Filters</h2>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <button
              className={`simple-btn ${statusFilter === 'REVIEW' ? 'simple-btn-primary' : 'simple-btn-secondary'}`}
              onClick={() => setStatusFilter(statusFilter === 'REVIEW' ? '' : 'REVIEW')}
            >
              Pending Review
            </button>
            <button
              className={`simple-btn ${statusFilter === 'DRAFT' ? 'simple-btn-primary' : 'simple-btn-secondary'}`}
              onClick={() => setStatusFilter(statusFilter === 'DRAFT' ? '' : 'DRAFT')}
            >
              Drafts
            </button>
            <button
              className={`simple-btn ${statusFilter === 'APPROVED' ? 'simple-btn-primary' : 'simple-btn-secondary'}`}
              onClick={() => setStatusFilter(statusFilter === 'APPROVED' ? '' : 'APPROVED')}
            >
              Approved
            </button>
          </div>
        </section>
      )}

    </div>
  );
}
