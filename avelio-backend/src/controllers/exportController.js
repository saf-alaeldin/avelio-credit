const db = require('../config/db');
const { generateSummaryPDF } = require('../utils/summaryPdfGenerator');

// Export receipts to CSV
const exportToCSV = async (req, res) => {
  try {
    const { status, date_from, date_to, agency_id } = req.query;

    // Build query
    let query = `
      SELECT 
        r.receipt_number,
        r.issue_date,
        r.issue_time,
        a.agency_id,
        a.agency_name,
        r.amount,
        r.currency,
        r.payment_method,
        r.status,
        r.payment_date,
        r.station_code,
        r.issued_by_name,
        r.remarks,
        r.created_at
      FROM receipts r
      JOIN agencies a ON r.agency_id = a.id
      WHERE r.is_void = false
    `;

    const params = [];
    let paramCount = 1;

    // Add filters
    if (status) {
      query += ` AND r.status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }

    if (agency_id) {
      query += ` AND a.agency_id = $${paramCount}`;
      params.push(agency_id);
      paramCount++;
    }

    if (date_from) {
      query += ` AND r.issue_date >= $${paramCount}`;
      params.push(date_from);
      paramCount++;
    }

    if (date_to) {
      query += ` AND r.issue_date <= $${paramCount}`;
      params.push(date_to);
      paramCount++;
    }

    query += ' ORDER BY r.issue_date DESC, r.created_at DESC';

    const result = await db.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No receipts found to export.'
      });
    }

    // Generate CSV content
    const headers = [
      'Receipt Number',
      'Issue Date',
      'Issue Time',
      'Agency ID',
      'Agency Name',
      'Amount',
      'Currency',
      'Payment Method',
      'Status',
      'Payment Date',
      'Station',
      'Issued By',
      'Remarks'
    ];

    let csv = headers.join(',') + '\n';

    result.rows.forEach(row => {
      const values = [
        row.receipt_number,
        row.issue_date,
        row.issue_time,
        row.agency_id,
        `"${row.agency_name}"`, // Quoted to handle commas
        row.amount,
        row.currency,
        row.payment_method,
        row.status,
        row.payment_date || '',
        row.station_code,
        `"${row.issued_by_name}"`,
        row.remarks ? `"${row.remarks.replace(/"/g, '""')}"` : '' // Escape quotes
      ];
      csv += values.join(',') + '\n';
    });

    // Set headers for CSV download
    const filename = `receipts-export-${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);

  } catch (error) {
    console.error('CSV export error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export receipts.'
    });
  }
};

// Export summary statistics to CSV
const exportSummaryCSV = async (req, res) => {
  try {
    // Get summary by agency
    const result = await db.query(
      `SELECT 
        a.agency_id,
        a.agency_name,
        COUNT(r.id) as total_receipts,
        COUNT(CASE WHEN r.status = 'PAID' THEN 1 END) as paid_count,
        COALESCE(SUM(CASE WHEN r.status = 'PAID' THEN r.amount ELSE 0 END), 0) as paid_total,
        COUNT(CASE WHEN r.status = 'PENDING' THEN 1 END) as pending_count,
        COALESCE(SUM(CASE WHEN r.status = 'PENDING' THEN r.amount ELSE 0 END), 0) as pending_total,
        COALESCE(SUM(r.amount), 0) as grand_total
       FROM agencies a
       LEFT JOIN receipts r ON a.id = r.agency_id AND r.is_void = false
       WHERE a.is_active = true
       GROUP BY a.id, a.agency_id, a.agency_name
       ORDER BY grand_total DESC`
    );

    // Generate CSV
    const headers = [
      'Agency ID',
      'Agency Name',
      'Total Receipts',
      'Paid Count',
      'Paid Amount',
      'Pending Count',
      'Pending Amount',
      'Grand Total'
    ];

    let csv = headers.join(',') + '\n';

    result.rows.forEach(row => {
      const values = [
        row.agency_id,
        `"${row.agency_name}"`,
        row.total_receipts,
        row.paid_count,
        parseFloat(row.paid_total).toFixed(2),
        row.pending_count,
        parseFloat(row.pending_total).toFixed(2),
        parseFloat(row.grand_total).toFixed(2)
      ];
      csv += values.join(',') + '\n';
    });

    const filename = `receipts-summary-${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);

  } catch (error) {
    console.error('Summary export error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export summary.'
    });
  }
};
// list all receipts
exports.getReceipts = async (req, res) => {
  try {
    const { page = 1, pageSize = 10 } = req.query;
    const offset = (page - 1) * pageSize;

    const sql = `
      SELECT r.id, r.receipt_number, r.amount, r.currency, r.status,
             r.issue_date, a.agency_name, a.agency_id
      FROM receipts r
      LEFT JOIN agencies a ON r.agency_id = a.id
      ORDER BY r.created_at DESC
      LIMIT $1 OFFSET $2;
    `;
    const { rows } = await db.query(sql, [pageSize, offset]);

    const countRes = await db.query('SELECT COUNT(*) FROM receipts;');
    const total = Number(countRes.rows[0].count);

    res.json({ success: true, receipts: rows, total });
  } catch (err) {
    console.error('getReceipts error', err);
    res.status(500).json({ success: false, message: err.message });
  }
};
// Export daily summary as PDF
const exportDailySummaryPDF = async (req, res) => {
  try {
    const { date } = req.query;

    // Default to today if no date provided
    const targetDate = date || new Date().toISOString().split('T')[0];

    // Fetch receipts for the specified date
    const query = `
      SELECT
        r.id,
        r.receipt_number,
        r.issue_date,
        r.amount,
        r.currency,
        r.status,
        a.agency_name,
        a.agency_id
      FROM receipts r
      LEFT JOIN agencies a ON r.agency_id = a.id
      WHERE r.issue_date = $1 AND r.is_void = false
      ORDER BY r.created_at DESC
    `;

    const result = await db.query(query, [targetDate]);
    const receipts = result.rows;

    if (receipts.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No receipts found for ${targetDate}`
      });
    }

    // Calculate summary statistics
    const summary = {
      totalReceipts: receipts.length,
      totalAmount: receipts.reduce((sum, r) => sum + parseFloat(r.amount || 0), 0),
      paidCount: receipts.filter(r => r.status === 'PAID').length,
      paidAmount: receipts.filter(r => r.status === 'PAID').reduce((sum, r) => sum + parseFloat(r.amount || 0), 0),
      pendingCount: receipts.filter(r => r.status === 'PENDING').length,
      pendingAmount: receipts.filter(r => r.status === 'PENDING').reduce((sum, r) => sum + parseFloat(r.amount || 0), 0)
    };

    // Format period label
    const dateObj = new Date(targetDate);
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const periodLabel = `${dateObj.getDate()} ${months[dateObj.getMonth()]} ${dateObj.getFullYear()}`;

    // Generate PDF
    const pdfBuffer = await generateSummaryPDF({
      receipts,
      summary,
      period: 'daily',
      periodLabel
    });

    // Send PDF
    const filename = `daily-summary-${targetDate}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdfBuffer);

  } catch (error) {
    console.error('Daily summary PDF export error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate daily summary PDF.'
    });
  }
};

