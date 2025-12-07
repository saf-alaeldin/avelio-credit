const db = require('../config/db');
const AuditLogger = require('../utils/audit');
const logger = require('../utils/logger');

// Generate payment number (similar to receipt number but with PAY prefix)
function generatePaymentNumber() {
  const now = new Date();
  const year = String(now.getFullYear()).slice(-2);
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const random = String(Math.floor(Math.random() * 10000)).padStart(4, '0');

  return `KU${year}${month}${day}-PAY-${random}`;
}

// CREATE partial payment
const createPartialPayment = async (req, res) => {
  try {
    const { receipt_id, amount, payment_method, remarks } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role || 'staff';

    // Validation
    if (!receipt_id || !amount) {
      return res.status(400).json({
        success: false,
        message: 'Receipt ID and amount are required'
      });
    }

    if (amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Payment amount must be greater than zero'
      });
    }

    const client = await db.pool.connect();

    try {
      await client.query('BEGIN');

      // Get receipt details and verify authorization
      const receiptResult = await client.query(
        `SELECT r.*, a.agency_id, a.agency_name
         FROM receipts r
         JOIN agencies a ON r.agency_id = a.id
         WHERE r.id = $1 AND r.is_void = false AND (r.user_id = $2 OR $3 = 'admin' OR $3 = 'manager')`,
        [receipt_id, userId, userRole]
      );

      if (receiptResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: 'Receipt not found or access denied'
        });
      }

      const receipt = receiptResult.rows[0];

      // Check if receipt is pending or overdue
      if (receipt.status === 'PAID') {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'Receipt is already fully paid'
        });
      }

      // Calculate remaining amount
      const totalAmount = parseFloat(receipt.amount);
      const amountPaid = parseFloat(receipt.amount_paid || 0);
      const amountRemaining = totalAmount - amountPaid;

      // Check if payment amount exceeds remaining balance
      if (amount > amountRemaining) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: `Payment amount ($${amount}) exceeds remaining balance ($${amountRemaining.toFixed(2)})`
        });
      }

      // Generate payment number
      const paymentNumber = generatePaymentNumber();
      const paymentDate = new Date().toISOString().split('T')[0];
      const paymentTime = new Date().toTimeString().split(' ')[0];

      // Insert payment record
      const paymentResult = await client.query(
        `INSERT INTO payments
         (receipt_id, payment_number, amount, payment_date, payment_time, payment_method, remarks, created_by, created_by_name)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          receipt_id,
          paymentNumber,
          amount,
          paymentDate,
          paymentTime,
          payment_method || 'CASH',
          remarks || null,
          userId,
          req.user.name || req.user.username
        ]
      );

      const payment = paymentResult.rows[0];

      // Update receipt with new amounts
      const newAmountPaid = amountPaid + parseFloat(amount);
      const newAmountRemaining = totalAmount - newAmountPaid;
      const newStatus = newAmountRemaining === 0 ? 'PAID' : receipt.status;

      await client.query(
        `UPDATE receipts
         SET amount_paid = $1,
             amount_remaining = $2,
             status = $3,
             payment_date = CASE WHEN $3 = 'PAID' THEN $4 ELSE payment_date END,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $5`,
        [newAmountPaid, newAmountRemaining, newStatus, paymentDate, receipt_id]
      );

      // Update agency outstanding balance
      if (newStatus === 'PAID' && receipt.status === 'PENDING') {
        // If receipt was pending and now fully paid, reduce outstanding balance
        await client.query(
          `UPDATE agencies
           SET outstanding_balance = GREATEST(outstanding_balance - $1, 0),
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [totalAmount, receipt.agency_id]
        );
      }

      // Audit log
      try {
        await AuditLogger.log({
          user_id: userId,
          action: 'CREATE_PARTIAL_PAYMENT',
          entity_type: 'payment',
          entity_id: payment.id,
          details: {
            payment_number: payment.payment_number,
            receipt_id: receipt_id,
            receipt_number: receipt.receipt_number,
            amount: amount,
            remaining: newAmountRemaining
          },
          ip_address: req.ip
        });
      } catch (auditError) {
        logger.error('Audit logging failed:', { error: auditError.message });
      }

      await client.query('COMMIT');

      res.status(201).json({
        success: true,
        message: newAmountRemaining === 0 ? 'Payment completed - receipt fully paid' : 'Partial payment recorded successfully',
        data: {
          payment: {
            id: payment.id,
            payment_number: payment.payment_number,
            amount: parseFloat(payment.amount),
            payment_date: payment.payment_date,
            payment_time: payment.payment_time,
            payment_method: payment.payment_method
          },
          receipt: {
            receipt_number: receipt.receipt_number,
            total_amount: totalAmount,
            amount_paid: newAmountPaid,
            amount_remaining: newAmountRemaining,
            status: newStatus
          }
        }
      });

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    logger.error('Create partial payment error:', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: 'Failed to create partial payment'
    });
  }
};

