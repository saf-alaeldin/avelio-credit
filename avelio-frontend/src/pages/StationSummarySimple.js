import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getApiBaseUrl } from '../services/api';
import ModernDatePicker from '../components/ModernDatePicker';
import FormattedCurrencyInput from '../components/FormattedCurrencyInput';
import './StationSettlementSimple.css'; // Reuse the same elderly-friendly styles

const API_BASE = getApiBaseUrl();

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
  const [income, setIncome] = useState([]);
  const [summaries, setSummaries] = useState([]);
  const [expenseCodes, setExpenseCodes] = useState([]);

  // Agencies deposit (previous day collections)
  const [agenciesDeposit, setAgenciesDeposit] = useState(null);

  // New expense form (inline, no modal)
  const [newExpense, setNewExpense] = useState({
    expense_code_id: '',
    amount: '',
    description: ''
  });

  // Income type options
  const incomeTypes = ['Commission Refund', 'US Dollar Purchase', 'Other'];

  // New income form (inline, no modal)
  const [newIncome, setNewIncome] = useState({
    item_name: '',
    custom_item_name: '',
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
        setIncome(s?.income || []);
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

  // Fetch previous day's agency collections
  const fetchAgenciesDeposit = useCallback(async () => {
    if (!selectedDate) return;
    try {
      // Get previous day
      const d = new Date(selectedDate + 'T00:00:00');
      d.setDate(d.getDate() - 1);
      const prevDate = d.toISOString().split('T')[0];

      const res = await fetch(`${API_BASE}/reports/agencies?date_from=${prevDate}&date_to=${prevDate}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setAgenciesDeposit({
          date: prevDate,
          collections: data.data.collections,
        });
      }
    } catch (err) {
      console.error('Failed to load agencies deposit:', err);
    }
  }, [selectedDate, token]);

  // Fetch when date changes
  useEffect(() => {
    if (selectedDate) {
      fetchSummary();
      fetchAgenciesDeposit();
    }
  }, [selectedDate, fetchSummary, fetchAgenciesDeposit]);

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

  // Filter income by currency
  const filteredIncome = useMemo(() =>
    income.filter(i => i.currency === activeCurrency),
    [income, activeCurrency]
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
      year: 'numeric',
      timeZone: 'Africa/Juba'
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

  // Add income handler
  const handleAddIncome = async () => {
    setError('');

    if (!newIncome.item_name) {
      setError('Please select an income type');
      return;
    }
    const itemName = newIncome.item_name === 'Other'
      ? newIncome.custom_item_name.trim()
      : newIncome.item_name;

    if (!itemName) {
      setError('Please enter the income item name');
      return;
    }
    if (!newIncome.amount || parseFloat(newIncome.amount) <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    if (!summary?.id) {
      setError('No summary loaded');
      return;
    }

    try {
      setSaving(true);
      const res = await fetch(`${API_BASE}/hq-settlements/${summary.id}/income`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          item_name: itemName,
          currency: activeCurrency,
          amount: parseFloat(newIncome.amount),
          description: newIncome.description
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to add income');
      }

      // Refresh to get updated totals
      await fetchSummary();

      // Reset form
      setNewIncome({
        item_name: '',
        custom_item_name: '',
        amount: '',
        description: ''
      });

      setSuccess('Income added');
      setTimeout(() => setSuccess(''), 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Delete income handler
  const handleDeleteIncome = async (incomeId) => {
    if (!window.confirm('Delete this income?')) return;

    try {
      const res = await fetch(`${API_BASE}/hq-settlements/${summary.id}/income/${incomeId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) {
        throw new Error('Failed to delete income');
      }

      // Refresh to get updated totals
      await fetchSummary();

      setSuccess('Income deleted');
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

  // Format current date for print footer
  const printDate = new Date().toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Juba'
  });

  return (
    <div className="settlement-simple" data-print-date={printDate}>
      {/* Header */}
      <header className="simple-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1>Station Summary</h1>
            <p>Daily cash from all stations - {formatDate(selectedDate)}</p>
          </div>
          <button
            className="simple-btn simple-btn-primary no-print"
            onClick={() => window.print()}
            style={{ whiteSpace: 'nowrap' }}
          >
            Print
          </button>
        </div>
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
            {parseFloat(currentSummary.total_hq_income || 0) > 0 && (
              <div className="summary-row highlight-add">
                <span className="label">+ HQ Income</span>
                <span className="note"></span>
                <span className="amount">+{formatCurrency(currentSummary.total_hq_income)}</span>
              </div>
            )}
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

      {/* Agencies Deposit - Previous Day Collections */}
      {agenciesDeposit && agenciesDeposit.collections && (
        <section className="simple-section">
          <h2 className="simple-section-header">
            Agencies Deposit — {formatDate(agenciesDeposit.date)}
          </h2>

          {agenciesDeposit.collections.count === 0 ? (
            <div className="empty-state">
              <p>No agency collections on {formatDate(agenciesDeposit.date)}.</p>
            </div>
          ) : (
            <>
              <div style={{
                background: 'linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)',
                color: 'white',
                borderRadius: '10px',
                padding: '14px 18px',
                marginBottom: '12px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div>
                  <div style={{ fontSize: '13px', opacity: 0.9 }}>Total Collections</div>
                  <div style={{ fontSize: '22px', fontWeight: 800 }}>USD {formatCurrency(agenciesDeposit.collections.total)}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '24px', fontWeight: 700 }}>{agenciesDeposit.collections.count}</div>
                  <div style={{ fontSize: '12px', opacity: 0.85 }}>receipt{agenciesDeposit.collections.count !== 1 ? 's' : ''}</div>
                </div>
              </div>

              <table className="simple-table">
                <thead>
                  <tr>
                    <th>Receipt #</th>
                    <th>Agency</th>
                    <th className="text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {agenciesDeposit.collections.details.map((item, idx) => (
                    <tr key={idx}>
                      <td>{item.receipt_number}</td>
                      <td>{item.agency_name}</td>
                      <td className="amount">{formatCurrency(item.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan="2"><strong>Total</strong></td>
                    <td className="amount"><strong>USD {formatCurrency(agenciesDeposit.collections.total)}</strong></td>
                  </tr>
                </tfoot>
              </table>
            </>
          )}
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

      {/* HQ Income Section */}
      <section className="simple-section">
        <h2 className="simple-section-header">
          HQ Income ({activeCurrency})
        </h2>

        {/* Inline Add Form */}
        {canEdit && (
          <div className="inline-form">
            <div className="form-field">
              <label>Type</label>
              <select
                className="simple-select"
                value={newIncome.item_name}
                onChange={(e) => setNewIncome(prev => ({ ...prev, item_name: e.target.value, custom_item_name: '' }))}
              >
                <option value="">Select Type</option>
                {incomeTypes.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
            {newIncome.item_name === 'Other' && (
              <div className="form-field">
                <label>Item Name</label>
                <input
                  type="text"
                  className="simple-input"
                  placeholder="Enter item name"
                  value={newIncome.custom_item_name}
                  onChange={(e) => setNewIncome(prev => ({ ...prev, custom_item_name: e.target.value }))}
                />
              </div>
            )}
            <div className="form-field small">
              <label>Amount</label>
              <FormattedCurrencyInput
                className="simple-input"
                placeholder="0.00"
                value={newIncome.amount}
                onChange={(val) => setNewIncome(prev => ({ ...prev, amount: val }))}
                currency={activeCurrency}
                showWords={true}
              />
            </div>
            <div className="form-field">
              <label>Note (optional)</label>
              <input
                type="text"
                className="simple-input"
                placeholder="Optional note"
                value={newIncome.description}
                onChange={(e) => setNewIncome(prev => ({ ...prev, description: e.target.value }))}
              />
            </div>
            <button
              className="simple-btn simple-btn-primary"
              onClick={handleAddIncome}
              disabled={saving}
            >
              + Add
            </button>
          </div>
        )}

        {/* Income List */}
        {filteredIncome.length === 0 ? (
          <div className="empty-state">
            <p>No HQ income added yet.</p>
          </div>
        ) : (
          <ul className="expenses-list">
            {filteredIncome.map(item => (
              <li key={item.id} className="expense-item">
                <div className="expense-name">
                  {item.item_name}
                  {item.description && (
                    <div className="expense-desc">{item.description}</div>
                  )}
                </div>
                <span className="expense-amount" style={{color: '#16a34a'}}>+{formatCurrency(item.amount)}</span>
                {canEdit && (
                  <button
                    className="simple-btn simple-btn-danger simple-btn-small"
                    onClick={() => handleDeleteIncome(item.id)}
                  >
                    Delete
                  </button>
                )}
              </li>
            ))}
          </ul>
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
              <FormattedCurrencyInput
                className="simple-input"
                placeholder="0.00"
                value={newExpense.amount}
                onChange={(val) => setNewExpense(prev => ({ ...prev, amount: val }))}
                currency={activeCurrency}
                showWords={true}
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

      {/* Print-only: Complete Summary for Both Currencies */}
      <section className="print-summary-section">
        <h2 className="simple-section-header">Complete Summary - All Currencies</h2>
        <table className="simple-table print-summary-table">
          <thead>
            <tr>
              <th>Metric</th>
              <th className="text-right">USD</th>
              <th className="text-right">SSP</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Opening Balance</td>
              <td className="amount">{formatCurrency(summaries.find(s => s.currency === 'USD')?.opening_balance || 0)}</td>
              <td className="amount">{formatCurrency(summaries.find(s => s.currency === 'SSP')?.opening_balance || 0)}</td>
            </tr>
            <tr>
              <td>+ Cash from Stations</td>
              <td className="amount">{formatCurrency(summaries.find(s => s.currency === 'USD')?.cash_from_stations || 0)}</td>
              <td className="amount">{formatCurrency(summaries.find(s => s.currency === 'SSP')?.cash_from_stations || 0)}</td>
            </tr>
            <tr>
              <td>+ HQ Income</td>
              <td className="amount" style={{color: '#16a34a'}}>+{formatCurrency(summaries.find(s => s.currency === 'USD')?.total_hq_income || 0)}</td>
              <td className="amount" style={{color: '#16a34a'}}>+{formatCurrency(summaries.find(s => s.currency === 'SSP')?.total_hq_income || 0)}</td>
            </tr>
            <tr>
              <td>= Total Available</td>
              <td className="amount">{formatCurrency(summaries.find(s => s.currency === 'USD')?.total_available || 0)}</td>
              <td className="amount">{formatCurrency(summaries.find(s => s.currency === 'SSP')?.total_available || 0)}</td>
            </tr>
            <tr>
              <td>- HQ Expenses</td>
              <td className="amount" style={{color: '#dc2626'}}>-{formatCurrency(summaries.find(s => s.currency === 'USD')?.total_hq_expenses || 0)}</td>
              <td className="amount" style={{color: '#dc2626'}}>-{formatCurrency(summaries.find(s => s.currency === 'SSP')?.total_hq_expenses || 0)}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr style={{background: '#0ea5e9', color: 'white'}}>
              <td style={{fontWeight: 700, color: 'white'}}>= TO SAFE</td>
              <td className="amount" style={{fontWeight: 700, color: 'white', fontSize: '14px'}}>USD {formatCurrency(summaries.find(s => s.currency === 'USD')?.safe_amount || 0)}</td>
              <td className="amount" style={{fontWeight: 700, color: 'white', fontSize: '14px'}}>SSP {formatCurrency(summaries.find(s => s.currency === 'SSP')?.safe_amount || 0)}</td>
            </tr>
          </tfoot>
        </table>
        <div className="print-status">
          <strong>Status:</strong> {summary?.status || 'DRAFT'}
        </div>
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
            {parseFloat(currentSummary.total_hq_income || 0) > 0 && (
              <div className="summary-item">
                <span className="label">+ Income</span>
                <span className="value">+{formatCurrency(currentSummary.total_hq_income)}</span>
              </div>
            )}
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