// Export monthly summary as PDF
const exportMonthlySummaryPDF = async (req, res) => {
  try {
    const { year, month } = req.query;

    // Default to current month if not provided
    const now = new Date();
    const targetYear = year || now.getFullYear();
    const targetMonth = month || (now.getMonth() + 1);

    // Calculate date range for the month
    const startDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
    const lastDay = new Date(targetYear, targetMonth, 0).getDate();
    const endDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${lastDay}`;

    // Fetch receipts for the specified month
    const query = `
      SELECT
        r.id,
        r.receipt_number,
        r.issue_date,
        r.amount,
        r.currency,
        r.status,
        a.agency_name,
        a.agency_id
      FROM receipts r
      LEFT JOIN agencies a ON r.agency_id = a.id
      WHERE r.issue_date >= $1 AND r.issue_date <= $2 AND r.is_void = false
      ORDER BY r.issue_date DESC, r.created_at DESC
    `;

    const result = await db.query(query, [startDate, endDate]);
    const receipts = result.rows;

    if (receipts.length === 0) {
      const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
      return res.status(404).json({
        success: false,
        message: `No receipts found for ${months[targetMonth - 1]} ${targetYear}`
      });
    }

    // Calculate summary statistics
    const summary = {
      totalReceipts: receipts.length,
      totalAmount: receipts.reduce((sum, r) => sum + parseFloat(r.amount || 0), 0),
      paidCount: receipts.filter(r => r.status === 'PAID').length,
      paidAmount: receipts.filter(r => r.status === 'PAID').reduce((sum, r) => sum + parseFloat(r.amount || 0), 0),
      pendingCount: receipts.filter(r => r.status === 'PENDING').length,
      pendingAmount: receipts.filter(r => r.status === 'PENDING').reduce((sum, r) => sum + parseFloat(r.amount || 0), 0)
    };

    // Format period label
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const periodLabel = `${months[targetMonth - 1]} ${targetYear}`;

    // Generate PDF
    const pdfBuffer = await generateSummaryPDF({
      receipts,
      summary,
      period: 'monthly',
      periodLabel
    });

    // Send PDF
    const filename = `monthly-summary-${targetYear}-${String(targetMonth).padStart(2, '0')}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdfBuffer);

  } catch (error) {
    console.error('Monthly summary PDF export error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate monthly summary PDF.'
    });
  }
};

module.exports = {
  exportToCSV,
  exportSummaryCSV,
  exportDailySummaryPDF,
  exportMonthlySummaryPDF
};