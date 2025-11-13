// src/pages/Receipts.js
import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import ReceiptDetailsModal from '../pages/ReceiptDetailsModal';
import './Receipts.css';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5001/api/v1';

async function apiGet(path, params = {}) {
  const url = new URL(API_BASE + path);
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
  
  // Read filters from URL or component state
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [overdueFilter, setOverdueFilter] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Initialize filters from URL params on mount
  useEffect(() => {
    const urlStatus = searchParams.get('status') || '';
    const urlDate = searchParams.get('date') || '';
    const urlFilter = searchParams.get('filter') || '';

    console.log('URL Params:', { urlStatus, urlDate, urlFilter });

    // Determine new filter values based on URL params
    let newStatusFilter = '';
    let newDateFrom = '';
    let newDateTo = '';
    let newOverdueFilter = false;

    // Handle "today" date filter
    if (urlDate === 'today') {
      const today = new Date().toISOString().split('T')[0];
      console.log('Setting today filter:', today);
      newDateFrom = today;
      newDateTo = today;
    }

    // Handle status filter (PAID or PENDING)
    if (urlStatus) {
      console.log('Setting status filter:', urlStatus.toUpperCase());
      newStatusFilter = urlStatus.toUpperCase();
    }

    // Handle overdue filter
    if (urlFilter === 'overdue') {
      console.log('Setting overdue filter');
      newOverdueFilter = true;
      newStatusFilter = 'PENDING';
    }

    // Batch update all filters at once to prevent multiple renders
    setStatusFilter(newStatusFilter);
    setDateFrom(newDateFrom);
    setDateTo(newDateTo);
    setOverdueFilter(newOverdueFilter);
    setPage(1);
  }, [searchParams]);

  // Fetch receipts function
  const fetchReceipts = async () => {
    try {
      setLoading(true);
      setError('');

      console.log('=== FETCH TRIGGERED ===');
      console.log('Current filter state:', { statusFilter, dateFrom, dateTo, overdueFilter, page });

      // Build API params - for overdue, fetch all PENDING receipts
      const params = { page, pageSize };

      // For overdue filter, we need to fetch PENDING and filter client-side
      if (overdueFilter) {
        params.status = 'PENDING';
      } else if (statusFilter) {
        params.status = statusFilter;
      }

      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;

      console.log('Fetching receipts with params:', params);
      console.log('Filter state:', { statusFilter, dateFrom, dateTo, overdueFilter });

      const data = await apiGet('/receipts', params);
      console.log('API Response:', data);

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
      } else if (statusFilter === 'PENDING') {
        // PENDING: Only PENDING receipts NOT overdue
        list = list.filter(r => {
          const st = String(r.status || '').toUpperCase();
          return st === 'PENDING' && !isOverdue(r);
        });
      }
      // For PAID, date filters, and ALL tab, trust backend filtering

      // Apply client-side search filtering if needed
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        list = list.filter(receipt =>
          receipt.receipt_number?.toLowerCase().includes(query) ||
          receipt.agency_name?.toLowerCase().includes(query) ||
          receipt.agency_id?.toLowerCase().includes(query)
        );
      }

      const tot =
        (typeof data?.total === 'number' && data.total) ??
        (typeof data?.data?.total === 'number' && data.data.total) ??
        (typeof data?.pagination?.total === 'number' && data.pagination.total) ??
        list.length;

      setReceipts(list);
      // Use filtered list length when applying client-side filters (overdue, pending, or search)
      const useFilteredCount = overdueFilter || statusFilter === 'PENDING' || searchQuery.trim();
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
    setStatusFilter('');
    setDateFrom('');
    setDateTo('');
    setOverdueFilter(false);
    setSearchQuery('');
    setPage(1);
    setSearchParams({});
  };

  const handleStatusFilterClick = (status) => {
    setStatusFilter(status);
    setOverdueFilter(false);
    setPage(1);
    // Update URL params to match the filter state
    // Preserve date filter from URL if it exists
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
            placeholder="Search by receipt number or agency..."
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
              setOverdueFilter(true);
              setStatusFilter('PENDING');
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
            <label className="receipts-date-label">From</label>
            <input
              type="date"
              className="receipts-date-input"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setOverdueFilter(false);
                // Clear URL params when manually changing date filters
                setSearchParams({});
              }}
            />
          </div>
          <div className="receipts-date-input-group">
            <label className="receipts-date-label">To</label>
            <input
              type="date"
              className="receipts-date-input"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setOverdueFilter(false);
                // Clear URL params when manually changing date filters
                setSearchParams({});
              }}
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
                    <th className="receipts-th">Currency</th>
                    <th className="receipts-th">Status</th>
                    <th className="receipts-th">Issue Date</th>
                    <th className="receipts-th">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {receipts.map((receipt) => (
                    <tr 
                      key={receipt.id || receipt.receipt_number}
                      onClick={() => handleReceiptClick(receipt)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td className="receipts-td">{receipt.receipt_number}</td>
                      <td className="receipts-td">{receipt.agency?.agency_name || receipt.agency_name || 'N/A'}</td>
                      <td className="receipts-td">{Number(receipt.amount || 0).toFixed(2)}</td>
                      <td className="receipts-td">{receipt.currency || '-'}</td>
                      <td className="receipts-td">{statusPill(receipt)}</td>
                      <td className="receipts-td">{formatDT(receipt.issue_date, receipt.issue_time)}</td>
                      <td className="receipts-td">
                        <button
                          className="receipts-btn receipts-btn--ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            (async () => {
                              try {
                                const token =
                                  localStorage.getItem('token') ||
                                  localStorage.getItem('authToken') ||
                                  sessionStorage.getItem('token');
                                const res = await fetch(`${API_BASE}/receipts/${receipt.id}/pdf`, {
                                  headers: token ? { Authorization: `Bearer ${token}` } : {},
                                });
                                if (!res.ok) throw new Error('Failed to fetch PDF');
                                const blob = await res.blob();
                                const url = window.URL.createObjectURL(blob);
                                window.open(url, '_blank');
                              } catch (err) {
                                alert('Error downloading PDF: ' + err.message);
                              }
                            })();
                          }}
                        >
                          PDF
                        </button>
                      </td>
                    </tr>
                  ))}
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