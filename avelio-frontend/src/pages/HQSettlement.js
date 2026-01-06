import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import './HQSettlement.css';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5001/api/v1';

function HQSettlement() {
  const { id } = useParams();
  const navigate = useNavigate();
  const token = localStorage.getItem('token');
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  // List view state
  const [hqSettlements, setHqSettlements] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');

  // Detail view state
  const [settlement, setSettlement] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [availableStations, setAvailableStations] = useState([]);

  // Create modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    period_from: new Date().toISOString().split('T')[0],
    period_to: new Date().toISOString().split('T')[0]
  });

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

  // Fetch HQ settlements list
  const fetchHQSettlements = useCallback(async () => {
    try {
      setListLoading(true);
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);

      const res = await fetch(`${API_BASE}/hq-settlements?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setHqSettlements(Array.isArray(data.data) ? data.data : []);
      } else {
        setHqSettlements([]);
      }
    } catch (err) {
      setError('Failed to load HQ settlements');
      setHqSettlements([]);
    } finally {
      setListLoading(false);
    }
  }, [token, statusFilter]);

  // Fetch single HQ settlement details
  const fetchSettlementDetails = useCallback(async () => {
    if (!id || id === 'undefined') return;
    try {
      setDetailLoading(true);
      const res = await fetch(`${API_BASE}/hq-settlements/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setSettlement(data.data);
        // Set active currency to first summary currency
        if (data.data.summaries?.length > 0) {
          setActiveCurrency(data.data.summaries[0].currency);
        }
      }
    } catch (err) {
      setError('Failed to load settlement details');
    } finally {
      setDetailLoading(false);
    }
  }, [id, token]);

  // Fetch available station settlements
  const fetchAvailableStations = useCallback(async () => {
    if (!id || id === 'undefined' || !settlement) return;
    try {
      const res = await fetch(`${API_BASE}/hq-settlements/${id}/available-stations`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setAvailableStations(data.data || []);
      }
    } catch (err) {
      console.error('Failed to load available stations');
    }
  }, [id, token, settlement]);

  // Fetch expense codes
  const fetchExpenseCodes = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/expense-codes`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setExpenseCodes(data.data || []);
      }
    } catch (err) {
      console.error('Failed to load expense codes');
    }
  }, [token]);

  useEffect(() => {
    if (id && id !== 'undefined') {
      fetchSettlementDetails();
      fetchExpenseCodes();
    } else if (!id) {
      fetchHQSettlements();
    }
  }, [id, fetchSettlementDetails, fetchHQSettlements, fetchExpenseCodes]);

  useEffect(() => {
    if (settlement && settlement.status === 'DRAFT') {
      fetchAvailableStations();
    }
  }, [settlement, fetchAvailableStations]);

  // Create new HQ settlement
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
        body: JSON.stringify(createForm)
      });
      const data = await res.json();
      if (data.success) {
        setShowCreateModal(false);
        navigate(`/hq-settlement/${data.data.id}`);
      } else {
        setError(data.message || 'Failed to create settlement');
      }
    } catch (err) {
      setError('Failed to create settlement');
    } finally {
      setActionLoading(false);
    }
  };

  // Add station settlement
  const handleAddStation = async (stationSettlementId) => {
    try {
      setActionLoading(true);
      const res = await fetch(`${API_BASE}/hq-settlements/${id}/stations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ station_settlement_id: stationSettlementId })
      });
      const data = await res.json();
      if (data.success) {
        fetchSettlementDetails();
        fetchAvailableStations();
        setSuccess('Station settlement added');
      } else {
        setError(data.message || 'Failed to add station');
      }
    } catch (err) {
      setError('Failed to add station');
    } finally {
      setActionLoading(false);
    }
  };

  // Remove station settlement
  const handleRemoveStation = async (stationSettlementId) => {
    if (!window.confirm('Remove this station settlement?')) return;
    try {
      setActionLoading(true);
      const res = await fetch(`${API_BASE}/hq-settlements/${id}/stations/${stationSettlementId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        fetchSettlementDetails();
        fetchAvailableStations();
        setSuccess('Station settlement removed');
      } else {
        setError(data.message || 'Failed to remove station');
      }
    } catch (err) {
      setError('Failed to remove station');
    } finally {
      setActionLoading(false);
    }
  };

  // Add HQ expense
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
        fetchSettlementDetails();
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

  // Remove HQ expense
  const handleRemoveExpense = async (expenseId) => {
    if (!window.confirm('Remove this expense?')) return;
    try {
      setActionLoading(true);
      const res = await fetch(`${API_BASE}/hq-settlements/${id}/expenses/${expenseId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        fetchSettlementDetails();
        setSuccess('Expense removed');
      } else {
        setError(data.message || 'Failed to remove expense');
      }
    } catch (err) {
      setError('Failed to remove expense');
    } finally {
      setActionLoading(false);
    }
  };

  // Submit for review
  const handleSubmit = async () => {
    if (!window.confirm('Submit this HQ settlement for review?')) return;
    try {
      setActionLoading(true);
      const res = await fetch(`${API_BASE}/hq-settlements/${id}/submit`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        fetchSettlementDetails();
        setSuccess('Settlement submitted for review');
      } else {
        setError(data.message || 'Failed to submit');
      }
    } catch (err) {
      setError('Failed to submit');
    } finally {
      setActionLoading(false);
    }
  };

  // Approve settlement
  const handleApprove = async () => {
    const notes = window.prompt('Approval notes (optional):');
    if (notes === null) return;
    try {
      setActionLoading(true);
      const res = await fetch(`${API_BASE}/hq-settlements/${id}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ approval_notes: notes })
      });
      const data = await res.json();
      if (data.success) {
        fetchSettlementDetails();
        setSuccess('Settlement approved');
      } else {
        setError(data.message || 'Failed to approve');
      }
    } catch (err) {
      setError('Failed to approve');
    } finally {
      setActionLoading(false);
    }
  };

  // Reject settlement
  const handleReject = async () => {
    const reason = window.prompt('Rejection reason:');
    if (!reason) return;
    try {
      setActionLoading(true);
      const res = await fetch(`${API_BASE}/hq-settlements/${id}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ rejection_reason: reason })
      });
      const data = await res.json();
      if (data.success) {
        fetchSettlementDetails();
        setSuccess('Settlement rejected');
      } else {
        setError(data.message || 'Failed to reject');
      }
    } catch (err) {
      setError('Failed to reject');
    } finally {
      setActionLoading(false);
    }
  };

  // Close settlement
  const handleClose = async () => {
    if (!window.confirm('Close this settlement? This action cannot be undone.')) return;
    try {
      setActionLoading(true);
      const res = await fetch(`${API_BASE}/hq-settlements/${id}/close`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        fetchSettlementDetails();
        setSuccess('Settlement closed');
      } else {
        setError(data.message || 'Failed to close');
      }
    } catch (err) {
      setError('Failed to close');
    } finally {
      setActionLoading(false);
    }
  };

  // Delete settlement
  const handleDelete = async () => {
    if (!window.confirm('Delete this HQ settlement? This cannot be undone.')) return;
    try {
      setActionLoading(true);
      const res = await fetch(`${API_BASE}/hq-settlements/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        navigate('/hq-settlement');
      } else {
        setError(data.message || 'Failed to delete');
      }
    } catch (err) {
      setError('Failed to delete');
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
    const value = amount || 0;
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: curr,
        minimumFractionDigits: 2
      }).format(value);
    } catch (e) {
      // Fallback for unsupported currencies like SSP
      return `${curr} ${new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(value)}`;
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString();
  };

  const getStatusBadgeClass = (status) => {
    const classes = {
      DRAFT: 'status-draft',
      REVIEW: 'status-review',
      APPROVED: 'status-approved',
      REJECTED: 'status-rejected',
      CLOSED: 'status-closed'
    };
    return classes[status] || '';
  };

  // Render list view
  if (!id || id === 'undefined') {
    return (
      <div className="hq-settlement-page">
        <div className="page-header">
          <h1>HQ Settlements</h1>
          <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
            + New HQ Settlement
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
            <option value="REVIEW">In Review</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
            <option value="CLOSED">Closed</option>
          </select>
        </div>

        {listLoading ? (
          <div className="loading-spinner">Loading...</div>
        ) : hqSettlements.length === 0 ? (
          <div className="empty-state">
            <p>No HQ settlements found.</p>
            <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
              Create your first HQ Settlement
            </button>
          </div>
        ) : (
          <div className="settlements-table-container">
            <table className="settlements-table">
              <thead>
                <tr>
                  <th>Settlement #</th>
                  <th>Period</th>
                  <th>Stations</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {hqSettlements.map((s) => (
                  <tr key={s.id}>
                    <td className="settlement-number">{s.settlement_number}</td>
                    <td>{formatDate(s.period_from)} - {formatDate(s.period_to)}</td>
                    <td>{s.stations_count || s.station_count || 0}</td>
                    <td>
                      <span className={`status-badge ${getStatusBadgeClass(s.status)}`}>
                        {s.status}
                      </span>
                    </td>
                    <td>{formatDate(s.created_at)}</td>
                    <td>
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => navigate(`/hq-settlement/${s.id}`)}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Create Modal */}
        {showCreateModal && (
          <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>New HQ Settlement</h2>
                <button className="modal-close" onClick={() => setShowCreateModal(false)}>&times;</button>
              </div>
              <form onSubmit={handleCreate}>
                <div className="form-group">
                  <label>Period From</label>
                  <input
                    type="date"
                    value={createForm.period_from}
                    onChange={(e) => setCreateForm({ ...createForm, period_from: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Period To</label>
                  <input
                    type="date"
                    value={createForm.period_to}
                    onChange={(e) => setCreateForm({ ...createForm, period_to: e.target.value })}
                    required
                  />
                </div>
                <div className="modal-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={actionLoading}>
                    {actionLoading ? 'Creating...' : 'Create Settlement'}
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
  if (detailLoading || !settlement) {
    return (
      <div className="hq-settlement-page">
        <div className="loading-spinner">Loading settlement details...</div>
      </div>
    );
  }

  const currentSummary = settlement.summaries?.find(s => s.currency === activeCurrency) || {};
  const isDraft = settlement.status === 'DRAFT';
  const isReview = settlement.status === 'REVIEW';
  const isApproved = settlement.status === 'APPROVED';
  const canEdit = isDraft;
  const canApprove = isReview && user.role === 'admin';
  const canClose = isApproved && user.role === 'admin';

  return (
    <div className="hq-settlement-page">
      <div className="page-header">
        <div className="header-left">
          <button className="btn btn-link" onClick={() => navigate('/hq-settlement')}>
            &larr; Back to List
          </button>
          <h1>HQ Settlement: {settlement.settlement_number}</h1>
          <span className={`status-badge ${getStatusBadgeClass(settlement.status)}`}>
            {settlement.status}
          </span>
        </div>
        <div className="header-actions">
          {isDraft && (
            <>
              <button className="btn btn-primary" onClick={handleSubmit} disabled={actionLoading}>
                Submit for Review
              </button>
              <button className="btn btn-danger" onClick={handleDelete} disabled={actionLoading}>
                Delete
              </button>
            </>
          )}
          {canApprove && (
            <>
              <button className="btn btn-success" onClick={handleApprove} disabled={actionLoading}>
                Approve
              </button>
              <button className="btn btn-danger" onClick={handleReject} disabled={actionLoading}>
                Reject
              </button>
            </>
          )}
          {canClose && (
            <button className="btn btn-primary" onClick={handleClose} disabled={actionLoading}>
              Close Settlement
            </button>
          )}
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <div className="settlement-info">
        <div className="info-card">
          <span className="label">Period</span>
          <span className="value">{formatDate(settlement.period_from)} - {formatDate(settlement.period_to)}</span>
        </div>
        <div className="info-card">
          <span className="label">Created By</span>
          <span className="value">{settlement.created_by_name || 'N/A'}</span>
        </div>
        <div className="info-card">
          <span className="label">Created At</span>
          <span className="value">{formatDate(settlement.created_at)}</span>
        </div>
        {settlement.submitted_at && (
          <div className="info-card">
            <span className="label">Submitted</span>
            <span className="value">{formatDate(settlement.submitted_at)}</span>
          </div>
        )}
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

      {/* Summary Section */}
      <div className="summary-section">
        <h2>Consolidated Summary ({activeCurrency})</h2>
        <div className="summary-grid">
          <div className="summary-item">
            <span className="label">Total Stations</span>
            <span className="value">{currentSummary.total_stations_count || 0}</span>
          </div>
          <div className="summary-item">
            <span className="label">Station Expected Cash</span>
            <span className="value">{formatCurrency(currentSummary.total_station_expected_cash, activeCurrency)}</span>
          </div>
          <div className="summary-item">
            <span className="label">Station Actual Cash</span>
            <span className="value">{formatCurrency(currentSummary.total_station_actual_cash, activeCurrency)}</span>
          </div>
          <div className="summary-item">
            <span className="label">Station Expenses</span>
            <span className="value expense">{formatCurrency(currentSummary.total_station_expenses, activeCurrency)}</span>
          </div>
          <div className="summary-item">
            <span className="label">Station Net Cash</span>
            <span className="value">{formatCurrency(currentSummary.total_station_net_cash, activeCurrency)}</span>
          </div>
          <div className="summary-item highlight">
            <span className="label">HQ Expenses</span>
            <span className="value expense">{formatCurrency(currentSummary.total_hq_expenses, activeCurrency)}</span>
          </div>
          <div className="summary-item grand">
            <span className="label">Grand Net Cash</span>
            <span className="value">{formatCurrency(currentSummary.grand_net_cash, activeCurrency)}</span>
          </div>
          <div className="summary-item">
            <span className="label">Variance Status</span>
            <span className={`value variance-${(currentSummary.variance_status || 'pending').toLowerCase()}`}>
              {currentSummary.variance_status || 'PENDING'}
            </span>
          </div>
        </div>
      </div>

      {/* Station Settlements Section */}
      <div className="section">
        <div className="section-header">
          <h2>Included Station Settlements</h2>
        </div>

        {settlement.station_settlements?.length === 0 ? (
          <div className="empty-state">No station settlements included yet.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Settlement #</th>
                <th>Station</th>
                <th>Period</th>
                <th>Expected Cash</th>
                <th>Actual Cash</th>
                <th>Net Cash</th>
                <th>Status</th>
                {canEdit && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {settlement.station_settlements?.map((ss) => (
                <tr key={ss.id}>
                  <td>{ss.settlement_number}</td>
                  <td>{ss.station_name}</td>
                  <td>{formatDate(ss.period_from)} - {formatDate(ss.period_to)}</td>
                  <td>{formatCurrency(ss.expected_cash, activeCurrency)}</td>
                  <td>{formatCurrency(ss.actual_cash, activeCurrency)}</td>
                  <td>{formatCurrency(ss.net_cash, activeCurrency)}</td>
                  <td>
                    <span className={`status-badge ${getStatusBadgeClass(ss.status)}`}>
                      {ss.status}
                    </span>
                  </td>
                  {canEdit && (
                    <td>
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => handleRemoveStation(ss.id)}
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

        {/* Available Stations */}
        {canEdit && availableStations.length > 0 && (
          <div className="available-stations">
            <h3>Available Station Settlements</h3>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Settlement #</th>
                  <th>Station</th>
                  <th>Period</th>
                  <th>Net Cash</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {availableStations.map((as) => (
                  <tr key={as.id}>
                    <td>{as.settlement_number}</td>
                    <td>{as.station_name}</td>
                    <td>{formatDate(as.period_from)} - {formatDate(as.period_to)}</td>
                    <td>{formatCurrency(as.net_cash, activeCurrency)}</td>
                    <td>
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={() => handleAddStation(as.id)}
                        disabled={actionLoading}
                      >
                        Add
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* HQ Expenses Section */}
      <div className="section">
        <div className="section-header">
          <h2>HQ Expenses</h2>
          {canEdit && (
            <button className="btn btn-primary" onClick={() => setShowExpenseModal(true)}>
              + Add Expense
            </button>
          )}
        </div>

        {settlement.expenses?.filter(e => e.currency === activeCurrency).length === 0 ? (
          <div className="empty-state">No HQ expenses for {activeCurrency}.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Expense Code</th>
                <th>Description</th>
                <th>Amount</th>
                <th>Added By</th>
                <th>Date</th>
                {canEdit && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {settlement.expenses?.filter(e => e.currency === activeCurrency).map((exp) => (
                <tr key={exp.id}>
                  <td>{exp.expense_code_name || exp.expense_code_id}</td>
                  <td>{exp.description || '-'}</td>
                  <td className="expense-amount">{formatCurrency(exp.amount, activeCurrency)}</td>
                  <td>{exp.created_by_name || 'N/A'}</td>
                  <td>{formatDate(exp.created_at)}</td>
                  {canEdit && (
                    <td>
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => handleRemoveExpense(exp.id)}
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
                  <option value="USD">USD</option>
                  <option value="SSP">SSP</option>
                </select>
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
    </div>
  );
}

export default HQSettlement;
