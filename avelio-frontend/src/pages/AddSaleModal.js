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

export default function AddSaleModal({ stationId, agents, onClose, onSuccess }) {
  const [formData, setFormData] = useState({
    agent_id: '',
    date_to: new Date().toISOString().split('T')[0],
    date_from: new Date().toISOString().split('T')[0],
    flight_reference: '',
    amount: '',
    currency: 'USD',
    customer_name: '',
    description: ''
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const token = localStorage.getItem('token') || sessionStorage.getItem('token');

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.agent_id || !formData.amount || !formData.date_to || !formData.date_from) {
      setError('Please fill in all required fields');
      return;
    }

    try {
      setSaving(true);
      setError('');

      const res = await fetch(`${API_BASE}/station-sales`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          ...formData,
          transaction_date: formData.date_from,
          station_id: stationId
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Failed to create sale');
      }

      onSuccess();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Add New Sale</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        {error && <div className="modal-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-grid">
              <div className="form-group">
                <label>Agent *</label>
                <select
                  value={formData.agent_id}
                  onChange={(e) => setFormData({ ...formData, agent_id: e.target.value })}
                  required
                >
                  <option value="">Select Agent</option>
                  {agents.map(a => (
                    <option key={a.id} value={a.id}>{a.agent_code} - {a.agent_name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>To *</label>
                <input
                  type="date"
                  value={formData.date_to}
                  onChange={(e) => setFormData({ ...formData, date_to: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>From *</label>
                <input
                  type="date"
                  value={formData.date_from}
                  onChange={(e) => setFormData({ ...formData, date_from: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Amount *</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Currency *</label>
                <select
                  value={formData.currency}
                  onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                >
                  <option value="USD">USD</option>
                  <option value="SSP">SSP</option>
                </select>
              </div>
              <div className="form-group">
                <label>Flight Reference</label>
                <input
                  type="text"
                  value={formData.flight_reference}
                  onChange={(e) => setFormData({ ...formData, flight_reference: e.target.value })}
                  placeholder="e.g., KU123"
                />
              </div>
              <div className="form-group">
                <label>Customer Name</label>
                <input
                  type="text"
                  value={formData.customer_name}
                  onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                />
              </div>
              <div className="form-group full-width">
                <label>Description</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Add Sale'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
