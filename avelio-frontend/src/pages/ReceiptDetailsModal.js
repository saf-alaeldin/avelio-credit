// src/components/ReceiptDetailsModal.js
import React, { useState } from 'react';
import './ReceiptDetailsModal.css';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5001/api/v1';

export default function ReceiptDetailsModal({ receipt, isOpen, onClose, onStatusUpdated }) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [showVoidConfirm, setShowVoidConfirm] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [isVoiding, setIsVoiding] = useState(false);

  if (!isOpen || !receipt) return null;

  const token =
    localStorage.getItem('token') ||
    localStorage.getItem('authToken') ||
    sessionStorage.getItem('token');

  // Check if receipt is overdue
  const isOverdue = () => {
    if (receipt.status?.toUpperCase() !== 'PENDING') return false;
    const issueDate = new Date(receipt.issue_date);
    const daysDiff = Math.floor((Date.now() - issueDate) / (1000 * 60 * 60 * 24));
    return daysDiff > 3;
  };

  // Check if "Mark as Paid" button should be shown
  const canMarkAsPaid = receipt.status?.toUpperCase() === 'PENDING' || isOverdue();

  // Handle Mark as Paid
  const handleMarkAsPaid = async () => {
    try {
      setIsUpdating(true);
      setError('');

      const res = await fetch(`${API_BASE}/receipts/${receipt.id}`, {
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
          onStatusUpdated(receipt.id);
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

  // Handle PDF Download
  const handleDownloadPDF = async () => {
    try {
      const res = await fetch(`${API_BASE}/receipts/${receipt.id}/pdf`, {
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

  // Handle Void Receipt
  const handleVoidReceipt = async () => {
    if (!voidReason.trim()) {
      setError('Please provide a reason for voiding this receipt');
      return;
    }

    try {
      setIsVoiding(true);
      setError('');

      const res = await fetch(`${API_BASE}/receipts/${receipt.id}`, {
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
          onStatusUpdated(receipt.id);
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
              ✓ Receipt marked as paid successfully!
            </div>
          )}

          <div className="modal-details-grid">
            {/* Receipt Number */}
            <div className="modal-detail-item">
              <span className="modal-detail-label">Receipt Number</span>
              <span className="modal-detail-value receipt-number-mono">
                {receipt.receipt_number}
              </span>
            </div>

            {/* Agency Name */}
            <div className="modal-detail-item">
              <span className="modal-detail-label">Travel Agency</span>
              <span className="modal-detail-value">
                {receipt.agency?.agency_name || receipt.agency_name || 'N/A'}
              </span>
            </div>

            {/* Amount */}
            <div className="modal-detail-item">
              <span className="modal-detail-label">Amount</span>
              <span className="modal-detail-value modal-amount">
                {Number(receipt.amount || 0).toFixed(2)} {receipt.currency || 'USD'}
              </span>
            </div>

            {/* Status */}
            <div className="modal-detail-item">
              <span className="modal-detail-label">Status</span>
              <span 
                className={`modal-status-badge ${
                  receipt.status?.toLowerCase() === 'paid' ? 'paid' : 'pending'
                }`}
              >
                {receipt.status?.toUpperCase() || 'N/A'}
                {isOverdue() && ' (OVERDUE)'}
              </span>
            </div>

            {/* Issue Date & Time */}
            <div className="modal-detail-item">
              <span className="modal-detail-label">Issue Date & Time</span>
              <span className="modal-detail-value">
                {formatDateTime(receipt.issue_date, receipt.issue_time)}
              </span>
            </div>

            {/* Payment Method */}
            {receipt.payment_method && (
              <div className="modal-detail-item">
                <span className="modal-detail-label">Payment Method</span>
                <span className="modal-detail-value">
                  {receipt.payment_method}
                </span>
              </div>
            )}

            {/* Passenger Name */}
            {receipt.passenger_name && (
              <div className="modal-detail-item">
                <span className="modal-detail-label">Passenger Name</span>
                <span className="modal-detail-value">
                  {receipt.passenger_name}
                </span>
              </div>
            )}

            {/* Route */}
            {(receipt.departure || receipt.destination) && (
              <div className="modal-detail-item modal-detail-full">
                <span className="modal-detail-label">Route</span>
                <span className="modal-detail-value">
                  {receipt.departure || 'N/A'} → {receipt.destination || 'N/A'}
                </span>
              </div>
            )}

            {/* Notes */}
            {receipt.notes && (
              <div className="modal-detail-item modal-detail-full">
                <span className="modal-detail-label">Notes</span>
                <span className="modal-detail-value modal-notes">
                  {receipt.notes}
                </span>
              </div>
            )}

            {/* Void Information (if voided) */}
            {receipt.is_void && (
              <div className="modal-detail-item modal-detail-full">
                <div className="void-warning">
                  <span className="void-warning-icon">🗑️</span>
                  <div>
                    <p><strong>This receipt has been voided</strong></p>
                    {receipt.void_reason && (
                      <p style={{marginTop: '8px'}}>
                        <strong>Reason:</strong> {receipt.void_reason}
                      </p>
                    )}
                    {receipt.void_date && (
                      <p style={{marginTop: '4px', fontSize: '12px', color: '#64748B'}}>
                        Voided on: {formatDateTime(receipt.void_date)}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button
            className="modal-btn modal-btn-secondary"
            onClick={handleDownloadPDF}
          >
            📄 Download PDF
          </button>

          {/* Show Void button if receipt is not already voided */}
          {!receipt.is_void && (
            <button
              className="modal-btn modal-btn-danger"
              onClick={() => setShowVoidConfirm(true)}
              disabled={isUpdating || success || isVoiding}
            >
              🗑️ Void Receipt
            </button>
          )}

          {canMarkAsPaid && !receipt.is_void && (
            <button
              className={`modal-btn modal-btn-primary ${success ? 'success-state' : ''}`}
              onClick={handleMarkAsPaid}
              disabled={isUpdating || success || isVoiding}
            >
              {success ? '✓ Marked as Paid!' : isUpdating ? 'Updating...' : '✓ Mark as Paid'}
            </button>
          )}
        </div>
      </div>

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
                  {receipt.status?.toUpperCase() === 'PENDING' && (
                    <span> The outstanding balance will be reversed.</span>
                  )}
                </p>
              </div>

              <div className="void-receipt-info">
                <p><strong>Receipt:</strong> {receipt.receipt_number}</p>
                <p><strong>Agency:</strong> {receipt.agency?.agency_name || receipt.agency_name}</p>
                <p><strong>Amount:</strong> {Number(receipt.amount || 0).toFixed(2)} {receipt.currency || 'USD'}</p>
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
    </div>
  );
}