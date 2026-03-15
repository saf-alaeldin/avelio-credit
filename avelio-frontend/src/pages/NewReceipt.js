import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2,
  DollarSign,
  CreditCard,
  Banknote,
  CheckCircle,
  Clock,
  FileText,
  AlertCircle,
  Search,
  MapPin
} from 'lucide-react';
import { receiptsAPI, agenciesAPI, utils, getApiBaseUrl } from '../services/api';
import './NewReceipt.css';

function NewReceipt() {
  const navigate = useNavigate();
  const [selectedAgency, setSelectedAgency] = useState('');
  const [agencies, setAgencies] = useState([]);
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [status, setStatus] = useState('PAID');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [stations, setStations] = useState([]);
  const [selectedStation, setSelectedStation] = useState('');
  const amountInputRef = useRef(null);

  // Check authentication on mount
  useEffect(() => {
    if (!utils.isAuthenticated()) {
      console.error('❌ No authentication token found');
      setError('Session expired. Please login again.');
      setTimeout(() => navigate('/login'), 2000);
      return;
    }
    
    // Debug: Show token info
    const token = utils.getToken();
    console.log('🔐 Token exists:', !!token);
    if (token) {
      console.log('🔐 Token preview:', token.substring(0, 20) + '...');
    }
  }, [navigate]);

  // Auto-focus amount input when agency is selected
  useEffect(() => {
    if (amountInputRef.current && selectedAgency) {
      amountInputRef.current.focus();
    }
  }, [selectedAgency]);

  // Fetch agencies and stations on mount
  useEffect(() => {
    let isMounted = true;

    const fetchAgencies = async () => {
      try {
        const res = await agenciesAPI.getAll();
        const list =
          res?.data?.data?.agencies ??
          res?.data?.data?.rows ??
          res?.data?.agencies ??
          res?.data?.rows ??
          res?.data ??
          [];

        if (isMounted) {
          setAgencies(Array.isArray(list) ? list : []);
        }
      } catch (err) {
        if (isMounted) {
          if (err.response?.status === 401) {
            setError('Session expired. Please login again.');
            setTimeout(() => { localStorage.clear(); navigate('/login'); }, 2000);
          } else {
            setError('Failed to load agencies. Please refresh the page.');
          }
        }
      }
    };

    const fetchStations = async () => {
      try {
        const token = utils.getToken();
        const res = await fetch(`${getApiBaseUrl()}/reports/stations`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success && isMounted) {
          setStations(data.data.stations);
        }
      } catch (err) {
        console.error('Failed to load stations:', err);
      }
    };

    fetchAgencies();
    fetchStations();

    return () => { isMounted = false; };
  }, [navigate]);

  const handleAmountChange = (e) => {
    const value = e.target.value.replace(/[^0-9.]/g, '');
    // Prevent multiple decimal points
    const parts = value.split('.');
    if (parts.length > 2) return;
    setAmount(value);
  };

  const formatAmount = (value) => {
    if (!value) return '';
    const num = parseFloat(value);
    if (isNaN(num)) return '';
    return num.toLocaleString('en-US', { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    });
  };

  const filteredAgencies = agencies.filter(agency =>
    agency.agency_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    agency.agency_id?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSelectAgency = (agencyId) => {
    setSelectedAgency(agencyId);
    setSearchTerm('');
    setShowDropdown(false);
    setError(''); // Clear any previous errors
  };

  const getSelectedAgencyName = () => {
    const agency = agencies.find(a => a.id === selectedAgency);
    return agency ? `${agency.agency_name} (${agency.agency_id})` : '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    // Validation
    if (!selectedAgency) {
      setError('Please select an agency');
      return;
    }
    
    const amountNum = parseFloat(String(amount).replace(/,/g, ''));
    if (!amount || amountNum <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    setLoading(true);

    try {
      console.log('📝 Creating receipt...');
      console.log('📦 Request data:', {
        agency_id: selectedAgency,
        amount: amountNum,
        currency: 'USD',
        payment_method: paymentMethod,
        status: status
      });

      const response = await receiptsAPI.create({
        agency_id: selectedAgency,
        amount: amountNum,
        currency: 'USD',
        payment_method: paymentMethod,
        status: status,
        remarks: '',
        ...(selectedStation && { station_code: selectedStation })
      });

      console.log('✅ Receipt created successfully:', response.data);

      // Success! Navigate to receipt view
      navigate('/receipt-success', { 
        state: { receipt: response.data.data.receipt } 
      });
    } catch (err) {
      console.error('❌ Create receipt error:', err);
      console.error('❌ Error response:', err.response?.data);
      console.error('❌ Error status:', err.response?.status);
      
      const errorMessage = err.response?.data?.message || 
                          err.message || 
                          'Failed to create receipt. Please try again.';
      
      setError(errorMessage);
      setLoading(false);
      
      // Only redirect to login if it's definitely an auth issue
      // Don't auto-logout on validation or other errors
      if (err.response?.status === 401 && errorMessage.toLowerCase().includes('token')) {
        console.log('🚪 Auth error - redirecting to login');
        setTimeout(() => {
          localStorage.clear();
          navigate('/login');
        }, 2000);
      }
    }
  };

  const isFormValid = selectedAgency && amount && parseFloat(amount) > 0;

  return (
    <div className="new-receipt-container">
      <main className="form-main">
        <form onSubmit={handleSubmit} className="receipt-form">
          {error && (
            <div className="error-message">
              <AlertCircle size={18} />
              {error}
            </div>
          )}

          {/* Agency Selector with Search */}
          <div className="form-group">
            <label>
              <Building2 size={18} />
              Travel Agency
            </label>
            
            {!selectedAgency ? (
              <div className="search-select-wrapper">
                <div className="search-input-wrapper">
                  <Search size={18} className="search-icon" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setShowDropdown(true);
                    }}
                    onFocus={() => setShowDropdown(true)}
                    placeholder="Search agencies..."
                    className="search-input"
                  />
                </div>
                
                {showDropdown && (
                  <div className="agency-dropdown">
                    {filteredAgencies.length > 0 ? (
                      filteredAgencies.map((agency) => (
                        <div
                          key={agency.id || agency.agency_id}
                          className="agency-option"
                          onClick={() => handleSelectAgency(agency.id)}
                        >
                          <Building2 size={16} />
                          <div className="agency-option-info">
                            <div className="agency-option-name">{agency.agency_name}</div>
                            <div className="agency-option-id">{agency.agency_id}</div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="agency-option-empty">
                        {agencies.length === 0 ? 'Loading agencies...' : 'No agencies found'}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="selected-agency">
                <Building2 size={18} />
                <span>{getSelectedAgencyName()}</span>
                <button
                  type="button"
                  onClick={() => setSelectedAgency('')}
                  className="change-btn"
                >
                  Change
                </button>
              </div>
            )}
          </div>

          {/* Station Selector */}
          <div className="form-group">
            <label>
              <MapPin size={18} />
              Station
            </label>
            <select
              value={selectedStation}
              onChange={(e) => setSelectedStation(e.target.value)}
              className="station-select"
              style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '16px' }}
            >
              <option value="">My Station (default)</option>
              {stations.map(st => (
                <option key={st.id} value={st.station_code}>
                  {st.station_code} - {st.station_name}
                </option>
              ))}
            </select>
          </div>

          {/* Amount Input */}
          <div className="form-group amount-group">
            <label>
              <DollarSign size={18} />
              Deposit Amount
            </label>
            <div className="amount-display-small">
              <span className="currency-small">$</span>
              <span className="amount-value-small">
                {amount ? formatAmount(amount) : '0.00'}
              </span>
            </div>
            <input
              ref={amountInputRef}
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={handleAmountChange}
              placeholder="Enter amount"
              required
              className="amount-input"
            />
            {amount && parseFloat(amount) > 0 && (
              <div className="amount-valid">
                <CheckCircle size={14} />
                Validated – Ready to Issue
              </div>
            )}
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
            disabled={loading || !isFormValid}
            className="submit-btn"
          >
            {loading ? (
              <>
                <span className="loading-spinner"></span>
                Creating Receipt...
              </>
            ) : (
              <>
                <CheckCircle size={18} />
                Issue Receipt
              </>
            )}
          </button>

          {/* Info Box */}
          <div className="form-info-bottom">
            <p>
              <strong>Note:</strong> This receipt confirms the agency's credit deposit. 
              The PDF will include employee signature, company stamp, and QR verification code.
            </p>
          </div>
        </form>
      </main>
    </div>
  );
}

export default NewReceipt;