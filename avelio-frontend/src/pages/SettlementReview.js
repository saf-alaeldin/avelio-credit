import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getApiBaseUrl } from '../services/api';
import './StationSettlementSimple.css';

const API_BASE = getApiBaseUrl();

export default function SettlementReview() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [settlement, setSettlement] = useState(null);
  const [agentEntries, setAgentEntries] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [summaries, setSummaries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [processing, setProcessing] = useState(false);

  // Currency tab
  const [activeCurrency, setActiveCurrency] = useState('USD');

  // Approval/Rejection form
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [approvalNotes, setApprovalNotes] = useState('');

  // Confirmation modal
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [confirmTitle, setConfirmTitle] = useState('');
  const [confirmMessage, setConfirmMessage] = useState('');
  const [confirmType, setConfirmType] = useState('primary'); // primary, success, danger

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
  const isAuditor = userRole === 'auditor';
  // Fetch settlement details
  const fetchSettlement = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/settlements/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) throw new Error('Failed to fetch settlement');

      const data = await res.json();
      const s = data.data?.settlement;

      setSettlement(s);
      setAgentEntries(s?.agent_entries || []);
      setExpenses(s?.expenses || []);
      setSummaries(s?.summaries || []);

      if (s?.summaries?.length > 0) {
        setActiveCurrency(s.summaries[0].currency);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id, token]);

  useEffect(() => {
    fetchSettlement();
  }, [fetchSettlement]);

  // Show confirmation modal
  const showConfirmation = (title, message, action, type = 'primary') => {
    setConfirmTitle(title);
    setConfirmMessage(message);
    setConfirmAction(() => action);
    setConfirmType(type);
    setShowConfirmModal(true);
  };

  // Handle confirmation
  const handleConfirm = async () => {
    setShowConfirmModal(false);
    if (confirmAction) {
      await confirmAction();
    }
  };

  // Request approval confirmation
  const requestApproval = (withVariance = false) => {
    showConfirmation(
      withVariance ? 'Approve with Variance' : 'Approve Settlement',
      withVariance
        ? 'This settlement has a variance. Are you sure you want to approve it with the recorded variance?'
        : 'Are you sure you want to approve this settlement? This action cannot be undone.',
      () => executeApproval(withVariance),
      'success'
    );
  };

  // Execute approval
  const executeApproval = async (withVariance = false) => {
    try {
      setProcessing(true);
      setError('');

      const res = await fetch(`${API_BASE}/settlements/${id}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          approval_type: withVariance ? 'APPROVED_WITH_VARIANCE' : 'BALANCED',
          approval_notes: approvalNotes
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Failed to approve settlement');
      }

      setSuccess('Settlement approved successfully');
      setTimeout(() => navigate('/settlements'), 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setProcessing(false);
    }
  };

  // Reject settlement
  const handleReject = async () => {
    if (!rejectionReason.trim()) {
      setError('Rejection reason is required');
      return;
    }

    try {
      setProcessing(true);
      setError('');

      const res = await fetch(`${API_BASE}/settlements/${id}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ rejection_reason: rejectionReason })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Failed to reject settlement');
      }

      setSuccess('Settlement rejected and returned to draft');
      setTimeout(() => navigate('/settlements'), 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setProcessing(false);
    }
  };

  // Filter by currency
  const filteredAgentEntries = agentEntries.filter(e => e.currency === activeCurrency);
  const filteredExpenses = expenses.filter(e => e.currency === activeCurrency);
  const currentSummary = summaries.find(s => s.currency === activeCurrency) || {};

  const availableCurrencies = [...new Set(summaries.map(s => s.currency))];
  if (availableCurrencies.length === 0) availableCurrencies.push('USD', 'SSP');

  const formatCurrency = (amount) => {
    return Number(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formatDate = (date) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const hasVariance = summaries.some(s => s.variance_status !== 'BALANCED');

  // Get variance class
  const getVarianceClass = (status) => {
    switch (status) {
      case 'BALANCED': return 'balanced';
      case 'SHORT': return 'short';
      case 'EXTRA': return 'extra';
      default: return '';
    }
  };

  if (loading) {
    return (
      <div className="settlement-simple">
        <div className="simple-loading">
          <div className="spinner"></div>
          <p>Loading settlement...</p>
        </div>
      </div>
    );
  }

  if (!settlement) {
    return (
      <div className="settlement-simple">
        <div className="simple-message error">Settlement not found</div>
        <button className="simple-btn simple-btn-secondary" onClick={() => navigate('/settlements')}>
          Back to Settlements
        </button>
      </div>
    );
  }

  // Non-auditors can only access settlements in REVIEW status
  if (!isAuditor && settlement.status !== 'REVIEW') {
    return (
      <div className="settlement-simple">
        <div className="simple-message error">
          This settlement is not pending review. Current status: {settlement.status}
        </div>
        <button className="simple-btn simple-btn-secondary" onClick={() => navigate('/settlements')}>
          Back to Settlements
        </button>
      </div>
    );
  }

  return (
    <div className="settlement-simple">
      {/* Header */}
      <header className="simple-header">
        <div>
          <h1>{isAuditor ? 'View Settlement' : 'Review Settlement'}</h1>
          <p>{settlement.settlement_number} | {settlement.station_code} - {settlement.station_name}</p>
        </div>
        <span className={`status-badge ${settlement.status?.toLowerCase()}`}>{settlement.status}</span>
      </header>

      {/* Settlement Info */}
      <section className="simple-section setup-section">
        <div className="setup-grid">
          <div className="setup-field">
            <label className="simple-label">Period</label>
            <div style={{ fontSize: '16px', fontWeight: '500' }}>
              {formatDate(settlement.period_from)} - {formatDate(settlement.period_to)}
            </div>
          </div>
          <div className="setup-field">
            <label className="simple-label">Submitted By</label>
            <div style={{ fontSize: '16px' }}>
              {settlement.submitted_by_name || 'Unknown'}
            </div>
          </div>
          <div className="setup-field">
            <label className="simple-label">Submitted On</label>
            <div style={{ fontSize: '16px' }}>
              {formatDate(settlement.submitted_at)}
            </div>
          </div>
          <div className="setup-field">
            <label className="simple-label">Currency</label>
            <div className="currency-toggle">
              {availableCurrencies.map(currency => (
                <button
                  key={currency}
                  className={`currency-pill ${activeCurrency === currency ? 'active' : ''}`}
                  onClick={() => setActiveCurrency(currency)}
                >
                  {currency}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Messages */}
      {error && <div className="simple-message error">{error}</div>}
      {success && <div className="simple-message success">{success}</div>}

      {/* Settlement Summary Card */}
      <section className="simple-section">
        <h2 className="simple-section-header">Settlement Summary ({activeCurrency})</h2>
        <div className="summary-breakdown">
          <div className="summary-row">
            <span className="label">Opening Balance (prior variance)</span>
            <span className="note"></span>
            <span className="amount">{formatCurrency(currentSummary.opening_balance)}</span>
          </div>
          <div className="summary-row">
            <span className="label">Expected Cash (this period)</span>
            <span className="note"></span>
            <span className="amount">{formatCurrency(currentSummary.expected_cash)}</span>
          </div>
          <div className="summary-row highlight-subtract">
            <span className="label">Less: Expenses</span>
            <span className="note"></span>
            <span className="amount">-{formatCurrency(currentSummary.total_expenses)}</span>
          </div>
          <div className="summary-divider"></div>
          <div className="summary-row subtotal">
            <span className="label">Expected Net Cash</span>
            <span className="note"></span>
            <span className="amount">{formatCurrency(currentSummary.expected_net_cash)}</span>
          </div>
          <div className="summary-divider"></div>
          <div className="summary-row">
            <span className="label">Cash Sent</span>
            <span className="note"></span>
            <span className="amount">{formatCurrency(currentSummary.actual_cash_received)}</span>
          </div>
          <div className="summary-divider thick"></div>
          <div className="summary-row total">
            <span className="label">FINAL VARIANCE</span>
            <span className="note"></span>
            <span className={`amount ${getVarianceClass(currentSummary.variance_status)}`}>
              {formatCurrency(currentSummary.final_variance)}
              <span className={`status-badge ${currentSummary.variance_status?.toLowerCase()}`} style={{ marginLeft: '12px' }}>
                {currentSummary.variance_status || 'Pending'}
              </span>
            </span>
          </div>
        </div>
      </section>

      {/* Agent Breakdown */}
      {filteredAgentEntries.length > 0 && (
        <section className="simple-section">
          <h2 className="simple-section-header">Agent Breakdown ({activeCurrency})</h2>
          <table className="simple-table">
            <thead>
              <tr>
                <th>Agent</th>
                <th className="text-right">Expected Cash</th>
                <th className="text-right">Cash Sent</th>
                <th className="text-right">Variance</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredAgentEntries.map(entry => (
                <tr key={entry.id}>
                  <td>
                    <strong>{entry.agent_code || '-'}</strong>
                    <span style={{ color: '#64748b', marginLeft: '8px' }}>{entry.agent_name || 'Station Total'}</span>
                  </td>
                  <td className="text-right amount">{formatCurrency(entry.expected_cash)}</td>
                  <td className="text-right amount">{formatCurrency(entry.declared_cash)}</td>
                  <td className={`text-right amount ${getVarianceClass(entry.variance_status)}`}>
                    {formatCurrency(entry.variance)}
                  </td>
                  <td>
                    <span className={`status-badge ${entry.variance_status?.toLowerCase()}`}>
                      {entry.variance_status || 'Pending'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Expenses */}
      <section className="simple-section">
        <h2 className="simple-section-header">Expenses ({activeCurrency})</h2>
        {filteredExpenses.length === 0 ? (
          <div className="empty-state">
            <p>No expenses recorded for this settlement.</p>
          </div>
        ) : (
          <table className="simple-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Description</th>
                <th className="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {filteredExpenses.map(expense => (
                <tr key={expense.id}>
                  <td><strong>{expense.expense_code}</strong></td>
                  <td>{expense.expense_name}</td>
                  <td style={{ color: '#64748b' }}>{expense.description || '-'}</td>
                  <td className="text-right amount">{formatCurrency(expense.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan="3"><strong>Total Expenses</strong></td>
                <td className="text-right amount"><strong>{formatCurrency(currentSummary.total_expenses)}</strong></td>
              </tr>
            </tfoot>
          </table>
        )}
      </section>

      {/* Review Decision - Only for admin/manager, not auditors */}
      {!isAuditor && settlement.status === 'REVIEW' && (
        <section className="simple-section">
          <h2 className="simple-section-header">Review Decision</h2>

          <div style={{ marginBottom: '16px' }}>
            <label className="simple-label">Notes (optional)</label>
            <textarea
              className="simple-input"
              value={approvalNotes}
              onChange={(e) => setApprovalNotes(e.target.value)}
              placeholder="Add any notes about this approval..."
              rows={3}
              style={{ width: '100%', resize: 'vertical' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
            {!hasVariance ? (
              <button
                className="simple-btn simple-btn-success"
                onClick={() => requestApproval(false)}
                disabled={processing}
              >
                {processing ? 'Processing...' : 'Approve (Balanced)'}
              </button>
            ) : (
              <button
                className="simple-btn simple-btn-primary"
                onClick={() => requestApproval(true)}
                disabled={processing}
              >
                {processing ? 'Processing...' : 'Approve with Variance'}
              </button>
            )}

            <button
              className="simple-btn simple-btn-danger"
              onClick={() => setShowRejectForm(!showRejectForm)}
              disabled={processing}
            >
              Reject
            </button>

            <button
              className="simple-btn simple-btn-secondary"
              onClick={() => navigate('/settlements')}
              disabled={processing}
            >
              Cancel
            </button>
          </div>

          {showRejectForm && (
            <div style={{ background: '#fef2f2', padding: '16px', borderRadius: '12px', marginTop: '16px' }}>
              <div style={{ marginBottom: '12px' }}>
                <label className="simple-label" style={{ color: '#991b1b' }}>Rejection Reason *</label>
                <textarea
                  className="simple-input"
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Explain why this settlement is being rejected..."
                  rows={3}
                  style={{ width: '100%', resize: 'vertical', borderColor: '#fca5a5' }}
                  required
                />
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  className="simple-btn simple-btn-secondary"
                  onClick={() => setShowRejectForm(false)}
                >
                  Cancel
                </button>
                <button
                  className="simple-btn simple-btn-danger"
                  onClick={handleReject}
                  disabled={processing}
                >
                  {processing ? 'Processing...' : 'Confirm Rejection'}
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Back button for auditors */}
      {isAuditor && (
        <section className="simple-section">
          <button
            className="simple-btn simple-btn-secondary"
            onClick={() => navigate('/settlements')}
          >
            Back to Settlements
          </button>
        </section>
      )}

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="modal-overlay" onClick={() => setShowConfirmModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{confirmTitle}</h3>
            </div>
            <div className="modal-body">
              <p>{confirmMessage}</p>
            </div>
            <div className="modal-footer">
              <button
                className="simple-btn simple-btn-secondary"
                onClick={() => setShowConfirmModal(false)}
              >
                Cancel
              </button>
              <button
                className={`simple-btn simple-btn-${confirmType}`}
                onClick={handleConfirm}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
