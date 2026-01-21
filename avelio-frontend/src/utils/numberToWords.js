/**
 * Convert a number to words (English)
 * Supports numbers up to 999 trillion
 */

const ones = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen'
];

const tens = [
  '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'
];

const scales = ['', 'Thousand', 'Million', 'Billion', 'Trillion'];

function convertHundreds(num) {
  let result = '';

  if (num >= 100) {
    result += ones[Math.floor(num / 100)] + ' Hundred';
    num %= 100;
    if (num > 0) result += ' ';
  }

  if (num >= 20) {
    result += tens[Math.floor(num / 10)];
    num %= 10;
    if (num > 0) result += '-' + ones[num];
  } else if (num > 0) {
    result += ones[num];
  }

  return result;
}

export function numberToWords(num) {
  if (num === null || num === undefined || num === '') return '';

  // Parse the number
  const n = parseFloat(num);

  if (isNaN(n)) return '';
  if (n === 0) return 'Zero';

  // Handle negative numbers
  const isNegative = n < 0;
  let absNum = Math.abs(n);

  // Split into integer and decimal parts
  const intPart = Math.floor(absNum);
  const decPart = Math.round((absNum - intPart) * 100);

  // Convert integer part
  let result = '';

  if (intPart === 0) {
    result = 'Zero';
  } else {
    let tempNum = intPart;
    let scaleIndex = 0;
    const parts = [];

    while (tempNum > 0) {
      const chunk = tempNum % 1000;
      if (chunk > 0) {
        const chunkWords = convertHundreds(chunk);
        if (scales[scaleIndex]) {
          parts.unshift(chunkWords + ' ' + scales[scaleIndex]);
        } else {
          parts.unshift(chunkWords);
        }
      }
      tempNum = Math.floor(tempNum / 1000);
      scaleIndex++;
    }

    result = parts.join(' ');
  }

  // Add decimal part if exists
  if (decPart > 0) {
    result += ' and ' + convertHundreds(decPart) + ' Cents';
  }

  // Add negative prefix
  if (isNegative) {
    result = 'Negative ' + result;
  }

  return result;
}

/**
 * Format number with thousand separators
 */
export function formatWithCommas(value) {
  if (value === null || value === undefined || value === '') return '';

  // Remove all non-numeric characters except decimal point
  const cleanValue = String(value).replace(/[^\d.]/g, '');

  if (cleanValue === '') return '';

  // Split by decimal point
  const parts = cleanValue.split('.');

  // Format integer part with commas
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  // Limit decimal places to 2
  if (parts[1]) {
    parts[1] = parts[1].slice(0, 2);
  }

  return parts.join('.');
}

/**
 * Parse formatted string back to number
 */
export function parseFormattedNumber(value) {
  if (value === null || value === undefined || value === '') return '';

  // Remove commas and parse
  const cleanValue = String(value).replace(/,/g, '');
  const num = parseFloat(cleanValue);

  return isNaN(num) ? '' : num;
}

export default numberToWords;
