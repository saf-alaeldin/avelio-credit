import React, { useState, useEffect, useCallback } from 'react';
import './AdminPages.css';

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

export default function StationsAdmin() {
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingStation, setEditingStation] = useState(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    station_code: '',
    station_name: '',
    currencies_allowed: ['USD', 'SSP']
  });

  const token = localStorage.getItem('token') || sessionStorage.getItem('token');

  const fetchStations = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/stations?include_inactive=true`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) throw new Error('Failed to fetch stations');

      const data = await res.json();
      setStations(data.data?.stations || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchStations();
  }, [fetchStations]);

  const resetForm = () => {
    setFormData({
      station_code: '',
      station_name: '',
      currencies_allowed: ['USD', 'SSP']
    });
    setEditingStation(null);
    setShowForm(false);
  };

  const handleEdit = (station) => {
    setFormData({
      station_code: station.station_code,
      station_name: station.station_name,
      currencies_allowed: station.currencies_allowed || ['USD', 'SSP']
    });
    setEditingStation(station);
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!formData.station_code.trim() || !formData.station_name.trim()) {
      setError('Station Code and Name are required');
      return;
    }

    try {
      setSaving(true);
      const url = editingStation
        ? `${API_BASE}/stations/${editingStation.id}`
        : `${API_BASE}/stations`;

      const res = await fetch(url, {
        method: editingStation ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Failed to save station');
      }

      setSuccess(editingStation ? 'Station updated successfully' : 'Station created successfully');
      resetForm();
      fetchStations();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (station) => {
    try {
      setError('');
      const res = await fetch(`${API_BASE}/stations/${station.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ is_active: !station.is_active })
      });

      if (!res.ok) throw new Error('Failed to update station');

      setSuccess(`Station ${station.is_active ? 'deactivated' : 'activated'}`);
      fetchStations();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCurrencyToggle = (currency) => {
    setFormData(prev => {
      const currencies = prev.currencies_allowed.includes(currency)
        ? prev.currencies_allowed.filter(c => c !== currency)
        : [...prev.currencies_allowed, currency];
      return { ...prev, currencies_allowed: currencies };
    });
  };

  if (loading) {
    return <div className="admin-page"><div className="admin-loading">Loading stations...</div></div>;
  }

  return (
    <div className="admin-page">
      {/* Header */}
      <div className="admin-header">
        <div>
          <h2 className="admin-title">Stations</h2>
          <p className="admin-subtitle">Manage stations for settlements</p>
        </div>
        <div className="header-actions">
          <button className="btn-primary" onClick={() => setShowForm(true)}>
            + Add Station
          </button>
        </div>
      </div>

      {error && <div className="admin-error">{error}</div>}
      {success && <div className="admin-success">{success}</div>}

      {/* Add/Edit Form */}
      {showForm && (
        <div className="admin-card form-card">
          <h3>{editingStation ? 'Edit Station' : 'Add New Station'}</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="form-group">
                <label>Station Code *</label>
                <input
                  type="text"
                  value={formData.station_code}
                  onChange={(e) => setFormData({ ...formData, station_code: e.target.value.toUpperCase() })}
                  placeholder="e.g., JUB"
                  disabled={editingStation}
                  maxLength={10}
                />
              </div>
              <div className="form-group">
                <label>Station Name *</label>
                <input
                  type="text"
                  value={formData.station_name}
                  onChange={(e) => setFormData({ ...formData, station_name: e.target.value })}
                  placeholder="e.g., Juba International Airport"
                />
              </div>
              <div className="form-group">
                <label>Currencies Allowed</label>
                <div className="checkbox-group">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={formData.currencies_allowed.includes('USD')}
                      onChange={() => handleCurrencyToggle('USD')}
                    />
                    USD
                  </label>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={formData.currencies_allowed.includes('SSP')}
                      onChange={() => handleCurrencyToggle('SSP')}
                    />
                    SSP
                  </label>
                </div>
              </div>
            </div>
            <div className="form-actions">
              <button type="button" className="btn-secondary" onClick={resetForm}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Saving...' : (editingStation ? 'Update' : 'Create')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Table */}
      <div className="admin-card">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Currencies</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {stations.length === 0 ? (
              <tr>
                <td colSpan="5" className="empty-row">No stations found</td>
              </tr>
            ) : (
              stations.map(station => (
                <tr key={station.id} className={!station.is_active ? 'inactive-row' : ''}>
                  <td className="code-cell">{station.station_code}</td>
                  <td>{station.station_name}</td>
                  <td>{(station.currencies_allowed || []).join(', ')}</td>
                  <td>
                    <span className={`status-badge ${station.is_active ? 'active' : 'inactive'}`}>
                      {station.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="actions-cell">
                    <button className="btn-edit" onClick={() => handleEdit(station)}>
                      Edit
                    </button>
                    <button
                      className={station.is_active ? 'btn-deactivate' : 'btn-activate'}
                      onClick={() => handleToggleActive(station)}
                    >
                      {station.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
