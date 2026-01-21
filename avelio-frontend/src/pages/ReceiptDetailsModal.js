// src/components/ReceiptDetailsModal.js
import React, { useState, useEffect } from 'react';
import './ReceiptDetailsModal.css';

// Auto-detect API URL based on window location
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

export default function ReceiptDetailsModal({ receipt, isOpen, onClose, onStatusUpdated }) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [showVoidConfirm, setShowVoidConfirm] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [isVoiding, setIsVoiding] = useState(false);

  // Partial payment states
  const [showPartialPayment, setShowPartialPayment] = useState(false);
  const [partialAmount, setPartialAmount] = useState('');
  const [partialPaymentMethod, setPartialPaymentMethod] = useState('CASH');
  const [partialRemarks, setPartialRemarks] = useState('');
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [payments, setPayments] = useState([]);
  const [loadingPayments, setLoadingPayments] = useState(false);

  // Local receipt state to track payment updates
  const [localReceipt, setLocalReceipt] = useState(null);

  // Void payment states
  const [showVoidPayment, setShowVoidPayment] = useState(false);
  const [voidPaymentId, setVoidPaymentId] = useState(null);
  const [voidPaymentReason, setVoidPaymentReason] = useState('');
  const [isVoidingPayment, setIsVoidingPayment] = useState(false);

  const token =
    localStorage.getItem('token') ||
    localStorage.getItem('authToken') ||
    sessionStorage.getItem('token');

  // Fetch payment history
  const fetchPayments = async () => {
    try {
      setLoadingPayments(true);
      const res = await fetch(`${API_BASE}/payments/receipt/${localReceipt.id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });

      if (res.ok) {
        const data = await res.json();
        setPayments(data.data.payments || []);
      }
    } catch (err) {
      console.error('Failed to fetch payments:', err);
    } finally {
      setLoadingPayments(false);
    }
  };

  // Update local receipt when prop changes
  useEffect(() => {
    if (receipt) {
      setLocalReceipt(receipt);
    }
  }, [receipt]);

  // Fetch payment history when modal opens
  useEffect(() => {
    if (isOpen && localReceipt?.id) {
      fetchPayments();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, localReceipt?.id]);

  if (!isOpen || !receipt || !localReceipt) return null;

  // Calculate amounts from local receipt state
  const totalAmount = parseFloat(localReceipt.amount || 0);
  const amountPaid = parseFloat(localReceipt.amount_paid || 0);
  const amountRemaining = totalAmount - amountPaid;
  const hasPartialPayments = payments.length > 0;

  // Check if receipt is overdue
  const isOverdue = () => {
    if (localReceipt.status?.toUpperCase() !== 'PENDING') return false;
    const issueDate = new Date(localReceipt.issue_date);
    const daysDiff = Math.floor((Date.now() - issueDate) / (1000 * 60 * 60 * 24));
    return daysDiff > 3;
  };

  // Check if "Mark as Paid" button should be shown
  const canMarkAsPaid = (localReceipt.status?.toUpperCase() === 'PENDING' || isOverdue()) && amountRemaining > 0;

  // Check if partial payment is allowed
  const canMakePartialPayment = (localReceipt.status?.toUpperCase() === 'PENDING' || isOverdue()) && amountRemaining > 0;

  // Handle Mark as Paid (full payment)
  const handleMarkAsPaid = async () => {
    try {
      setIsUpdating(true);
      setError('');

      const res = await fetch(`${API_BASE}/receipts/${localReceipt.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ status: 'PAID' }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to update receipt');
      }

      // Show success message
      setSuccess(true);
      setIsUpdating(false);

      // Wait 1.5 seconds to show success, then close
      setTimeout(() => {
        if (onStatusUpdated) {
          onStatusUpdated(localReceipt.id);
        }
        onClose();
        // Reset success state after closing
        setTimeout(() => setSuccess(false), 300);
      }, 1500);

    } catch (err) {
      setError(err.message || 'Failed to mark as paid');
      setIsUpdating(false);
    }
  };

  // Handle Partial Payment
  const handlePartialPayment = async () => {
    const amount = parseFloat(partialAmount);

    if (!amount || amount <= 0) {
      setError('Please enter a valid payment amount');
      return;
    }

    if (amount > amountRemaining) {
      setError(`Payment amount cannot exceed remaining balance ($${amountRemaining.toFixed(2)})`);
      return;
    }

    try {
      setIsProcessingPayment(true);
      setError('');

      const res = await fetch(`${API_BASE}/payments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          receipt_id: localReceipt.id,
          amount: amount,
          payment_method: partialPaymentMethod,
          remarks: partialRemarks
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Failed to process payment');
      }

      // Update local receipt state with new amounts (create new object to trigger re-render)
      const updatedReceipt = {
        ...localReceipt,
        amount_paid: data.data.receipt.amount_paid,
        amount_remaining: data.data.receipt.amount_remaining,
        status: data.data.receipt.status
      };
      setLocalReceipt(updatedReceipt);

      // Show success
      setSuccess(true);
      setIsProcessingPayment(false);
      setShowPartialPayment(false);

      // Refresh payments
      await fetchPayments();

      // Wait and notify parent
      setTimeout(() => {
        if (onStatusUpdated) {
          onStatusUpdated(receipt.id);
        }
        // Reset form
        setPartialAmount('');
        setPartialRemarks('');
        setPartialPaymentMethod('CASH');

        // If fully paid, close modal
        if (data.data.receipt.amount_remaining === 0) {
          onClose();
        }
      }, 1500);

    } catch (err) {
      setError(err.message || 'Failed to process payment');
      setIsProcessingPayment(false);
    }
  };

  // Handle PDF Download
  const handleDownloadPDF = async () => {
    try {
      const res = await fetch(`${API_BASE}/receipts/${localReceipt.id}/pdf`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Failed to fetch PDF');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (err) {
      setError('Error downloading PDF: ' + err.message);
    }
  };

  // Handle Payment PDF Download
  const handleDownloadPaymentPDF = async (paymentId) => {
    try {
      const res = await fetch(`${API_BASE}/payments/${paymentId}/pdf`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Failed to fetch payment PDF');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (err) {
      setError('Error downloading payment PDF: ' + err.message);
    }
  };

  // Handle Void Payment
  const handleVoidPayment = async () => {
    if (!voidPaymentReason.trim()) {
      setError('Please provide a reason for voiding this payment');
      return;
    }

    try {
      setIsVoidingPayment(true);
      setError('');

      const res = await fetch(`${API_BASE}/payments/${voidPaymentId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ reason: voidPaymentReason }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Failed to void payment');
      }

      // Update local receipt state with new amounts (create new object to trigger re-render)
      const updatedReceipt = {
        ...localReceipt,
        amount_paid: data.data.receipt.amount_paid,
        amount_remaining: data.data.receipt.amount_remaining,
        status: data.data.receipt.status
      };
      setLocalReceipt(updatedReceipt);

      // Show success
      setSuccess(true);
      setShowVoidPayment(false);
      setIsVoidingPayment(false);
      setVoidPaymentReason('');
      setVoidPaymentId(null);

      // Refresh payments
      await fetchPayments();

      // Notify parent to refresh
      if (onStatusUpdated) {
        onStatusUpdated(receipt.id);
      }

      setTimeout(() => setSuccess(false), 1500);

    } catch (err) {
      setError(err.message || 'Failed to void payment');
      setIsVoidingPayment(false);
    }
  };

  // Handle Void Receipt
  const handleVoidReceipt = async () => {
    if (!voidReason.trim()) {
      setError('Please provide a reason for voiding this receipt');
      return;
    }

    try {
      setIsVoiding(true);
      setError('');

      const res = await fetch(`${API_BASE}/receipts/${localReceipt.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ reason: voidReason }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to void receipt');
      }

      // Show success message
      setSuccess(true);
      setShowVoidConfirm(false);
      setIsVoiding(false);

      // Wait 1.5 seconds to show success, then close
      setTimeout(() => {
        if (onStatusUpdated) {
          onStatusUpdated(localReceipt.id);
        }
        onClose();
        // Reset states after closing
        setTimeout(() => {
          setSuccess(false);
          setVoidReason('');
        }, 300);
      }, 1500);

    } catch (err) {
      setError(err.message || 'Failed to void receipt');
      setIsVoiding(false);
    }
  };

  // Format date and time
  const formatDateTime = (dateStr, timeStr) => {
    if (!dateStr) return '-';

    const date = new Date(dateStr);
    const dateFormatted = new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(date);

    if (timeStr) {
      return `${dateFormatted} at ${timeStr}`;
    }
    return dateFormatted;
  };

  // Handle backdrop click
  const handleBackdropClick = (e) => {
    if (e.target.classList.contains('modal-backdrop')) {
      onClose();
    }
  };

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal-container">
        {/* Header */}
        <div className="modal-header">
          <h2 className="modal-title">Receipt Details</h2>
          <button className="modal-close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="modal-body">
          {error && (
            <div className="modal-error">
              {error}
            </div>
          )}

          {success && (
            <div className="modal-success">
              ✓ {hasPartialPayments ? 'Payment processed successfully!' : 'Receipt marked as paid successfully!'}
            </div>
          )}

          {/* Payment Summary (if partial payments exist) */}
          {hasPartialPayments && (
            <div className="payment-summary-card">
              <h3 className="payment-summary-title">Payment Summary</h3>
              <div className="payment-summary-grid">
                <div className="payment-summary-item">
                  <span className="payment-summary-label">Total Amount:</span>
                  <span className="payment-summary-value">${totalAmount.toFixed(2)}</span>
                </div>
                <div className="payment-summary-item">
                  <span className="payment-summary-label">Amount Paid:</span>
                  <span className="payment-summary-value payment-paid">${amountPaid.toFixed(2)}</span>
                </div>
                <div className="payment-summary-item">
                  <span className="payment-summary-label">Amount Remaining:</span>
                  <span className={`payment-summary-value payment-remaining ${amountRemaining === 0 ? 'payment-complete' : ''}`}>
                    ${amountRemaining.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="modal-details-grid">
            {/* Receipt Number */}
            <div className="modal-detail-item">
              <span className="modal-detail-label">Receipt Number</span>
              <span className="modal-detail-value receipt-number-mono">
                {localReceipt.receipt_number}
              </span>
            </div>

            {/* Agency Name */}
            <div className="modal-detail-item">
              <span className="modal-detail-label">Travel Agency</span>
              <span className="modal-detail-value">
                {localReceipt.agency?.agency_name || localReceipt.agency_name || 'N/A'}
              </span>
            </div>

            {/* Amount */}
            <div className="modal-detail-item">
              <span className="modal-detail-label">Total Amount</span>
              <span className="modal-detail-value modal-amount">
                {totalAmount.toFixed(2)} {localReceipt.currency || 'USD'}
              </span>
            </div>

            {/* Status */}
            <div className="modal-detail-item">
              <span className="modal-detail-label">Status</span>
              <span
                className={`modal-status-badge ${
                  localReceipt.status?.toLowerCase() === 'paid' ? 'paid' : 'pending'
                }`}
              >
                {localReceipt.status?.toUpperCase() || 'N/A'}
                {isOverdue() && ' (OVERDUE)'}
              </span>
            </div>

            {/* Issue Date & Time */}
            <div className="modal-detail-item">
              <span className="modal-detail-label">Issue Date & Time</span>
              <span className="modal-detail-value">
                {formatDateTime(localReceipt.issue_date, localReceipt.issue_time)}
              </span>
            </div>

            {/* Payment Method */}
            {localReceipt.payment_method && (
              <div className="modal-detail-item">
                <span className="modal-detail-label">Payment Method</span>
                <span className="modal-detail-value">
                  {localReceipt.payment_method}
                </span>
              </div>
            )}

            {/* Passenger Name */}
            {localReceipt.passenger_name && (
              <div className="modal-detail-item">
                <span className="modal-detail-label">Passenger Name</span>
                <span className="modal-detail-value">
                  {localReceipt.passenger_name}
                </span>
              </div>
            )}

            {/* Route */}
            {(localReceipt.departure || localReceipt.destination) && (
              <div className="modal-detail-item modal-detail-full">
                <span className="modal-detail-label">Route</span>
                <span className="modal-detail-value">
                  {localReceipt.departure || 'N/A'} → {localReceipt.destination || 'N/A'}
                </span>
              </div>
            )}

            {/* Notes */}
            {localReceipt.notes && (
              <div className="modal-detail-item modal-detail-full">
                <span className="modal-detail-label">Notes</span>
                <span className="modal-detail-value modal-notes">
                  {localReceipt.notes}
                </span>
              </div>
            )}

            {/* Void Information (if voided) */}
            {localReceipt.is_void && (
              <div className="modal-detail-item modal-detail-full">
                <div className="void-warning">
                  <span className="void-warning-icon">🗑️</span>
                  <div>
                    <p><strong>This receipt has been voided</strong></p>
                    {localReceipt.void_reason && (
                      <p style={{marginTop: '8px'}}>
                        <strong>Reason:</strong> {localReceipt.void_reason}
                      </p>
                    )}
                    {localReceipt.void_date && (
                      <p style={{marginTop: '4px', fontSize: '12px', color: '#64748B'}}>
                        Voided on: {formatDateTime(localReceipt.void_date)}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Payment History */}
          {hasPartialPayments && (
            <div className="payment-history-section">
              <h3 className="payment-history-title">Payment History</h3>
              {loadingPayments ? (
                <p style={{textAlign: 'center', color: '#64748B'}}>Loading payments...</p>
              ) : (
                <div className="payment-history-list">
                  {payments.map((payment, index) => (
                    <div key={payment.id} className={`payment-history-item ${payment.is_void ? 'voided' : ''}`}>
                      <div className="payment-history-header">
                        <span className="payment-history-number">#{index + 1}</span>
                        <span className="payment-history-amount">
                          ${parseFloat(payment.amount).toFixed(2)}
                          {payment.is_void && <span className="voided-badge">VOIDED</span>}
                        </span>
                      </div>
                      <div className="payment-history-details">
                        <span>Payment #: {payment.payment_number}</span>
                        <span>{formatDateTime(payment.payment_date, payment.payment_time)}</span>
                        <span>Method: {payment.payment_method}</span>
                        {payment.created_by && <span>By: {payment.created_by}</span>}
                      </div>
                      {payment.remarks && (
                        <div className="payment-history-remarks">{payment.remarks}</div>
                      )}
                      {payment.is_void && payment.void_reason && (
                        <div className="payment-void-reason">Void reason: {payment.void_reason}</div>
                      )}
                      {!payment.is_void && !localReceipt.is_void && (
                        <button
                          className="payment-void-btn"
                          onClick={() => {
                            setVoidPaymentId(payment.id);
                            setShowVoidPayment(true);
                          }}
                        >
                          Void Payment
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button
            className="modal-btn modal-btn-secondary"
            onClick={handleDownloadPDF}
          >
            📄 Download PDF
          </button>

          {/* Show Partial Payment button */}
          {canMakePartialPayment && !localReceipt.is_void && (
            <button
              className="modal-btn modal-btn-warning"
              onClick={() => setShowPartialPayment(true)}
              disabled={isUpdating || success || isVoiding || isProcessingPayment}
            >
              💰 Partial Payment
            </button>
          )}

          {/* Show Void button if receipt is not already voided */}
          {!localReceipt.is_void && (
            <button
              className="modal-btn modal-btn-danger"
              onClick={() => setShowVoidConfirm(true)}
              disabled={isUpdating || success || isVoiding}
            >
              🗑️ Void Receipt
            </button>
          )}

          {canMarkAsPaid && !localReceipt.is_void && (
            <button
              className={`modal-btn modal-btn-primary ${success ? 'success-state' : ''}`}
              onClick={handleMarkAsPaid}
              disabled={isUpdating || success || isVoiding}
            >
              {success ? '✓ Marked as Paid!' : isUpdating ? 'Updating...' : '✓ Mark as Paid (Full)'}
            </button>
          )}
        </div>
      </div>

      {/* Partial Payment Modal */}
      {showPartialPayment && (
        <div className="modal-backdrop" onClick={() => !isProcessingPayment && setShowPartialPayment(false)}>
          <div className="modal-container modal-container-small" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Partial Payment</h2>
              <button
                className="modal-close-btn"
                onClick={() => setShowPartialPayment(false)}
                disabled={isProcessingPayment}
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              <div className="payment-info-box">
                <p><strong>Receipt:</strong> {localReceipt.receipt_number}</p>
                <p><strong>Total Amount:</strong> ${totalAmount.toFixed(2)}</p>
                <p><strong>Already Paid:</strong> ${amountPaid.toFixed(2)}</p>
                <p className="payment-remaining-highlight">
                  <strong>Remaining:</strong> ${amountRemaining.toFixed(2)}
                </p>
              </div>

              <div className="modal-detail-item modal-detail-full">
                <label className="modal-detail-label">
                  Payment Amount <span style={{color: '#EF4444'}}>*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={amountRemaining}
                  className="payment-amount-input"
                  placeholder={`Enter amount (max: $${amountRemaining.toFixed(2)})`}
                  value={partialAmount}
                  onChange={(e) => setPartialAmount(e.target.value)}
                  disabled={isProcessingPayment}
                  autoFocus
                />
              </div>

              <div className="modal-detail-item modal-detail-full">
                <label className="modal-detail-label">Payment Method</label>
                <select
                  className="payment-method-select"
                  value={partialPaymentMethod}
                  onChange={(e) => setPartialPaymentMethod(e.target.value)}
                  disabled={isProcessingPayment}
                >
                  <option value="CASH">Cash</option>
                  <option value="BANK_TRANSFER">Bank Transfer</option>
                  <option value="CREDIT_CARD">Credit Card</option>
                  <option value="CHECK">Check</option>
                  <option value="MOBILE_MONEY">Mobile Money</option>
                </select>
              </div>

              <div className="modal-detail-item modal-detail-full">
                <label className="modal-detail-label">Remarks (Optional)</label>
                <textarea
                  className="payment-remarks-input"
                  placeholder="Add any notes about this payment..."
                  value={partialRemarks}
                  onChange={(e) => setPartialRemarks(e.target.value)}
                  rows="2"
                  disabled={isProcessingPayment}
                />
              </div>

              {error && (
                <div className="modal-error">
                  {error}
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button
                className="modal-btn modal-btn-secondary"
                onClick={() => setShowPartialPayment(false)}
                disabled={isProcessingPayment}
              >
                Cancel
              </button>
              <button
                className="modal-btn modal-btn-primary"
                onClick={handlePartialPayment}
                disabled={isProcessingPayment || !partialAmount}
              >
                {isProcessingPayment ? 'Processing...' : `Process Payment ($${partialAmount || '0.00'})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Void Confirmation Dialog */}
      {showVoidConfirm && (
        <div className="modal-backdrop" onClick={() => !isVoiding && setShowVoidConfirm(false)}>
          <div className="modal-container modal-container-small" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Void Receipt</h2>
              <button
                className="modal-close-btn"
                onClick={() => setShowVoidConfirm(false)}
                disabled={isVoiding}
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              <div className="void-warning">
                <span className="void-warning-icon">⚠️</span>
                <p>
                  <strong>Warning:</strong> Voiding this receipt cannot be undone.
                  {localReceipt.status?.toUpperCase() === 'PENDING' && (
                    <span> The outstanding balance will be reversed.</span>
                  )}
                </p>
              </div>

              <div className="void-receipt-info">
                <p><strong>Receipt:</strong> {localReceipt.receipt_number}</p>
                <p><strong>Agency:</strong> {localReceipt.agency?.agency_name || localReceipt.agency_name}</p>
                <p><strong>Amount:</strong> {totalAmount.toFixed(2)} {localReceipt.currency || 'USD'}</p>
              </div>

              <div className="modal-detail-item modal-detail-full">
                <label className="modal-detail-label">
                  Reason for Voiding <span style={{color: '#EF4444'}}>*</span>
                </label>
                <textarea
                  className="void-reason-input"
                  placeholder="Enter reason (e.g., Duplicate entry, Incorrect amount, Customer request...)"
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  rows="3"
                  disabled={isVoiding}
                  autoFocus
                />
              </div>

              {error && (
                <div className="modal-error">
                  {error}
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button
                className="modal-btn modal-btn-secondary"
                onClick={() => setShowVoidConfirm(false)}
                disabled={isVoiding}
              >
                Cancel
              </button>
              <button
                className="modal-btn modal-btn-danger"
                onClick={handleVoidReceipt}
                disabled={isVoiding || !voidReason.trim()}
              >
                {isVoiding ? 'Voiding...' : 'Confirm Void Receipt'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Void Payment Confirmation Dialog */}
      {showVoidPayment && (
        <div className="modal-backdrop" onClick={() => !isVoidingPayment && setShowVoidPayment(false)}>
          <div className="modal-container modal-container-small" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Void Payment</h2>
              <button
                className="modal-close-btn"
                onClick={() => {
                  setShowVoidPayment(false);
                  setVoidPaymentId(null);
                  setVoidPaymentReason('');
                }}
                disabled={isVoidingPayment}
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              <div className="void-warning">
                <span className="void-warning-icon">⚠️</span>
                <p>
                  <strong>Warning:</strong> Voiding this payment will reverse the amount and update the receipt balance.
                </p>
              </div>

              <div className="modal-detail-item modal-detail-full">
                <label className="modal-detail-label">
                  Reason for Voiding <span style={{color: '#EF4444'}}>*</span>
                </label>
                <textarea
                  className="void-reason-input"
                  placeholder="Enter reason (e.g., Duplicate payment, Incorrect amount, Refund...)"
                  value={voidPaymentReason}
                  onChange={(e) => setVoidPaymentReason(e.target.value)}
                  rows="3"
                  disabled={isVoidingPayment}
                  autoFocus
                />
              </div>

              {error && (
                <div className="modal-error">
                  {error}
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button
                className="modal-btn modal-btn-secondary"
                onClick={() => {
                  setShowVoidPayment(false);
                  setVoidPaymentId(null);
                  setVoidPaymentReason('');
                }}
                disabled={isVoidingPayment}
              >
                Cancel
              </button>
              <button
                className="modal-btn modal-btn-danger"
                onClick={handleVoidPayment}
                disabled={isVoidingPayment || !voidPaymentReason.trim()}
              >
                {isVoidingPayment ? 'Voiding...' : 'Confirm Void Payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
