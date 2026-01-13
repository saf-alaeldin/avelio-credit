import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import ModernDatePicker from '../components/ModernDatePicker';
import './StationSettlementSimple.css'; // Reuse the same elderly-friendly styles

// API URL helper
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

export default function StationSummarySimple() {
  const navigate = useNavigate();

  // Token
  const token = localStorage.getItem('token') || sessionStorage.getItem('token');

  // Loading and messages
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  // Date selection - default to today
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [activeCurrency, setActiveCurrency] = useState('USD');

  // Summary data
  const [summary, setSummary] = useState(null);
  const [stationSettlements, setStationSettlements] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [summaries, setSummaries] = useState([]);
  const [expenseCodes, setExpenseCodes] = useState([]);

  // New expense form (inline, no modal)
  const [newExpense, setNewExpense] = useState({
    expense_code_id: '',
    amount: '',
    description: ''
  });

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
      console.error('Failed to load expense codes:', err);
    }
  }, [token]);

  // Fetch or create summary for selected date
  const fetchSummary = useCallback(async () => {
    if (!selectedDate) return;

    try {
      setLoading(true);
      setError('');

      console.log('Fetching summary for date:', selectedDate);
      console.log('API URL:', `${API_BASE}/hq-settlements/by-date?date=${selectedDate}`);

      const res = await fetch(`${API_BASE}/hq-settlements/by-date?date=${selectedDate}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      console.log('Response status:', res.status);

      const data = await res.json();
      console.log('Response data:', data);

      if (!res.ok) {
        throw new Error(data.message || `Failed to load summary (${res.status})`);
      }

      if (data.success) {
        const s = data.data?.station_summary;
        setSummary(s);
        setStationSettlements(s?.station_settlements || []);
        setExpenses(s?.expenses || []);
        setSummaries(s?.summaries || []);

        if (data.is_new) {
          setSuccess('Summary created for this date');
          setTimeout(() => setSuccess(''), 3000);
        }
      }
    } catch (err) {
      console.error('Fetch error:', err);
      setError(err.message || 'Failed to load summary');
    } finally {
      setLoading(false);
    }
  }, [selectedDate, token]);

  // Initial load
  useEffect(() => {
    fetchExpenseCodes();
  }, [fetchExpenseCodes]);

  // Fetch when date changes
  useEffect(() => {
    if (selectedDate) {
      fetchSummary();
    }
  }, [selectedDate, fetchSummary]);

  // Get current summary for active currency
  const currentSummary = useMemo(() =>
    summaries.find(s => s.currency === activeCurrency) || {},
    [summaries, activeCurrency]
  );

  // Filter expenses by currency
  const filteredExpenses = useMemo(() =>
    expenses.filter(e => e.currency === activeCurrency),
    [expenses, activeCurrency]
  );

  // Filter station settlements that have data for this currency
  const filteredStationSettlements = useMemo(() => {
    return stationSettlements.filter(ss => {
      const ssSummary = ss.summaries?.find(s => s.currency === activeCurrency);
      return ssSummary && parseFloat(ssSummary.actual_cash_received || 0) > 0;
    });
  }, [stationSettlements, activeCurrency]);

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

  // Add expense handler
  const handleAddExpense = async () => {
    setError('');

    if (!newExpense.expense_code_id) {
      setError('Please select an expense type');
      return;
    }
    if (!newExpense.amount || parseFloat(newExpense.amount) <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    if (!summary?.id) {
      setError('No summary loaded');
      return;
    }

    try {
      setSaving(true);
      const res = await fetch(`${API_BASE}/hq-settlements/${summary.id}/expenses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          expense_code_id: newExpense.expense_code_id,
          currency: activeCurrency,
          amount: parseFloat(newExpense.amount),
          description: newExpense.description
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to add expense');
      }

      // Refresh to get updated totals
      await fetchSummary();

      // Reset form
      setNewExpense({
        expense_code_id: '',
        amount: '',
        description: ''
      });

      setSuccess('Expense added');
      setTimeout(() => setSuccess(''), 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Delete expense handler
  const handleDeleteExpense = async (expenseId) => {
    if (!window.confirm('Delete this expense?')) return;

    try {
      const res = await fetch(`${API_BASE}/hq-settlements/${summary.id}/expenses/${expenseId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) {
        throw new Error('Failed to delete expense');
      }

      // Refresh to get updated totals
      await fetchSummary();

      setSuccess('Expense deleted');
      setTimeout(() => setSuccess(''), 2000);
    } catch (err) {
      setError(err.message);
    }
  };

  // Close summary handler
  const handleClose = async () => {
    if (!window.confirm('Close this summary? The safe amounts will be locked and used as opening balance for the next day.')) {
      return;
    }

    try {
      setSaving(true);
      const res = await fetch(`${API_BASE}/hq-settlements/${summary.id}/close`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to close summary');
      }

      await fetchSummary();
      setSuccess('Summary closed successfully');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Status helpers
  const isDraft = summary?.status === 'DRAFT';
  const canEdit = isDraft;

  // Loading state
  if (loading && !summary) {
    return (
      <div className="settlement-simple">
        <div className="simple-loading">
          <div className="spinner"></div>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="settlement-simple">
      {/* Header */}
      <header className="simple-header">
        <h1>Station Summary</h1>
        <p>Daily cash from all stations</p>
      </header>

      {/* Messages */}
      {error && (
        <div className="simple-message error">
          {error}
        </div>
      )}
      {success && (
        <div className="simple-message success">
          {success}
        </div>
      )}

      {/* Date Selection */}
      <section className="simple-section setup-section">
        <div className="setup-grid">
          <div className="setup-field">
            <label className="simple-label">Summary Date</label>
            <ModernDatePicker
              selected={selectedDate}
              onChange={setSelectedDate}
              placeholder="Select summary date"
            />
          </div>

          <div className="setup-field">
            <label className="simple-label">Currency</label>
            <div className="currency-toggle">
              <button
                className={`currency-pill ${activeCurrency === 'USD' ? 'active' : ''}`}
                onClick={() => setActiveCurrency('USD')}
              >
                USD
              </button>
              <button
                className={`currency-pill ${activeCurrency === 'SSP' ? 'active' : ''}`}
                onClick={() => setActiveCurrency('SSP')}
              >
                SSP
              </button>
            </div>
          </div>

          {summary && (
            <div className="setup-field">
              <label className="simple-label">Status</label>
              <span className={`status-badge ${summary.status?.toLowerCase()}`}>
                {summary.status}
              </span>
            </div>
          )}
        </div>
      </section>

      {/* Summary Card */}
      {summary && (
        <section className="simple-section">
          <h2 className="simple-section-header">
            {activeCurrency} Summary
          </h2>

          <div className="summary-breakdown">
            <div className="summary-row">
              <span className="label">Opening Balance</span>
              <span className="note">(from previous day)</span>
              <span className="amount">{formatCurrency(currentSummary.opening_balance)}</span>
            </div>
            <div className="summary-row highlight-add">
              <span className="label">+ Cash from Stations</span>
              <span className="note">({currentSummary.total_stations_count || 0} settlements)</span>
              <span className="amount">{formatCurrency(currentSummary.cash_from_stations)}</span>
            </div>
            <div className="summary-divider"></div>
            <div className="summary-row subtotal">
              <span className="label">= Total Available</span>
              <span className="note"></span>
              <span className="amount">{formatCurrency(currentSummary.total_available)}</span>
            </div>
            <div className="summary-row highlight-subtract">
              <span className="label">- HQ Expenses</span>
              <span className="note"></span>
              <span className="amount expense">-{formatCurrency(currentSummary.total_hq_expenses)}</span>
            </div>
            <div className="summary-divider thick"></div>
            <div className="summary-row total">
              <span className="label">= TO SAFE</span>
              <span className="note">(next day opening)</span>
              <span className="amount safe">{activeCurrency} {formatCurrency(currentSummary.safe_amount)}</span>
            </div>
          </div>
        </section>
      )}

      {/* Station Settlements */}
      <section className="simple-section">
        <h2 className="simple-section-header">
          Cash from Stations ({activeCurrency})
        </h2>

        {filteredStationSettlements.length === 0 ? (
          <div className="empty-state">
            <p>No submitted settlements for this date with {activeCurrency} cash.</p>
          </div>
        ) : (
          <table className="simple-table">
            <thead>
              <tr>
                <th>Settlement #</th>
                <th>Station</th>
                <th className="text-right">Cash Received</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredStationSettlements.map(ss => {
                const ssSummary = ss.summaries?.find(s => s.currency === activeCurrency) || {};
                return (
                  <tr key={ss.id}>
                    <td>{ss.settlement_number}</td>
                    <td>{ss.station_name}</td>
                    <td className="amount">{formatCurrency(ssSummary.actual_cash_received)}</td>
                    <td>
                      <span className={`status-badge ${ss.status?.toLowerCase()}`}>
                        {ss.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan="2"><strong>Total</strong></td>
                <td className="amount"><strong>{formatCurrency(currentSummary.cash_from_stations)}</strong></td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        )}
      </section>

      {/* HQ Expenses Section */}
      <section className="simple-section">
        <h2 className="simple-section-header">
          HQ Expenses ({activeCurrency})
        </h2>

        {/* Inline Add Form */}
        {canEdit && (
          <div className="inline-form">
            <div className="form-field">
              <label>Type</label>
              <select
                className="simple-select"
                value={newExpense.expense_code_id}
                onChange={(e) => setNewExpense(prev => ({ ...prev, expense_code_id: e.target.value }))}
              >
                <option value="">Select Type</option>
                {expenseCodes
                  .filter(ec => ec.currencies_allowed?.includes(activeCurrency) || !ec.currencies_allowed)
                  .map(ec => (
                    <option key={ec.id} value={ec.id}>{ec.name}</option>
                  ))}
              </select>
            </div>
            <div className="form-field small">
              <label>Amount</label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="simple-input"
                placeholder="0.00"
                value={newExpense.amount}
                onChange={(e) => setNewExpense(prev => ({ ...prev, amount: e.target.value }))}
              />
            </div>
            <div className="form-field">
              <label>Note (optional)</label>
              <input
                type="text"
                className="simple-input"
                placeholder="Optional note"
                value={newExpense.description}
                onChange={(e) => setNewExpense(prev => ({ ...prev, description: e.target.value }))}
              />
            </div>
            <button
              className="simple-btn simple-btn-primary"
              onClick={handleAddExpense}
              disabled={saving}
            >
              + Add
            </button>
          </div>
        )}

        {/* Expenses List */}
        {filteredExpenses.length === 0 ? (
          <div className="empty-state">
            <p>No HQ expenses added yet.</p>
          </div>
        ) : (
          <ul className="expenses-list">
            {filteredExpenses.map(expense => (
              <li key={expense.id} className="expense-item">
                <div className="expense-name">
                  {expense.expense_name || expense.expense_code}
                  {expense.description && (
                    <div className="expense-desc">{expense.description}</div>
                  )}
                </div>
                <span className="expense-amount">-{formatCurrency(expense.amount)}</span>
                {canEdit && (
                  <button
                    className="simple-btn simple-btn-danger simple-btn-small"
                    onClick={() => handleDeleteExpense(expense.id)}
                  >
                    Delete
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Sticky Summary Footer */}
      <footer className="sticky-summary">
        <div className="sticky-summary-content">
          <div className="summary-numbers">
            <div className="summary-item">
              <span className="label">Opening</span>
              <span className="value">{formatCurrency(currentSummary.opening_balance)}</span>
            </div>
            <div className="summary-item">
              <span className="label">+ Stations</span>
              <span className="value">{formatCurrency(currentSummary.cash_from_stations)}</span>
            </div>
            <div className="summary-item">
              <span className="label">- Expenses</span>
              <span className="value">-{formatCurrency(currentSummary.total_hq_expenses)}</span>
            </div>
            <div className="summary-divider"></div>
            <div className="summary-item highlight">
              <span className="label">TO SAFE</span>
              <span className="value">{activeCurrency} {formatCurrency(currentSummary.safe_amount)}</span>
            </div>
          </div>

          <div className="summary-actions">
            {isDraft ? (
              <button
                className="simple-btn simple-btn-success"
                onClick={handleClose}
                disabled={saving}
              >
                {saving ? 'Closing...' : 'Close Summary'}
              </button>
            ) : (
              <span className="status-badge closed">CLOSED</span>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
