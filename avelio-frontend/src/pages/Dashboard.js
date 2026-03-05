// src/pages/Dashboard.js
import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import ReceiptDetailsModal from './ReceiptDetailsModal';
import { getApiBaseUrl } from '../services/api';
import './Dashboard.css';

export default function Dashboard() {
  const navigate = useNavigate();
  const [receipts, setReceipts] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Modal state
  const [selectedReceipt, setSelectedReceipt] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const token =
    localStorage.getItem('token') ||
    localStorage.getItem('authToken') ||
    sessionStorage.getItem('token');

  // Use centralized API URL detection
  const API_BASE = getApiBaseUrl();

  // Fetch stats from dedicated endpoint
  const fetchStats = async () => {
    try {
      const res = await fetch(`${API_BASE}/stats/dashboard`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Failed to fetch stats');
      const data = await res.json();
      return data?.data || null;
    } catch (err) {
      console.error('Stats fetch error:', err);
      return null;
    }
  };

  // Fetch today's receipts for display
  const fetchReceipts = async () => {
    try {
      // Get today's date in Africa/Juba timezone
      const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Africa/Juba' });
      const res = await fetch(`${API_BASE}/receipts?date_from=${today}&date_to=${today}&pageSize=20`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Failed to fetch receipts');
      const data = await res.json();
      const list =
        data?.receipts ??
        data?.data?.receipts ??
        data?.data?.rows ??
        data?.rows ??
        data?.list ??
        [];
      return Array.isArray(list) ? list : [];
    } catch (err) {
      console.error('Receipts fetch error:', err);
      return [];
    }
  };

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError('');

        // Fetch stats and today's receipts in parallel (overdue count comes from stats API)
        const [statsData, receiptsList] = await Promise.all([
          fetchStats(),
          fetchReceipts()
        ]);

        setStats(statsData);
        setReceipts(receiptsList);
      } catch (err) {
        setError(err.message || 'Failed to load dashboard');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [API_BASE, token, refreshTrigger]);

  // Stats from the API (overdue count calculated server-side, no need for client-side fetch)
  const todayCount = stats?.today?.receipt_count || 0;
  const paidCount = stats?.paid?.count || 0;
  const pendingCount = stats?.pending?.count || 0;
  const overdueCount = stats?.pending?.overdue_count || 0;

  // Navigation handlers with query params
  const handleStatClick = (filterType) => {
    switch (filterType) {
      case 'today':
        navigate('/receipts?date=today');
        break;
      case 'paid':
        navigate('/receipts?status=PAID&date=today');
        break;
      case 'pending':
        navigate('/receipts?status=PENDING&date=today');
        break;
      case 'overdue':
        navigate('/receipts?filter=overdue&date=today');
        break;
      default:
        navigate('/receipts');
    }
  };

  // Modal handlers
  const handleReceiptClick = (receipt) => {
    setSelectedReceipt(receipt);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedReceipt(null);
  };

  const handleStatusUpdated = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  return (
    <div className="dashboard-container">
      <div className="dashboard-content">
        {/* === Page Header === */}
        <div className="page-header">
          <div className="page-title-section">
            <h2 className="page-title">Dashboard</h2>
            <span className="page-subtitle">
              Overview of latest receipts and quick navigation
            </span>
          </div>
          <Link to="/new-receipt" className="action-btn">+ New Receipt</Link>
        </div>

        {/* === Stats Grid === */}
        <div className="stats-grid">
          <div 
            className="stat-card" 
            onClick={() => handleStatClick('today')}
            style={{ cursor: 'pointer' }}
          >
            <div className="stat-header">
              <span className="stat-label">Today's Receipts</span>
              <div className="stat-icon">📅</div>
            </div>
            <div className="stat-value">{todayCount}</div>
            <div className="stat-subtext">Receipts issued today</div>
          </div>

          <div 
            className="stat-card"
            onClick={() => handleStatClick('paid')}
            style={{ cursor: 'pointer' }}
          >
            <div className="stat-header">
              <span className="stat-label">Paid</span>
              <div className="stat-icon">✅</div>
            </div>
            <div className="stat-value">{paidCount}</div>
            <div className="stat-subtext">Paid today</div>
          </div>

          <div 
            className="stat-card"
            onClick={() => handleStatClick('pending')}
            style={{ cursor: 'pointer' }}
          >
            <div className="stat-header">
              <span className="stat-label">Pending</span>
              <div className="stat-icon">⏳</div>
            </div>
            <div className="stat-value">{pendingCount}</div>
            <div className="stat-subtext">Pending today</div>
          </div>

          <div 
            className="stat-card"
            onClick={() => handleStatClick('overdue')}
            style={{ cursor: 'pointer' }}
          >
            <div className="stat-header">
              <span className="stat-label">Overdue</span>
              <div className="stat-icon">⚠️</div>
            </div>
            <div className="stat-value">{overdueCount}</div>
            <div className="stat-subtext">Overdue today</div>
          </div>
        </div>

        {/* === Today's Receipts === */}
        <div className="section-header">
          <h2 className="section-title">Today's Receipts</h2>
          <button
            className="action-btn"
            style={{ padding: '10px 18px' }}
            onClick={() => navigate('/receipts')}
          >
            View All Receipts
          </button>
        </div>

        {error && <div className="dashboard-error">{error}</div>}

        {loading ? (
          <div className="empty-state">
            <div className="empty-icon">🌀</div>
            <div className="empty-title">Loading receipts…</div>
          </div>
        ) : receipts.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🔭</div>
            <div className="empty-title">No receipts found</div>
            <div className="empty-text">Start by creating your first receipt.</div>
            <Link to="/new-receipt" className="action-btn">+ New Receipt</Link>
          </div>
        ) : (
          <div className="receipts-list">
            {receipts.slice(0, 8).map(r => (
              <div 
                key={r.id || r.receipt_number} 
                className="receipt-card"
                onClick={() => handleReceiptClick(r)}
                style={{ cursor: 'pointer' }}
              >
                <div className="receipt-left">
                  <div className="receipt-avatar">💵</div>
                  <div className="receipt-info">
                    <div className="receipt-number">{r.receipt_number}</div>
                    <div className="receipt-agency">
                      <strong>{r.agency_name || r.agency?.agency_name || 'N/A'}</strong>
                    </div>
                    <div className="receipt-time">
                      {new Date(r.issue_date).toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        timeZone: 'Africa/Juba',
                      })}
                    </div>
                  </div>
                </div>
                <div className="receipt-meta">
                  <div className="receipt-amount">
                    {Number(r.amount || 0).toFixed(2)} {r.currency || 'USD'}
                  </div>
                  <div
                    className={`receipt-status ${
                      r.status?.toLowerCase() === 'paid' ? 'paid' : 'pending'
                    }`}
                  >
                    {r.status?.toUpperCase() || '-'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

      </div>

      {/* Receipt Details Modal */}
      <ReceiptDetailsModal
        receipt={selectedReceipt}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onStatusUpdated={handleStatusUpdated}
      />
    </div>
  );
}