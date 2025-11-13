import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Building2,
  DollarSign,
  CreditCard,
  Banknote,
  CheckCircle,
  Clock,
  FileText,
  AlertCircle,
  ArrowLeft,
  Save
} from 'lucide-react';
import { receiptsAPI } from '../services/api';
import { Skeleton, SkeletonReceipt } from '../components/Skeleton';
import './NewReceipt.css';

function EditReceipt() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [receipt, setReceipt] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [status, setStatus] = useState('PAID');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Fetch receipt on mount
  useEffect(() => {
    const fetchReceipt = async () => {
      try {
        setLoading(true);
        const response = await receiptsAPI.getById(id);
        const receiptData = response.data.data || response.data;

        setReceipt(receiptData);
        setPaymentMethod(receiptData.payment_method || 'CASH');
        setStatus(receiptData.status || 'PAID');
        setLoading(false);
      } catch (err) {
        console.error('❌ Fetch receipt error:', err);
        setError('Failed to load receipt. Please try again.');
        setLoading(false);
      }
    };

    fetchReceipt();
  }, [id]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);

    try {
      await receiptsAPI.updateStatus(id, {
        status: status,
        payment_method: paymentMethod
      });

      // Success - redirect to receipts list
      navigate('/receipts', {
        state: { message: 'Receipt updated successfully!' }
      });
    } catch (err) {
      console.error('❌ Update receipt error:', err);
      const errorMessage = err.response?.data?.message ||
        err.message ||
        'Failed to update receipt. Please try again.';
      setError(errorMessage);
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="new-receipt-container">
        <main className="form-main">
          <div className="receipt-form">
            <SkeletonReceipt />
          </div>
        </main>
      </div>
    );
  }

  if (!receipt) {
    return (
      <div className="new-receipt-container">
        <main className="form-main">
          <div className="error-message">
            <AlertCircle size={18} />
            Receipt not found
          </div>
          <button
            onClick={() => navigate('/receipts')}
            className="submit-btn"
            style={{ marginTop: '16px' }}
          >
            <ArrowLeft size={18} />
            Back to Receipts
          </button>
        </main>
      </div>
    );
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  return (
    <div className="new-receipt-container">
      <main className="form-main">
        <form onSubmit={handleSubmit} className="receipt-form">
          <div style={{ marginBottom: '24px' }}>
            <button
              type="button"
              onClick={() => navigate('/receipts')}
              className="change-btn"
              style={{ marginBottom: '16px' }}
            >
              <ArrowLeft size={16} />
              Back to Receipts
            </button>
            <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#1A202C', margin: 0 }}>
              Edit Receipt
            </h2>
            <p style={{ fontSize: '14px', color: '#64748B', marginTop: '8px' }}>
              Receipt #{receipt.receipt_number}
            </p>
          </div>

          {error && (
            <div className="error-message">
              <AlertCircle size={18} />
              {error}
            </div>
          )}

          {/* Agency (Read-only) */}
          <div className="form-group">
            <label>
              <Building2 size={18} />
              Travel Agency
            </label>
            <div className="selected-agency" style={{ cursor: 'default' }}>
              <Building2 size={18} />
              <span>{receipt.agency?.agency_name || receipt.agency_name} ({receipt.agency?.agency_id || receipt.agency_code})</span>
            </div>
          </div>

          {/* Amount (Read-only) */}
          <div className="form-group amount-group">
            <label>
              <DollarSign size={18} />
              Deposit Amount
            </label>
            <div className="amount-display-small">
              <span className="currency-small">$</span>
              <span className="amount-value-small">
                {formatCurrency(receipt.amount)}
              </span>
            </div>
            <p style={{ fontSize: '13px', color: '#64748B', marginTop: '8px' }}>
              Amount cannot be changed after receipt is issued
            </p>
          </div>

          {/* Payment Method Toggle */}
          <div className="form-group">
            <label>
              <CreditCard size={18} />
              Payment Method
            </label>
            <div className="status-toggle">
              <button
                type="button"
                className={`toggle-btn ${paymentMethod === 'CASH' ? 'active' : ''}`}
                onClick={() => setPaymentMethod('CASH')}
              >
                <Banknote size={18} />
                Cash
              </button>
              <button
                type="button"
                className={`toggle-btn ${paymentMethod === 'BANK TRANSFER' ? 'active' : ''}`}
                onClick={() => setPaymentMethod('BANK TRANSFER')}
              >
                <CreditCard size={18} />
                Bank Transfer
              </button>
            </div>
          </div>

          {/* Receipt Status */}
          <div className="form-group">
            <label>
              <FileText size={18} />
              Receipt Status
            </label>
            <div className="status-toggle">
              <button
                type="button"
                className={`toggle-btn ${status === 'PAID' ? 'active' : ''}`}
                onClick={() => setStatus('PAID')}
              >
                <CheckCircle size={18} />
                Paid
              </button>
              <button
                type="button"
                className={`toggle-btn ${status === 'PENDING' ? 'active' : ''}`}
                onClick={() => setStatus('PENDING')}
              >
                <Clock size={18} />
                Pending
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={saving}
            className="submit-btn"
          >
            {saving ? (
              <>
                <span className="loading-spinner"></span>
                Saving Changes...
              </>
            ) : (
              <>
                <Save size={18} />
                Save Changes
              </>
            )}
          </button>

          {/* Info Box */}
          <div className="form-info-bottom">
            <p>
              <strong>Note:</strong> You can update the payment method and status.
              Changes will be reflected in the receipt history.
            </p>
          </div>
        </form>
      </main>
    </div>
  );
}

export default EditReceipt;