// GET all payments for a receipt
const getPaymentsByReceipt = async (req, res) => {
  try {
    const { receipt_id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role || 'staff';

    // Verify user has access to this receipt
    const receiptCheck = await db.query(
      `SELECT id FROM receipts
       WHERE id = $1 AND (user_id = $2 OR $3 = 'admin' OR $3 = 'manager')`,
      [receipt_id, userId, userRole]
    );

    if (receiptCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Receipt not found or access denied'
      });
    }

    // Get all payments for this receipt
    const result = await db.query(
      `SELECT * FROM payments
       WHERE receipt_id = $1
       ORDER BY created_at DESC`,
      [receipt_id]
    );

    res.json({
      success: true,
      count: result.rows.length,
      data: {
        payments: result.rows.map(p => ({
          id: p.id,
          payment_number: p.payment_number,
          amount: parseFloat(p.amount),
          payment_date: p.payment_date,
          payment_time: p.payment_time,
          payment_method: p.payment_method,
          remarks: p.remarks,
          created_by: p.created_by_name,
          created_at: p.created_at
        }))
      }
    });

  } catch (error) {
    logger.error('Get payments error:', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payments'
    });
  }
};

// GET single payment
const getPaymentById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role || 'staff';

    const result = await db.query(
      `SELECT p.*, r.receipt_number, r.user_id as receipt_user_id
       FROM payments p
       JOIN receipts r ON p.receipt_id = r.id
       WHERE p.id = $1 AND (r.user_id = $2 OR $3 = 'admin' OR $3 = 'manager')`,
      [id, userId, userRole]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found or access denied'
      });
    }

    const payment = result.rows[0];

    res.json({
      success: true,
      data: {
        payment: {
          id: payment.id,
          payment_number: payment.payment_number,
          receipt_number: payment.receipt_number,
          amount: parseFloat(payment.amount),
          payment_date: payment.payment_date,
          payment_time: payment.payment_time,
          payment_method: payment.payment_method,
          remarks: payment.remarks,
          created_by: payment.created_by_name,
          created_at: payment.created_at
        }
      }
    });

  } catch (error) {
    logger.error('Get payment error:', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payment'
    });
  }
};

