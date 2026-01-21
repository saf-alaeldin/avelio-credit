import React, { useState, useEffect, useCallback } from 'react';
import { numberToWords } from '../utils/numberToWords';
import './FormattedCurrencyInput.css';

/**
 * FormattedCurrencyInput - A user-friendly currency input with automatic formatting
 *
 * Features:
 * - Automatic thousands separators (1,234,567)
 * - Amount shown in words below input
 * - Allows typing naturally - formats on blur
 * - Returns raw numeric value via onChange
 */
export default function FormattedCurrencyInput({
  value,
  onChange,
  className = '',
  placeholder = '0.00',
  disabled = false,
  maxDecimals = 2,
  currency = 'USD',
  showWords = true,
  expectedValue = null, // Pre-fill suggestion from sales data
  label = '',
  ...props
}) {
  // Display value (formatted string)
  const [displayValue, setDisplayValue] = useState('');
  // Whether user is currently editing
  const [isEditing, setIsEditing] = useState(false);

  // Format number with thousands separators
  const formatNumber = useCallback((num) => {
    if (num === '' || num === null || num === undefined) return '';

    const number = parseFloat(num);
    if (isNaN(number)) return '';

    return number.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: maxDecimals
    });
  }, [maxDecimals]);

  // Parse formatted string back to number
  const parseNumber = useCallback((str) => {
    if (!str || str === '') return '';
    // Remove all non-numeric characters except decimal point
    const cleaned = str.replace(/[^0-9.]/g, '');
    // Handle multiple decimal points - keep only first
    const parts = cleaned.split('.');
    if (parts.length > 2) {
      return parts[0] + '.' + parts.slice(1).join('');
    }
    return cleaned;
  }, []);

  // Update display value when external value changes (and not editing)
  useEffect(() => {
    if (!isEditing) {
      setDisplayValue(formatNumber(value));
    }
  }, [value, isEditing, formatNumber]);

  // Handle input change
  const handleChange = (e) => {
    const inputValue = e.target.value;

    // Allow empty input
    if (inputValue === '') {
      setDisplayValue('');
      onChange('');
      return;
    }

    // Parse and validate
    const numericValue = parseNumber(inputValue);

    // Update display (allow typing without immediate formatting)
    setDisplayValue(inputValue);

    // Notify parent of numeric value
    if (numericValue !== '' && !isNaN(parseFloat(numericValue))) {
      onChange(numericValue);
    }
  };

  // Handle focus - switch to edit mode, show raw number
  const handleFocus = (e) => {
    setIsEditing(true);
    // Show unformatted value for easier editing
    const rawValue = value !== '' && value !== null && value !== undefined
      ? parseFloat(value).toString()
      : '';
    setDisplayValue(rawValue);
    // Select all text for easy replacement
    setTimeout(() => e.target.select(), 0);
  };

  // Handle blur - format the value
  const handleBlur = () => {
    setIsEditing(false);

    // Parse the current display value
    const numericStr = parseNumber(displayValue);

    if (numericStr === '' || isNaN(parseFloat(numericStr))) {
      setDisplayValue('');
      onChange('');
      return;
    }

    // Round to max decimals
    const rounded = parseFloat(parseFloat(numericStr).toFixed(maxDecimals));

    // Format for display
    setDisplayValue(formatNumber(rounded));

    // Notify parent of final value
    onChange(rounded.toString());
  };

  // Use expected value
  const handleUseExpected = () => {
    if (expectedValue !== null && expectedValue !== undefined) {
      const rounded = parseFloat(parseFloat(expectedValue).toFixed(maxDecimals));
      setDisplayValue(formatNumber(rounded));
      onChange(rounded.toString());
    }
  };

  // Handle keyboard - allow only numbers, decimal, and navigation keys
  const handleKeyDown = (e) => {
    const allowedKeys = [
      'Backspace', 'Delete', 'Tab', 'Escape', 'Enter',
      'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
      'Home', 'End'
    ];

    // Allow control keys
    if (allowedKeys.includes(e.key)) return;

    // Allow Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X
    if (e.ctrlKey || e.metaKey) return;

    // Allow numbers
    if (/^[0-9]$/.test(e.key)) return;

    // Allow decimal point (only one)
    if (e.key === '.' && !displayValue.includes('.')) return;

    // Block everything else
    e.preventDefault();
  };

  // Get current numeric value for words display
  const currentNumericValue = value !== '' && value !== null && value !== undefined
    ? parseFloat(value)
    : 0;

  return (
    <div className="formatted-currency-wrapper">
      {/* Expected value suggestion */}
      {expectedValue !== null && expectedValue > 0 && (
        <div className="expected-value-hint">
          <span>Expected: {formatNumber(expectedValue)}</span>
          <button
            type="button"
            className="use-expected-btn"
            onClick={handleUseExpected}
            disabled={disabled}
          >
            Use
          </button>
        </div>
      )}

      {/* Input field */}
      <input
        type="text"
        inputMode="decimal"
        className={`formatted-currency-input ${className}`}
        placeholder={placeholder}
        disabled={disabled}
        value={displayValue}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        {...props}
      />

      {/* Amount in words */}
      {showWords && currentNumericValue > 0 && (
        <div className="amount-in-words">
          {numberToWords(currentNumericValue)} {currency}
        </div>
      )}
    </div>
  );
}
