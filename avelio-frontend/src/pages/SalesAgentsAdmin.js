import React, { useState, useEffect, useCallback } from 'react';
import './AdminPages.css';

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

export default function SalesAgentsAdmin() {
  const [agents, setAgents] = useState([]);
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingAgent, setEditingAgent] = useState(null);
  const [saving, setSaving] = useState(false);

  // Filter state
  const [filterStation, setFilterStation] = useState('');

  // Form state
  const [formData, setFormData] = useState({
    agent_code: '',
    agent_name: '',
    station_id: '',
    point_of_sale: ''
  });

  const token = localStorage.getItem('token') || sessionStorage.getItem('token');

  const fetchStations = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/stations`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setStations(data.data?.stations || []);
      }
    } catch (err) {
      console.error('Failed to fetch stations:', err);
    }
  }, [token]);

  const fetchAgents = useCallback(async () => {
    try {
      setLoading(true);
      let url = `${API_BASE}/sales-agents?include_inactive=true`;
      if (filterStation) {
        url += `&station_id=${filterStation}`;
      }

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) throw new Error('Failed to fetch agents');

      const data = await res.json();
      setAgents(data.data?.agents || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token, filterStation]);

  useEffect(() => {
    fetchStations();
  }, [fetchStations]);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  const resetForm = () => {
    setFormData({
      agent_code: '',
      agent_name: '',
      station_id: '',
      point_of_sale: ''
    });
    setEditingAgent(null);
    setShowForm(false);
  };

  const handleEdit = (agent) => {
    setFormData({
      agent_code: agent.agent_code,
      agent_name: agent.agent_name,
      station_id: agent.station_id || '',
      point_of_sale: agent.point_of_sale || ''
    });
    setEditingAgent(agent);
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!formData.agent_code.trim() || !formData.agent_name.trim()) {
      setError('Agent Code and Name are required');
      return;
    }

    try {
      setSaving(true);
      const url = editingAgent
        ? `${API_BASE}/sales-agents/${editingAgent.id}`
        : `${API_BASE}/sales-agents`;

      const res = await fetch(url, {
        method: editingAgent ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Failed to save agent');
      }

      setSuccess(editingAgent ? 'Agent updated successfully' : 'Agent created successfully');
      resetForm();
      fetchAgents();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (agent) => {
    try {
      setError('');
      const res = await fetch(`${API_BASE}/sales-agents/${agent.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ is_active: !agent.is_active })
      });

      if (!res.ok) throw new Error('Failed to update agent');

      setSuccess(`Agent ${agent.is_active ? 'deactivated' : 'activated'}`);
      fetchAgents();
    } catch (err) {
      setError(err.message);
    }
  };

  const getStationName = (stationId) => {
    const station = stations.find(s => s.id === stationId);
    return station ? `${station.station_code} - ${station.station_name}` : '-';
  };

  if (loading && agents.length === 0) {
    return <div className="admin-page"><div className="admin-loading">Loading agents...</div></div>;
  }

  return (
    <div className="admin-page">
      {/* Header */}
      <div className="admin-header">
        <div>
          <h2 className="admin-title">Sales Agents</h2>
          <p className="admin-subtitle">Manage sales agents for station settlements</p>
        </div>
        <div className="header-actions">
          <button className="btn-primary" onClick={() => setShowForm(true)}>
            + Add Agent
          </button>
        </div>
      </div>

      {error && <div className="admin-error">{error}</div>}
      {success && <div className="admin-success">{success}</div>}

      {/* Filters */}
      <div className="admin-filters">
        <div className="filter-group">
          <label>Station</label>
          <select value={filterStation} onChange={(e) => setFilterStation(e.target.value)}>
            <option value="">All Stations</option>
            {stations.map(station => (
              <option key={station.id} value={station.id}>
                {station.station_code} - {station.station_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <div className="admin-card form-card">
          <h3>{editingAgent ? 'Edit Agent' : 'Add New Agent'}</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="form-group">
                <label>Agent Code *</label>
                <input
                  type="text"
                  value={formData.agent_code}
                  onChange={(e) => setFormData({ ...formData, agent_code: e.target.value.toUpperCase() })}
                  placeholder="e.g., AGT001"
                  disabled={editingAgent}
                />
              </div>
              <div className="form-group">
                <label>Agent Name *</label>
                <input
                  type="text"
                  value={formData.agent_name}
                  onChange={(e) => setFormData({ ...formData, agent_name: e.target.value })}
                  placeholder="e.g., John Doe"
                />
              </div>
              <div className="form-group">
                <label>Station</label>
                <select
                  value={formData.station_id}
                  onChange={(e) => setFormData({ ...formData, station_id: e.target.value, point_of_sale: '' })}
                >
                  <option value="">-- Select Station --</option>
                  {stations.map(station => (
                    <option key={station.id} value={station.id}>
                      {station.station_code} - {station.station_name}
                    </option>
                  ))}
                </select>
              </div>
              {formData.station_id && stations.find(s => s.id === formData.station_id)?.station_code === 'JUB' && (
                <div className="form-group">
                  <label>Point of Sale {formData.station_id && stations.find(s => s.id === formData.station_id)?.station_code === 'JUB' ? '*' : ''}</label>
                  <select
                    value={formData.point_of_sale}
                    onChange={(e) => setFormData({ ...formData, point_of_sale: e.target.value })}
                  >
                    <option value="">-- Select Point of Sale --</option>
                    {JUBA_POS_OPTIONS.map(pos => (
                      <option key={pos} value={pos}>{pos}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className="form-actions">
              <button type="button" className="btn-secondary" onClick={resetForm}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Saving...' : (editingAgent ? 'Update' : 'Create')}
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
              <th>Station</th>
              <th>Point of Sale</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {agents.length === 0 ? (
              <tr>
                <td colSpan="6" className="empty-row">No agents found</td>
              </tr>
            ) : (
              agents.map(agent => (
                <tr key={agent.id} className={!agent.is_active ? 'inactive-row' : ''}>
                  <td className="code-cell">{agent.agent_code}</td>
                  <td>{agent.agent_name}</td>
                  <td>{getStationName(agent.station_id)}</td>
                  <td>{agent.point_of_sale || '-'}</td>
                  <td>
                    <span className={`status-badge ${agent.is_active ? 'active' : 'inactive'}`}>
                      {agent.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="actions-cell">
                    <button className="btn-edit" onClick={() => handleEdit(agent)}>
                      Edit
                    </button>
                    <button
                      className={agent.is_active ? 'btn-deactivate' : 'btn-activate'}
                      onClick={() => handleToggleActive(agent)}
                    >
                      {agent.is_active ? 'Deactivate' : 'Activate'}
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
