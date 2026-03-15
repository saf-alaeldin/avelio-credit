const db = require('../config/db');
const { generateReceiptQR } = require('../utils/qrcode');
const AuditLogger = require('../utils/audit');
const logger = require('../utils/logger');

// Round money to 2 decimal places to avoid floating-point errors
const roundMoney = (value) => {
  return Math.round((parseFloat(value) || 0) * 100) / 100;
};

// Generate receipt number
// Format: KU251114-0001 (KU = Kush Air IATA code, YYMMDD = date, 4-digit sequential number reset daily)
async function generateReceiptNumber(stationCode) {
  // Get current date in Africa/Juba timezone
  const now = new Date();
  const jubaDateStr = now.toLocaleDateString('sv-SE', { timeZone: 'Africa/Juba' });
  const [yearFull, month, day] = jubaDateStr.split('-');
  const year = yearFull.slice(-2); // Last 2 digits of year
  const datePrefix = `KU${year}${month}${day}`;

  // Count total receipts for today to get next sequence number
  const result = await db.query(
    `SELECT COUNT(*) as count FROM receipts
     WHERE receipt_number LIKE $1`,
    [`${datePrefix}-%`]
  );

  const nextSequence = parseInt(result.rows[0].count, 10) + 1;
  const sequenceStr = String(nextSequence).padStart(4, '0');
  return `${datePrefix}-${sequenceStr}`;
}