// Generate PDF for a payment receipt
// Payment PDF generation - matching main receipt format
const generatePaymentPDF = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role || 'staff';

    // Fetch payment with receipt details
    const result = await db.pool.query(
      `SELECT p.*, r.receipt_number, r.amount as total_amount, r.amount_paid, r.amount_remaining,
              a.agency_id, a.agency_name
       FROM payments p
       JOIN receipts r ON p.receipt_id = r.id
       JOIN agencies a ON r.agency_id = a.id
       WHERE p.id = $1 AND (r.user_id = $2 OR $3 = 'admin' OR $3 = 'manager')`,
      [id, userId, userRole]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found or access denied'
      });
    }

    const payment = result.rows[0];

    // Create PDF matching main receipt format
    const PDFDocument = require('pdfkit');
    const path = require('path');
    const fs = require('fs');

    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 30, bottom: 30, left: 40, right: 40 },
      autoFirstPage: false
    });

    // Register fonts (same as main receipt)
    try {
      const fontsDir = path.join(__dirname, '../assets/fonts');
      if (fs.existsSync(path.join(fontsDir, 'Inter-Regular.ttf'))) {
        doc.registerFont('UI-Regular', path.join(fontsDir, 'Inter-Regular.ttf'));
        doc.registerFont('UI-Bold', path.join(fontsDir, 'Inter-Bold.ttf'));
        doc.registerFont('UI-Italic', path.join(fontsDir, 'Inter-Italic.ttf'));
      } else {
        doc.registerFont('UI-Regular', 'Helvetica');
        doc.registerFont('UI-Bold', 'Helvetica-Bold');
        doc.registerFont('UI-Italic', 'Helvetica-Oblique');
      }
    } catch (e) {
      doc.registerFont('UI-Regular', 'Helvetica');
      doc.registerFont('UI-Bold', 'Helvetica-Bold');
      doc.registerFont('UI-Italic', 'Helvetica-Oblique');
    }

    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=payment-${payment.payment_number}.pdf`);

    // Pipe PDF to response
    doc.pipe(res);

    // Color palette - Orange theme for partial payments
    const PRIMARY = '#F59E0B';      // Orange (instead of blue)
    const PRIMARY_DARK = '#D97706'; // Dark orange
    const ACCENT = '#10B981';       // Green for fully paid
    const TEXT = '#1F2937';
    const MUTED = '#6B7280';
    const LIGHT_BG = '#F9FAFB';
    const CARD = '#FFFFFF';
    const BORDER = '#E5E7EB';

    // Add page
    doc.addPage();

    // Decorative top border - ORANGE for partial payment
    doc.rect(0, 0, doc.page.width, 3).fill(PRIMARY);

    // Header
    const headerY = doc.page.margins.top + 6;
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    // Logo (same size as main receipt)
    const logoSize = 90;
    const logoPath = path.join(__dirname, '../assets/logo.png');

    if (fs.existsSync(logoPath)) {
      try {
        doc.roundedRect(doc.page.margins.left, headerY, logoSize, logoSize, 8)
           .fillOpacity(1)
           .fill('#FFFFFF')
           .strokeColor(PRIMARY)
           .lineWidth(2)
           .stroke();
        doc.image(logoPath, doc.page.margins.left + 6, headerY + 6, {
          fit: [logoSize - 12, logoSize - 12],
          align: 'center',
          valign: 'center'
        });
      } catch (e) {
        doc.roundedRect(doc.page.margins.left, headerY, logoSize, logoSize, 8).fill(PRIMARY);
        doc.fillColor('#fff').font('UI-Bold').fontSize(32)
           .text('K', doc.page.margins.left + 22, headerY + 18);
      }
    } else {
      doc.roundedRect(doc.page.margins.left, headerY, logoSize, logoSize, 8).fill(PRIMARY);
      doc.fillColor('#fff').font('UI-Bold').fontSize(32)
         .text('K', doc.page.margins.left + 22, headerY + 18);
    }

    // Company info (vertically centered with logo)
    const companyX = doc.page.margins.left + logoSize + 14;
    const logoCenterY = headerY + logoSize / 2;
    const textBlockHeight = 45;
    const textStartY = logoCenterY - textBlockHeight / 2;

    doc.fillColor(TEXT).font('UI-Bold').fontSize(18).text('KUSH AIR', companyX, textStartY);
    doc.font('UI-Regular').fontSize(9).fillColor(MUTED).text('Partial Payment Receipt', companyX, textStartY + 22);
    doc.font('UI-Regular').fontSize(8).fillColor(MUTED).text('IATA: KU', companyX, textStartY + 38);

    // Right: Payment info + status badge
    const rightX = doc.page.width - doc.page.margins.right - 140;
    doc.font('UI-Bold').fontSize(11).fillColor(PRIMARY).text('PAYMENT RECEIPT', rightX, headerY + 10, { align: 'right', width: 140 });
    doc.font('UI-Bold').fontSize(10).fillColor(TEXT).text(payment.payment_number, rightX, headerY + 26, { align: 'right', width: 140 });

    // Status badge - Orange for partial, Green if fully paid
    const isFullyPaid = parseFloat(payment.amount_remaining) === 0;
    const badgeText = isFullyPaid ? 'FULLY PAID' : 'PARTIAL';
    const badgeColor = isFullyPaid ? ACCENT : PRIMARY;
    const badgeW = 90, badgeH = 24;
    const bx = doc.page.width - doc.page.margins.right - badgeW;
    const by = headerY + 44;

    doc.roundedRect(bx, by, badgeW, badgeH, 6).fillOpacity(1).fill(badgeColor);
    doc.fillColor('#FFFFFF').font('UI-Bold').fontSize(11)
       .text(badgeText, bx, by + 6, { width: badgeW, align: 'center' });

    // Divider
    const metaY = headerY + 80;
    doc.strokeOpacity(1).fillOpacity(1);
    doc.moveTo(doc.page.margins.left, metaY)
       .lineTo(doc.page.width - doc.page.margins.right, metaY)
       .lineWidth(0.5).strokeColor(BORDER).stroke();

    // Main content - 3 column layout (same as main receipt)
    const leftX = doc.page.margins.left;
    const colW = (pageWidth - 20) / 3;
    const col1X = leftX;
    const col2X = leftX + colW + 10;
    const col3X = leftX + (colW * 2) + 20;
    const cardY = metaY + 10;
    const cardH = 85;

    // Column 1: Agency Details
    doc.fillOpacity(1);
    doc.roundedRect(col1X, cardY, colW, cardH, 8)
       .fill(CARD).strokeColor(BORDER).lineWidth(1).stroke();
    doc.fillColor(PRIMARY).font('UI-Bold').fontSize(9)
       .text('AGENCY DETAILS', col1X + 10, cardY + 10);
    doc.moveTo(col1X + 10, cardY + 24)
       .lineTo(col1X + colW - 10, cardY + 24)
       .strokeColor(BORDER).lineWidth(0.5).stroke();
    doc.font('UI-Bold').fontSize(11).fillColor(TEXT)
       .text(payment.agency_name, col1X + 10, cardY + 32, { width: colW - 20, lineGap: 2 });
    doc.font('UI-Regular').fontSize(8).fillColor(MUTED)
       .text('Agency ID', col1X + 10, cardY + 58);
    doc.font('UI-Bold').fontSize(10).fillColor(TEXT)
       .text(payment.agency_id, col1X + 10, cardY + 70);

    // Column 2: Payment Details
    doc.fillOpacity(1);
    doc.roundedRect(col2X, cardY, colW, cardH, 8)
       .fill(CARD).strokeColor(BORDER).lineWidth(1).stroke();
    doc.fillColor(PRIMARY).font('UI-Bold').fontSize(9)
       .text('PAYMENT DETAILS', col2X + 10, cardY + 10);
    doc.moveTo(col2X + 10, cardY + 24)
       .lineTo(col2X + colW - 10, cardY + 24)
       .strokeColor(BORDER).lineWidth(0.5).stroke();

    const dateStr = new Date(payment.payment_date).toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric'
    });
    const details = [
      ['Date', dateStr],
      ['Time', payment.payment_time],
      ['Method', payment.payment_method]
    ];
    let detailY = cardY + 32;
    details.forEach(([label, value]) => {
      doc.font('UI-Regular').fontSize(8).fillColor(MUTED)
         .text(label, col2X + 10, detailY);
      doc.font('UI-Bold').fontSize(9).fillColor(TEXT)
         .text(value, col2X + 10, detailY + 10, { width: colW - 20 });
      detailY += 18;
    });

    // Column 3: Payment Amount (highlighted in orange)
    doc.fillOpacity(1);
    doc.roundedRect(col3X, cardY, colW, cardH, 8)
       .fill('#FEF3C7').strokeColor(PRIMARY).lineWidth(2).stroke();
    doc.fillColor(PRIMARY).font('UI-Bold').fontSize(9)
       .text('PAYMENT AMOUNT', col3X + 10, cardY + 10);
    doc.moveTo(col3X + 10, cardY + 24)
       .lineTo(col3X + colW - 10, cardY + 24)
       .strokeColor(PRIMARY).lineWidth(0.5).stroke();
    doc.font('UI-Bold').fontSize(22).fillColor(PRIMARY)
       .text(`$${parseFloat(payment.amount).toFixed(2)}`, col3X + 10, cardY + 36, { width: colW - 20 });
    doc.font('UI-Regular').fontSize(8).fillColor(MUTED)
       .text('USD', col3X + 10, cardY + 63);

    // Receipt Reference Section
    const refY = cardY + cardH + 12;
    doc.fillOpacity(1);
    doc.fillColor(PRIMARY).font('UI-Bold').fontSize(9)
       .text('ORIGINAL RECEIPT REFERENCE', leftX, refY);

    const refBoxY = refY + 12;
    const refBoxH = payment.remarks ? 54 : 42;
    doc.roundedRect(leftX, refBoxY, pageWidth, refBoxH, 8)
       .fill('#F8FAFC').strokeColor(BORDER).lineWidth(1).stroke();

    const prevPaid = parseFloat(payment.amount_paid) - parseFloat(payment.amount);
    const wasBefore = parseFloat(payment.amount_remaining) + parseFloat(payment.amount);

    doc.font('UI-Bold').fontSize(9).fillColor(TEXT)
       .text(`Receipt: ${payment.receipt_number}`, leftX + 12, refBoxY + 10);
    doc.font('UI-Regular').fontSize(8).fillColor(MUTED)
       .text(`Total Amount: $${parseFloat(payment.total_amount).toFixed(2)} | Previously Paid: $${prevPaid.toFixed(2)} | Was Remaining: $${wasBefore.toFixed(2)}`,
             leftX + 12, refBoxY + 24, { width: pageWidth - 24 });

    if (payment.remarks) {
      doc.font('UI-Italic').fontSize(8).fillColor(MUTED)
         .text(`Note: ${payment.remarks}`, leftX + 12, refBoxY + 38, { width: pageWidth - 24 });
    }

    // Balance After Payment
    const balY = refBoxY + refBoxH + 10;
    const remaining = parseFloat(payment.amount_remaining);
    const balColor = remaining === 0 ? ACCENT : PRIMARY;

    doc.fillOpacity(1);
    doc.fillColor(balColor).font('UI-Bold').fontSize(9)
       .text('BALANCE AFTER THIS PAYMENT', leftX, balY);

    const balBoxY = balY + 12;
    const balBoxH = 42;
    const balBgColor = remaining === 0 ? '#D1FAE5' : '#FEF3C7';
    doc.roundedRect(leftX, balBoxY, pageWidth, balBoxH, 8)
       .fill(balBgColor).strokeColor(balColor).lineWidth(1.5).stroke();

    doc.font('UI-Bold').fontSize(9).fillColor(TEXT)
       .text(`Total Paid: $${parseFloat(payment.amount_paid).toFixed(2)}`, leftX + 12, balBoxY + 10);
    doc.font('UI-Bold').fontSize(13).fillColor(balColor)
       .text(`Remaining: $${remaining.toFixed(2)}${remaining === 0 ? ' ✓ FULLY PAID' : ''}`,
             leftX + 12, balBoxY + 24);

    // Footer - positioned relative to content to avoid page overflow
    const footerY = balBoxY + balBoxH + 20;
    doc.fillOpacity(1).strokeOpacity(1);
    doc.moveTo(leftX, footerY)
       .lineTo(doc.page.width - doc.page.margins.right, footerY)
       .lineWidth(0.5).strokeColor(BORDER).stroke();
    doc.fillColor(MUTED).font('UI-Regular').fontSize(7)
       .text('This is a computer-generated partial payment receipt. No signature required.',
             leftX, footerY + 8, { align: 'center', width: pageWidth });
    doc.fontSize(6).text(`Generated: ${new Date().toLocaleString()}`,
                          leftX, footerY + 20, { align: 'center', width: pageWidth });

    // Finalize
    doc.end();

  } catch (error) {
    logger.error('Generate payment PDF error:', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to generate payment PDF'
    });
  }
};
const voidPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role || 'staff';

    if (!reason || !reason.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Void reason is required'
      });
    }

    const client = await db.pool.connect();

    try {
      await client.query('BEGIN');

      // Get payment details and verify authorization
      const paymentResult = await client.query(
        `SELECT p.*, r.receipt_number, r.amount_paid, r.amount_remaining, r.amount as total_amount, r.status
         FROM payments p
         JOIN receipts r ON p.receipt_id = r.id
         WHERE p.id = $1 AND (r.user_id = $2 OR $3 = 'admin' OR $3 = 'manager')`,
        [id, userId, userRole]
      );

      if (paymentResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: 'Payment not found or access denied'
        });
      }

      const payment = paymentResult.rows[0];

      // Calculate new amounts after removing this payment
      const paymentAmount = parseFloat(payment.amount);
      const currentAmountPaid = parseFloat(payment.amount_paid);
      const currentAmountRemaining = parseFloat(payment.amount_remaining);
      const totalAmount = parseFloat(payment.total_amount);

      const newAmountPaid = currentAmountPaid - paymentAmount;
      const newAmountRemaining = currentAmountRemaining + paymentAmount;

      // Determine new status
      let newStatus = payment.status;
      if (newAmountPaid === 0) {
        newStatus = 'PENDING'; // If no payments left, return to PENDING
      } else if (payment.status === 'PAID' && newAmountRemaining > 0) {
        newStatus = 'PENDING'; // If was fully paid but now has remaining, return to PENDING
      }

      // Delete the payment
      await client.query('DELETE FROM payments WHERE id = $1', [id]);

      // Update receipt amounts and status
      await client.query(
        `UPDATE receipts
         SET amount_paid = $1,
             amount_remaining = $2,
             status = $3::varchar,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $4`,
        [newAmountPaid, newAmountRemaining, newStatus, payment.receipt_id]
      );

      // If receipt was PAID and now PENDING, update agency outstanding balance
      if (payment.status === 'PAID' && newStatus === 'PENDING') {
        await client.query(
          `UPDATE agencies a
           SET outstanding_balance = outstanding_balance + $1,
               updated_at = CURRENT_TIMESTAMP
           FROM receipts r
           WHERE a.id = r.agency_id AND r.id = $2`,
          [totalAmount, payment.receipt_id]
        );
      }

      // Audit log
      try {
        await AuditLogger.log({
          user_id: userId,
          action: 'VOID_PAYMENT',
          entity_type: 'payment',
          entity_id: id,
          details: {
            payment_number: payment.payment_number,
            amount: paymentAmount,
            receipt_id: payment.receipt_id,
            receipt_number: payment.receipt_number,
            reason: reason,
            new_amount_paid: newAmountPaid,
            new_amount_remaining: newAmountRemaining,
            new_status: newStatus
          }
        });
      } catch (auditError) {
        logger.error('Audit log error:', { error: auditError.message });
      }

      await client.query('COMMIT');

      res.status(200).json({
        success: true,
        message: 'Payment voided successfully',
        data: {
          receipt: {
            amount_paid: newAmountPaid,
            amount_remaining: newAmountRemaining,
            status: newStatus
          }
        }
      });

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    logger.error('Void payment error:', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: 'Failed to void payment'
    });
  }
};

module.exports = {
  createPartialPayment,
  getPaymentsByReceipt,
  getPaymentById,
  generatePaymentPDF,
  voidPayment
};
