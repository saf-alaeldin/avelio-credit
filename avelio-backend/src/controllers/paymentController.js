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

module.exports = {
  createPartialPayment,
  getPaymentsByReceipt,
  getPaymentById
};