// CREATE RECEIPT
const createReceipt = async (req, res) => {
  try {
    const { agency_id, amount, currency, payment_method, status, remarks, due_date, station_code: requestedStation } = req.body;
    const user = req.user; // From auth middleware

    // Debug logging
    logger.debug('Create receipt request', {
      agency_id,
      amount,
      status,
      user_id: user.id
    });

    // Validate required fields
    if (!agency_id || !amount || !status) {
      return res.status(400).json({
        success: false,
        message: 'Agency ID, amount, and status are required.'
      });
    }

    // Validate amount
    if (amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Amount must be greater than 0.'
      });
    }

    // Check if agency exists - Handle both UUID id and agency_id code
    logger.debug('Looking up agency', { agency_id });

    // Try to determine if it's a UUID or agency_id code
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(agency_id);
    
    let agencyCheck;
    if (isUUID) {
      // It's a UUID, search by id
      agencyCheck = await db.query(
        'SELECT id, agency_name, agency_id, credit_limit, outstanding_balance FROM agencies WHERE id = $1 AND is_active = true',
        [agency_id]
      );
    } else {
      // It's an agency_id code, search by agency_id
      agencyCheck = await db.query(
        'SELECT id, agency_name, agency_id, credit_limit, outstanding_balance FROM agencies WHERE agency_id = $1 AND is_active = true',
        [agency_id]
      );
    }

    logger.debug('Agency query result:', { count: agencyCheck.rows.length });

    if (agencyCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Agency not found.'
      });
    }

    const agency = agencyCheck.rows[0];

    // Credit limit check - only for PENDING receipts
    if (status === 'PENDING') {
      const currentBalance = roundMoney(agency.outstanding_balance);
      const creditLimit = roundMoney(agency.credit_limit);
      const newBalance = roundMoney(currentBalance + roundMoney(amount));

      // Check if new balance would exceed credit limit
      if (creditLimit > 0 && newBalance > creditLimit) {
        const exceededAmount = roundMoney(newBalance - creditLimit);
        logger.warn('Credit limit exceeded attempt', {
          agency_id: agency.id,
          agency_name: agency.agency_name,
          credit_limit: creditLimit,
          current_balance: currentBalance,
          new_balance: newBalance,
          exceeded_by: exceededAmount
        });

        return res.status(400).json({
          success: false,
          message: 'Credit limit exceeded',
          details: {
            credit_limit: creditLimit,
            current_balance: currentBalance,
            requested_amount: amount,
            exceeded_by: exceededAmount.toFixed(2)
          }
        });
      }
    }

    // Generate receipt number - use requested station or fall back to user's station
    const stationCode = requestedStation || user.station || user.station_code || 'JUB';
    const isExternal = stationCode !== (user.station || user.station_code || 'JUB');
    const receiptNumber = await generateReceiptNumber(stationCode);

    logger.debug('Generating receipt', {
      user_id: user.id,
      station_code: stationCode,
      receipt_number: receiptNumber
    });

    // Get current date and time in Africa/Juba timezone
    const now = new Date();
    
    // Get date/time components in Africa/Juba timezone
    const jubaDateTimeStr = now.toLocaleString('sv-SE', { 
      timeZone: 'Africa/Juba',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    
    // Format: "YYYY-MM-DD HH:MM:SS"
    const [issueDate, issueTime] = jubaDateTimeStr.split(' ');

    // Set payment date if status is PAID (use Africa/Juba timezone)
    const paymentDate = status === 'PAID' ? issueDate : null;

    // Insert receipt
    const result = await db.query(
      `INSERT INTO receipts
       (receipt_number, agency_id, user_id, amount, currency, payment_method, status,
        issue_date, issue_time, payment_date, due_date, station_code, issued_by_name, remarks, is_synced, is_external)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       RETURNING *`,
      [
        receiptNumber,
        agency.id,
        user.id || user.user_id,
        amount,
        currency || 'USD',
        payment_method,
        status,
        issueDate,
        issueTime,
        paymentDate,
        due_date,
        stationCode,
        user.name || user.username || user.full_name || 'Staff',
        remarks,
        true,
        isExternal
      ]
    );

    const receipt = result.rows[0];

    // Update agency outstanding balance if status is PENDING
    if (status === 'PENDING') {
      try {
        await db.query(
          `UPDATE agencies
           SET outstanding_balance = outstanding_balance + $1,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [amount, agency.id]
        );
        logger.info('Outstanding balance updated', {
          agency_id: agency.id,
          amount: amount,
          new_balance: roundMoney(roundMoney(agency.outstanding_balance) + roundMoney(amount))
        });
      } catch (balanceError) {
        logger.error('Failed to update outstanding balance:', {
          error: balanceError.message,
          agency_id: agency.id
        });
        // Continue - receipt was created successfully
      }
    }

    // Generate QR code
    let qrCode = null;
    try {
      qrCode = await generateReceiptQR(receiptNumber);
    } catch (qrError) {
      logger.error('QR generation failed:', { error: qrError.message, receiptNumber });
      // Continue without QR code
    }

    // Audit log receipt creation
    try {
      await AuditLogger.logReceiptCreate(
        user.id || user.user_id,
        receipt.id,
        {
          receipt_number: receipt.receipt_number,
          agency_id: agency.id,
          amount: receipt.amount,
          currency: receipt.currency,
          status: receipt.status,
          payment_method: receipt.payment_method
        },
        req.ip
      );
    } catch (auditError) {
      logger.error('Audit logging failed:', { error: auditError.message });
      // Continue even if audit fails
    }

    // Return success with receipt data
    res.status(201).json({
      success: true,
      message: 'Receipt created successfully',
      data: {
        receipt: {
          id: receipt.id,
          receipt_number: receipt.receipt_number,
          agency: {
            id: agency.id,
            agency_id: agency.agency_id,
            agency_name: agency.agency_name
          },
          amount: parseFloat(receipt.amount),
          currency: receipt.currency,
          status: receipt.status,
          payment_method: receipt.payment_method,
          issue_date: receipt.issue_date,
          issue_time: receipt.issue_time,
          payment_date: receipt.payment_date,
          station: receipt.station_code,
          issued_by: receipt.issued_by_name,
          created_at: receipt.created_at,
          qr_code: qrCode
        }
      }
    });

  } catch (error) {
    logger.error('Create receipt error:', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: 'Failed to create receipt.'
    });
  }
};

// GET ALL RECEIPTS
const getReceipts = async (req, res) => {
  try {
    const { status, agency_id, date_from, date_to, search, page = 1, pageSize = 20 } = req.query;
    const userId = req.user.id;
    const userRole = req.user.role || 'staff';

    // Calculate pagination
    const limit = parseInt(pageSize);
    const offset = (parseInt(page) - 1) * limit;

    // Build optimized query - select only needed columns and use window function for count
    // Using INNER JOIN since every receipt must have an agency
    let query = `
      SELECT
        r.id, r.receipt_number, r.amount, r.amount_paid, r.amount_remaining,
        r.currency, r.status, r.payment_method, r.issue_date, r.issue_time,
        r.payment_date, r.station_code, r.issued_by_name,
        r.is_deposited, r.deposited_at, r.is_external,
        a.agency_id as agency_code, a.agency_name,
        COUNT(*) OVER() as total_count
      FROM receipts r
      INNER JOIN agencies a ON r.agency_id = a.id
      WHERE r.is_void = false
    `;

    const params = [];
    let paramCount = 1;

    // Authorization filter: only staff see their own receipts (admin and manager see all)
    if (userRole !== 'admin' && userRole !== 'manager') {
      query += ` AND r.user_id = $${paramCount}`;
      params.push(userId);
      paramCount++;
    }

    // Add filters
    if (status) {
      query += ` AND r.status = $${paramCount}`;
      params.push(status.toUpperCase());
      paramCount++;
    }

    if (agency_id) {
      query += ` AND a.agency_id = $${paramCount}`;
      params.push(agency_id);
      paramCount++;
    }

    if (date_from) {
      query += ` AND (CASE WHEN r.status = 'PAID' AND r.payment_date IS NOT NULL THEN r.payment_date::date ELSE r.issue_date END) >= $${paramCount}`;
      params.push(date_from);
      paramCount++;
    }

    if (date_to) {
      query += ` AND (CASE WHEN r.status = 'PAID' AND r.payment_date IS NOT NULL THEN r.payment_date::date ELSE r.issue_date END) <= $${paramCount}`;
      params.push(date_to);
      paramCount++;
    }

    // Optimized search filter - prioritize indexed columns
    if (search && search.trim()) {
      const searchTerm = `%${search.trim().toLowerCase()}%`;
      query += ` AND (
        r.receipt_number ILIKE $${paramCount} OR
        a.agency_name ILIKE $${paramCount} OR
        a.agency_id ILIKE $${paramCount} OR
        r.status ILIKE $${paramCount}
      )`;
      params.push(searchTerm);
      paramCount++;
    }

    // Add ordering and pagination
    query += ` ORDER BY (CASE WHEN r.status = 'PAID' AND r.payment_date IS NOT NULL THEN r.payment_date::date ELSE r.issue_date END) DESC, r.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(limit, offset);

    const result = await db.query(query, params);

    // Get total from window function (available in first row, or 0 if no results)
    const total = result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0;

    res.json({
      success: true,
      count: result.rows.length,
      total: total,
      page: parseInt(page),
      pageSize: limit,
      totalPages: Math.ceil(total / limit),
      data: {
        receipts: result.rows.map(r => ({
          id: r.id,
          receipt_number: r.receipt_number,
          agency: {
            agency_id: r.agency_code,
            agency_name: r.agency_name
          },
          amount: parseFloat(r.amount),
          amount_paid: parseFloat(r.amount_paid || 0),
          amount_remaining: parseFloat(r.amount_remaining !== undefined && r.amount_remaining !== null ? r.amount_remaining : r.amount),
          currency: r.currency,
          status: r.status,
          payment_method: r.payment_method,
          issue_date: r.issue_date,
          issue_time: r.issue_time,
          payment_date: r.payment_date,
          station: r.station_code,
          issued_by: r.issued_by_name,
          is_deposited: r.is_deposited || false,
          deposited_at: r.deposited_at,
          is_external: r.is_external || false
        }))
      }
    });

  } catch (error) {
    logger.error('Get receipts error:', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: 'Failed to fetch receipts.'
    });
  }
};

// GET SINGLE RECEIPT
const getReceiptById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role || 'staff';

    // Authorization check: user must own the receipt, be admin, or be manager
    const result = await db.query(
      `SELECT r.*, a.agency_id as agency_code, a.agency_name, a.contact_phone, a.contact_email
       FROM receipts r
       JOIN agencies a ON r.agency_id = a.id
       WHERE r.id = $1 AND (r.user_id = $2 OR $3 = 'admin' OR $3 = 'manager')`,
      [id, userId, userRole]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Receipt not found or access denied.'
      });
    }

    const r = result.rows[0];

    res.json({
      success: true,
      data: {
        receipt: {
          id: r.id,
          receipt_number: r.receipt_number,
          agency: {
            agency_id: r.agency_code,
            agency_name: r.agency_name,
            contact_phone: r.contact_phone,
            contact_email: r.contact_email
          },
          amount: parseFloat(r.amount),
          amount_paid: parseFloat(r.amount_paid || 0),
          amount_remaining: parseFloat(r.amount_remaining !== undefined && r.amount_remaining !== null ? r.amount_remaining : r.amount),
          currency: r.currency,
          status: r.status,
          payment_method: r.payment_method,
          issue_date: r.issue_date,
          issue_time: r.issue_time,
          payment_date: r.payment_date,
          due_date: r.due_date,
          station: r.station_code,
          issued_by: r.issued_by_name,
          remarks: r.remarks,
          is_void: r.is_void,
          created_at: r.created_at
        }
      }
    });

  } catch (error) {
    logger.error('Get receipt error:', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: 'Failed to fetch receipt.'
    });
  }
};

