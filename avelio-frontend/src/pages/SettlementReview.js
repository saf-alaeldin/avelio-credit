import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import './StationSettlementUnified.css';

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

  const token = localStorage.getItem('token') || sessionStorage.getItem('token');
  const user = JSON.parse(localStorage.getItem('user') || '{}');

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

  // Approve settlement
  const handleApprove = async (withVariance = false) => {
    if (!window.confirm(`Approve this settlement${withVariance ? ' with variance' : ''}?`)) return;

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
    return new Date(date).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const hasVariance = summaries.some(s => s.variance_status !== 'BALANCED');

  if (loading) {
    return <div className="settlement-page"><div className="settlement-loading">Loading settlement...</div></div>;
  }

  if (!settlement) {
    return <div className="settlement-page"><div className="settlement-error">Settlement not found</div></div>;
  }

  if (settlement.status !== 'REVIEW') {
    return (
      <div className="settlement-page">
        <div className="settlement-error">
          This settlement is not pending review. Current status: {settlement.status}
        </div>
        <button className="btn-secondary" onClick={() => navigate('/settlements')}>
          Back to Settlements
        </button>
      </div>
    );
  }

  return (
    <div className="settlement-page">
      {/* Header */}
      <div className="settlement-header">
        <div>
          <h2 className="settlement-title">Review Settlement</h2>
          <p className="settlement-subtitle">
            {settlement.settlement_number} | {settlement.station_code} - {settlement.station_name}
          </p>
          <p className="settlement-subtitle">
            Period: {formatDate(settlement.period_from)} to {formatDate(settlement.period_to)}
          </p>
          <p className="settlement-subtitle">
            Submitted by: {settlement.submitted_by_name} on {formatDate(settlement.submitted_at)}
          </p>
        </div>
        <div className="header-actions">
          <span className="status-badge status-review">Pending Review</span>
        </div>
      </div>

      {error && <div className="settlement-error">{error}</div>}
      {success && <div className="settlement-success">{success}</div>}

      {/* Currency Tabs */}
      <div className="currency-tabs">
        {availableCurrencies.map(currency => (
          <button
            key={currency}
            className={`currency-tab ${activeCurrency === currency ? 'active' : ''}`}
            onClick={() => setActiveCurrency(currency)}
          >
            {currency}
          </button>
        ))}
      </div>

      {/* Summary Card - Prominent */}
      <div className="settlement-card summary-card">
        <h3>Settlement Summary ({activeCurrency})</h3>
        <div className="summary-grid">
          <div className="summary-row">
            <span>Opening Balance (prior variance):</span>
            <span className="amount">{formatCurrency(currentSummary.opening_balance)}</span>
          </div>
          <div className="summary-row">
            <span>Expected Cash (this period):</span>
            <span className="amount">{formatCurrency(currentSummary.expected_cash)}</span>
          </div>
          <div className="summary-row">
            <span>Less: Expenses:</span>
            <span className="amount">-{formatCurrency(currentSummary.total_expenses)}</span>
          </div>
          <div className="summary-row highlight">
            <span>Expected Net Cash:</span>
            <span className="amount">{formatCurrency(currentSummary.expected_net_cash)}</span>
          </div>
          <div className="summary-divider"></div>
          <div className="summary-row">
            <span>Cash Sent:</span>
            <span className="amount">{formatCurrency(currentSummary.actual_cash_received)}</span>
          </div>
          <div className={`summary-row final-variance ${currentSummary.variance_status?.toLowerCase()}`}>
            <span>FINAL VARIANCE:</span>
            <span className="amount">
              {formatCurrency(currentSummary.final_variance)}
              <span className={`variance-badge ${currentSummary.variance_status?.toLowerCase()}`}>
                {currentSummary.variance_status || 'Pending'}
              </span>
            </span>
          </div>
        </div>
      </div>

      {/* Agent Cash Table */}
      <div className="settlement-card">
        <h3>Agent Breakdown ({activeCurrency})</h3>
        <table className="agent-table">
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
                  <span className="agent-code">{entry.agent_code}</span>
                  <span className="agent-name">{entry.agent_name}</span>
                </td>
                <td className="text-right amount">{formatCurrency(entry.expected_cash)}</td>
                <td className="text-right amount">{formatCurrency(entry.declared_cash)}</td>
                <td className={`text-right amount ${entry.variance < 0 ? 'variance-short' : entry.variance > 0 ? 'variance-extra' : ''}`}>
                  {formatCurrency(entry.variance)}
                </td>
                <td>
                  <span className={`variance-badge ${entry.variance_status?.toLowerCase()}`}>
                    {entry.variance_status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Expenses Table */}
      <div className="settlement-card">
        <h3>Expenses ({activeCurrency})</h3>
        <table className="expenses-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Description</th>
              <th className="text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {filteredExpenses.length === 0 ? (
              <tr><td colSpan="4" className="empty-row">No expenses</td></tr>
            ) : (
              filteredExpenses.map(expense => (
                <tr key={expense.id}>
                  <td className="expense-code">{expense.expense_code}</td>
                  <td>{expense.expense_name}</td>
                  <td className="expense-desc">{expense.description || '-'}</td>
                  <td className="text-right amount">{formatCurrency(expense.amount)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Approval Actions */}
      <div className="settlement-card">
        <h3>Review Decision</h3>

        <div className="form-group">
          <label>Notes (optional)</label>
          <textarea
            className="approval-notes"
            value={approvalNotes}
            onChange={(e) => setApprovalNotes(e.target.value)}
            placeholder="Add any notes about this approval..."
            rows={3}
          />
        </div>

        <div className="approval-actions">
          {!hasVariance ? (
            <button
              className="btn-approve"
              onClick={() => handleApprove(false)}
              disabled={processing}
            >
              {processing ? 'Processing...' : 'Approve (Balanced)'}
            </button>
          ) : (
            <button
              className="btn-approve-variance"
              onClick={() => handleApprove(true)}
              disabled={processing}
            >
              {processing ? 'Processing...' : 'Approve with Variance'}
            </button>
          )}

          <button
            className="btn-reject"
            onClick={() => setShowRejectForm(!showRejectForm)}
            disabled={processing}
          >
            Reject
          </button>

          <button
            className="btn-secondary"
            onClick={() => navigate('/settlements')}
            disabled={processing}
          >
            Cancel
          </button>
        </div>

        {showRejectForm && (
          <div className="reject-form">
            <div className="form-group">
              <label>Rejection Reason *</label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Explain why this settlement is being rejected..."
                rows={3}
                required
              />
            </div>
            <div className="form-actions">
              <button className="btn-secondary" onClick={() => setShowRejectForm(false)}>
                Cancel
              </button>
              <button className="btn-reject-confirm" onClick={handleReject} disabled={processing}>
                {processing ? 'Processing...' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
