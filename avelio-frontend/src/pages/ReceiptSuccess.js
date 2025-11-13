import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  CheckCircle,
  Building2,
  DollarSign,
  Calendar,
  MapPin,
  User,
  FileText,
  Printer,
  Download,
  CheckCircle2,
  AlertCircle,
  MessageCircle,
  Check
} from 'lucide-react';
import { receiptsAPI } from '../services/api';
import './ReceiptSuccess.css';

function ReceiptSuccess() {
  const navigate = useNavigate();
  const location = useLocation();
  const receipt = location.state?.receipt;

  if (!receipt) {
    navigate('/dashboard');
    return null;
  }

  const formatCurrency = (amount) => {
    const formatted = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
    return formatted;
  };

  const handlePrintPDF = async () => {
    try {
      const response = await receiptsAPI.downloadPDF(receipt.id);
      
      // Create blob and download
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      
      // Open in new tab for printing
      window.open(url, '_blank');
      
      // Cleanup
      setTimeout(() => window.URL.revokeObjectURL(url), 100);
    } catch (error) {
      console.error('PDF download error:', error);
      alert('Failed to download PDF. Please try again.');
    }
  };

  const handleDownloadPDF = async () => {
    try {
      const response = await receiptsAPI.downloadPDF(receipt.id);
      
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Receipt-${receipt.receipt_number}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('PDF download error:', error);
      alert('Failed to download PDF. Please try again.');
    }
  };

  const handleWhatsApp = () => {
    alert('WhatsApp sharing will be implemented in the next version!');
  };

  return (
    <div className="receipt-success-container">
      <div className="success-content">
        {/* Success Icon with Confetti Animation */}
        <div className="success-icon-large">
          <CheckCircle size={56} strokeWidth={2.5} />
          <div className="confetti"></div>
          <div className="confetti"></div>
          <div className="confetti"></div>
          <div className="confetti"></div>
          <div className="confetti"></div>
          <div className="confetti"></div>
        </div>
        
        {/* Title - SMALLER & CLOSER */}
        <h1 className="success-title-compact">Receipt Issued</h1>
        
        {/* Receipt Card */}
        <div className="receipt-card">
          <div className="receipt-number">{receipt.receipt_number}</div>
          
          <div className="receipt-details">
            <div className="detail-row">
              <span className="detail-label">
                <Building2 size={16} />
                Agency
              </span>
              <span className="detail-value">{receipt.agency.agency_name}</span>
            </div>
            
            <div className="detail-row">
              <span className="detail-label">
                <DollarSign size={16} />
                Amount
              </span>
              <span className="detail-value amount">
                <span className="currency-symbol">$</span>{formatCurrency(receipt.amount)}
              </span>
            </div>
            
            <div className="detail-row">
              <span className="detail-label">
                <FileText size={16} />
                Status
              </span>
              <span className={`status-badge-dark ${receipt.status.toLowerCase()}`}>
                {receipt.status === 'PAID' ? (
                  <>
                    <CheckCircle2 size={15} />
                    Paid
                  </>
                ) : (
                  <>
                    <AlertCircle size={15} />
                    Pending
                  </>
                )}
              </span>
            </div>
            
            <div className="detail-row">
              <span className="detail-label">
                <Calendar size={16} />
                Date
              </span>
              <span className="detail-value">
                {new Date(receipt.issue_date).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </span>
            </div>
            
            <div className="detail-row">
              <span className="detail-label">
                <MapPin size={16} />
                Station
              </span>
              <span className="detail-value">{receipt.station}</span>
            </div>
            
            <div className="detail-row">
              <span className="detail-label">
                <User size={16} />
                Issued By
              </span>
              <span className="detail-value">{receipt.issued_by}</span>
            </div>
          </div>

          {/* QR Code */}
          {receipt.qr_code && (
            <div className="qr-section">
              <img src={receipt.qr_code} alt="QR Code" className="qr-image" />
              <p className="qr-label">Scan to verify receipt</p>
            </div>
          )}
        </div>

        {/* Info Box - CHECK ICONS INSTEAD OF BULLETS */}
        <div className="info-box">
          <div className="info-box-header">
            <CheckCircle size={20} />
            <p style={{ margin: 0 }}>PDF includes:</p>
          </div>
          <ul className="check-list">
            <li>
              <Check size={14} />
              Employee signature ({receipt.issued_by})
            </li>
            <li>
              <Check size={14} />
              Company stamp (for PAID receipts)
            </li>
            <li>
              <Check size={14} />
              QR code for verification
            </li>
            <li>
              <Check size={14} />
              IATA-compliant format
            </li>
          </ul>
        </div>

        {/* Action Buttons - PRINT & WHATSAPP SIDE BY SIDE */}
        <div className="action-buttons-grid">
          <button onClick={handlePrintPDF} className="btn-print">
            <Printer size={18} />
            Print
          </button>
          
          <button onClick={handleWhatsApp} className="btn-whatsapp">
            <MessageCircle size={18} />
            WhatsApp
          </button>
        </div>

        {/* Download Button */}
        <button onClick={handleDownloadPDF} className="btn-download">
          <Download size={18} />
          Download PDF
        </button>
      </div>
    </div>
  );
}

export default ReceiptSuccess;