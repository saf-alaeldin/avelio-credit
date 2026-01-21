// src/pages/Receipts.js
import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import ReceiptDetailsModal from '../pages/ReceiptDetailsModal';
import { getApiBaseUrl } from '../services/api';
import './Receipts.css';

// Use centralized API URL detection
const API_BASE = getApiBaseUrl();

async function apiGet(path, params = {}) {
  // Build URL - handle both relative and absolute API_BASE
  const baseUrl = API_BASE.startsWith('/') ? window.location.origin + API_BASE : API_BASE;
  const url = new URL(baseUrl + path);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const token =
    localStorage.getItem('token') ||
    localStorage.getItem('authToken') ||
    sessionStorage.getItem('token');
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(msg || `HTTP ${res.status}`);
  }
  return await res.json();
}

// Helper: Check if receipt is overdue (PENDING + >3 days old)
const isOverdue = (receipt) => {
  if (receipt.status?.toUpperCase() !== 'PENDING') return false;
  const issueDate = new Date(receipt.issue_date);
  const daysDiff = Math.floor((Date.now() - issueDate) / (1000 * 60 * 60 * 24));
  return daysDiff > 3;
};

export default function Receipts() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [receipts, setReceipts] = useState([]);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [total, setTotal] = useState(0);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  
  // Modal state
  const [selectedReceipt, setSelectedReceipt] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Local filter state (for manual filters like search, date inputs)
  const [manualDateFrom, setManualDateFrom] = useState('');
  const [manualDateTo, setManualDateTo] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Read and compute filters from URL params directly (no state sync needed)
  const urlStatus = searchParams.get('status') || '';
  const urlDate = searchParams.get('date') || '';
  const urlFilter = searchParams.get('filter') || '';

  // Compute effective filter values
  const statusFilter = urlStatus ? urlStatus.toUpperCase() : '';
  const overdueFilter = urlFilter === 'overdue';

  // Date filter: use manual dates if set, otherwise use URL date
  let dateFrom = manualDateFrom;
  let dateTo = manualDateTo;

  if (!manualDateFrom && !manualDateTo && urlDate === 'today') {
    const today = new Date().toISOString().split('T')[0];
    dateFrom = today;
    dateTo = today;
  }

  // Fetch receipts function
  const fetchReceipts = async () => {
    try {
      setLoading(true);
      setError('');

      // Build API params - for overdue, fetch all PENDING receipts
      const params = { page, pageSize };

      // For overdue filter, we need to fetch PENDING and filter client-side
      if (overdueFilter) {
        params.status = 'PENDING';
      } else if (statusFilter) {
        params.status = statusFilter;
      }

      // Add search parameter for server-side search
      if (searchQuery && searchQuery.trim()) {
        params.search = searchQuery.trim();
      }

      // Allow single date selection - if only one date is selected, use it for both
      if (dateFrom && !dateTo) {
        params.date_from = dateFrom;
        params.date_to = dateFrom; // Use same date for single day filter
      } else if (!dateFrom && dateTo) {
        params.date_from = dateTo; // Use same date for single day filter
        params.date_to = dateTo;
      } else {
        if (dateFrom) params.date_from = dateFrom;
        if (dateTo) params.date_to = dateTo;
      }

      const data = await apiGet('/receipts', params);

      let list =
        data?.receipts ??
        data?.data?.receipts ??
        data?.data?.rows ??
        data?.rows ??
        data?.list ??
        [];

      if (!Array.isArray(list)) {
        list = [];
      }

      // Apply client-side filters for overdue and pending (to separate them)
      if (overdueFilter) {
        // OVERDUE: Only PENDING receipts older than 3 days
        list = list.filter(r => {
          const st = String(r.status || '').toUpperCase();
          return st === 'PENDING' && isOverdue(r);
        });
      } else if (statusFilter === 'PENDING' && !searchQuery) {
        // PENDING: Only PENDING receipts NOT overdue (but skip this filter if searching)
        list = list.filter(r => {
          const st = String(r.status || '').toUpperCase();
          return st === 'PENDING' && !isOverdue(r);
        });
      }
      // For PAID, date filters, and ALL tab, trust backend filtering
      // Note: Search is now handled server-side, so no client-side filtering needed

      const tot =
        (typeof data?.total === 'number' && data.total) ??
        (typeof data?.data?.total === 'number' && data.data.total) ??
        (typeof data?.pagination?.total === 'number' && data.pagination.total) ??
        list.length;

      setReceipts(list);
      // Use filtered list length only for client-side filters (overdue, pending without search)
      const useFilteredCount = overdueFilter || (statusFilter === 'PENDING' && !searchQuery);
      setTotal(useFilteredCount ? list.length : Number(tot || 0));
    } catch (e) {
      setError(e.message || 'Failed to load receipts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReceipts();
  }, [page, statusFilter, dateFrom, dateTo, overdueFilter, searchQuery, refreshTrigger]);

  const pages = Math.max(1, Math.ceil((total || 0) / pageSize));
  
  const statusPill = (receipt) => {
    const s = String(receipt.status || '').toUpperCase();

    // Check if receipt is overdue
    if (isOverdue(receipt)) {
      return <span className="receipts-status receipts-status--overdue">OVERDUE</span>;
    }

    const cls =
      s === 'PAID' ? 'receipts-status receipts-status--paid' :
      s === 'PENDING' ? 'receipts-status receipts-status--pending' :
      'receipts-status receipts-status--void';
    return <span className={cls}>{s || '-'}</span>;
  };

  const displayTZ = 'Africa/Juba';

  const formatDT = (dateStr, timeStr) => {
    if (!dateStr) return '-';

    if (timeStr) {
      const base = new Date(
        typeof dateStr === 'string' && dateStr.includes('T')
          ? dateStr
          : `${dateStr}T00:00:00Z`
      );

      const dateOnly = new Intl.DateTimeFormat('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        timeZone: displayTZ,
      }).format(base);

      const hhmm = String(timeStr).slice(0, 5);
      return `${dateOnly}, ${hhmm}`;
    }

    const dt = new Date(dateStr);
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: displayTZ,
    }).format(dt);
  };

  const clearFilters = () => {
    setManualDateFrom('');
    setManualDateTo('');
    setSearchQuery('');
    setPage(1);
    setSearchParams({});
  };

  const handleStatusFilterClick = (status) => {
    setManualDateFrom('');
    setManualDateTo('');
    setPage(1);
    // Update URL params to match the filter state
    const urlDate = searchParams.get('date');
    if (status) {
      setSearchParams({ status: status });
    } else if (urlDate) {
      // Keep date filter when clicking "All" tab
      setSearchParams({ date: urlDate });
    } else {
      setSearchParams({});
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
    <div className="receipts-page">
      <div className="receipts-header">
        <div>
          <h2 className="receipts-title">All Receipts</h2>
          <p className="receipts-subtitle">{total} total receipts</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link className="receipts-btn" to="/new-receipt">+ New Receipt</Link>
        </div>
      </div>

      {/* Search Section */}
      <div className="receipts-search-section">
        <div style={{
          position: 'relative',
          flex: 1,
          maxWidth: '400px'
        }}>
          <Search
            size={18}
            style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: '#64748B'
            }}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Search receipts, agencies, amounts, status..."
            style={{
              width: '100%',
              padding: '10px 12px 10px 40px',
              border: '1.5px solid #E2E8F0',
              borderRadius: '10px',
              fontSize: '14px',
              fontFamily: 'inherit',
              transition: 'all 0.2s',
              outline: 'none'
            }}
            onFocus={(e) => e.target.style.borderColor = '#0EA5E9'}
            onBlur={(e) => e.target.style.borderColor = '#E2E8F0'}
          />
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery('');
                setPage(1);
              }}
              style={{
                position: 'absolute',
                right: '8px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                color: '#64748B',
                cursor: 'pointer',
                padding: '4px 8px',
                fontSize: '18px',
                lineHeight: '1'
              }}
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Filters Section */}
      <div className="receipts-filters-section">
        {/* Status Filter Tabs */}
        <div className="receipts-filter-tabs">
          <button
            className={`receipts-filter-tab ${statusFilter === '' && !overdueFilter ? 'active' : ''}`}
            onClick={() => handleStatusFilterClick('')}
          >
            All
          </button>
          <button
            className={`receipts-filter-tab ${statusFilter === 'PAID' ? 'active' : ''}`}
            onClick={() => handleStatusFilterClick('PAID')}
          >
            Paid
          </button>
          <button
            className={`receipts-filter-tab ${statusFilter === 'PENDING' && !overdueFilter ? 'active' : ''}`}
            onClick={() => handleStatusFilterClick('PENDING')}
          >
            Pending
          </button>
          <button
            className={`receipts-filter-tab ${overdueFilter ? 'active' : ''}`}
            onClick={() => {
              setManualDateFrom('');
              setManualDateTo('');
              setPage(1);
              // Update URL params to match the overdue filter
              setSearchParams({ filter: 'overdue' });
            }}
          >
            Overdue
          </button>
        </div>

        {/* Date Filters */}
        <div className="receipts-date-filters">
          <div className="receipts-date-input-group">
            <label className="receipts-date-label">From Date</label>
            <input
              type="date"
              className="receipts-date-input"
              value={manualDateFrom}
              onChange={(e) => {
                setManualDateFrom(e.target.value);
                setPage(1);
                // Clear URL params when manually changing date filters
                setSearchParams({});
              }}
              title="Select start date (optional)"
            />
          </div>
          <div className="receipts-date-input-group">
            <label className="receipts-date-label">To Date</label>
            <input
              type="date"
              className="receipts-date-input"
              value={manualDateTo}
              onChange={(e) => {
                setManualDateTo(e.target.value);
                setPage(1);
                // Clear URL params when manually changing date filters
                setSearchParams({});
              }}
              title="Select end date (optional)"
            />
          </div>
          {(dateFrom || dateTo || statusFilter || overdueFilter || searchQuery) && (
            <button className="receipts-clear-btn" onClick={clearFilters}>
              Clear Filters
            </button>
          )}
        </div>
      </div>

      <div className="receipts-card">
        {error && <div className="receipts-error">{error}</div>}
        {loading ? (
          <div className="receipts-loading">Loading…</div>
        ) : receipts.length === 0 ? (
          <div className="receipts-empty">No receipts found.</div>
        ) : (
          <>
            <div className="receipts-table-wrap">
              <table className="receipts-table">
                <thead>
                  <tr>
                    <th className="receipts-th">Receipt #</th>
                    <th className="receipts-th">Agency</th>
                    <th className="receipts-th">Amount</th>
                    <th className="receipts-th">Paid</th>
                    <th className="receipts-th">Currency</th>
                    <th className="receipts-th">Status</th>
                    <th className="receipts-th">Issue Date</th>
                    <th className="receipts-th">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {receipts.map((receipt) => {
                    const amountPaid = parseFloat(receipt.amount_paid || 0);
                    const hasPartialPayment = amountPaid > 0 && receipt.status?.toUpperCase() === 'PENDING';

                    return (
                      <tr
                        key={receipt.id || receipt.receipt_number}
                        onClick={() => handleReceiptClick(receipt)}
                        style={{ cursor: 'pointer' }}
                      >
                        <td className="receipts-td">{receipt.receipt_number}</td>
                        <td className="receipts-td">{receipt.agency?.agency_name || receipt.agency_name || 'N/A'}</td>
                        <td className="receipts-td">{Number(receipt.amount || 0).toFixed(2)}</td>
                        <td className="receipts-td" style={{ color: amountPaid > 0 ? '#48bb78' : '#718096' }}>
                          {amountPaid.toFixed(2)}
                        </td>
                        <td className="receipts-td">{receipt.currency || '-'}</td>
                        <td className="receipts-td">
                          {statusPill(receipt)}
                          {hasPartialPayment && <span style={{ marginLeft: '4px', fontSize: '11px', color: '#f6ad55' }}>(Partial)</span>}
                        </td>
                        <td className="receipts-td">{formatDT(receipt.issue_date, receipt.issue_time)}</td>
                      <td className="receipts-td">
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            className="receipts-btn receipts-btn--ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleReceiptClick(receipt);
                            }}
                          >
                            View
                          </button>
                          <button
                            className="receipts-btn receipts-btn--ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              (async () => {
                                let objectUrl = null;
                                try {
                                  const token =
                                    localStorage.getItem('token') ||
                                    localStorage.getItem('authToken') ||
                                    sessionStorage.getItem('token');
                                  const res = await fetch(`${API_BASE}/receipts/${receipt.id}/pdf`, {
                                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                                  });
                                  if (!res.ok) {
                                    const errorText = await res.text().catch(() => '');
                                    throw new Error(errorText || `Failed to fetch PDF (HTTP ${res.status})`);
                                  }
                                  const blob = await res.blob();
                                  if (blob.size === 0) {
                                    throw new Error('PDF file is empty');
                                  }
                                  objectUrl = window.URL.createObjectURL(blob);
                                  window.open(objectUrl, '_blank');
                                  // Revoke URL after a delay to allow browser to load
                                  setTimeout(() => {
                                    if (objectUrl) window.URL.revokeObjectURL(objectUrl);
                                  }, 60000); // 1 minute delay
                                } catch (err) {
                                  // Clean up object URL if created
                                  if (objectUrl) window.URL.revokeObjectURL(objectUrl);
                                  // Show error in a more user-friendly way
                                  setError(`PDF download failed: ${err.message}`);
                                  // Clear error after 5 seconds
                                  setTimeout(() => setError(''), 5000);
                                }
                              })();
                            }}
                          >
                            PDF
                          </button>
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="receipts-pagination">
              <button
                className="receipts-pagebtn"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Prev
              </button>
              <span>Page {page} / {pages}</span>
              <button
                className="receipts-pagebtn"
                disabled={page >= pages}
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
              >
                Next
              </button>
            </div>
          </>
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