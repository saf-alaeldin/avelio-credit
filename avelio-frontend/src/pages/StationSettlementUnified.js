import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AddSaleModal from './AddSaleModal';
import ImportCSVModal from './ImportCSVModal';
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

export default function StationSettlementUnified() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEditMode = !!id;

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Master data
  const [stations, setStations] = useState([]);
  const [agents, setAgents] = useState([]);
  const [expenseCodes, setExpenseCodes] = useState([]);

  // Selected station
  const [stationId, setStationId] = useState('');

  // Sales data (unsettled)
  const [sales, setSales] = useState([]);
  const [salesLoading, setSalesLoading] = useState(false);

  // Sales filter
  const [dateFilterFrom, setDateFilterFrom] = useState('');
  const [dateFilterTo, setDateFilterTo] = useState('');
  const [showAllSales, setShowAllSales] = useState(true); // Show all sales by default

  // Settlement creation
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');

  // Settlement data (when editing)
  const [settlement, setSettlement] = useState(null);
  const [agentEntries, setAgentEntries] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [summaries, setSummaries] = useState([]);

  // Existing settlements for station
  const [existingSettlements, setExistingSettlements] = useState([]);

  // Currency tab
  const [activeCurrency, setActiveCurrency] = useState('USD');

  // New expense form
  const [newExpense, setNewExpense] = useState({
    expense_code_id: '',
    amount: '',
    description: ''
  });

  // Modals
  const [showAddSaleModal, setShowAddSaleModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmModalConfig, setConfirmModalConfig] = useState({
    title: '',
    message: '',
    onConfirm: null,
    confirmText: 'Confirm',
    confirmClass: 'btn-primary'
  });

  const token = localStorage.getItem('token') || sessionStorage.getItem('token');

  // Get user role from token
  const getUserRole = () => {
    if (!token) return null;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.role;
    } catch {
      return null;
    }
  };
  const userRole = getUserRole();
  const isAdmin = userRole === 'admin';

  // Fetch stations
  const fetchStations = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/stations?active_only=true`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setStations(data.data?.stations || []);
      }
    } catch (err) {
      console.error('Failed to fetch stations:', err);
    }
  }, [token]);

  // Fetch agents for selected station
  const fetchAgents = useCallback(async () => {
    if (!stationId) {
      setAgents([]);
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/sales-agents?station_id=${stationId}&active_only=true`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAgents(data.data?.agents || []);
      }
    } catch (err) {
      console.error('Failed to fetch agents:', err);
    }
  }, [token, stationId]);

  // Fetch expense codes
  const fetchExpenseCodes = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/expense-codes?active_only=true`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setExpenseCodes(data.data?.expense_codes || []);
      }
    } catch (err) {
      console.error('Failed to fetch expense codes:', err);
    }
  }, [token]);

  // Fetch existing settlements for station
  const fetchExistingSettlements = useCallback(async () => {
    if (!stationId) {
      setExistingSettlements([]);
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/settlements?station_id=${stationId}&pageSize=10`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setExistingSettlements(data.data?.settlements || []);
      }
    } catch (err) {
      console.error('Failed to fetch existing settlements:', err);
    }
  }, [token, stationId]);

  // Fetch unsettled sales
  const fetchSales = useCallback(async () => {
    if (!stationId) {
      setSales([]);
      return;
    }
    try {
      setSalesLoading(true);
      const params = new URLSearchParams();
      params.append('station_id', stationId);
      if (!showAllSales) {
        params.append('settled', 'false');
      }
      if (dateFilterFrom) params.append('date_from', dateFilterFrom);
      if (dateFilterTo) params.append('date_to', dateFilterTo);
      params.append('pageSize', '500');

      const res = await fetch(`${API_BASE}/station-sales?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.ok) {
        const data = await res.json();
        setSales(data.data?.sales || []);
      }
    } catch (err) {
      console.error('Failed to fetch sales:', err);
    } finally {
      setSalesLoading(false);
    }
  }, [token, stationId, dateFilterFrom, dateFilterTo, showAllSales]);

  // Fetch settlement details (edit mode)
  const fetchSettlement = useCallback(async () => {
    if (!id) return;

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
      setStationId(s?.station_id);
      setPeriodFrom(s?.period_from);
      setPeriodTo(s?.period_to);

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
    fetchStations();
    fetchExpenseCodes();
  }, [fetchStations, fetchExpenseCodes]);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  useEffect(() => {
    if (!isEditMode) {
      fetchExistingSettlements();
    }
  }, [fetchExistingSettlements, isEditMode]);

  useEffect(() => {
    if (!isEditMode) {
      fetchSales();
    }
  }, [fetchSales, isEditMode]);

  useEffect(() => {
    if (isEditMode) {
      fetchSettlement();
    }
  }, [fetchSettlement, isEditMode]);

  // Delete sale - show confirmation modal
  const handleDeleteSaleClick = (saleId) => {
    setConfirmModalConfig({
      title: 'Delete Sale',
      message: 'Are you sure you want to delete this sale?',
      onConfirm: () => handleDeleteSaleConfirm(saleId),
      confirmText: 'Delete',
      confirmClass: 'btn-danger'
    });
    setShowConfirmModal(true);
  };

  // Actually delete the sale
  const handleDeleteSaleConfirm = async (saleId) => {
    setShowConfirmModal(false);
    try {
      const res = await fetch(`${API_BASE}/station-sales/${saleId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to delete sale');
      }

      setSuccess('Sale deleted');
      fetchSales();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message);
    }
  };

  // Create settlement
  const handleCreateSettlement = async () => {
    console.log('Create Settlement clicked:', { stationId, periodFrom, periodTo });

    if (!stationId || !periodFrom || !periodTo) {
      setError('Please select station and date range');
      return;
    }

    try {
      setSaving(true);
      setError('');

      console.log('Sending request to create settlement...');
      const res = await fetch(`${API_BASE}/settlements`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          station_id: stationId,
          period_from: periodFrom,
          period_to: periodTo
        })
      });

      const data = await res.json();
      console.log('Create settlement response:', data);

      if (!res.ok) {
        throw new Error(data.message || 'Failed to create settlement');
      }

      setSuccess('Settlement created successfully');
      const settlementId = data.data?.settlement?.id || data.data?.id;
      console.log('Navigating to settlement:', settlementId);
      navigate(`/station-settlement/${settlementId}`);
    } catch (err) {
      console.error('Create settlement error:', err);
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Update declared cash for an agent
  const handleUpdateDeclaredCash = async (entryId, declaredCash) => {
    try {
      const res = await fetch(`${API_BASE}/settlements/${id}/agents/${entryId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ declared_cash: declaredCash })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to update');
      }

      fetchSettlement();
      setSuccess('Cash amount updated');
      setTimeout(() => setSuccess(''), 2000);
    } catch (err) {
      setError(err.message);
    }
  };

  // Add expense
  const handleAddExpense = async () => {
    if (!newExpense.expense_code_id || !newExpense.amount) {
      setError('Please select expense code and enter amount');
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/settlements/${id}/expenses`, {
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

      setNewExpense({ expense_code_id: '', amount: '', description: '' });
      fetchSettlement();
      setSuccess('Expense added');
      setTimeout(() => setSuccess(''), 2000);
    } catch (err) {
      setError(err.message);
    }
  };

  // Remove expense - show confirmation modal
  const handleRemoveExpenseClick = (expenseId) => {
    setConfirmModalConfig({
      title: 'Remove Expense',
      message: 'Are you sure you want to remove this expense?',
      onConfirm: () => handleRemoveExpenseConfirm(expenseId),
      confirmText: 'Remove',
      confirmClass: 'btn-danger'
    });
    setShowConfirmModal(true);
  };

  // Actually remove the expense
  const handleRemoveExpenseConfirm = async (expenseId) => {
    setShowConfirmModal(false);
    try {
      const res = await fetch(`${API_BASE}/settlements/${id}/expenses/${expenseId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to remove expense');
      }

      fetchSettlement();
      setSuccess('Expense removed');
      setTimeout(() => setSuccess(''), 2000);
    } catch (err) {
      setError(err.message);
    }
  };

  // Update station declared cash (for verification)
  const handleUpdateStationCash = async (declaredCash) => {
    try {
      const res = await fetch(`${API_BASE}/settlements/${id}/station-cash`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          currency: activeCurrency,
          station_declared_cash: declaredCash
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to update station cash');
      }

      fetchSettlement();
      setSuccess('Station cash updated');
      setTimeout(() => setSuccess(''), 2000);
    } catch (err) {
      setError(err.message);
    }
  };

  // Submit for review - show confirmation modal
  const handleSubmitClick = () => {
    setConfirmModalConfig({
      title: 'Submit Settlement',
      message: 'Submit this settlement for review? You won\'t be able to make changes after submission.',
      onConfirm: handleSubmitConfirm,
      confirmText: 'Submit for Review',
      confirmClass: 'btn-primary'
    });
    setShowConfirmModal(true);
  };

  // Actually submit the settlement
  const handleSubmitConfirm = async () => {
    setShowConfirmModal(false);
    try {
      setSaving(true);
      const res = await fetch(`${API_BASE}/settlements/${id}/submit`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Failed to submit');
      }

      setSuccess('Settlement submitted for review');
      navigate('/settlements');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Delete settlement (admin only) - show confirmation modal
  const handleDeleteSettlementClick = (settlementId, settlementNumber) => {
    setConfirmModalConfig({
      title: 'Delete Settlement',
      message: `Are you sure you want to delete settlement ${settlementNumber}? This action cannot be undone.`,
      onConfirm: () => handleDeleteSettlementConfirm(settlementId),
      confirmText: 'Delete',
      confirmClass: 'btn-danger'
    });
    setShowConfirmModal(true);
  };

  // Actually delete the settlement
  const handleDeleteSettlementConfirm = async (settlementId) => {
    setShowConfirmModal(false);
    try {
      setSaving(true);
      const res = await fetch(`${API_BASE}/settlements/${settlementId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Failed to delete settlement');
      }

      setSuccess('Settlement deleted successfully');
      fetchExistingSettlements();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Calculate sales preview for settlement creation
  const getSalesPreview = () => {
    if (!periodFrom || !periodTo) return { count: 0, totals: {} };

    const filtered = sales.filter(s => {
      // Parse date and convert to local date string to handle timezone correctly
      const saleDateObj = new Date(s.transaction_date);
      const saleDate = saleDateObj.toLocaleDateString('en-CA'); // Returns YYYY-MM-DD format
      return saleDate >= periodFrom && saleDate <= periodTo;
    });

    const totals = {};
    filtered.forEach(s => {
      if (!totals[s.currency]) totals[s.currency] = 0;
      totals[s.currency] += parseFloat(s.amount);
    });

    return { count: filtered.length, totals };
  };

  const salesPreview = getSalesPreview();

  // Filter by currency (edit mode)
  const filteredAgentEntries = agentEntries.filter(e => e.currency === activeCurrency);
  const filteredExpenses = expenses.filter(e => e.currency === activeCurrency);
  const currentSummary = summaries.find(s => s.currency === activeCurrency) || {};

  const availableCurrencies = [...new Set(summaries.map(s => s.currency))];
  if (availableCurrencies.length === 0) availableCurrencies.push('USD', 'SSP');

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const formatCurrency = (amount) => {
    return Number(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const isDraft = !settlement || settlement.status === 'DRAFT';
  const selectedStation = stations.find(s => s.id === stationId);
  const isJubaStation = selectedStation?.station_code === 'JUB';

  if (loading) {
    return <div className="settlement-page"><div className="settlement-loading">Loading settlement...</div></div>;
  }

  return (
    <div className="settlement-page">
      {/* Header */}
      <div className="settlement-header">
        <div>
          <h2 className="settlement-title">
            {isEditMode ? `Settlement ${settlement?.settlement_number || ''}` : 'Station Settlement'}
          </h2>
          <p className="settlement-subtitle">
            {isEditMode
              ? `${settlement?.station_code} - ${settlement?.station_name}`
              : 'Add sales and create settlement'
            }
          </p>
        </div>
        <div className="header-actions">
          {isEditMode && isDraft && (
            <>
              <button className="btn-secondary" onClick={() => navigate('/settlements')}>
                Cancel
              </button>
              <button className="btn-primary" onClick={handleSubmitClick} disabled={saving}>
                {saving ? 'Submitting...' : 'Submit for Review'}
              </button>
            </>
          )}
          {isEditMode && !isDraft && (
            <span className={`status-badge status-${settlement?.status?.toLowerCase()}`}>
              {settlement?.status}
            </span>
          )}
        </div>
      </div>

      {error && <div className="settlement-error">{error}</div>}
      {success && <div className="settlement-success">{success}</div>}

      {/* STEP 1: Station Selection (New mode only) */}
      {!isEditMode && (
        <div className="settlement-card">
          <h3>Step 1: Select Station</h3>
          <div className="form-group" style={{ maxWidth: '400px' }}>
            <label>Station *</label>
            <select value={stationId} onChange={(e) => setStationId(e.target.value)}>
              <option value="">Select Station</option>
              {stations.map(s => (
                <option key={s.id} value={s.id}>{s.station_code} - {s.station_name}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* STEP 2: Manage Sales (New mode only, after station selected) */}
      {!isEditMode && stationId && (
        <div className="settlement-card">
          <div className="card-header-row">
            <h3>Step 2: Manage Sales</h3>
            <div className="card-actions">
              <button className="btn-secondary" onClick={() => setShowImportModal(true)}>
                Import CSV
              </button>
              <button className="btn-primary" onClick={() => setShowAddSaleModal(true)}>
                + Add Sale
              </button>
            </div>
          </div>

          {/* Filters */}
          <div className="sales-filters">
            <div className="filter-group">
              <label>Show</label>
              <select
                value={showAllSales ? 'all' : 'unsettled'}
                onChange={(e) => setShowAllSales(e.target.value === 'all')}
              >
                <option value="all">All Sales</option>
                <option value="unsettled">Unsettled Only</option>
              </select>
            </div>
            <div className="filter-group">
              <label>From</label>
              <input
                type="date"
                value={dateFilterFrom}
                onChange={(e) => setDateFilterFrom(e.target.value)}
              />
            </div>
            <div className="filter-group">
              <label>To</label>
              <input
                type="date"
                value={dateFilterTo}
                onChange={(e) => setDateFilterTo(e.target.value)}
              />
            </div>
          </div>

          {/* Sales table */}
          {salesLoading ? (
            <div className="sales-loading">Loading sales...</div>
          ) : sales.length === 0 ? (
            <div className="sales-empty">
              <p>No {showAllSales ? '' : 'unsettled '}sales found for this station. Add sales manually or import from CSV.</p>
            </div>
          ) : (
            <>
              <div className="sales-table-wrap">
                <table className="sales-table">
                  <thead>
                    <tr>
                      <th>Reference</th>
                      {isJubaStation && <th>Agent</th>}
                      <th>Date</th>
                      <th>Flight</th>
                      <th className="text-right">Reservation Amt</th>
                      <th className="text-right">Cashout</th>
                      <th className="text-right">Balance</th>
                      <th>Currency</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sales.map(s => (
                      <tr key={s.id}>
                        <td className="sale-ref">{s.sale_reference}</td>
                        {isJubaStation && (
                          <td>
                            {s.agent_code ? (
                              <>
                                <span className="agent-code">{s.agent_code}</span>
                                <span className="agent-name">{s.agent_name}</span>
                              </>
                            ) : (
                              <span className="no-agent">No Agent</span>
                            )}
                          </td>
                        )}
                        <td>{formatDate(s.transaction_date)}</td>
                        <td>{s.flight_reference || '-'}</td>
                        <td className="text-right amount">{formatCurrency(s.sales_amount)}</td>
                        <td className="text-right amount cashout">{formatCurrency(s.cashout_amount)}</td>
                        <td className={`text-right amount ${s.amount < 0 ? 'negative' : ''}`}>{formatCurrency(s.amount)}</td>
                        <td>{s.currency}</td>
                        <td>
                          <button className="btn-remove" onClick={() => handleDeleteSaleClick(s.id)}>
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Sales summary */}
              <div className="sales-summary">
                <strong>Total:</strong>
                {Object.entries(
                  sales.reduce((acc, s) => {
                    if (!acc[s.currency]) acc[s.currency] = { count: 0, sales_amount: 0, cashout_amount: 0, balance: 0 };
                    acc[s.currency].count++;
                    acc[s.currency].sales_amount += parseFloat(s.sales_amount || 0);
                    acc[s.currency].cashout_amount += parseFloat(s.cashout_amount || 0);
                    acc[s.currency].balance += parseFloat(s.amount || 0);
                    return acc;
                  }, {})
                ).map(([currency, data]) => (
                  <span key={currency} className="summary-item">
                    {currency}: Sales {formatCurrency(data.sales_amount)} - Cashout {formatCurrency(data.cashout_amount)} = Balance {formatCurrency(data.balance)} ({data.count} entries)
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* STEP 3: Create Settlement (New mode only) */}
      {!isEditMode && stationId && (
        <div className="settlement-card">
          <h3>Step 3: Create Settlement</h3>
          <div className="form-grid">
            <div className="form-group">
              <label>Period From *</label>
              <input
                type="date"
                value={periodFrom}
                onChange={(e) => setPeriodFrom(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>Period To *</label>
              <input
                type="date"
                value={periodTo}
                onChange={(e) => setPeriodTo(e.target.value)}
              />
            </div>
          </div>

          {/* Preview */}
          {periodFrom && periodTo && (
            <div className="settlement-preview">
              <strong>Sales to include:</strong> {salesPreview.count} sales
              {Object.entries(salesPreview.totals).map(([currency, amount]) => (
                <span key={currency} className="preview-amount">
                  ({currency} {formatCurrency(amount)})
                </span>
              ))}
            </div>
          )}

          <div className="form-actions">
            <button className="btn-secondary" onClick={() => navigate('/settlements')}>
              Cancel
            </button>
            <button
              className="btn-primary"
              onClick={handleCreateSettlement}
              disabled={saving || !periodFrom || !periodTo}
            >
              {saving ? 'Creating...' : 'Create Settlement'}
            </button>
          </div>

          {/* Existing Settlements */}
          {existingSettlements.length > 0 && (
            <div className="existing-settlements">
              <h4>Existing Settlements for this Station</h4>
              <table className="mini-table">
                <thead>
                  <tr>
                    <th>Settlement #</th>
                    <th>Period</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {existingSettlements.map(s => (
                    <tr key={s.id}>
                      <td>{s.settlement_number}</td>
                      <td>{new Date(s.period_from).toLocaleDateString()} - {new Date(s.period_to).toLocaleDateString()}</td>
                      <td><span className={`status-badge status-${s.status?.toLowerCase()}`}>{s.status}</span></td>
                      <td className="action-buttons">
                        <button
                          className="btn-link"
                          onClick={() => navigate(`/station-settlement/${s.id}`)}
                        >
                          Open
                        </button>
                        {isAdmin && (
                          <button
                            className="btn-remove"
                            onClick={() => handleDeleteSettlementClick(s.id, s.settlement_number)}
                            disabled={saving}
                          >
                            Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* STEP 4: Complete Settlement (Edit mode - existing settlement) */}
      {isEditMode && settlement && (
        <>
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

          {/* Agent Cash Table */}
          <div className="settlement-card">
            <h3>Cash by Agent ({activeCurrency})</h3>
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
                {filteredAgentEntries.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="empty-row">No sales found for this currency</td>
                  </tr>
                ) : (
                  filteredAgentEntries.map(entry => (
                    <tr key={entry.id}>
                      <td>
                        <span className="agent-code">{entry.agent_code}</span>
                        <span className="agent-name">{entry.agent_name}</span>
                      </td>
                      <td className="text-right amount">{formatCurrency(entry.expected_cash)}</td>
                      <td className="text-right">
                        {isDraft ? (
                          <input
                            type="number"
                            className="cash-input"
                            value={entry.declared_cash ?? ''}
                            placeholder="Enter amount"
                            onChange={(e) => {
                              const value = e.target.value === '' ? null : parseFloat(e.target.value);
                              setAgentEntries(prev => prev.map(ae =>
                                ae.id === entry.id ? { ...ae, declared_cash: value } : ae
                              ));
                            }}
                            onBlur={(e) => {
                              const value = e.target.value === '' ? null : parseFloat(e.target.value);
                              handleUpdateDeclaredCash(entry.id, value);
                            }}
                          />
                        ) : (
                          <span className="amount">{entry.declared_cash !== null ? formatCurrency(entry.declared_cash) : '-'}</span>
                        )}
                      </td>
                      <td className={`text-right amount ${entry.variance < 0 ? 'variance-short' : entry.variance > 0 ? 'variance-extra' : ''}`}>
                        {entry.variance !== null ? formatCurrency(entry.variance) : '-'}
                      </td>
                      <td>
                        <span className={`variance-badge ${entry.variance_status?.toLowerCase() || 'pending'}`}>
                          {entry.variance_status || 'Pending'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {filteredAgentEntries.length > 0 && (
                <tfoot>
                  <tr className="total-row">
                    <td><strong>TOTAL</strong></td>
                    <td className="text-right"><strong>{formatCurrency(filteredAgentEntries.reduce((sum, e) => sum + parseFloat(e.expected_cash || 0), 0))}</strong></td>
                    <td className="text-right"><strong>{formatCurrency(filteredAgentEntries.reduce((sum, e) => sum + parseFloat(e.declared_cash || 0), 0))}</strong></td>
                    <td className="text-right"><strong>{formatCurrency(filteredAgentEntries.reduce((sum, e) => sum + parseFloat(e.variance || 0), 0))}</strong></td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* Expenses Section */}
          <div className="settlement-card">
            <h3>Expenses ({activeCurrency})</h3>

            {isDraft && (
              <div className="add-expense-form">
                <select
                  value={newExpense.expense_code_id}
                  onChange={(e) => setNewExpense({ ...newExpense, expense_code_id: e.target.value })}
                >
                  <option value="">Select Expense Code</option>
                  {expenseCodes
                    .filter(ec => ec.currencies_allowed?.includes(activeCurrency))
                    .map(ec => (
                      <option key={ec.id} value={ec.id}>{ec.code} - {ec.name}</option>
                    ))}
                </select>
                <input
                  type="number"
                  placeholder="Amount"
                  value={newExpense.amount}
                  onChange={(e) => setNewExpense({ ...newExpense, amount: e.target.value })}
                />
                <input
                  type="text"
                  placeholder="Description (optional)"
                  value={newExpense.description}
                  onChange={(e) => setNewExpense({ ...newExpense, description: e.target.value })}
                />
                <button className="btn-primary" onClick={handleAddExpense}>Add Expense</button>
              </div>
            )}

            <table className="expenses-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Description</th>
                  <th className="text-right">Amount</th>
                  {isDraft && <th></th>}
                </tr>
              </thead>
              <tbody>
                {filteredExpenses.length === 0 ? (
                  <tr>
                    <td colSpan={isDraft ? 5 : 4} className="empty-row">No expenses added</td>
                  </tr>
                ) : (
                  filteredExpenses.map(expense => (
                    <tr key={expense.id}>
                      <td className="expense-code">{expense.expense_code}</td>
                      <td>{expense.expense_name}</td>
                      <td className="expense-desc">{expense.description || '-'}</td>
                      <td className="text-right amount">{formatCurrency(expense.amount)}</td>
                      {isDraft && (
                        <td>
                          <button
                            className="btn-remove"
                            onClick={() => handleRemoveExpenseClick(expense.id)}
                          >
                            Remove
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
              {filteredExpenses.length > 0 && (
                <tfoot>
                  <tr className="total-row">
                    <td colSpan={isDraft ? 3 : 3}><strong>TOTAL EXPENSES</strong></td>
                    <td className="text-right"><strong>{formatCurrency(filteredExpenses.reduce((sum, e) => sum + parseFloat(e.amount), 0))}</strong></td>
                    {isDraft && <td></td>}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* Summary Section */}
          <div className="settlement-card summary-card">
            <h3>Summary ({activeCurrency})</h3>
            <div className="summary-grid">
              <div className="summary-row">
                <span>Opening Balance</span>
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
        </>
      )}

      {/* Modals */}
      {showAddSaleModal && (
        <AddSaleModal
          stationId={stationId}
          station={selectedStation}
          agents={agents}
          onClose={() => setShowAddSaleModal(false)}
          onSuccess={() => {
            setShowAddSaleModal(false);
            fetchSales();
            setSuccess('Sale added successfully');
            setTimeout(() => setSuccess(''), 3000);
          }}
        />
      )}

      {showImportModal && (
        <ImportCSVModal
          stationId={stationId}
          onClose={() => setShowImportModal(false)}
          onSuccess={(result) => {
            setShowImportModal(false);
            fetchSales();
            setSuccess(`Imported ${result.imported_count} sales`);
            setTimeout(() => setSuccess(''), 3000);
          }}
        />
      )}

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="modal-overlay" onClick={() => setShowConfirmModal(false)}>
          <div className="modal-content confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{confirmModalConfig.title}</h3>
              <button className="modal-close" onClick={() => setShowConfirmModal(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <p className="confirm-message">{confirmModalConfig.message}</p>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowConfirmModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={confirmModalConfig.confirmClass}
                onClick={confirmModalConfig.onConfirm}
              >
                {confirmModalConfig.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
