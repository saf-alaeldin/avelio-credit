// src/pages/TravelAgencies.js
import React, { useEffect, useState, useRef } from 'react';
import { getApiBaseUrl } from '../services/api';
import cache, { CACHE_KEYS } from '../utils/cache';
import './TravelAgencies.css';

// Use centralized API URL detection
const API_BASE = getApiBaseUrl();

const authHeaders = () => {
  const token =
    localStorage.getItem('token') ||
    localStorage.getItem('authToken') ||
    sessionStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

async function apiGet(path) {
  const res = await fetch(API_BASE + path, { headers: authHeaders() });
  if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
  return await res.json();
}
async function apiPost(path, body) {
  const res = await fetch(API_BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  });
  const txt = await res.text();
  const data = txt ? JSON.parse(txt) : {};
  if (!res.ok) {
    const msg = data?.message || data?.error || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

export default function TravelAgencies() {
  const [loading, setLoading] = useState(true);
  const [agencies, setAgencies] = useState([]);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Add modal state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [form, setForm] = useState({ agency_name: '', agency_id: '', contact_email: '' });
  const [formErr, setFormErr] = useState('');
  const [saving, setSaving] = useState(false);

  // Import state
  const fileInputRef = useRef(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);

  // Agency details modal state
  const [selectedAgency, setSelectedAgency] = useState(null);
  const [agencyStats, setAgencyStats] = useState(null);
  const [agencyReceipts, setAgencyReceipts] = useState([]);
  const [loadingReceipts, setLoadingReceipts] = useState(false);
  const [receiptsError, setReceiptsError] = useState('');
  const [receiptsPage, setReceiptsPage] = useState(1);
  const [totalReceipts, setTotalReceipts] = useState(0);
  const RECEIPTS_PAGE_SIZE = 50;

  const load = async (isMounted = () => true) => {
    try {
      setLoading(true);
      setError('');
      const data = await apiGet('/agencies');
      if (!isMounted()) return; // Prevent state update if unmounted
      const list = data?.data?.agencies || data?.agencies || [];
      setAgencies(Array.isArray(list) ? list : []);
    } catch (e) {
      if (!isMounted()) return; // Prevent state update if unmounted
      setError(e.message || 'Failed to load agencies');
    } finally {
      if (isMounted()) setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    load(() => mounted);
    return () => { mounted = false; }; // Cleanup on unmount
  }, []);

  // Fetch stats for a specific agency (server-side aggregation)
  const fetchAgencyStats = async (agency) => {
    try {
      const data = await apiGet(`/agencies/${agency.agency_id}/stats`);
      setAgencyStats(data?.data || null);
    } catch (e) {
      console.error('Agency stats error:', e);
      setAgencyStats(null);
    }
  };

  // Fetch paginated receipts for a specific agency
  const fetchAgencyReceipts = async (agency, page = 1) => {
    try {
      setLoadingReceipts(true);
      setReceiptsError('');

      const data = await apiGet(`/receipts?agency_id=${agency.agency_id}&pageSize=${RECEIPTS_PAGE_SIZE}&page=${page}`);
      const receipts = data?.data?.receipts || data?.receipts || [];
      const total = data?.data?.total || data?.total || receipts.length;
      setAgencyReceipts(receipts);
      setTotalReceipts(total);
    } catch (e) {
      setReceiptsError(e.message || 'Failed to load receipts');
      setAgencyReceipts([]);
    } finally {
      setLoadingReceipts(false);
    }
  };

  // Open agency details modal
  const openAgencyDetails = async (agency) => {
    setSelectedAgency(agency);
    setReceiptsPage(1);
    setAgencyStats(null);
    // Fetch stats and first page of receipts in parallel
    await Promise.all([
      fetchAgencyStats(agency),
      fetchAgencyReceipts(agency, 1)
    ]);
  };

  // Handle page change in receipts table
  const handleReceiptsPageChange = (newPage) => {
    setReceiptsPage(newPage);
    if (selectedAgency) {
      fetchAgencyReceipts(selectedAgency, newPage);
    }
  };

  // Close agency details modal
  const closeAgencyDetails = () => {
    setSelectedAgency(null);
    setAgencyStats(null);
    setAgencyReceipts([]);
    setReceiptsError('');
    setReceiptsPage(1);
    setTotalReceipts(0);
  };

  // Filtered list
  const filteredAgencies = agencies.filter(a => {
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    return (
      (a.agency_name || '').toLowerCase().includes(q) ||
      String(a.agency_id || '').toLowerCase().includes(q) ||
      (a.contact_person || '').toLowerCase().includes(q) ||
      (a.contact_email || '').toLowerCase().includes(q)
    );
  });

  // --- Add Agency handlers ---
  const openAdd = () => {
    setForm({ agency_name: '', agency_id: '', contact_email: '' });
    setFormErr('');
    setIsAddOpen(true);
  };
  const closeAdd = () => {
    if (!saving) setIsAddOpen(false);
  };
  const validateEmail = (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  const handleSave = async (e) => {
    e.preventDefault();
    setFormErr('');

    const { agency_name, agency_id, contact_email } = form;
    if (!agency_name.trim() || !agency_id.trim()) {
      setFormErr('Agency name and ID are required.');
      return;
    }
    if (!validateEmail(contact_email)) {
      setFormErr('Please enter a valid email (or leave blank).');
      return;
    }

    try {
      setSaving(true);
      await apiPost('/agencies', {
        agency_name: agency_name.trim(),
        agency_id: agency_id.trim(),
        contact_email: contact_email.trim() || null,
        is_active: true,
      });
      cache.delete(CACHE_KEYS.AGENCIES); // Invalidate so NewReceipt picks up the new agency
      setIsAddOpen(false);
      await load();
    } catch (err) {
      setFormErr(err.message || 'Failed to add agency');
    } finally {
      setSaving(false);
    }
  };

  // --- Import handlers ---
  const triggerImport = () => fileInputRef.current?.click();

  const parseCSV = (text) => {
    // Improved CSV parser with better handling
    // Remove BOM if present
    text = text.replace(/^\uFEFF/, '');

    // Split by various line endings and filter out empty lines
    const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length === 0) return [];

    // Parse a CSV line handling quoted fields
    const parseLine = (line) => {
      const result = [];
      let current = '';
      let inQuotes = false;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const nextChar = line[i + 1];

        if (char === '"') {
          if (inQuotes && nextChar === '"') {
            // Escaped quote
            current += '"';
            i++; // Skip next quote
          } else {
            // Toggle quote state
            inQuotes = !inQuotes;
          }
        } else if (char === ',' && !inQuotes) {
          // Field separator
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    };

    // Parse header - case insensitive, flexible naming
    const headerCols = parseLine(lines[0]);
    const header = headerCols.map(h => h.trim().toLowerCase().replace(/['"]/g, ''));

    // Find column indices - support multiple naming variations
    const findIndex = (variations) => {
      for (const v of variations) {
        const idx = header.indexOf(v.toLowerCase());
        if (idx >= 0) return idx;
      }
      return -1;
    };

    const idxName = findIndex(['agency_name', 'name', 'agency name', 'agencyname', 'surname', 'customer name', 'customername', 'company', 'company name']);
    const idxId = findIndex(['agency_id', 'id', 'agency id', 'agencyid', 'code', 'customer identifier', 'customeridentifier', 'customer id', 'customerid']);
    const idxEmail = findIndex(['contact_email', 'email', 'contact email', 'contactemail', 'email address', 'emailaddress']);

    const out = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = parseLine(lines[i]);

      // Clean up values - remove quotes
      const cleanValue = (idx) => {
        if (idx < 0 || idx >= cols.length) return '';
        return cols[idx].replace(/^["']|["']$/g, '').trim();
      };

      const row = {
        agency_name: cleanValue(idxName),
        agency_id: cleanValue(idxId),
        contact_email: cleanValue(idxEmail),
      };

      // Only add if we have at least a name or ID
      if (row.agency_name || row.agency_id) {
        out.push(row);
      }
    }

    return out;
  };

  const onImportFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportResult(null);
    setImporting(true);

    try {
      const text = await file.text();
      const rows = parseCSV(text);

      if (!rows.length) {
        // Provide better error message
        const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim().length > 0);
        const firstLine = lines[0] || '';

        setImportResult({
          ok: false,
          message: `No valid rows found in the CSV. Please ensure your CSV has:\n• Header row with name column: agency_name, name, surname, customer name, company\n• Header row with ID column: agency_id, id, code, customer identifier\n• Header row with email column: contact_email, email, email address\n• At least one data row with agency name or ID\n\nFirst line found: "${firstLine.substring(0, 100)}${firstLine.length > 100 ? '...' : ''}"`
        });
        setImporting(false);
        return;
      }

      // Prefer bulk endpoint if your backend supports it: POST /agencies/bulk
      // Fallback: POST each row individually
      let success = 0;
      let failed = 0;
      const errors = [];

      // Try bulk first
      try {
        const bulkRes = await apiPost('/agencies/bulk', {
          agencies: rows.map(r => ({
            agency_name: r.agency_name?.trim(),
            agency_id: r.agency_id?.trim(),
            contact_email: r.contact_email?.trim() || null,
            is_active: true,
          })),
        });
        // assume backend returns counts
        success = bulkRes?.data?.inserted || rows.length;
      } catch {
        // fallback to one-by-one
        for (const r of rows) {
          try {
            if (!r.agency_name?.trim() || !r.agency_id?.trim()) { failed++; continue; }
            if (r.contact_email && !validateEmail(r.contact_email)) { failed++; continue; }
            await apiPost('/agencies', {
              agency_name: r.agency_name.trim(),
              agency_id: r.agency_id.trim(),
              contact_email: r.contact_email?.trim() || null,
              is_active: true,
            });
            success++;
          } catch (err) {
            failed++;
            errors.push(`${r.agency_id || r.agency_name}: ${err.message}`);
          }
        }
      }

      cache.delete(CACHE_KEYS.AGENCIES); // Invalidate so NewReceipt picks up imported agencies
      setImportResult({
        ok: true,
        message: `Imported ${success} item(s). ${failed ? failed + ' failed.' : ''}`,
        errors,
      });
      await load();
    } catch (err) {
      setImportResult({ ok: false, message: err.message || 'Import failed.' });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="agencies-page">
      <div className="agencies-header">
        <div>
          <h2 className="agencies-title">Travel Agencies</h2>
          <p className="agencies-subtitle">Manage your travel agency partners</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="agencies-btn agencies-btn--ghost" onClick={triggerImport} disabled={importing}>
            {importing ? 'Importing…' : '↥ Import CSV'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={onImportFile}
          />
          <button className="agencies-btn" onClick={openAdd}>+ Add Agency</button>
        </div>
      </div>

      {/* Stats */}
      <div className="agencies-stats">
        <div className="agencies-stat-card">
          <div className="agencies-stat-icon">🏢</div>
          <div className="agencies-stat-content">
            <div className="agencies-stat-value">{agencies.length}</div>
            <div className="agencies-stat-label">Total Agencies</div>
          </div>
        </div>
        <div className="agencies-stat-card">
          <div className="agencies-stat-icon">✅</div>
          <div className="agencies-stat-content">
            <div className="agencies-stat-value">{agencies.filter(a => a.is_active).length}</div>
            <div className="agencies-stat-label">Active</div>
          </div>
        </div>
        <div className="agencies-stat-card">
          <div className="agencies-stat-icon">⏸️</div>
          <div className="agencies-stat-content">
            <div className="agencies-stat-value">{agencies.filter(a => !a.is_active).length}</div>
            <div className="agencies-stat-label">Inactive</div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="agencies-search-bar">
        <input
          type="text"
          className="agencies-search-input"
          placeholder="🔍 Search agencies by name, ID, email, or contact…"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        {searchTerm && (
          <button className="agencies-search-clear" onClick={() => setSearchTerm('')}>
            ✕
          </button>
        )}
      </div>

      <div className="agencies-card">
        {error && <div className="agencies-error">{error}</div>}
        {importResult && (
          <div className={`agencies-import-result ${importResult.ok ? 'ok' : 'err'}`}>
            <div className="import-title">{importResult.ok ? 'Import Complete' : 'Import Failed'}</div>
            <div className="import-msg">{importResult.message}</div>
            {!!importResult.errors?.length && (
              <details className="import-errors">
                <summary>View errors ({importResult.errors.length})</summary>
                <ul>
                  {importResult.errors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </details>
            )}
          </div>
        )}
        {loading ? (
          <div className="agencies-loading">Loading agencies...</div>
        ) : filteredAgencies.length === 0 ? (
          <div className="agencies-empty">
            {searchTerm ? 'No agencies match your search.' : 'No agencies found.'}
          </div>
        ) : (
          <div className="agencies-grid">
            {filteredAgencies.map((agency) => (
              <div key={agency.id || agency.agency_id} className="agency-card">
                <div className="agency-card-header">
                  <div className="agency-avatar">
                    {(agency.agency_name || 'A')[0].toUpperCase()}
                  </div>
                  <div className={`agency-status ${agency.is_active ? 'agency-status--active' : 'agency-status--inactive'}`}>
                    {agency.is_active ? '✓ Active' : '⏸ Inactive'}
                  </div>
                </div>

                <div className="agency-card-body">
                  <h3 className="agency-name">{agency.agency_name || 'Unnamed Agency'}</h3>
                  <div className="agency-id">ID: {agency.agency_id || 'N/A'}</div>

                  <div className="agency-details">
                    <div className="agency-detail">
                      <span className="agency-detail-icon">✉️</span>
                      <span className="agency-detail-text">{agency.contact_email || 'No email'}</span>
                    </div>
                    {agency.contact_person && (
                      <div className="agency-detail">
                        <span className="agency-detail-icon">👤</span>
                        <span className="agency-detail-text">{agency.contact_person}</span>
                      </div>
                    )}
                    {agency.contact_phone && (
                      <div className="agency-detail">
                        <span className="agency-detail-icon">📞</span>
                        <span className="agency-detail-text">{agency.contact_phone}</span>
                      </div>
                    )}
                    {agency.location && (
                      <div className="agency-detail">
                        <span className="agency-detail-icon">📍</span>
                        <span className="agency-detail-text">{agency.location}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="agency-card-footer">
                  <button
                    onClick={() => openAgencyDetails(agency)}
                    className="agency-btn agency-btn--view"
                  >
                    View Details
                  </button>
                  <button className="agency-btn agency-btn--edit" title="Coming soon">Edit</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Agency Modal */}
      {isAddOpen && (
        <div className="agencies-modal-overlay" onClick={closeAdd}>
          <div className="agencies-modal" onClick={(e) => e.stopPropagation()}>
            <div className="agencies-modal-header">
              <h3>Add New Agency</h3>
              <button className="modal-close" onClick={closeAdd} disabled={saving}>✕</button>
            </div>
            <form onSubmit={handleSave} className="agencies-form">
              <div className="form-row">
                <label>Agency Name<span className="req">*</span></label>
                <input
                  type="text"
                  value={form.agency_name}
                  onChange={(e) => setForm({ ...form, agency_name: e.target.value })}
                  placeholder="e.g., SKY TOURS JUBA"
                  required
                />
              </div>
              <div className="form-row">
                <label>Agency ID<span className="req">*</span></label>
                <input
                  type="text"
                  value={form.agency_id}
                  onChange={(e) => setForm({ ...form, agency_id: e.target.value })}
                  placeholder="e.g., 789456"
                  required
                />
              </div>
              <div className="form-row">
                <label>Email</label>
                <input
                  type="email"
                  value={form.contact_email}
                  onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
                  placeholder="e.g., sky.tours@example.com"
                />
              </div>

              {formErr && <div className="form-error">{formErr}</div>}

              <div className="modal-actions">
                <button type="button" className="agencies-btn agencies-btn--ghost" onClick={closeAdd} disabled={saving}>
                  Cancel
                </button>
                <button type="submit" className="agencies-btn" disabled={saving}>
                  {saving ? 'Saving…' : 'Save Agency'}
                </button>
              </div>

              <div className="modal-help">
                Tip: to import multiple, click <strong>“Import CSV”</strong>. Expected headers:
                <code> agency_name, agency_id, contact_email </code>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Agency Details Modal */}
      {selectedAgency && (
        <div className="agencies-modal-overlay" onClick={closeAgencyDetails}>
          <div className="agencies-modal agencies-modal--large" onClick={(e) => e.stopPropagation()}>
            <div className="agencies-modal-header">
              <div>
                <h3>{selectedAgency.agency_name}</h3>
                <p style={{ margin: '4px 0 0', fontSize: '14px', opacity: 0.8 }}>
                  ID: {selectedAgency.agency_id}
                </p>
              </div>
              <button className="modal-close" onClick={closeAgencyDetails}>✕</button>
            </div>

            <div className="agency-details-stats">
              <div className="agency-stat">
                <div className="agency-stat-label">Total Receipts</div>
                <div className="agency-stat-value">{agencyStats?.total_receipts ?? '...'}</div>
              </div>
              <div className="agency-stat">
                <div className="agency-stat-label">Pending Receipts</div>
                <div className="agency-stat-value agency-stat-value--pending">
                  {agencyStats?.pending_count ?? '...'}
                </div>
              </div>
              <div className="agency-stat">
                <div className="agency-stat-label">Pending Amount</div>
                <div className="agency-stat-value agency-stat-value--pending">
                  ${(agencyStats?.pending_amount ?? 0).toFixed(2)}
                </div>
              </div>
              <div className="agency-stat">
                <div className="agency-stat-label">Total Revenue</div>
                <div className="agency-stat-value agency-stat-value--success">
                  ${(agencyStats?.total_revenue ?? 0).toFixed(2)}
                </div>
              </div>
            </div>

            <div className="agency-receipts-section">
              <h4 style={{ margin: '0 0 16px', fontSize: '16px' }}>
                Receipts {totalReceipts > 0 ? `(${totalReceipts})` : ''}
              </h4>

              {loadingReceipts ? (
                <div style={{ padding: '40px', textAlign: 'center', opacity: 0.6 }}>
                  Loading receipts...
                </div>
              ) : receiptsError ? (
                <div style={{ padding: '20px', textAlign: 'center', color: '#e53e3e' }}>
                  {receiptsError}
                </div>
              ) : agencyReceipts.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', opacity: 0.6 }}>
                  No receipts found for this agency.
                </div>
              ) : (
                <div className="agency-receipts-table-wrapper">
                  <table className="agency-receipts-table">
                    <thead>
                      <tr>
                        <th>Receipt #</th>
                        <th>Date</th>
                        <th>Total Amount</th>
                        <th>Paid</th>
                        <th>Remaining</th>
                        <th>Status</th>
                        <th>Payment Method</th>
                        <th>Issued By</th>
                      </tr>
                    </thead>
                    <tbody>
                      {agencyReceipts.map((receipt) => {
                        const totalAmount = parseFloat(receipt.amount || 0);
                        const amountPaid = parseFloat(receipt.amount_paid || 0);
                        const amountRemaining = receipt.amount_remaining !== undefined && receipt.amount_remaining !== null
                          ? parseFloat(receipt.amount_remaining)
                          : (receipt.status?.toUpperCase() === 'PAID' ? 0 : totalAmount - amountPaid);

                        return (
                          <tr key={receipt.id}>
                            <td><strong>{receipt.receipt_number}</strong></td>
                            <td>
                              {new Date(receipt.issue_date).toLocaleDateString('en-US', {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                                timeZone: 'Africa/Juba'
                              })}
                            </td>
                            <td><strong>${totalAmount.toFixed(2)}</strong></td>
                            <td style={{ color: amountPaid > 0 ? '#48bb78' : '#718096' }}>
                              ${amountPaid.toFixed(2)}
                            </td>
                            <td style={{ color: amountRemaining > 0 ? '#f56565' : '#48bb78' }}>
                              ${amountRemaining.toFixed(2)}
                            </td>
                            <td>
                              <span className={`receipt-status receipt-status--${receipt.status?.toLowerCase()}`}>
                                {receipt.status}
                                {amountPaid > 0 && receipt.status?.toUpperCase() === 'PENDING' && ' (Partial)'}
                              </span>
                            </td>
                            <td>{receipt.payment_method || 'N/A'}</td>
                            <td>{receipt.issued_by || 'N/A'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {/* Pagination */}
                  {totalReceipts > RECEIPTS_PAGE_SIZE && (
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', padding: '16px 0' }}>
                      <button
                        className="agencies-btn agencies-btn--ghost"
                        disabled={receiptsPage <= 1 || loadingReceipts}
                        onClick={() => handleReceiptsPageChange(receiptsPage - 1)}
                        style={{ padding: '6px 14px', fontSize: '13px' }}
                      >
                        Previous
                      </button>
                      <span style={{ fontSize: '13px', opacity: 0.7 }}>
                        Page {receiptsPage} of {Math.ceil(totalReceipts / RECEIPTS_PAGE_SIZE)}
                      </span>
                      <button
                        className="agencies-btn agencies-btn--ghost"
                        disabled={receiptsPage >= Math.ceil(totalReceipts / RECEIPTS_PAGE_SIZE) || loadingReceipts}
                        onClick={() => handleReceiptsPageChange(receiptsPage + 1)}
                        style={{ padding: '6px 14px', fontSize: '13px' }}
                      >
                        Next
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="modal-actions" style={{ marginTop: '24px' }}>
              <button className="agencies-btn" onClick={closeAgencyDetails}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}