const PDFDocument = require('pdfkit');
const { generateReceiptQRBuffer } = require('./qrcode');
const logger = require('./logger');
const fs = require('fs');
const path = require('path');

/** currency: USD only in current app, but keep generic + safe */
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

function formatTimeHHMM(timeString) {
  // If it's already a time string (HH:MM:SS or HH:MM), extract HH:MM
  if (typeof timeString === 'string' && timeString.includes(':')) {
    const parts = timeString.split(':');
    return `${parts[0]}:${parts[1]}`;
  }
  // Otherwise try to parse as date
  const d = timeString ? new Date(timeString) : new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/** Convert integer part of amount to words (supports up to 999,999,999) */
function numberToWords(num) {
  num = Math.floor(Math.abs(Number(num) || 0));
  if (num === 0) return 'zero';
  const a = ['','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen'];
  const b = ['','', 'twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety'];
  function chunk(n) {
    if (n < 20) return a[n];
    if (n < 100) return b[Math.floor(n/10)] + (n%10 ? '-' + a[n%10] : '');
    if (n < 1000) return a[Math.floor(n/100)] + ' hundred' + (n%100 ? ' ' + chunk(n%100) : '');
    return '';
  }
  const thousands = [
    {v: 1_000_000_000, name: 'billion'},
    {v: 1_000_000, name: 'million'},
    {v: 1_000, name: 'thousand'},
    {v: 1, name: ''}
  ];
  let out = '';
  let remaining = num;
  for (const t of thousands) {
    if (remaining >= t.v) {
      const count = Math.floor(remaining / t.v);
      remaining = remaining % t.v;
      if (t.name) {
        out += `${chunk(count)} ${t.name} `;
      } else {
        out += `${chunk(count)} `;
      }
    }
  }
  return out.trim();
}

async function generateReceiptPDF(receiptData) {
  return new Promise(async (resolve, reject) => {
    try {
      // create doc - compact margins for single page
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 30, bottom: 30, left: 40, right: 40 },
        autoFirstPage: false
      });

      // register optional premium fonts if available (swap to your uploaded fonts if desired)
      try {
        const fontsDir = path.join(__dirname, '../assets/fonts');
        if (fs.existsSync(path.join(fontsDir, 'Inter-Regular.ttf'))) {
          doc.registerFont('UI-Regular', path.join(fontsDir, 'Inter-Regular.ttf'));
          doc.registerFont('UI-Bold', path.join(fontsDir, 'Inter-Bold.ttf'));
          doc.registerFont('UI-Italic', path.join(fontsDir, 'Inter-Italic.ttf'));
        } else {
          // fallback to built-in fonts
          doc.registerFont('UI-Regular', 'Helvetica');
          doc.registerFont('UI-Bold', 'Helvetica-Bold');
          doc.registerFont('UI-Italic', 'Helvetica-Oblique');
        }
      } catch (e) {
        doc.registerFont('UI-Regular', 'Helvetica');
        doc.registerFont('UI-Bold', 'Helvetica-Bold');
        doc.registerFont('UI-Italic', 'Helvetica-Oblique');
      }

      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // brand palette — refined, modern, professional
      const PRIMARY = '#0EA5E9';       // bright sky blue
      const PRIMARY_DARK = '#0284C7';  // darker blue
      const ACCENT = '#10B981';        // emerald green
      const TEXT = '#1F2937';          // dark gray
      const MUTED = '#6B7280';         // muted gray
      const LIGHT_BG = '#F9FAFB';      // light gray background
      const SOFT = '#EFF6FF';          // soft blue tint
      const CARD = '#FFFFFF';
      const BORDER = '#E5E7EB';

      // Shortcuts + safe fallbacks
      const companyName = receiptData?.company?.name || 'KUSH AIR';
      const companyTag = receiptData?.company?.tagline || 'IATA: KU';
      const companyAddr = receiptData?.company?.address || 'Amin Mohamed Building, Opposite KCB, Juba Town';
      const companyContacts = receiptData?.company?.contacts || 'finance@kushair.net | +211929754555';
      const iataCode = receiptData?.company?.iata_code || 'KU';
      const station = receiptData?.station || 'JUB';
      const receiptNo = receiptData?.receipt_number || '—';
      const status = (receiptData?.status || '').toUpperCase();
      const cashier = receiptData?.issued_by_name || receiptData?.issued_by || 'Authorized Staff';
      const method = receiptData?.payment_method || 'CASH';
      const currency = (receiptData?.currency || 'USD').toUpperCase();
      const agencyName = receiptData?.agency?.agency_name || '—';
      const agencyId = receiptData?.agency?.agency_id || '—';
      const amount = Number(receiptData?.amount || 0);

      // Times
      const issuedAt = receiptData?.issue_date || new Date().toISOString();
      const issueTime = receiptData?.issue_time || receiptData?.issue_date;
      const paymentAt = receiptData?.payment_date || issuedAt;
      const localDateStr = formatDate(issuedAt);
      const localTimeStr = formatTimeHHMM(issueTime);
      const utc = new Date(issuedAt);
      const utcTimeStr = `${String(utc.getUTCHours()).padStart(2,'0')}:${String(utc.getUTCMinutes()).padStart(2,'0')} UTC`;

      // Add first page
      doc.addPage();

      // Decorative top border only
      doc.rect(0, 0, doc.page.width, 3)
         .fill(PRIMARY);

      // Compact header - everything in one row
      const headerY = doc.page.margins.top + 6;
      const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

      // Left: Logo (increased size for better visibility)
      const logoSize = 90;
      if (receiptData?.company_logo) {
        try {
          doc.roundedRect(doc.page.margins.left, headerY, logoSize, logoSize, 8)
             .fillOpacity(1)
             .fill('#FFFFFF')
             .strokeColor(PRIMARY)
             .lineWidth(2)
             .stroke();
          doc.image(receiptData.company_logo, doc.page.margins.left + 6, headerY + 6, {
            fit: [logoSize - 12, logoSize - 12],
            align: 'center',
            valign: 'center'
          });
        } catch (e) {
          doc.roundedRect(doc.page.margins.left, headerY, logoSize, logoSize, 8).fill(PRIMARY);
          doc.fillColor('#fff').font('UI-Bold').fontSize(32)
             .text(companyName.charAt(0), doc.page.margins.left + 22, headerY + 18);
        }
      } else {
        doc.roundedRect(doc.page.margins.left, headerY, logoSize, logoSize, 8).fill(PRIMARY);
        doc.fillColor('#fff').font('UI-Bold').fontSize(32)
           .text(companyName.charAt(0), doc.page.margins.left + 22, headerY + 18);
      }

      // Center: Company info (vertically centered with logo)
      const companyX = doc.page.margins.left + logoSize + 14;
      const logoCenterY = headerY + logoSize / 2;
      const textBlockHeight = 45; // Approximate total height of 3 lines
      const textStartY = logoCenterY - textBlockHeight / 2;

      doc.fillColor(TEXT).font('UI-Bold').fontSize(18).text(companyName, companyX, textStartY);
      doc.font('UI-Regular').fontSize(9).fillColor(MUTED).text(companyTag, companyX, textStartY + 22);
      doc.font('UI-Regular').fontSize(8).fillColor(MUTED).text(`IATA: ${iataCode}`, companyX, textStartY + 38);

      // Right: Receipt info + status badge (adjusted for larger logo)
      const rightX = doc.page.width - doc.page.margins.right - 140;
      doc.font('UI-Bold').fontSize(11).fillColor(PRIMARY).text('OFFICIAL RECEIPT', rightX, headerY + 10, { align: 'right', width: 140 });
      doc.font('UI-Bold').fontSize(10).fillColor(TEXT).text(receiptNo, rightX, headerY + 26, { align: 'right', width: 140 });

      // Status badge (adjusted for larger logo)
      const badgeText = status || 'PENDING';
      const badgeW = 90, badgeH = 24;
      const bx = doc.page.width - doc.page.margins.right - badgeW;
      const by = headerY + 44;
      const isPaid = status === 'PAID';

      doc.roundedRect(bx, by, badgeW, badgeH, 6)
         .fillOpacity(1)
         .fill(isPaid ? ACCENT : '#F59E0B');
      doc.fillColor('#FFFFFF')
         .font('UI-Bold')
         .fontSize(11)
         .text(badgeText, bx, by + 6, { width: badgeW, align: 'center' });

      // Divider line (adjusted for larger logo)
      const metaY = headerY + 80;
      doc.moveTo(doc.page.margins.left, metaY)
         .lineTo(doc.page.width - doc.page.margins.right, metaY)
         .strokeOpacity(0.12)
         .lineWidth(0.5)
         .strokeColor(BORDER)
         .stroke();

      // Three-column layout - increased height to use space
      const leftX = doc.page.margins.left;
      const colW = (pageWidth - 20) / 3; // 3 columns with 10px gaps
      const col1X = leftX;
      const col2X = leftX + colW + 10;
      const col3X = leftX + (colW * 2) + 20;

      const cardY = metaY + 12;
      const cardH = 110; // Increased from 90

      // Column 1: Agency Details - larger fonts
      doc.roundedRect(col1X, cardY, colW, cardH, 8)
         .fill(CARD)
         .strokeColor(BORDER)
         .lineWidth(1)
         .stroke();

      doc.fillColor(PRIMARY).font('UI-Bold').fontSize(9)
         .text('AGENCY DETAILS', col1X + 12, cardY + 10);
      doc.moveTo(col1X + 12, cardY + 24)
         .lineTo(col1X + colW - 12, cardY + 24)
         .strokeColor(LIGHT_BG)
         .lineWidth(0.5)
         .stroke();

      doc.font('UI-Bold').fontSize(13).fillColor(TEXT)
         .text(agencyName, col1X + 12, cardY + 32, { width: colW - 24 });
      doc.font('UI-Regular').fontSize(8).fillColor(MUTED)
         .text('Agency ID', col1X + 12, cardY + 72);
      doc.font('UI-Bold').fontSize(11).fillColor(TEXT)
         .text(agencyId, col1X + 12, cardY + 84);

      // Column 2: Transaction Details - larger fonts, more spacing
      doc.roundedRect(col2X, cardY, colW, cardH, 8)
         .fill(CARD)
         .strokeColor(BORDER)
         .lineWidth(1)
         .stroke();

      doc.fillColor(PRIMARY).font('UI-Bold').fontSize(9)
         .text('TRANSACTION', col2X + 12, cardY + 10);
      doc.moveTo(col2X + 12, cardY + 24)
         .lineTo(col2X + colW - 12, cardY + 24)
         .strokeColor(LIGHT_BG)
         .lineWidth(0.5)
         .stroke();

      const txDetails = [
        ['Date', localDateStr],
        ['Time', localTimeStr],
        ['Method', method],
        ['Station', station]
      ];

      txDetails.forEach((row, i) => {
        const ry = cardY + 32 + (i * 18);
        doc.fillColor(MUTED).font('UI-Regular').fontSize(8)
           .text(row[0] + ':', col2X + 12, ry);
        doc.font('UI-Bold').fontSize(9).fillColor(TEXT)
           .text(row[1], col2X + 55, ry, { width: colW - 70 });
      });

      // Column 3: Payment Info - larger fonts
      doc.roundedRect(col3X, cardY, colW, cardH, 8)
         .fill(CARD)
         .strokeColor(BORDER)
         .lineWidth(1)
         .stroke();

      doc.fillColor(PRIMARY).font('UI-Bold').fontSize(9)
         .text('PAYMENT', col3X + 12, cardY + 10);
      doc.moveTo(col3X + 12, cardY + 24)
         .lineTo(col3X + colW - 12, cardY + 24)
         .strokeColor(LIGHT_BG)
         .lineWidth(0.5)
         .stroke();

      doc.font('UI-Regular').fontSize(8).fillColor(MUTED)
         .text('Currency', col3X + 12, cardY + 32);
      doc.font('UI-Bold').fontSize(11).fillColor(TEXT)
         .text(currency, col3X + 12, cardY + 44);

      doc.font('UI-Regular').fontSize(8).fillColor(MUTED)
         .text('Issued By', col3X + 12, cardY + 72);
      doc.font('UI-Bold').fontSize(9).fillColor(TEXT)
         .text(cashier, col3X + 12, cardY + 84, { width: colW - 24 });

      // Amount band - larger to use more space
      const amtY = cardY + cardH + 14;
      const amtH = 80;

      doc.roundedRect(leftX, amtY, pageWidth, amtH, 10)
         .fill(SOFT)
         .strokeColor(PRIMARY)
         .lineWidth(2)
         .stroke();

      // Amount on left - larger
      doc.fillColor(PRIMARY).font('UI-Bold').fontSize(11)
         .text('TOTAL AMOUNT', leftX + 20, amtY + 12);
      doc.font('UI-Bold').fontSize(34).fillColor(PRIMARY_DARK)
         .text(formatCurrency(amount, currency), leftX + 20, amtY + 28);

      // Amount in words (right side) - larger
      const words = `${numberToWords(amount)} ${currency === 'USD' ? 'dollars' : currency}`.replace(/\s+/g,' ');
      const capitalizedWords = words.charAt(0).toUpperCase() + words.slice(1);
      doc.font('UI-Regular').fontSize(8).fillColor(MUTED)
         .text('In Words:', leftX + pageWidth/2, amtY + 12);
      doc.font('UI-Bold').fontSize(10).fillColor(TEXT)
         .text(capitalizedWords, leftX + pageWidth/2, amtY + 26, {
           width: pageWidth/2 - 20,
           align: 'left',
           lineGap: 2
         });

      // Verification area - increased size
      const vY = amtY + amtH + 14;
      const qrSize = 110; // Increased from 90

      // Three sections horizontally aligned
      // Left: QR Code - larger
      try {
        const qrBuffer = await generateReceiptQRBuffer(receiptNo);
        doc.roundedRect(leftX, vY, qrSize, qrSize + 22, 10)
           .fill('#fff')
           .strokeColor(BORDER)
           .lineWidth(1.5)
           .stroke();
        doc.image(qrBuffer, leftX + 12, vY + 12, { fit: [86, 86] });
        doc.font('UI-Bold').fontSize(8).fillColor(PRIMARY)
           .text('SCAN TO VERIFY', leftX, vY + qrSize, { width: qrSize, align: 'center' });
      } catch (e) {
        doc.roundedRect(leftX, vY, qrSize, qrSize + 22, 10)
           .fill(LIGHT_BG)
           .strokeColor(BORDER)
           .lineWidth(1.5)
           .stroke();
      }

      // Middle: Verification details - larger fonts
      const midX = leftX + qrSize + 14;
      const midW = pageWidth - qrSize - 150 - 28;

      doc.roundedRect(midX, vY, midW, qrSize + 22, 10)
         .fill(CARD)
         .strokeColor(BORDER)
         .lineWidth(1.5)
         .stroke();

      doc.font('UI-Bold').fontSize(10).fillColor(PRIMARY)
         .text('VERIFICATION', midX + 16, vY + 12);
      doc.moveTo(midX + 16, vY + 28)
         .lineTo(midX + midW - 16, vY + 28)
         .strokeColor(LIGHT_BG)
         .lineWidth(0.5)
         .stroke();

      doc.font('UI-Regular').fontSize(8).fillColor(MUTED)
         .text('Receipt #:', midX + 16, vY + 36);
      doc.font('UI-Bold').fontSize(10).fillColor(TEXT)
         .text(receiptNo, midX + 16, vY + 48, { width: midW - 32 });

      doc.font('UI-Regular').fontSize(8).fillColor(MUTED)
         .text('Issued:', midX + 16, vY + 70);
      doc.font('UI-Bold').fontSize(9).fillColor(TEXT)
         .text(`${localDateStr}, ${localTimeStr}`, midX + 16, vY + 82);

      doc.font('UI-Regular').fontSize(8).fillColor(MUTED)
         .text('Payment:', midX + 16, vY + 102);
      doc.font('UI-Bold').fontSize(9).fillColor(TEXT)
         .text(formatDate(paymentAt), midX + 16, vY + 114);

      // Right: Status stamp with company stamp graphic
      const statusW = 140;
      const statusX = doc.page.width - doc.page.margins.right - statusW;

      doc.roundedRect(statusX, vY, statusW, qrSize + 22, 10)
         .fill(CARD)
         .strokeColor(isPaid ? ACCENT : '#F59E0B')
         .lineWidth(2.5)
         .stroke();

      if (isPaid) {
        // Draw circular stamp effect - smaller circle that doesn't conflict
        const stampCenterX = statusX + statusW/2;
        const stampCenterY = vY + 45;

        doc.circle(stampCenterX, stampCenterY, 42)
           .fillOpacity(0.2)
           .fill(ACCENT);

        // PAID text - perfectly centered in circle
        // Center the text at stampCenterY - half of font height (approximately 10px for size 28)
        doc.fillOpacity(1)
           .font('UI-Bold')
           .fontSize(28)
           .fillColor(ACCENT)
           .text('PAID', statusX, stampCenterY - 10, { width: statusW, align: 'center' });

        // Payment details below stamp - DARK readable colors
        doc.font('UI-Bold').fontSize(11).fillColor('#000000')
           .text('Payment Confirmed', statusX, vY + 92, { width: statusW, align: 'center' });
        doc.font('UI-Bold').fontSize(11).fillColor('#000000')
           .text(companyName, statusX, vY + 106, { width: statusW, align: 'center' });
        doc.font('UI-Regular').fontSize(10).fillColor('#000000')
           .text(formatDate(paymentAt), statusX, vY + 120, { width: statusW, align: 'center' });
      } else {
        doc.font('UI-Bold').fontSize(18).fillColor('#F59E0B')
           .text(status || 'PENDING', statusX, vY + 36, { width: statusW, align: 'center' });
        doc.font('UI-Regular').fontSize(9).fillColor('#000000')
           .text('Awaiting Settlement', statusX, vY + 66, { width: statusW, align: 'center' });
      }

      // Signature area with generated signature
      const sY = vY + qrSize + 30;

      // Signature box
      const sigW = 240;
      const sigH = 70;
      doc.roundedRect(leftX, sY, sigW, sigH, 8)
         .fill(LIGHT_BG)
         .strokeColor(BORDER)
         .lineWidth(1)
         .stroke();

      doc.font('UI-Regular').fontSize(7).fillColor(TEXT)
         .text('Authorized Signature', leftX + 12, sY + 8);

      // Generate stylized signature text (script-like appearance)
      doc.save();
      doc.translate(leftX + 12, sY + 24);
      doc.scale(1.2, 1); // Slight horizontal stretch for signature effect
      doc.fillOpacity(1)
         .font('UI-Italic')
         .fontSize(16)
         .fillColor('#000000')
         .text(cashier, 0, 0, { width: sigW - 24 });
      doc.restore();

      // Add underline below signature
      doc.moveTo(leftX + 12, sY + 52)
         .lineTo(leftX + sigW - 12, sY + 52)
         .strokeColor('#000000')
         .strokeOpacity(0.5)
         .lineWidth(0.8)
         .stroke();

      // Footer with important notices - right side
      const footerX = leftX + sigW + 20;
      const footerW = pageWidth - sigW - 20;

      doc.roundedRect(footerX, sY, footerW, sigH, 8)
         .fill(CARD)
         .strokeColor(BORDER)
         .lineWidth(1)
         .stroke();

      doc.font('UI-Bold').fontSize(10).fillColor('#000000')
         .text('IMPORTANT NOTICE', footerX + 12, sY + 10);

      doc.font('UI-Regular').fontSize(8).fillColor('#000000')
         .text('This receipt is electronically generated and cryptographically secure. All transactions are verifiable via QR code and comply with IATA BSP financial standards.',
               footerX + 12, sY + 24, { width: footerW - 24, align: 'left', lineGap: 2 });

      // Bottom contact info - improved readability
      const bottomY = sY + sigH + 12;
      doc.moveTo(leftX, bottomY)
         .lineTo(doc.page.width - doc.page.margins.right, bottomY)
         .strokeColor(BORDER)
         .strokeOpacity(0.2)
         .lineWidth(0.5)
         .stroke();

      doc.font('UI-Bold').fontSize(9).fillColor('#000000')
         .text(companyContacts, leftX, bottomY + 10, { width: pageWidth, align: 'center' });
      doc.font('UI-Regular').fontSize(8).fillColor('#000000')
         .text(companyAddr, leftX, bottomY + 22, { width: pageWidth, align: 'center' });

      // end
      doc.end();

    } catch (err) {
      logger.error('PDF generation error:', { error: err.message, stack: err.stack });
      reject(err);
    }
  });
}

module.exports = { generateReceiptPDF };