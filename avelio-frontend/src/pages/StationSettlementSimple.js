import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getApiBaseUrl } from '../services/api';
import ModernDatePicker from '../components/ModernDatePicker';
import FormattedCurrencyInput from '../components/FormattedCurrencyInput';
import './StationSettlementSimple.css';

const API_BASE = getApiBaseUrl();

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
  const isManager = userRole === 'manager';
  const isAdminOrManager = isAdmin || isManager;

  // Loading and messages
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [autoSaveVisible, setAutoSaveVisible] = useState(false);

  // Sales import state
  const [importFile, setImportFile] = useState(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importPreview, setImportPreview] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const fileInputRef = useRef(null);

  // Setup state
  const [stationId, setStationId] = useState('');
  const [activeCurrency, setActiveCurrency] = useState('USD');
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');

  // Master data
  const [stations, setStations] = useState([]);
  const [pointOfSales, setPointOfSales] = useState([]);
  const [selectedPOS, setSelectedPOS] = useState('');
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
  const [openingBalance, setOpeningBalance] = useState({ USD: 0, SSP: 0 });
  const [newCashSent, setNewCashSent] = useState({
    agent_id: '',
    amount: ''
  });

  // Settlement state
  const [settlementId, setSettlementId] = useState(id || null);
  const [settlement, setSettlement] = useState(null);
  const [agentEntries, setAgentEntries] = useState([]);

  // Debounce timer refs (prevent state updates on unmounted component)
  const cashUpdateTimerRef = useRef(null);
  const totalCashTimerRef = useRef(null);
  const isMountedRef = useRef(true);

  // Cleanup timers on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      clearTimeout(cashUpdateTimerRef.current);
      clearTimeout(totalCashTimerRef.current);
    };
  }, []);

  // Derived state
  const selectedStation = useMemo(() =>
    stations.find(s => s.id === stationId),
    [stations, stationId]
  );
  // Check both selectedStation and settlement for Juba (in case stations haven't loaded yet)
  const isJubaStation = selectedStation?.station_code === 'JUB' || settlement?.station_code === 'JUB';
  // Filter by currency
  const filteredSales = useMemo(() =>
    sales.filter(s => {
      // Filter by currency
      if (s.currency !== activeCurrency) return false;
      // For Juba station with POS selected, filter by POS
      if (isJubaStation && selectedPOS && s.point_of_sale !== selectedPOS) return false;
      return true;
    }),
    [sales, activeCurrency, isJubaStation, selectedPOS]
  );

  const filteredExpenses = useMemo(() =>
    expenses.filter(e => {
      // Filter by currency
      if (e.currency !== activeCurrency) return false;
      // For Juba station with POS selected, only show expenses that match the selected POS
      if (isJubaStation && selectedPOS) {
        // Expense must have matching POS (expenses without POS are hidden when POS is selected)
        if (!e.point_of_sale || e.point_of_sale !== selectedPOS) return false;
      }
      return true;
    }),
    [expenses, activeCurrency, isJubaStation, selectedPOS]
  );

  // Get unique agents from sales (for showing cash inputs)
  // This shows ALL agents that have sales in the current currency
  const agentsFromSales = useMemo(() => {
    const agentMap = {};

    // Build agent list from sales and calculate expected cash
    filteredSales.forEach(sale => {
      if (sale.agent_id) {
        if (!agentMap[sale.agent_id]) {
          agentMap[sale.agent_id] = {
            agent_id: sale.agent_id,
            agent_name: sale.agent_name || agents.find(a => a.id === sale.agent_id)?.agent_name || 'Unknown',
            expected_cash: 0
          };
        }
        // Calculate expected cash from sales (sales - refunds)
        const saleAmount = parseFloat(sale.sales_amount || sale.amount || 0);
        const cashoutAmount = parseFloat(sale.cashout_amount || 0);
        agentMap[sale.agent_id].expected_cash += saleAmount - cashoutAmount;
      }
    });

    return Object.values(agentMap);
  }, [filteredSales, agents]);

  // Calculate totals - per active currency
  const totals = useMemo(() => {
    // Backend uses sales_amount and cashout_amount fields
    const totalSales = filteredSales.reduce((sum, s) => sum + parseFloat(s.sales_amount || s.amount || 0), 0);
    const totalCashout = filteredSales.reduce((sum, s) => sum + parseFloat(s.cashout_amount || 0), 0);
    const netSales = totalSales - totalCashout;
    const totalExpensesAmount = filteredExpenses.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);

    // Get opening balance for current currency
    const currentOpeningBalance = openingBalance[activeCurrency] || 0;

    // Expected cash = Net Sales - Expenses + Opening Balance
    const expectedCash = netSales - totalExpensesAmount + currentOpeningBalance;

    let cashSent = 0;
    if (isJubaStation) {
      // For Juba: Sum cash sent only for agents in the currently selected POS
      const currencyCash = cashSentByAgent[activeCurrency] || {};
      if (selectedPOS) {
        // Only sum cash for agents that belong to the selected POS
        const posAgentIds = agents.map(a => a.id);
        cashSent = Object.entries(currencyCash)
          .filter(([agentId]) => posAgentIds.includes(agentId))
          .reduce((sum, [, v]) => sum + parseFloat(v || 0), 0);
      } else {
        // No POS selected - sum all agents (overview mode)
        cashSent = Object.values(currencyCash).reduce((sum, v) => sum + parseFloat(v || 0), 0);
      }
    } else {
      cashSent = parseFloat(totalCashSent[activeCurrency] || 0);
    }

    const difference = cashSent - expectedCash;

    return {
      totalSales,
      totalCashout,
      netSales,
      totalExpenses: totalExpensesAmount,
      openingBalance: currentOpeningBalance,
      expectedCash,
      cashSent,
      difference
    };
  }, [filteredSales, filteredExpenses, cashSentByAgent, totalCashSent, isJubaStation, activeCurrency, selectedPOS, agents, openingBalance]);

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

  // Fetch POS values for station
  const fetchPointOfSales = useCallback(async () => {
    if (!stationId || !isJubaStation) {
      setPointOfSales([]);
      setSelectedPOS('');
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/sales-agents/point-of-sales?station_id=${stationId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setPointOfSales(data.data?.point_of_sales || []);
      }
    } catch (err) {
      console.error('Failed to fetch POS:', err);
    }
  }, [stationId, isJubaStation, token]);

  // Fetch agents for station (filtered by POS for Juba)
  const fetchAgents = useCallback(async () => {
    if (!stationId) {
      setAgents([]);
      return;
    }
    // For Juba station, require POS selection first
    if (isJubaStation && !selectedPOS) {
      setAgents([]);
      return;
    }
    try {
      let url = `${API_BASE}/sales-agents?station_id=${stationId}&active_only=true`;
      if (isJubaStation && selectedPOS) {
        url += `&point_of_sale=${encodeURIComponent(selectedPOS)}`;
      }
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setAgents(data.data?.agents || data.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch agents:', err);
    }
  }, [stationId, selectedPOS, isJubaStation, token]);

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
      let url = `${API_BASE}/station-sales?station_id=${stationId}&pageSize=200`;
      if (settlementId) {
        url += `&settlement_id=${settlementId}`;
      } else {
        url += '&unsettled_only=true';
        // Filter by selected date range so only matching sales appear
        if (periodFrom) url += `&date_from=${periodFrom}`;
        if (periodTo) url += `&date_to=${periodTo}`;
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
  }, [stationId, settlementId, periodFrom, periodTo, token]);

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
        const openingBal = { USD: 0, SSP: 0 };
        if (s.summaries && s.summaries.length > 0) {
          s.summaries.forEach(sum => {
            if (sum.station_declared_cash !== null && sum.currency) {
              totalCash[sum.currency] = sum.station_declared_cash.toString();
            }
            if (sum.opening_balance !== null && sum.currency) {
              openingBal[sum.currency] = parseFloat(sum.opening_balance) || 0;
            }
          });
        }
        setTotalCashSent(totalCash);
        setOpeningBalance(openingBal);
      }
    } catch (err) {
      console.error('Failed to fetch settlement:', err);
      setError('Failed to load settlement');
    }
  }, [settlementId, token]);

  // Refresh all data from server
  const handleRefresh = async () => {
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      // Refresh all data in parallel
      await Promise.all([
        fetchStations(),
        fetchExpenseCodes(),
        fetchAgents(),
        fetchSales(),
        settlementId ? fetchSettlement() : Promise.resolve()
      ]);
      setSuccess('Data refreshed');
      setTimeout(() => setSuccess(''), 2000);
    } catch (err) {
      setError('Failed to refresh data');
    } finally {
      setLoading(false);
    }
  };

  // Reset state when navigating to new settlement (id becomes undefined)
  useEffect(() => {
    if (!id) {
      // Reset all state for new settlement
      setStationId('');
      setActiveCurrency('USD');
      setPeriodFrom('');
      setPeriodTo('');
      setSelectedPOS('');
      setSales([]);
      setExpenses([]);
      setCashSentByAgent({ USD: {}, SSP: {} });
      setTotalCashSent({ USD: '', SSP: '' });
      setNewSale({ agent_id: '', amount: '', cashout: '' });
      setNewExpense({ expense_code_id: '', amount: '', description: '' });
      setNewCashSent({ agent_id: '', amount: '' });
      setSettlementId(null);
      setSettlement(null);
      setAgentEntries([]);
      setError('');
      setSuccess('');
    }
  }, [id]);

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

  // Fetch POS when station changes (for Juba)
  useEffect(() => {
    fetchPointOfSales();
    setSelectedPOS(''); // Reset POS selection when station changes
  }, [fetchPointOfSales, stationId]);

  // Fetch agents when station or POS changes
  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  // Fetch sales when station changes
  useEffect(() => {
    fetchSales();
  }, [fetchSales]);

  // Check for existing settlement when station and dates are selected (only in new mode)
  // Only auto-open if EXACT same dates - not on overlap
  useEffect(() => {
    const checkExistingSettlement = async () => {
      if (isEditMode || !stationId || !periodFrom || !periodTo) return;

      try {
        // Fetch settlements for this station
        const res = await fetch(
          `${API_BASE}/settlements?station_id=${stationId}&pageSize=100`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const data = await res.json();

        if (data.success && data.data?.settlements?.length > 0) {
          // Only auto-open if there's an EXACT match (same station, same from, same to)
          const exactMatch = data.data.settlements.find(s => {
            if (s.status === 'REJECTED') return false;

            // Compare dates as strings (YYYY-MM-DD format)
            const existingFrom = new Date(s.period_from).toISOString().split('T')[0];
            const existingTo = new Date(s.period_to).toISOString().split('T')[0];

            return existingFrom === periodFrom && existingTo === periodTo;
          });

          if (exactMatch) {
            setSuccess(`Found existing settlement ${exactMatch.settlement_number}. Opening...`);
            setTimeout(() => {
              window.location.href = `/station-settlement/${exactMatch.id}`;
            }, 500);
          }
        }
      } catch (err) {
        console.error('Error checking existing settlement:', err);
      }
    };

    // Debounce to avoid too many requests while user is selecting dates
    const timer = setTimeout(checkExistingSettlement, 300);
    return () => clearTimeout(timer);
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
    if (isJubaStation && !selectedPOS) {
      setError('Please select a Point of Sale (POS) first');
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
        point_of_sale: isJubaStation ? selectedPOS : null,
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

      // Add to local list with agent name, POS, and ensure currency is set
      const newSaleWithAgent = {
        ...data.data?.sale || data.data,
        agent_name: agents.find(a => a.id === newSale.agent_id)?.agent_name || '',
        point_of_sale: selectedPOS,
        currency: activeCurrency  // Ensure currency is set for filtering
      };
      setSales(prev => [...prev, newSaleWithAgent]);

      // If we have a settlement, recalculate to update agent entries
      if (settlementId) {
        try {
          const recalcRes = await fetch(`${API_BASE}/settlements/${settlementId}/recalculate`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` }
          });
          if (recalcRes.ok) {
            // Refresh agent entries from backend
            const entriesRes = await fetch(`${API_BASE}/settlements/${settlementId}/agents`, {
              headers: { Authorization: `Bearer ${token}` }
            });
            if (entriesRes.ok) {
              const entriesData = await entriesRes.json();
              setAgentEntries(entriesData.data?.agent_entries || []);
            }
            // Also refresh sales to ensure UI matches server
            await fetchSales();
          }
        } catch (recalcErr) {
          console.error('Failed to recalculate settlement:', recalcErr);
        }
      }

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

      // If we have a settlement, recalculate to update agent entries and summaries
      if (settlementId) {
        try {
          const recalcRes = await fetch(`${API_BASE}/settlements/${settlementId}/recalculate`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` }
          });
          if (recalcRes.ok) {
            // Refresh agent entries from backend
            const entriesRes = await fetch(`${API_BASE}/settlements/${settlementId}/agents`, {
              headers: { Authorization: `Bearer ${token}` }
            });
            if (entriesRes.ok) {
              const entriesData = await entriesRes.json();
              setAgentEntries(entriesData.data?.agent_entries || []);
            }
            // Also refresh sales to ensure UI matches server
            await fetchSales();
          }
        } catch (recalcErr) {
          console.error('Failed to recalculate settlement:', recalcErr);
        }
      }

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
      const expenseData = {
        expense_code_id: newExpense.expense_code_id,
        currency: activeCurrency,
        amount: parseFloat(newExpense.amount),
        description: newExpense.description
      };
      // Include POS for Juba station
      if (isJubaStation && selectedPOS) {
        expenseData.point_of_sale = selectedPOS;
      }

      const res = await fetch(`${API_BASE}/settlements/${currentSettlementId}/expenses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(expenseData)
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to add expense');
      }

      // Add to local list with expense name and ensure currency/POS is set for filtering
      const expenseCode = expenseCodes.find(ec => ec.id === newExpense.expense_code_id);
      const newExpenseWithName = {
        ...data.data?.expense || data.data,
        expense_name: expenseCode?.name || '',
        currency: activeCurrency,
        point_of_sale: isJubaStation && selectedPOS ? selectedPOS : null
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

  // Delete agent entry (cash sent) handler
  const handleDeleteAgentEntry = async (entryId) => {
    if (!window.confirm('Are you sure you want to delete this cash sent entry?')) {
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/settlements/${settlementId}/agents/${entryId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to delete agent entry');
      }

      // Remove from local state
      setAgentEntries(prev => prev.filter(e => e.id !== entryId));

      // Also remove from cashSentByAgent state
      const deletedEntry = agentEntries.find(e => e.id === entryId);
      if (deletedEntry) {
        setCashSentByAgent(prev => {
          const newState = { ...prev };
          if (newState[deletedEntry.currency]) {
            delete newState[deletedEntry.currency][deletedEntry.agent_id];
          }
          return newState;
        });
      }

      setSuccess('Cash entry deleted');
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

    // If no settlement yet, auto-create one so cash values persist
    if (!settlementId) {
      const newId = await handleCreateSettlement();
      if (!newId) {
        showAutoSave();
        return;
      }
      // Settlement created, cash values saved in handleCreateSettlement
      showAutoSave();
      return;
    }

    // Debounce API call
    clearTimeout(cashUpdateTimerRef.current);
    cashUpdateTimerRef.current = setTimeout(async () => {
      if (!isMountedRef.current) return;
      try {
        // Find the agent entry to update
        let entry = agentEntries.find(e => e.agent_id === agentId && e.currency === activeCurrency);

        // If no entry found, try to refresh or create the agent entry
        if (!entry) {
          console.log('No agent entry found, attempting to refresh/create...');

          // Only recalculate if settlement is in DRAFT status
          const isDraftSettlement = !settlement || settlement.status === 'DRAFT';
          if (isDraftSettlement) {
            try {
              await fetch(`${API_BASE}/settlements/${settlementId}/recalculate`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
              });
            } catch (recalcErr) {
              console.warn('Recalculate failed:', recalcErr);
            }
          }

          // Fetch fresh agent entries
          const entriesRes = await fetch(`${API_BASE}/settlements/${settlementId}/agents`, {
            headers: { Authorization: `Bearer ${token}` }
          });

          if (entriesRes.ok) {
            const entriesData = await entriesRes.json();
            const freshEntries = entriesData.data?.agent_entries || [];
            setAgentEntries(freshEntries);

            // Try to find the entry again
            entry = freshEntries.find(e => e.agent_id === agentId && e.currency === activeCurrency);
          }

          // If still no entry, try to create it
          if (!entry) {
            console.log('Entry still not found, creating new agent entry...');
            try {
              const createRes = await fetch(`${API_BASE}/settlements/${settlementId}/agents`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                  agent_id: agentId,
                  currency: activeCurrency,
                  declared_cash: parseFloat(value) || 0
                })
              });

              if (createRes.ok) {
                const createData = await createRes.json();
                entry = createData.data?.entry;
                if (entry) {
                  // Add to local state
                  setAgentEntries(prev => [...prev, entry]);
                  showAutoSave();
                  return; // Entry created with declared_cash, no need to update
                }
              } else {
                const errorData = await createRes.json();
                throw new Error(errorData.message || 'Failed to create entry');
              }
            } catch (createErr) {
              console.error('Failed to create agent entry:', createErr);
              setError('Failed to create agent entry: ' + createErr.message);
              setTimeout(() => setError(''), 3000);
              return;
            }
          }
        }

        const res = await fetch(`${API_BASE}/settlements/${settlementId}/agents/${entry.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ declared_cash: parseFloat(value) || 0 })
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.message || 'Failed to save');
        }
        showAutoSave();
      } catch (err) {
        console.error('Failed to update agent cash:', err);
        setError('Failed to save cash amount: ' + err.message);
        setTimeout(() => setError(''), 3000);
      }
    }, 500);
  };

  // Add cash sent entry
  const handleAddCashSent = async () => {
    setError('');

    if (isJubaStation && !newCashSent.agent_id) {
      setError('Please select an agent');
      return;
    }
    if (!newCashSent.amount || parseFloat(newCashSent.amount) <= 0) {
      setError('Please enter a valid cash amount');
      return;
    }

    const amount = parseFloat(newCashSent.amount);

    if (isJubaStation) {
      // For Juba: Update cash sent for specific agent
      const agentId = newCashSent.agent_id;

      // Use the entered amount directly (SET, not ADD)
      const newTotal = amount;

      // If we have a settlement, update the agent entry FIRST
      if (settlementId) {
        let entry = agentEntries.find(e => e.agent_id === agentId && e.currency === activeCurrency);

        // If no entry found, try to refresh or create the agent entry
        if (!entry) {
          console.log('No agent entry found, attempting to refresh/create...');

          // Only recalculate if settlement is in DRAFT status
          const isDraftSettlement = !settlement || settlement.status === 'DRAFT';
          if (isDraftSettlement) {
            try {
              await fetch(`${API_BASE}/settlements/${settlementId}/recalculate`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
              });
            } catch (recalcErr) {
              console.warn('Recalculate failed:', recalcErr);
            }
          }

          // Fetch fresh agent entries
          try {
            const entriesRes = await fetch(`${API_BASE}/settlements/${settlementId}/agents`, {
              headers: { Authorization: `Bearer ${token}` }
            });

            if (entriesRes.ok) {
              const entriesData = await entriesRes.json();
              const freshEntries = entriesData.data?.agent_entries || [];
              setAgentEntries(freshEntries);

              // Try to find the entry again
              entry = freshEntries.find(e => e.agent_id === agentId && e.currency === activeCurrency);
            }
          } catch (fetchErr) {
            console.error('Failed to fetch agent entries:', fetchErr);
          }

          // If still no entry, try to create it
          if (!entry) {
            console.log('Entry still not found, creating new agent entry...');
            try {
              const createRes = await fetch(`${API_BASE}/settlements/${settlementId}/agents`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                  agent_id: agentId,
                  currency: activeCurrency,
                  declared_cash: newTotal
                })
              });

              if (createRes.ok) {
                const createData = await createRes.json();
                entry = createData.data?.entry;
                if (entry) {
                  // Add to local state and update cash sent
                  setAgentEntries(prev => [...prev, entry]);
                  setCashSentByAgent(prev => ({
                    ...prev,
                    [activeCurrency]: {
                      ...(prev[activeCurrency] || {}),
                      [agentId]: newTotal.toString()
                    }
                  }));
                  setNewCashSent({ agent_id: '', amount: '' });
                  setSuccess('Cash sent added');
                  setTimeout(() => setSuccess(''), 2000);
                  return; // Entry created with declared_cash, done
                }
              } else {
                const errorData = await createRes.json();
                throw new Error(errorData.message || 'Failed to create entry');
              }
            } catch (createErr) {
              console.error('Failed to create agent entry:', createErr);
              setError('Failed to create agent entry: ' + createErr.message);
              return;
            }
          }
        }

        try {
          const res = await fetch(`${API_BASE}/settlements/${settlementId}/agents/${entry.id}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ declared_cash: newTotal })
          });
          if (!res.ok) {
            const data = await res.json();
            throw new Error(data.message || 'Failed to save');
          }
        } catch (err) {
          console.error('Failed to update agent cash:', err);
          setError('Failed to save: ' + err.message);
          return;
        }
      }

      // Update state only after successful save
      setCashSentByAgent(prev => ({
        ...prev,
        [activeCurrency]: {
          ...(prev[activeCurrency] || {}),
          [agentId]: newTotal.toString()
        }
      }));
    } else {
      // For other stations: Update total cash sent (SET, not ADD)
      const newTotal = amount;

      // If we have a settlement, update the station cash FIRST
      if (settlementId) {
        try {
          const res = await fetch(`${API_BASE}/settlements/${settlementId}/station-cash`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({
              currency: activeCurrency,
              station_declared_cash: newTotal
            })
          });
          if (!res.ok) {
            const data = await res.json();
            throw new Error(data.message || 'Failed to save');
          }
        } catch (err) {
          console.error('Failed to update station cash:', err);
          setError('Failed to save: ' + err.message);
          return;
        }
      }

      // Update state only after successful save
      setTotalCashSent(prev => ({
        ...prev,
        [activeCurrency]: newTotal.toString()
      }));
    }

    // Reset form
    setNewCashSent({
      agent_id: '',
      amount: ''
    });

    setSuccess('Cash sent updated');
    setTimeout(() => setSuccess(''), 2000);
    showAutoSave();
  };

  // Update station total cash sent
  const handleTotalCashChange = async (value) => {
    // Update state for the specific currency
    setTotalCashSent(prev => ({
      ...prev,
      [activeCurrency]: value
    }));

    // If no settlement yet, auto-create one so cash values persist
    if (!settlementId) {
      clearTimeout(totalCashTimerRef.current);
      totalCashTimerRef.current = setTimeout(async () => {
        if (!isMountedRef.current) return;
        const newId = await handleCreateSettlement();
        if (newId) {
          // Now save the cash value to the newly created settlement
          try {
            await fetch(`${API_BASE}/settlements/${newId}/station-cash`, {
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
            showAutoSave();
          } catch (err) {
            console.error('Failed to save station cash:', err);
          }
        }
      }, 500);
      return;
    }

    // Debounce API call
    clearTimeout(totalCashTimerRef.current);
    totalCashTimerRef.current = setTimeout(async () => {
      if (!isMountedRef.current) return;
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
      setError('From date cannot be after To date');
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
        // Check if there's an EXACT match settlement - automatically open it
        if (data.existingSettlement) {
          const existing = data.existingSettlement;
          setSuccess(`Opening existing settlement ${existing.settlement_number}...`);

          // Automatically navigate to the existing settlement
          window.location.href = `/station-settlement/${existing.id}`;
          return null;
        }
        // For overlaps (no exact match), just show the error message
        throw new Error(data.message || 'Failed to create settlement');
      }

      const newId = data.data?.settlement?.id || data.data?.id;
      const newSettlement = data.data?.settlement || data.data;

      setSettlementId(newId);
      setSettlement(newSettlement);

      // Set agent entries directly from the response (don't rely on fetchSettlement)
      if (newSettlement.agent_entries) {
        setAgentEntries(newSettlement.agent_entries);

        // Save cash values that were entered before saving
        // Update each agent entry with the declared_cash from cashSentByAgent
        for (const entry of newSettlement.agent_entries) {
          const cashValue = cashSentByAgent[entry.currency]?.[entry.agent_id];
          if (cashValue && parseFloat(cashValue) > 0) {
            try {
              await fetch(`${API_BASE}/settlements/${newId}/agents/${entry.id}`, {
                method: 'PUT',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ declared_cash: parseFloat(cashValue) })
              });
            } catch (err) {
              console.error('Failed to save agent cash:', err);
            }
          }
        }
      }

      // Set expenses if any
      if (newSettlement.expenses) {
        setExpenses(newSettlement.expenses);
      }

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
      // Settlement already exists - save all pending cash values
      try {
        setSaving(true);

        // Clear any pending debounce timers to prevent race conditions
        clearTimeout(cashUpdateTimerRef.current);
        clearTimeout(totalCashTimerRef.current);

        // For Juba station: Save individual agent cash entries
        if (isJubaStation) {
          for (const entry of agentEntries) {
            const cashValue = cashSentByAgent[entry.currency]?.[entry.agent_id];
            if (cashValue !== undefined && parseFloat(cashValue) >= 0) {
              try {
                await fetch(`${API_BASE}/settlements/${settlementId}/agents/${entry.id}`, {
                  method: 'PUT',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                  },
                  body: JSON.stringify({ declared_cash: parseFloat(cashValue) || 0 })
                });
              } catch (err) {
                console.error('Failed to save agent cash:', err);
              }
            }
          }
        }

        // For all stations: Save total cash sent for each currency
        for (const currency of ['USD', 'SSP']) {
          const cashValue = totalCashSent[currency];
          if (cashValue !== undefined && parseFloat(cashValue) >= 0) {
            try {
              await fetch(`${API_BASE}/settlements/${settlementId}/station-cash`, {
                method: 'PUT',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                  currency: currency,
                  station_declared_cash: parseFloat(cashValue) || 0
                })
              });
            } catch (err) {
              console.error(`Failed to save ${currency} cash:`, err);
            }
          }
        }

        setSuccess('Draft saved');
        setTimeout(() => setSuccess(''), 2000);
      } catch (err) {
        setError('Failed to save draft: ' + err.message);
        setTimeout(() => setError(''), 3000);
      } finally {
        setSaving(false);
      }
    }
  };

  // Submit for review
  const handleSubmit = async () => {
    let currentSettlementId = settlementId;

    // Create settlement first if it doesn't exist
    if (!currentSettlementId) {
      currentSettlementId = await handleCreateSettlement();
      if (!currentSettlementId) {
        return; // Creation failed, error already set
      }
    }

    try {
      setSaving(true);

      // IMPORTANT: Clear any pending debounce timers and save cash values immediately
      // This prevents data loss when user types cash and clicks Submit before debounce completes
      clearTimeout(totalCashTimerRef.current);

      // Save total cash sent for each currency that has a value
      for (const currency of ['USD', 'SSP']) {
        const cashValue = totalCashSent[currency];
        if (cashValue && parseFloat(cashValue) > 0) {
          try {
            await fetch(`${API_BASE}/settlements/${currentSettlementId}/station-cash`, {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
              },
              body: JSON.stringify({
                currency: currency,
                station_declared_cash: parseFloat(cashValue) || 0
              })
            });
          } catch (err) {
            console.error(`Failed to save ${currency} cash before submit:`, err);
          }
        }
      }

      const res = await fetch(`${API_BASE}/settlements/${currentSettlementId}/submit`, {
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
  const canEdit = isDraft || isAdminOrManager; // Admin/Manager can always edit/delete

  // Sales import handlers
  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setImportFile(file);
    setImportLoading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`${API_BASE}/settlements/import/preview`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      if (data.success) {
        setImportPreview(data.data);
      } else {
        setError(data.message || 'Preview failed');
      }
    } catch (err) {
      setError(`Import preview failed: ${err.message}`);
    } finally {
      setImportLoading(false);
    }
  };

  const handleImportExecute = async () => {
    if (!importFile) return;
    setImportLoading(true);

    try {
      const formData = new FormData();
      formData.append('file', importFile);

      const res = await fetch(`${API_BASE}/settlements/import/execute`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      if (data.success) {
        setImportPreview(null);
        setImportFile(null);
        setImportResult(data.data);
        // Refresh the current settlement if in edit mode
        if (settlementId) {
          fetchSettlement();
        }
      } else {
        setError(data.message || 'Import failed');
      }
    } catch (err) {
      setError(`Import failed: ${err.message}`);
    } finally {
      setImportLoading(false);
    }
  };

  const handleImportClose = () => {
    setImportPreview(null);
    setImportFile(null);
  };

  const fmtImportAmt = (amount) => {
    return Number(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <div className="settlement-simple">
      {/* Auto-save indicator */}
      <div className={`auto-save-indicator ${autoSaveVisible ? 'visible' : ''}`}>
        Saved
      </div>

      {/* Hidden file input for import */}
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        accept=".xlsx,.xls"
        onChange={handleFileSelected}
      />

      {/* Header */}
      <header className="simple-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <div>
            <h1>Station Settlement</h1>
            <p>{settlement ? `${settlement.settlement_number}` : 'New Settlement'}</p>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {isAdminOrManager && (
              <button
                className="import-till-btn"
                onClick={handleImportClick}
                disabled={importLoading}
              >
                {importLoading ? 'Processing...' : 'Import Till Statement'}
              </button>
            )}
            <button
              className="simple-btn simple-btn-secondary"
              onClick={handleRefresh}
              disabled={loading}
              title="Refresh data from server"
              style={{ padding: '8px 16px', fontSize: '14px' }}
            >
              {loading ? '↻ Refreshing...' : '↻ Refresh'}
            </button>
          </div>
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

        {/* POS Selection for Juba */}
        {isJubaStation && pointOfSales.length > 0 && (
          <div className="pos-selector">
            <label className="simple-label">Point of Sale (POS)</label>
            <div className="pos-buttons">
              {pointOfSales.map(pos => (
                <button
                  key={pos.name}
                  className={`pos-btn ${selectedPOS === pos.name ? 'active' : ''}`}
                  onClick={() => setSelectedPOS(pos.name)}
                >
                  {pos.name}
                  <span className="pos-count">({pos.agent_count})</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Inline Add Sale Form */}
        {canEdit && (
          <div className="inline-form">
            {isJubaStation && (
              <div className="form-field">
                <label>Agent</label>
                <select
                  className="simple-select"
                  value={newSale.agent_id}
                  onChange={(e) => setNewSale(prev => ({ ...prev, agent_id: e.target.value }))}
                  disabled={!selectedPOS}
                >
                  <option value="">{selectedPOS ? 'Select Agent' : 'Select POS first'}</option>
                  {agents.map(a => (
                    <option key={a.id} value={a.id}>{a.agent_name}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="form-field">
              <label>Sales Amount</label>
              <FormattedCurrencyInput
                className="simple-input"
                placeholder="0.00"
                value={newSale.amount}
                onChange={(value) => setNewSale(prev => ({ ...prev, amount: value }))}
                currency={activeCurrency}
              />
            </div>
            <div className="form-field small">
              <label>Refunds</label>
              <FormattedCurrencyInput
                className="simple-input"
                placeholder="0.00"
                value={newSale.cashout}
                onChange={(value) => setNewSale(prev => ({ ...prev, cashout: value }))}
                currency={activeCurrency}
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
                {isJubaStation && <th>POS</th>}
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
                  {isJubaStation && <td className="pos-cell">{sale.point_of_sale || '-'}</td>}
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

        {/* Inline Add Form for Cash Sent */}
        {canEdit && (
          <div className="inline-form">
            {isJubaStation && (
              <div className="form-field">
                <label>Agent</label>
                <select
                  className="simple-select"
                  value={newCashSent.agent_id}
                  onChange={(e) => setNewCashSent(prev => ({ ...prev, agent_id: e.target.value }))}
                >
                  <option value="">Select Agent</option>
                  {agents.map(a => (
                    <option key={a.id} value={a.id}>{a.agent_name}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="form-field">
              <label>Amount</label>
              <FormattedCurrencyInput
                className="simple-input"
                placeholder="0.00"
                value={newCashSent.amount}
                onChange={(value) => setNewCashSent(prev => ({ ...prev, amount: value }))}
                currency={activeCurrency}
              />
            </div>
            <button className="simple-btn simple-btn-primary" onClick={handleAddCashSent}>
              + Add
            </button>
          </div>
        )}

        {isJubaStation ? (
          /* Per-agent cash inputs for Juba - shows ALL agents with sales */
          <div className="cash-by-agent">
            {agentsFromSales.length > 0 ? (
              agentsFromSales.map(agent => {
                const agentEntry = agentEntries.find(e => e.agent_id === agent.agent_id && e.currency === activeCurrency);
                const hasDeclaredCash = agentEntry && parseFloat(agentEntry.declared_cash || 0) > 0;
                return (
                  <div key={agent.agent_id} className="agent-cash-row" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ flex: 1 }}>
                      <label>
                        {agent.agent_name}
                        <span style={{ color: '#64748b', fontWeight: 400, marginLeft: 8 }}>
                          (Should have: {formatCurrency(agent.expected_cash)})
                        </span>
                      </label>
                      <FormattedCurrencyInput
                        className="simple-input large"
                        placeholder="0.00"
                        value={cashSentByAgent[activeCurrency]?.[agent.agent_id] ?? ''}
                        onChange={(value) => handleAgentCashChange(agent.agent_id, value)}
                        disabled={!canEdit}
                        currency={activeCurrency}
                        showWords={true}
                        expectedValue={agent.expected_cash}
                      />
                    </div>
                    {canEdit && hasDeclaredCash && agentEntry && (
                      <button
                        className="simple-btn simple-btn-danger simple-btn-small"
                        onClick={() => handleDeleteAgentEntry(agentEntry.id)}
                        title="Delete this cash entry"
                        style={{ marginTop: '24px' }}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="empty-state">
                <p>Add sales first to enter cash amounts per agent.</p>
              </div>
            )}

            {/* Show agent entries with declared cash but no sales (orphaned entries) - filtered by selected POS */}
            {settlementId && agentEntries.filter(e =>
              e.currency === activeCurrency &&
              e.declared_cash !== null &&
              parseFloat(e.declared_cash) > 0 &&
              (!selectedPOS || e.point_of_sale === selectedPOS) && // Filter by selected POS
              !agentsFromSales.some(a => a.agent_id === e.agent_id)
            ).length > 0 && (
              <div style={{ marginTop: '20px', padding: '16px', background: '#fef3c7', borderRadius: '8px' }}>
                <h4 style={{ margin: '0 0 12px 0', color: '#92400e' }}>Entries without matching sales:</h4>
                <table className="simple-table">
                  <thead>
                    <tr>
                      <th>Agent</th>
                      <th className="text-right">Expected</th>
                      <th className="text-right">Declared</th>
                      <th className="text-right">Variance</th>
                      {canEdit && <th></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {agentEntries.filter(e =>
                      e.currency === activeCurrency &&
                      e.declared_cash !== null &&
                      parseFloat(e.declared_cash) > 0 &&
                      (!selectedPOS || e.point_of_sale === selectedPOS) && // Filter by selected POS
                      !agentsFromSales.some(a => a.agent_id === e.agent_id)
                    ).map(entry => (
                      <tr key={entry.id}>
                        <td>{entry.agent_name || 'Unknown Agent'}</td>
                        <td className="amount">{formatCurrency(entry.expected_cash)}</td>
                        <td className="amount">{formatCurrency(entry.declared_cash)}</td>
                        <td className={`amount ${parseFloat(entry.variance) > 0 ? 'extra' : parseFloat(entry.variance) < 0 ? 'short' : ''}`}>
                          {formatCurrency(entry.variance)}
                        </td>
                        {canEdit && (
                          <td>
                            <button
                              className="simple-btn simple-btn-danger simple-btn-small"
                              onClick={() => handleDeleteAgentEntry(entry.id)}
                            >
                              Delete
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          /* Display total for other stations */
          <div className="cash-by-agent">
            <div className="agent-cash-row">
              <label>
                Total Cash Sent
                <span style={{ color: '#64748b', fontWeight: 400, marginLeft: 8 }}>
                  (Should have: {formatCurrency(totals.expectedCash)})
                </span>
              </label>
              <FormattedCurrencyInput
                className="simple-input large"
                placeholder="0.00"
                value={totalCashSent[activeCurrency] || ''}
                onChange={(value) => handleTotalCashChange(value)}
                disabled={!canEdit}
                currency={activeCurrency}
                showWords={true}
                expectedValue={totals.expectedCash}
              />
            </div>
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
              <FormattedCurrencyInput
                className="simple-input"
                placeholder="0.00"
                value={newExpense.amount}
                onChange={(value) => setNewExpense(prev => ({ ...prev, amount: value }))}
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
            {totals.openingBalance !== 0 && (
              <div className="summary-item">
                <span className="label">{totals.openingBalance >= 0 ? '+ Opening Bal' : '- Opening Bal'}</span>
                <span className="value" style={{ color: totals.openingBalance >= 0 ? '#22c55e' : '#ef4444' }}>
                  {totals.openingBalance >= 0 ? '+' : ''}{formatCurrency(totals.openingBalance)}
                </span>
              </div>
            )}
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

          <div className="summary-actions" style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
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
                  disabled={saving}
                >
                  Submit Report
                </button>
              </>
            ) : (
              <span className={`status-badge ${settlement?.status?.toLowerCase()}`}>
                {settlement?.status}
              </span>
            )}

            {/* Admin/Manager Actions - Edit */}
            {isAdminOrManager && settlementId && (
              <button
                className="simple-btn simple-btn-primary"
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                type="button"
              >
                Edit
              </button>
            )}

            {/* Admin Only - Delete */}
            {isAdmin && settlementId && (
              <button
                className="simple-btn simple-btn-danger"
                onClick={handleDeleteSettlement}
                disabled={saving}
                type="button"
              >
                Delete
              </button>
            )}
          </div>
        </div>
      </footer>

      {/* Sales Import Preview Modal */}
      {importPreview && (
        <div className="import-overlay" onClick={handleImportClose}>
          <div className="import-modal" onClick={e => e.stopPropagation()}>
            <div className="import-modal-header">
              <h2>Till Statement Import Preview</h2>
              <button className="import-modal-close" onClick={handleImportClose}>&times;</button>
            </div>

            <div className="import-modal-body">
              <div className="import-stats-row">
                <div className="import-stat">
                  <span className="import-stat-value">{importPreview.summary?.totalExcelRows || 0}</span>
                  <span className="import-stat-label">Excel Rows</span>
                </div>
                <div className="import-stat">
                  <span className="import-stat-value">{importPreview.summary?.salesGroups || 0}</span>
                  <span className="import-stat-label">Sales Groups</span>
                </div>
                <div className="import-stat import-stat--success">
                  <span className="import-stat-value">{importPreview.summary?.stationsAffected?.length || 0}</span>
                  <span className="import-stat-label">Stations</span>
                </div>
                <div className="import-stat import-stat--warning">
                  <span className="import-stat-value">{importPreview.summary?.blocked || 0}</span>
                  <span className="import-stat-label">Blocked</span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '16px', margin: '12px 0', fontSize: '14px', color: '#64748b' }}>
                <span>Date: <strong style={{ color: '#1e293b' }}>{importPreview.detectedDate || '-'}</strong></span>
                <span>File: <strong style={{ color: '#1e293b' }}>{importFile?.name}</strong></span>
                <span>Skipped receipts: <strong>{importPreview.summary?.skippedReceipts || 0}</strong></span>
              </div>

              {importPreview.warnings?.length > 0 && (
                <div className="import-warnings">
                  <strong>Warnings ({importPreview.warnings.length}):</strong>
                  <ul>
                    {importPreview.warnings.slice(0, 5).map((w, i) => (
                      <li key={i}>{w.message}</li>
                    ))}
                    {importPreview.warnings.length > 5 && (
                      <li>...and {importPreview.warnings.length - 5} more</li>
                    )}
                  </ul>
                </div>
              )}

              <div style={{ maxHeight: '400px', overflowY: 'auto', marginTop: '12px' }}>
                <table className="simple-table" style={{ fontSize: '13px' }}>
                  <thead>
                    <tr>
                      <th>Station</th>
                      <th>Agent</th>
                      <th>Currency</th>
                      <th className="text-right">Sales</th>
                      <th className="text-right">Cashout</th>
                      <th className="text-right">Net</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(importPreview.salesGroups || []).map((g, i) => (
                      <tr key={i} style={g.action === 'blocked' ? { opacity: 0.5, background: '#fff1f2' } : {}}>
                        <td><span className="station-code">{g.stationCode}</span></td>
                        <td>{g.agentName || 'Station Total'}</td>
                        <td>{g.currency}</td>
                        <td className="text-right amount">{fmtImportAmt(g.salesAmount)}</td>
                        <td className="text-right amount" style={{ color: g.cashoutAmount > 0 ? '#ef4444' : undefined }}>{fmtImportAmt(g.cashoutAmount)}</td>
                        <td className="text-right amount" style={{ fontWeight: 600 }}>{fmtImportAmt(g.netAmount)}</td>
                        <td>
                          <span className={`import-action-tag import-action-tag--${g.action}`}>
                            {g.action === 'create_settlement' ? 'New DRAFT' :
                             g.action === 'extend_draft' ? 'Extend DRAFT' :
                             g.action === 'overwrite_in_draft' ? 'Overwrite' :
                             g.action === 'blocked' ? 'Blocked' : g.action}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="import-modal-footer">
              <button className="simple-btn simple-btn-secondary" onClick={handleImportClose}>
                Cancel
              </button>
              <button
                className="import-till-btn"
                onClick={handleImportExecute}
                disabled={importLoading || (importPreview.salesGroups || []).every(g => g.action === 'blocked')}
              >
                {importLoading ? 'Importing...' : `Import ${(importPreview.salesGroups || []).filter(g => g.action !== 'blocked').length} Sales Groups`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Result Modal */}
      {importResult && (
        <div className="import-overlay" onClick={() => setImportResult(null)}>
          <div className="import-modal import-modal--result" onClick={e => e.stopPropagation()}>
            <div className="import-modal-header" style={{ background: importResult.summary?.errors > 0 ? '#fef2f2' : '#f0fdf4' }}>
              <h2>{importResult.summary?.errors > 0 ? 'Import Completed with Errors' : 'Import Successful'}</h2>
              <button className="import-modal-close" onClick={() => setImportResult(null)}>&times;</button>
            </div>

            <div className="import-modal-body">
              <div className="import-stats-row">
                <div className="import-stat import-stat--success">
                  <span className="import-stat-value">{importResult.summary?.salesCreated || 0}</span>
                  <span className="import-stat-label">Sales Created</span>
                </div>
                <div className="import-stat">
                  <span className="import-stat-value">{importResult.summary?.settlementsCreated || 0}</span>
                  <span className="import-stat-label">New Settlements</span>
                </div>
                <div className="import-stat">
                  <span className="import-stat-value">{importResult.summary?.settlementsExtended || 0}</span>
                  <span className="import-stat-label">Extended</span>
                </div>
                <div className="import-stat import-stat--warning">
                  <span className="import-stat-value">{importResult.summary?.blocked || 0}</span>
                  <span className="import-stat-label">Blocked</span>
                </div>
              </div>

              <div style={{ maxHeight: '300px', overflowY: 'auto', marginTop: '16px' }}>
                <table className="simple-table" style={{ fontSize: '13px' }}>
                  <thead>
                    <tr>
                      <th>Action</th>
                      <th>Station</th>
                      <th>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(importResult.results || []).map((r, i) => (
                      <tr key={i} style={r.action === 'blocked' ? { background: '#fff1f2' } : r.action === 'error' ? { background: '#fef2f2' } : {}}>
                        <td>
                          <span className={`import-action-tag import-action-tag--${r.action === 'sale_created' ? 'create_settlement' : r.action}`}>
                            {r.action === 'sale_created' ? 'Sale' :
                             r.action === 'create_settlement' ? 'New Settlement' :
                             r.action === 'extend_draft' ? 'Extended' :
                             r.action === 'overwrite_in_draft' ? 'Overwritten' :
                             r.action === 'blocked' ? 'Blocked' :
                             r.action === 'error' ? 'Error' : r.action}
                          </span>
                        </td>
                        <td><span className="station-code">{r.stationCode}</span></td>
                        <td style={{ fontSize: '12px', color: '#64748b' }}>
                          {r.action === 'sale_created' && `${r.agent} | ${r.currency} ${fmtImportAmt(r.netAmount)}`}
                          {r.action === 'create_settlement' && `New DRAFT for ${r.date}`}
                          {r.action === 'extend_draft' && `${r.settlementNumber} -> ${r.newPeriod}`}
                          {r.action === 'overwrite_in_draft' && `${r.settlementNumber} on ${r.date}`}
                          {r.action === 'blocked' && r.reason}
                          {r.action === 'error' && <span style={{ color: '#ef4444' }}>{r.reason}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="import-modal-footer">
              <button className="import-till-btn" onClick={() => setImportResult(null)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