// UPDATE RECEIPT STATUS (Mark as Paid)
const updateReceiptStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, payment_date } = req.body;
    const userId = req.user.id;
    const userName = req.user.name || req.user.username || 'Staff';

    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Status is required.'
      });
    }

    // Get current receipt data before update for audit trail and balance calculation
    const currentReceipt = await db.query(
      'SELECT status, amount, amount_paid, agency_id FROM receipts WHERE id = $1',
      [id]
    );

    if (currentReceipt.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Receipt not found.'
      });
    }

    const oldStatus = currentReceipt.rows[0]?.status;
    const receiptAmount = roundMoney(currentReceipt.rows[0]?.amount);
    const amountPaid = roundMoney(currentReceipt.rows[0]?.amount_paid || 0);
    const agencyId = currentReceipt.rows[0]?.agency_id;
    const userRole = req.user.role || 'staff';

    const now = new Date();
    const jubaDateTimeStr = now.toLocaleString('sv-SE', {
      timeZone: 'Africa/Juba',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false
    });
    const [jubaDate, jubaTime] = jubaDateTimeStr.split(' ');
    const paidDate = payment_date || jubaDate;

    // If marking as PAID and there's a remaining balance, auto-create a partial payment
    if (status === 'PAID' && amountPaid > 0 && amountPaid < receiptAmount) {
      const remainingAmount = roundMoney(receiptAmount - amountPaid);
      const random = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
      const [yearFull, month, day] = jubaDate.split('-');
      const paymentNumber = `KU${yearFull.slice(-2)}${month}${day}-PAY-${random}`;

      await db.query(
        `INSERT INTO payments
         (receipt_id, payment_number, amount, payment_date, payment_time, payment_method, remarks, created_by, created_by_name)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [id, paymentNumber, remainingAmount, paidDate, jubaTime, 'CASH', 'Auto-created: remaining balance on mark as paid', userId, userName]
      );
      logger.info('Auto-created partial payment for remaining balance', {
        receipt_id: id,
        amount: remainingAmount,
        payment_number: paymentNumber
      });
    }

    // Authorization check: user must own the receipt, be admin, or be manager
    const result = await db.query(
      `UPDATE receipts
       SET status = $1::text, payment_date = $2,
           amount_paid = CASE WHEN $1::text = 'PAID' THEN amount ELSE amount_paid END,
           amount_remaining = CASE WHEN $1::text = 'PAID' THEN 0 ELSE amount_remaining END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3 AND (user_id = $4 OR $5::text = 'admin' OR $5::text = 'manager')
       RETURNING *`,
      [status, paidDate, id, userId, userRole]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Receipt not found or access denied.'
      });
    }

    // Update outstanding balance if status changed from PENDING to PAID
    if (oldStatus === 'PENDING' && status === 'PAID') {
      try {
        await db.query(
          `UPDATE agencies
           SET outstanding_balance = GREATEST(outstanding_balance - $1, 0),
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [receiptAmount, agencyId]
        );
        logger.info('Outstanding balance reduced on payment', {
          agency_id: agencyId,
          amount: receiptAmount,
          receipt_id: id
        });
      } catch (balanceError) {
        logger.error('Failed to update outstanding balance:', {
          error: balanceError.message,
          agency_id: agencyId
        });
      }
    }

    // Audit log status update
    try {
      await AuditLogger.logReceiptStatusUpdate(
        userId,
        id,
        oldStatus,
        status,
        req.ip
      );
    } catch (auditError) {
      logger.error('Audit logging failed:', { error: auditError.message });
    }

    res.json({
      success: true,
      message: 'Receipt updated successfully',
      data: {
        receipt: result.rows[0]
      }
    });

  } catch (error) {
    logger.error('Update receipt error:', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: 'Failed to update receipt.'
    });
  }
};

