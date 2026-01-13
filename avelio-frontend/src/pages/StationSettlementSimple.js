import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ModernDatePicker from '../components/ModernDatePicker';
import './StationSettlementSimple.css';

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

export default function StationSettlementSimple() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEditMode = !!id;

  // Token
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

  // Loading and messages
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [autoSaveVisible, setAutoSaveVisible] = useState(false);

  // Setup state
  const [stationId, setStationId] = useState('');
  const [activeCurrency, setActiveCurrency] = useState('USD');
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');

  // Master data
  const [stations, setStations] = useState([]);
  const [agents, setAgents] = useState([]);
  const [expenseCodes, setExpenseCodes] = useState([]);

  // Sales data
  const [sales, setSales] = useState([]);
  const [newSale, setNewSale] = useState({
    agent_id: '',
    amount: '',
    cashout: ''
  });

  // Expenses data
  const [expenses, setExpenses] = useState([]);
  const [newExpense, setNewExpense] = useState({
    expense_code_id: '',
    amount: '',
    description: ''
  });

  // Cash sent state - separated by currency
  const [cashSentByAgent, setCashSentByAgent] = useState({ USD: {}, SSP: {} });
  const [totalCashSent, setTotalCashSent] = useState({ USD: '', SSP: '' });

  // Settlement state
  const [settlementId, setSettlementId] = useState(id || null);
  const [settlement, setSettlement] = useState(null);
  const [agentEntries, setAgentEntries] = useState([]);

  // Derived state
  const selectedStation = useMemo(() =>
    stations.find(s => s.id === stationId),
    [stations, stationId]
  );
  const isJubaStation = selectedStation?.station_code === 'JUB';

  // Filter by currency
  const filteredSales = useMemo(() =>
    sales.filter(s => s.currency === activeCurrency),
    [sales, activeCurrency]
  );

  const filteredExpenses = useMemo(() =>
    expenses.filter(e => e.currency === activeCurrency),
    [expenses, activeCurrency]
  );

  const filteredAgentEntries = useMemo(() =>
    agentEntries.filter(e => e.currency === activeCurrency),
    [agentEntries, activeCurrency]
  );

  // Calculate totals - per active currency
  const totals = useMemo(() => {
    // Backend uses sales_amount and cashout_amount fields
    const totalSales = filteredSales.reduce((sum, s) => sum + parseFloat(s.sales_amount || s.amount || 0), 0);
    const totalCashout = filteredSales.reduce((sum, s) => sum + parseFloat(s.cashout_amount || 0), 0);
    const netSales = totalSales - totalCashout;
    const totalExpensesAmount = filteredExpenses.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
    const expectedCash = netSales - totalExpensesAmount;

    let cashSent = 0;
    if (isJubaStation) {
      // Sum cash sent by each agent for the active currency
      const currencyCash = cashSentByAgent[activeCurrency] || {};
      cashSent = Object.values(currencyCash).reduce((sum, v) => sum + parseFloat(v || 0), 0);
    } else {
      cashSent = parseFloat(totalCashSent[activeCurrency] || 0);
    }

    const difference = cashSent - expectedCash;

    return {
      totalSales,
      totalCashout,
      netSales,
      totalExpenses: totalExpensesAmount,
      expectedCash,
      cashSent,
      difference
    };
  }, [filteredSales, filteredExpenses, cashSentByAgent, totalCashSent, isJubaStation, activeCurrency]);

  // Status helper
  const getStatus = useCallback((diff) => {
    const tolerance = 0.01;
    if (Math.abs(diff) < tolerance) {
      return { text: 'All Good!', class: 'balanced' };
    } else if (diff < 0) {
      return { text: `Missing ${formatCurrency(Math.abs(diff))}`, class: 'short' };
    } else {
      return { text: `Extra ${formatCurrency(diff)}`, class: 'extra' };
    }
  }, []);

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

  // Fetch stations
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

  // Fetch agents for station
  const fetchAgents = useCallback(async () => {
    if (!stationId) {
      setAgents([]);
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/sales-agents?station_id=${stationId}&active_only=true`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setAgents(data.data?.agents || data.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch agents:', err);
    }
  }, [stationId, token]);

  // Fetch expense codes
  const fetchExpenseCodes = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/expense-codes?active_only=true`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setExpenseCodes(data.data?.expense_codes || data.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch expense codes:', err);
    }
  }, [token]);

  // Fetch sales for station
  const fetchSales = useCallback(async () => {
    if (!stationId) {
      setSales([]);
      return;
    }
    try {
      let url = `${API_BASE}/station-sales?station_id=${stationId}&pageSize=500`;
      if (settlementId) {
        url += `&settlement_id=${settlementId}`;
      } else {
        url += '&unsettled_only=true';
      }
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setSales(data.data?.sales || data.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch sales:', err);
    }
  }, [stationId, settlementId, token]);

  // Fetch settlement data (edit mode)
  const fetchSettlement = useCallback(async () => {
    if (!settlementId) return;
    try {
      const res = await fetch(`${API_BASE}/settlements/${settlementId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        const s = data.data?.settlement || data.data;
        setSettlement(s);
        setStationId(s.station_id);
        setPeriodFrom(s.period_from?.split('T')[0] || '');
        setPeriodTo(s.period_to?.split('T')[0] || '');
        setAgentEntries(s.agent_entries || []);
        setExpenses(s.expenses || []);

        // Initialize cash sent from agent entries - per currency
        const cashByAgent = { USD: {}, SSP: {} };
        (s.agent_entries || []).forEach(entry => {
          if (entry.declared_cash !== null && entry.currency) {
            if (!cashByAgent[entry.currency]) cashByAgent[entry.currency] = {};
            cashByAgent[entry.currency][entry.agent_id] = entry.declared_cash;
          }
        });
        setCashSentByAgent(cashByAgent);

        // For non-Juba stations, get station declared cash from summaries - per currency
        const totalCash = { USD: '', SSP: '' };
        if (s.summaries && s.summaries.length > 0) {
          s.summaries.forEach(sum => {
            if (sum.station_declared_cash !== null && sum.currency) {
              totalCash[sum.currency] = sum.station_declared_cash.toString();
            }
          });
        }
        setTotalCashSent(totalCash);
      }
    } catch (err) {
      console.error('Failed to fetch settlement:', err);
      setError('Failed to load settlement');
    }
  }, [settlementId, token]);

  // Initial load
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchStations(), fetchExpenseCodes()]);
      if (isEditMode) {
        await fetchSettlement();
      }
      setLoading(false);
    };
    loadData();
  }, [fetchStations, fetchExpenseCodes, fetchSettlement, isEditMode]);

  // Fetch agents when station changes
  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  // Fetch sales when station changes
  useEffect(() => {
    fetchSales();
  }, [fetchSales]);

  // Check for existing settlement when station and dates are selected (only in new mode)
  useEffect(() => {
    const checkExistingSettlement = async () => {
      if (isEditMode || !stationId || !periodFrom || !periodTo) return;

      try {
        const res = await fetch(
          `${API_BASE}/settlements?station_id=${stationId}&date_from=${periodFrom}&date_to=${periodTo}&pageSize=1`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const data = await res.json();

        if (data.success && data.data?.settlements?.length > 0) {
          const existing = data.data.settlements[0];
          // Check if the existing settlement overlaps with selected dates
          const existingFrom = new Date(existing.period_from);
          const existingTo = new Date(existing.period_to);
          const selectedFrom = new Date(periodFrom);
          const selectedTo = new Date(periodTo);

          // Check for overlap
          if (selectedFrom <= existingTo && selectedTo >= existingFrom) {
            setSuccess(`Found existing settlement ${existing.settlement_number}. Loading...`);
            // Use window.location for reliable navigation
            window.location.href = `/station-settlement/${existing.id}`;
          }
        }
      } catch (err) {
        console.error('Error checking existing settlement:', err);
      }
    };

    checkExistingSettlement();
  }, [stationId, periodFrom, periodTo, isEditMode, token]);

  // Add sale handler
  const handleAddSale = async () => {
    setError('');

    // Validation
    if (!stationId) {
      setError('Please select a station first');
      return;
    }
    if (!periodFrom || !periodTo) {
      setError('Please set the date range first');
      return;
    }
    if (!newSale.amount || parseFloat(newSale.amount) <= 0) {
      setError('Please enter a valid sales amount');
      return;
    }
    if (isJubaStation && !newSale.agent_id) {
      setError('Please select an agent');
      return;
    }

    try {
      const saleData = {
        station_id: stationId,
        agent_id: isJubaStation ? newSale.agent_id : null,
        transaction_date: periodTo, // Use period end date for all sales
        sales_amount: parseFloat(newSale.amount),
        cashout_amount: parseFloat(newSale.cashout || 0),
        currency: activeCurrency,
        settlement_id: settlementId
      };

      const res = await fetch(`${API_BASE}/station-sales`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(saleData)
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to add sale');
      }

      // Add to local list with agent name and ensure currency is set
      const newSaleWithAgent = {
        ...data.data?.sale || data.data,
        agent_name: agents.find(a => a.id === newSale.agent_id)?.agent_name || '',
        currency: activeCurrency  // Ensure currency is set for filtering
      };
      setSales(prev => [...prev, newSaleWithAgent]);

      // Reset form
      setNewSale({
        agent_id: '',
        amount: '',
        cashout: ''
      });

      setSuccess('Sale added');
      setTimeout(() => setSuccess(''), 2000);
    } catch (err) {
      setError(err.message);
    }
  };

  // Delete sale handler
  const handleDeleteSale = async (saleId) => {
    try {
      const res = await fetch(`${API_BASE}/station-sales/${saleId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) {
        throw new Error('Failed to delete sale');
      }

      setSales(prev => prev.filter(s => s.id !== saleId));
      setSuccess('Sale deleted');
      setTimeout(() => setSuccess(''), 2000);
    } catch (err) {
      setError(err.message);
    }
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

    // If no settlement yet, create one first
    let currentSettlementId = settlementId;
    if (!currentSettlementId) {
      currentSettlementId = await handleCreateSettlement();
      if (!currentSettlementId) return; // Creation failed
    }

    try {
      const res = await fetch(`${API_BASE}/settlements/${currentSettlementId}/expenses`, {
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

      // Add to local list with expense name and ensure currency is set
      const expenseCode = expenseCodes.find(ec => ec.id === newExpense.expense_code_id);
      const newExpenseWithName = {
        ...data.data?.expense || data.data,
        expense_name: expenseCode?.name || '',
        currency: activeCurrency  // Ensure currency is set for filtering
      };
      setExpenses(prev => [...prev, newExpenseWithName]);

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
    }
  };

  // Delete expense handler
  const handleDeleteExpense = async (expenseId) => {
    try {
      const res = await fetch(`${API_BASE}/settlements/${settlementId}/expenses/${expenseId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) {
        throw new Error('Failed to delete expense');
      }

      setExpenses(prev => prev.filter(e => e.id !== expenseId));
      setSuccess('Expense deleted');
      setTimeout(() => setSuccess(''), 2000);
    } catch (err) {
      setError(err.message);
    }
  };

  // Update agent cash sent
  const handleAgentCashChange = async (agentId, value) => {
    // Update state for the specific currency
    setCashSentByAgent(prev => ({
      ...prev,
      [activeCurrency]: {
        ...(prev[activeCurrency] || {}),
        [agentId]: value
      }
    }));

    // Find the agent entry to update
    const entry = agentEntries.find(e => e.agent_id === agentId && e.currency === activeCurrency);
    if (!entry || !settlementId) return;

    // Debounce API call
    clearTimeout(window.cashUpdateTimer);
    window.cashUpdateTimer = setTimeout(async () => {
      try {
        await fetch(`${API_BASE}/settlements/${settlementId}/agents/${entry.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ declared_cash: parseFloat(value) || 0 })
        });
        showAutoSave();
      } catch (err) {
        console.error('Failed to update agent cash:', err);
      }
    }, 500);
  };

  // Update station total cash sent
  const handleTotalCashChange = async (value) => {
    // Update state for the specific currency
    setTotalCashSent(prev => ({
      ...prev,
      [activeCurrency]: value
    }));

    if (!settlementId) return;

    // Debounce API call
    clearTimeout(window.totalCashTimer);
    window.totalCashTimer = setTimeout(async () => {
      try {
        const res = await fetch(`${API_BASE}/settlements/${settlementId}/station-cash`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            currency: activeCurrency,
            station_declared_cash: parseFloat(value) || 0
          })
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.message || 'Failed to save cash sent');
        }
        showAutoSave();
      } catch (err) {
        console.error('Failed to update station cash:', err);
        setError(`Failed to save cash sent: ${err.message}`);
      }
    }, 500);
  };

  // Show auto-save indicator
  const showAutoSave = () => {
    setAutoSaveVisible(true);
    setTimeout(() => setAutoSaveVisible(false), 2000);
  };

  // Create settlement - returns the new settlement ID or null if failed
  const handleCreateSettlement = async () => {
    setError('');

    if (!stationId) {
      setError('Please select a station');
      return null;
    }
    if (!periodFrom || !periodTo) {
      setError('Please set the date range');
      return null;
    }
    if (new Date(periodFrom) > new Date(periodTo)) {
      setError('From date must be before To date');
      return null;
    }

    try {
      setSaving(true);
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
      if (!res.ok) {
        throw new Error(data.message || 'Failed to create settlement');
      }

      const newId = data.data?.settlement?.id || data.data?.id;
      setSettlementId(newId);
      setSettlement(data.data?.settlement || data.data);

      // Fetch the created settlement to get agent entries
      await fetchSettlement();

      setSuccess('Settlement created');
      setTimeout(() => setSuccess(''), 2000);

      // Update URL without reload
      window.history.pushState({}, '', `/station-settlement/${newId}`);

      return newId; // Return the new ID for immediate use
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setSaving(false);
    }
  };

  // Save draft
  const handleSaveDraft = async () => {
    if (!settlementId) {
      await handleCreateSettlement();
    } else {
      setSuccess('Draft saved');
      setTimeout(() => setSuccess(''), 2000);
    }
  };

  // Submit for review
  const handleSubmit = async () => {
    if (!settlementId) {
      setError('Please save the draft first');
      return;
    }

    try {
      setSaving(true);
      const res = await fetch(`${API_BASE}/settlements/${settlementId}/submit`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to submit');
      }

      setSuccess('Submitted successfully!');
      setSettlement(prev => ({ ...prev, status: 'REVIEW' }));
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Delete settlement (admin only)
  const handleDeleteSettlement = async () => {
    if (!settlementId) return;

    if (!window.confirm('Are you sure you want to delete this entire settlement? This cannot be undone.')) {
      return;
    }

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

      setSuccess('Settlement deleted');
      setTimeout(() => {
        navigate('/station-settlement');
      }, 1000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="settlement-simple">
        <div className="simple-loading">
          <div className="spinner"></div>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  const status = getStatus(totals.difference);
  const isDraft = !settlement || settlement.status === 'DRAFT';
  const canEdit = isDraft || isAdmin; // Admin can always edit/delete

  return (
    <div className="settlement-simple">
      {/* Auto-save indicator */}
      <div className={`auto-save-indicator ${autoSaveVisible ? 'visible' : ''}`}>
        Saved
      </div>

      {/* Header */}
      <header className="simple-header">
        <h1>Station Settlement</h1>
        <p>{settlement ? `${settlement.settlement_number}` : 'New Settlement'}</p>
        {isAdmin && settlementId && (
          <button
            className="simple-btn simple-btn-danger simple-btn-small"
            onClick={handleDeleteSettlement}
            disabled={saving}
            style={{ marginTop: '12px' }}
          >
            Delete Settlement
          </button>
        )}
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

      {/* Setup Section */}
      <section className="simple-section setup-section">
        <div className="setup-grid">
          <div className="setup-field">
            <label className="simple-label">Station</label>
            <select
              className="simple-select"
              value={stationId}
              onChange={(e) => setStationId(e.target.value)}
              disabled={!!settlementId}
            >
              <option value="">-- Select Station --</option>
              {stations.map(s => (
                <option key={s.id} value={s.id}>
                  {s.station_code} - {s.station_name}
                </option>
              ))}
            </select>
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

          <div className="setup-field">
            <label className="simple-label">From Date</label>
            <ModernDatePicker
              selected={periodFrom}
              onChange={setPeriodFrom}
              placeholder="Select start date"
              disabled={!!settlementId}
              maxDate={periodTo ? new Date(periodTo) : null}
            />
          </div>

          <div className="setup-field">
            <label className="simple-label">To Date</label>
            <ModernDatePicker
              selected={periodTo}
              onChange={setPeriodTo}
              placeholder="Select end date"
              disabled={!!settlementId}
              minDate={periodFrom ? new Date(periodFrom) : null}
            />
          </div>
        </div>
      </section>

      {/* Sales Section */}
      <section className="simple-section">
        <h2 className="simple-section-header">
          Add Sales
        </h2>

        {/* Inline Add Form */}
        {canEdit && (
          <div className="inline-form">
            {isJubaStation && (
              <div className="form-field">
                <label>Agent</label>
                <select
                  className="simple-select"
                  value={newSale.agent_id}
                  onChange={(e) => setNewSale(prev => ({ ...prev, agent_id: e.target.value }))}
                >
                  <option value="">Select Agent</option>
                  {agents.map(a => (
                    <option key={a.id} value={a.id}>{a.agent_name}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="form-field">
              <label>Sales Amount</label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="simple-input"
                placeholder="0.00"
                value={newSale.amount}
                onChange={(e) => setNewSale(prev => ({ ...prev, amount: e.target.value }))}
              />
            </div>
            <div className="form-field small">
              <label>Refunds</label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="simple-input"
                placeholder="0.00"
                value={newSale.cashout}
                onChange={(e) => setNewSale(prev => ({ ...prev, cashout: e.target.value }))}
              />
            </div>
            <div className="form-field small">
              <label>Balance</label>
              <div className="calculated-value">
                {formatCurrency(parseFloat(newSale.amount || 0) - parseFloat(newSale.cashout || 0))}
              </div>
            </div>
            <button className="simple-btn simple-btn-primary" onClick={handleAddSale}>
              + Add Sale
            </button>
          </div>
        )}

        {/* Sales Table */}
        {filteredSales.length === 0 ? (
          <div className="empty-state">
            <p>No sales added yet. Add your first sale above.</p>
          </div>
        ) : (
          <table className="simple-table">
            <thead>
              <tr>
                {isJubaStation && <th>Agent</th>}
                <th className="text-right">Sales</th>
                <th className="text-right">Refunds</th>
                <th className="text-right">Balance</th>
                {canEdit && <th></th>}
              </tr>
            </thead>
            <tbody>
              {filteredSales.map(sale => (
                <tr key={sale.id}>
                  {isJubaStation && <td>{sale.agent_name || '-'}</td>}
                  <td className="amount">{formatCurrency(sale.sales_amount || sale.amount)}</td>
                  <td className="amount">{formatCurrency(sale.cashout_amount || 0)}</td>
                  <td className="amount">{formatCurrency(parseFloat(sale.sales_amount || sale.amount || 0) - parseFloat(sale.cashout_amount || 0))}</td>
                  {canEdit && (
                    <td>
                      <button
                        className="simple-btn simple-btn-danger simple-btn-small"
                        onClick={() => handleDeleteSale(sale.id)}
                      >
                        Delete
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                {isJubaStation && <td></td>}
                <td className="amount"><strong>{formatCurrency(totals.totalSales)}</strong></td>
                <td className="amount"><strong>{formatCurrency(totals.totalCashout)}</strong></td>
                <td className="amount"><strong>{formatCurrency(totals.netSales)}</strong></td>
                {canEdit && <td></td>}
              </tr>
            </tfoot>
          </table>
        )}
      </section>

      {/* Cash Sent Section */}
      <section className="simple-section">
        <h2 className="simple-section-header">
          Cash Sent to HQ
        </h2>

        {isJubaStation ? (
          /* Per-agent cash inputs for Juba */
          <div className="cash-by-agent">
            {filteredAgentEntries.length === 0 && agents.length > 0 ? (
              <div className="empty-state">
                <p>Save the report first to enter cash amounts per agent.</p>
              </div>
            ) : filteredAgentEntries.length === 0 ? (
              <div className="empty-state">
                <p>No agents found. Add sales to create agent entries.</p>
              </div>
            ) : (
              filteredAgentEntries.map(entry => (
                <div key={entry.id} className="agent-cash-row">
                  <label>
                    {entry.agent_name || entry.agent_code}
                    <span style={{ color: '#64748b', fontWeight: 400, marginLeft: 8 }}>
                      (Should have: {formatCurrency(entry.expected_cash)})
                    </span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="simple-input"
                    placeholder="0.00"
                    value={cashSentByAgent[activeCurrency]?.[entry.agent_id] || ''}
                    onChange={(e) => handleAgentCashChange(entry.agent_id, e.target.value)}
                    disabled={!canEdit}
                  />
                </div>
              ))
            )}
          </div>
        ) : (
          /* Single total input for other stations */
          <div className="total-cash-row">
            <label>Total Cash Sent</label>
            <input
              type="number"
              step="0.01"
              min="0"
              className="simple-input large"
              placeholder="0.00"
              value={totalCashSent[activeCurrency] || ''}
              onChange={(e) => handleTotalCashChange(e.target.value)}
              disabled={!canEdit}
            />
          </div>
        )}

        {/* Difference indicator */}
        {(totals.cashSent > 0 || totals.expectedCash > 0) && (
          <div className={`difference-indicator ${status.class}`}>
            {status.text}
          </div>
        )}
      </section>

      {/* Expenses Section */}
      <section className="simple-section">
        <h2 className="simple-section-header">
          Expenses
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
                  .filter(ec => ec.allowed_currencies?.includes(activeCurrency) || !ec.allowed_currencies)
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
            <button className="simple-btn simple-btn-primary" onClick={handleAddExpense}>
              + Add
            </button>
          </div>
        )}

        {/* Expenses List */}
        {filteredExpenses.length === 0 ? (
          <div className="empty-state">
            <p>No expenses added yet.</p>
          </div>
        ) : (
          <ul className="expenses-list">
            {filteredExpenses.map(expense => (
              <li key={expense.id} className="expense-item">
                <div className="expense-name">
                  {expense.expense_name || expense.name}
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
              <span className="label">Total Sales</span>
              <span className="value">{formatCurrency(totals.totalSales)}</span>
            </div>
            <div className="summary-item">
              <span className="label">Less Refunds</span>
              <span className="value">-{formatCurrency(totals.totalCashout)}</span>
            </div>
            <div className="summary-item">
              <span className="label">Less Expenses</span>
              <span className="value">-{formatCurrency(totals.totalExpenses)}</span>
            </div>
            <div className="summary-divider"></div>
            <div className="summary-item highlight">
              <span className="label">Should Have</span>
              <span className="value">{activeCurrency} {formatCurrency(totals.expectedCash)}</span>
            </div>
            <div className="summary-item highlight">
              <span className="label">Cash Sent</span>
              <span className="value">{activeCurrency} {formatCurrency(totals.cashSent)}</span>
            </div>
          </div>

          <div className={`summary-status ${status.class}`}>
            {status.text}
          </div>

          <div className="summary-actions">
            {isDraft ? (
              <>
                <button
                  className="simple-btn simple-btn-secondary"
                  onClick={handleSaveDraft}
                  disabled={saving}
                >
                  {saving ? 'Saving...' : 'Save Draft'}
                </button>
                <button
                  className="simple-btn simple-btn-success"
                  onClick={handleSubmit}
                  disabled={saving || !settlementId}
                >
                  Submit Report
                </button>
              </>
            ) : (
              <span className={`status-badge ${settlement?.status?.toLowerCase()}`}>
                {settlement?.status}
              </span>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
