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

export default function ExpenseCodesAdmin() {
  const [expenseCodes, setExpenseCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingCode, setEditingCode] = useState(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    category: '',
    currencies_allowed: ['USD', 'SSP'],
    requires_receipt: false
  });

  const token = localStorage.getItem('token') || sessionStorage.getItem('token');

  const fetchExpenseCodes = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/expense-codes`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) throw new Error('Failed to fetch expense codes');

      const data = await res.json();
      setExpenseCodes(data.data?.expense_codes || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchExpenseCodes();
  }, [fetchExpenseCodes]);

  const resetForm = () => {
    setFormData({
      code: '',
      name: '',
      category: '',
      currencies_allowed: ['USD', 'SSP'],
      requires_receipt: false
    });
    setEditingCode(null);
    setShowForm(false);
  };

  const handleEdit = (expenseCode) => {
    setFormData({
      code: expenseCode.code,
      name: expenseCode.name,
      category: expenseCode.category || '',
      currencies_allowed: expenseCode.currencies_allowed || ['USD', 'SSP'],
      requires_receipt: expenseCode.requires_receipt || false
    });
    setEditingCode(expenseCode);
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!formData.code.trim() || !formData.name.trim()) {
      setError('Code and Name are required');
      return;
    }

    try {
      setSaving(true);
      const url = editingCode
        ? `${API_BASE}/expense-codes/${editingCode.id}`
        : `${API_BASE}/expense-codes`;

      const res = await fetch(url, {
        method: editingCode ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Failed to save expense code');
      }

      setSuccess(editingCode ? 'Expense code updated successfully' : 'Expense code created successfully');
      resetForm();
      fetchExpenseCodes();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (expenseCode) => {
    try {
      setError('');
      const res = await fetch(`${API_BASE}/expense-codes/${expenseCode.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ is_active: !expenseCode.is_active })
      });

      if (!res.ok) throw new Error('Failed to update expense code');

      setSuccess(`Expense code ${expenseCode.is_active ? 'deactivated' : 'activated'}`);
      fetchExpenseCodes();
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
    return <div className="admin-page"><div className="admin-loading">Loading expense codes...</div></div>;
  }

  return (
    <div className="admin-page">
      {/* Header */}
      <div className="admin-header">
        <div>
          <h2 className="admin-title">Expense Codes</h2>
          <p className="admin-subtitle">Manage expense codes for station settlements</p>
        </div>
        <div className="header-actions">
          <button className="btn-primary" onClick={() => setShowForm(true)}>
            + Add Expense Code
          </button>
        </div>
      </div>

      {error && <div className="admin-error">{error}</div>}
      {success && <div className="admin-success">{success}</div>}

      {/* Add/Edit Form */}
      {showForm && (
        <div className="admin-card form-card">
          <h3>{editingCode ? 'Edit Expense Code' : 'Add New Expense Code'}</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="form-group">
                <label>Code *</label>
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  placeholder="e.g., FUEL-001"
                  disabled={editingCode}
                />
              </div>
              <div className="form-group">
                <label>Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Aircraft Fuel Payment"
                />
              </div>
              <div className="form-group">
                <label>Category</label>
                <input
                  type="text"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  placeholder="e.g., Operations"
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
              <div className="form-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={formData.requires_receipt}
                    onChange={(e) => setFormData({ ...formData, requires_receipt: e.target.checked })}
                  />
                  Requires Receipt
                </label>
              </div>
            </div>
            <div className="form-actions">
              <button type="button" className="btn-secondary" onClick={resetForm}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Saving...' : (editingCode ? 'Update' : 'Create')}
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
              <th>Category</th>
              <th>Currencies</th>
              <th>Receipt</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {expenseCodes.length === 0 ? (
              <tr>
                <td colSpan="7" className="empty-row">No expense codes found</td>
              </tr>
            ) : (
              expenseCodes.map(code => (
                <tr key={code.id} className={!code.is_active ? 'inactive-row' : ''}>
                  <td className="code-cell">{code.code}</td>
                  <td>{code.name}</td>
                  <td>{code.category || '-'}</td>
                  <td>{(code.currencies_allowed || []).join(', ')}</td>
                  <td>{code.requires_receipt ? 'Yes' : 'No'}</td>
                  <td>
                    <span className={`status-badge ${code.is_active ? 'active' : 'inactive'}`}>
                      {code.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="actions-cell">
                    <button className="btn-edit" onClick={() => handleEdit(code)}>
                      Edit
                    </button>
                    <button
                      className={code.is_active ? 'btn-deactivate' : 'btn-activate'}
                      onClick={() => handleToggleActive(code)}
                    >
                      {code.is_active ? 'Deactivate' : 'Activate'}
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
