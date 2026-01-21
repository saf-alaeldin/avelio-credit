import React, { useState } from 'react';

const getApiUrl = () => {
  if (process.env.REACT_APP_API_URL) return process.env.REACT_APP_API_URL;
  if (window.location.protocol === 'https:') {
    return '/api/v1';
  }
  const hostname = window.location.hostname;
  const port = 5001;
  if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
    return `http://${hostname}:${port}/api/v1`;
  }
  return 'http://localhost:5001/api/v1';
};

const API_BASE = getApiUrl();

// Point of Sales for Juba station
const JUBA_POS_OPTIONS = [
  'Kushair Head Office',
  'Airport I',
  'Airport II',
  'Juba Market Office',
  'Kushair Traffic'
];

export default function AddSaleModal({ stationId, station, agents, onClose, onSuccess }) {
  const [formData, setFormData] = useState({
    agent_id: '',
    point_of_sale: '',
    date_to: new Date().toISOString().split('T')[0],
    date_from: new Date().toISOString().split('T')[0],
    flight_reference: '',
    sales_amount: '',
    cashout_amount: '0',
    currency: 'USD'
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Calculate balance (sales - cashout)
  const calculateBalance = () => {
    const sales = parseFloat(formData.sales_amount) || 0;
    const cashout = parseFloat(formData.cashout_amount) || 0;
    return sales - cashout;
  };

  const token = localStorage.getItem('token') || sessionStorage.getItem('token');

  // Check if selected station is Juba
  const isJubaStation = station?.station_code === 'JUB';

  // Filter agents by point of sale for Juba station
  const filteredAgents = isJubaStation && formData.point_of_sale
    ? agents.filter(a => a.point_of_sale === formData.point_of_sale)
    : agents;

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validate required fields
    if (!formData.sales_amount || !formData.date_to || !formData.date_from) {
      setError('Please fill in all required fields');
      return;
    }

    // Validate sales_amount is non-negative
    if (parseFloat(formData.sales_amount) < 0) {
      setError('Reservation System Amount must be non-negative');
      return;
    }

    // Validate cashout_amount is non-negative
    if (parseFloat(formData.cashout_amount) < 0) {
      setError('Cashout Amount must be non-negative');
      return;
    }

    // Agent is mandatory only for Juba station
    if (isJubaStation && !formData.agent_id) {
      setError('Agent is required for Juba station');
      return;
    }

    // Point of Sale is mandatory for Juba station
    if (isJubaStation && !formData.point_of_sale) {
      setError('Point of Sale is required for Juba station');
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
          agent_id: formData.agent_id,
          point_of_sale: formData.point_of_sale,
          date_to: formData.date_to,
          date_from: formData.date_from,
          flight_reference: formData.flight_reference,
          sales_amount: parseFloat(formData.sales_amount),
          cashout_amount: parseFloat(formData.cashout_amount) || 0,
          currency: formData.currency,
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
              {isJubaStation && (
                <div className="form-group">
                  <label>Point of Sale *</label>
                  <select
                    value={formData.point_of_sale}
                    onChange={(e) => setFormData({ ...formData, point_of_sale: e.target.value, agent_id: '' })}
                    required
                  >
                    <option value="">Select Point of Sale</option>
                    {JUBA_POS_OPTIONS.map(pos => (
                      <option key={pos} value={pos}>{pos}</option>
                    ))}
                  </select>
                </div>
              )}

              {isJubaStation && (
                <div className="form-group">
                  <label>Agent *</label>
                  <select
                    value={formData.agent_id}
                    onChange={(e) => setFormData({ ...formData, agent_id: e.target.value })}
                    required
                    disabled={!formData.point_of_sale}
                  >
                    <option value="">
                      {!formData.point_of_sale ? 'First select Point of Sale' : 'Select Agent'}
                    </option>
                    {filteredAgents.map(a => (
                      <option key={a.id} value={a.id}>{a.agent_code} - {a.agent_name}</option>
                    ))}
                  </select>
                </div>
              )}

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
                <label>Reservation System Amount *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.sales_amount}
                  onChange={(e) => setFormData({ ...formData, sales_amount: e.target.value })}
                  placeholder="Sales from reservation system"
                  required
                />
              </div>
              <div className="form-group">
                <label>Cashout Amount (Refunds/Voids)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.cashout_amount}
                  onChange={(e) => setFormData({ ...formData, cashout_amount: e.target.value })}
                  placeholder="Refunds and voids"
                />
              </div>
              <div className="form-group">
                <label>Balance (Calculated)</label>
                <input
                  type="text"
                  value={calculateBalance().toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  readOnly
                  className="calculated-field"
                  style={{ backgroundColor: '#f5f5f5', fontWeight: 'bold', color: calculateBalance() < 0 ? '#dc3545' : '#28a745' }}
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
