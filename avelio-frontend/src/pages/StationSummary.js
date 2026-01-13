import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import './StationSummary.css';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5001/api/v1';

function StationSummary() {
  const { id } = useParams();
  const navigate = useNavigate();
  const token = localStorage.getItem('token');

  // List view state
  const [summaries, setSummaries] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');

  // Detail view state
  const [summary, setSummary] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Create modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [summaryDate, setSummaryDate] = useState(new Date().toISOString().split('T')[0]);

  // Add expense modal state
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [expenseForm, setExpenseForm] = useState({
    expense_code_id: '',
    currency: 'USD',
    amount: '',
    description: ''
  });
  const [expenseCodes, setExpenseCodes] = useState([]);

  // Action states
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Active currency tab
  const [activeCurrency, setActiveCurrency] = useState('USD');

  // Confirmation modal states
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showRemoveExpenseConfirm, setShowRemoveExpenseConfirm] = useState(false);
  const [expenseToRemove, setExpenseToRemove] = useState(null);

  // Fetch summaries list
  const fetchSummaries = useCallback(async () => {
    try {
      setListLoading(true);
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);

      const res = await fetch(`${API_BASE}/hq-settlements?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setSummaries(Array.isArray(data.data) ? data.data : []);
      } else {
        setSummaries([]);
      }
    } catch (err) {
      setError('Failed to load station summaries');
      setSummaries([]);
    } finally {
      setListLoading(false);
    }
  }, [token, statusFilter]);

  // Fetch single summary details
  const fetchSummaryDetails = useCallback(async () => {
    if (!id || id === 'undefined') return;
    try {
      setDetailLoading(true);
      const res = await fetch(`${API_BASE}/hq-settlements/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setSummary(data.data.station_summary || data.data);
        if (data.data.station_summary?.summaries?.length > 0) {
          setActiveCurrency(data.data.station_summary.summaries[0].currency);
        }
      }
    } catch (err) {
      setError('Failed to load summary details');
    } finally {
      setDetailLoading(false);
    }
  }, [id, token]);

  // Fetch expense codes
  const fetchExpenseCodes = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/hq-settlements/expense-codes`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setExpenseCodes(data.data?.expense_codes || []);
      }
    } catch (err) {
      console.error('Failed to load expense codes');
    }
  }, [token]);

  useEffect(() => {
    if (id && id !== 'undefined') {
      fetchSummaryDetails();
      fetchExpenseCodes();
    } else if (!id) {
      fetchSummaries();
    }
  }, [id, fetchSummaryDetails, fetchSummaries, fetchExpenseCodes]);

  // Create new Station Summary
  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      setActionLoading(true);
      const res = await fetch(`${API_BASE}/hq-settlements`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ summary_date: summaryDate })
      });
      const data = await res.json();
      if (data.success) {
        setShowCreateModal(false);
        navigate(`/station-summary/${data.data.station_summary?.id || data.data.id}`);
      } else {
        setError(data.message || 'Failed to create summary');
      }
    } catch (err) {
      setError('Failed to create summary');
    } finally {
      setActionLoading(false);
    }
  };

  // Add expense
  const handleAddExpense = async (e) => {
    e.preventDefault();
    try {
      setActionLoading(true);
      const res = await fetch(`${API_BASE}/hq-settlements/${id}/expenses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(expenseForm)
      });
      const data = await res.json();
      if (data.success) {
        setShowExpenseModal(false);
        setExpenseForm({ expense_code_id: '', currency: 'USD', amount: '', description: '' });
        fetchSummaryDetails();
        setSuccess('Expense added');
      } else {
        setError(data.message || 'Failed to add expense');
      }
    } catch (err) {
      setError('Failed to add expense');
    } finally {
      setActionLoading(false);
    }
  };

  // Remove expense
  const handleRemoveExpense = async () => {
    if (!expenseToRemove) return;
    try {
      setActionLoading(true);
      const res = await fetch(`${API_BASE}/hq-settlements/${id}/expenses/${expenseToRemove.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        fetchSummaryDetails();
        setSuccess('Expense removed');
      } else {
        setError(data.message || 'Failed to remove expense');
      }
    } catch (err) {
      setError('Failed to remove expense');
    } finally {
      setActionLoading(false);
      setShowRemoveExpenseConfirm(false);
      setExpenseToRemove(null);
    }
  };

  // Close summary
  const handleClose = async () => {
    try {
      setActionLoading(true);
      const res = await fetch(`${API_BASE}/hq-settlements/${id}/close`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        fetchSummaryDetails();
        setSuccess('Station Summary closed successfully');
      } else {
        setError(data.message || 'Failed to close');
      }
    } catch (err) {
      setError('Failed to close');
    } finally {
      setActionLoading(false);
      setShowCloseConfirm(false);
    }
  };

  // Delete summary
  const handleDelete = async () => {
    try {
      setActionLoading(true);
      const res = await fetch(`${API_BASE}/hq-settlements/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setShowDeleteConfirm(false);
        navigate('/station-summary');
      } else {
        setError(data.message || 'Failed to delete');
        setShowDeleteConfirm(false);
      }
    } catch (err) {
      setError('Failed to delete');
      setShowDeleteConfirm(false);
    } finally {
      setActionLoading(false);
    }
  };

  // Recalculate summary
  const handleRecalculate = async () => {
    try {
      setActionLoading(true);
      const res = await fetch(`${API_BASE}/hq-settlements/${id}/recalculate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        fetchSummaryDetails();
        setSuccess('Summary recalculated');
      } else {
        setError(data.message || 'Failed to recalculate');
      }
    } catch (err) {
      setError('Failed to recalculate');
    } finally {
      setActionLoading(false);
    }
  };

  // Clear messages after timeout
  useEffect(() => {
    if (error || success) {
      const timer = setTimeout(() => {
        setError('');
        setSuccess('');
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error, success]);

  const formatCurrency = (amount, currency) => {
    const curr = currency || 'USD';
    const value = parseFloat(amount) || 0;
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: curr,
        minimumFractionDigits: 2
      }).format(value);
    } catch (e) {
      return `${curr} ${new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(value)}`;
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const getStatusBadgeClass = (status) => {
    const classes = {
      DRAFT: 'status-draft',
      CLOSED: 'status-closed'
    };
    return classes[status] || '';
  };

  // Get currencies that have cash from stations or opening balance
  const getAvailableCurrencies = () => {
    if (!summary?.summaries || summary.summaries.length === 0) {
      return ['USD', 'SSP']; // Default fallback
    }

    // Filter currencies that have cash_from_stations > 0 or opening_balance > 0
    const availableCurrencies = summary.summaries
      .filter(s =>
        parseFloat(s.cash_from_stations || 0) > 0 ||
        parseFloat(s.opening_balance || 0) > 0
      )
      .map(s => s.currency);

    // If no currencies have cash, return all available currencies from summaries
    if (availableCurrencies.length === 0) {
      return summary.summaries.map(s => s.currency);
    }

    return availableCurrencies;
  };

  // Render list view
  if (!id || id === 'undefined') {
    return (
      <div className="station-summary-page">
        <div className="page-header">
          <div className="page-title-section">
            <h1 className="page-title">Station Summary</h1>
            <span className="page-subtitle">Daily cash consolidation from all stations</span>
          </div>
          <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
            + New Summary
          </button>
        </div>

        {error && <div className="alert alert-error">{error}</div>}
        {success && <div className="alert alert-success">{success}</div>}

        <div className="filters-bar">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="filter-select"
          >
            <option value="">All Statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="CLOSED">Closed</option>
          </select>
        </div>

        {listLoading ? (
          <div className="loading-spinner">Loading...</div>
        ) : summaries.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📊</div>
            <p>No station summaries found.</p>
            <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
              Create your first Station Summary
            </button>
          </div>
        ) : (
          <div className="summaries-grid">
            {summaries.map((s) => {
              const usdSummary = s.summaries?.find(sum => sum.currency === 'USD') || {};
              const sspSummary = s.summaries?.find(sum => sum.currency === 'SSP') || {};
              return (
                <div
                  key={s.id}
                  className="summary-card-item"
                  onClick={() => navigate(`/station-summary/${s.id}`)}
                >
                  <div className="card-header">
                    <span className="summary-date">{formatDate(s.summary_date || s.period_from)}</span>
                    <span className={`status-badge ${getStatusBadgeClass(s.status)}`}>
                      {s.status}
                    </span>
                  </div>
                  <div className="card-number">{s.settlement_number}</div>
                  <div className="card-totals">
                    <div className="total-row">
                      <span className="currency-label">USD Safe:</span>
                      <span className="total-value">{formatCurrency(usdSummary.safe_amount, 'USD')}</span>
                    </div>
                    <div className="total-row">
                      <span className="currency-label">SSP Safe:</span>
                      <span className="total-value">{formatCurrency(sspSummary.safe_amount, 'SSP')}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Create Modal */}
        {showCreateModal && (
          <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>New Station Summary</h2>
                <button className="modal-close" onClick={() => setShowCreateModal(false)}>&times;</button>
              </div>
              <form onSubmit={handleCreate}>
                <div className="form-group">
                  <label>Summary Date</label>
                  <input
                    type="date"
                    value={summaryDate}
                    onChange={(e) => setSummaryDate(e.target.value)}
                    required
                  />
                  <span className="form-hint">Select the date for this daily summary. All SUBMITTED station settlements for this date will be automatically included.</span>
                </div>
                <div className="modal-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={actionLoading}>
                    {actionLoading ? 'Creating...' : 'Create Summary'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Render detail view
  if (detailLoading || !summary) {
    return (
      <div className="station-summary-page">
        <div className="loading-spinner">Loading summary details...</div>
      </div>
    );
  }

  const currentSummary = summary.summaries?.find(s => s.currency === activeCurrency) || {};
  const isDraft = summary.status === 'DRAFT';
  const canEdit = isDraft;

  return (
    <div className="station-summary-page">
      <div className="page-header">
        <div className="header-left">
          <button className="btn btn-link" onClick={() => navigate('/station-summary')}>
            &larr; Back to List
          </button>
          <div className="header-title">
            <h1>Station Summary</h1>
            <span className="summary-number">{summary.settlement_number}</span>
          </div>
          <span className={`status-badge large ${getStatusBadgeClass(summary.status)}`}>
            {summary.status}
          </span>
        </div>
        <div className="header-actions">
          {isDraft && (
            <>
              <button className="btn btn-outline" onClick={handleRecalculate} disabled={actionLoading}>
                Recalculate
              </button>
              <button className="btn btn-primary" onClick={() => setShowCloseConfirm(true)} disabled={actionLoading}>
                Close Summary
              </button>
              <button className="btn btn-danger" onClick={() => setShowDeleteConfirm(true)} disabled={actionLoading}>
                Delete
              </button>
            </>
          )}
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <div className="summary-date-banner">
        <span className="date-label">Summary Date:</span>
        <span className="date-value">{formatDate(summary.summary_date || summary.period_from)}</span>
        <span className="created-info">Created by {summary.created_by_name || 'N/A'} on {formatDate(summary.created_at)}</span>
      </div>

      {/* Currency Tabs */}
      <div className="currency-tabs">
        {['USD', 'SSP'].map((currency) => (
          <button
            key={currency}
            className={`currency-tab ${activeCurrency === currency ? 'active' : ''}`}
            onClick={() => setActiveCurrency(currency)}
          >
            {currency}
          </button>
        ))}
      </div>

      {/* Main Summary Card */}
      <div className="main-summary-card">
        <h2 className="summary-title">{activeCurrency} Summary</h2>
        <div className="calculation-flow">
          <div className="calc-row">
            <span className="calc-label">Opening Balance</span>
            <span className="calc-note">(from previous day)</span>
            <span className="calc-value">{formatCurrency(currentSummary.opening_balance, activeCurrency)}</span>
          </div>
          <div className="calc-row add">
            <span className="calc-label">+ Cash from Stations</span>
            <span className="calc-note">({currentSummary.total_stations_count || 0} settlements)</span>
            <span className="calc-value">{formatCurrency(currentSummary.cash_from_stations, activeCurrency)}</span>
          </div>
          <div className="calc-divider"></div>
          <div className="calc-row subtotal">
            <span className="calc-label">= Total Available</span>
            <span className="calc-note"></span>
            <span className="calc-value">{formatCurrency(currentSummary.total_available, activeCurrency)}</span>
          </div>
          <div className="calc-row subtract">
            <span className="calc-label">- HQ Expenses</span>
            <span className="calc-note"></span>
            <span className="calc-value expense">{formatCurrency(currentSummary.total_hq_expenses, activeCurrency)}</span>
          </div>
          <div className="calc-divider thick"></div>
          <div className="calc-row total">
            <span className="calc-label">= TO SAFE</span>
            <span className="calc-note">(next day opening balance)</span>
            <span className="calc-value safe">{formatCurrency(currentSummary.safe_amount, activeCurrency)}</span>
          </div>
        </div>
      </div>

      {/* Station Settlements Section */}
      <div className="section">
        <div className="section-header">
          <h2>Included Station Settlements</h2>
          <span className="section-note">Auto-included based on SUBMITTED status for {formatDate(summary.summary_date || summary.period_from)}</span>
        </div>

        {summary.station_settlements?.length === 0 ? (
          <div className="empty-state small">
            <p>No SUBMITTED station settlements for this date.</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Settlement #</th>
                <th>Station</th>
                <th>Cash ({activeCurrency})</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {summary.station_settlements?.map((ss) => {
                const ssSummary = ss.summaries?.find(s => s.currency === activeCurrency) || {};
                return (
                  <tr key={ss.id}>
                    <td className="settlement-number">{ss.settlement_number}</td>
                    <td>{ss.station_name}</td>
                    <td>{formatCurrency(ssSummary.actual_cash_received, activeCurrency)}</td>
                    <td>
                      <span className="status-badge status-submitted">
                        {ss.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* HQ Expenses Section */}
      <div className="section">
        <div className="section-header">
          <h2>HQ Expenses</h2>
          {canEdit && (
            <button className="btn btn-primary" onClick={() => {
              const availableCurrencies = getAvailableCurrencies();
              setExpenseForm(prev => ({ ...prev, currency: availableCurrencies[0] || 'USD' }));
              setShowExpenseModal(true);
            }}>
              + Add Expense
            </button>
          )}
        </div>

        {summary.expenses?.filter(e => e.currency === activeCurrency).length === 0 ? (
          <div className="empty-state small">
            <p>No HQ expenses for {activeCurrency}.</p>
            {canEdit && (
              <button className="btn btn-outline" onClick={() => {
                const availableCurrencies = getAvailableCurrencies();
                setExpenseForm(prev => ({ ...prev, currency: availableCurrencies[0] || 'USD' }));
                setShowExpenseModal(true);
              }}>
                Add Expense
              </button>
            )}
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Expense Code</th>
                <th>Description</th>
                <th>Amount</th>
                <th>Added By</th>
                {canEdit && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {summary.expenses?.filter(e => e.currency === activeCurrency).map((exp) => (
                <tr key={exp.id}>
                  <td>{exp.expense_name || exp.expense_code}</td>
                  <td>{exp.description || '-'}</td>
                  <td className="expense-amount">{formatCurrency(exp.amount, activeCurrency)}</td>
                  <td>{exp.created_by_name || 'N/A'}</td>
                  {canEdit && (
                    <td>
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => {
                          setExpenseToRemove(exp);
                          setShowRemoveExpenseConfirm(true);
                        }}
                        disabled={actionLoading}
                      >
                        Remove
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Expense Modal */}
      {showExpenseModal && (
        <div className="modal-overlay" onClick={() => setShowExpenseModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add HQ Expense</h2>
              <button className="modal-close" onClick={() => setShowExpenseModal(false)}>&times;</button>
            </div>
            <form onSubmit={handleAddExpense}>
              <div className="form-group">
                <label>Expense Code</label>
                <select
                  value={expenseForm.expense_code_id}
                  onChange={(e) => setExpenseForm({ ...expenseForm, expense_code_id: e.target.value })}
                  required
                >
                  <option value="">Select expense code...</option>
                  {expenseCodes.map((ec) => (
                    <option key={ec.id} value={ec.id}>{ec.name} ({ec.code})</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Currency</label>
                <select
                  value={expenseForm.currency}
                  onChange={(e) => setExpenseForm({ ...expenseForm, currency: e.target.value })}
                  required
                >
                  {getAvailableCurrencies().map((curr) => (
                    <option key={curr} value={curr}>{curr}</option>
                  ))}
                </select>
                {getAvailableCurrencies().length === 1 && (
                  <span className="form-hint">Only {getAvailableCurrencies()[0]} has cash from stations</span>
                )}
              </div>
              <div className="form-group">
                <label>Amount</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={expenseForm.amount}
                  onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Description (Optional)</label>
                <textarea
                  value={expenseForm.description}
                  onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
                  rows="3"
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowExpenseModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={actionLoading}>
                  {actionLoading ? 'Adding...' : 'Add Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Close Summary Confirmation Modal */}
      {showCloseConfirm && (
        <div className="modal-overlay" onClick={() => setShowCloseConfirm(false)}>
          <div className="modal-content confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Close Station Summary</h2>
              <button className="modal-close" onClick={() => setShowCloseConfirm(false)}>&times;</button>
            </div>
            <div className="confirm-body">
              <div className="confirm-icon warning">!</div>
              <p className="confirm-message">
                Are you sure you want to close this Station Summary?
              </p>
              <p className="confirm-note">
                The safe amounts will be locked and used as the opening balance for the next day. This action cannot be undone.
              </p>
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowCloseConfirm(false)} disabled={actionLoading}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleClose} disabled={actionLoading}>
                {actionLoading ? 'Closing...' : 'Yes, Close Summary'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Summary Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="modal-overlay" onClick={() => setShowDeleteConfirm(false)}>
          <div className="modal-content confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Delete Station Summary</h2>
              <button className="modal-close" onClick={() => setShowDeleteConfirm(false)}>&times;</button>
            </div>
            <div className="confirm-body">
              <div className="confirm-icon danger">!</div>
              <p className="confirm-message">
                Are you sure you want to delete this Station Summary?
              </p>
              <p className="confirm-note">
                This will permanently remove the summary and all associated expenses. This action cannot be undone.
              </p>
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowDeleteConfirm(false)} disabled={actionLoading}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={handleDelete} disabled={actionLoading}>
                {actionLoading ? 'Deleting...' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove Expense Confirmation Modal */}
      {showRemoveExpenseConfirm && expenseToRemove && (
        <div className="modal-overlay" onClick={() => { setShowRemoveExpenseConfirm(false); setExpenseToRemove(null); }}>
          <div className="modal-content confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Remove Expense</h2>
              <button className="modal-close" onClick={() => { setShowRemoveExpenseConfirm(false); setExpenseToRemove(null); }}>&times;</button>
            </div>
            <div className="confirm-body">
              <div className="confirm-icon warning">!</div>
              <p className="confirm-message">
                Are you sure you want to remove this expense?
              </p>
              <div className="confirm-details">
                <div className="detail-row">
                  <span className="detail-label">Expense:</span>
                  <span className="detail-value">{expenseToRemove.expense_name || expenseToRemove.expense_code}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Amount:</span>
                  <span className="detail-value">{formatCurrency(expenseToRemove.amount, expenseToRemove.currency)}</span>
                </div>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => { setShowRemoveExpenseConfirm(false); setExpenseToRemove(null); }} disabled={actionLoading}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={handleRemoveExpense} disabled={actionLoading}>
                {actionLoading ? 'Removing...' : 'Yes, Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default StationSummary;
