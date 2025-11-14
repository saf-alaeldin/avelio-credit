const PDFDocument = require('pdfkit');
const logger = require('./logger');
const fs = require('fs');
const path = require('path');

function formatCurrency(amount, currency = 'USD') {
  const n = isFinite(parseFloat(amount)) ? parseFloat(amount) : 0;
  const head = currency === 'USD' ? '$' : `${currency} `;
  return `${head}${n.toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,')}`;
}

function formatDate(dateString) {
  const date = dateString ? new Date(dateString) : new Date();
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

/**
 * Generate a modern, one-page summary PDF for receipts
 * @param {Object} options - Configuration options
 * @param {Array} options.receipts - Array of receipt data
 * @param {Object} options.summary - Summary statistics
 * @param {String} options.period - 'daily' or 'monthly'
 * @param {String} options.periodLabel - Display label (e.g., "13 Jan 2025" or "January 2025")
 * @returns {Promise<Buffer>} PDF buffer
 */
async function generateSummaryPDF({ receipts = [], summary = {}, period = 'daily', periodLabel = '' }) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 40, bottom: 40, left: 40, right: 40 },
        autoFirstPage: false
      });

      // Register fonts
      try {
        const fontsDir = path.join(__dirname, '../assets/fonts');
        if (fs.existsSync(path.join(fontsDir, 'Inter-Regular.ttf'))) {
          doc.registerFont('UI-Regular', path.join(fontsDir, 'Inter-Regular.ttf'));
          doc.registerFont('UI-Bold', path.join(fontsDir, 'Inter-Bold.ttf'));
        } else {
          doc.registerFont('UI-Regular', 'Helvetica');
          doc.registerFont('UI-Bold', 'Helvetica-Bold');
        }
      } catch (e) {
        doc.registerFont('UI-Regular', 'Helvetica');
        doc.registerFont('UI-Bold', 'Helvetica-Bold');
      }

      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Color palette (matching receipt design)
      const PRIMARY = '#0EA5E9';
      const PRIMARY_DARK = '#0284C7';
      const ACCENT = '#10B981';
      const TEXT = '#1F2937';
      const MUTED = '#6B7280';
      const LIGHT_BG = '#F9FAFB';
      const SOFT = '#EFF6FF';
      const CARD = '#FFFFFF';
      const BORDER = '#E5E7EB';
      const WARNING = '#F59E0B';

      const companyName = 'KUSH AIR';
      const companyTag = 'Spirit of the South';
      const iataCode = 'KU';

      doc.addPage();

      // Decorative top border
      doc.rect(0, 0, doc.page.width, 4).fill(PRIMARY);

      const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      let currentY = doc.page.margins.top + 10;

      // Header Section with Logo
      const logoSize = 70;
      const logoPath = path.join(__dirname, '../assets/logo.png');

      // Left: Logo
      if (fs.existsSync(logoPath)) {
        try {
          doc.roundedRect(doc.page.margins.left, currentY, logoSize, logoSize, 8)
             .fillOpacity(1)
             .fill('#FFFFFF')
             .strokeColor(PRIMARY)
             .lineWidth(2)
             .stroke();
          doc.image(logoPath, doc.page.margins.left + 6, currentY + 6, {
            fit: [logoSize - 12, logoSize - 12],
            align: 'center',
            valign: 'center'
          });
        } catch (e) {
          // Fallback to text logo
          doc.roundedRect(doc.page.margins.left, currentY, logoSize, logoSize, 8).fill(PRIMARY);
          doc.fillColor('#fff').font('UI-Bold').fontSize(24)
             .text(companyName.charAt(0), doc.page.margins.left + 20, currentY + 15);
        }
      } else {
        doc.roundedRect(doc.page.margins.left, currentY, logoSize, logoSize, 8).fill(PRIMARY);
        doc.fillColor('#fff').font('UI-Bold').fontSize(24)
           .text(companyName.charAt(0), doc.page.margins.left + 20, currentY + 15);
      }

      // Center: Company info (vertically centered with logo)
      const companyX = doc.page.margins.left + logoSize + 14;
      const logoCenterY = currentY + logoSize / 2;
      const textBlockHeight = 40;
      const textStartY = logoCenterY - textBlockHeight / 2;

      doc.fillColor(TEXT).font('UI-Bold').fontSize(20)
         .text(companyName, companyX, textStartY);
      doc.font('UI-Regular').fontSize(9).fillColor(MUTED)
         .text(companyTag, companyX, textStartY + 24);
      doc.font('UI-Regular').fontSize(8).fillColor(MUTED)
         .text(`IATA: ${iataCode}`, companyX, textStartY + 38);

      // Right: Title aligned with logo
      const titleX = doc.page.width - doc.page.margins.right - 240;
      doc.font('UI-Bold').fontSize(18).fillColor(PRIMARY)
         .text(`${period === 'daily' ? 'Daily' : 'Monthly'} Receipts Summary`,
               titleX, textStartY,
               { width: 240, align: 'right' });

      doc.font('UI-Regular').fontSize(11).fillColor(MUTED)
         .text(periodLabel,
               titleX, textStartY + 24,
               { width: 240, align: 'right' });

      currentY += logoSize + 20;

      // Divider
      doc.moveTo(doc.page.margins.left, currentY)
         .lineTo(doc.page.width - doc.page.margins.right, currentY)
         .strokeColor(BORDER)
         .lineWidth(1)
         .stroke();

      currentY += 20;

      // Summary Statistics Cards
      const cardH = 80;
      const cardGap = 12;
      const cardW = (pageWidth - (cardGap * 2)) / 3;

      // Card 1: Total Receipts
      doc.roundedRect(doc.page.margins.left, currentY, cardW, cardH, 10)
         .fill(SOFT)
         .strokeColor(PRIMARY)
         .lineWidth(2)
         .stroke();

      doc.font('UI-Bold').fontSize(10).fillColor(PRIMARY)
         .text('TOTAL RECEIPTS', doc.page.margins.left + 16, currentY + 14);
      doc.font('UI-Bold').fontSize(32).fillColor(PRIMARY_DARK)
         .text(summary.totalReceipts || receipts.length, doc.page.margins.left + 16, currentY + 32);
      doc.font('UI-Regular').fontSize(9).fillColor(MUTED)
         .text('Transactions', doc.page.margins.left + 16, currentY + 62);

      // Card 2: Total Amount
      const card2X = doc.page.margins.left + cardW + cardGap;
      doc.roundedRect(card2X, currentY, cardW, cardH, 10)
         .fill('#D1FAE5')
         .strokeColor(ACCENT)
         .lineWidth(2)
         .stroke();

      doc.font('UI-Bold').fontSize(10).fillColor(ACCENT)
         .text('TOTAL AMOUNT', card2X + 16, currentY + 14);
      doc.font('UI-Bold').fontSize(28).fillColor('#065F46')
         .text(formatCurrency(summary.totalAmount || 0, 'USD'), card2X + 16, currentY + 34);
      doc.font('UI-Regular').fontSize(9).fillColor('#047857')
         .text('Revenue', card2X + 16, currentY + 62);

      // Card 3: Status Breakdown
      const card3X = doc.page.margins.left + (cardW * 2) + (cardGap * 2);
      doc.roundedRect(card3X, currentY, cardW, cardH, 10)
         .fill(CARD)
         .strokeColor(BORDER)
         .lineWidth(1.5)
         .stroke();

      doc.font('UI-Bold').fontSize(10).fillColor(TEXT)
         .text('BREAKDOWN', card3X + 16, currentY + 14);

      const paidCount = summary.paidCount || 0;
      const pendingCount = summary.pendingCount || 0;

      doc.font('UI-Bold').fontSize(13).fillColor(ACCENT)
         .text(`${paidCount} Paid`, card3X + 16, currentY + 34);
      doc.font('UI-Regular').fontSize(10).fillColor(MUTED)
         .text(formatCurrency(summary.paidAmount || 0, 'USD'), card3X + 16, currentY + 49);

      doc.font('UI-Bold').fontSize(13).fillColor(WARNING)
         .text(`${pendingCount} Pending`, card3X + 100, currentY + 34);
      doc.font('UI-Regular').fontSize(10).fillColor(MUTED)
         .text(formatCurrency(summary.pendingAmount || 0, 'USD'), card3X + 100, currentY + 49);

      currentY += cardH + 24;

      // Receipts Table
      doc.font('UI-Bold').fontSize(12).fillColor(TEXT)
         .text('Receipt Details', doc.page.margins.left, currentY);

      currentY += 20;

      // Table configuration
      const rowHeight = 24;
      const footerHeight = 80; // Space needed for footer

      // Column widths and positions
      const col1W = 90;   // Receipt #
      const col2W = 60;   // Date
      const col3W = 140;  // Agency
      const col4W = 70;   // Amount
      const col5W = 60;   // Status

      const col1X = doc.page.margins.left;
      const col2X = col1X + col1W;
      const col3X = col2X + col2W;
      const col4X = col3X + col3W;
      const col5X = col4X + col4W;

      // Helper function to draw table header
      const drawTableHeader = (yPos) => {
        doc.rect(doc.page.margins.left, yPos, pageWidth, rowHeight)
           .fill(PRIMARY);

        doc.font('UI-Bold').fontSize(9).fillColor('#FFFFFF');
        doc.text('Receipt #', col1X + 8, yPos + 8, { width: col1W - 16 });
        doc.text('Date', col2X + 4, yPos + 8, { width: col2W - 8 });
        doc.text('Agency', col3X + 4, yPos + 8, { width: col3W - 8 });
        doc.text('Amount', col4X + 4, yPos + 8, { width: col4W - 8 });
        doc.text('Status', col5X + 4, yPos + 8, { width: col5W - 8 });

        return yPos + rowHeight;
      };

      // Helper function to draw footer
      const drawFooter = () => {
        const footerY = doc.page.height - doc.page.margins.bottom - 40;

        doc.moveTo(doc.page.margins.left, footerY)
           .lineTo(doc.page.width - doc.page.margins.right, footerY)
           .strokeColor(BORDER)
           .lineWidth(0.5)
           .stroke();

        doc.font('UI-Regular').fontSize(8).fillColor(MUTED)
           .text(`Generated on ${formatDate(new Date())} at ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`,
                 doc.page.margins.left, footerY + 10,
                 { width: pageWidth, align: 'center' });

        doc.font('UI-Bold').fontSize(9).fillColor(TEXT)
           .text('Amin Mohamed Building, Opposite KCB, Juba Town | finance@kushair.net | +211929754555',
                 doc.page.margins.left, footerY + 24,
                 { width: pageWidth, align: 'center' });
      };

      // Helper function to add new page with minimal header
      const addContinuationPage = () => {
        doc.addPage();

        // Decorative top border
        doc.rect(0, 0, doc.page.width, 4).fill(PRIMARY);

        // Minimal header
        const minimalHeaderY = doc.page.margins.top + 10;
        doc.fillColor(TEXT).font('UI-Bold').fontSize(16)
           .text(companyName, doc.page.margins.left, minimalHeaderY);
        doc.font('UI-Regular').fontSize(10).fillColor(MUTED)
           .text(`${period === 'daily' ? 'Daily' : 'Monthly'} Receipts Summary (continued)`,
                 doc.page.width - doc.page.margins.right - 200, minimalHeaderY,
                 { width: 200, align: 'right' });

        const newY = minimalHeaderY + 30;

        // Divider
        doc.moveTo(doc.page.margins.left, newY)
           .lineTo(doc.page.width - doc.page.margins.right, newY)
           .strokeColor(BORDER)
           .lineWidth(0.5)
           .stroke();

        return newY + 16;
      };

      // Draw initial table header
      currentY = drawTableHeader(currentY);

      // Render table rows with pagination
      receipts.forEach((receipt, index) => {
        // Check if we need a new page (considering footer space)
        if (currentY + rowHeight + footerHeight > doc.page.height - doc.page.margins.bottom) {
          // Draw footer on current page
          drawFooter();

          // Start new page with minimal header
          currentY = addContinuationPage();

          // Draw table header on new page
          currentY = drawTableHeader(currentY);
        }

        // Alternate row colors
        const bgColor = index % 2 === 0 ? CARD : LIGHT_BG;
        doc.rect(doc.page.margins.left, currentY, pageWidth, rowHeight)
           .fill(bgColor);

        // Row data
        doc.font('UI-Regular').fontSize(8).fillColor(TEXT);

        // Receipt number
        const receiptNum = receipt.receipt_number || '—';
        doc.text(receiptNum.substring(0, 18), col1X + 8, currentY + 8, { width: col1W - 16 });

        // Date
        const dateStr = receipt.issue_date ? formatDate(receipt.issue_date) : '—';
        doc.text(dateStr, col2X + 4, currentY + 8, { width: col2W - 8 });

        // Agency
        const agencyName = receipt.agency_name || receipt.agency?.agency_name || '—';
        doc.text(agencyName.substring(0, 25), col3X + 4, currentY + 8, { width: col3W - 8 });

        // Amount
        const amountStr = formatCurrency(receipt.amount || 0, receipt.currency || 'USD');
        doc.font('UI-Bold').fontSize(9).fillColor(TEXT);
        doc.text(amountStr, col4X + 4, currentY + 8, { width: col4W - 8 });

        // Status
        const status = (receipt.status || 'PENDING').toUpperCase();
        const statusColor = status === 'PAID' ? ACCENT : WARNING;
        doc.font('UI-Bold').fontSize(8).fillColor(statusColor);
        doc.text(status, col5X + 4, currentY + 8, { width: col5W - 8 });

        currentY += rowHeight;
      });

      // Draw footer on the last page
      drawFooter();

      doc.end();

    } catch (err) {
      logger.error('Summary PDF generation error:', { error: err.message, stack: err.stack });
      reject(err);
    }
  });
}

module.exports = { generateSummaryPDF };