// VOID RECEIPT (soft delete)
const voidReceipt = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const userId = req.user.id;

    // Validate reason
    if (!reason || reason.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Void reason is required.'
      });
    }

    const userRole = req.user.role || 'staff';

    // Authorization check: Check if receipt exists, user owns it, is admin, or is manager, and is not already void
    const checkResult = await db.query(
      'SELECT id, receipt_number, is_void, status, amount, agency_id FROM receipts WHERE id = $1 AND (user_id = $2 OR $3 = \'admin\' OR $3 = \'manager\')',
      [id, userId, userRole]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Receipt not found or access denied.'
      });
    }

    const receipt = checkResult.rows[0];

    if (receipt.is_void) {
      return res.status(400).json({
        success: false,
        message: 'Receipt is already voided.'
      });
    }

    // Void the receipt
    const result = await db.query(
      `UPDATE receipts
       SET is_void = true, void_reason = $1, void_date = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [reason, id]
    );

    // Update outstanding balance if receipt was PENDING (reverse the charge)
    if (receipt.status === 'PENDING') {
      try {
        const receiptAmount = roundMoney(receipt.amount);
        await db.query(
          `UPDATE agencies
           SET outstanding_balance = GREATEST(outstanding_balance - $1, 0),
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [receiptAmount, receipt.agency_id]
        );
        logger.info('Outstanding balance reduced on void', {
          agency_id: receipt.agency_id,
          amount: receiptAmount,
          receipt_id: id
        });
      } catch (balanceError) {
        logger.error('Failed to update outstanding balance:', {
          error: balanceError.message,
          agency_id: receipt.agency_id
        });
        // Continue - receipt was voided successfully
      }
    }

    // Audit log receipt void
    try {
      await AuditLogger.logReceiptVoid(
        userId,
        id,
        reason,
        req.ip
      );
    } catch (auditError) {
      logger.error('Audit logging failed:', { error: auditError.message });
    }

    res.json({
      success: true,
      message: 'Receipt voided successfully',
      data: {
        receipt_number: result.rows[0].receipt_number,
        void_reason: result.rows[0].void_reason,
        void_date: result.rows[0].void_date
      }
    });

  } catch (error) {
    logger.error('Void receipt error:', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: 'Failed to void receipt.'
    });
  }
};

module.exports = {
  createReceipt,
  getReceipts,
  getReceiptById,
  updateReceiptStatus,
  voidReceipt
};