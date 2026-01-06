import React, { useState } from 'react';

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

export default function ImportCSVModal({ stationId, onClose, onSuccess }) {
  const [csvData, setCsvData] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [importResult, setImportResult] = useState(null);

  const token = localStorage.getItem('token') || sessionStorage.getItem('token');

  // Parse CSV
  const parseCSV = (text) => {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
    const sales = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
      const sale = {};

      headers.forEach((header, idx) => {
        sale[header] = values[idx] || '';
      });

      // Map common column names
      sales.push({
        agent_code: sale.agent_code || sale.agent,
        transaction_date: sale.transaction_date || sale.date,
        transaction_time: sale.transaction_time || sale.time,
        flight_reference: sale.flight_reference || sale.flight,
        amount: sale.amount,
        currency: sale.currency || 'USD'
      });
    }

    return sales;
  };

  const handleImport = async () => {
    if (!csvData.trim()) {
      setError('Please paste CSV data');
      return;
    }

    try {
      setSaving(true);
      setError('');
      setImportResult(null);

      const parsedSales = parseCSV(csvData);

      if (parsedSales.length === 0) {
        setError('No valid sales data found in CSV');
        return;
      }

      const res = await fetch(`${API_BASE}/station-sales/import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          sales: parsedSales,
          station_id: stationId
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Failed to import sales');
      }

      setImportResult(data.data);

      if (data.data.error_count === 0) {
        onSuccess(data.data);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Import Sales from CSV</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body">
          {error && <div className="modal-error">{error}</div>}

          <p className="import-hint">
            Paste CSV data with columns: agent_code, transaction_date, amount, currency (optional),
            flight_reference (optional)
          </p>

          <textarea
            className="csv-input"
            placeholder="Paste CSV data here..."
            value={csvData}
            onChange={(e) => setCsvData(e.target.value)}
            rows={12}
          />

          {importResult && (
            <div className="import-result">
              <p>
                <strong>Imported:</strong> {importResult.imported_count} |
                <strong> Errors:</strong> {importResult.error_count}
              </p>
              {importResult.errors?.length > 0 && (
                <details>
                  <summary>View Errors</summary>
                  <ul className="error-list">
                    {importResult.errors.map((err, idx) => (
                      <li key={idx}>Row {err.row}: {err.error}</li>
                    ))}
                  </ul>
                </details>
              )}
              {importResult.error_count === 0 && (
                <button className="btn-primary" onClick={() => onSuccess(importResult)}>
                  Done
                </button>
              )}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={handleImport} disabled={saving}>
            {saving ? 'Importing...' : 'Import Sales'}
          </button>
        </div>
      </div>
    </div>
  );
}
